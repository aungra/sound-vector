#!/usr/bin/env python3
"""Screen source-isolated electronic boundary heads on top of v99."""

from __future__ import annotations

import argparse
import importlib.util
import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
BLACK_SCRIPT = Path(__file__).with_name(
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
DEFAULT_BLACK_MANIFEST = (
    TRAINING / "unknown80-independent-blackmusic-candidate-manifest.json"
)
DEFAULT_BLACK_LIBROSA = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-independent-blackmusic-librosa.json"
)
DEFAULT_OVERLAY_MANIFEST = (
    TRAINING / "unknown80-independent-electronic-candidate-manifest.json"
)
DEFAULT_OVERLAY_LIBROSA = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-independent-electronic-librosa.json"
)
DEFAULT_REPORT = TRAINING / "unknown80-independent-electronic-ablation.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-independent-electronic-ablation.md"
V99_MEMBERS = (
    (("ファンク", "ロック"), "logistic", "rhythm", 0.5),
    (("ブルース", "フォーク"), "logistic", "full", 0.25),
    (("レゲエ", "ダブ"), "extra-trees", "full", 0.25),
)
GROUPS = (
    ("テクノ", "ハウス"),
    ("ハウス", "ディープ・ハウス"),
    ("テクノ", "トランス"),
    ("テクノ", "ハウス", "ディープ・ハウス"),
)
MODELS = ("logistic", "extra-trees")
VIEWS = ("rhythm", "full")
STRENGTHS = (0.25, 0.5, 0.75, 1.0)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def rerank_group(
    base_scores, features, model, labels, group, strength, applicable,
):
    output = np.asarray(base_scores, dtype=np.float64).copy()
    if not np.any(applicable):
        return output
    label_index = {label: index for index, label in enumerate(labels)}
    indexes = [label_index[label] for label in group]
    group_scores = output[applicable][:, indexes]
    old = group_scores / np.maximum(group_scores.sum(axis=1, keepdims=True), 1e-12)
    probabilities = model.predict_proba(features[applicable])
    estimator = model if hasattr(model, "classes_") else model[-1]
    classes = list(estimator.classes_)
    learned = probabilities[:, [classes.index(label) for label in group]]
    target = old * (1.0 - strength) + learned * strength
    selected_rows = np.flatnonzero(applicable)
    top3 = np.argsort(-output, axis=1)[:, :3]
    utilities = np.log(np.maximum(output, 1e-12))
    delta = np.log(np.maximum(target, 1e-12)) - np.log(np.maximum(old, 1e-12))
    for column, label_column in enumerate(indexes):
        utilities[selected_rows, label_column] += delta[:, column]
    for row_index in selected_rows:
        candidates = top3[row_index]
        original_values = np.sort(output[row_index, candidates])[::-1]
        order = candidates[
            np.argsort(-utilities[row_index, candidates], kind="stable")
        ]
        output[row_index, order] = original_values
    return output


def reconstruct_v99(
    module, payload, formal, available, black_rows, black_features,
    held_sources,
):
    base = payload["selectedScores"].astype(np.float64)
    output = base.copy()
    labels = list(payload["labels"])
    actual = payload["actual"]
    sources = payload["sources"]
    eligible = payload["trainingEligible"].astype(bool)
    black_actual = np.asarray([row["genre"] for row in black_rows], dtype=object)
    black_sources = np.asarray([row["source"] for row in black_rows], dtype=object)
    for fold_index, held_source in enumerate(held_sources):
        evaluation_indexes = np.flatnonzero(sources == held_source)
        fold_scores = base[evaluation_indexes].copy()
        for member_index, (pair, kind, view, strength) in enumerate(V99_MEMBERS):
            formal_indexes = np.flatnonzero(
                (sources != held_source) & eligible & available
                & np.isin(actual, pair)
            )
            overlay_indexes = np.asarray([
                index for index, row in enumerate(black_rows)
                if row["genre"] in pair and row["source"] != held_source
            ], dtype=np.int64)
            matrix = formal[formal_indexes]
            train_actual = actual[formal_indexes]
            train_sources = sources[formal_indexes]
            overlay_mask = np.zeros(len(formal_indexes), dtype=bool)
            if overlay_indexes.size:
                matrix = np.concatenate([matrix, black_features[overlay_indexes]])
                train_actual = np.concatenate([
                    train_actual, black_actual[overlay_indexes]
                ])
                train_sources = np.concatenate([
                    train_sources, black_sources[overlay_indexes]
                ])
                overlay_mask = np.concatenate([
                    overlay_mask, np.ones(len(overlay_indexes), dtype=bool)
                ])
            model = module.fit_model(
                kind, module.feature_view(matrix, view), train_actual,
                module.source_label_weights(
                    train_actual, train_sources, overlay_mask
                ),
                886001 + member_index * 10000 + fold_index * 100,
            )
            top3 = np.argsort(-base[evaluation_indexes], axis=1)[:, :3]
            pair_columns = {labels.index(label) for label in pair}
            applicable = np.asarray([
                available[row_index]
                and pair_columns.issubset(set(candidate_columns))
                for row_index, candidate_columns in zip(evaluation_indexes, top3)
            ], dtype=bool)
            member_scores = module.rerank_pair(
                base[evaluation_indexes],
                module.feature_view(formal[evaluation_indexes], view),
                model, labels, pair, strength, applicable,
            )
            changed = np.any(member_scores != base[evaluation_indexes], axis=1)
            if np.any(np.any(fold_scores[changed] != base[evaluation_indexes][changed], axis=1)):
                raise ValueError("v99 member applicability unexpectedly overlaps")
            fold_scores[changed] = member_scores[changed]
        output[evaluation_indexes] = fold_scores
    return output


