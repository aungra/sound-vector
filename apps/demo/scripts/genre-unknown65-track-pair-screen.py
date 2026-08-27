#!/usr/bin/env python3
"""Evaluate exact 4x30 track features as source-heldout Top3 pair heads."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sqlite3
import zlib
from collections import Counter
from pathlib import Path

import numpy as np
from sklearn.decomposition import PCA
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


ROOT = Path(__file__).resolve().parents[3]
LISTWISE_PATH = Path(__file__).with_name("genre-unknown65-listwise-screen.py")
RHYTHM_INDEXES = np.asarray([
    *range(0, 7), *range(397, 403), *range(403, 547),
], dtype=np.int64)
DEFAULT_OOF = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-incumbent-caphe-oof-audio-only.npz"
)
DEFAULT_DB = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "runtime-track-segment-features-v3_0.sqlite3"
)
DEFAULT_REPORT = ROOT / "genre-training/unknown65-track-pair-screen.json"
DEFAULT_MARKDOWN = ROOT / "genre-training/unknown65-track-pair-screen.md"


PAIR_CONFIGS = (
    {"labels": ("ハウス", "テクノ"), "view": "effnet", "kind": "logistic", "weight": 0.10, "floor": 0.80, "topk": 2},
    {"labels": ("パンク", "ロック"), "view": "effnet", "kind": "logistic", "weight": 0.50, "floor": 0.70, "topk": 2},
    {"labels": ("パンク", "ロック"), "view": "effnet", "kind": "trees", "weight": 0.25, "floor": 0.50, "topk": 2},
    {"labels": ("ディープ・ハウス", "ハウス"), "view": "rhythm", "kind": "trees", "weight": 0.10, "floor": 0.70, "topk": 2},
    {"labels": ("テクノ", "トランス"), "view": "rhythm", "kind": "trees", "weight": 0.10, "floor": 0.50, "topk": 3},
    {"labels": ("ドローン", "ノイズミュージック"), "view": "rhythm", "kind": "logistic", "weight": 0.25, "floor": 0.50, "topk": 3},
    {"labels": ("ファンク", "ロック"), "view": "rhythm", "kind": "trees", "weight": 0.25, "floor": 0.65, "topk": 3},
    {"labels": ("ブルース", "フォーク"), "view": "rhythm", "kind": "trees", "weight": 0.25, "floor": 0.65, "topk": 3},
    {"labels": ("レゲエ", "ダブ"), "view": "rhythm", "kind": "trees", "weight": 0.25, "floor": 0.65, "topk": 3},
    {"labels": ("ラテン", "フォーク"), "view": "rhythm", "kind": "trees", "weight": 0.25, "floor": 0.65, "topk": 3},
)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def decode(blob, expected):
    values = np.frombuffer(zlib.decompress(blob), dtype=np.float32)
    if len(values) != expected:
        raise ValueError(f"decoded {len(values)} values; expected {expected}")
    return values.copy()


def load_track_views(path, source_keys):
    segments = {}
    connection = sqlite3.connect(path)
    try:
        rows = connection.execute(
            "select source_key,segment_index,effnet_tail,librosa from segments "
            "order by source_key,segment_index"
        )
        for key, _index, effnet_blob, librosa_blob in rows:
            segments.setdefault(key, []).append((
                decode(effnet_blob, 3840), decode(librosa_blob, 547),
            ))
    finally:
        connection.close()
    effnet = np.zeros((len(source_keys), 3840 * 5), dtype=np.float32)
    rhythm = np.zeros((len(source_keys), len(RHYTHM_INDEXES) * 5), dtype=np.float32)
    available = np.zeros(len(source_keys), dtype=bool)
    for row_index, key in enumerate(source_keys):
        values = segments.get(str(key), [])
        if len(values) != 4:
            continue
        effnet_segments = np.asarray([row[0] for row in values], dtype=np.float32)
        rhythm_segments = np.asarray([
            row[1][RHYTHM_INDEXES] for row in values
        ], dtype=np.float32)
        effnet[row_index] = np.concatenate([
            *effnet_segments, np.mean(effnet_segments, axis=0),
        ])
        rhythm[row_index] = np.concatenate([
            *rhythm_segments, np.mean(rhythm_segments, axis=0),
        ])
        available[row_index] = True
    return {"effnet": effnet, "rhythm": rhythm}, available


def source_label_weights(actual, sources, indexes):
    counts = Counter((actual[index], sources[index]) for index in indexes)
    weights = np.asarray([
        1.0 / max(1, counts[(actual[index], sources[index])]) for index in indexes
    ], dtype=np.float64)
    return weights / max(float(weights.mean()), 1e-12)


def fit_model(config, values, actual, sources, indexes, seed):
    pair = set(config["labels"])
    selected = np.asarray([
        index for index in indexes if actual[index] in pair
    ], dtype=np.int64)
    counts = Counter(actual[selected])
    source_counts = {
        label: len(set(sources[selected][actual[selected] == label]))
        for label in pair
    }
    if min((counts.get(label, 0) for label in pair), default=0) < 8:
        return None, {"status": "insufficient-rows", "counts": dict(counts)}
    if min(source_counts.values(), default=0) < 2:
        return None, {"status": "insufficient-sources", "sources": source_counts}
    if config["kind"] == "trees":
        model = ExtraTreesClassifier(
            n_estimators=300, min_samples_leaf=2, class_weight="balanced",
            n_jobs=-1, random_state=seed,
        )
        model.fit(
            values[selected], actual[selected],
            sample_weight=source_label_weights(actual, sources, selected),
        )
    else:
        components = max(2, min(24, len(selected) - 2, values.shape[1]))
        model = make_pipeline(
            StandardScaler(), PCA(n_components=components, whiten=True, random_state=seed),
            LogisticRegression(
                C=0.2, class_weight="balanced", max_iter=1600,
                random_state=seed,
            ),
        )
        model.fit(
            values[selected], actual[selected],
            logisticregression__sample_weight=source_label_weights(actual, sources, selected),
        )
    return model, {
        "status": "fitted", "counts": dict(counts), "sources": source_counts,
    }


def apply_pair(scores, values, indexes, labels, config, model):
    output = scores.copy()
    label_index = {label: index for index, label in enumerate(labels)}
    pair_columns = [label_index[label] for label in config["labels"]]
    changed = 0
    applied = 0
    for local_index, row_index in enumerate(indexes):
        topk = np.argsort(-output[local_index], kind="stable")[:config["topk"]]
        if not all(column in topk for column in pair_columns):
            continue
        learned = model.predict_proba(values[row_index].reshape(1, -1))[0]
        classes = list(model.classes_)
        evidence = np.asarray([
            learned[classes.index(label)] for label in config["labels"]
        ], dtype=np.float64)
        if float(np.max(evidence)) < config["floor"]:
            continue
        current = output[local_index, pair_columns].copy()
        current /= max(float(np.sum(current)), 1e-12)
        target = current * (1.0 - config["weight"]) + evidence * config["weight"]
        order = np.asarray(pair_columns)[np.argsort(-target, kind="stable")]
        before = int(np.argmax(output[local_index]))
        output[local_index, order] = np.sort(output[local_index, pair_columns])[::-1]
        changed += before != int(np.argmax(output[local_index]))
        applied += 1
    return output, applied, changed


def config_name(index, config):
    return f"pair{index + 1}-{config['view']}-{config['kind']}"


def render(report):
    lines = [
        "# Unknown65 exact 4x30 pair screen", "",
        "Outer source-holdout; exact track feature contract; Top3 values and set are fixed.", "",
        "| candidate | Top1 | balanced | minimum source | Top3 | changed |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for name in report["ranking"]:
        candidate = report["candidates"][name]
        score = candidate["metric"]
        lines.append(
            f"| {name} | {score['top1Accuracy']:.2f}% | {score['balancedTop1']:.2f}% | "
            f"{score['minimumSourceTop1']:.2f}% | {score['top3Accuracy']:.2f}% | "
            f"{candidate['changedRows']} |"
        )
    lines.extend(["", f"Selected: **{report['selected']}**", ""])
    return "\n".join(lines)


def run(args):
    helper = load_module(LISTWISE_PATH, "unknown65_pair_helper")
    payload = np.load(args.oof)
    labels = [str(value) for value in payload["labels"]]
    actual = payload["actual"].astype(object)
    sources = payload["sources"].astype(object)
    eligible = payload["trainingEligible"].astype(bool)
    base = payload["selectedScores"].astype(np.float64)
    views, available = load_track_views(args.track_db, payload["sourceKeys"])
    held_sources = sorted(source for source, count in Counter(sources).items() if count >= 8)
    names = [config_name(index, config) for index, config in enumerate(PAIR_CONFIGS)]
    names.append("all-pairs")
    outputs = {name: [] for name in names}
    changed = Counter()
    applied = Counter()
    fold_actual = []
    fold_sources = []
    diagnostics = []
    for source_index, held_source in enumerate(held_sources):
        train = np.flatnonzero((sources != held_source) & eligible & available)
        test = np.flatnonzero(sources == held_source)
        test_available = test[available[test]]
        models = []
        fold_diagnostics = {"heldOutSource": held_source, "pairs": []}
        for config_index, config in enumerate(PAIR_CONFIGS):
            model, detail = fit_model(
                config, views[config["view"]], actual, sources, train,
                108001 + source_index * 1000 + config_index * 10,
            )
            models.append(model)
            fold_diagnostics["pairs"].append({
                "name": config_name(config_index, config), **detail,
            })
        owner = {row: local for local, row in enumerate(test)}
        sequential = base[test].copy()
        for config_index, (config, model) in enumerate(zip(PAIR_CONFIGS, models)):
            name = config_name(config_index, config)
            candidate = base[test].copy()
            if model is not None and len(test_available):
                available_scores, apply_count, change_count = apply_pair(
                    base[test_available].copy(), views[config["view"]],
                    test_available, labels, config, model,
                )
                for local, row in enumerate(test_available):
                    candidate[owner[int(row)]] = available_scores[local]
                sequential_available = np.asarray([
                    sequential[owner[int(row)]] for row in test_available
                ])
                sequential_available, sequence_applied, sequence_changed = apply_pair(
                    sequential_available, views[config["view"]], test_available,
                    labels, config, model,
                )
                for local, row in enumerate(test_available):
                    sequential[owner[int(row)]] = sequential_available[local]
                applied["all-pairs"] += sequence_applied
                changed["all-pairs"] += sequence_changed
                applied[name] += apply_count
                changed[name] += change_count
            outputs[name].append(candidate)
        outputs["all-pairs"].append(sequential)
        fold_actual.append(actual[test])
        fold_sources.append(sources[test])
        diagnostics.append(fold_diagnostics)
    joined_actual = np.concatenate(fold_actual)
    joined_sources = np.concatenate(fold_sources)
    baseline_indexes = np.concatenate([
        np.flatnonzero(sources == source) for source in held_sources
    ])
    candidates = {
        "incumbent": {
            "metric": helper.metric(joined_actual, base[baseline_indexes], labels, joined_sources),
            "appliedRows": 0, "changedRows": 0,
        }
    }
    for name in names:
        candidates[name] = {
            "metric": helper.metric(
                joined_actual, np.concatenate(outputs[name]), labels, joined_sources,
            ),
            "appliedRows": applied[name], "changedRows": changed[name],
        }
    ranking = sorted(candidates, key=lambda name: (
        candidates[name]["metric"]["top1Accuracy"],
        candidates[name]["metric"]["balancedTop1"],
        candidates[name]["metric"]["minimumSourceTop1"],
    ), reverse=True)
    report = {
        "objective": "Strict exact-4x30 source-heldout pair screen toward 65% Top1.",
        "policy": {
            "metadataUsedAtInference": False, "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False, "candidateSetChanged": False,
        },
        "featureContractSha256": "ea833af2bcfb08af88098281a02fc5dbc9b45661fee6c609cab7299e4d03f7fe",
        "dataset": {
            "rows": len(joined_actual), "trackFeatureRows": int(np.sum(available)),
            "sources": held_sources,
        },
        "candidates": candidates, "ranking": ranking,
        "selected": ranking[0], "folds": diagnostics,
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
