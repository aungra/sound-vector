#!/usr/bin/env python3
"""Nested source-heldout temporal pair screen on fixed v107 Top2 boundaries."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from sklearn.decomposition import PCA
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
SHARED_PATH = Path(__file__).with_name(
    "genre-unknown80-v107-track-reranker-screen.py"
)
DEFAULT_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "runtime-track-segment-features-v3_0.sqlite3"
)
DEFAULT_REPORT = TRAINING / "unknown80-v107-track-pair-screen.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-v107-track-pair-screen.md"
PAIRS = (
    ("ハウス", "テクノ"),
    ("ディープ・ハウス", "ハウス"),
    ("テクノ", "トランス"),
    ("ダブ", "レゲエ"),
    ("メタル", "ロック"),
    ("メタル", "ハードコア"),
    ("ドローン", "ノイズミュージック"),
    ("クラシック音楽", "オペラ"),
    ("ファンク", "ディスコ"),
    ("ブルース", "フォーク"),
)
WEIGHTS = (0.1, 0.25, 0.5, 0.75, 1.0)
CONFIDENCE_FLOORS = (0.5, 0.6, 0.7, 0.8, 0.9)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def pair_name(pair):
    return f"{pair[0]} / {pair[1]}"


def routed_items(items, pair):
    target = set(pair)
    return [
        item for item in items
        if set(item["top2Labels"]) == target
    ]


def pair_training_items(items, pair):
    return [item for item in items if item["actual"] in pair]


def fit_pair(items, pair, seed):
    training = pair_training_items(items, pair)
    if set(item["actual"] for item in training) != set(pair):
        return None
    features = np.asarray([item["features"] for item in training], dtype=np.float64)
    targets = np.asarray([item["actual"] for item in training], dtype=object)
    counts = Counter((item["actual"], item["source"]) for item in training)
    weights = np.asarray([
        1.0 / counts[(item["actual"], item["source"])] for item in training
    ], dtype=np.float64)
    weights /= max(float(weights.mean()), 1e-12)
    model = make_pipeline(
        StandardScaler(),
        PCA(
            n_components=max(2, min(24, len(training) - 2, features.shape[1])),
            whiten=True, random_state=seed,
        ),
        LogisticRegression(
            C=0.2, class_weight="balanced", max_iter=1600,
            random_state=seed,
        ),
    )
    model.fit(features, targets, logisticregression__sample_weight=weights)
    return model


def pair_probabilities(model, items, pair):
    raw = model.predict_proba(np.asarray([item["features"] for item in items]))
    classes = list(model[-1].classes_)
    lookup = {label: index for index, label in enumerate(classes)}
    return np.asarray([
        [row[lookup[label]] for label in pair]
        for row in raw
    ], dtype=np.float64)


def apply_pair(base_scores, probabilities, pair, labels, config):
    output = np.asarray(base_scores, dtype=np.float64).copy()
    changed = np.zeros(len(output), dtype=bool)
    if config is None:
        return output, changed
    indexes = np.asarray([labels.index(label) for label in pair], dtype=np.int64)
    for row_index, (scores, learned) in enumerate(zip(output, probabilities)):
        confidence = float(np.max(learned))
        if confidence < config["confidenceFloor"]:
            continue
        local = scores[indexes]
        local = local / max(float(np.sum(local)), 1e-12)
        target = local * (1.0 - config["weight"]) + learned * config["weight"]
        before = indexes[int(np.argmax(local))]
        after = indexes[int(np.argmax(target))]
        if before == after:
            continue
        values = np.sort(scores[indexes])[::-1]
        order = indexes[np.argsort(-target, kind="stable")]
        output[row_index, order] = values
        changed[row_index] = True
    return output, changed


def correctness(actual, scores, labels):
    predicted = np.asarray([labels[index] for index in np.argmax(scores, axis=1)], dtype=object)
    return predicted == np.asarray(actual, dtype=object)


def choose_inner_config(items, pair, labels, seed):
    records = []
    for fold_index, held_source in enumerate(sorted({item["source"] for item in items})):
        fit = [item for item in items if item["source"] != held_source]
        validation = routed_items(
            [item for item in items if item["source"] == held_source], pair,
        )
        model = fit_pair(fit, pair, seed + fold_index)
        if model is None or not validation:
            continue
        probabilities = pair_probabilities(model, validation, pair)
        records.extend(
            {"item": item, "probabilities": probability}
            for item, probability in zip(validation, probabilities)
        )
    if not records:
        return None, {"rows": 0, "candidateCount": 1}
    base = np.asarray([record["item"]["baseScores"] for record in records])
    actual = np.asarray([record["item"]["actual"] for record in records], dtype=object)
    probabilities = np.asarray([record["probabilities"] for record in records])
    baseline_correct = correctness(actual, base, labels)
    ranking = [{
        "config": None, "accuracy": round(float(np.mean(baseline_correct)) * 100, 2),
        "changedRows": 0, "improved": 0, "harmed": 0,
    }]
    for weight in WEIGHTS:
        for confidence in CONFIDENCE_FLOORS:
            config = {"weight": weight, "confidenceFloor": confidence}
            scores, changed = apply_pair(base, probabilities, pair, labels, config)
            candidate_correct = correctness(actual, scores, labels)
            ranking.append({
                "config": config,
                "accuracy": round(float(np.mean(candidate_correct)) * 100, 2),
                "changedRows": int(np.sum(changed)),
                "improved": int(np.sum(candidate_correct & ~baseline_correct)),
                "harmed": int(np.sum(~candidate_correct & baseline_correct)),
            })
    ranking.sort(key=lambda row: (
        row["accuracy"], row["improved"] - row["harmed"],
        row["improved"], -row["changedRows"],
    ), reverse=True)
    best = ranking[0]
    if best["improved"] < best["harmed"]:
        best = next(row for row in ranking if row["config"] is None)
    return best["config"], {
        "rows": len(records), "candidateCount": len(ranking),
        "baselineAccuracy": round(float(np.mean(baseline_correct)) * 100, 2),
        "selected": best,
    }


def render(report):
    baseline = report["baseline"]
    candidate = report["candidate"]
    lines = [
        "# Unknown80 v107 temporal pair screen", "",
        "| model | Top1 | balanced | minimum source | Top3 | + / - |",
        "|---|---:|---:|---:|---:|---:|",
        f"| v107 | {baseline['top1Accuracy']:.2f}% | {baseline['balancedTop1']:.2f}% | {baseline['minimumSourceTop1']:.2f}% | {baseline['top3Accuracy']:.2f}% | - |",
        f"| temporal pairs | {candidate['top1Accuracy']:.2f}% | {candidate['balancedTop1']:.2f}% | {candidate['minimumSourceTop1']:.2f}% | {candidate['top3Accuracy']:.2f}% | {candidate['improved']} / {candidate['harmed']} |",
        "", "## Pair coverage", "",
        "| pair | trained folds | routed rows | changed rows |",
        "|---|---:|---:|---:|",
    ]
    for detail in report["pairs"]:
        lines.append(
            f"| {detail['pair']} | {detail['trainedFolds']} | "
            f"{detail['routedRows']} | {detail['changedRows']} |"
        )
    lines.extend(["", f"Decision: **{report['decision']}**", ""])
    return "\n".join(lines)


def run(args):
    shared = load_module(SHARED_PATH, "track_pair_shared")
    _source, black, payload, v107, held_sources, baseline = shared.build_v107()
    labels = list(payload["labels"])
    items = shared.load_cached_items(args, payload, labels)
    for item in items:
        item["baseScores"] = np.asarray(v107[item["index"]], dtype=np.float64)
        order = np.argsort(-item["baseScores"], kind="stable")
        item["top2Labels"] = (labels[int(order[0])], labels[int(order[1])])
    output = np.asarray(v107, dtype=np.float64).copy()
    pair_details = []
    all_changed = set()
    for pair_index, pair in enumerate(PAIRS):
        proposal = np.asarray(v107, dtype=np.float64).copy()
        pair_changed = set()
        fold_details = []
        for fold_index, held_source in enumerate(held_sources):
            train = [
                item for item in items
                if item["source"] != held_source and item["trainingEligible"]
            ]
            validation = routed_items(
                [item for item in items if item["source"] == held_source], pair,
            )
            config, inner = choose_inner_config(
                train, pair, labels, 3101001 + pair_index * 10000 + fold_index * 100,
            )
            model = fit_pair(
                train, pair, 3101501 + pair_index * 10000 + fold_index * 100,
            )
            if model is None or not validation:
                continue
            probabilities = pair_probabilities(model, validation, pair)
            base = np.asarray([item["baseScores"] for item in validation])
            candidate, changed = apply_pair(base, probabilities, pair, labels, config)
            indexes = np.asarray([item["index"] for item in validation], dtype=np.int64)
            proposal[indexes] = candidate
            changed_indexes = indexes[changed]
            pair_changed.update(int(value) for value in changed_indexes)
            fold_details.append({
                "heldOutSource": str(held_source),
                "trainingRows": len(pair_training_items(train, pair)),
                "routedRows": len(validation),
                "selectedConfig": config,
                "innerSelection": inner,
                "changedRows": int(np.sum(changed)),
            })
        conflicts = pair_changed & all_changed
        pair_metric = black.compare_output(
            proposal, v107, payload["actual"], labels, payload["sources"],
        )
        pair_passes = (
            pair_metric["top1Accuracy"] > baseline["top1Accuracy"]
            and pair_metric["balancedTop1"] >= baseline["balancedTop1"]
            and pair_metric["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
            and pair_metric["top3Accuracy"] >= baseline["top3Accuracy"]
            and pair_metric["improved"] > pair_metric["harmed"]
        )
        accepted = pair_changed - conflicts if pair_passes else set()
        if accepted:
            indexes = np.asarray(sorted(accepted), dtype=np.int64)
            output[indexes] = proposal[indexes]
            all_changed.update(accepted)
        pair_details.append({
            "pair": pair_name(pair),
            "trainedFolds": len(fold_details),
            "routedRows": sum(fold["routedRows"] for fold in fold_details),
            "changedRows": len(accepted),
            "screenedChangedRows": len(pair_changed),
            "conflicts": len(conflicts),
            "sourceHeldoutMetric": pair_metric,
            "accepted": pair_passes,
            "folds": fold_details,
        })
    candidate = black.compare_output(
        output, v107, payload["actual"], labels, payload["sources"],
    )
    top3_preserved = all(
        set(left) == set(right)
        for left, right in zip(np.argsort(-v107, axis=1)[:, :3], np.argsort(-output, axis=1)[:, :3])
    )
    passed = (
        candidate["top1Accuracy"] > baseline["top1Accuracy"]
        and candidate["balancedTop1"] >= baseline["balancedTop1"]
        and candidate["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and candidate["top3Accuracy"] >= baseline["top3Accuracy"]
        and candidate["improved"] >= candidate["harmed"]
        and top3_preserved
    )
    report = {
        "objective": "Resolve high-volume v107 Top2 boundaries using raw 4-segment evidence.",
        "policy": {
            "metadataUsedAtInference": False,
            "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "matchingProviderExcludedFromOuterFold": True,
            "configurationSelectedInInnerSourceFolds": True,
            "pairInclusionSelectedOnFixedSourceHeldoutOOF": True,
            "fittedGenreHeadUsedAsTemporalInput": False,
            "top3CandidateSetChanged": not top3_preserved,
            "productionModelUpdated": False,
        },
        "dataset": {
            "oofRows": len(payload["actual"]),
            "cachedRows": len(items),
            "cachedLabels": len({item["actual"] for item in items}),
            "cachedSources": len({item["source"] for item in items}),
            "candidateFeatureMode": f"raw-{args.view}-4segment-moments",
        },
        "baseline": baseline,
        "candidate": candidate,
        "pairs": pair_details,
        "decision": "continue-v108-production-gates" if passed else "reject-current-temporal-pairs",
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--view", choices=("full", "effnet", "librosa", "rhythm"), default="rhythm")
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    report = run(args)
    print(json.dumps({
        "dataset": report["dataset"],
        "baseline": report["baseline"],
        "candidate": report["candidate"],
        "pairs": [
            {key: detail[key] for key in ("pair", "trainedFolds", "routedRows", "changedRows")}
            for detail in report["pairs"]
        ],
        "decision": report["decision"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
