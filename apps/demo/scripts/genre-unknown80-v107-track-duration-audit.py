#!/usr/bin/env python3
"""Audit whether fixed v107 OOF audio can support the live 4 x 30 contract."""

from __future__ import annotations

import argparse
import json
import os
import statistics
import subprocess
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from genre_track_feature_contract import (
    SEGMENT_COUNT, SEGMENT_DURATION_SECONDS, feature_contract,
    feature_contract_digest, plan_track_sample_ranges,
)


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
DEFAULT_OOF = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-incumbent-caphe-oof-audio-only.npz"
)
DEFAULT_SPLITS = (
    TRAINING / "dataset-splits.json",
    Path(
        "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
        "magnatagatune-research-combined-splits.json"
    ),
)
DEFAULT_REPORT = TRAINING / "unknown80-v107-track-duration-audit.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-v107-track-duration-audit.md"
DEFAULT_FFPROBE = ROOT / ".tools/bin/ffprobe"


def source_key(row):
    source_type = row.get("sourceType") or ("itunes-preview" if row.get("previewUrl") else "youtube")
    value = row.get("sourceUrl") or row.get("previewUrl") or row.get("youtubeUrl") or row.get("url") or ""
    return f"{source_type}:{value}" if value else ""


def load_split_index(paths):
    output = {}
    duplicate_keys = set()
    for path in paths:
        path = Path(path)
        if not path.is_file():
            continue
        for row in json.loads(path.read_text()).get("items", []):
            key = source_key(row)
            if not key:
                continue
            candidate = str(row.get("filePath") or "")
            if key in output and output[key] != candidate:
                duplicate_keys.add(key)
            elif candidate:
                output[key] = candidate
    return output, duplicate_keys


def resolve_path(key, split_index):
    mapped = split_index.get(key)
    if mapped:
        return Path(mapped), "split-manifest"
    payload = key.split(":", 1)[1] if ":" in key else ""
    if payload.startswith("/"):
        return Path(payload), "source-key-path"
    return None, "unresolved"


