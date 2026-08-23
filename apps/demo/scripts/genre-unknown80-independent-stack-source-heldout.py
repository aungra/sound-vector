#!/usr/bin/env python3
"""Evaluate cumulative independent boundary stacks in source-heldout folds."""

from __future__ import annotations

import argparse
import importlib.util
import json
from collections import Counter
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
ELECTRONIC_PATH = Path(__file__).with_name(
    "genre-unknown80-independent-electronic-ablation.py"
)
BLACK_PATH = Path(__file__).with_name(
    "genre-unknown80-independent-blackmusic-pair-ablation.py"
)
DEFAULT_REPORT = TRAINING / "unknown80-independent-stack-source-heldout.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-independent-stack-source-heldout.md"
STACKS = (
    (
        "v100",
        ({
            "pair": ("テクノ", "トランス"),
            "kind": "extra-trees",
            "view": "rhythm",
            "strength": 0.25,
            "confidenceFloor": 0.8,
            "seedBase": 1017001,
        },),
    ),
    (
        "v101",
        ({
            "pair": ("テクノ", "トランス"),
            "kind": "extra-trees",
            "view": "rhythm",
            "strength": 0.25,
            "confidenceFloor": 0.8,
            "seedBase": 1017001,
        }, {
            "pair": ("ロック", "メタル"),
            "kind": "logistic",
            "view": "full",
            "strength": 0.25,
            "confidenceFloor": 0.9,
            "seedBase": 997001,
        }),
    ),
    (
        "v102-candidate",
        ({
            "pair": ("テクノ", "トランス"),
            "kind": "extra-trees",
            "view": "rhythm",
            "strength": 0.25,
            "confidenceFloor": 0.8,
            "seedBase": 1017001,
        }, {
            "pair": ("ロック", "メタル"),
            "kind": "logistic",
            "view": "full",
            "strength": 0.25,
            "confidenceFloor": 0.9,
            "seedBase": 997001,
        }, {
            "pair": ("ラテン", "フォーク"),
            "kind": "logistic",
            "view": "rhythm",
            "strength": 1.0,
            "confidenceFloor": 0.95,
            "seedBase": 997001,
        }),
    ),
)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def merge_overlay(rows_groups, feature_groups):
    rows = []
    features = []
    seen = set()
    for group_rows, group_features in zip(rows_groups, feature_groups):
        for row, feature in zip(group_rows, group_features):
            key = f"{row['sourceType']}:{row['sourceUrl']}"
            if key in seen:
                continue
            seen.add(key)
            rows.append(row)
            features.append(feature)
    return rows, np.asarray(features, dtype=np.float32)


def evaluate_stack(
    electronic, black, payload, formal, available, overlay_rows,
    overlay_features, held_sources, incumbent, members,
):
    labels = list(payload["labels"])
    actual = payload["actual"]
    sources = payload["sources"]
    eligible = payload["trainingEligible"].astype(bool)
    overlay_actual = np.asarray(
        [row["genre"] for row in overlay_rows], dtype=object
    )
    overlay_sources = np.asarray(
        [row["source"] for row in overlay_rows], dtype=object
    )
    output = incumbent.copy()
    diagnostics = []
    for fold_index, held_source in enumerate(held_sources):
        evaluation_indexes = np.flatnonzero(sources == held_source)
        fold_scores = incumbent[evaluation_indexes].copy()
        for member_index, member in enumerate(members):
            pair = tuple(member["pair"])
            train_indexes = np.flatnonzero(
                (sources != held_source) & eligible & available
                & np.isin(actual, pair)
            )
            selected_overlay = np.asarray([
                index for index, row in enumerate(overlay_rows)
                if row["genre"] in pair and row["source"] != held_source
            ], dtype=np.int64)
            matrix = formal[train_indexes]
            train_actual = actual[train_indexes]
            train_sources = sources[train_indexes]
            overlay_mask = np.zeros(len(train_indexes), dtype=bool)
            if selected_overlay.size:
                matrix = np.concatenate([matrix, overlay_features[selected_overlay]])
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
                for label in pair
            }
            if (
                min(counts.get(label, 0) for label in pair) < 8
                or min(source_counts.values()) < 2
            ):
                raise ValueError(
                    f"blocked source coverage for {pair} holding {held_source}"
                )
            model = black.fit_model(
                member["kind"],
                black.feature_view(matrix, member["view"]),
                train_actual,
                black.source_label_weights(
                    train_actual, train_sources, overlay_mask
                ),
                member["seedBase"] + fold_index * 100,
            )
            top3 = np.argsort(-fold_scores, axis=1)[:, :3]
            pair_columns = {labels.index(label) for label in pair}
            applicable = np.asarray([
                available[row_index]
                and pair_columns.issubset(set(candidate_columns))
                for row_index, candidate_columns in zip(
                    evaluation_indexes, top3
                )
            ], dtype=bool)
            before = fold_scores.copy()
            fold_scores = electronic.rerank_group(
                fold_scores,
                black.feature_view(formal[evaluation_indexes], member["view"]),
                model,
                labels,
                pair,
                member["strength"],
                applicable,
                min_confidence=member["confidenceFloor"],
            )
            diagnostics.append({
                "heldOutSource": str(held_source),
                "pair": list(pair),
                "trainingRows": dict(counts),
                "sourcesPerLabel": source_counts,
                "trainingOnlyOverlayRows": int(len(selected_overlay)),
                "applicableRows": int(np.sum(applicable)),
                "changedRows": int(np.sum(np.any(before != fold_scores, axis=1))),
            })
        output[evaluation_indexes] = fold_scores
    return output, diagnostics


