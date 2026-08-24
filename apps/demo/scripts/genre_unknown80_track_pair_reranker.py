"""Runtime support for source-heldout four-segment pair rerankers."""

from __future__ import annotations

import pickle
from pathlib import Path

import numpy as np

from genre_track_feature_contract import feature_contract_digest


SUPPORTED_VIEWS = {"effnet", "full", "librosa", "rhythm"}


def raw_temporal_features(segment_vectors, view="full"):
    """Match the production-agnostic feature view used during training."""
    if view == "effnet":
        matrix = np.asarray([
            np.asarray(vectors["effnet_tail"], dtype=np.float64)
            for vectors in segment_vectors
        ])
    elif view in {"librosa", "rhythm"}:
        matrix = np.asarray([
            np.asarray(vectors["librosa"], dtype=np.float64)
            for vectors in segment_vectors
        ])
        if view == "rhythm":
            indexes = np.asarray([*range(0, 7), *range(397, 547)], dtype=np.int64)
            matrix = matrix[:, indexes]
    elif view == "full":
        matrix = np.asarray([
            np.concatenate([
                np.asarray(vectors["effnet_tail"], dtype=np.float64),
                np.asarray(vectors["librosa"], dtype=np.float64),
            ])
            for vectors in segment_vectors
        ])
    else:
        raise ValueError(f"unsupported temporal feature view: {view}")
    if matrix.shape[0] != 4:
        raise ValueError("raw temporal contract requires exactly four segments")
    transitions = np.diff(matrix, axis=0)
    return np.concatenate([
        np.mean(matrix, axis=0),
        np.std(matrix, axis=0),
        np.median(matrix, axis=0),
        np.ptp(matrix, axis=0),
        np.mean(np.abs(transitions), axis=0),
    ])


def load_bundle(path):
    with Path(path).open("rb") as handle:
        bundle = pickle.load(handle)
    if bundle.get("version") not in {
        "unknown80-track-pair-v108-candidate",
        "unknown80-track-pair-v109-candidate",
        "unknown80-track-pair-v110-candidate",
        "unknown80-track-pair-v111-candidate",
    }:
        raise ValueError("unsupported temporal pair model version")
    if bundle.get("schemaVersion") != 1:
        raise ValueError("unsupported temporal pair schema version")
    if bundle.get("runtimeFeatureContractSha256") != feature_contract_digest():
        raise ValueError("temporal pair feature contract differs from runtime")
    labels = bundle.get("labels") or []
    for item in bundle.get("pairs") or []:
        pair = item.get("labels") or []
        if len(pair) != 2 or any(label not in labels for label in pair):
            raise ValueError("temporal pair labels are invalid")
        if item.get("view") not in SUPPORTED_VIEWS:
            raise ValueError("temporal pair view is invalid")
        if item.get("pipeline") is None:
            raise ValueError("temporal pair pipeline is missing")
    return bundle


def rerank(bundle, labels, scores, segment_vectors):
    output = np.asarray(scores, dtype=np.float64).copy()
    details = {
        "enabled": True,
        "applied": False,
        "modelVersion": bundle.get("version", ""),
        "evaluatedPairs": [],
    }
    if len(segment_vectors) != 4:
        details["reason"] = "requires-four-segments"
        return output, details
    features_by_view = {}
    for item in bundle.get("pairs") or []:
        pair = list(item["labels"])
        if any(label not in labels for label in pair):
            details["evaluatedPairs"].append({
                "labels": pair, "view": item["view"],
                "confidence": None, "applied": False,
                "reason": "pair-label-missing",
            })
            continue
        order = np.argsort(-output, kind="stable")[:2]
        if {labels[int(index)] for index in order} != set(pair):
            continue
        view = item["view"]
        if view not in features_by_view:
            features_by_view[view] = raw_temporal_features(segment_vectors, view)
        model = item["pipeline"]
        raw = model.predict_proba(features_by_view[view].reshape(1, -1))[0]
        classes = list(model[-1].classes_)
        learned = np.asarray([raw[classes.index(label)] for label in pair])
        config = item.get("config") or {}
        confidence = float(np.max(learned))
        applied = False
        if confidence >= float(config.get("confidenceFloor", 1.0)):
            indexes = np.asarray([labels.index(label) for label in pair], dtype=np.int64)
            local = output[indexes]
            local = local / max(float(np.sum(local)), 1e-12)
            weight = float(config.get("weight", 0.0))
            target = local * (1.0 - weight) + learned * weight
            before = indexes[int(np.argmax(local))]
            after = indexes[int(np.argmax(target))]
            if before != after:
                values = np.sort(output[indexes])[::-1]
                ranked = indexes[np.argsort(-target, kind="stable")]
                output[ranked] = values
                applied = True
                details["applied"] = True
        details["evaluatedPairs"].append({
            "labels": pair,
            "view": view,
            "confidence": round(confidence, 6),
            "applied": applied,
        })
    details["reason"] = "evaluated" if details["evaluatedPairs"] else "top2-not-routed"
    return output, details
