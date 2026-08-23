#!/usr/bin/env python3
"""Export the gated v99 stack plus the Techno/Trance confidence head."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import tempfile
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
SHARED_PATH = Path(__file__).with_name(
    "genre-unknown80-independent-blackmusic-pair-export.py"
)
BLACK_MANIFEST = TRAINING / "unknown80-independent-blackmusic-candidate-manifest.json"
BLACK_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-independent-blackmusic-librosa.json"
)
ELECTRONIC_MANIFEST = TRAINING / "unknown80-independent-electronic-candidate-manifest.json"
ELECTRONIC_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-independent-electronic-librosa.json"
)
DEFAULT_OUTPUT = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-independent-multiboundary-stack-v100-candidate.pkl"
)
DEFAULT_MANIFEST = TRAINING / "unknown80-independent-stack-v100-model-manifest.json"
ELECTRONIC_REPORT = TRAINING / "unknown80-independent-electronic-ablation.json"
PRODUCTION_REPORT = (
    TRAINING / "unknown80-independent-stack-v100-production-regression.json"
)
MEMBER_CONFIGS = ({
    "pair": ("テクノ", "トランス"),
    "kind": "extra-trees",
    "view": "rhythm",
    "strength": 0.25,
    "confidenceFloor": 0.8,
},)
MODEL_VERSION = "unknown80-independent-multiboundary-20260823-v100"
COMBINATION_NAME = "conservative-four-pair-confidence-stack"
METHOD = "audio-only-source-heldout-four-pair-confidence-stack"
SOURCE_HELDOUT_TOP1_BEFORE = 58.68
SOURCE_HELDOUT_TOP1_AFTER = 58.79
SOURCE_HELDOUT_IMPROVED = 2
SOURCE_HELDOUT_HARMED = 0
STRICT_TOP1 = 58.79
STRICT_BALANCED_TOP1 = 58.75
STRICT_MINIMUM_SOURCE_TOP1 = 31.58
STRICT_TOP3 = 83.48


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def merge_inputs(manifest_paths, cache_paths, directory):
    items = []
    seen = set()
    for path in manifest_paths:
        for row in json.loads(path.read_text()).get("items", []):
            key = f"{row['sourceType']}:{row['sourceUrl']}"
            if key in seen:
                continue
            seen.add(key)
            items.append(row)
    cache = {}
    for path in cache_paths:
        cache.update(json.loads(path.read_text()))
    manifest_path = directory / "merged-manifest.json"
    cache_path = directory / "merged-librosa.json"
    manifest_path.write_text(json.dumps({"items": items}, ensure_ascii=False))
    cache_path.write_text(json.dumps(cache, ensure_ascii=False))
    return manifest_path, cache_path


def run(args):
    shared = load_module(SHARED_PATH, "stack_v100_shared")
    shared.MEMBER_CONFIGS = (*shared.MEMBER_CONFIGS, *MEMBER_CONFIGS)
    shared.MODEL_VERSION = MODEL_VERSION
    shared.COMBINATION_NAME = COMBINATION_NAME
    shared.SOURCE_HELDOUT_TOP1_BEFORE = SOURCE_HELDOUT_TOP1_BEFORE
    shared.SOURCE_HELDOUT_TOP1_AFTER = SOURCE_HELDOUT_TOP1_AFTER
    shared.SOURCE_HELDOUT_IMPROVED = SOURCE_HELDOUT_IMPROVED
    shared.SOURCE_HELDOUT_HARMED = SOURCE_HELDOUT_HARMED
    shared.OOF_REPORT = ELECTRONIC_REPORT
    shared.PRODUCTION_REPORT = PRODUCTION_REPORT
    with tempfile.TemporaryDirectory() as directory:
        merged_manifest, merged_cache = merge_inputs(
            (args.black_manifest, args.electronic_manifest),
            (args.black_cache, args.electronic_cache),
            Path(directory),
        )
        export_args = SimpleNamespace(
            oof=args.oof,
            formal_librosa=[args.formal_librosa],
            overlay_manifest=merged_manifest,
            overlay_librosa=merged_cache,
            output=args.output,
            manifest=args.manifest,
        )
        manifest = shared.run(export_args)
    payload = json.loads(args.manifest.read_text())
    payload["method"] = METHOD
    payload["evaluation"]["electronicSourceHeldoutReport"] = str(
        ELECTRONIC_REPORT.relative_to(ROOT)
    )
    payload["evaluation"]["electronicSourceHeldoutReportSha256"] = sha256(
        ELECTRONIC_REPORT
    )
    payload["evaluation"]["strictTop1"] = STRICT_TOP1
    payload["evaluation"]["strictBalancedTop1"] = STRICT_BALANCED_TOP1
    payload["evaluation"]["strictMinimumSourceTop1"] = STRICT_MINIMUM_SOURCE_TOP1
    payload["evaluation"]["strictTop3"] = STRICT_TOP3
    args.manifest.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    return payload


def main():
    shared = load_module(SHARED_PATH, "stack_v100_defaults")
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=shared.DEFAULT_OOF)
    parser.add_argument(
        "--formal-librosa", type=Path, default=shared.DEFAULT_FORMAL_LIBROSA
    )
    parser.add_argument("--black-manifest", type=Path, default=BLACK_MANIFEST)
    parser.add_argument("--black-cache", type=Path, default=BLACK_CACHE)
    parser.add_argument(
        "--electronic-manifest", type=Path, default=ELECTRONIC_MANIFEST
    )
    parser.add_argument("--electronic-cache", type=Path, default=ELECTRONIC_CACHE)
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
