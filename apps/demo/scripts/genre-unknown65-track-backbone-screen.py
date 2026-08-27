#!/usr/bin/env python3
"""Screen source-balanced 4x30 backbones blended with the incumbent model."""

from __future__ import annotations

import argparse
import importlib.util
import json
from collections import Counter
from pathlib import Path

import numpy as np
from sklearn.ensemble import ExtraTreesClassifier


ROOT = Path(__file__).resolve().parents[3]
PAIR_PATH = Path(__file__).with_name("genre-unknown65-track-pair-screen.py")
LISTWISE_PATH = Path(__file__).with_name("genre-unknown65-listwise-screen.py")
DEFAULT_OOF = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-incumbent-caphe-oof-audio-only.npz"
)
DEFAULT_DB = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "runtime-track-segment-features-v3_0.sqlite3"
)
DEFAULT_REPORT = ROOT / "genre-training/unknown65-track-backbone-screen.json"
DEFAULT_MARKDOWN = ROOT / "genre-training/unknown65-track-backbone-screen.md"
ALPHAS = (0.05, 0.10, 0.20, 0.30)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def source_label_weights(actual, sources, indexes):
    counts = Counter((actual[index], sources[index]) for index in indexes)
    values = np.asarray([
        1.0 / max(1, counts[(actual[index], sources[index])]) for index in indexes
    ], dtype=np.float64)
    return values / max(float(values.mean()), 1e-12)


def align_probabilities(model, values, labels):
    raw = model.predict_proba(values)
    source = {label: index for index, label in enumerate(model.classes_)}
    output = np.asarray([
        [row[source[label]] if label in source else 0.0 for label in labels]
        for row in raw
    ], dtype=np.float64)
    return output / np.maximum(output.sum(axis=1, keepdims=True), 1e-12)


def blend(base, candidate, alpha):
    output = base * (1.0 - alpha) + candidate * alpha
    return output / np.maximum(output.sum(axis=1, keepdims=True), 1e-12)


def top3_blend(base, candidate, alpha):
    output = base.copy()
    for row_index, row in enumerate(base):
        columns = np.argsort(-row, kind="stable")[:3]
        current = row[columns]
        current /= max(float(current.sum()), 1e-12)
        learned = candidate[row_index, columns]
        learned /= max(float(learned.sum()), 1e-12)
        target = current * (1.0 - alpha) + learned * alpha
        order = columns[np.argsort(-target, kind="stable")]
        output[row_index, order] = np.sort(row[columns])[::-1]
    return output


def render(report):
    lines = [
        "# Unknown65 exact 4x30 backbone screen", "",
        "Outer source-holdout with source-label weighting. Missing track features retain the incumbent prediction.", "",
        "| candidate | Top1 | balanced | minimum source | Top3 |",
        "|---|---:|---:|---:|---:|",
    ]
    for name in report["ranking"]:
        score = report["candidates"][name]
        lines.append(
            f"| {name} | {score['top1Accuracy']:.2f}% | {score['balancedTop1']:.2f}% | "
            f"{score['minimumSourceTop1']:.2f}% | {score['top3Accuracy']:.2f}% |"
        )
    lines.extend(["", f"Selected: **{report['selected']}**", ""])
    return "\n".join(lines)


def run(args):
    pair = load_module(PAIR_PATH, "unknown65_backbone_features")
    helper = load_module(LISTWISE_PATH, "unknown65_backbone_metrics")
    payload = np.load(args.oof)
    labels = [str(value) for value in payload["labels"]]
    actual = payload["actual"].astype(object)
    sources = payload["sources"].astype(object)
    eligible = payload["trainingEligible"].astype(bool)
    base = payload["selectedScores"].astype(np.float64)
    views, available = pair.load_track_views(args.track_db, payload["sourceKeys"])
    held_sources = sorted(source for source, count in Counter(sources).items() if count >= 8)
    names = ["incumbent"]
    for view in views:
        for alpha in ALPHAS:
            names.extend([
                f"{view}-global-a{alpha:g}", f"{view}-top3-a{alpha:g}",
            ])
    fold_scores = {name: [] for name in names}
    fold_actual = []
    fold_sources = []
    folds = []
    for source_index, held_source in enumerate(held_sources):
        train = np.flatnonzero((sources != held_source) & eligible & available)
        test = np.flatnonzero(sources == held_source)
        test_available = test[available[test]]
        owner = {row: local for local, row in enumerate(test)}
        fold_scores["incumbent"].append(base[test].copy())
        fold = {"heldOutSource": held_source, "trainingRows": len(train), "evaluationRows": len(test)}
        for view_index, (view, matrix) in enumerate(views.items()):
            model = ExtraTreesClassifier(
                n_estimators=420, max_features="sqrt", min_samples_leaf=2,
                class_weight="balanced", n_jobs=-1,
                random_state=165001 + source_index * 100 + view_index * 10,
            )
            model.fit(
                matrix[train], actual[train],
                sample_weight=source_label_weights(actual, sources, train),
            )
            learned = (
                align_probabilities(model, matrix[test_available], labels)
                if len(test_available) else np.empty((0, len(labels)), dtype=np.float64)
            )
            for alpha in ALPHAS:
                for mode in ("global", "top3"):
                    name = f"{view}-{mode}-a{alpha:g}"
                    output = base[test].copy()
                    available_base = base[test_available].copy()
                    adjusted = (
                        blend(available_base, learned, alpha)
                        if mode == "global" else top3_blend(available_base, learned, alpha)
                    )
                    for local, row in enumerate(test_available):
                        output[owner[int(row)]] = adjusted[local]
                    fold_scores[name].append(output)
        fold_actual.append(actual[test])
        fold_sources.append(sources[test])
        folds.append(fold)
    joined_actual = np.concatenate(fold_actual)
    joined_sources = np.concatenate(fold_sources)
    candidates = {
        name: helper.metric(
            joined_actual, np.concatenate(fold_scores[name]), labels, joined_sources,
        )
        for name in names
    }
    ranking = sorted(candidates, key=lambda name: (
        candidates[name]["top1Accuracy"], candidates[name]["balancedTop1"],
        candidates[name]["minimumSourceTop1"], candidates[name]["top3Accuracy"],
    ), reverse=True)
    report = {
        "objective": "Strict exact-4x30 source-heldout backbone screen toward 65% Top1.",
        "policy": {
            "metadataUsedAtInference": False, "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
        },
        "featureContractSha256": "ea833af2bcfb08af88098281a02fc5dbc9b45661fee6c609cab7299e4d03f7fe",
        "dataset": {"rows": len(joined_actual), "trackFeatureRows": int(np.sum(available))},
        "candidates": candidates, "ranking": ranking, "selected": ranking[0],
        "folds": folds,
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=DEFAULT_OOF)
    parser.add_argument("--track-db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    print(render(run(args)))


if __name__ == "__main__":
    main()
