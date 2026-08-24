#!/usr/bin/env python3
"""Audit the exported v108 bundle through the exact runtime helper."""

from __future__ import annotations

import argparse
import importlib.util
import json
import pickle
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
SHARED_PATH = Path(__file__).with_name("genre-unknown80-v107-track-reranker-screen.py")
RUNTIME_PATH = Path(__file__).with_name("genre_unknown80_track_pair_reranker.py")
CACHE_PATH = Path(__file__).with_name("genre-track-segment-cache.py")
DEFAULT_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "runtime-track-segment-features-v3_0.sqlite3"
)
DEFAULT_MODEL = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-track-pair-v108-candidate.pkl"
)
DEFAULT_REPORT = TRAINING / "unknown80-v108-runtime-parity.json"


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def run(args):
    shared = load_module(SHARED_PATH, "v108_runtime_parity_shared")
    runtime = load_module(RUNTIME_PATH, "v108_runtime_parity_runtime")
    cache = load_module(CACHE_PATH, "v108_runtime_parity_cache")
    _source, black, payload, v107, _held_sources, baseline = shared.build_v107()
    labels = list(payload["labels"])
    source_indexes = {str(key): index for index, key in enumerate(payload["sourceKeys"])}
    bundle = runtime.load_bundle(args.model)
    connection = sqlite3.connect(args.cache)
    output = np.asarray(v107, dtype=np.float64).copy()
    maximum_feature_delta = 0.0
    routed = 0
    applied = 0
    rows = 0
    pair_counts = {}
    changes = []
    for (source_key,) in connection.execute("SELECT source_key FROM tracks ORDER BY source_key"):
        if source_key not in source_indexes:
            continue
        segments = cache.read_cached_segments(connection, source_key)
        if len(segments) != 4:
            continue
        vectors = [segment["vectors"] for segment in segments]
        for view in {item["view"] for item in bundle["pairs"]}:
            expected = shared.raw_temporal_features(vectors, view)
            actual = runtime.raw_temporal_features(vectors, view)
            maximum_feature_delta = max(
                maximum_feature_delta,
                float(np.max(np.abs(expected - actual))),
            )
        index = source_indexes[source_key]
        before_label = labels[int(np.argmax(output[index]))]
        scores, details = runtime.rerank(bundle, labels, output[index], vectors)
        after_label = labels[int(np.argmax(scores))]
        output[index] = scores
        rows += 1
        if details["evaluatedPairs"]:
            routed += 1
        if details["applied"]:
            applied += 1
            changes.append({
                "sourceKey": source_key,
                "source": str(payload["sources"][index]),
                "actual": str(payload["actual"][index]),
                "before": before_label,
                "after": after_label,
            })
        for item in details["evaluatedPairs"]:
            name = " / ".join(item["labels"])
            entry = pair_counts.setdefault(name, {"routed": 0, "applied": 0})
            entry["routed"] += 1
            entry["applied"] += int(item["applied"])
    connection.close()
    diagnostic = black.compare_output(
        output, v107, payload["actual"], labels, payload["sources"],
    )
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "objective": f"Verify {bundle['version']} runtime parity and bound final-fit behavior.",
        "policy": {
            "diagnosticOnly": True,
            "inSampleResultIsNotUnknownSourceAccuracy": True,
            "productionModelUpdated": False,
            "sealedFinalHoldoutUsed": False,
        },
        "baseline": baseline,
        "cachedRows": rows,
        "routedRows": routed,
        "appliedRows": applied,
        "pairCounts": pair_counts,
        "changes": changes,
        "maximumTrainingRuntimeFeatureDelta": maximum_feature_delta,
        "featureParityPasses": maximum_feature_delta <= 1e-12,
        "finalFitDiagnostic": diagnostic,
        "decision": (
            "continue-production-regression-gate"
            if maximum_feature_delta <= 1e-12 and diagnostic["harmed"] == 0
            else "reject-v108-runtime"
        ),
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    report = run(args)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
