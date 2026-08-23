#!/usr/bin/env python3
"""Screen provider-cross-fitted macro rerankers on the fixed v102 stack."""

from __future__ import annotations

import argparse
import importlib.util
import itertools
import json
from collections import Counter
from pathlib import Path

import numpy as np
from sklearn.decomposition import PCA
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
GLOBAL_PATH = Path(__file__).with_name(
    "genre-unknown80-global-top3-reranker-screen.py"
)
DEFAULT_REPORT = TRAINING / "unknown80-v102-macro-reranker-screen.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-v102-macro-reranker-screen.md"
DEFAULT_TEXTURE_MANIFEST = (
    TRAINING / "unknown80-independent-texture-candidate-manifest.json"
)
DEFAULT_TEXTURE_LIBROSA = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-independent-texture-librosa.json"
)

GROUPS = {
    "club": ("テクノ", "ハウス", "ディープ・ハウス", "トランス"),
    "texture": ("アンビエント", "ドローン", "ノイズミュージック"),
    "guitar": ("ロック", "メタル", "パンク"),
    "roots-electric": ("ロック", "ファンク", "ブルース", "ジャズ", "フォーク", "ラテン"),
    "bass-groove": ("レゲエ", "ダブ", "ヒップホップ", "ファンク", "ディスコ"),
    "fast-electronic": ("テクノ", "トランス", "ドラムンベース", "ダブステップ"),
    "acoustic-structural": ("クラシック音楽", "ジャズ", "フォーク", "アンビエント"),
}
KINDS = ("extra-trees", "logistic-pca64")
VIEWS = ("rhythm-base", "librosa-base")
STRENGTHS = (0.25, 0.5, 0.75, 1.0)
CONFIDENCE_FLOORS = (0.0, 0.45, 0.6, 0.75)
CANDIDATE_MASS_FLOORS = (0.0, 0.5, 0.7)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def make_model(kind, rows, dimensions, seed):
    if kind == "extra-trees":
        return ExtraTreesClassifier(
            n_estimators=480,
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
            C=0.5,
            class_weight="balanced",
            max_iter=1400,
            random_state=seed,
        ),
    )


def fit_model(kind, features, actual, sources, seed):
    model = make_model(kind, len(features), features.shape[1], seed)
    counts = Counter(zip(actual, sources))
    weights = np.asarray([
        1.0 / max(1, counts[(label, source)])
        for label, source in zip(actual, sources)
    ], dtype=np.float64)
    weights /= max(float(weights.mean()), 1e-12)
    model.fit(features, actual, **(
        {"sample_weight": weights}
        if kind == "extra-trees"
        else {"logisticregression__sample_weight": weights}
    ))
    return model


def aligned_probabilities(model, features, labels):
    probabilities = model.predict_proba(features)
    estimator = model if hasattr(model, "classes_") else model[-1]
    classes = list(estimator.classes_)
    output = np.zeros((len(features), len(labels)), dtype=np.float64)
    label_index = {label: index for index, label in enumerate(labels)}
    for column, label in enumerate(classes):
        output[:, label_index[label]] = probabilities[:, column]
    return output


def rerank_group(
    base_scores,
    learned_scores,
    labels,
    group,
    strength,
    confidence_floor=0.0,
    candidate_mass_floor=0.0,
):
    """Reorder only existing Top3 values when at least two group labels appear."""

    scores = np.asarray(base_scores, dtype=np.float64)
    learned = np.asarray(learned_scores, dtype=np.float64)
    output = scores.copy()
    label_index = {label: index for index, label in enumerate(labels)}
    group_columns = {label_index[label] for label in group}
    top3 = np.argsort(-scores, axis=1)[:, :3]
    changed = np.zeros(len(scores), dtype=bool)
    applicable = np.zeros(len(scores), dtype=bool)
    for row_index, candidates in enumerate(top3):
        selected = np.asarray([
            column for column in candidates if column in group_columns
        ], dtype=np.int64)
        if len(selected) < 2:
            continue
        learned_values = learned[row_index, selected]
        candidate_mass = float(np.sum(learned_values))
        evidence = learned_values / max(candidate_mass, 1e-12)
        confidence = float(np.max(evidence))
        if (
            candidate_mass < candidate_mass_floor
            or confidence < confidence_floor
        ):
            continue
        applicable[row_index] = True
        old_values = scores[row_index, selected]
        old = old_values / max(float(np.sum(old_values)), 1e-12)
        target = old * (1.0 - strength) + evidence * strength
        order = selected[np.argsort(-target, kind="stable")]
        original_values = np.sort(old_values)[::-1]
        output[row_index, order] = original_values
        changed[row_index] = np.any(output[row_index] != scores[row_index])
    return output, {
        "applicableRows": int(np.sum(applicable)),
        "changedRows": int(np.sum(changed)),
    }


