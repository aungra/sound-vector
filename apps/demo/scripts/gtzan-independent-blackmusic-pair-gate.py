#!/usr/bin/env python3
"""Gate independent-source pair heads on evaluation-only GTZAN."""

from __future__ import annotations

import argparse
import importlib.util
import json
from collections import Counter
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
ABLATION_PATH = Path(__file__).with_name(
    "genre-unknown80-independent-blackmusic-pair-ablation.py"
)
DEFAULT_OOF = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-incumbent-caphe-oof-audio-only.npz"
)
DEFAULT_FORMAL_LIBROSA = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "librosa-feature-cache.json"
)
DEFAULT_OVERLAY_MANIFEST = (
    TRAINING / "unknown80-independent-blackmusic-candidate-manifest.json"
)
DEFAULT_OVERLAY_LIBROSA = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-independent-blackmusic-librosa.json"
)
DEFAULT_GTZAN_MANIFEST = TRAINING / "gtzan-filtered-evaluation-manifest.json"
DEFAULT_GTZAN_LIBROSA = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/gtzan/"
    "production-librosa-30s.json"
)
DEFAULT_GTZAN_PREDICTIONS = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/gtzan/"
    "production-transfer-predictions-v2.jsonl"
)
DEFAULT_REPORT = TRAINING / "gtzan-independent-blackmusic-pair-gate.json"
DEFAULT_MARKDOWN = TRAINING / "gtzan-independent-blackmusic-pair-gate.md"
CONFIGS = {
    "funk-rock-logistic-rhythm-w0.5": (
        ("ファンク", "ロック"), "logistic", "rhythm", 0.5,
    ),
    "funk-rock-logistic-rhythm-w0.75": (
        ("ファンク", "ロック"), "logistic", "rhythm", 0.75,
    ),
    "blues-folk-logistic-full-w0.25": (
        ("ブルース", "フォーク"), "logistic", "full", 0.25,
    ),
    "blues-rock-extra-trees-full-w0.25": (
        ("ブルース", "ロック"), "extra-trees", "full", 0.25,
    ),
    "reggae-dub-extra-trees-full-w0.25": (
        ("レゲエ", "ダブ"), "extra-trees", "full", 0.25,
    ),
}
COMBINATIONS = {
    "incumbent": (),
    **{name: (name,) for name in CONFIGS},
    "conservative-three-pair": (
        "funk-rock-logistic-rhythm-w0.5",
        "blues-folk-logistic-full-w0.25",
        "reggae-dub-extra-trees-full-w0.25",
    ),
    "conservative-four-pair": (
        "funk-rock-logistic-rhythm-w0.5",
        "blues-folk-logistic-full-w0.25",
        "blues-rock-extra-trees-full-w0.25",
        "reggae-dub-extra-trees-full-w0.25",
    ),
}


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_predictions(path):
    rows = {}
    for line in Path(path).read_text().splitlines():
        if line.strip():
            row = json.loads(line)
            rows[row["trackId"]] = row
    return rows


def score_matrix(rows, predictions, labels):
    label_index = {label: index for index, label in enumerate(labels)}
    output = np.full((len(rows), len(labels)), 1e-12, dtype=np.float64)
    for row_index, row in enumerate(rows):
        prediction = predictions[row["trackId"]]
        for item in prediction.get("baselineTop", []):
            if item["label"] in label_index:
                output[row_index, label_index[item["label"]]] = float(item["score"])
    return output


def fit_config(module, config, formal, actual, sources, eligible, overlay, overlay_rows):
    pair, kind, view, _strength = config
    indexes = np.flatnonzero(eligible & np.isin(actual, pair))
    selected_overlay = np.asarray([
        index for index, row in enumerate(overlay_rows) if row["genre"] in pair
    ], dtype=np.int64)
    matrix = formal[indexes]
    train_actual = actual[indexes]
    train_sources = sources[indexes]
    overlay_mask = np.zeros(len(indexes), dtype=bool)
    if selected_overlay.size:
        matrix = np.concatenate([matrix, overlay[selected_overlay]])
        train_actual = np.concatenate([
            train_actual,
            np.asarray([overlay_rows[index]["genre"] for index in selected_overlay]),
        ])
        train_sources = np.concatenate([
            train_sources,
            np.asarray([overlay_rows[index]["source"] for index in selected_overlay]),
        ])
        overlay_mask = np.concatenate([
            overlay_mask, np.ones(len(selected_overlay), dtype=bool),
        ])
    counts = Counter(train_actual)
    source_counts = {
        label: len(set(train_sources[train_actual == label])) for label in pair
    }
    if min(counts.get(label, 0) for label in pair) < 8 or min(source_counts.values()) < 2:
        raise ValueError(f"insufficient training coverage for {pair}")
    model = module.fit_model(
        kind,
        module.feature_view(matrix, view),
        train_actual,
        module.source_label_weights(train_actual, train_sources, overlay_mask),
        991001 + list(CONFIGS).index(next(
            name for name, value in CONFIGS.items() if value == config
        )) * 100,
    )
    return model, {
        "rows": dict(counts), "sourcesPerLabel": source_counts,
        "overlayRows": int(len(selected_overlay)),
    }


def apply_config(module, scores, features, model, labels, config):
    pair, _kind, view, strength = config
    label_index = {label: index for index, label in enumerate(labels)}
    pair_indexes = {label_index[label] for label in pair}
    top3 = np.argsort(-scores, axis=1)[:, :3]
    applicable = np.asarray([
        pair_indexes.issubset(set(candidates)) for candidates in top3
    ], dtype=bool)
    return module.rerank_pair(
        scores, module.feature_view(features, view), model, labels,
        pair, strength, applicable,
    ), int(np.sum(applicable))


