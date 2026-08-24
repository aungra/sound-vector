#!/usr/bin/env python3
"""Export the source-safe nonlinear Punk/Rock stage on top of v109."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import pickle
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.pipeline import make_pipeline


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
SCREEN_PATH = Path(__file__).with_name("genre-unknown80-v110-panns-pair-screen.py")
EXPORT_PATH = Path(__file__).with_name("genre-unknown80-v108-track-pair-export.py")
PAIR_PATH = Path(__file__).with_name("genre-unknown80-v107-track-pair-screen.py")
SHARED_PATH = Path(__file__).with_name("genre-unknown80-v107-track-reranker-screen.py")
DEFAULT_V109_MODEL = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-track-pair-v109-candidate.pkl"
)
DEFAULT_MODEL = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-track-pair-v110-candidate.pkl"
)
DEFAULT_REPORT = TRAINING / "unknown80-v110-extra-trees-export.json"
DEFAULT_MANIFEST = TRAINING / "unknown80-v110-track-pair-model-manifest.json"
PAIR = ("パンク", "ロック")
VIEW = "effnet"
CONFIG = {"weight": 0.25, "confidenceFloor": 0.5}
OUTER_SEED = 9031001
FINAL_SEED = 9039001


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def pair_training_items(items):
    return [item for item in items if item["actual"] in PAIR]


def fit_extra_trees(items, seed):
    training = pair_training_items(items)
    if {item["actual"] for item in training} != set(PAIR):
        return None
    features = np.asarray([item["features"] for item in training], dtype=np.float64)
    targets = np.asarray([item["actual"] for item in training], dtype=object)
    counts = Counter((item["actual"], item["source"]) for item in training)
    weights = np.asarray([
        1.0 / counts[(item["actual"], item["source"])] for item in training
    ], dtype=np.float64)
    weights /= max(float(weights.mean()), 1e-12)
    model = make_pipeline(ExtraTreesClassifier(
        n_estimators=300, max_features="sqrt", min_samples_leaf=2,
        class_weight="balanced", n_jobs=-1, random_state=seed,
    ))
    model.fit(features, targets, extratreesclassifier__sample_weight=weights)
    return model


def prepare_items(shared, payload, labels, base_scores):
    items = shared.load_cached_items(
        argparse.Namespace(cache=shared.DEFAULT_CACHE, view=VIEW), payload, labels,
    )
    for item in items:
        item["baseScores"] = np.asarray(base_scores[item["index"]], dtype=np.float64)
        order = np.argsort(-item["baseScores"], kind="stable")
        item["top2Labels"] = (labels[int(order[0])], labels[int(order[1])])
    return items


def apply_records(base_scores, records, pair_module, labels):
    output = np.asarray(base_scores, dtype=np.float64).copy()
    if not records:
        return output, np.zeros(0, dtype=bool)
    indexes = np.asarray([record["item"]["index"] for record in records], dtype=np.int64)
    probabilities = np.asarray([record["probabilities"] for record in records])
    candidate, changed = pair_module.apply_pair(
        output[indexes], probabilities, PAIR, labels, CONFIG,
    )
    output[indexes] = candidate
    return output, changed


def run(args):
    screen = load_module(SCREEN_PATH, "v110_extra_screen")
    previous_export = load_module(EXPORT_PATH, "v110_extra_previous_export")
    pair_module = load_module(PAIR_PATH, "v110_extra_pair")
    shared = load_module(SHARED_PATH, "v110_extra_shared")
    black, payload, v109, held_sources, baseline, _v107 = screen.reconstruct_v109(
        previous_export, pair_module, shared, args.v109_report,
    )
    labels = list(payload["labels"])
    items = prepare_items(shared, payload, labels, v109)
    records = []
    folds = []
    for fold_index, held_source in enumerate(held_sources):
        training = [
            item for item in items
            if item["source"] != held_source and item["trainingEligible"]
        ]
        validation = pair_module.routed_items(
            [item for item in items if item["source"] == held_source], PAIR,
        )
        model = fit_extra_trees(training, OUTER_SEED + fold_index * 100)
        if model is None or not validation:
            continue
        probabilities = pair_module.pair_probabilities(model, validation, PAIR)
        records.extend(
            {"item": item, "probabilities": probability}
            for item, probability in zip(validation, probabilities)
        )
        folds.append({
            "heldOutSource": str(held_source),
            "trainingRows": len(pair_training_items(training)),
            "routedRows": len(validation),
        })
    source_output, changed = apply_records(v109, records, pair_module, labels)
    source_metric = black.compare_output(
        source_output, v109, payload["actual"], labels, payload["sources"],
    )
    final_training = [item for item in items if item["trainingEligible"]]
    final_model = fit_extra_trees(final_training, FINAL_SEED)
    routed = pair_module.routed_items(items, PAIR)
    final_records = []
    if final_model is not None and routed:
        probabilities = pair_module.pair_probabilities(final_model, routed, PAIR)
        final_records = [
            {"item": item, "probabilities": probability}
            for item, probability in zip(routed, probabilities)
        ]
    final_output, final_changed = apply_records(v109, final_records, pair_module, labels)
    final_metric = black.compare_output(
        final_output, v109, payload["actual"], labels, payload["sources"],
    )
    source_support = {
        label: sorted({
            item["source"] for item in final_training if item["actual"] == label
        }) for label in PAIR
    }
    source_support_passes = all(len(values) >= 2 for values in source_support.values())
    top3_preserved = all(
        set(left) == set(right) for left, right in zip(
            np.argsort(-v109, axis=1)[:, :3],
            np.argsort(-source_output, axis=1)[:, :3],
        )
    )
    passed = (
        source_metric["top1Accuracy"] > baseline["top1Accuracy"]
        and source_metric["balancedTop1"] >= baseline["balancedTop1"]
        and source_metric["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and source_metric["top3Accuracy"] >= baseline["top3Accuracy"]
        and source_metric["improved"] > source_metric["harmed"]
        and source_metric["harmed"] == 0
        and final_metric["top1Accuracy"] >= baseline["top1Accuracy"]
        and final_metric["harmed"] == 0
        and source_support_passes and top3_preserved and final_model is not None
    )
    model_sha = None
    parity = None
    manifest_pairs = []
    if passed:
        with args.v109_model.open("rb") as handle:
            bundle = pickle.load(handle)
        bundle = {
            **bundle,
            "version": "unknown80-track-pair-v110-candidate",
            "pairs": [*bundle["pairs"], {
                "labels": list(PAIR), "view": VIEW, "config": CONFIG,
                "pipeline": final_model, "sourceSupport": source_support,
                "modelKind": "extra-trees", "stage": "v110-nonlinear-punk-rock",
            }],
        }
        manifest_pairs = [{
            "labels": item["labels"], "view": item["view"],
            "config": item["config"], "sourceSupport": item["sourceSupport"],
            **({"modelKind": item["modelKind"]} if item.get("modelKind") else {}),
            **({"stage": item["stage"]} if item.get("stage") else {}),
        } for item in bundle["pairs"]]
        args.model.parent.mkdir(parents=True, exist_ok=True)
        with args.model.open("wb") as handle:
            pickle.dump(bundle, handle)
        with args.model.open("rb") as handle:
            restored = pickle.load(handle)
        sample = np.asarray([item["features"] for item in final_training[:24]])
        left = bundle["pairs"][-1]["pipeline"].predict_proba(sample)
        right = restored["pairs"][-1]["pipeline"].predict_proba(sample)
        delta = float(np.max(np.abs(left - right))) if len(sample) else 0.0
        parity = {
            "rows": len(sample), "maxAbsoluteProbabilityDelta": delta,
            "tolerance": 1e-8, "passes": delta <= 1e-8,
        }
        if not parity["passes"]:
            raise RuntimeError("v110 serialization parity failed")
        model_sha = sha256_file(args.model)
    generated_at = datetime.now(timezone.utc).isoformat()
    report = {
        "generatedAt": generated_at,
        "objective": "Add a nonlinear production-input Punk/Rock stage after fixed v109.",
        "policy": {
            "metadataUsedAtInference": False, "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "matchingProviderExcludedFromOuterFold": True,
            "singleGlobalConfig": True, "top3CandidateSetChanged": not top3_preserved,
            "productionModelUpdated": False,
        },
        "dataset": {
            "oofRows": len(payload["actual"]), "cachedRows": len(items),
            "pair": list(PAIR), "view": VIEW, "sourceSupport": source_support,
        },
        "config": CONFIG, "folds": folds,
        "baseline": baseline, "sourceHeldout": source_metric,
        "sourceHeldoutChangedRows": int(np.sum(changed)),
        "finalFitDiagnostic": final_metric,
        "finalFitChangedRows": int(np.sum(final_changed)),
        "serializationParity": parity,
        "modelPath": str(args.model) if passed else None,
        "modelSha256": model_sha,
        "decision": "continue-v110-runtime-parity" if passed else "reject-v110-extra-trees",
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    manifest = {
        "version": "unknown80-track-pair-v110-candidate", "schemaVersion": 1,
        "generatedAt": generated_at, "modelPath": report["modelPath"],
        "modelSha256": model_sha,
        "runtimeFeatureContractSha256": shared.feature_contract_digest(),
        "baseVersion": "unknown80-track-pair-v109-candidate",
        "pairs": manifest_pairs,
        "addedStage": {
            "labels": list(PAIR), "view": VIEW, "config": CONFIG,
            "sourceSupport": source_support, "modelKind": "extra-trees",
        },
        "promotionState": "candidate-runtime-parity-pending" if passed else "rejected",
    }
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--v109-report", type=Path, default=TRAINING / "unknown80-v109-track-pair-export.json")
    parser.add_argument("--v109-model", type=Path, default=DEFAULT_V109_MODEL)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()
    report = run(args)
    print(json.dumps({
        "baseline": report["baseline"], "sourceHeldout": report["sourceHeldout"],
        "finalFitDiagnostic": report["finalFitDiagnostic"],
        "serializationParity": report["serializationParity"],
        "modelPath": report["modelPath"], "modelSha256": report["modelSha256"],
        "decision": report["decision"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