def render(report):
    lines = [
        "# Unknown80 v102 macro reranker screen", "",
        "Provider-cross-fitted, audio-only models only reorder existing v102 Top3 values.",
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
    global_screen = load_module(GLOBAL_PATH, "v102_macro_global")
    stack = load_module(global_screen.STACK_PATH, "v102_macro_stack")
    black = load_module(stack.BLACK_PATH, "v102_macro_black")
    electronic = load_module(stack.ELECTRONIC_PATH, "v102_macro_electronic")
    payload = np.load(args.oof)
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
    overlay_actual = np.asarray(
        [row["genre"] for row in overlay_rows], dtype=object
    )
    overlay_sources = np.asarray(
        [row["source"] for row in overlay_rows], dtype=object
    )
    v102, held_sources = global_screen.build_v102(
        stack, black, electronic, args, payload, formal, available
    )
    baseline = black.metric(actual, v102, labels, sources)
    if baseline["top1Accuracy"] != 59.27:
        raise ValueError(f"v102 reconstruction mismatch: {baseline['top1Accuracy']}")

    matrices = {
        view: global_screen.view_matrix(
            view, payload["positions"], formal, v102, black.RHYTHM_INDEXES
        )
        for view in VIEWS
    }
    candidates = {"v102": baseline}
    candidate_outputs = {}
    candidate_groups = {}
    diagnostics = []
    for group_index, (group_name, group) in enumerate(GROUPS.items()):
        for kind_index, kind in enumerate(KINDS):
            for view_index, view in enumerate(VIEWS):
                learned = np.zeros_like(v102)
                valid = np.zeros(len(actual), dtype=bool)
                fold_details = []
                blocked = False
                for fold_index, held_source in enumerate(held_sources):
                    training_indexes = np.flatnonzero(
                        (sources != held_source) & eligible & available
                        & np.isin(actual, group)
                    )
                    overlay_indexes = np.flatnonzero(
                        (overlay_sources != held_source)
                        & np.isin(overlay_actual, group)
                    )
                    training_features = matrices[view][training_indexes]
                    training_actual = actual[training_indexes]
                    training_sources = sources[training_indexes]
                    if overlay_indexes.size:
                        overlay_view = global_screen.view_matrix(
                            view,
                            np.zeros((len(overlay_features), payload["positions"].shape[1]), dtype=np.float32),
                            overlay_features,
                            np.tile(np.mean(v102[training_indexes], axis=0), (len(overlay_features), 1)),
                            black.RHYTHM_INDEXES,
                        )
                        # Overlay rows do not have incumbent OOF logits. Keep the
                        # score-feature block neutral so it cannot encode source.
                        base_dimensions = formal.shape[1] if view == "librosa-base" else len(black.RHYTHM_INDEXES)
                        overlay_view[:, base_dimensions:] = 0.0
                        training_features = np.concatenate([
                            training_features, overlay_view[overlay_indexes]
                        ])
                        training_actual = np.concatenate([
                            training_actual, overlay_actual[overlay_indexes]
                        ])
                        training_sources = np.concatenate([
                            training_sources, overlay_sources[overlay_indexes]
                        ])
                    counts = Counter(training_actual)
                    source_counts = {
                        label: len(set(training_sources[training_actual == label]))
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
                    evaluation_indexes = np.flatnonzero(
                        (sources == held_source) & available
                    )
                    model = fit_model(
                        kind, training_features, training_actual, training_sources,
                        1403001 + group_index * 100000 + kind_index * 10000
                        + view_index * 1000 + fold_index * 100,
                    )
                    if evaluation_indexes.size:
                        learned[evaluation_indexes] = aligned_probabilities(
                            model, matrices[view][evaluation_indexes], labels
                        )
                        valid[evaluation_indexes] = True
                    fold_details.append({
                        "heldOutSource": str(held_source),
                        "status": "fitted",
                        "rows": dict(counts),
                        "sourcesPerLabel": source_counts,
                        "trainingOnlyOverlayRows": int(len(overlay_indexes)),
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
                            output, detail = rerank_group(
                                v102, learned, labels, group, strength,
                                confidence_floor, mass_floor,
                            )
                            output[~valid] = v102[~valid]
                            name = (
                                f"{group_name}-{kind}-{view}-w{strength:g}"
                                f"-confidence{confidence_floor:g}"
                                f"-mass{mass_floor:g}"
                            )
                            comparison = black.compare_output(
                                output, v102, actual, labels, sources
                            )
                            candidates[name] = {
                                **comparison,
                                **detail,
                            }
                            if (
                                comparison["top1Accuracy"] > baseline["top1Accuracy"]
                                and comparison["balancedTop1"] >= baseline["balancedTop1"]
                                and comparison["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
                                and comparison["top3Accuracy"] >= baseline["top3Accuracy"]
                                and comparison["improved"] >= comparison["harmed"]
                            ):
                                candidate_outputs[name] = output
                                candidate_groups[name] = group_name

    best_by_group = {}
    for name in candidate_outputs:
        group_name = candidate_groups[name]
        incumbent_name = best_by_group.get(group_name)
        if incumbent_name is None or (
            candidates[name]["top1Accuracy"],
            candidates[name]["balancedTop1"],
            candidates[name]["minimumSourceTop1"],
        ) > (
            candidates[incumbent_name]["top1Accuracy"],
            candidates[incumbent_name]["balancedTop1"],
            candidates[incumbent_name]["minimumSourceTop1"],
        ):
            best_by_group[group_name] = name

    # Compose only rows changed by exactly one member. Conflicting macro
    # opinions stay at v102, preserving a deterministic conservative fallback.
    best_names = list(best_by_group.values())
    for size in range(2, len(best_names) + 1):
        for members in itertools.combinations(best_names, size):
            changed_masks = [
                np.any(candidate_outputs[name] != v102, axis=1)
                for name in members
            ]
            change_count = np.sum(np.stack(changed_masks), axis=0)
            output = v102.copy()
            for name, changed in zip(members, changed_masks):
                unique = changed & (change_count == 1)
                output[unique] = candidate_outputs[name][unique]
            name = "combined-" + "+".join(
                candidate_groups[member] for member in members
            )
            candidates[name] = {
                **black.compare_output(output, v102, actual, labels, sources),
                "members": list(members),
                "conflictingRowsLeftAtBaseline": int(np.sum(change_count > 1)),
            }

    ranking = sorted(candidates, key=lambda name: (
        candidates[name]["top1Accuracy"],
        candidates[name]["balancedTop1"],
        candidates[name]["minimumSourceTop1"],
    ), reverse=True)
    promotion = [
        name for name in ranking if name != "v102"
        and candidates[name]["top1Accuracy"] > baseline["top1Accuracy"]
        and candidates[name]["balancedTop1"] >= baseline["balancedTop1"]
        and candidates[name]["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and candidates[name]["top3Accuracy"] >= baseline["top3Accuracy"]
        and candidates[name]["improved"] >= candidates[name]["harmed"]
    ]
    report = {
        "objective": "Convert recurrent v102 macro confusions into leak-free Top1 gains.",
        "policy": {
            "metadataUsedAtInference": False,
            "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "top3CandidateSetChanged": False,
            "scoreMultisetChanged": False,
            "evaluationOnlyRowsTrainModels": False,
            "matchingProviderExcludedFromOuterFold": True,
            "productionModelUpdated": False,
        },
        "dataset": {
            "rows": len(actual), "labels": len(labels),
            "featureCoverage": int(np.sum(available)),
            "heldOutSources": [str(value) for value in held_sources],
            "groups": {name: list(value) for name, value in GROUPS.items()},
            "trainingOnlyOverlayRows": len(overlay_rows),
        },
        "baseline": baseline,
        "candidates": candidates,
        "ranking": ranking,
        "promotionScreen": promotion,
        "decision": (
            "continue-production-gate" if promotion
            else "reject-no-strict-source-heldout-gain"
        ),
        "diagnostics": diagnostics,
        "bestCandidateByGroup": best_by_group,
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def main():
    global_screen = load_module(GLOBAL_PATH, "v102_macro_defaults")
    stack = load_module(global_screen.STACK_PATH, "v102_macro_stack_defaults")
    electronic = load_module(stack.ELECTRONIC_PATH, "v102_macro_electronic_defaults")
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=electronic.DEFAULT_OOF)
    parser.add_argument("--formal-librosa", type=Path, action="append", default=[])
    parser.add_argument("--black-manifest", type=Path, default=electronic.DEFAULT_BLACK_MANIFEST)
    parser.add_argument("--black-librosa", type=Path, default=electronic.DEFAULT_BLACK_LIBROSA)
    parser.add_argument("--electronic-manifest", type=Path, default=electronic.DEFAULT_OVERLAY_MANIFEST)
    parser.add_argument("--electronic-librosa", type=Path, default=electronic.DEFAULT_OVERLAY_LIBROSA)
    parser.add_argument("--texture-manifest", type=Path, default=DEFAULT_TEXTURE_MANIFEST)
    parser.add_argument("--texture-librosa", type=Path, default=DEFAULT_TEXTURE_LIBROSA)
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
