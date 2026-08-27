#!/usr/bin/env python3
"""Extract the CLAP-free unknown65 runtime records from one audio file."""

from __future__ import annotations

import argparse
import gc
import importlib.util
import json
import os
import sys
import time
from pathlib import Path

import numpy as np


os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("MPLCONFIGDIR", "/tmp/mmfr-matplotlib")
os.environ.setdefault("NUMBA_CACHE_DIR", "/tmp/mmfr-numba")
os.environ.setdefault(
    "MMFR_FFMPEG_PATH", "/Users/kahanishimoto/Documents/MUSICTee/.tools/bin/ffmpeg",
)

SCRIPT_DIR = Path(__file__).parent
MODEL_ROOT = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/models"
)
PANNS_WEIGHTS = MODEL_ROOT / "panns-cnn14-16k-ccby4/model.safetensors"
YAMNET_MODEL = MODEL_ROOT / "yamnet-onnx-apache2/yamnet.onnx"
AST_MODEL = MODEL_ROOT / "ast-audioset-bsd3"
PANNS = SCRIPT_DIR / "genre-panns-cache.py"
YAMNET = SCRIPT_DIR / "genre-yamnet-cache.py"
AST = SCRIPT_DIR / "genre-ast-cache.py"
RUNTIME = SCRIPT_DIR / "genre_unknown65_runtime.py"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--expected-cache", type=Path)
    parser.add_argument("--source-key")
    parser.add_argument("--verify-tolerance", type=float, default=1e-3)
    args = parser.parse_args()
    if not args.audio.is_file():
        raise SystemExit("audio file is missing")
    runtime = load_module(RUNTIME, "unknown65_extract_runtime")
    ast = load_module(AST, "unknown65_extract_ast")
    timings = {}
    records = {}

    started = time.perf_counter()
    panns = load_module(PANNS, "unknown65_extract_panns")
    import torch
    torch.set_num_threads(max(1, int(os.environ.get("MMFR_UNKNOWN65_TORCH_THREADS", "4"))))
    model = panns.build_model(panns.load_panns_models(), PANNS_WEIGHTS)
    records["panns"] = panns.embed_audio(model, args.audio, 32000, 30, 10, 3, ast)
    runtime.feature_views(records["panns"], "panns")
    timings["pannsSeconds"] = round(time.perf_counter() - started, 3)
    del model
    gc.collect()

    started = time.perf_counter()
    yamnet = load_module(YAMNET, "unknown65_extract_yamnet")
    import onnxruntime as ort
    session = ort.InferenceSession(str(YAMNET_MODEL), providers=["CPUExecutionProvider"])
    records["yamnet"] = yamnet.embed_audio(session, args.audio, 16000, 30, ast)
    runtime.feature_views(records["yamnet"], "yamnet")
    timings["yamnetSeconds"] = round(time.perf_counter() - started, 3)
    del session
    gc.collect()

    started = time.perf_counter()
    from transformers import AutoFeatureExtractor, AutoModelForAudioClassification
    model = AutoModelForAudioClassification.from_pretrained(
        AST_MODEL, local_files_only=True,
    ).eval()
    processor = AutoFeatureExtractor.from_pretrained(AST_MODEL, local_files_only=True)
    records["ast"] = ast.embed_audio(model, processor, args.audio, 16000, 30, 10, 3)
    runtime.feature_views(records["ast"], "ast")
    timings["astSeconds"] = round(time.perf_counter() - started, 3)
    payload = {
        "ok": True, "records": records, "timings": timings,
        "runtimeFeatureContractSha256": runtime.feature_contract_digest(),
        "audioRetained": False,
    }
    if args.expected_cache or args.source_key:
        if not args.expected_cache or not args.source_key:
            raise SystemExit("expected-cache and source-key must be used together")
        expected = json.loads(args.expected_cache.read_text()).get(args.source_key)
        if expected is None:
            raise SystemExit("source key is absent from expected cache")
        deltas = {}
        for name in ("panns", "yamnet", "ast"):
            actual_views = runtime.feature_views(records[name], name)
            expected_views = runtime.feature_views(expected[name], name)
            deltas[name] = max(
                float(np.max(np.abs(actual_views[view] - expected_views[view])))
                for view in actual_views
            )
        maximum = max(deltas.values())
        payload["featureParity"] = {
            "maxAbsoluteDeltaByRepresentation": deltas,
            "maximumAbsoluteDelta": maximum,
            "tolerance": args.verify_tolerance,
            "passes": maximum <= args.verify_tolerance,
        }
        payload.pop("records")
        if maximum > args.verify_tolerance:
            raise RuntimeError("unknown65 runtime feature parity failed")
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
