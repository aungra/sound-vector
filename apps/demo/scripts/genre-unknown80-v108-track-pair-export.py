#!/usr/bin/env python3
"""Export globally reproducible temporal pair models after v107 OOF selection."""

from __future__ import annotations

import argparse
import importlib.util
import json
import pickle
import sqlite3
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
PAIR_PATH = Path(__file__).with_name("genre-unknown80-v107-track-pair-screen.py")
SHARED_PATH = Path(__file__).with_name("genre-unknown80-v107-track-reranker-screen.py")
CACHE_MODULE_PATH = Path(__file__).with_name("genre-track-segment-cache.py")
DEFAULT_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "runtime-track-segment-features-v3_0.sqlite3"
)
DEFAULT_SELECTION = TRAINING / "unknown80-v107-track-pair-multiview-screen.json"
DEFAULT_OVERLAY_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "runtime-track-segment-electronic-overlay-v3_0.sqlite3"
)
DEFAULT_MODEL = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-track-pair-v108-candidate.pkl"
)
DEFAULT_REPORT = TRAINING / "unknown80-v108-track-pair-export.json"
DEFAULT_MANIFEST = TRAINING / "unknown80-v108-track-pair-model-manifest.json"


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def selected_pairs(path):
    report = json.loads(path.read_text())
    if report.get("decision") != "continue-v108-production-gates":
        raise RuntimeError("multiview selection did not pass the v108 continuation gate")
    return [
        (tuple(item["pair"].split(" / ", 1)), item["selectedView"])
        for item in report.get("selection", []) if item.get("selectedView")
    ]


def load_overlay_items(path, view, shared):
    if not path or not path.is_file():
        return []
    cache = load_module(CACHE_MODULE_PATH, f"v108_export_overlay_cache_{view}")
    connection = sqlite3.connect(path)
    items = []
    for source_key, label, source in connection.execute(
        "SELECT source_key,label,source FROM tracks ORDER BY source_key"
    ):
        segments = cache.read_cached_segments(connection, source_key)
        if len(segments) != 4:
            continue
        items.append({
            "index": None,
            "sourceKey": source_key,
            "actual": str(label),
            "source": str(source),
            "trainingEligible": True,
            "evaluationEligible": False,
            "features": shared.raw_temporal_features(
                [segment["vectors"] for segment in segments], view,
            ),
        })
    connection.close()
    return items


def crossfit_probabilities(items, pair, labels, held_sources, pair_module, seed):
    records = []
    folds = []
    for fold_index, held_source in enumerate(held_sources):
        train = [
            item for item in items
            if item["source"] != held_source and item["trainingEligible"]
        ]
        validation = pair_module.routed_items(
            [
                item for item in items
                if item["source"] == held_source and item["evaluationEligible"]
            ], pair,
        )
        model = pair_module.fit_pair(train, pair, seed + fold_index * 100)
        if model is None or not validation:
            continue
        probabilities = pair_module.pair_probabilities(model, validation, pair)
        records.extend(
            {"item": item, "probabilities": probability}
            for item, probability in zip(validation, probabilities)
        )
        folds.append({
            "heldOutSource": str(held_source),
            "trainingRows": len(pair_module.pair_training_items(train, pair)),
            "evaluationRows": len(validation),
        })
    return records, folds


