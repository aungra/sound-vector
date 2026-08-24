"""Runtime contract and Top3 reranking for the MusicFM v114 candidate."""

from __future__ import annotations

import hashlib
import json
import pickle
from pathlib import Path

import numpy as np


VERSION = "unknown80-musicfm-top3-v114-candidate"
SCHEMA_VERSION = 1


def feature_contract():
    return {
        "schemaVersion": 1,
        "modelFamily": "MusicFM MSD inference",
        "modelLicense": "MIT; Apache-2.0",
        "modelLicenseEvidence": "local-model/LICENSE",
        "sampleRate": 24000,
        "durationSeconds": 29.1,
        "frameCount": 728,
        "hiddenSize": 1024,
        "summary": ["frame-mean", "moment-mean"],
        "featureLength": 2048,
        "channelMix": "mean-float32",
        "resampler": "soxr-HQ",
    }


def feature_contract_digest(contract=None):
    payload = contract or feature_contract()
    encoded = json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def features_from_record(record):
    embedding = np.asarray(record.get("embedding"), dtype=np.float64)
    moments = np.asarray(record.get("moments"), dtype=np.float64)
    if embedding.shape != (1024,) or moments.shape != (3072,):
        raise ValueError("MusicFM record has an invalid feature shape")
    features = np.concatenate([embedding, moments[:1024]])
    if not np.all(np.isfinite(features)):
        raise ValueError("MusicFM record contains non-finite values")
    return features


def load_bundle(path):
    with Path(path).open("rb") as handle:
        bundle = pickle.load(handle)
    if bundle.get("version") != VERSION:
        raise ValueError("unsupported MusicFM reranker version")
    if bundle.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError("unsupported MusicFM reranker schema")
    contract = bundle.get("runtimeFeatureContract") or {}
    expected = feature_contract_digest(contract)
    if contract != feature_contract() or bundle.get("runtimeFeatureContractSha256") != expected:
        raise ValueError("MusicFM reranker feature contract differs from runtime")
    if bundle.get("pipeline") is None:
        raise ValueError("MusicFM reranker pipeline is missing")
    return bundle


def rerank(bundle, labels, scores, record):
    output = np.asarray(scores, dtype=np.float64).copy()
    details = {
        "enabled": True,
        "applied": False,
        "modelVersion": bundle.get("version", ""),
    }
    candidates = np.argsort(-output, kind="stable")[:3]
    candidate_labels = [labels[int(index)] for index in candidates]
    eligible = set(bundle.get("eligibleLabels") or [])
    if not set(candidate_labels).issubset(eligible):
        details.update({"reason": "top3-not-supported", "top3": candidate_labels})
        return output, details

    features = features_from_record(record).reshape(1, -1)
    model = bundle["pipeline"]
    raw = model.predict_proba(features)[0]
    classes = list(model.classes_)
    learned = np.asarray([
        raw[classes.index(label)] if label in classes else 0.0
        for label in candidate_labels
    ])
    learned /= max(float(np.sum(learned)), 1e-12)
    order = np.argsort(-learned, kind="stable")
    confidence = float(learned[order[0]])
    margin = confidence - float(learned[order[1]])
    config = bundle.get("config") or {}
    details.update({
        "reason": "below-threshold",
        "top3": candidate_labels,
        "confidence": round(confidence, 6),
        "margin": round(margin, 6),
    })
    if confidence < float(config.get("confidenceFloor", 1.0)):
        return output, details
    if margin < float(config.get("marginFloor", 0.0)):
        return output, details

    local = output[candidates]
    local /= max(float(np.sum(local)), 1e-12)
    weight = float(config.get("weight", 0.0))
    target = local * (1.0 - weight) + learned * weight
    before = candidates[np.argsort(-local, kind="stable")]
    after = candidates[np.argsort(-target, kind="stable")]
    if not np.array_equal(before, after):
        values = np.sort(output[candidates])[::-1]
        output[after] = values
        details["applied"] = True
    details["reason"] = "evaluated"
    return output, details
