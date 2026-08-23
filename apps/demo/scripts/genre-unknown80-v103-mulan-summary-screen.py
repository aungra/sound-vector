#!/usr/bin/env python3
"""Screen track-summary MuLan rerankers on the fixed v103 OOF stack."""

from __future__ import annotations

import argparse
import importlib.util
import itertools
import json
from collections import Counter
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
MACRO_PATH = Path(__file__).with_name(
    "genre-unknown80-v102-macro-reranker-screen.py"
)
DEFAULT_REPORT = TRAINING / "unknown80-v103-mulan-summary-screen.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-v103-mulan-summary-screen.md"

V103_MEMBERS = (
    ("roots-electric", "extra-trees", "rhythm-base", 0.25, 0.75, 0.0),
    ("bass-groove", "extra-trees", "librosa-base", 0.25, 0.75, 0.0),
    (
        "acoustic-structural", "logistic-pca64", "rhythm-base",
        0.25, 0.75, 0.5,
    ),
)

# Each class has enough rows from at least two providers after every outer
# holdout. Sparse one-provider classes are intentionally excluded.
GROUPS = {
    "electronic-core": (
        "テクノ", "ハウス", "ディープ・ハウス", "ドラムンベース", "ダブステップ",
    ),
    "guitar-core": ("ロック", "メタル", "パンク"),
    "acoustic-core": ("クラシック音楽", "ジャズ", "フォーク", "アンビエント"),
    "reggae-dub": ("レゲエ", "ダブ"),
    "rap-reggae-dub": ("ヒップホップ", "レゲエ", "ダブ"),
    "rock-jazz-folk-latin": ("ロック", "ジャズ", "フォーク", "ラテン"),
}
VIEWS = ("median", "mean-std", "median-std", "median-std-base")
KINDS = ("extra-trees", "logistic-pca64")
STRENGTHS = (0.25, 0.5, 0.75, 1.0)
CONFIDENCE_FLOORS = (0.0, 0.6, 0.75, 0.9)
CANDIDATE_MASS_FLOORS = (0.0, 0.5, 0.7)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def normalize_rows(values):
    values = np.asarray(values, dtype=np.float64)
    return values / np.maximum(values.sum(axis=1, keepdims=True), 1e-12)


def mulan_summary_views(positions, base_scores):
    """Turn three 512-D positions into order-stable track summaries."""

    values = np.asarray(positions, dtype=np.float32)
    if values.ndim != 2 or values.shape[1] != 1536:
        raise ValueError(f"expected (n, 1536) MuLan positions, got {values.shape}")
    segments = values.reshape(len(values), 3, 512)
    finite = np.isfinite(segments).all(axis=(1, 2))
    nonzero = np.all(np.linalg.norm(segments, axis=2) > 1e-6, axis=1)
    available = finite & nonzero
    mean = np.mean(segments, axis=1)
    median = np.median(segments, axis=1)
    std = np.std(segments, axis=1)
    log_scores = np.log(np.maximum(normalize_rows(base_scores), 1e-12))
    return {
        "median": median,
        "mean-std": np.concatenate([mean, std], axis=1),
        "median-std": np.concatenate([median, std], axis=1),
        "median-std-base": np.concatenate([median, std, log_scores], axis=1),
    }, available


def compose_unique(base, outputs):
    """Apply a member only when no other member changes that row."""

    if not outputs:
        return np.asarray(base, dtype=np.float64).copy(), 0
    changed = [np.any(output != base, axis=1) for output in outputs]
    change_count = np.sum(np.stack(changed), axis=0)
    result = np.asarray(base, dtype=np.float64).copy()
    for output, mask in zip(outputs, changed):
        unique = mask & (change_count == 1)
        result[unique] = output[unique]
    return result, int(np.sum(change_count > 1))


