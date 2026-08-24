#!/usr/bin/env python3
"""Extract deterministic MusicFM moments for selected fixed-OOF audio."""

from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
SHARED_PATH = Path(__file__).with_name("genre-unknown80-v107-track-reranker-screen.py")
DEFAULT_MODEL = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/models/"
    "musicfm-inference-msd"
)
DEFAULT_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "musicfm-house-boundary-30s-cache.json"
)
DEFAULT_SEED_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "musicfm-msd-30s-pilot-cache.json"
)
DEFAULT_SELECTION = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "musicfm-house-boundary-selection.json"
)
DEFAULT_REPORT = ROOT / "genre-training" / "musicfm-house-boundary-cache-report.json"
DEFAULT_FFMPEG = ROOT / ".tools/bin/ffmpeg"
SAMPLE_RATE = 24000
# The established pilot uses 698,400 samples, yielding exactly 728 frames.
WINDOW_SECONDS = 29.1
HIDDEN_SIZE = 1024


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def source_key_path(source_key):
    prefix = "cc-dataset:"
    if not source_key.startswith(prefix):
        return None
    path = Path(source_key[len(prefix):])
    return path if path.is_file() else None


def selected_rows(labels, selection_manifest=None):
    if selection_manifest and selection_manifest.is_file():
        payload = json.loads(selection_manifest.read_text())
        rows = []
        for item in payload.get("items") or []:
            path = Path(item["filePath"])
            if item.get("label") in set(labels) and path.is_file():
                rows.append({**item, "filePath": path})
        return rows
    shared = load_module(SHARED_PATH, "musicfm_cache_shared")
    payload = shared.build_v107()[2]
    selected = set(labels)
    rows = []
    for key, label, source in zip(
        payload["sourceKeys"], payload["actual"], payload["sources"],
    ):
        key = str(key)
        label = str(label)
        path = source_key_path(key)
        if label in selected and path is not None:
            rows.append({
                "sourceKey": key, "label": label,
                "source": str(source), "filePath": path,
            })
    return rows


def decode_audio(path, ffmpeg, duration=WINDOW_SECONDS):
    import soundfile as sf
    import soxr

    information = sf.info(str(path))
    frames = int(round(float(duration) * information.samplerate))
    decoded, decode_rate = sf.read(
        str(path), frames=frames, dtype="float32", always_2d=True,
    )
    mono = np.mean(decoded, axis=1, dtype=np.float32)
    audio = soxr.resample(mono, decode_rate, SAMPLE_RATE, quality="HQ")
    expected = int(round(float(duration) * SAMPLE_RATE))
    if len(audio) < expected:
        audio = np.pad(audio, (0, expected - len(audio)))
    return audio[:expected]


def summarize_embedding(frames):
    frames = np.asarray(frames, dtype=np.float32)
    if frames.ndim != 2 or frames.shape[1] != HIDDEN_SIZE:
        raise ValueError(f"unexpected MusicFM output shape: {frames.shape}")
    mean = np.mean(frames, axis=0, dtype=np.float64).astype(np.float32)
    standard_deviation = np.std(frames, axis=0, dtype=np.float64).astype(np.float32)
    maximum = np.max(frames, axis=0).astype(np.float32)
    return {
        "embedding": mean.tolist(),
        "moments": np.concatenate([mean, standard_deviation, maximum]).tolist(),
        "frames": int(frames.shape[0]),
        "durationSeconds": WINDOW_SECONDS,
    }


def extract(model, torch, audio):
    values = torch.from_numpy(np.asarray(audio, dtype=np.float32)).reshape(1, -1)
    with torch.inference_mode():
        frames = model(values)
    if isinstance(frames, (tuple, list)):
        frames = frames[0]
    return summarize_embedding(frames.detach().cpu().numpy()[0])


def atomic_write(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False) + "\n")
    temporary.replace(path)


def run(args):
    import torch
    from transformers import AutoModel

    if not args.ffmpeg.is_file():
        raise FileNotFoundError(args.ffmpeg)
    cache = json.loads(args.seed_cache.read_text()) if args.seed_cache.is_file() else {}
    if args.cache.is_file():
        cache.update(json.loads(args.cache.read_text()))
    rows = selected_rows(args.label, args.selection_manifest)
    if args.verify_key:
        rows = [row for row in rows if row["sourceKey"] == args.verify_key]
        if len(rows) != 1:
            raise ValueError("verify key is not a selected local row")
    pending = [row for row in rows if args.force or row["sourceKey"] not in cache]
    if args.limit:
        pending = pending[:args.limit]
    model = AutoModel.from_pretrained(
        str(args.model), trust_remote_code=True, local_files_only=True,
    )
    model.eval()
    failures = []
    completed = 0
    for position, row in enumerate(pending, 1):
        try:
            audio = decode_audio(row["filePath"], args.ffmpeg)
            record = extract(model, torch, audio)
            if args.verify_key and row["sourceKey"] in cache:
                expected = np.asarray(cache[row["sourceKey"]]["moments"])
                actual = np.asarray(record["moments"])
                record["verificationMaxAbsoluteDelta"] = float(
                    np.max(np.abs(expected - actual))
                )
                if record["verificationMaxAbsoluteDelta"] > args.verify_tolerance:
                    raise RuntimeError(
                        "MusicFM verification delta exceeds tolerance: "
                        f"{record['verificationMaxAbsoluteDelta']} > {args.verify_tolerance}"
                    )
            cache[row["sourceKey"]] = record
            completed += 1
            if completed % args.checkpoint_every == 0 or position == len(pending):
                atomic_write(args.cache, cache)
            print(
                f"[{position}/{len(pending)}] {row['source']} / {row['label']}",
                flush=True,
            )
        except Exception as error:
            failures.append({
                "sourceKey": row["sourceKey"], "label": row["label"],
                "source": row["source"], "error": str(error),
            })
    return {
        "selectedRows": len(rows), "previouslyCached": len(rows) - len(pending),
        "requested": len(pending), "completed": completed,
        "failures": failures, "cachePath": str(args.cache),
        "audioRetained": False, "metadataUsedAtInference": False,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--seed-cache", type=Path, default=DEFAULT_SEED_CACHE)
    parser.add_argument("--selection-manifest", type=Path, default=DEFAULT_SELECTION)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--ffmpeg", type=Path, default=DEFAULT_FFMPEG)
    parser.add_argument(
        "--label", action="append", default=[],
        help="Fixed OOF label to extract; may be repeated.",
    )
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--verify-key")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--checkpoint-every", type=int, default=10)
    parser.add_argument("--verify-tolerance", type=float, default=1e-3)
    parser.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args()
    args.checkpoint_every = max(1, args.checkpoint_every)
    if not args.label:
        args.label = ["ディープ・ハウス", "ハウス"]
    if args.prepare_only:
        rows = selected_rows(args.label)
        payload = {
            "labels": args.label,
            "items": [{**row, "filePath": str(row["filePath"])} for row in rows],
            "audioRetained": False,
            "metadataUsedAtInference": False,
        }
        atomic_write(args.selection_manifest, payload)
        print(json.dumps({
            "selectionManifest": str(args.selection_manifest),
            "selectedRows": len(rows),
        }, ensure_ascii=False, indent=2))
        return
    report = run(args)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
