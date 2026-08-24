#!/usr/bin/env python3
"""Screen production-eligible MusicFM embeddings on the fixed v113 Top3."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.decomposition import PCA
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
SCRIPT_DIR = Path(__file__).parent
RESIDUAL_PATH = SCRIPT_DIR / "genre-unknown80-v112-residual-top3-screen.py"
V113_PATH = SCRIPT_DIR / "genre-unknown80-v113-drone-noise-export.py"
DEFAULT_CACHE_10 = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "musicfm-msd-10s-pilot-cache.json"
)
DEFAULT_CACHE_30 = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "musicfm-msd-30s-pilot-cache.json"
)
DEFAULT_REPORT = TRAINING / "unknown80-v113-musicfm-top3-screen.json"
VIEWS = (
    "30s-embedding", "30s-moment-mean", "30s-joint-mean",
    "10s30s-embedding", "10s30s-joint-mean",
)
MODEL_KINDS = ("logistic", "extra-trees")
WEIGHTS = (0.1, 0.25, 0.5, 0.75, 1.0)
CONFIDENCE_FLOORS = (0.34, 0.4, 0.5, 0.6, 0.7, 0.8)
MARGIN_FLOORS = (0.0, 0.05, 0.1, 0.2)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def valid_record(record):
    if not isinstance(record, dict):
        return None
    embedding = record.get("embedding")
    moments = record.get("moments")
    if not isinstance(embedding, list) or len(embedding) != 1024:
        return None
    if not isinstance(moments, list) or len(moments) != 3072:
        return None
    embedding = np.asarray(embedding, dtype=np.float32)
    moments = np.asarray(moments, dtype=np.float32).reshape(3, 1024)
    if not np.all(np.isfinite(embedding)) or not np.all(np.isfinite(moments)):
        return None
    return embedding, moments[0]


def feature_views(record_10, record_30):
    short = valid_record(record_10)
    long = valid_record(record_30)
    if long is None:
        return {}
    embedding_30, mean_30 = long
    output = {
        "30s-embedding": embedding_30,
        "30s-moment-mean": mean_30,
        "30s-joint-mean": np.concatenate([embedding_30, mean_30]),
    }
    if short is not None:
        embedding_10, mean_10 = short
        output.update({
            "10s30s-embedding": np.concatenate([embedding_10, embedding_30]),
            "10s30s-joint-mean": np.concatenate([
                embedding_10, mean_10, embedding_30, mean_30,
            ]),
        })
    return output


def reconstruct_v113(residual, v113):
    modules = v113.load_modules(residual)
    _v112, _screen, old_export, pair_module, shared, _v110, _v111 = modules
    black, payload, base, held_sources, _baseline = residual.reconstruct_v112(modules)
    labels = list(payload["labels"])
    items = shared.load_cached_items(
        argparse.Namespace(cache=residual.DEFAULT_CACHE, view=v113.VIEW),
        payload, labels,
    )
    for item in items:
        item["evaluationEligible"] = True
        item["baseScores"] = np.asarray(base[item["index"]], dtype=np.float64)
        order = np.argsort(-item["baseScores"], kind="stable")[:3]
        item["top3Labels"] = tuple(labels[int(index)] for index in order)
    for overlay in (
        residual.ELECTRONIC_OVERLAY, residual.BLACK_OVERLAY,
        residual.TEXTURE_OVERLAY,
    ):
        residual.append_overlay(items, overlay, v113.VIEW, old_export, shared)
    items = residual.deduplicate(items)
    records = []
    for fold_index, held_source in enumerate(held_sources):
        training = [
            item for item in items
            if item["source"] != held_source and item["trainingEligible"]
        ]
        validation = residual.routed([
            item for item in items
            if item.get("evaluationEligible") and item["source"] == held_source
        ], v113.PAIR)
        model = residual.fit_pair(
            training, v113.PAIR, v113.MODEL_KIND,
            v113.OUTER_SEED + fold_index * 100, pair_module,
        )
        if model is None or not validation:
            continue
        learned = residual.probabilities(model, validation, v113.PAIR)
        records.extend(
            {"item": item, "probabilities": score}
            for item, score in zip(validation, learned)
        )
    output, _changed = v113.apply_records(base, records, labels, pair_module)
    metric = black.metric(payload["actual"], output, labels, payload["sources"])
    expected = (60.54, 60.21, 31.58, 83.48)
    observed = tuple(metric[key] for key in (
        "top1Accuracy", "balancedTop1", "minimumSourceTop1", "top3Accuracy",
    ))
    if observed != expected:
        raise RuntimeError(f"v113 reconstruction mismatch: {observed} != {expected}")
    return black, payload, output, held_sources, metric


def load_items(args, payload):
    cache_10 = json.loads(args.cache_10.read_text())
    cache_30 = json.loads(args.cache_30.read_text())
    source_indexes = {str(key): index for index, key in enumerate(payload["sourceKeys"])}
    items_by_view = {view: [] for view in VIEWS}
    for key, record_30 in cache_30.items():
        index = source_indexes.get(key)
        if index is None:
            continue
        views = feature_views(cache_10.get(key), record_30)
        for view, features in views.items():
            items_by_view[view].append({
                "index": index, "sourceKey": key,
                "actual": str(payload["actual"][index]),
                "source": str(payload["sources"][index]),
                "trainingEligible": bool(payload["trainingEligible"][index]),
                "features": features,
            })
    return items_by_view


def fit_model(items, kind, seed):
    labels = sorted({item["actual"] for item in items})
    if len(labels) < 2:
        return None
    features = np.asarray([item["features"] for item in items], dtype=np.float64)
    targets = np.asarray([item["actual"] for item in items], dtype=object)
    counts = Counter((item["actual"], item["source"]) for item in items)
    weights = np.asarray([
        1.0 / counts[(item["actual"], item["source"])] for item in items
    ], dtype=np.float64)
    weights /= max(float(weights.mean()), 1e-12)
    if kind == "extra-trees":
        model = ExtraTreesClassifier(
            n_estimators=500, max_features="sqrt", min_samples_leaf=2,
            class_weight="balanced", n_jobs=-1, random_state=seed,
        )
        model.fit(features, targets, sample_weight=weights)
        return model
    model = make_pipeline(
        StandardScaler(),
        PCA(
            n_components=max(2, min(48, len(items) - len(labels), features.shape[1])),
            whiten=True, random_state=seed,
        ),
        LogisticRegression(
            C=0.1, class_weight="balanced", max_iter=2000, random_state=seed,
        ),
    )
    model.fit(features, targets, logisticregression__sample_weight=weights)
    return model


def aligned_probabilities(model, items, labels):
    raw = model.predict_proba(np.asarray([item["features"] for item in items]))
    classes = list(model.classes_ if hasattr(model, "classes_") else model[-1].classes_)
    lookup = {label: index for index, label in enumerate(classes)}
    return np.asarray([
        [row[lookup[label]] if label in lookup else 0.0 for label in labels]
        for row in raw
    ], dtype=np.float64)


def rerank(base, learned, eligible_labels, labels, config):
    output = np.asarray(base, dtype=np.float64).copy()
    changed = np.zeros(len(output), dtype=bool)
    for row_index, (base_row, learned_row) in enumerate(zip(output, learned)):
        candidates = np.argsort(-base_row, kind="stable")[:3]
        candidate_labels = [labels[int(index)] for index in candidates]
        if not set(candidate_labels).issubset(eligible_labels):
            continue
        local_learned = learned_row[candidates]
        local_learned /= max(float(np.sum(local_learned)), 1e-12)
        order = np.argsort(-local_learned, kind="stable")
        confidence = float(local_learned[order[0]])
        margin = confidence - float(local_learned[order[1]])
        if confidence < config["confidenceFloor"] or margin < config["marginFloor"]:
            continue
        local_base = base_row[candidates]
        local_base /= max(float(np.sum(local_base)), 1e-12)
        target = local_base * (1.0 - config["weight"]) + local_learned * config["weight"]
        new_order = candidates[np.argsort(-target, kind="stable")]
        old_order = candidates[np.argsort(-base_row[candidates], kind="stable")]
        values = np.sort(base_row[candidates])[::-1]
        output[row_index, new_order] = values
        changed[row_index] = not np.array_equal(new_order, old_order)
    return output, changed


def screen_view(items, view, kind, labels, held_sources, base, baseline, black, payload, seed):
    support = {
        label: sorted({item["source"] for item in items if item["actual"] == label})
        for label in labels
    }
    eligible_labels = {label for label, sources in support.items() if len(sources) >= 2}
    records = []
    for fold_index, held_source in enumerate(held_sources):
        training = [
            item for item in items
            if item["source"] != held_source and item["trainingEligible"]
        ]
        validation = [item for item in items if item["source"] == held_source]
        model = fit_model(training, kind, seed + fold_index * 100)
        if model is None or not validation:
            continue
        learned = aligned_probabilities(model, validation, labels)
        records.extend(
            {"item": item, "learned": score}
            for item, score in zip(validation, learned)
        )
    indexes = np.asarray([record["item"]["index"] for record in records], dtype=np.int64)
    learned = np.asarray([record["learned"] for record in records])
    ranking = []
    for weight in WEIGHTS:
        for confidence in CONFIDENCE_FLOORS:
            for margin in MARGIN_FLOORS:
                config = {
                    "weight": weight, "confidenceFloor": confidence,
                    "marginFloor": margin,
                }
                output = np.asarray(base, dtype=np.float64).copy()
                candidate, changed = rerank(
                    output[indexes], learned, eligible_labels, labels, config,
                )
                output[indexes] = candidate
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
    best = ranking[0]
    final_training = [item for item in items if item["trainingEligible"]]
    final_model = fit_model(final_training, kind, seed + 9000)
    final_output = np.asarray(base, dtype=np.float64).copy()
    final_changed = np.zeros(0, dtype=bool)
    if final_model is not None and items:
        final_indexes = np.asarray([item["index"] for item in items], dtype=np.int64)
        final_learned = aligned_probabilities(final_model, items, labels)
        candidate, final_changed = rerank(
            final_output[final_indexes], final_learned,
            eligible_labels, labels, best["config"],
        )
        final_output[final_indexes] = candidate
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
    best["passed"] = best["passed"] and final_passes
    return {
        "view": view, "modelKind": kind, "rows": len(items),
        "eligibleLabelCount": len(eligible_labels), "best": best,
        "finalFitDiagnostic": final_metric,
        "finalFitChangedRows": int(np.sum(final_changed)),
        "finalFitPasses": final_passes,
    }


def compact(item):
    metric = item["best"]["metric"]
    final = item["finalFitDiagnostic"]
    fields = (
        "top1Accuracy", "balancedTop1", "minimumSourceTop1",
        "top3Accuracy", "changedTop1", "improved", "harmed",
    )
    return {
        "view": item["view"], "modelKind": item["modelKind"],
        "rows": item["rows"], "eligibleLabelCount": item["eligibleLabelCount"],
        "config": item["best"]["config"],
        "metric": {key: metric[key] for key in fields},
        "changedRows": item["best"]["changedRows"],
        "finalFitDiagnostic": {key: final[key] for key in fields},
        "finalFitChangedRows": item["finalFitChangedRows"],
        "finalFitPasses": item["finalFitPasses"],
        "passed": item["best"]["passed"],
    }


def pair_probabilities(model, items, pair):
    raw = model.predict_proba(np.asarray([item["features"] for item in items]))
    classes = list(model.classes_ if hasattr(model, "classes_") else model[-1].classes_)
    return np.asarray([
        [row[classes.index(label)] for label in pair] for row in raw
    ], dtype=np.float64)


def apply_pair(base, learned, pair, labels, config):
    output = np.asarray(base, dtype=np.float64).copy()
    changed = np.zeros(len(output), dtype=bool)
    indexes = np.asarray([labels.index(label) for label in pair], dtype=np.int64)
    for row_index, (scores, probability) in enumerate(zip(output, learned)):
        if float(np.max(probability)) < config["confidenceFloor"]:
            continue
        local = scores[indexes]
        local /= max(float(np.sum(local)), 1e-12)
        target = local * (1.0 - config["weight"]) + probability * config["weight"]
        before = indexes[int(np.argmax(local))]
        after = indexes[int(np.argmax(target))]
        if before == after:
            continue
        values = np.sort(scores[indexes])[::-1]
        order = indexes[np.argsort(-target, kind="stable")]
        output[row_index, order] = values
        changed[row_index] = True
    return output, changed


def screen_pair(items, pair, view, kind, labels, held_sources, base, baseline, black, payload, seed):
    support = {
        label: sorted({item["source"] for item in items if item["actual"] == label})
        for label in pair
    }
    if any(len(sources) < 2 for sources in support.values()):
        return None
    records = []
    for fold_index, held_source in enumerate(held_sources):
        training = [
            item for item in items
            if item["source"] != held_source and item["actual"] in pair
            and item["trainingEligible"]
        ]
        validation = []
        for item in items:
            if item["source"] != held_source:
                continue
            order = np.argsort(-base[item["index"]], kind="stable")[:3]
            if set(pair).issubset({labels[int(index)] for index in order}):
                validation.append(item)
        model = fit_model(training, kind, seed + fold_index * 100)
        if model is None or not validation:
            continue
        learned = pair_probabilities(model, validation, pair)
        records.extend(
            {"item": item, "learned": score}
            for item, score in zip(validation, learned)
        )
    indexes = np.asarray([record["item"]["index"] for record in records], dtype=np.int64)
    learned = np.asarray([record["learned"] for record in records])
    ranking = []
    for weight in WEIGHTS:
        for confidence in CONFIDENCE_FLOORS:
            config = {"weight": weight, "confidenceFloor": confidence, "routeTopK": 3}
            output = np.asarray(base, dtype=np.float64).copy()
            candidate, changed = apply_pair(output[indexes], learned, pair, labels, config)
            output[indexes] = candidate
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
    best = ranking[0]
    final_training = [
        item for item in items if item["actual"] in pair and item["trainingEligible"]
    ]
    final_validation = []
    for item in items:
        order = np.argsort(-base[item["index"]], kind="stable")[:3]
        if set(pair).issubset({labels[int(index)] for index in order}):
            final_validation.append(item)
    final_model = fit_model(final_training, kind, seed + 9000)
    final_output = np.asarray(base, dtype=np.float64).copy()
    final_changed = np.zeros(0, dtype=bool)
    if final_model is not None and final_validation:
        final_indexes = np.asarray([item["index"] for item in final_validation], dtype=np.int64)
        final_learned = pair_probabilities(final_model, final_validation, pair)
        candidate, final_changed = apply_pair(
            final_output[final_indexes], final_learned, pair, labels, best["config"],
        )
        final_output[final_indexes] = candidate
    final_metric = black.compare_output(
        final_output, base, payload["actual"], labels, payload["sources"],
    )
    final_passes = final_metric["improved"] > 0 and final_metric["harmed"] == 0
    best["passed"] = best["passed"] and final_passes
    return {
        "pair": list(pair), "view": view, "modelKind": kind,
        "rows": len(items), "sourceSupport": support, "best": best,
        "finalFitDiagnostic": final_metric,
        "finalFitChangedRows": int(np.sum(final_changed)),
        "finalFitPasses": final_passes,
    }


def compact_pair(item):
    metric = item["best"]["metric"]
    final = item["finalFitDiagnostic"]
    fields = (
        "top1Accuracy", "balancedTop1", "minimumSourceTop1",
        "top3Accuracy", "changedTop1", "improved", "harmed",
    )
    return {
        "pair": item["pair"], "view": item["view"],
        "modelKind": item["modelKind"], "rows": item["rows"],
        "sourceSupport": item["sourceSupport"],
        "config": item["best"]["config"],
        "sourceHeldout": {key: metric[key] for key in fields},
        "sourceHeldoutChangedRows": item["best"]["changedRows"],
        "finalFitDiagnostic": {key: final[key] for key in fields},
        "finalFitChangedRows": item["finalFitChangedRows"],
        "passed": item["best"]["passed"],
    }


def run(args):
    residual = load_module(RESIDUAL_PATH, "musicfm_residual")
    v113 = load_module(V113_PATH, "musicfm_v113")
    black, payload, base, held_sources, baseline = reconstruct_v113(residual, v113)
    labels = list(payload["labels"])
    items_by_view = load_items(args, payload)
    results = []
    for view_index, view in enumerate(VIEWS):
        for kind_index, kind in enumerate(MODEL_KINDS):
            results.append(screen_view(
                items_by_view[view], view, kind, labels, held_sources,
                base, baseline, black, payload,
                15300001 + view_index * 10000 + kind_index * 1000,
            ))
    results.sort(key=lambda item: (
        item["best"]["passed"], item["best"]["metric"]["top1Accuracy"],
        item["best"]["metric"]["balancedTop1"],
    ), reverse=True)
    passed = [item for item in results if item["best"]["passed"]]
    pair_results = []
    for view_index, view in enumerate(VIEWS):
        for pair_index, pair in enumerate(residual.PAIRS):
            for kind_index, kind in enumerate(MODEL_KINDS):
                result = screen_pair(
                    items_by_view[view], pair, view, kind, labels, held_sources,
                    base, baseline, black, payload,
                    15400001 + view_index * 100000 + pair_index * 10000
                    + kind_index * 1000,
                )
                if result is not None:
                    pair_results.append(result)
    pair_results.sort(key=lambda item: (
        item["best"]["passed"], item["best"]["metric"]["top1Accuracy"],
        item["best"]["metric"]["balancedTop1"],
    ), reverse=True)
    pair_passed = [item for item in pair_results if item["best"]["passed"]]
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "objective": "Screen MIT/Apache-2.0 MusicFM embeddings on fixed v113 Top3.",
        "policy": {
            "metadataUsedAtInference": False, "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "matchingProviderExcludedFromOuterFold": True,
            "top3CandidateSetChanged": False,
            "productionEligible": True,
            "productionModelUpdated": False,
            "pilotSubsetAccuracyIsNotFullUnknownSourceAccuracy": True,
            "finalFitDiagnosticUsesTrainingRows": True,
            "finalFitDiagnosticIsNotUnknownSourceAccuracy": True,
        },
        "dataset": {
            "oofRows": len(payload["actual"]),
            "cache10": str(args.cache_10), "cache30": str(args.cache_30),
            "rowsByView": {view: len(items_by_view[view]) for view in VIEWS},
        },
        "baseline": baseline,
        "passed": [compact(item) for item in passed],
        "results": [compact(item) for item in results],
        "pairwisePassed": [compact_pair(item) for item in pair_passed],
        "pairwiseResults": [compact_pair(item) for item in pair_results],
        "decision": (
            "export-v114-runtime-candidate"
            if passed or pair_passed else "reject-musicfm-candidate"
        ),
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache-10", type=Path, default=DEFAULT_CACHE_10)
    parser.add_argument("--cache-30", type=Path, default=DEFAULT_CACHE_30)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    report = run(args)
    print(json.dumps({
        "baseline": report["baseline"], "passed": report["passed"],
        "results": report["results"],
        "pairwisePassed": report["pairwisePassed"],
        "decision": report["decision"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