def build_v103(args, macro, global_screen, stack, black, electronic, payload):
    labels = list(payload["labels"])
    actual = payload["actual"]
    sources = payload["sources"]
    eligible = payload["trainingEligible"].astype(bool)
    formal, available = black.align_features(
        payload["sourceKeys"], black.load_feature_cache(args.formal_librosa)
    )
    black_rows, black_features = black.load_overlay(
        args.black_manifest, args.black_librosa
    )
    electronic_rows, electronic_features = black.load_overlay(
        args.electronic_manifest, args.electronic_librosa
    )
    texture_rows, texture_features = black.load_overlay(
        args.texture_manifest, args.texture_librosa
    )
    overlay_rows, overlay_features = stack.merge_overlay(
        (black_rows, electronic_rows, texture_rows),
        (black_features, electronic_features, texture_features),
    )
    overlay_actual = np.asarray([row["genre"] for row in overlay_rows], dtype=object)
    overlay_sources = np.asarray([row["source"] for row in overlay_rows], dtype=object)
    v102, held_sources = global_screen.build_v102(
        stack, black, electronic, args, payload, formal, available
    )
    matrices = {
        view: global_screen.view_matrix(
            view, payload["positions"], formal, v102, black.RHYTHM_INDEXES
        )
        for view in {member[2] for member in V103_MEMBERS}
    }
    outputs = []
    for (
        group_name, kind, view, strength, confidence_floor, mass_floor,
    ) in V103_MEMBERS:
        group = macro.GROUPS[group_name]
        learned = np.zeros_like(v102)
        valid = np.zeros(len(actual), dtype=bool)
        for fold_index, held_source in enumerate(held_sources):
            training_indexes = np.flatnonzero(
                (sources != held_source) & eligible & available
                & np.isin(actual, group)
            )
            overlay_indexes = np.flatnonzero(
                (overlay_sources != held_source) & np.isin(overlay_actual, group)
            )
            training_features = matrices[view][training_indexes]
            training_actual = actual[training_indexes]
            training_sources = sources[training_indexes]
            if overlay_indexes.size:
                overlay_view = global_screen.view_matrix(
                    view,
                    np.zeros(
                        (len(overlay_features), payload["positions"].shape[1]),
                        dtype=np.float32,
                    ),
                    overlay_features,
                    np.tile(
                        np.mean(v102[training_indexes], axis=0),
                        (len(overlay_features), 1),
                    ),
                    black.RHYTHM_INDEXES,
                )
                base_dimensions = (
                    formal.shape[1]
                    if view == "librosa-base"
                    else len(black.RHYTHM_INDEXES)
                )
                overlay_view[:, base_dimensions:] = 0.0
                training_features = np.concatenate(
                    [training_features, overlay_view[overlay_indexes]]
                )
                training_actual = np.concatenate(
                    [training_actual, overlay_actual[overlay_indexes]]
                )
                training_sources = np.concatenate(
                    [training_sources, overlay_sources[overlay_indexes]]
                )
            model = macro.fit_model(
                kind, training_features, training_actual, training_sources,
                1403001
                + list(macro.GROUPS).index(group_name) * 100000
                + list(macro.KINDS).index(kind) * 10000
                + list(macro.VIEWS).index(view) * 1000
                + fold_index * 100,
            )
            evaluation_indexes = np.flatnonzero(
                (sources == held_source) & available
            )
            if evaluation_indexes.size:
                learned[evaluation_indexes] = macro.aligned_probabilities(
                    model, matrices[view][evaluation_indexes], labels
                )
                valid[evaluation_indexes] = True
        output, _detail = macro.rerank_group(
            v102, learned, labels, group, strength, confidence_floor, mass_floor
        )
        output[~valid] = v102[~valid]
        outputs.append(output)
    v103, conflicts = compose_unique(v102, outputs)
    metric = black.metric(actual, v103, labels, sources)
    if metric["top1Accuracy"] != 59.59:
        raise ValueError(f"v103 reconstruction mismatch: {metric['top1Accuracy']}")
    return v103, held_sources, metric, conflicts