def render(report):
    lines = [
        "# Unknown80 cumulative independent stack source-heldout", "",
        "| stack | Top1 | balanced | minimum source | Top3 | + / - |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for name in ("v99", "v100", "v101", "v102-candidate"):
        score = report["stacks"][name]
        lines.append(
            f"| {name} | {score['top1Accuracy']:.2f}% | "
            f"{score['balancedTop1']:.2f}% | "
            f"{score['minimumSourceTop1']:.2f}% | "
            f"{score['top3Accuracy']:.2f}% | "
            f"{score.get('improved', 0)} / {score.get('harmed', 0)} |"
        )
    lines.extend(["", f"Decision: **{report['decision']}**", ""])
    return "\n".join(lines)


def run(args):
    electronic = load_module(ELECTRONIC_PATH, "stack_source_electronic")
    black = load_module(BLACK_PATH, "stack_source_black")
    payload = np.load(args.oof)
    actual = payload["actual"]
    sources = payload["sources"]
    formal, available = black.align_features(
        payload["sourceKeys"], black.load_feature_cache(args.formal_librosa)
    )
    black_rows, black_features = black.load_overlay(
        args.black_manifest, args.black_librosa
    )
    electronic_rows, electronic_features = black.load_overlay(
        args.electronic_manifest, args.electronic_librosa
    )
    overlay_rows, overlay_features = merge_overlay(
        (black_rows, electronic_rows),
        (black_features, electronic_features),
    )
    held_sources = sorted(
        source for source, count in Counter(sources).items() if count >= 8
    )
    incumbent = electronic.reconstruct_v99(
        black, payload, formal, available, black_rows, black_features,
        held_sources,
    )
    stacks = {
        "v99": black.metric(actual, incumbent, list(payload["labels"]), sources)
    }
    diagnostics = {}
    previous = incumbent
    for name, members in STACKS:
        output, rows = evaluate_stack(
            electronic, black, payload, formal, available, overlay_rows,
            overlay_features, held_sources, incumbent, members,
        )
        stacks[name] = black.compare_output(
            output, previous, actual, list(payload["labels"]), sources
        )
        stacks[name]["absoluteImprovedVsV99"] = black.compare_output(
            output, incumbent, actual, list(payload["labels"]), sources
        )["improved"]
        stacks[name]["absoluteHarmedVsV99"] = black.compare_output(
            output, incumbent, actual, list(payload["labels"]), sources
        )["harmed"]
        diagnostics[name] = rows
        previous = output
    v101 = stacks["v101"]
    candidate = stacks["v102-candidate"]
    passed = (
        candidate["top1Accuracy"] > v101["top1Accuracy"]
        and candidate["balancedTop1"] >= v101["balancedTop1"]
        and candidate["minimumSourceTop1"] >= v101["minimumSourceTop1"]
        and candidate["top3Accuracy"] >= v101["top3Accuracy"]
        and candidate["improved"] >= candidate["harmed"]
    )
    if stacks["v100"]["top1Accuracy"] != 58.79:
        raise ValueError("v100 cumulative reconstruction mismatch")
    report = {
        "objective": "Measure cumulative boundary stack gains with provider-heldout retraining.",
        "policy": {
            "metadataUsedAtInference": False,
            "urlSpecificRulesUsed": False,
            "knownSongRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "matchingProviderExcludedFromOuterFold": True,
            "allMembersRetrainedPerFold": True,
            "productionModelUpdated": False,
        },
        "dataset": {
            "rows": len(actual),
            "featureCoverage": int(np.sum(available)),
            "heldOutSources": [str(value) for value in held_sources],
            "overlayRows": len(overlay_rows),
        },
        "stacks": stacks,
        "decision": "promote-v102-production-gate" if passed else "reject-v102",
        "diagnostics": diagnostics,
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def main():
    electronic = load_module(ELECTRONIC_PATH, "stack_source_defaults")
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=electronic.DEFAULT_OOF)
    parser.add_argument("--formal-librosa", type=Path, action="append", default=[])
    parser.add_argument("--black-manifest", type=Path, default=electronic.DEFAULT_BLACK_MANIFEST)
    parser.add_argument("--black-librosa", type=Path, default=electronic.DEFAULT_BLACK_LIBROSA)
    parser.add_argument("--electronic-manifest", type=Path, default=electronic.DEFAULT_OVERLAY_MANIFEST)
    parser.add_argument("--electronic-librosa", type=Path, default=electronic.DEFAULT_OVERLAY_LIBROSA)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    if not args.formal_librosa:
        args.formal_librosa = [electronic.DEFAULT_FORMAL_LIBROSA]
    report = run(args)
    print(json.dumps({
        "stacks": report["stacks"],
        "decision": report["decision"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
