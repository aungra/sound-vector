#!/usr/bin/env python3
"""Screen audio-only pair heads that only reorder the incumbent Top 3."""

from __future__ import annotations

import argparse
import importlib.util
import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from sklearn.decomposition import PCA
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from genre_research_reproducibility import build_reproducibility


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
HELPER_PATH = Path(__file__).with_name(
    "genre-audio-only-frozen-representation-benchmark.py"
)
FULL_PATH = Path(__file__).with_name("genre-panns-full-source-holdout.py")
REPRO_PATH = Path(__file__).with_name("genre_research_reproducibility.py")
DEFAULT_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-incumbent-caphe-oof-audio-only.npz"
)
DEFAULT_REPORT = TRAINING / "unknown80-top3-pairwise-screen.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-top3-pairwise-screen.md"
PAIRS = (
    ("テクノ", "ハウス"),
    ("ハウス", "ディープ・ハウス"),
    ("テクノ", "トランス"),
    ("レゲエ", "ダブ"),
    ("アンビエント", "ドローン"),
    ("ドローン", "ノイズミュージック"),
    ("ロック", "メタル"),
    ("ロック", "ファンク"),
    ("ロック", "ブルース"),
    ("クラシック音楽", "オペラ"),
)
STRENGTHS = (0.25, 0.5, 0.75, 1.0)
CONFIDENCE_FLOORS = (0.7, 0.8, 0.9)
COMBINATIONS = (
    {
        "name": "top3-extra-trees-pair3w0.75-pair9w0.25",
        "kind": "extra-trees",
        "members": ((PAIRS[2], 0.75), (PAIRS[8], 0.25)),
    },
    {
        "name": "top3-extra-trees-pair3w0.75-pair9w0.5",
        "kind": "extra-trees",
        "members": ((PAIRS[2], 0.75), (PAIRS[8], 0.5)),
    },
    {
        "name": "top3-extra-trees-pair3w0.75-pair9w0.25-pair4w0.25",
        "kind": "extra-trees",
        "members": (
            (PAIRS[2], 0.75), (PAIRS[8], 0.25), (PAIRS[3], 0.25),
        ),
    },
)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def source_label_weights(actual, sources):
    counts = Counter(zip(actual, sources))
    values = np.asarray([
        1.0 / max(1, counts[(label, source)])
        for label, source in zip(actual, sources)
    ], dtype=np.float64)
    return values / max(float(values.mean()), 1e-12)


def make_model(kind, rows, dimensions, seed):
    if kind == "extra-trees":
        return ExtraTreesClassifier(
            n_estimators=320,
            max_features="sqrt",
            min_samples_leaf=2,
            class_weight="balanced",
            n_jobs=-1,
            random_state=seed,
        )
    components = max(2, min(64, dimensions, rows - 2))
    return make_pipeline(
        StandardScaler(),
        PCA(n_components=components, whiten=True, random_state=seed),
        LogisticRegression(
            C=0.7,
            class_weight="balanced",
            max_iter=1200,
            random_state=seed,
        ),
    )


def fit_pair_models(features, actual, sources, indexes, labels, kind, seed):
    models = {}
    diagnostics = []
    for pair_index, pair in enumerate(PAIRS):
        selected = np.asarray([
            index for index in indexes if actual[index] in pair
        ], dtype=np.int64)
        counts = Counter(actual[selected])
        source_counts = {
            label: len(set(sources[selected][actual[selected] == label]))
            for label in pair
        }
        if min((counts.get(label, 0) for label in pair), default=0) < 8:
            diagnostics.append({
                "pair": list(pair), "status": "insufficient-rows",
                "rows": dict(counts), "sourcesPerLabel": source_counts,
            })
            continue
        if min((source_counts.get(label, 0) for label in pair), default=0) < 2:
            diagnostics.append({
                "pair": list(pair), "status": "insufficient-independent-sources",
                "rows": dict(counts), "sourcesPerLabel": source_counts,
            })
            continue
        model = make_model(
            kind, len(selected), features.shape[1], seed + pair_index * 100,
        )
        weights = source_label_weights(actual[selected], sources[selected])
        model.fit(features[selected], actual[selected], **(
            {"sample_weight": weights}
            if kind == "extra-trees"
            else {"logisticregression__sample_weight": weights}
        ))
        models[pair] = model
        diagnostics.append({
            "pair": list(pair), "status": "fitted", "rows": dict(counts),
            "sourcesPerLabel": source_counts,
        })
    return models, diagnostics


