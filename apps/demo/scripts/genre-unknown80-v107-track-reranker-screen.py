#!/usr/bin/env python3
"""Nested source-heldout screen of 4-segment evidence against fixed v107."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sqlite3
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from sklearn.decomposition import PCA
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from genre_track_feature_contract import feature_contract_digest


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
MAEST_SCREEN_PATH = Path(__file__).with_name(
    "genre-unknown80-v107-maest-candidate-screen.py"
)
V107_SOURCE_PATH = Path(__file__).with_name(
    "genre-unknown80-independent-stack-v107-source-heldout.py"
)
CACHE_MODULE_PATH = Path(__file__).with_name("genre-track-segment-cache.py")
DEFAULT_CACHE = Path(
    os.environ.get(
        "MMFR_TRACK_SEGMENT_CACHE_PATH",
        str(TRAINING / "runtime-track-segment-features-v3_0.sqlite3"),
    )
)
DEFAULT_REPORT = TRAINING / "unknown80-v107-track-reranker-screen.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-v107-track-reranker-screen.md"
WEIGHTS = (0.1, 0.25, 0.5, 0.75)
CONFIDENCE_FLOORS = (0.0, 0.4, 0.55, 0.7)
MARGIN_FLOORS = (0.0, 0.05, 0.15, 0.3)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def normalize(values):
    values = np.asarray(values, dtype=np.float64)
    return values / np.maximum(values.sum(axis=-1, keepdims=True), 1e-12)


def fit_model(items, seed):
    features = np.asarray([item["features"] for item in items], dtype=np.float64)
    actual = np.asarray([item["actual"] for item in items], dtype=object)
    counts = Counter((item["actual"], item["source"]) for item in items)
    weights = np.asarray([
        1.0 / counts[(item["actual"], item["source"])] for item in items
    ], dtype=np.float64)
    weights /= max(float(weights.mean()), 1e-12)
    model = make_pipeline(
        StandardScaler(),
        PCA(
            n_components=max(2, min(48, len(items) - 2, features.shape[1])),
            whiten=True, random_state=seed,
        ),
        LogisticRegression(
            C=0.25, class_weight="balanced", max_iter=1800,
            random_state=seed,
        ),
    )
    model.fit(features, actual, logisticregression__sample_weight=weights)
    return model


def raw_temporal_features(segment_vectors, view="full"):
    """Summarize production inputs without using a fitted genre head."""
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


def aligned_probabilities(model, items, labels):
    raw = model.predict_proba(np.asarray([item["features"] for item in items]))
    classes = list(model[-1].classes_)
    lookup = {label: index for index, label in enumerate(classes)}
    output = np.asarray([
        [row[lookup[label]] if label in lookup else 0.0 for label in labels]
        for row in raw
    ], dtype=np.float64)
    return normalize(output)


def rerank_top3(base_scores, learned_scores, config):
    output = np.asarray(base_scores, dtype=np.float64).copy()
    if config is None:
        return output, np.zeros(len(output), dtype=bool)
    changed = np.zeros(len(output), dtype=bool)
    for row_index, (base, learned) in enumerate(zip(output, learned_scores)):
        candidates = np.argsort(-base, kind="stable")[:3]
        local_base = normalize(base[candidates].reshape(1, -1))[0]
        local_learned = normalize(learned[candidates].reshape(1, -1))[0]
        learned_order = np.argsort(-local_learned, kind="stable")
        confidence = float(local_learned[learned_order[0]])
        margin = confidence - float(local_learned[learned_order[1]])
        if confidence < config["confidenceFloor"] or margin < config["marginFloor"]:
            continue
        target = (
            local_base * (1.0 - config["weight"])
            + local_learned * config["weight"]
        )
        ordered_candidates = candidates[np.argsort(-target, kind="stable")]
        old_order = candidates[np.argsort(-base[candidates], kind="stable")]
        values = np.sort(base[candidates])[::-1]
        output[row_index, ordered_candidates] = values
        changed[row_index] = not np.array_equal(old_order, ordered_candidates)
    return output, changed


def local_metric(actual, scores, labels, sources):
    predicted = np.asarray([labels[index] for index in np.argmax(scores, axis=1)], dtype=object)
    recalls = [
        float(np.mean(predicted[actual == label] == label))
        for label in sorted(set(actual))
    ]
    source_values = [
        float(np.mean(predicted[sources == source] == actual[sources == source]))
        for source in sorted(set(sources))
    ]
    return {
        "top1Accuracy": round(float(np.mean(predicted == actual)) * 100, 2),
        "balancedTop1": round(float(np.mean(recalls)) * 100, 2),
        "minimumSourceTop1": round(float(min(source_values, default=0.0)) * 100, 2),
    }


def configs():
    yield None
    for weight in WEIGHTS:
        for confidence in CONFIDENCE_FLOORS:
            for margin in MARGIN_FLOORS:
                yield {
                    "weight": weight,
                    "confidenceFloor": confidence,
                    "marginFloor": margin,
                }


def choose_nested_config(train, labels, seed):
    inner_records = []
    for fold_index, held_source in enumerate(sorted({item["source"] for item in train})):
        fit = [item for item in train if item["source"] != held_source]
        validation = [item for item in train if item["source"] == held_source]
        if len({item["actual"] for item in fit}) < 2 or not validation:
            continue
        model = fit_model(fit, seed + fold_index)
        learned = aligned_probabilities(model, validation, labels)
        inner_records.extend(
            {"item": item, "learned": score}
            for item, score in zip(validation, learned)
        )
    if not inner_records:
        return None, {"rows": 0, "candidateCount": 1}
    actual = np.asarray([record["item"]["actual"] for record in inner_records], dtype=object)
    sources = np.asarray([record["item"]["source"] for record in inner_records], dtype=object)
    base = np.asarray([record["item"]["baseScores"] for record in inner_records])
    learned = np.asarray([record["learned"] for record in inner_records])
    baseline = local_metric(actual, base, labels, sources)
    ranking = []
    for config in configs():
        scores, changed = rerank_top3(base, learned, config)
        metric = local_metric(actual, scores, labels, sources)
        ranking.append({
            "config": config,
            "metric": metric,
            "changedRows": int(np.sum(changed)),
            "improved": int(np.sum(
                (np.argmax(scores, axis=1) == np.asarray([labels.index(value) for value in actual]))
                & (np.argmax(base, axis=1) != np.asarray([labels.index(value) for value in actual]))
            )),
            "harmed": int(np.sum(
                (np.argmax(scores, axis=1) != np.asarray([labels.index(value) for value in actual]))
                & (np.argmax(base, axis=1) == np.asarray([labels.index(value) for value in actual]))
            )),
        })
    ranking.sort(key=lambda row: (
        row["metric"]["top1Accuracy"], row["metric"]["balancedTop1"],
        row["metric"]["minimumSourceTop1"], row["improved"] - row["harmed"],
        -row["changedRows"],
    ), reverse=True)
    best = ranking[0]
    # Inner-fold selection can always retain v107 when temporal evidence is weak.
    if (
        best["metric"]["top1Accuracy"] < baseline["top1Accuracy"]
        or best["metric"]["balancedTop1"] < baseline["balancedTop1"]
        or best["improved"] < best["harmed"]
    ):
        best = next(row for row in ranking if row["config"] is None)
    return best["config"], {
        "rows": len(inner_records),
        "candidateCount": len(ranking),
        "baseline": baseline,
        "selected": best,
    }


def build_v107():
    maest = load_module(MAEST_SCREEN_PATH, "track_screen_maest")
    source = load_module(V107_SOURCE_PATH, "track_screen_v107_defaults")
    parser, v105 = source.parser_defaults()
    args = parser.parse_args([])
    args.deep_manifest = args.deep_manifest or list(v105.DEFAULT_DEEP_MANIFESTS)
    args.deep_cache = args.deep_cache or list(v105.DEFAULT_DEEP_CACHES)
    return maest.build_v107(args)


def load_cached_items(args, payload, labels):
    cache = load_module(CACHE_MODULE_PATH, "track_screen_cache")
    source_indexes = {str(key): index for index, key in enumerate(payload["sourceKeys"])}
    connection = sqlite3.connect(args.cache)
    digest = connection.execute(
        "SELECT value FROM metadata WHERE key='featureContractSha256'"
    ).fetchone()
    if not digest or digest[0] != feature_contract_digest():
        raise RuntimeError("track cache feature contract digest mismatch")
    items = []
    for source_key, label, source in connection.execute(
        "SELECT source_key,label,source FROM tracks ORDER BY source_key"
    ):
        if source_key not in source_indexes:
            continue
        segments = cache.read_cached_segments(connection, source_key)
        if len(segments) != 4:
            continue
        index = source_indexes[source_key]
        items.append({
            "index": index,
            "sourceKey": source_key,
            "actual": str(payload["actual"][index]),
            "source": str(payload["sources"][index]),
            "trainingEligible": bool(payload["trainingEligible"][index]),
            "features": raw_temporal_features([
                segment["vectors"] for segment in segments
            ], args.view),
        })
    connection.close()
    return items


def render(report):
    baseline = report["baseline"]
    candidate = report["candidate"]
    return "\n".join([
        "# Unknown80 v107 4-segment nested source-heldout screen", "",
        "| model | Top1 | balanced | minimum source | Top3 | + / - |",
        "|---|---:|---:|---:|---:|---:|",
        f"| v107 | {baseline['top1Accuracy']:.2f}% | {baseline['balancedTop1']:.2f}% | {baseline['minimumSourceTop1']:.2f}% | {baseline['top3Accuracy']:.2f}% | - |",
        f"| temporal candidate | {candidate['top1Accuracy']:.2f}% | {candidate['balancedTop1']:.2f}% | {candidate['minimumSourceTop1']:.2f}% | {candidate['top3Accuracy']:.2f}% | {candidate['improved']} / {candidate['harmed']} |",
        "", f"Decision: **{report['decision']}**", "",
    ])


def run(args):
    _source, black, payload, v107, held_sources, baseline = build_v107()
    labels = list(payload["labels"])
    items = load_cached_items(args, payload, labels)
    for item in items:
        item["baseScores"] = np.asarray(v107[item["index"]], dtype=np.float64)
    output = np.asarray(v107, dtype=np.float64).copy()
    learned_output = np.zeros_like(output)
    fold_details = []
    covered = np.zeros(len(output), dtype=bool)
    for fold_index, held_source in enumerate(held_sources):
        train = [
            item for item in items
            if item["source"] != held_source and item["trainingEligible"]
        ]
        validation = [item for item in items if item["source"] == held_source]
        if len({item["actual"] for item in train}) < 2 or not validation:
            continue
        config, inner = choose_nested_config(train, labels, 3001001 + fold_index * 1000)
        model = fit_model(train, 3001501 + fold_index * 1000)
        learned = aligned_probabilities(model, validation, labels)
        base = np.asarray([item["baseScores"] for item in validation])
        candidate, changed = rerank_top3(base, learned, config)
        indexes = np.asarray([item["index"] for item in validation], dtype=np.int64)
        output[indexes] = candidate
        learned_output[indexes] = learned
        covered[indexes] = True
        fold_actual = np.asarray([item["actual"] for item in validation], dtype=object)
        fold_sources = np.asarray([item["source"] for item in validation], dtype=object)
        fold_details.append({
            "heldOutSource": str(held_source),
            "trainingRows": len(train),
            "evaluationRows": len(validation),
            "changedRows": int(np.sum(changed)),
            "selectedConfig": config,
            "innerSelection": inner,
            "baseline": local_metric(fold_actual, base, labels, fold_sources),
            "candidate": local_metric(fold_actual, candidate, labels, fold_sources),
            "learned": local_metric(fold_actual, learned, labels, fold_sources),
        })
    candidate = black.compare_output(
        output, v107, payload["actual"], labels, payload["sources"],
    )
    baseline_top3 = np.argsort(-v107, axis=1)[:, :3]
    candidate_top3 = np.argsort(-output, axis=1)[:, :3]
    top3_sets_preserved = all(
        set(left) == set(right) for left, right in zip(baseline_top3, candidate_top3)
    )
    passed = (
        candidate["top1Accuracy"] > baseline["top1Accuracy"]
        and candidate["balancedTop1"] >= baseline["balancedTop1"]
        and candidate["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and candidate["top3Accuracy"] >= baseline["top3Accuracy"]
        and candidate["improved"] >= candidate["harmed"]
        and top3_sets_preserved
    )
    cached_actual = np.asarray([item["actual"] for item in items], dtype=object)
    cached_sources = np.asarray([item["source"] for item in items], dtype=object)
    cached_base = np.asarray([item["baseScores"] for item in items])
    covered_indexes = np.flatnonzero(covered)
    expected = np.asarray([labels.index(value) for value in payload["actual"]], dtype=np.int64)
    changed_indexes = np.flatnonzero(np.argmax(output, axis=1) != np.argmax(v107, axis=1))
    report = {
        "objective": "Test production-equivalent 4-segment evidence with nested provider exclusion against fixed v107.",
        "policy": {
            "metadataUsedAtInference": False,
            "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "matchingProviderExcludedFromOuterFold": True,
            "configurationSelectedInInnerSourceFolds": True,
            "top3CandidateSetChanged": not top3_sets_preserved,
            "productionModelUpdated": False,
        },
        "dataset": {
            "oofRows": len(payload["actual"]),
            "cachedRows": len(items),
            "crossFittedRows": int(np.sum(covered)),
            "cachedLabels": len({item["actual"] for item in items}),
            "cachedSources": len({item["source"] for item in items}),
            "heldOutSources": [str(value) for value in held_sources],
            "featureContractSha256": feature_contract_digest(),
            "candidateFeatureMode": f"raw-{args.view}-4segment-moments",
        },
        "baseline": baseline,
        "candidate": candidate,
        "diagnostics": {
            "v107OnCached": local_metric(cached_actual, cached_base, labels, cached_sources),
            "learnedCrossfitOnCovered": local_metric(
                payload["actual"][covered_indexes], learned_output[covered_indexes],
                labels, payload["sources"][covered_indexes],
            ) if len(covered_indexes) else None,
            "v107Top3OracleOnCached": round(float(np.mean([
                labels.index(actual) in np.argsort(-scores)[:3]
                for actual, scores in zip(cached_actual, cached_base)
            ])) * 100, 2),
            "changedRows": [
                {
                    "sourceKey": str(payload["sourceKeys"][index]),
                    "source": str(payload["sources"][index]),
                    "actual": str(payload["actual"][index]),
                    "before": labels[int(np.argmax(v107[index]))],
                    "after": labels[int(np.argmax(output[index]))],
                    "improved": bool(np.argmax(output[index]) == expected[index]),
                }
                for index in changed_indexes[:50]
            ],
        },
        "folds": fold_details,
        "decision": "continue-v108-production-gates" if passed else "reject-current-temporal-candidate",
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--view", choices=("full", "effnet", "librosa", "rhythm"), default="full")
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    report = run(args)
    print(json.dumps({
        "dataset": report["dataset"],
        "baseline": report["baseline"],
        "candidate": report["candidate"],
        "decision": report["decision"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
