#!/usr/bin/env python3
"""Build a rights-clear full-track Ambient/Drone/Noise overlay."""

from __future__ import annotations

import argparse
import importlib.util
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SHARED_PATH = Path(__file__).with_name(
    "genre-unknown80-build-independent-electronic-manifest.py"
)
OUTPUT = ROOT / "genre-training/unknown80-independent-texture-candidate-manifest.json"
SOURCE_ROOT = Path("/Users/kahanishimoto/Documents/MUSICTee/genre-training")
TARGET_GENRES = {"アンビエント", "ドローン", "ノイズミュージック"}
SOURCE_MANIFESTS = (
    "internet-archive-independent-8-cc-source-manifest.json",
    "internet-archive-independent-netlabels-20260811-cc-source-manifest.json",
    "internet-archive-goal75-new-cc-source-manifest.json",
    "internet-archive-cc-source-manifest.json",
    "wikimedia-independent-8-20260811-cc-source-manifest.json",
    "wikimedia-category-expansion1-cc-source-manifest.json",
    "wikimedia-category-explicit-cc-source-manifest.json",
    "wikimedia-noise-batch-v4-cc-source-manifest.json",
    "wikimedia-direct-third-source-v3-cc-source-manifest.json",
    "wikimedia-unknown80-priority-v1-cc-source-manifest.json",
    "ccmixter-rights-safe-weak-v1-cc-source-manifest.json",
    "ccmixter-third-source-weak-v1-cc-source-manifest.json",
    "ccmixter-explicit-cc-source-manifest.json",
    "fma-target-cc-source-manifest.json",
    "fma-low-genres-expansion-cc-source-manifest.json",
    "fma-large-expansion-cc-source-manifest.json",
    "fma-medium-expansion-cc-source-manifest.json",
    "fma-drone-formal-boost-manifest.json",
    "fma-drone-formal-boost-2-manifest.json",
    "fma-drone-formal-boost-3-manifest.json",
)


def load_shared():
    spec = importlib.util.spec_from_file_location("texture_manifest_shared", SHARED_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SHARED = load_shared()
normalized_source = SHARED.normalized_source
normalize_row = SHARED.normalize_row


def build(source_root):
    previous_targets = SHARED.TARGET_GENRES
    previous_manifests = SHARED.SOURCE_MANIFESTS
    try:
        SHARED.TARGET_GENRES = TARGET_GENRES
        SHARED.SOURCE_MANIFESTS = SOURCE_MANIFESTS
        payload = SHARED.build(source_root)
    finally:
        SHARED.TARGET_GENRES = previous_targets
        SHARED.SOURCE_MANIFESTS = previous_manifests
    payload["description"] = (
        "Rights-clear full-track Ambient/Drone/Noise candidates for leak-free "
        "texture-boundary ablations."
    )
    by_genre_source = Counter(
        (row["genre"], row["source"]) for row in payload["items"]
    )
    payload["buildSummary"]["byGenreSource"] = {
        f"{genre}|{source}": count
        for (genre, source), count in sorted(by_genre_source.items())
    }
    payload["policy"]["minimumTrainingProvidersPerLabel"] = 2
    return payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, default=SOURCE_ROOT)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    payload = build(args.source_root)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(args.output)
    print(json.dumps(payload["buildSummary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