def rerank_top3(
    base_scores, features, models, labels, strength, min_confidence=0.0,
):
    scores = np.asarray(base_scores, dtype=np.float64)
    label_index = {label: index for index, label in enumerate(labels)}
    top3 = np.argsort(-scores, axis=1)[:, :3]
    utilities = np.log(np.maximum(scores, 1e-12))
    for pair, model in models.items():
        first, second = (label_index[label] for label in pair)
        applicable = np.asarray([
            first in candidates and second in candidates for candidates in top3
        ], dtype=bool)
        if not np.any(applicable):
            continue
        probabilities = model.predict_proba(features[applicable])
        classes = list(model.classes_ if hasattr(model, "classes_") else model[-1].classes_)
        pair_scores = scores[applicable][:, [first, second]]
        old = pair_scores / np.maximum(pair_scores.sum(axis=1, keepdims=True), 1e-12)
        learned = probabilities[:, [classes.index(pair[0]), classes.index(pair[1])]]
        target = old * (1.0 - strength) + learned * strength
        delta = np.log(np.maximum(target, 1e-12)) - np.log(np.maximum(old, 1e-12))
        confident = np.max(learned, axis=1) >= min_confidence
        delta[~confident] = 0.0
        selected_rows = np.flatnonzero(applicable)
        utilities[selected_rows, first] += delta[:, 0]
        utilities[selected_rows, second] += delta[:, 1]

    output = scores.copy()
    for row_index, candidates in enumerate(top3):
        original_values = np.sort(scores[row_index, candidates])[::-1]
        order = candidates[np.argsort(-utilities[row_index, candidates], kind="stable")]
        output[row_index, order] = original_values
    return output


def apply_combination(base_scores, features, models, labels, members):
    output = np.asarray(base_scores, dtype=np.float64)
    for pair, strength in members:
        model = models.get(pair)
        if model is not None:
            output = rerank_top3(
                output, features, {pair: model}, labels, strength,
            )
    return output


def render(report):
    lines = [
        "# Unknown80 Top3 pairwise screen",
        "",
        "Audio-only source-heldout screen. Candidate sets are fixed; only Top3 order may change.",
        "",
        "| candidate | Top1 | balanced | minimum source | Top3 |",
        "|---|---:|---:|---:|---:|",
    ]
    for name in report["ranking"]:
        score = report["candidates"][name]["pooled"]
        lines.append(
            f"| {name} | {score['top1Accuracy']:.2f}% | "
            f"{score['balancedTop1']:.2f}% | {score['minimumSourceTop1']:.2f}% | "
            f"{score['top3Accuracy']:.2f}% |"
        )
    lines.extend(["", f"Selected: **{report['selected']}**", ""])
    reproducibility = report.get("reproducibility") or {}
    if reproducibility:
        runtime = reproducibility["runtime"]
        lines.extend([
            "## Reproducibility", "",
            f"- Script SHA-256: `{reproducibility['script']['sha256']}`",
            f"- OOF SHA-256: `{reproducibility['inputs'][0]['sha256']}`",
            f"- Runtime: Python {runtime['python']} / NumPy {runtime['numpy']} / scikit-learn {runtime['sklearn']}",
            "",
        ])
    return "\n".join(lines)


