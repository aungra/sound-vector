#!/usr/bin/env python3
"""Export a source-isolated nonlinear Deep House/House stage after v110."""

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
OLD_EXPORT_PATH = Path(__file__).with_name("genre-unknown80-v108-track-pair-export.py")
PAIR_PATH = Path(__file__).with_name("genre-unknown80-v107-track-pair-screen.py")
SHARED_PATH = Path(__file__).with_name("genre-unknown80-v107-track-reranker-screen.py")
V110_EXPORT_PATH = Path(__file__).with_name("genre-unknown80-v110-extra-trees-export.py")
DEFAULT_V110_MODEL = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-track-pair-v110-candidate.pkl"
)
DEFAULT_MODEL = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-track-pair-v111-candidate.pkl"
)
DEFAULT_REPORT = TRAINING / "unknown80-v111-deep-house-export.json"
DEFAULT_MANIFEST = TRAINING / "unknown80-v111-track-pair-model-manifest.json"
PAIR = ("ディープ・ハウス", "ハウス")
VIEW = "rhythm"
CONFIG = {"weight": 0.1, "confidenceFloor": 0.7}
OUTER_SEED = 11101001
FINAL_SEED = 11109001


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


def fit_pair(items, seed):
    training = [item for item in items if item["actual"] in PAIR]
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


def apply_records(base, records, pair_module, labels):
    output = np.asarray(base, dtype=np.float64).copy()
    if not records:
        return output, np.zeros(0, dtype=bool)
    indexes = np.asarray([record["item"]["index"] for record in records], dtype=np.int64)
    probabilities = np.asarray([record["probabilities"] for record in records])
    candidate, changed = pair_module.apply_pair(
        output[indexes], probabilities, PAIR, labels, CONFIG,
    )
    output[indexes] = candidate
    return output, changed


def reconstruct_v110(screen, old_export, pair_module, shared, v110_export):
    black, payload, v109, held_sources, _baseline, _v107 = screen.reconstruct_v109(
        old_export, pair_module, shared, screen.DEFAULT_V109_REPORT,
    )
    labels = list(payload["labels"])
    items = v110_export.prepare_items(shared, payload, labels, v109)
    records = []
    for fold_index, held_source in enumerate(held_sources):
        training = [
            item for item in items
            if item["source"] != held_source and item["trainingEligible"]
        ]
        validation = pair_module.routed_items(
            [item for item in items if item["source"] == held_source],
            v110_export.PAIR,
        )
        model = v110_export.fit_extra_trees(
            training, v110_export.OUTER_SEED + fold_index * 100,
        )
        if model is None or not validation:
            continue
        probabilities = pair_module.pair_probabilities(
            model, validation, v110_export.PAIR,
        )
        records.extend(
            {"item": item, "probabilities": probability}
            for item, probability in zip(validation, probabilities)
        )
    v110, _changed = v110_export.apply_records(v109, records, pair_module, labels)
    metric = black.metric(payload["actual"], v110, labels, payload["sources"])
    expected = (60.33, 60.01, 31.58, 83.48)
    observed = tuple(metric[key] for key in (
        "top1Accuracy", "balancedTop1", "minimumSourceTop1", "top3Accuracy",
    ))
    if observed != expected:
        raise RuntimeError(f"v110 reconstruction mismatch: {observed} != {expected}")
    return black, payload, v110, held_sources, metric


