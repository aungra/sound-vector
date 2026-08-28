"""Cache YAMNet ONNX audio-event embeddings for a source-heldout pilot."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path

import numpy as np
import onnxruntime as ort


ROOT = Path(__file__).resolve().parents[3]
HELPERS_PATH = Path(__file__).with_name("genre-ast-cache.py")
REGISTRY_PATH = ROOT / "genre-training" / "external-models.json"
SPLITS_PATH = ROOT / "genre-training" / "dataset-splits.json"
MODEL_ROOT = Path(os.environ.get(
    "MMFR_EXTERNAL_MODEL_ROOT",
    str(ROOT / "runtime-assets" / "models"),
))
CACHE_PATH = Path(os.environ.get(
    "MMFR_YAMNET_CACHE_PATH",
    str(ROOT / "runtime-assets" / "cache" / "yamnet-30s-pilot-cache.json"),
))
REPORT_PATH = ROOT / "genre-training" / "yamnet-cache-report.json"
MODEL_ID = "yamnet-onnx-apache2"
EMBEDDING_SIZE = 1024
TAG_SIZE = 521


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def temporal_dynamics(values):
    matrix = np.asarray(values, dtype=np.float32)
    if len(matrix) < 2:
        return np.zeros(matrix.shape[-1] * 3, dtype=np.float32).tolist()
    differences = np.diff(matrix, axis=0)
    absolute = np.abs(differences)
    result = np.concatenate([
        absolute.mean(axis=0), differences.std(axis=0), absolute.max(axis=0),
    ])
    result[~np.isfinite(result)] = 0.0
    return result.astype(float).tolist()


def embed_audio(session, path, sample_rate, duration, helpers):
    audio = helpers.decode_pcm(path, sample_rate, duration)
    input_name = session.get_inputs()[0].name
    scores, embeddings, _spectrogram = session.run(None, {input_name: audio.astype(np.float32)})
    if embeddings.ndim != 2 or embeddings.shape[1] != EMBEDDING_SIZE:
        raise ValueError(f"unexpected YAMNet embedding shape: {embeddings.shape}")
    if scores.ndim != 2 or scores.shape[1] != TAG_SIZE:
        raise ValueError(f"unexpected YAMNet score shape: {scores.shape}")
    return {
        "embeddingMoments": helpers.summarize(embeddings),
        "embeddingDynamics": temporal_dynamics(embeddings),
        "tagMoments": helpers.summarize(scores),
        "frames": int(len(embeddings)),
    }


def valid(record):
    return (
        isinstance(record, dict)
        and len(record.get("embeddingMoments", [])) == EMBEDDING_SIZE * 3
        and len(record.get("embeddingDynamics", [])) == EMBEDDING_SIZE * 3
        and len(record.get("tagMoments", [])) == TAG_SIZE * 3
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--duration", type=float, default=30)
    parser.add_argument("--per-genre", type=int, default=10)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--checkpoint-every", type=int, default=5)
    parser.add_argument("--cache-path", type=Path, default=CACHE_PATH)
    parser.add_argument("--report-path", type=Path, default=REPORT_PATH)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not args.report_path.is_absolute():
        args.report_path = ROOT / args.report_path

    helpers = load_module("genre_yamnet_helpers", HELPERS_PATH)
    registry = helpers.load_json(REGISTRY_PATH, {"models": []})
    config = next((item for item in registry.get("models", []) if item.get("id") == MODEL_ID), None)
    if not config:
        raise RuntimeError(f"Missing {MODEL_ID} in external-models.json")
    model_path = MODEL_ROOT / config["modelPath"]
    actual_sha = sha256(model_path)
    if config.get("sha256") and config["sha256"] != actual_sha:
        raise RuntimeError(f"SHA-256 mismatch for {model_path}: {actual_sha}")

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

    session = ort.InferenceSession(
        str(model_path), providers=["CPUExecutionProvider"],
        sess_options=ort.SessionOptions(),
    ) if pending else None
    errors = []
    completed = 0
    dirty = False
    sample_rate = int(config.get("sampleRate") or 16000)
    for index, row in enumerate(pending, start=1):
        key = helpers.source_key(row)
        try:
            cache[key] = embed_audio(
                session, helpers.audio_path(row), sample_rate, args.duration, helpers,
            )
            if not valid(cache[key]):
                raise ValueError("invalid YAMNet cache record")
            completed += 1
            dirty = True
        except Exception as exc:
            errors.append({"key": key, "error": str(exc)})
        if dirty and (index % max(1, args.checkpoint_every) == 0 or index == len(pending)):
            helpers.save_json(args.cache_path, cache)
            dirty = False
            print(f"yamnet {index}/{len(pending)} cached={completed} errors={len(errors)}", flush=True)

    candidate_keys = {helpers.source_key(row) for row in candidates if helpers.source_key(row)}
    report = {
        "modelId": MODEL_ID,
        "modelPath": str(model_path),
        "sha256": actual_sha,
        "cachePath": str(args.cache_path),
        "durationSeconds": args.duration,
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