def changes(base, candidate, actual, labels):
    labels = np.asarray(labels)
    before = np.argmax(base, axis=1)
    after = np.argmax(candidate, axis=1)
    changed = before != after
    return {
        "changedTop1": int(np.sum(changed)),
        "improved": int(np.sum(
            changed & (labels[after] == actual) & (labels[before] != actual)
        )),
        "harmed": int(np.sum(
            changed & (labels[after] != actual) & (labels[before] == actual)
        )),
    }


def render(report):
    lines = [
        "# GTZAN independent black-music pair gate", "",
        "GTZAN remains evaluation-only and contributes no training rows.", "",
        "| candidate | Top1 | balanced | Top3 | changed | + / - |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for name in report["ranking"]:
        score = report["candidates"][name]
        lines.append(
            f"| {name} | {score['top1Accuracy']:.2f}% | "
            f"{score['balancedTop1']:.2f}% | {score['top3Accuracy']:.2f}% | "
            f"{score['changedTop1']} | {score['improved']} / {score['harmed']} |"
        )
    lines.extend(["", f"Decision: **{report['decision']}**", ""])
    return "\n".join(lines)


def run(args):
    module = load_module(ABLATION_PATH, "gtzan_blackmusic_ablation")
    payload = np.load(args.oof)
    labels = list(payload["labels"])
    formal, available = module.align_features(
        payload["sourceKeys"], module.load_feature_cache(args.formal_librosa)
    )
    eligible = payload["trainingEligible"].astype(bool) & available
    overlay_rows, overlay = module.load_overlay(
        args.overlay_manifest, args.overlay_librosa
    )
    manifest = json.loads(args.gtzan_manifest.read_text())
    rows = manifest["items"]
    predictions = load_predictions(args.gtzan_predictions)
    if any(row["trackId"] not in predictions for row in rows):
        raise ValueError("GTZAN production predictions are incomplete")
    gtzan_cache = module.load_feature_cache((args.gtzan_librosa,))
    gtzan, gtzan_available = module.align_features(
        [module.source_key(row) for row in rows], gtzan_cache
    )
    if not np.all(gtzan_available):
        raise ValueError("GTZAN librosa cache is incomplete")
    base = score_matrix(rows, predictions, labels)
    actual = np.asarray([row["genre"] for row in rows], dtype=object)
    evaluation_sources = np.asarray(["GTZAN"] * len(rows), dtype=object)
    models = {}
    training = {}
    for name, config in CONFIGS.items():
        models[name], training[name] = fit_config(
            module, config, formal, payload["actual"], payload["sources"],
            eligible, overlay, overlay_rows,
        )
    candidates = {}
    applicability = {}
    for name, members in COMBINATIONS.items():
        scores = base.copy()
        applicability[name] = {}
        for member in members:
            scores, count = apply_config(
                module, scores, gtzan, models[member], labels, CONFIGS[member]
            )
            applicability[name][member] = count
        metric = module.metric(
            actual, scores, labels, evaluation_sources
        )
        metric.update(changes(base, scores, actual, labels))
        candidates[name] = metric
    incumbent = candidates["incumbent"]
    eligible_names = [
        name for name, score in candidates.items() if name != "incumbent"
        and score["top1Accuracy"] >= incumbent["top1Accuracy"]
        and score["balancedTop1"] >= incumbent["balancedTop1"]
        and score["top3Accuracy"] >= incumbent["top3Accuracy"]
        and score["harmed"] <= score["improved"]
    ]
    ranking = sorted(candidates, key=lambda name: (
        candidates[name]["top1Accuracy"], candidates[name]["balancedTop1"]
    ), reverse=True)
    report = {
        "objective": "Gate source-heldout pair candidates on unseen GTZAN without training on GTZAN.",
        "policy": {
            "gtzanTrainingRows": 0,
            "gtzanEvaluationOnly": True,
            "metadataUsedAtInference": False,
            "productionModelUpdated": False,
        },
        "dataset": {"rows": len(rows), "genres": dict(Counter(actual))},
        "training": training,
        "candidates": candidates,
        "applicability": applicability,
        "ranking": ranking,
        "promotionScreen": eligible_names,
        "decision": (
            "continue-cross-fitted-gate" if eligible_names
            else "reject-outer-source-regression"
        ),
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=DEFAULT_OOF)
    parser.add_argument("--formal-librosa", type=Path, action="append", default=[])
    parser.add_argument("--overlay-manifest", type=Path, default=DEFAULT_OVERLAY_MANIFEST)
    parser.add_argument("--overlay-librosa", type=Path, default=DEFAULT_OVERLAY_LIBROSA)
    parser.add_argument("--gtzan-manifest", type=Path, default=DEFAULT_GTZAN_MANIFEST)
    parser.add_argument("--gtzan-librosa", type=Path, default=DEFAULT_GTZAN_LIBROSA)
    parser.add_argument("--gtzan-predictions", type=Path, default=DEFAULT_GTZAN_PREDICTIONS)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    if not args.formal_librosa:
        args.formal_librosa = [DEFAULT_FORMAL_LIBROSA]
    report = run(args)
    print(json.dumps({
        "decision": report["decision"],
        "promotionScreen": report["promotionScreen"],
        "ranking": [
            {"name": name, **report["candidates"][name]}
            for name in report["ranking"]
        ],
        "report": str(args.report),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