def render(report):
    lines = [
        "# Unknown80 v103 MuLan track-summary screen", "",
        "Provider-cross-fitted MuLan summaries only reorder existing v103 Top3 values.",
        "", "| candidate | Top1 | balanced | minimum source | Top3 | + / - |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for name in report["ranking"][:30]:
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


def run(args):
    macro = load_module(MACRO_PATH, "v103_mulan_macro")
    global_screen = load_module(macro.GLOBAL_PATH, "v103_mulan_global")
    stack = load_module(global_screen.STACK_PATH, "v103_mulan_stack")
    black = load_module(stack.BLACK_PATH, "v103_mulan_black")
    electronic = load_module(stack.ELECTRONIC_PATH, "v103_mulan_electronic")
    payload = np.load(args.oof)
    labels = list(payload["labels"])
    actual = payload["actual"]
    sources = payload["sources"]
    eligible = payload["trainingEligible"].astype(bool)
    v103, held_sources, baseline, v103_conflicts = build_v103(
        args, macro, global_screen, stack, black, electronic, payload
    )
    matrices, available = mulan_summary_views(payload["positions"], v103)
    candidates = {"v103": baseline}
    candidate_outputs = {}
    candidate_groups = {}
    diagnostics = []
    for group_index, (group_name, group) in enumerate(GROUPS.items()):
        for kind_index, kind in enumerate(KINDS):
            for view_index, view in enumerate(VIEWS):
                learned = np.zeros_like(v103)
                valid = np.zeros(len(actual), dtype=bool)
                fold_details = []
                blocked = False
                for fold_index, held_source in enumerate(held_sources):
                    training_indexes = np.flatnonzero(
                        (sources != held_source) & eligible & available
                        & np.isin(actual, group)
                    )
                    counts = Counter(actual[training_indexes])
                    source_counts = {
                        label: len(set(sources[training_indexes][
                            actual[training_indexes] == label
                        ]))
                        for label in group
                    }
                    if (
                        min((counts.get(label, 0) for label in group), default=0) < 8
                        or min(source_counts.values(), default=0) < 2
                    ):
                        blocked = True
                        fold_details.append({
                            "heldOutSource": str(held_source),
                            "status": "blocked-source-coverage",
                            "rows": dict(counts),
                            "sourcesPerLabel": source_counts,
                        })
                        break
                    model = macro.fit_model(
                        kind, matrices[view][training_indexes],
                        actual[training_indexes], sources[training_indexes],
                        1703001 + group_index * 100000 + kind_index * 10000
                        + view_index * 1000 + fold_index * 100,
                    )
                    evaluation_indexes = np.flatnonzero(
                        (sources == held_source) & available
                    )
                    learned[evaluation_indexes] = macro.aligned_probabilities(
                        model, matrices[view][evaluation_indexes], labels
                    )
                    valid[evaluation_indexes] = True
                    fold_details.append({
                        "heldOutSource": str(held_source),
                        "status": "fitted",
                        "rows": dict(counts),
                        "sourcesPerLabel": source_counts,
                    })
                diagnostics.append({
                    "group": group_name, "kind": kind, "view": view,
                    "folds": fold_details,
                })
                if blocked:
                    continue
                for strength in STRENGTHS:
                    for confidence_floor in CONFIDENCE_FLOORS:
                        for mass_floor in CANDIDATE_MASS_FLOORS:
                            output, detail = macro.rerank_group(
                                v103, learned, labels, group, strength,
                                confidence_floor, mass_floor,
                            )
                            output[~valid] = v103[~valid]
                            name = (
                                f"{group_name}-{kind}-{view}-w{strength:g}"
                                f"-confidence{confidence_floor:g}"
                                f"-mass{mass_floor:g}"
                            )
                            score = black.compare_output(
                                output, v103, actual, labels, sources
                            )
                            candidates[name] = {**score, **detail}
                            if (
                                score["top1Accuracy"] > baseline["top1Accuracy"]
                                and score["balancedTop1"] >= baseline["balancedTop1"]
                                and score["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
                                and score["top3Accuracy"] >= baseline["top3Accuracy"]
                                and score["improved"] >= score["harmed"]
                            ):
                                candidate_outputs[name] = output
                                candidate_groups[name] = group_name

    best_by_group = {}
    for name in candidate_outputs:
        group_name = candidate_groups[name]
        old = best_by_group.get(group_name)
        if old is None or (
            candidates[name]["top1Accuracy"],
            candidates[name]["balancedTop1"],
            candidates[name]["minimumSourceTop1"],
        ) > (
            candidates[old]["top1Accuracy"],
            candidates[old]["balancedTop1"],
            candidates[old]["minimumSourceTop1"],
        ):
            best_by_group[group_name] = name
    best_names = list(best_by_group.values())
    for size in range(2, len(best_names) + 1):
        for members in itertools.combinations(best_names, size):
            output, conflicts = compose_unique(
                v103, [candidate_outputs[name] for name in members]
            )
            name = "combined-" + "+".join(candidate_groups[value] for value in members)
            candidates[name] = {
                **black.compare_output(output, v103, actual, labels, sources),
                "members": list(members),
                "conflictingRowsLeftAtBaseline": conflicts,
            }

    ranking = sorted(candidates, key=lambda name: (
        candidates[name]["top1Accuracy"],
        candidates[name]["balancedTop1"],
        candidates[name]["minimumSourceTop1"],
    ), reverse=True)
    promotions = [
        name for name in ranking if name != "v103"
        and candidates[name]["top1Accuracy"] > baseline["top1Accuracy"]
        and candidates[name]["balancedTop1"] >= baseline["balancedTop1"]
        and candidates[name]["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and candidates[name]["top3Accuracy"] >= baseline["top3Accuracy"]
        and candidates[name]["improved"] >= candidates[name]["harmed"]
    ]
    label_array = np.asarray(labels)
    baseline_predicted = label_array[np.argmax(v103, axis=1)]
    mistakes = baseline_predicted != actual
    baseline_confusions = [
        {"actual": left, "predicted": right, "count": count}
        for (left, right), count in Counter(
            zip(actual[mistakes], baseline_predicted[mistakes])
        ).most_common()
    ]
    baseline_recall = []
    for label in sorted(set(actual)):
        selected = actual == label
        baseline_recall.append({
            "genre": label,
            "rows": int(np.sum(selected)),
            "recall": round(
                float(np.mean(baseline_predicted[selected] == label)) * 100, 2
            ),
        })
    baseline_recall.sort(key=lambda row: (row["recall"], -row["rows"], row["genre"]))
    report = {
        "objective": "Test order-stable three-position MuLan summaries on v103.",
        "policy": {
            "metadataUsedAtInference": False,
            "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "top3CandidateSetChanged": False,
            "scoreMultisetChanged": False,
            "matchingProviderExcludedFromOuterFold": True,
            "productionModelUpdated": False,
            "externalModelProductionEligible": False,
        },
        "dataset": {
            "rows": len(actual), "labels": len(labels),
            "mulanCoverage": int(np.sum(available)),
            "heldOutSources": [str(value) for value in held_sources],
            "groups": {name: list(value) for name, value in GROUPS.items()},
        },
        "baseline": baseline,
        "baselineConfusions": baseline_confusions,
        "baselineGenreRecall": baseline_recall,
        "v103ConflictingRowsLeftAtV102": v103_conflicts,
        "candidates": candidates,
        "ranking": ranking,
        "promotionScreen": promotions,
        "runtimeEligibility": {
            "modelId": "muq-mulan-large",
            "modelLicense": "CC-BY-NC-4.0",
            "productionEligible": False,
            "decision": "research-diagnostic-only",
        },
        "bestCandidateByGroup": best_by_group,
        "decision": (
            "reject-production-noncommercial-checkpoint"
            if promotions else "reject-no-strict-source-heldout-gain"
        ),
        "diagnostics": diagnostics,
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def main():
    macro = load_module(MACRO_PATH, "v103_mulan_defaults")
    global_screen = load_module(macro.GLOBAL_PATH, "v103_mulan_global_defaults")
    stack = load_module(global_screen.STACK_PATH, "v103_mulan_stack_defaults")
    electronic = load_module(stack.ELECTRONIC_PATH, "v103_mulan_electronic_defaults")
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=electronic.DEFAULT_OOF)
    parser.add_argument("--formal-librosa", type=Path, action="append", default=[])
    parser.add_argument("--black-manifest", type=Path, default=electronic.DEFAULT_BLACK_MANIFEST)
    parser.add_argument("--black-librosa", type=Path, default=electronic.DEFAULT_BLACK_LIBROSA)
    parser.add_argument("--electronic-manifest", type=Path, default=electronic.DEFAULT_OVERLAY_MANIFEST)
    parser.add_argument("--electronic-librosa", type=Path, default=electronic.DEFAULT_OVERLAY_LIBROSA)
    parser.add_argument("--texture-manifest", type=Path, default=macro.DEFAULT_TEXTURE_MANIFEST)
    parser.add_argument("--texture-librosa", type=Path, default=macro.DEFAULT_TEXTURE_LIBROSA)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    if not args.formal_librosa:
        args.formal_librosa = [electronic.DEFAULT_FORMAL_LIBROSA]
    report = run(args)
    print(json.dumps({
        "baseline": report["baseline"],
        "topCandidates": [
            {"name": name, **report["candidates"][name]}
            for name in report["ranking"][:16]
        ],
        "promotionScreen": report["promotionScreen"][:20],
        "decision": report["decision"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