def run(args):
    screen = load_module(SCREEN_PATH, "v111_screen")
    old_export = load_module(OLD_EXPORT_PATH, "v111_old_export")
    pair_module = load_module(PAIR_PATH, "v111_pair")
    shared = load_module(SHARED_PATH, "v111_shared")
    v110_export = load_module(V110_EXPORT_PATH, "v111_v110_export")
    black, payload, v110, held_sources, baseline = reconstruct_v110(
        screen, old_export, pair_module, shared, v110_export,
    )
    labels = list(payload["labels"])
    items = shared.load_cached_items(
        argparse.Namespace(cache=shared.DEFAULT_CACHE, view=VIEW), payload, labels,
    )
    for item in items:
        item["baseScores"] = np.asarray(v110[item["index"]], dtype=np.float64)
        order = np.argsort(-item["baseScores"], kind="stable")
        item["top2Labels"] = (labels[int(order[0])], labels[int(order[1])])
    overlay = old_export.load_overlay_items(
        old_export.DEFAULT_OVERLAY_CACHE, VIEW, shared,
    )
    all_items = [*items, *overlay]
    records = []
    folds = []
    for fold_index, held_source in enumerate(held_sources):
        training = [
            item for item in all_items
            if item["source"] != held_source and item["trainingEligible"]
        ]
        validation = pair_module.routed_items(
            [item for item in items if item["source"] == held_source], PAIR,
        )
        model = fit_pair(training, OUTER_SEED + fold_index * 100)
        if model is None or not validation:
            continue
        probabilities = pair_module.pair_probabilities(model, validation, PAIR)
        records.extend(
            {"item": item, "probabilities": probability}
            for item, probability in zip(validation, probabilities)
        )
        folds.append({
            "heldOutSource": str(held_source),
            "trainingRows": sum(item["actual"] in PAIR for item in training),
            "trainingOverlayRows": sum(item["actual"] in PAIR for item in overlay if item["source"] != held_source),
            "routedRows": len(validation),
        })
    source_output, changed = apply_records(v110, records, pair_module, labels)
    source_metric = black.compare_output(
        source_output, v110, payload["actual"], labels, payload["sources"],
    )
    final_training = [item for item in all_items if item["trainingEligible"]]
    final_model = fit_pair(final_training, FINAL_SEED)
    routed = pair_module.routed_items(items, PAIR)
    probabilities = pair_module.pair_probabilities(final_model, routed, PAIR)
    final_records = [
        {"item": item, "probabilities": probability}
        for item, probability in zip(routed, probabilities)
    ]
    final_output, final_changed = apply_records(v110, final_records, pair_module, labels)
    final_metric = black.compare_output(
        final_output, v110, payload["actual"], labels, payload["sources"],
    )
    source_support = {
        label: sorted({
            item["source"] for item in final_training if item["actual"] == label
        }) for label in PAIR
    }
    top3_preserved = all(
        set(left) == set(right) for left, right in zip(
            np.argsort(-v110, axis=1)[:, :3],
            np.argsort(-source_output, axis=1)[:, :3],
        )
    )
    passed = (
        source_metric["top1Accuracy"] > baseline["top1Accuracy"]
        and source_metric["balancedTop1"] >= baseline["balancedTop1"]
        and source_metric["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and source_metric["top3Accuracy"] >= baseline["top3Accuracy"]
        and source_metric["improved"] > 0 and source_metric["harmed"] == 0
        and final_metric["harmed"] == 0
        and all(len(values) >= 2 for values in source_support.values())
        and top3_preserved and final_model is not None
    )
    model_sha = None
    parity = None
    manifest_pairs = []
    if passed:
        with args.v110_model.open("rb") as handle:
            bundle = pickle.load(handle)
        bundle = {
            **bundle, "version": "unknown80-track-pair-v111-candidate",
            "pairs": [*bundle["pairs"], {
                "labels": list(PAIR), "view": VIEW, "config": CONFIG,
                "pipeline": final_model, "sourceSupport": source_support,
                "modelKind": "extra-trees", "stage": "v111-deep-house-house",
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
        parity = {"rows": len(sample), "maxAbsoluteProbabilityDelta": delta,
                  "tolerance": 1e-8, "passes": delta <= 1e-8}
        if not parity["passes"]:
            raise RuntimeError("v111 serialization parity failed")
        model_sha = sha256_file(args.model)
    generated_at = datetime.now(timezone.utc).isoformat()
    report = {
        "generatedAt": generated_at,
        "objective": "Add a source-isolated nonlinear Deep House/House stage after v110.",
        "policy": {"metadataUsedAtInference": False, "urlSpecificRulesUsed": False,
                   "sealedFinalHoldoutUsed": False, "overlayRowsEvaluated": False,
                   "matchingProviderExcludedFromOuterFold": True,
                   "top3CandidateSetChanged": not top3_preserved,
                   "productionModelUpdated": False},
        "dataset": {"oofRows": len(payload["actual"]), "cachedRows": len(items),
                    "trainingOnlyOverlayRows": len(overlay), "pair": list(PAIR),
                    "view": VIEW, "sourceSupport": source_support},
        "config": CONFIG, "folds": folds, "baseline": baseline,
        "sourceHeldout": source_metric, "sourceHeldoutChangedRows": int(np.sum(changed)),
        "finalFitDiagnostic": final_metric, "finalFitChangedRows": int(np.sum(final_changed)),
        "serializationParity": parity, "modelPath": str(args.model) if passed else None,
        "modelSha256": model_sha,
        "decision": "continue-v111-runtime-parity" if passed else "reject-v111-deep-house",
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    manifest = {
        "version": "unknown80-track-pair-v111-candidate", "schemaVersion": 1,
        "generatedAt": generated_at, "modelPath": report["modelPath"],
        "modelSha256": model_sha,
        "runtimeFeatureContractSha256": shared.feature_contract_digest(),
        "baseVersion": "unknown80-track-pair-v110-candidate",
        "pairs": manifest_pairs,
        "addedStage": {"labels": list(PAIR), "view": VIEW, "config": CONFIG,
                       "sourceSupport": source_support, "modelKind": "extra-trees"},
        "promotionState": "candidate-runtime-parity-pending" if passed else "rejected",
    }
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--v110-model", type=Path, default=DEFAULT_V110_MODEL)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()
    report = run(args)
    print(json.dumps({"baseline": report["baseline"],
                      "sourceHeldout": report["sourceHeldout"],
                      "finalFitDiagnostic": report["finalFitDiagnostic"],
                      "serializationParity": report["serializationParity"],
                      "modelPath": report["modelPath"], "modelSha256": report["modelSha256"],
                      "decision": report["decision"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