def run(args):
    module = load_module(BLACK_SCRIPT, "electronic_ablation_shared")
    payload = np.load(args.oof)
    labels = list(payload["labels"])
    actual = payload["actual"]
    sources = payload["sources"]
    eligible = payload["trainingEligible"].astype(bool)
    formal, available = module.align_features(
        payload["sourceKeys"], module.load_feature_cache(args.formal_librosa)
    )
    black_rows, black_features = module.load_overlay(
        args.black_manifest, args.black_librosa
    )
    overlay_rows, overlay = module.load_overlay(
        args.overlay_manifest, args.overlay_librosa
    )
    overlay_actual = np.asarray(
        [row["genre"] for row in overlay_rows], dtype=object
    )
    overlay_sources = np.asarray(
        [row["source"] for row in overlay_rows], dtype=object
    )
    held_sources = sorted(
        source for source, count in Counter(sources).items() if count >= 8
    )
    incumbent = reconstruct_v99(
        module, payload, formal, available, black_rows, black_features,
        held_sources,
    )
    incumbent_metric = module.metric(actual, incumbent, labels, sources)
    if incumbent_metric["top1Accuracy"] != 58.68:
        raise ValueError(
            f"v99 reconstruction mismatch: {incumbent_metric['top1Accuracy']}"
        )
    candidates = {"v99-incumbent": incumbent_metric}
    diagnostics = defaultdict(list)
    for group_index, group in enumerate(GROUPS):
        group_overlay_indexes = np.asarray([
            index for index, row in enumerate(overlay_rows)
            if row["genre"] in group
        ], dtype=np.int64)
        for kind in MODELS:
            for view in VIEWS:
                fold_models = []
                for fold_index, held_source in enumerate(held_sources):
                    train_indexes = np.flatnonzero(
                        (sources != held_source) & eligible & available
                        & np.isin(actual, group)
                    )
                    selected_overlay = np.asarray([
                        index for index in group_overlay_indexes
                        if overlay_sources[index] != held_source
                    ], dtype=np.int64)
                    matrix = formal[train_indexes]
                    train_actual = actual[train_indexes]
                    train_sources = sources[train_indexes]
                    overlay_mask = np.zeros(len(train_indexes), dtype=bool)
                    if selected_overlay.size:
                        matrix = np.concatenate([
                            matrix, overlay[selected_overlay]
                        ])
                        train_actual = np.concatenate([
                            train_actual, overlay_actual[selected_overlay]
                        ])
                        train_sources = np.concatenate([
                            train_sources, overlay_sources[selected_overlay]
                        ])
                        overlay_mask = np.concatenate([
                            overlay_mask, np.ones(len(selected_overlay), dtype=bool)
                        ])
                    counts = Counter(train_actual)
                    source_counts = {
                        label: len(set(train_sources[train_actual == label]))
                        for label in group
                    }
                    evaluation_indexes = np.flatnonzero(sources == held_source)
                    if (
                        min(counts.get(label, 0) for label in group) < 8
                        or min(source_counts.values()) < 2
                    ):
                        diagnostics[(group, kind, view)].append({
                            "heldOutSource": held_source,
                            "status": "blocked-source-coverage",
                            "rows": dict(counts),
                            "sourcesPerLabel": source_counts,
                        })
                        fold_models = []
                        break
                    model = module.fit_model(
                        kind, module.feature_view(matrix, view), train_actual,
                        module.source_label_weights(
                            train_actual, train_sources, overlay_mask
                        ),
                        997001 + group_index * 10000 + fold_index * 100,
                    )
                    top3 = np.argsort(-incumbent[evaluation_indexes], axis=1)[:, :3]
                    columns = {labels.index(label) for label in group}
                    applicable = np.asarray([
                        available[index]
                        and columns.issubset(set(candidate_columns))
                        for index, candidate_columns in zip(evaluation_indexes, top3)
                    ], dtype=bool)
                    fold_models.append((
                        evaluation_indexes,
                        module.feature_view(formal[evaluation_indexes], view),
                        model,
                        applicable,
                    ))
                    diagnostics[(group, kind, view)].append({
                        "heldOutSource": held_source,
                        "status": "fitted",
                        "rows": dict(counts),
                        "sourcesPerLabel": source_counts,
                        "trainingOnlyOverlayRows": int(len(selected_overlay)),
                        "applicableEvaluationRows": int(np.sum(applicable)),
                    })
                if not fold_models:
                    continue
                for strength in STRENGTHS:
                    name = f"{'-'.join(group)}-{kind}-{view}-overlay-w{strength:g}"
                    output = incumbent.copy()
                    for indexes, features, model, applicable in fold_models:
                        output[indexes] = rerank_group(
                            incumbent[indexes], features, model, labels,
                            group, strength, applicable,
                        )
                    candidates[name] = module.compare_output(
                        output, incumbent, actual, labels, sources
                    )
    baseline = candidates["v99-incumbent"]
    promotion = [
        name for name, score in candidates.items()
        if name != "v99-incumbent"
        and score["top1Accuracy"] > baseline["top1Accuracy"]
        and score["balancedTop1"] >= baseline["balancedTop1"]
        and score["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and score["top3Accuracy"] >= baseline["top3Accuracy"]
        and score["improved"] >= score["harmed"]
    ]
    ranking = sorted(candidates, key=lambda name: (
        candidates[name]["top1Accuracy"],
        candidates[name]["balancedTop1"],
        candidates[name]["minimumSourceTop1"],
    ), reverse=True)
    report = {
        "objective": (
            "Test full-track independent electronic overlays against the "
            "source-heldout v99 stack."
        ),
        "policy": {
            "metadataUsedAtInference": False,
            "urlSpecificRulesUsed": False,
            "knownSongRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "overlayRowsEvaluated": False,
            "matchingProviderExcludedFromOuterFold": True,
            "incumbentReconstructedPerFold": True,
            "productionModelUpdated": False,
        },
        "dataset": {
            "formalRows": len(actual),
            "formalLibrosaCoverage": int(np.sum(available)),
            "overlayRows": len(overlay_rows),
            "overlayByGenre": dict(Counter(overlay_actual)),
            "overlayBySource": dict(Counter(overlay_sources)),
            "heldOutSources": held_sources,
        },
        "incumbent": incumbent_metric,
        "candidates": candidates,
        "ranking": ranking,
        "promotionScreen": promotion,
        "decision": (
            "continue-independent-outer-gates"
            if promotion else "reject-no-strict-oof-gain"
        ),
        "diagnostics": {
            "|".join((*group, kind, view)): rows
            for (group, kind, view), rows in diagnostics.items()
        },
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def render(report):
    lines = [
        "# Unknown80 independent electronic ablation", "",
        "All candidates are evaluated on top of the fold-reconstructed v99 stack.",
        "", "| candidate | Top1 | balanced | minimum source | Top3 | + / - |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for name in report["ranking"][:24]:
        score = report["candidates"][name]
        lines.append(
            f"| {name} | {score['top1Accuracy']:.2f}% | "
            f"{score['balancedTop1']:.2f}% | "
            f"{score['minimumSourceTop1']:.2f}% | "
            f"{score['top3Accuracy']:.2f}% | "
            f"{score.get('improved', 0)} / {score.get('harmed', 0)} |"
        )
    lines.extend(["", f"Decision: **{report['decision']}**", ""])
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=DEFAULT_OOF)
    parser.add_argument("--formal-librosa", type=Path, action="append", default=[])
    parser.add_argument("--black-manifest", type=Path, default=DEFAULT_BLACK_MANIFEST)
    parser.add_argument("--black-librosa", type=Path, default=DEFAULT_BLACK_LIBROSA)
    parser.add_argument("--overlay-manifest", type=Path, default=DEFAULT_OVERLAY_MANIFEST)
    parser.add_argument("--overlay-librosa", type=Path, default=DEFAULT_OVERLAY_LIBROSA)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    if not args.formal_librosa:
        args.formal_librosa = [DEFAULT_FORMAL_LIBROSA]
    report = run(args)
    print(json.dumps({
        "decision": report["decision"],
        "incumbent": report["incumbent"],
        "topCandidates": [
            {"name": name, **report["candidates"][name]}
            for name in report["ranking"][:12]
        ],
        "promotionScreen": report["promotionScreen"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
