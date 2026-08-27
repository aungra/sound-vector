#!/usr/bin/env python3
"""Cross-source screen for a Top3-only listwise genre reranker."""

from __future__ import annotations

import argparse
import json
import sqlite3
import zlib
from collections import Counter
from pathlib import Path

import numpy as np
from sklearn.ensemble import ExtraTreesClassifier


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OOF = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-incumbent-caphe-oof-audio-only.npz"
)
DEFAULT_LIBROSA = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "librosa-feature-cache.json"
)
DEFAULT_REPORT = ROOT / "genre-training/unknown65-listwise-screen.json"
DEFAULT_MARKDOWN = ROOT / "genre-training/unknown65-listwise-screen.md"
DEFAULT_TRACK_DB = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "runtime-track-segment-features-v3_0.sqlite3"
)


CONFIGS = (
    {"name": "single-leaf4-a025", "view": "single", "leaf": 4, "alpha": 0.25},
    {"name": "single-leaf4-a050", "view": "single", "leaf": 4, "alpha": 0.50},
    {"name": "track-leaf2-a025", "view": "track", "leaf": 2, "alpha": 0.25},
    {"name": "track-leaf2-a050", "view": "track", "leaf": 2, "alpha": 0.50},
    {"name": "track-leaf4-a025", "view": "track", "leaf": 4, "alpha": 0.25},
    {"name": "track-leaf4-a050", "view": "track", "leaf": 4, "alpha": 0.50},
    {"name": "track-leaf8-a025", "view": "track", "leaf": 8, "alpha": 0.25},
    {"name": "track-leaf8-a050", "view": "track", "leaf": 8, "alpha": 0.50},
)


def normalize_rows(values):
    output = np.maximum(np.asarray(values, dtype=np.float64), 1e-12)
    return output / np.maximum(output.sum(axis=1, keepdims=True), 1e-12)


def load_librosa(path, keys):
    payload = json.loads(path.read_text())
    matrix = np.zeros((len(keys), 547), dtype=np.float32)
    available = np.zeros(len(keys), dtype=bool)
    for index, key in enumerate(keys):
        value = payload.get(str(key))
        if isinstance(value, list) and len(value) == 547:
            matrix[index] = np.asarray(value, dtype=np.float32)
            available[index] = bool(np.all(np.isfinite(matrix[index])))
    return matrix, available


def decode_float32(blob, expected):
    values = np.frombuffer(zlib.decompress(blob), dtype=np.float32)
    if len(values) != expected:
        raise ValueError(f"track feature length {len(values)} differs from {expected}")
    return values


def load_track_librosa(path, keys):
    by_key = {}
    connection = sqlite3.connect(path)
    try:
        for source_key, _segment_index, blob in connection.execute(
            "select source_key, segment_index, librosa from segments "
            "order by source_key, segment_index"
        ):
            by_key.setdefault(source_key, []).append(decode_float32(blob, 547))
    finally:
        connection.close()
    matrix = np.zeros((len(keys), 547 * 4), dtype=np.float32)
    available = np.zeros(len(keys), dtype=bool)
    for index, key in enumerate(keys):
        segments = by_key.get(str(key), [])
        if len(segments) != 4:
            continue
        values = np.asarray(segments, dtype=np.float32)
        matrix[index] = np.concatenate([
            np.median(values, axis=0),
            np.var(values, axis=0),
            np.max(values, axis=0) - np.min(values, axis=0),
            values[-1] - values[0],
        ])
        available[index] = bool(np.all(np.isfinite(matrix[index])))
    return matrix, available


def metric(actual, scores, labels, sources=None):
    scores = np.asarray(scores)
    order = np.argsort(-scores, axis=1, kind="stable")
    predicted = np.asarray(labels, dtype=object)[order[:, 0]]
    correct = predicted == actual
    recalls = [
        float(np.mean(correct[actual == label]))
        for label in sorted(set(actual)) if np.any(actual == label)
    ]
    result = {
        "total": len(actual),
        "top1Accuracy": round(float(np.mean(correct)) * 100, 2),
        "balancedTop1": round(float(np.mean(recalls)) * 100, 2),
        "top3Accuracy": round(float(np.mean([
            label in np.asarray(labels, dtype=object)[row[:3]]
            for label, row in zip(actual, order)
        ])) * 100, 2),
    }
    if sources is not None:
        per_source = {
            source: round(float(np.mean(correct[sources == source])) * 100, 2)
            for source in sorted(set(sources))
        }
        result["bySourceTop1"] = per_source
        result["minimumSourceTop1"] = min(per_source.values(), default=0.0)
    return result


