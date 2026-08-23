"""Runtime adapter for the audio-only unknown80 rhythm pairwise candidate."""

from __future__ import annotations

import pickle
from pathlib import Path

import numpy as np


SCHEMA_VERSION = "mmfr.unknown80-rhythm-top3-pairwise.v1"


def normalize_scores(values):
    output = np.maximum(np.asarray(values, dtype=np.float64), 1e-12)
    return output / max(float(output.sum()), 1e-12)


def load_bundle(path):
    with Path(path).open("rb") as handle:
        bundle = pickle.load(handle)
    if bundle.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError("unknown80 rhythm reranker schema mismatch")
    if not bundle.get("models") or not bundle.get("members"):
        raise ValueError("unknown80 rhythm reranker is incomplete")
    return bundle


def rhythm_features(bundle, librosa_vector, member=None):
    vector = np.asarray(librosa_vector, dtype=np.float32).reshape(-1)
    expected = int(bundle.get("librosaVectorLength", 0))
    if vector.size != expected:
        raise ValueError(
            f"unknown80 rhythm vector length {vector.size} differs from {expected}"
        )
    member = member or {}
    indexes = np.asarray(
        member.get("featureIndexes", bundle["rhythmFeatureIndexes"]),
        dtype=np.int64,
    )
    selected = vector[indexes]
    normalization_mode = member.get(
        "normalizationMode", bundle.get("normalizationMode")
    )
    if normalization_mode == "identity":
        return selected
    median = np.asarray(
        member.get("robustScaleMedian", bundle["robustScaleMedian"]),
        dtype=np.float32,
    )
    scale = np.asarray(
        member.get("robustScaleIqr", bundle["robustScaleIqr"]),
        dtype=np.float32,
    )
    if selected.size != median.size or selected.size != scale.size:
        raise ValueError("unknown80 rhythm normalization contract mismatch")
    return np.clip((selected - median) / np.maximum(scale, 1e-6), -8.0, 8.0)


def rerank(bundle, labels, base_scores, librosa_vector):
    labels = list(labels)
    label_index = {label: index for index, label in enumerate(labels)}
    scores = normalize_scores(base_scores)
    top3 = np.argsort(-scores, kind="stable")[:3]
    utilities = np.log(np.maximum(scores, 1e-12))
    applied = []
    for member in bundle["members"]:
        pair = tuple(member.get("pair") or [])
        strength = float(member.get("strength", 0.0))
        model = bundle["models"].get(pair)
        if len(pair) != 2 or strength <= 0.0 or model is None:
            continue
        if any(label not in label_index for label in pair):
            continue
        first, second = (label_index[label] for label in pair)
        if first not in top3 or second not in top3:
            continue
        features = rhythm_features(
            bundle, librosa_vector, member
        ).reshape(1, -1)
        probabilities = model.predict_proba(features)[0]
        classes = list(model.classes_)
        learned = np.asarray([
            probabilities[classes.index(pair[0])],
            probabilities[classes.index(pair[1])],
        ], dtype=np.float64)
        current = normalize_scores(scores[[first, second]])
        target = normalize_scores(current * (1.0 - strength) + learned * strength)
        delta = np.log(np.maximum(target, 1e-12)) - np.log(np.maximum(current, 1e-12))
        utilities[first] += delta[0]
        utilities[second] += delta[1]
        applied.append({
            "pair": list(pair),
            "strength": strength,
            "learned": learned.tolist(),
        })
    output = scores.copy()
    original_values = np.sort(scores[top3])[::-1]
    order = top3[np.argsort(-utilities[top3], kind="stable")]
    output[order] = original_values
    before = labels[int(np.argmax(scores))]
    after = labels[int(np.argmax(output))]
    return output, {
        "applied": bool(applied),
        "changed": before != after,
        "before": before,
        "after": after,
        "top3SetPreserved": set(top3.tolist()) == set(np.argsort(-output)[:3].tolist()),
        "scoreMultisetPreserved": bool(np.allclose(np.sort(scores), np.sort(output))),
        "members": applied,
        "modelVersion": bundle.get("modelVersion", ""),
    }