def select_global_config(records, pair, labels, v107, payload, baseline, black, pair_module):
    ranking = []
    for weight in pair_module.WEIGHTS:
        for confidence in pair_module.CONFIDENCE_FLOORS:
            config = {"weight": weight, "confidenceFloor": confidence}
            output = np.asarray(v107, dtype=np.float64).copy()
            if records:
                indexes = np.asarray([record["item"]["index"] for record in records], dtype=np.int64)
                base = output[indexes]
                probabilities = np.asarray([record["probabilities"] for record in records])
                candidate, changed = pair_module.apply_pair(
                    base, probabilities, pair, labels, config,
                )
                output[indexes] = candidate
            else:
                changed = np.zeros(0, dtype=bool)
            metric = black.compare_output(
                output, v107, payload["actual"], labels, payload["sources"],
            )
            passed = (
                metric["top1Accuracy"] > baseline["top1Accuracy"]
                and metric["balancedTop1"] >= baseline["balancedTop1"]
                and metric["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
                and metric["top3Accuracy"] >= baseline["top3Accuracy"]
                and metric["improved"] > metric["harmed"]
            )
            ranking.append({
                "config": config, "metric": metric,
                "changedRows": int(np.sum(changed)), "passed": passed,
                "output": output,
            })
    ranking.sort(key=lambda item: (
        item["passed"], item["metric"]["top1Accuracy"],
        item["metric"]["balancedTop1"],
        item["metric"]["improved"] - item["metric"]["harmed"],
        item["metric"]["minimumSourceTop1"], -item["changedRows"],
    ), reverse=True)
    return ranking[0], ranking


def sha256_file(path):
    import hashlib
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(args):
    shared = load_module(SHARED_PATH, "v108_export_shared")
    pair_module = load_module(PAIR_PATH, "v108_export_pair")
    _source, black, payload, v107, held_sources, baseline = shared.build_v107()
    labels = list(payload["labels"])
    selections = selected_pairs(args.selection)
    output = np.asarray(v107, dtype=np.float64).copy()
    used_indexes = set()
    exported_pairs = []
    details = []
    all_items = {}
    for pair_index, (pair, view) in enumerate(selections):
        view_args = argparse.Namespace(cache=args.cache, view=view)
        items = shared.load_cached_items(view_args, payload, labels)
        for item in items:
            item["evaluationEligible"] = True
        items.extend(load_overlay_items(args.overlay_cache, view, shared))
        all_items[view] = items
        for item in items:
            if not item["evaluationEligible"]:
                continue
            item["baseScores"] = np.asarray(v107[item["index"]], dtype=np.float64)
            order = np.argsort(-item["baseScores"], kind="stable")
            item["top2Labels"] = (labels[int(order[0])], labels[int(order[1])])
        records, folds = crossfit_probabilities(
            items, pair, labels, held_sources, pair_module,
            3301001 + pair_index * 10000,
        )
        selected, ranking = select_global_config(
            records, pair, labels, v107, payload, baseline, black, pair_module,
        )
        training = [item for item in items if item["trainingEligible"]]
        source_support = {
            label: sorted({item["source"] for item in training if item["actual"] == label})
            for label in pair
        }
        source_support_passes = all(len(sources) >= 2 for sources in source_support.values())
        if not selected["passed"]:
            details.append({
                "pair": pair_module.pair_name(pair), "view": view,
                "decision": "reject-no-global-config", "folds": folds,
                "best": {key: value for key, value in selected.items() if key != "output"},
                "sourceSupport": source_support,
            })
            continue
        if not source_support_passes:
            details.append({
                "pair": pair_module.pair_name(pair), "view": view,
                "decision": "reject-insufficient-independent-source-support",
                "folds": folds, "sourceSupport": source_support,
                "requiredSourcesPerLabel": 2,
            })
            continue
        changed = set(np.flatnonzero(
            np.argmax(selected["output"], axis=1) != np.argmax(v107, axis=1)
        ))
        conflicts = changed & used_indexes
        accepted = changed - conflicts
        if accepted:
            indexes = np.asarray(sorted(accepted), dtype=np.int64)
            output[indexes] = selected["output"][indexes]
            used_indexes.update(accepted)
        model = pair_module.fit_pair(
            training, pair, 3309001 + pair_index * 10000,
        )
        if model is None:
            raise RuntimeError(f"final pair model could not fit: {pair}")
        exported_pairs.append({
            "labels": list(pair), "view": view,
            "config": selected["config"], "pipeline": model,
            "sourceSupport": source_support,
        })
        details.append({
            "pair": pair_module.pair_name(pair), "view": view,
            "decision": "export", "folds": folds,
            "globalConfig": selected["config"],
            "sourceHeldoutMetric": selected["metric"],
            "changedRows": len(accepted), "conflicts": len(conflicts),
            "sourceSupport": source_support,
            "candidateCount": len(ranking),
        })
    candidate = black.compare_output(
        output, v107, payload["actual"], labels, payload["sources"],
    )
    passed = (
        bool(exported_pairs)
        and candidate["top1Accuracy"] > baseline["top1Accuracy"]
        and candidate["balancedTop1"] >= baseline["balancedTop1"]
        and candidate["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and candidate["top3Accuracy"] >= baseline["top3Accuracy"]
        and candidate["improved"] >= candidate["harmed"]
    )
    bundle = {
        "version": "unknown80-track-pair-v108-candidate",
        "schemaVersion": 1,
        "runtimeFeatureContractSha256": shared.feature_contract_digest(),
        "labels": labels,
        "pairs": exported_pairs,
        "metadataUsed": False,
        "sealedFinalHoldoutUsed": False,
    }
    parity = None
    if passed:
        args.model.parent.mkdir(parents=True, exist_ok=True)
        with args.model.open("wb") as handle:
            pickle.dump(bundle, handle)
        with args.model.open("rb") as handle:
            restored = pickle.load(handle)
        maximum_delta = 0.0
        rows = 0
        for before, after in zip(bundle["pairs"], restored["pairs"]):
            sample = [
                item for item in all_items[before["view"]]
                if item["actual"] in before["labels"]
            ][:12]
            if not sample:
                continue
            values = np.asarray([item["features"] for item in sample])
            left = before["pipeline"].predict_proba(values)
            right = after["pipeline"].predict_proba(values)
            maximum_delta = max(maximum_delta, float(np.max(np.abs(left - right))))
            rows += len(sample)
        parity = {
            "rows": rows, "maxAbsoluteProbabilityDelta": maximum_delta,
            "tolerance": 1e-8, "passes": maximum_delta <= 1e-8,
        }
        if not parity["passes"]:
            raise RuntimeError("v108 serialization parity failed")
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "objective": "Export reproducible production-form temporal pair candidates.",
        "policy": {
            "metadataUsedAtInference": False,
            "sealedFinalHoldoutUsed": False,
            "matchingProviderExcludedFromOuterFold": True,
            "singleGlobalConfigPerPair": True,
            "productionModelUpdated": False,
        },
        "dataset": {
            "oofRows": len(payload["actual"]),
            "cachedRows": max((len(items) for items in all_items.values()), default=0),
            "selectedPairs": len(selections), "exportedPairs": len(exported_pairs),
        },
        "baseline": baseline, "candidate": candidate,
        "details": details, "serializationParity": parity,
        "modelPath": str(args.model) if passed else None,
        "modelSha256": sha256_file(args.model) if passed else None,
        "decision": "continue-runtime-parity-gate" if passed else "reject-v108-export",
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    manifest = {
        "version": bundle["version"],
        "schemaVersion": bundle["schemaVersion"],
        "generatedAt": report["generatedAt"],
        "modelPath": report["modelPath"], "modelSha256": report["modelSha256"],
        "runtimeFeatureContractSha256": bundle["runtimeFeatureContractSha256"],
        "pairs": [
            {
                "labels": item["labels"], "view": item["view"],
                "config": item["config"], "sourceSupport": item["sourceSupport"],
            }
            for item in exported_pairs
        ],
        "promotionState": "candidate-runtime-parity-pending" if passed else "rejected",
    }
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--selection", type=Path, default=DEFAULT_SELECTION)
    parser.add_argument("--overlay-cache", type=Path, default=DEFAULT_OVERLAY_CACHE)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()
    report = run(args)
    print(json.dumps({
        "baseline": report["baseline"], "candidate": report["candidate"],
        "serializationParity": report["serializationParity"],
        "modelPath": report["modelPath"], "modelSha256": report["modelSha256"],
        "decision": report["decision"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
