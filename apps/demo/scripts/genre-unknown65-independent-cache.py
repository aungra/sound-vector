#!/usr/bin/env python3
"""Resume evaluation-only deep representations for the filtered GTZAN split.

The cache is kept outside the repository and is updated atomically after each
track.  GTZAN remains evaluation-only; this script never adds its rows to a
training manifest.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPT_DIR = Path(__file__).parent
DEFAULT_MANIFEST = ROOT / "genre-training/gtzan-filtered-evaluation-manifest.json"
DEFAULT_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/gtzan/"
    "unknown65-deep-representations-v1.json"
)
DEFAULT_MODEL = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/models/musicfm-inference-msd"
)
MUSICFM_CACHE = SCRIPT_DIR / "genre-musicfm-cache.py"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def atomic_write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False) + "\n")
    temporary.replace(path)


def evaluation_rows(path: Path) -> list[dict]:
    payload = json.loads(path.read_text())
    if payload.get("role") != "source-heldout-evaluation-only":
        raise ValueError("manifest is not marked evaluation-only")
    rows = payload.get("items") or []
    for row in rows:
        if row.get("trainingEligible") or not row.get("evaluationEligible"):
            raise ValueError(f"training-eligible GTZAN row: {row.get('trackId')}")
    return rows


def musicfm(args, rows: list[dict], cache: dict) -> dict:
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    helper = load_module(MUSICFM_CACHE, "unknown65_independent_musicfm")
    import torch
    from transformers import AutoModel

    uncached = [row for row in rows if args.force or "musicfm" not in cache.get(row["trackId"], {})]
    previously_cached = len(rows) - len(uncached)
    pending = uncached
    if args.limit:
        pending = pending[: args.limit]
    model = AutoModel.from_pretrained(
        str(args.musicfm_model), trust_remote_code=True, local_files_only=True,
    )
    model.eval()
    completed = 0
    failures = []
    for position, row in enumerate(pending, 1):
        try:
            audio = helper.decode_audio(Path(row["filePath"]), helper.DEFAULT_FFMPEG)
            record = helper.extract(model, torch, audio)
            cache.setdefault(row["trackId"], {})["musicfm"] = record
            completed += 1
            if completed % args.checkpoint_every == 0 or position == len(pending):
                atomic_write(args.cache, cache)
            print(f"[{position}/{len(pending)}] {row['trackId']}", flush=True)
        except Exception as error:
            failures.append({"trackId": row["trackId"], "error": str(error)})
    if completed and completed % args.checkpoint_every:
        atomic_write(args.cache, cache)
    del model
    return {
        "representation": "musicfm", "selected": len(rows),
        "previouslyCached": previously_cached, "requested": len(pending),
        "completed": completed, "failures": failures,
    }


def coverage(rows: list[dict], cache: dict) -> dict[str, int]:
    names = ("musicfm", "panns", "yamnet", "ast")
    ids = [row["trackId"] for row in rows]
    return {name: sum(name in cache.get(track_id, {}) for track_id in ids) for name in names}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--representation", choices=("musicfm",), default="musicfm")
    parser.add_argument("--musicfm-model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--checkpoint-every", type=int, default=5)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--coverage-only", action="store_true")
    args = parser.parse_args()
    args.checkpoint_every = max(1, args.checkpoint_every)
    rows = evaluation_rows(args.manifest)
    cache = json.loads(args.cache.read_text()) if args.cache.is_file() else {}
    before = coverage(rows, cache)
    result = None if args.coverage_only else musicfm(args, rows, cache)
    after = coverage(rows, cache)
    print(json.dumps({
        "role": "source-heldout-evaluation-only", "rows": len(rows),
        "cache": str(args.cache), "coverageBefore": before,
        "coverageAfter": after, "run": result,
        "audioRetained": False, "admittedToTraining": False,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
