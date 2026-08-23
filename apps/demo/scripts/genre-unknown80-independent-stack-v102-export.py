#!/usr/bin/env python3
"""Export v101 plus the gated Latin/Folk confidence head."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
V101_PATH = Path(__file__).with_name(
    "genre-unknown80-independent-stack-v101-export.py"
)
DEFAULT_OUTPUT = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-independent-multiboundary-stack-v102-candidate.pkl"
)
DEFAULT_MANIFEST = TRAINING / "unknown80-independent-stack-v102-model-manifest.json"
SOURCE_HELDOUT_REPORT = (
    TRAINING / "unknown80-independent-stack-source-heldout.json"
)
PRODUCTION_REPORT = (
    TRAINING / "unknown80-independent-stack-v102-production-regression.json"
)
LATIN_FOLK_MEMBER = {
    "pair": ("ラテン", "フォーク"),
    "kind": "logistic",
    "view": "rhythm",
    "strength": 1.0,
    "confidenceFloor": 0.95,
}


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run(args):
    v101 = load_module(V101_PATH, "stack_v102_shared")
    v101.ADDITIONAL_MEMBERS = (*v101.ADDITIONAL_MEMBERS, LATIN_FOLK_MEMBER)
    v101.MODEL_VERSION = "unknown80-independent-multiboundary-20260823-v102"
    v101.COMBINATION_NAME = "conservative-six-pair-confidence-stack"
    v101.METHOD = "audio-only-source-heldout-six-pair-confidence-stack"
    v101.SOURCE_HELDOUT_TOP1_AFTER = 59.27
    v101.SOURCE_HELDOUT_IMPROVED = 12
    v101.SOURCE_HELDOUT_HARMED = 1
    v101.STRICT_TOP1 = 59.27
    v101.STRICT_BALANCED_TOP1 = 59.10
    v101.STRICT_MINIMUM_SOURCE_TOP1 = 31.58
    v101.STRICT_TOP3 = 83.48
    v101.PRODUCTION_REPORT = PRODUCTION_REPORT
    payload = v101.run(args)
    payload = json.loads(args.manifest.read_text())
    v100 = v101.load_module(v101.V100_PATH, "stack_v102_hash")
    payload["evaluation"]["cumulativeSourceHeldoutReport"] = str(
        SOURCE_HELDOUT_REPORT.relative_to(ROOT)
    )
    payload["evaluation"]["cumulativeSourceHeldoutReportSha256"] = v100.sha256(
        SOURCE_HELDOUT_REPORT
    )
    args.manifest.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    return payload


def main():
    v101 = load_module(V101_PATH, "stack_v102_defaults")
    v100 = v101.load_module(v101.V100_PATH, "stack_v102_v100_defaults")
    black = v100.load_module(v100.SHARED_PATH, "stack_v102_black_defaults")
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=black.DEFAULT_OOF)
    parser.add_argument("--formal-librosa", type=Path, default=black.DEFAULT_FORMAL_LIBROSA)
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
