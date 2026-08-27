"""Cache PANNs Cnn14 embeddings for an audio-only source-heldout pilot."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import sys
import tempfile
import types
from pathlib import Path

import numpy as np
import torch
from safetensors.torch import load_file


ROOT = Path(__file__).resolve().parents[3]
HELPERS_PATH = Path(__file__).with_name("genre-ast-cache.py")
REGISTRY_PATH = ROOT / "genre-training" / "external-models.json"
SPLITS_PATH = ROOT / "genre-training" / "dataset-splits.json"
MODEL_ROOT = Path(os.environ.get(
    "MMFR_EXTERNAL_MODEL_ROOT",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/models",
))
CACHE_PATH = Path(os.environ.get(
    "MMFR_PANNS_CACHE_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/panns-cnn14-30s-pilot-cache.json",
))
REPORT_PATH = ROOT / "genre-training" / "panns-cnn14-cache-report.json"
MODEL_ID = "panns-cnn14-safetensors-pilot"
EMBEDDING_SIZE = 2048
TAG_SIZE = 527

os.environ.setdefault("MPLCONFIGDIR", str(Path(tempfile.gettempdir()) / "mmfr-matplotlib"))
os.environ.setdefault("NUMBA_CACHE_DIR", str(Path(tempfile.gettempdir()) / "mmfr-numba"))


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_panns_models():
    package_spec = importlib.util.find_spec("panns_inference")
    if package_spec is None or not package_spec.submodule_search_locations:
        raise RuntimeError("panns-inference is not installed")
    package_root = Path(next(iter(package_spec.submodule_search_locations)))
    package_name = "mmfr_panns_runtime"
    # The upstream inference module imports pyplot for training visualizations,
    # but Cnn14 inference never uses it. Avoid requiring the plotting stack in
    # the exhibition runtime.
    if "matplotlib" not in sys.modules:
        matplotlib = types.ModuleType("matplotlib")
        matplotlib.__path__ = []
        pyplot = types.ModuleType("matplotlib.pyplot")
        sys.modules["matplotlib"] = matplotlib
        sys.modules["matplotlib.pyplot"] = pyplot
    package = types.ModuleType(package_name)
    package.__path__ = [str(package_root)]
    sys.modules[package_name] = package
    for child in ("pytorch_utils", "models"):
        name = f"{package_name}.{child}"
        spec = importlib.util.spec_from_file_location(name, package_root / f"{child}.py")
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
    return sys.modules[f"{package_name}.models"]


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_model(models, weights_path):
    model = models.Cnn14(
        sample_rate=32000, window_size=1024, hop_size=320,
        mel_bins=64, fmin=50, fmax=14000, classes_num=TAG_SIZE,
    )
    state = {
        key.removeprefix("backbone."): value
        for key, value in load_file(weights_path).items()
    }
    model.load_state_dict(state, strict=True)
    return model.eval()


def embed_audio(model, path, sample_rate, duration, window_seconds, windows, helpers):
    audio = helpers.decode_pcm(path, sample_rate, duration)
    window_size = int(sample_rate * window_seconds)
    chunks = []
    for start in helpers.window_starts(audio.size, window_size, windows):
        chunk = audio[start:start + window_size]
        if chunk.size < window_size:
            chunk = np.pad(chunk, (0, window_size - chunk.size))
        chunks.append(chunk)
    with torch.inference_mode():
        output = model(torch.from_numpy(np.stack(chunks)), None)
        embeddings = output["embedding"].cpu().numpy()
        tags = output["clipwise_output"].cpu().numpy()
    return {
        "embeddingMoments": helpers.summarize(embeddings),
        "tagMoments": helpers.summarize(tags),
        "windows": len(chunks),
    }


def valid(record):
    return (
        isinstance(record, dict)
        and len(record.get("embeddingMoments", [])) == EMBEDDING_SIZE * 3
        and len(record.get("tagMoments", [])) == TAG_SIZE * 3
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--duration", type=float, default=30)
    parser.add_argument("--window-seconds", type=float, default=10)
    parser.add_argument("--windows", type=int, default=3)
    parser.add_argument("--per-genre", type=int, default=10)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--checkpoint-every", type=int, default=2)
    parser.add_argument("--cache-path", type=Path, default=CACHE_PATH)
    parser.add_argument("--report-path", type=Path, default=REPORT_PATH)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not args.report_path.is_absolute():
        args.report_path = ROOT / args.report_path

    helpers = load_module("genre_panns_helpers", HELPERS_PATH)
    registry = helpers.load_json(REGISTRY_PATH, {"models": []})
    config = next((item for item in registry.get("models", []) if item.get("id") == MODEL_ID), None)
    if not config:
        raise RuntimeError(f"Missing {MODEL_ID} in external-models.json")
    weights_path = MODEL_ROOT / config["weightsPath"]
    actual_sha = sha256(weights_path)
    if config.get("sha256") and config["sha256"] != actual_sha:
        raise RuntimeError(f"SHA-256 mismatch for {weights_path}: {actual_sha}")

    rows = helpers.load_json(SPLITS_PATH, {"items": []}).get("items", [])
    candidates = helpers.balanced_candidates(rows, args.per_genre)
    cache = {
        key: value for key, value in helpers.load_json(args.cache_path, {}).items()
        if valid(value)
    }
    pending = [
        row for row in candidates
        if helpers.source_key(row)
        and helpers.source_key(row) not in cache
        and helpers.audio_path(row) is not None
    ]
    pending_total = len(pending)
    if args.limit:
        pending = pending[:args.limit]
    if args.dry_run:
        pending = []

    torch.set_num_threads(max(1, int(os.environ.get("MMFR_PANNS_TORCH_THREADS", "2"))))
    model = build_model(load_panns_models(), weights_path) if pending else None
    errors = []
    completed = 0
    dirty = False
    sample_rate = int(config.get("sampleRate") or 32000)
    for index, row in enumerate(pending, start=1):
        key = helpers.source_key(row)
        try:
            cache[key] = embed_audio(
                model, helpers.audio_path(row), sample_rate, args.duration,
                args.window_seconds, args.windows, helpers,
            )
            if not valid(cache[key]):
                raise ValueError("invalid PANNs cache record")
            completed += 1
            dirty = True
        except Exception as exc:
            errors.append({"key": key, "error": str(exc)})
        if dirty and (index % max(1, args.checkpoint_every) == 0 or index == len(pending)):
            helpers.save_json(args.cache_path, cache)
            dirty = False
            print(f"panns {index}/{len(pending)} cached={completed} errors={len(errors)}", flush=True)

    candidate_keys = {helpers.source_key(row) for row in candidates if helpers.source_key(row)}
    report = {
        "modelId": MODEL_ID,
        "weightsPath": str(weights_path),
        "sha256": actual_sha,
        "cachePath": str(args.cache_path),
        "durationSeconds": args.duration,
        "windowSeconds": args.window_seconds,
        "windowsPerTrack": args.windows,
        "perGenreLimit": args.per_genre,
        "selectedCandidateRows": len(candidates),
        "pendingRowsBeforeLimit": pending_total,
        "cachedCandidateRows": sum(key in cache for key in candidate_keys),
        "processedThisRun": completed,
        "embeddingSize": EMBEDDING_SIZE,
        "tagSize": TAG_SIZE,
        "errorCount": len(errors),
        "errors": errors[:100],
        "modelLicense": config.get("modelLicense"),
        "licenseStatus": config.get("licenseStatus"),
        "productionEligible": bool(config.get("productionEligible")),
        "metadataUsedForInference": False,
    }
    args.report_path.parent.mkdir(parents=True, exist_ok=True)
    args.report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