def run(args):
    helper = load_module(HELPER_PATH, "unknown80_pairwise_helper")
    full = load_module(FULL_PATH, "unknown80_pairwise_full")
    payload = np.load(args.cache)
    features = payload["positions"].astype(np.float32)
    base = payload["selectedScores"].astype(np.float64)
    labels = list(payload["labels"])
    actual = payload["actual"]
    sources = payload["sources"]
    training_eligible = payload["trainingEligible"].astype(bool)
    held_sources = sorted(
        source for source, count in Counter(sources).items() if count >= 8
    )
    candidate_names = ["incumbent"] + [
        f"top3-{kind}-pairwise-w{strength:g}"
        for kind in ("logistic-pca64", "extra-trees")
        for strength in STRENGTHS
    ]
    pair_candidate_names = {
        (kind, strength, pair): (
            f"top3-{kind}-pair{pair_index + 1}-w{strength:g}"
        )
        for kind in ("logistic-pca64", "extra-trees")
        for strength in STRENGTHS
        for pair_index, pair in enumerate(PAIRS)
    }
    candidate_names.extend(pair_candidate_names.values())
    gated_candidate_names = {
        (kind, floor, pair): (
            f"top3-{kind}-pair{pair_index + 1}-confidence{floor:g}"
        )
        for kind in ("logistic-pca64", "extra-trees")
        for floor in CONFIDENCE_FLOORS
        for pair_index, pair in enumerate(PAIRS)
    }
    candidate_names.extend(gated_candidate_names.values())
    candidate_names.extend(config["name"] for config in COMBINATIONS)
    runs = {name: [] for name in candidate_names}
    folds = []
    for source_index, held_source in enumerate(held_sources):
        train_indexes = np.asarray([
            index for index, source in enumerate(sources)
            if source != held_source and training_eligible[index]
        ], dtype=np.int64)
        evaluation_indexes = np.flatnonzero(sources == held_source)
        fold = {"heldOutSource": held_source, "models": {}}
        runs["incumbent"].append({
            "source": held_source,
            "metric": helper.metric(
                actual[evaluation_indexes], base[evaluation_indexes], labels,
            ),
        })
        for kind_index, kind in enumerate(("logistic-pca64", "extra-trees")):
            models, diagnostics = fit_pair_models(
                features, actual, sources, train_indexes, labels, kind,
                301001 + source_index * 1000 + kind_index * 100,
            )
            fold["models"][kind] = diagnostics
            for strength in STRENGTHS:
                name = f"top3-{kind}-pairwise-w{strength:g}"
                scores = rerank_top3(
                    base[evaluation_indexes], features[evaluation_indexes],
                    models, labels, strength,
                )
                runs[name].append({
                    "source": held_source,
                    "metric": helper.metric(
                        actual[evaluation_indexes], scores, labels,
                    ),
                })
                for pair in PAIRS:
                    pair_name = pair_candidate_names[(kind, strength, pair)]
                    model = models.get(pair)
                    pair_scores = (
                        rerank_top3(
                            base[evaluation_indexes], features[evaluation_indexes],
                            {pair: model}, labels, strength,
                        )
                        if model is not None else base[evaluation_indexes]
                    )
                    runs[pair_name].append({
                        "source": held_source,
                        "metric": helper.metric(
                            actual[evaluation_indexes], pair_scores, labels,
                        ),
                    })
            for floor in CONFIDENCE_FLOORS:
                for pair in PAIRS:
                    gated_name = gated_candidate_names[(kind, floor, pair)]
                    model = models.get(pair)
                    gated_scores = (
                        rerank_top3(
                            base[evaluation_indexes], features[evaluation_indexes],
                            {pair: model}, labels, 1.0,
                            min_confidence=floor,
                        )
                        if model is not None else base[evaluation_indexes]
                    )
                    runs[gated_name].append({
                        "source": held_source,
                        "metric": helper.metric(
                            actual[evaluation_indexes], gated_scores, labels,
                        ),
                    })
            for config in COMBINATIONS:
                if config["kind"] != kind:
                    continue
                combination_scores = apply_combination(
                    base[evaluation_indexes], features[evaluation_indexes],
                    models, labels, config["members"],
                )
                runs[config["name"]].append({
                    "source": held_source,
                    "metric": helper.metric(
                        actual[evaluation_indexes], combination_scores, labels,
                    ),
                })
        folds.append(fold)
    candidates = {
        name: full.aggregate_runs(values) for name, values in runs.items()
    }
    baseline = candidates["incumbent"]["pooled"]
    ranking = sorted(candidates, key=lambda name: (
        candidates[name]["pooled"]["top1Accuracy"],
        candidates[name]["pooled"]["balancedTop1"],
        candidates[name]["pooled"]["minimumSourceTop1"],
    ), reverse=True)
    selected = next((
        name for name in ranking
        if candidates[name]["pooled"]["top1Accuracy"] >= baseline["top1Accuracy"]
        and candidates[name]["pooled"]["balancedTop1"] >= baseline["balancedTop1"]
        and candidates[name]["pooled"]["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and candidates[name]["pooled"]["top3Accuracy"] == baseline["top3Accuracy"]
    ), "incumbent")
    report = {
        "objective": "Convert incumbent Top3 coverage into leak-free audio-only Top1 gains.",
        "policy": {
            "metadataUsedAtInference": False,
            "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "top3CandidateSetChanged": False,
            "evaluationOnlyRowsTrainModels": False,
            "productionModelUpdated": False,
        },
        "dataset": {
            "cache": str(args.cache), "rows": len(actual), "labels": len(labels),
            "sources": held_sources, "pairs": [list(pair) for pair in PAIRS],
            "pairCandidateNames": {
                name: list(pair)
                for (_kind, _strength, pair), name in pair_candidate_names.items()
            },
            "gatedPairCandidateNames": {
                name: {"pair": list(pair), "confidenceFloor": floor}
                for (_kind, floor, pair), name in gated_candidate_names.items()
            },
            "combinations": [
                {
                    "name": config["name"],
                    "kind": config["kind"],
                    "members": [
                        {"pair": list(pair), "strength": strength}
                        for pair, strength in config["members"]
                    ],
                }
                for config in COMBINATIONS
            ],
        },
        "candidates": candidates,
        "ranking": ranking,
        "selected": selected,
        "goalDiagnostic": {
            "targetTop1": 80.0,
            "baselineTop1": baseline["top1Accuracy"],
            "selectedTop1": candidates[selected]["pooled"]["top1Accuracy"],
            "remainingGap": round(
                80.0 - candidates[selected]["pooled"]["top1Accuracy"], 2,
            ),
        },
        "folds": folds,
        "reproducibility": build_reproducibility(
            Path(__file__),
            dependencies=(HELPER_PATH, FULL_PATH, REPRO_PATH),
            inputs=(args.cache,),
            contract={
                "pairs": [list(pair) for pair in PAIRS],
                "strengths": list(STRENGTHS),
                "confidenceFloors": list(CONFIDENCE_FLOORS),
                "minimumRowsPerLabel": 8,
                "minimumIndependentSourcesPerLabel": 2,
                "candidateSet": "fixed-top3-only",
                "sourceWeighting": "inverse-label-source-count",
            },
            root=ROOT,
        ),
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    report = run(args)
    print(json.dumps({
        "selected": report["selected"],
        "score": report["candidates"][report["selected"]]["pooled"],
        "goalDiagnostic": report["goalDiagnostic"],
        "report": str(args.report),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
