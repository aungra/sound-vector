#!/usr/bin/env python3
"""Screen v112 Top3 residual boundaries with source-isolated track features."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.ensemble import ExtraTreesClassifier


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
SCRIPT_DIR = Path(__file__).parent
V112_PATH = SCRIPT_DIR / "genre-unknown80-v112-top3-trance-export.py"
SCREEN_PATH = SCRIPT_DIR / "genre-unknown80-v110-panns-pair-screen.py"
OLD_EXPORT_PATH = SCRIPT_DIR / "genre-unknown80-v108-track-pair-export.py"
PAIR_PATH = SCRIPT_DIR / "genre-unknown80-v107-track-pair-screen.py"
SHARED_PATH = SCRIPT_DIR / "genre-unknown80-v107-track-reranker-screen.py"
V110_PATH = SCRIPT_DIR / "genre-unknown80-v110-extra-trees-export.py"
V111_PATH = SCRIPT_DIR / "genre-unknown80-v111-deep-house-export.py"
DEFAULT_REPORT = TRAINING / "unknown80-v112-residual-top3-screen.json"
DEFAULT_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "runtime-track-segment-features-v3_0.sqlite3"
)
ELECTRONIC_OVERLAY = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "runtime-track-segment-electronic-overlay-v3_0.sqlite3"
)
BLACK_OVERLAY = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "runtime-track-segment-blackmusic-overlay-v3_0.sqlite3"
)
TEXTURE_OVERLAY = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "runtime-track-segment-texture-overlay-v3_0.sqlite3"
)
PAIRS = (
    ("ディープ・ハウス", "ハウス"),
    ("ハウス", "テクノ"),
    ("ダブ", "レゲエ"),
    ("テクノ", "トランス"),
    ("メタル", "ロック"),
    ("ディープ・ハウス", "テクノ"),
    ("ドローン", "ノイズミュージック"),
    ("ハードコア", "メタル"),
    ("クラシック音楽", "オペラ"),
    ("アンビエント", "ドローン"),
)
VIEWS = ("rhythm", "effnet", "librosa", "full")
MODEL_KINDS = ("extra-trees", "logistic")
WEIGHTS = (0.1, 0.25, 0.5, 0.75)
CONFIDENCE_FLOORS = (0.5, 0.6, 0.7, 0.8, 0.9)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def fit_pair(items, pair, kind, seed, pair_module):
    training = [item for item in items if item["actual"] in pair]
    if {item["actual"] for item in training} != set(pair):
        return None
    if kind == "logistic":
        return pair_module.fit_pair(training, pair, seed)
    features = np.asarray([item["features"] for item in training], dtype=np.float64)
    targets = np.asarray([item["actual"] for item in training], dtype=object)
    counts = Counter((item["actual"], item["source"]) for item in training)
    weights = np.asarray([
        1.0 / counts[(item["actual"], item["source"])] for item in training
    ], dtype=np.float64)
    weights /= max(float(weights.mean()), 1e-12)
    model = ExtraTreesClassifier(
        n_estimators=300, max_features="sqrt", min_samples_leaf=2,
        class_weight="balanced", n_jobs=-1, random_state=seed,
    )
    model.fit(features, targets, sample_weight=weights)
    return model


def probabilities(model, items, pair):
    raw = model.predict_proba(np.asarray([item["features"] for item in items]))
    classes = list(model.classes_ if hasattr(model, "classes_") else model[-1].classes_)
    return np.asarray([
        [row[classes.index(label)] for label in pair] for row in raw
    ], dtype=np.float64)


def routed(items, pair):
    target = set(pair)
    return [item for item in items if target.issubset(set(item["top3Labels"]))]


def append_overlay(items, path, view, old_export, shared):
    if path.is_file():
        items.extend(old_export.load_overlay_items(path, view, shared))


def deduplicate(items):
    output = {}
    for item in items:
        output.setdefault(item["sourceKey"], item)
    return list(output.values())


def metric_summary(metric):
    return {
        key: metric[key] for key in (
            "top1Accuracy", "balancedTop1", "minimumSourceTop1",
            "top3Accuracy", "changedTop1", "improved", "harmed",
        ) if key in metric
    }


def result_summary(item, include_support=False):
    output = {
        "pair": item["pair"], "view": item["view"],
        "modelKind": item["modelKind"], "seed": item["seed"],
        "finalSeed": item["finalSeed"],
        "config": item["best"]["config"],
        "sourceHeldout": metric_summary(item["best"]["metric"]),
        "sourceHeldoutChangedRows": item["best"]["changedRows"],
        "passed": item["best"]["passed"],
        "finalFitDiagnostic": metric_summary(item["finalFitDiagnostic"]),
        "finalFitChangedRows": item["finalFitChangedRows"],
        "finalFitPasses": item["finalFitPasses"],
    }
    if include_support:
        output["sourceSupport"] = item["sourceSupport"]
        output["folds"] = item["folds"]
    return output


def reconstruct_v112(modules):
    v112, screen, old_export, pair_module, shared, v110, v111 = modules
    black, payload, base, held_sources, _metric = v112.reconstruct_v111(
        screen, old_export, pair_module, shared, v110, v111,
    )
    labels = list(payload["labels"])
    items = shared.load_cached_items(
        argparse.Namespace(cache=shared.DEFAULT_CACHE, view=v112.VIEW), payload, labels,
    )
    for item in items:
        item["baseScores"] = np.asarray(base[item["index"]], dtype=np.float64)
    overlay = old_export.load_overlay_items(
        old_export.DEFAULT_OVERLAY_CACHE, v112.VIEW, shared,
    )
    records = []
    for fold_index, held_source in enumerate(held_sources):
        training = [
            item for item in [*items, *overlay]
            if item["source"] != held_source and item["trainingEligible"]
        ]
        validation = v112.routed_top3(
            [item for item in items if item["source"] == held_source], labels, base,
        )
        model = v112.fit_pair(training, v112.OUTER_SEED + fold_index * 100)
        if model is None or not validation:
            continue
        learned = pair_module.pair_probabilities(model, validation, v112.PAIR)
        records.extend(
            {"item": item, "probabilities": score}
            for item, score in zip(validation, learned)
        )
    output, _changed = v112.apply_records(base, records, pair_module, labels)
    metric = black.metric(payload["actual"], output, labels, payload["sources"])
    expected = (60.49, 60.1, 31.58, 83.48)
    observed = tuple(metric[key] for key in (
        "top1Accuracy", "balancedTop1", "minimumSourceTop1", "top3Accuracy",
    ))
    if observed != expected:
        raise RuntimeError(f"v112 reconstruction mismatch: {observed} != {expected}")
    return black, payload, output, held_sources, metric


def apply_records(base, records, pair, labels, config, pair_module):
    output = np.asarray(base, dtype=np.float64).copy()
    if not records:
        return output, np.zeros(0, dtype=bool)
    indexes = np.asarray([record["item"]["index"] for record in records], dtype=np.int64)
    learned = np.asarray([record["probabilities"] for record in records])
    candidate, changed = pair_module.apply_pair(
        output[indexes], learned, pair, labels, config,
    )
    output[indexes] = candidate
    return output, changed


def screen_candidate(
    items, pair, view, kind, labels, held_sources, base, baseline,
    black, payload, pair_module, seed,
):
    records = []
    folds = []
    for fold_index, held_source in enumerate(held_sources):
        training = [
            item for item in items
            if item["source"] != held_source and item["trainingEligible"]
        ]
        validation = routed([
            item for item in items
            if item.get("evaluationEligible") and item["source"] == held_source
        ], pair)
        model = fit_pair(training, pair, kind, seed + fold_index * 100, pair_module)
        if model is None or not validation:
            continue
        learned = probabilities(model, validation, pair)
        records.extend(
            {"item": item, "probabilities": score}
            for item, score in zip(validation, learned)
        )
        folds.append({
            "heldOutSource": str(held_source),
            "trainingRows": sum(item["actual"] in pair for item in training),
            "routedRows": len(validation),
        })
    ranking = []
    for weight in WEIGHTS:
        for confidence in CONFIDENCE_FLOORS:
            config = {
                "weight": weight, "confidenceFloor": confidence, "routeTopK": 3,
            }
            output, changed = apply_records(
                base, records, pair, labels, config, pair_module,
            )
            metric = black.compare_output(
                output, base, payload["actual"], labels, payload["sources"],
            )
            passed = (
                metric["top1Accuracy"] > baseline["top1Accuracy"]
                and metric["balancedTop1"] >= baseline["balancedTop1"]
                and metric["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
                and metric["top3Accuracy"] >= baseline["top3Accuracy"]
                and metric["improved"] > 0 and metric["harmed"] == 0
            )
            ranking.append({
                "config": config, "metric": metric,
                "changedRows": int(np.sum(changed)), "passed": passed,
            })
    ranking.sort(key=lambda item: (
        item["passed"], item["metric"]["top1Accuracy"],
        item["metric"]["balancedTop1"], item["metric"]["improved"],
        -item["changedRows"],
    ), reverse=True)
    source_support = {
        label: sorted({
            item["source"] for item in items
            if item["trainingEligible"] and item["actual"] == label
        }) for label in pair
    }
    best = ranking[0]
    source_support_passes = all(
        len(sources) >= 2 for sources in source_support.values()
    )
    final_training = [item for item in items if item["trainingEligible"]]
    final_validation = routed([
        item for item in items if item.get("evaluationEligible")
    ], pair)
    final_model = fit_pair(
        final_training, pair, kind, seed + 9000, pair_module,
    )
    final_records = []
    if final_model is not None and final_validation:
        learned = probabilities(final_model, final_validation, pair)
        final_records = [
            {"item": item, "probabilities": score}
            for item, score in zip(final_validation, learned)
        ]
    final_output, final_changed = apply_records(
        base, final_records, pair, labels, best["config"], pair_module,
    )
    final_metric = black.compare_output(
        final_output, base, payload["actual"], labels, payload["sources"],
    )
    final_passes = (
        final_metric["top1Accuracy"] >= best["metric"]["top1Accuracy"]
        and final_metric["balancedTop1"] >= baseline["balancedTop1"]
        and final_metric["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and final_metric["top3Accuracy"] >= baseline["top3Accuracy"]
        and final_metric["improved"] > 0 and final_metric["harmed"] == 0
    )
    best["passed"] = best["passed"] and source_support_passes and final_passes
    return {
        "pair": list(pair), "view": view, "modelKind": kind,
        "seed": seed, "finalSeed": seed + 9000,
        "sourceSupport": source_support, "folds": folds, "best": best,
        "finalFitDiagnostic": final_metric,
        "finalFitChangedRows": int(np.sum(final_changed)),
        "finalFitPasses": final_passes,
    }


def run(args):
    modules = (
        load_module(V112_PATH, "v112_residual_export"),
        load_module(SCREEN_PATH, "v112_residual_screen"),
        load_module(OLD_EXPORT_PATH, "v112_residual_old_export"),
        load_module(PAIR_PATH, "v112_residual_pair"),
        load_module(SHARED_PATH, "v112_residual_shared"),
        load_module(V110_PATH, "v112_residual_v110"),
        load_module(V111_PATH, "v112_residual_v111"),
    )
    _v112, _screen, old_export, pair_module, shared, _v110, _v111 = modules
    black, payload, base, held_sources, baseline = reconstruct_v112(modules)
    labels = list(payload["labels"])
    results = []
    cached_by_view = {}
    for view_index, view in enumerate(VIEWS):
        items = shared.load_cached_items(
            argparse.Namespace(cache=args.cache, view=view), payload, labels,
        )
        for item in items:
            item["evaluationEligible"] = True
            item["baseScores"] = np.asarray(base[item["index"]], dtype=np.float64)
            order = np.argsort(-item["baseScores"], kind="stable")[:3]
            item["top3Labels"] = tuple(labels[int(index)] for index in order)
        append_overlay(items, ELECTRONIC_OVERLAY, view, old_export, shared)
        if view == "rhythm":
            append_overlay(items, BLACK_OVERLAY, view, old_export, shared)
            append_overlay(items, TEXTURE_OVERLAY, view, old_export, shared)
        items = deduplicate(items)
        cached_by_view[view] = sum(item.get("evaluationEligible", False) for item in items)
        for pair_index, pair in enumerate(PAIRS):
            for kind_index, kind in enumerate(MODEL_KINDS):
                results.append(screen_candidate(
                    items, pair, view, kind, labels, held_sources, base,
                    baseline, black, payload, pair_module,
                    15140001 + view_index * 100000 + pair_index * 10000
                    + kind_index * 1000,
                ))
    passed = [item for item in results if item["best"]["passed"]]
    passed.sort(key=lambda item: (
        item["best"]["metric"]["top1Accuracy"],
        item["best"]["metric"]["balancedTop1"],
        item["best"]["metric"]["improved"],
    ), reverse=True)
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "objective": "Screen v112 Top3 residual pairs without source leakage.",
        "policy": {
            "metadataUsedAtInference": False,
            "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "matchingProviderExcludedFromOuterFold": True,
            "top3CandidateSetChanged": False,
            "productionModelUpdated": False,
        },
        "dataset": {
            "oofRows": len(payload["actual"]), "cachedByView": cached_by_view,
            "views": list(VIEWS), "pairs": [list(pair) for pair in PAIRS],
        },
        "baseline": baseline,
        "passed": [result_summary(item, include_support=True) for item in passed],
        "results": [result_summary(item) for item in results],
        "decision": "inspect-passed-candidates" if passed else "no-safe-v113-candidate",
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    report = run(args)
    print(json.dumps({
        "baseline": report["baseline"], "passed": report["passed"],
        "decision": report["decision"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
