#!/usr/bin/env python3
"""Extract the runtime librosa contract for a local manifest audio subset."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path


INFER_PATH = Path(__file__).with_name("genre_librosa_contract.py")
EXPECTED_DIMENSIONS = 547


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def source_key(row):
    return f"{row['sourceType']}:{row['sourceUrl']}"


def build_cache(items, extractor):
    output = {}
    errors = []
    for row in items:
        key = source_key(row)
        path = Path(row.get("filePath", ""))
        if not path.is_file():
            errors.append({"key": key, "error": "missing-audio"})
            continue
        try:
            vector = extractor(path, 0.0)
            if len(vector) != EXPECTED_DIMENSIONS:
                raise ValueError(
                    f"expected {EXPECTED_DIMENSIONS} features, received {len(vector)}"
                )
            output[key] = [float(value) for value in vector]
        except Exception as error:
            errors.append({"key": key, "error": str(error)})
    return output, errors


def atomic_write(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False) + "\n")
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--infer-script", type=Path, default=INFER_PATH)
    parser.add_argument("--extractor-name", default="extract_librosa")
    args = parser.parse_args()
    items = json.loads(args.manifest.read_text()).get("items", [])
    inference = load_module(args.infer_script, "manifest_librosa_inference")
    named_extractor = getattr(inference, args.extractor_name)
    extractor = (
        (lambda path, _offset: named_extractor(str(path)))
        if args.extractor_name == "extract_features"
        else named_extractor
    )
    cache, errors = build_cache(items, extractor)
    atomic_write(args.output, cache)
    print(json.dumps({
        "manifest": str(args.manifest),
        "output": str(args.output),
        "requestedRows": len(items),
        "cachedRows": len(cache),
        "errors": errors,
    }, ensure_ascii=False, indent=2))
    raise SystemExit(1 if errors else 0)


if __name__ == "__main__":
    main()
