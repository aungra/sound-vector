#!/usr/bin/env python3
"""Extract temporal rhythm sidecars for selected labels in the fixed OOF set."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from genre_rhythm_sidecar_contract import VECTOR_LENGTH, extract_rhythm_sidecar


DEFAULT_OOF = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-incumbent-caphe-oof-audio-only.npz"
)


def audio_path(source_key):
    prefix = "cc-dataset:"
    value = str(source_key)
    return Path(value[len(prefix):] if value.startswith(prefix) else value)


def atomic_write(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False) + "\n")
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=DEFAULT_OOF)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--label", action="append", required=True)
    args = parser.parse_args()
    payload = np.load(args.oof)
    selected = set(args.label)
    existing = json.loads(args.output.read_text()) if args.output.is_file() else {}
    output = dict(existing)
    errors = []
    requested = 0
    extracted = 0
    for label, key in zip(payload["actual"], payload["sourceKeys"]):
        if str(label) not in selected:
            continue
        requested += 1
        key = str(key)
        if key in output and len(output[key]) == VECTOR_LENGTH:
            continue
        path = audio_path(key)
        if not path.is_file():
            errors.append({"key": key, "error": "missing-audio"})
            continue
        try:
            vector = extract_rhythm_sidecar(path)
            if len(vector) != VECTOR_LENGTH:
                raise ValueError(f"expected {VECTOR_LENGTH}, received {len(vector)}")
            output[key] = vector
            extracted += 1
        except Exception as error:
            errors.append({"key": key, "error": str(error)})
    atomic_write(args.output, output)
    report = {
        "requestedRows": requested,
        "cachedRows": sum(
            str(key) in output for label, key in zip(payload["actual"], payload["sourceKeys"])
            if str(label) in selected
        ),
        "newlyExtractedRows": extracted,
        "featureDimensions": VECTOR_LENGTH,
        "labels": sorted(selected),
        "errors": errors,
        "output": str(args.output),
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(1 if errors else 0)


if __name__ == "__main__":
    main()
