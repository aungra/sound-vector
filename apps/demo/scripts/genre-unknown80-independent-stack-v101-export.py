#!/usr/bin/env python3
"""Export v100 plus the gated Rock/Metal confidence head."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
V100_PATH = Path(__file__).with_name(
    "genre-unknown80-independent-stack-v100-export.py"
)
DEFAULT_OUTPUT = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-independent-multiboundary-stack-v101-candidate.pkl"
)
DEFAULT_MANIFEST = TRAINING / "unknown80-independent-stack-v101-model-manifest.json"
GUITAR_REPORT = TRAINING / "unknown80-independent-guitar-ablation.json"
PRODUCTION_REPORT = (
    TRAINING / "unknown80-independent-stack-v101-production-regression.json"
)
GUITAR_MEMBER = {
    "pair": ("ロック", "メタル"),
    "kind": "logistic",
    "view": "full",
    "strength": 0.25,
    "confidenceFloor": 0.9,
}


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run(args):
    v100 = load_module(V100_PATH, "stack_v101_shared")
    v100.MEMBER_CONFIGS = (*v100.MEMBER_CONFIGS, GUITAR_MEMBER)
    v100.MODEL_VERSION = "unknown80-independent-multiboundary-20260823-v101"
    v100.COMBINATION_NAME = "conservative-five-pair-confidence-stack"
    v100.METHOD = "audio-only-source-heldout-five-pair-confidence-stack"
    v100.SOURCE_HELDOUT_TOP1_AFTER = 58.90
    v100.SOURCE_HELDOUT_IMPROVED = 7
    v100.SOURCE_HELDOUT_HARMED = 1
    v100.STRICT_TOP1 = 58.90
    v100.STRICT_BALANCED_TOP1 = 58.78
    v100.PRODUCTION_REPORT = PRODUCTION_REPORT
    payload = v100.run(args)
    payload = json.loads(args.manifest.read_text())
    payload["evaluation"]["guitarSourceHeldoutReport"] = str(
        GUITAR_REPORT.relative_to(ROOT)
    )
    payload["evaluation"]["guitarSourceHeldoutReportSha256"] = v100.sha256(
        GUITAR_REPORT
    )
    args.manifest.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    return payload


def main():
    v100 = load_module(V100_PATH, "stack_v101_defaults")
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=v100.load_module(v100.SHARED_PATH, "v101_black_defaults").DEFAULT_OOF)
    parser.add_argument("--formal-librosa", type=Path, default=v100.load_module(v100.SHARED_PATH, "v101_black_formal").DEFAULT_FORMAL_LIBROSA)
    parser.add_argument("--black-manifest", type=Path, default=v100.BLACK_MANIFEST)
    parser.add_argument("--black-cache", type=Path, default=v100.BLACK_CACHE)
    parser.add_argument("--electronic-manifest", type=Path, default=v100.ELECTRONIC_MANIFEST)
    parser.add_argument("--electronic-cache", type=Path, default=v100.ELECTRONIC_CACHE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()
    manifest = run(args)
    print(json.dumps({
        "candidateModelPath": manifest["candidateModelPath"],
        "candidateModelSha256": manifest["candidateModelSha256"],
        "serializationParity": manifest["serializationParity"],
        "strictTop1": manifest["evaluation"]["strictTop1"],
        "promotionDecision": manifest["promotionDecision"],
    }, ensure_ascii=False, indent=2))
    raise SystemExit(0 if manifest["serializationParity"]["passed"] else 1)


if __name__ == "__main__":
    main()