def audio_duration(path, ffprobe):
    try:
        import soundfile as sf
        info = sf.info(str(path))
        if info.samplerate > 0 and info.frames >= 0:
            return float(info.frames / info.samplerate), "soundfile", ""
    except Exception:
        pass
    try:
        result = subprocess.run(
            [str(ffprobe), "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
            check=True, capture_output=True, text=True, timeout=30,
        )
        return float(result.stdout.strip()), "ffprobe", ""
    except Exception as error:
        return None, "failed", str(error)


def classify_duration(duration):
    if duration is None or duration <= 0:
        return "unreadable"
    if duration + 0.001 >= SEGMENT_COUNT * SEGMENT_DURATION_SECONDS:
        return "full-4x30"
    if duration + 0.001 >= SEGMENT_DURATION_SECONDS:
        return "shorter-than-4x30"
    return "shorter-than-30"


def summarize(records):
    counts = Counter(record["availability"] for record in records)
    durations = [record["durationSeconds"] for record in records if record["durationSeconds"] is not None]
    return {
        "rows": len(records),
        "resolvedFiles": sum(record["fileExists"] for record in records),
        "durationReadable": len(durations),
        "full4x30": counts["full-4x30"],
        "shorterThan4x30": counts["shorter-than-4x30"],
        "shorterThan30": counts["shorter-than-30"],
        "unreadable": counts["unreadable"],
        "missing": counts["missing"],
        "unresolved": counts["unresolved"],
        "full4x30Coverage": round(counts["full-4x30"] / max(1, len(records)) * 100, 2),
        "durationMedianSeconds": round(statistics.median(durations), 3) if durations else None,
    }


def grouped_summary(records, field):
    groups = defaultdict(list)
    for record in records:
        groups[record[field]].append(record)
    return {key: summarize(value) for key, value in sorted(groups.items())}


def render(report):
    overall = report["overall"]
    lines = [
        "# Unknown80 v107 track-duration audit", "",
        "The incumbent v107 model remains unchanged. This report only measures audio availability for the coexisting 4 x 30 second track contract.", "",
        "| rows | readable | full 4x30 | coverage | 30-120s | <30s | missing/unresolved |",
        "|---:|---:|---:|---:|---:|---:|---:|",
        f"| {overall['rows']} | {overall['durationReadable']} | {overall['full4x30']} | {overall['full4x30Coverage']:.2f}% | {overall['shorterThan4x30']} | {overall['shorterThan30']} | {overall['missing'] + overall['unresolved']} |",
        "", "## By source", "",
        "| source | rows | full 4x30 | coverage | readable | missing/unresolved |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for source, value in report["bySource"].items():
        lines.append(
            f"| {source} | {value['rows']} | {value['full4x30']} | {value['full4x30Coverage']:.2f}% | {value['durationReadable']} | {value['missing'] + value['unresolved']} |"
        )
    lines.extend(["", f"Decision: **{report['decision']}**", ""])
    return "\n".join(lines)


def run(args):
    payload = np.load(args.oof)
    split_index, duplicate_keys = load_split_index(args.splits)
    rows = []
    jobs = []
    for index, (key_value, label_value, source_value) in enumerate(zip(
        payload["sourceKeys"], payload["actual"], payload["sources"],
    )):
        key = str(key_value)
        path, resolution = resolve_path(key, split_index)
        exists = bool(path and path.is_file())
        record = {
            "index": index, "sourceKey": key, "label": str(label_value),
            "source": str(source_value), "pathResolution": resolution,
            "fileExists": exists, "durationSeconds": None,
            "durationReader": "", "availability": "missing" if path else "unresolved",
        }
        rows.append(record)
        if exists:
            jobs.append((record, path))
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = [executor.submit(audio_duration, path, args.ffprobe) for _, path in jobs]
        for (record, _path), future in zip(jobs, futures):
            duration, reader, error = future.result()
            record["durationSeconds"] = round(duration, 3) if duration is not None else None
            record["durationReader"] = reader
            record["availability"] = classify_duration(duration)
            if error:
                record["error"] = error
            if duration:
                planned = plan_track_sample_ranges(duration)
                record["plannedSegmentCount"] = len(planned)
                record["plannedAudioSeconds"] = round(sum(item["durationSeconds"] for item in planned), 3)
    overall = summarize(rows)
    full_rows = [row for row in rows if row["availability"] == "full-4x30"]
    by_source = grouped_summary(rows, "source")
    sources_without_full_audio = [
        source for source, value in by_source.items() if value["full4x30"] == 0
    ]
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "objective": "Measure fixed v107 OOF audio eligibility for production-equivalent 4 x 30 second extraction.",
        "policy": {
            "productionModelUpdated": False,
            "sealedFinalHoldoutUsed": False,
            "metadataUsedAtInference": False,
            "audioCopied": False,
            "incumbentContractChanged": False,
        },
        "oofPath": str(args.oof),
        "oofRows": len(rows),
        "splitManifests": [str(path) for path in args.splits],
        "splitIndexRows": len(split_index),
        "duplicateSplitKeys": len(duplicate_keys),
        "candidateFeatureContract": feature_contract(),
        "candidateFeatureContractSha256": feature_contract_digest(),
        "overall": overall,
        "bySource": by_source,
        "byGenre": grouped_summary(rows, "label"),
        "eligibleSourceGenreCells": len({(row["source"], row["label"]) for row in full_rows}),
        "sourceGenreCells": len({(row["source"], row["label"]) for row in rows}),
        "strictFull4x30SourceHeldoutFeasible": not sources_without_full_audio,
        "sourcesWithoutFull4x30": sources_without_full_audio,
        "examples": {
            "unresolved": [row["sourceKey"] for row in rows if row["availability"] == "unresolved"][:20],
            "missing": [row["sourceKey"] for row in rows if row["availability"] == "missing"][:20],
            "unreadable": [row["sourceKey"] for row in rows if row["availability"] == "unreadable"][:20],
        },
        "decision": (
            "build-duration-aware-4-segment-cache-not-full-only"
            if overall["full4x30"] >= args.minimum_full_tracks
            else "insufficient-full-length-audio"
        ),
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=DEFAULT_OOF)
    parser.add_argument("--splits", type=Path, action="append", default=[])
    parser.add_argument("--ffprobe", type=Path, default=DEFAULT_FFPROBE)
    parser.add_argument("--workers", type=int, default=min(8, os.cpu_count() or 1))
    parser.add_argument("--minimum-full-tracks", type=int, default=500)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    if not args.splits:
        args.splits = list(DEFAULT_SPLITS)
    report = run(args)
    print(json.dumps({
        "overall": report["overall"],
        "eligibleSourceGenreCells": report["eligibleSourceGenreCells"],
        "sourceGenreCells": report["sourceGenreCells"],
        "decision": report["decision"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