def candidate_rows(features, base_scores, actual, labels, indexes):
    labels = np.asarray(labels, dtype=object)
    base = normalize_rows(base_scores[indexes])
    top3 = np.argsort(-base, axis=1, kind="stable")[:, :3]
    eligible = np.asarray([
        label in labels[candidates]
        for label, candidates in zip(actual[indexes], top3)
    ], dtype=bool)
    selected_indexes = indexes[eligible]
    selected_base = base[eligible]
    selected_top3 = top3[eligible]
    expanded = []
    targets = []
    row_owners = []
    candidate_columns = []
    identity = np.eye(len(labels), dtype=np.float32)
    for local_index, (row_index, candidates) in enumerate(zip(selected_indexes, selected_top3)):
        for rank, candidate in enumerate(candidates):
            diagnostics = np.asarray([
                selected_base[local_index, candidate],
                selected_base[local_index, candidates[0]] - selected_base[local_index, candidate],
                rank / 2.0,
            ], dtype=np.float32)
            expanded.append(np.concatenate([
                features[row_index], selected_base[local_index].astype(np.float32),
                identity[candidate], identity[candidates[0]], diagnostics,
            ]))
            targets.append(float(labels[candidate] == actual[row_index]))
            row_owners.append(row_index)
            candidate_columns.append(candidate)
    return (
        np.asarray(expanded, dtype=np.float32),
        np.asarray(targets, dtype=np.int8),
        np.asarray(row_owners, dtype=np.int64),
        np.asarray(candidate_columns, dtype=np.int64),
    )


def source_label_weights(actual, sources, row_owners):
    counts = Counter((actual[index], sources[index]) for index in set(row_owners.tolist()))
    weights = np.asarray([
        1.0 / max(1, counts[(actual[index], sources[index])])
        for index in row_owners
    ], dtype=np.float64)
    return weights / max(float(weights.mean()), 1e-12)


def rerank(model, features, base_scores, actual, labels, indexes, alpha):
    output = np.asarray(base_scores[indexes], dtype=np.float64).copy()
    rows, _targets, owners, candidates = candidate_rows(
        features, base_scores, actual, labels, indexes,
    )
    if not len(rows):
        return output, 0
    probability = model.predict_proba(rows)[:, list(model.classes_).index(1)]
    owner_to_local = {row: local for local, row in enumerate(indexes)}
    changed = 0
    for owner in np.unique(owners):
        mask = owners == owner
        columns = candidates[mask]
        learned = probability[mask]
        local = owner_to_local[int(owner)]
        current = normalize_rows(output[local, columns].reshape(1, -1))[0]
        target = current * (1.0 - alpha) + normalize_rows(learned.reshape(1, -1))[0] * alpha
        order = columns[np.argsort(-target, kind="stable")]
        previous = int(np.argmax(output[local]))
        output[local, order] = np.sort(output[local, columns])[::-1]
        changed += previous != int(np.argmax(output[local]))
    return output, changed


