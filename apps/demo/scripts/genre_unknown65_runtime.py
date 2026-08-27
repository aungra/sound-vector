"""Runtime helper for the frozen CLAP-free unknown65 pair chain."""

from __future__ import annotations

import hashlib
import json
import pickle
from pathlib import Path

import numpy as np


VERSION = "unknown65-clap-free-pair-chain-v1"
SCHEMA_VERSION = 1


def feature_contract() -> dict:
    return {
        "schemaVersion": 1,
        "classificationScope": "track",
        "representations": {
            "musicfm": {
                "model": "MusicFM MSD inference", "sampleRate": 24000,
                "durationSeconds": 29.1, "frameCount": 728,
                "summary": ["frame-mean", "moment-mean"],
                "embeddingSize": 1024,
            },
            "panns": {
                "model": "PANNs Cnn14", "sampleRate": 32000,
                "durationSeconds": 30, "windows": 3, "windowSeconds": 10,
                "summary": ["mean", "std", "max"],
                "embeddingSize": 2048, "tagSize": 527,
            },
            "yamnet": {
                "model": "Google YAMNet ONNX", "sampleRate": 16000,
                "durationSeconds": 30,
                "summary": ["mean", "std", "max", "temporal-dynamics"],
                "embeddingSize": 1024, "tagSize": 521,
            },
            "ast": {
                "model": "MIT AST AudioSet 10-10", "sampleRate": 16000,
                "durationSeconds": 30, "windows": 3, "windowSeconds": 10,
                "summary": ["normalized-mean", "mean", "std", "max"],
                "embeddingSize": 768, "tagSize": 527,
            },
        },
    }


def feature_contract_digest(contract: dict | None = None) -> str:
    encoded = json.dumps(
        contract or feature_contract(), sort_keys=True, separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _array(record: dict, key: str, size: int) -> np.ndarray:
    value = np.asarray(record.get(key), dtype=np.float64)
    if value.shape != (size,) or not np.all(np.isfinite(value)):
        raise ValueError(f"invalid {key}: expected {size} finite values")
    return value


def feature_views(record: dict, cache_format: str) -> dict[str, np.ndarray]:
    if cache_format == "musicfm":
        embedding = _array(record, "embedding", 1024)
        moments = _array(record, "moments", 3072).reshape(3, 1024)
        return {
            "30s-embedding": embedding,
            "30s-moment-mean": moments[0],
            "30s-joint-mean": np.concatenate([embedding, moments[0]]),
        }
    if cache_format == "panns":
        moments = _array(record, "embeddingMoments", 6144).reshape(3, 2048)
        tags = _array(record, "tagMoments", 1581).reshape(3, 527)
        return {
            "embedding-mean": moments[0], "tag-mean": tags[0],
            "embedding-tag": np.concatenate([moments[0], tags[0]]),
        }
    if cache_format == "yamnet":
        moments = _array(record, "embeddingMoments", 3072).reshape(3, 1024)
        dynamics = _array(record, "embeddingDynamics", 3072).reshape(3, 1024)
        tags = _array(record, "tagMoments", 1563).reshape(3, 521)
        return {
            "embedding-mean": moments[0], "dynamics-mean": dynamics[0],
            "tag-mean": tags[0],
            "embedding-tag": np.concatenate([moments[0], tags[0]]),
        }
    if cache_format == "ast":
        embedding = _array(record, "embedding", 768)
        moments = _array(record, "moments", 2304).reshape(3, 768)
        tags = _array(record, "tagMoments", 1581).reshape(3, 527)
        return {
            "embedding": embedding, "moment-mean": moments[0],
            "tag-mean": tags[0],
            "embedding-tag": np.concatenate([embedding, tags[0]]),
        }
    raise ValueError(f"unsupported representation: {cache_format}")


def load_bundle(path: Path | str) -> dict:
    with Path(path).open("rb") as handle:
        bundle = pickle.load(handle)
    if bundle.get("version") != VERSION or bundle.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError("unsupported unknown65 runtime bundle")
    contract = bundle.get("runtimeFeatureContract")
    if contract != feature_contract():
        raise ValueError("unknown65 runtime feature contract differs from bundle")
    if bundle.get("runtimeFeatureContractSha256") != feature_contract_digest(contract):
        raise ValueError("unknown65 runtime feature contract SHA-256 mismatch")
    if not isinstance(bundle.get("stages"), list) or not bundle["stages"]:
        raise ValueError("unknown65 runtime stages are missing")
    return bundle


def _classes(model) -> list[str]:
    return list(model.classes_ if hasattr(model, "classes_") else model[-1].classes_)


def rerank(bundle: dict, labels: list[str], scores, records: dict[str, dict]):
    output = np.asarray(scores, dtype=np.float64).copy()
    details = []
    for stage in bundle["stages"]:
        pair = list(stage["pair"])
        top = np.argsort(-output, kind="stable")[: int(stage["config"]["routeTopK"])]
        detail = {
            "pair": pair, "representation": stage["cacheFormat"],
            "view": stage["view"], "applied": False,
        }
        if not set(pair).issubset({labels[int(index)] for index in top}):
            detail["reason"] = "pair-not-in-top3"
            details.append(detail)
            continue
        record = records.get(stage["cacheFormat"])
        if not record:
            detail["reason"] = "representation-unavailable"
            details.append(detail)
            continue
        vector = feature_views(record, stage["cacheFormat"])[stage["view"]]
        model = stage["model"]
        raw = model.predict_proba(vector.reshape(1, -1))[0]
        classes = _classes(model)
        learned = np.asarray([raw[classes.index(label)] for label in pair])
        confidence = float(np.max(learned))
        detail["confidence"] = round(confidence, 6)
        if confidence < float(stage["config"]["confidenceFloor"]):
            detail["reason"] = "below-confidence-floor"
            details.append(detail)
            continue
        indexes = np.asarray([labels.index(label) for label in pair], dtype=np.int64)
        local = output[indexes]
        local /= max(float(np.sum(local)), 1e-12)
        weight = float(stage["config"]["weight"])
        target = local * (1.0 - weight) + learned * weight
        before = indexes[int(np.argmax(local))]
        after = indexes[int(np.argmax(target))]
        if before != after:
            values = np.sort(output[indexes])[::-1]
            order = indexes[np.argsort(-target, kind="stable")]
            output[order] = values
            detail["applied"] = True
        detail["reason"] = "evaluated"
        details.append(detail)
    return output, details
