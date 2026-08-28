#!/usr/bin/env python3
"""Extract one production MusicFM record without retaining decoded audio."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path

import numpy as np


os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")


SCRIPT_DIR = Path(__file__).parent
CACHE_PATH = SCRIPT_DIR / "genre-musicfm-cache.py"
RUNTIME_PATH = SCRIPT_DIR / "genre_musicfm_runtime.py"
DEFAULT_MODEL = Path(os.environ.get(
    "MMFR_MUSICFM_MODEL_PATH",
    SCRIPT_DIR.parents[3] / "runtime-assets/models/musicfm-inference-msd",
))


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--expected-cache", type=Path)
    parser.add_argument("--source-key")
    parser.add_argument("--verify-tolerance", type=float, default=1e-3)
    args = parser.parse_args()
    if not args.audio.is_file():
        raise SystemExit("audio file is missing")
    cache = load_module(CACHE_PATH, "musicfm_runtime_cache")
    runtime = load_module(RUNTIME_PATH, "musicfm_runtime_contract")
    import torch
    from transformers import AutoModel

    model = AutoModel.from_pretrained(
        str(args.model), trust_remote_code=True, local_files_only=True,
    )
    model.eval()
    record = cache.extract(model, torch, cache.decode_audio(args.audio, cache.DEFAULT_FFMPEG))
    payload = {
        "ok": True,
        "record": record,
        "runtimeFeatureContractSha256": runtime.feature_contract_digest(),
        "audioRetained": False,
    }
    if args.expected_cache or args.source_key:
        if not args.expected_cache or not args.source_key:
            raise SystemExit("expected-cache and source-key must be used together")
        expected = json.loads(args.expected_cache.read_text()).get(args.source_key)
        if expected is None:
            raise SystemExit("source key is absent from expected cache")
        if isinstance(expected, dict) and isinstance(expected.get("musicfm"), dict):
            expected = expected["musicfm"]
        expected_features = runtime.features_from_record(expected)
        actual_features = runtime.features_from_record(record)
        delta = float(np.max(np.abs(expected_features - actual_features)))
        payload["featureParity"] = {
            "maxAbsoluteDelta": delta,
            "tolerance": args.verify_tolerance,
            "passes": delta <= args.verify_tolerance,
        }
        payload.pop("record")
        if delta > args.verify_tolerance:
            raise RuntimeError("runtime MusicFM feature parity failed")
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