def render(report):
    lines = [
        "# Unknown65 listwise Top3 screen", "",
        "Audio-only outer source-holdout. The reranker may only reorder the incumbent Top3.", "",
        "| candidate | Top1 | balanced | minimum source | Top3 | changed |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for name in report["ranking"]:
        score = report["candidates"][name]["metric"]
        lines.append(
            f"| {name} | {score['top1Accuracy']:.2f}% | {score['balancedTop1']:.2f}% | "
            f"{score['minimumSourceTop1']:.2f}% | {score['top3Accuracy']:.2f}% | "
            f"{report['candidates'][name]['changedRows']} |"
        )
    lines.extend(["", f"Selected: **{report['selected']}**", ""])
    return "\n".join(lines)


def run(args):
    payload = np.load(args.oof)
    base = payload["selectedScores"].astype(np.float64)
    labels = [str(value) for value in payload["labels"]]
    actual = payload["actual"].astype(object)
    sources = payload["sources"].astype(object)
    eligible = payload["trainingEligible"].astype(bool)
    librosa, single_available = load_librosa(args.librosa, payload["sourceKeys"])
    track_librosa, track_available = load_track_librosa(args.track_db, payload["sourceKeys"])
    views = {"single": librosa, "track": track_librosa}
    view_available = {"single": single_available, "track": track_available}
    available = single_available | track_available
    held_sources = sorted(source for source, count in Counter(sources).items() if count >= 8)
    fold_outputs = {config["name"]: [] for config in CONFIGS}
    fold_actual = []
    fold_sources = []
    changes = Counter()
    folds = []
    for source_index, held_source in enumerate(held_sources):
        train_by_view = {
            view: np.flatnonzero((sources != held_source) & eligible & view_available[view])
            for view in views
        }
        test = np.flatnonzero(sources == held_source)
        fold = {
            "heldOutSource": held_source,
            "evaluationRows": len(test),
        }
        models = {}
        for view_index, (view, feature_matrix) in enumerate(views.items()):
            rows, targets, owners, _candidates = candidate_rows(
                feature_matrix, base, actual, labels, train_by_view[view],
            )
            fold[f"{view}TrainingTracks"] = len(set(owners.tolist()))
            fold[f"{view}TrainingCandidateRows"] = len(rows)
            for leaf in sorted(set(
                config["leaf"] for config in CONFIGS if config["view"] == view
            )):
                model = ExtraTreesClassifier(
                    n_estimators=240, max_features="sqrt", min_samples_leaf=leaf,
                    class_weight="balanced", n_jobs=-1,
                    random_state=65001 + source_index * 100 + view_index * 10 + leaf,
                )
                model.fit(rows, targets, sample_weight=source_label_weights(actual, sources, owners))
                models[(view, leaf)] = model
        for config in CONFIGS:
            view = config["view"]
            test_available = test[view_available[view][test]]
            available_scores, changed = rerank(
                models[(view, config["leaf"])], views[view], base, actual, labels,
                test_available, config["alpha"],
            )
            scores = base[test].copy()
            local_positions = {
                row_index: local_index for local_index, row_index in enumerate(test)
            }
            for local_index, row_index in enumerate(test_available):
                scores[local_positions[int(row_index)]] = available_scores[local_index]
            fold_outputs[config["name"]].append(scores)
            changes[config["name"]] += changed
        fold_actual.append(actual[test])
        fold_sources.append(sources[test])
        folds.append(fold)
    joined_actual = np.concatenate(fold_actual)
    joined_sources = np.concatenate(fold_sources)
    baseline_indexes = np.concatenate([
        np.flatnonzero(sources == source) for source in held_sources
    ])
    candidates = {
        "incumbent": {
            "metric": metric(joined_actual, base[baseline_indexes], labels, joined_sources),
            "changedRows": 0,
        }
    }
    for config in CONFIGS:
        name = config["name"]
        candidates[name] = {
            "metric": metric(
                joined_actual, np.concatenate(fold_outputs[name]), labels, joined_sources,
            ),
            "changedRows": changes[name],
            "config": config,
        }
    ranking = sorted(candidates, key=lambda name: (
        candidates[name]["metric"]["top1Accuracy"],
        candidates[name]["metric"]["balancedTop1"],
        candidates[name]["metric"]["minimumSourceTop1"],
    ), reverse=True)
    report = {
        "objective": "Strict outer-source Top3 listwise reranker screen toward 65% Top1.",
        "policy": {
            "metadataUsedAtInference": False,
            "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "candidateSetChanged": False,
        },
        "dataset": {
            "rows": len(joined_actual), "sources": held_sources,
            "availableSingleRows": int(np.sum(single_available)),
            "availableTrackRows": int(np.sum(track_available)),
        },
        "candidates": candidates, "ranking": ranking,
        "selected": ranking[0], "folds": folds,
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=DEFAULT_OOF)
    parser.add_argument("--librosa", type=Path, default=DEFAULT_LIBROSA)
    parser.add_argument("--track-db", type=Path, default=DEFAULT_TRACK_DB)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    report = run(args)
    print(render(report))


if __name__ == "__main__":
    main()
