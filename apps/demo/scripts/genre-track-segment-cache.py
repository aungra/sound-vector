#!/usr/bin/env python3
"""Build a resumable features-only cache for the isolated 4-segment contract."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sqlite3
import sys
import zlib
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from genre_track_feature_contract import (
    feature_contract, feature_contract_digest, plan_track_sample_ranges,
)


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
INFER_PATH = Path(__file__).with_name("genre-embedding-infer.py")
AUDIT_PATH = Path(__file__).with_name("genre-unknown80-v107-track-duration-audit.py")
DEFAULT_OOF = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-incumbent-caphe-oof-audio-only.npz"
)
DEFAULT_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "runtime-track-segment-features-v3_0.sqlite3"
)
DEFAULT_REPORT = TRAINING / "runtime-track-segment-feature-cache-report.json"


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def encode(values):
    return zlib.compress(np.asarray(values, dtype=np.float32).tobytes(), level=6)


def decode(blob, expected_length):
    values = np.frombuffer(zlib.decompress(blob), dtype=np.float32)
    if len(values) != expected_length:
        raise ValueError(f"cached vector length mismatch: {len(values)} != {expected_length}")
    return values.copy()


def read_cached_segments(connection, source_key):
    rows = connection.execute(
        "SELECT segment_index,role,offset_seconds,duration_seconds,effnet_tail,librosa "
        "FROM segments WHERE source_key=? ORDER BY segment_index",
        (str(source_key),),
    ).fetchall()
    return [
        {
            "segmentIndex": int(index),
            "role": role,
            "offsetSeconds": float(offset),
            "durationSeconds": float(duration),
            "vectors": {
                "effnet_tail": decode(effnet, 3840),
                "librosa": decode(librosa, 547),
            },
        }
        for index, role, offset, duration, effnet, librosa in rows
    ]


def initialize(connection):
    connection.executescript("""
        CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS tracks (
            source_key TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            source TEXT NOT NULL,
            duration_seconds REAL NOT NULL,
            availability TEXT NOT NULL,
            contract_sha256 TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS segments (
            source_key TEXT NOT NULL,
            segment_index INTEGER NOT NULL,
            role TEXT NOT NULL,
            offset_seconds REAL NOT NULL,
            duration_seconds REAL NOT NULL,
            effnet_tail BLOB NOT NULL,
            librosa BLOB NOT NULL,
            contract_sha256 TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (source_key, segment_index)
        );
    """)
    contract = feature_contract()
    digest = feature_contract_digest(contract)
    existing = connection.execute(
        "SELECT value FROM metadata WHERE key='featureContractSha256'"
    ).fetchone()
    if existing and existing[0] != digest:
        raise RuntimeError("existing track cache uses a different feature contract")
    values = {
        "featureContractSha256": digest,
        "featureContract": json.dumps(contract, ensure_ascii=False, sort_keys=True),
    }
    connection.executemany(
        "INSERT OR REPLACE INTO metadata(key,value) VALUES(?,?)", values.items(),
    )
    connection.commit()


def resolve_oof_rows(args, audit):
    payload = np.load(args.oof)
    split_index, _duplicates = audit.load_split_index(args.splits)
    rows = []
    for index, (key_value, label_value, source_value) in enumerate(zip(
        payload["sourceKeys"], payload["actual"], payload["sources"],
    )):
        key = str(key_value)
        path, resolution = audit.resolve_path(key, split_index)
        exists = bool(path and path.is_file())
        duration = None
        if exists:
            duration, _reader, _error = audit.audio_duration(path, args.ffprobe)
        rows.append({
            "oofIndex": index,
            "sourceKey": key,
            "label": str(label_value),
            "source": str(source_value),
            "filePath": path,
            "pathResolution": resolution,
            "fileExists": exists,
            "durationSeconds": duration,
            "availability": audit.classify_duration(duration) if exists else "missing",
        })
    return rows


def resolve_manifest_rows(args, audit):
    rows = []
    for manifest_path in args.manifest:
        payload = json.loads(manifest_path.read_text())
        for index, item in enumerate(payload.get("items") or []):
            if not item.get("trainingEligible"):
                continue
            path = Path(str(item.get("filePath") or ""))
            exists = path.is_file()
            duration = None
            if exists:
                duration, _reader, _error = audit.audio_duration(path, args.ffprobe)
            identity = item.get("audioSha256") or item.get("trackId") or index
            rows.append({
                "oofIndex": None,
                "sourceKey": f"overlay:{item.get('source', '')}:{identity}",
                "label": str(item.get("genre") or ""),
                "source": str(item.get("source") or ""),
                "filePath": path,
                "pathResolution": f"manifest:{manifest_path.name}",
                "fileExists": exists,
                "durationSeconds": duration,
                "availability": audit.classify_duration(duration) if exists else "missing",
            })
    return rows


def balanced_selection(rows, existing, args):
    labels = set(args.genre)
    sources = set(args.source)
    cells = defaultdict(list)
    existing_cells = defaultdict(int)
    for row in rows:
        if labels and row["label"] not in labels:
            continue
        if sources and row["source"] not in sources:
            continue
        cell = (row["source"], row["label"])
        if row["sourceKey"] in existing:
            existing_cells[cell] += 1
            continue
        if not row["fileExists"] or not row["durationSeconds"]:
            continue
        cells[cell].append(row)
    for values in cells.values():
        values.sort(key=lambda row: row["sourceKey"])
    if args.per_genre_source_limit:
        cells = defaultdict(list, {
            cell: values[:max(0, args.per_genre_source_limit - existing_cells[cell])]
            for cell, values in cells.items()
            if existing_cells[cell] < args.per_genre_source_limit
        })
    source_cells = defaultdict(list)
    for cell in sorted(cells):
        source_cells[cell[0]].append(cell)
    ordered_cells = []
    while any(source_cells.values()):
        for source in sorted(source_cells):
            if source_cells[source]:
                ordered_cells.append(source_cells[source].pop(0))
    selected = []
    position = 0
    while ordered_cells:
        next_cells = []
        for cell in ordered_cells:
            values = cells[cell]
            if position < len(values):
                selected.append(values[position])
                if args.limit and len(selected) >= args.limit:
                    return selected
            if position + 1 < len(values):
                next_cells.append(cell)
        position += 1
        ordered_cells = next_cells
    return selected


def persist_track(connection, row, ranges, extracted):
    if len(ranges) != 4 or len(extracted) != 4:
        raise ValueError("track cache requires exactly four planned and extracted segments")
    now = datetime.now(timezone.utc).isoformat()
    digest = feature_contract_digest()
    with connection:
        connection.execute(
            "INSERT OR REPLACE INTO tracks VALUES(?,?,?,?,?,?,?)",
            (
                row["sourceKey"], row["label"], row["source"],
                float(row["durationSeconds"]), row["availability"], digest, now,
            ),
        )
        connection.execute("DELETE FROM segments WHERE source_key=?", (row["sourceKey"],))
        for index, ((offset, duration, vectors), planned) in enumerate(zip(extracted, ranges)):
            connection.execute(
                "INSERT INTO segments VALUES(?,?,?,?,?,?,?,?,?)",
                (
                    row["sourceKey"], index, planned["role"], float(offset),
                    float(duration), encode(vectors["effnet_tail"]),
                    encode(vectors["librosa"]), digest, now,
                ),
            )


def run(args):
    audit = load_module(AUDIT_PATH, "track_cache_duration_audit")
    inference = load_module(INFER_PATH, "track_cache_embedding_inference")
    if not args.verbose_essentia:
        try:
            import essentia
            essentia.log.infoActive = False
            essentia.log.warningActive = False
        except ImportError:
            pass
    args.cache.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(args.cache)
    initialize(connection)
    existing = {
        key for (key,) in connection.execute(
            "SELECT source_key FROM segments GROUP BY source_key HAVING COUNT(*)=4"
        )
    }
    rows = (
        resolve_manifest_rows(args, audit)
        if args.manifest else resolve_oof_rows(args, audit)
    )
    selected = balanced_selection(rows, existing, args)
    extractors = inference.EssentiaExtractors(inference.INFER_SOURCES)
    completed = 0
    failures = []
    for position, row in enumerate(selected, 1):
        try:
            ranges = plan_track_sample_ranges(row["durationSeconds"])
            extracted = inference.vectors_from_audio_ranges(
                row["filePath"], ranges, extractors=extractors,
            )
            persist_track(connection, row, ranges, extracted)
            completed += 1
            print(f"[{position}/{len(selected)}] {row['source']} / {row['label']}", flush=True)
        except Exception as error:
            failures.append({
                "sourceKey": row["sourceKey"], "source": row["source"],
                "label": row["label"], "error": str(error),
            })
        finally:
            extractors.release_audio(row["filePath"])
    total_cached = connection.execute(
        "SELECT COUNT(*) FROM (SELECT source_key FROM segments GROUP BY source_key HAVING COUNT(*)=4)"
    ).fetchone()[0]
    availability = dict(connection.execute(
        "SELECT availability, COUNT(*) FROM tracks GROUP BY availability"
    ).fetchall())
    source_counts = dict(connection.execute(
        "SELECT source, COUNT(*) FROM tracks GROUP BY source"
    ).fetchall())
    connection.close()
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "cachePath": str(args.cache),
        "featureContract": feature_contract(),
        "featureContractSha256": feature_contract_digest(),
        "oofRows": len(rows),
        "previouslyCached": len(existing),
        "requested": len(selected),
        "completed": completed,
        "failureCount": len(failures),
        "failureExamples": failures[:20],
        "totalCachedTracks": total_cached,
        "cachedByAvailability": availability,
        "cachedBySource": source_counts,
        "audioRetained": False,
        "metadataUsedAtInference": False,
        "sealedFinalHoldoutUsed": False,
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


def main():
    audit = load_module(AUDIT_PATH, "track_cache_duration_defaults")
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=DEFAULT_OOF)
    parser.add_argument("--manifest", type=Path, action="append", default=[])
    parser.add_argument("--splits", type=Path, action="append", default=[])
    parser.add_argument("--ffprobe", type=Path, default=audit.DEFAULT_FFPROBE)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--per-genre-source-limit", type=int, default=0)
    parser.add_argument("--genre", action="append", default=[])
    parser.add_argument("--source", action="append", default=[])
    parser.add_argument("--verbose-essentia", action="store_true")
    args = parser.parse_args()
    if not args.splits:
        args.splits = list(audit.DEFAULT_SPLITS)
    report = run(args)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
