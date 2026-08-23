#!/usr/bin/env python3
"""Screen runtime-compatible global Top3 rerankers on the v102 OOF stack."""

from __future__ import annotations

import argparse
import importlib.util
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
STACK_PATH = Path(__file__).with_name(
    "genre-unknown80-independent-stack-source-heldout.py"
)
DEFAULT_REPORT = TRAINING / "unknown80-global-top3-reranker-screen.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-global-top3-reranker-screen.md"
MODEL_KINDS = ("logistic-pca64", "extra-trees")
VIEWS = (
    "rhythm-base", "librosa", "librosa-base",
    "mulan", "mulan-base", "mulan-librosa-base",
)
STRENGTHS = (0.1, 0.25, 0.5, 1.0)
CONFIDENCE_FLOORS = (0.0, 0.6, 0.75, 0.9)
TOP3_MASS_FLOORS = (0.0, 0.5)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def normalize_rows(values):
    values = np.asarray(values, dtype=np.float64)
    return values / np.maximum(values.sum(axis=1, keepdims=True), 1e-12)


def view_matrix(name, positions, librosa, scores, rhythm_indexes):
    score_features = np.log(np.maximum(normalize_rows(scores), 1e-12))
    if name == "librosa":
        return librosa
    if name == "librosa-base":
        return np.concatenate([librosa, score_features], axis=1)
    if name == "rhythm-base":
        return np.concatenate([librosa[:, rhythm_indexes], score_features], axis=1)
    if name == "mulan":
        return positions
    if name == "mulan-base":
        return np.concatenate([positions, score_features], axis=1)
    if name == "mulan-librosa-base":
        return np.concatenate([positions, librosa, score_features], axis=1)
    raise ValueError(f"unknown view: {name}")


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
    classes = list(
        model.classes_ if hasattr(model, "classes_") else model[-1].classes_
    )
    output = np.zeros((len(features), len(labels)), dtype=np.float64)
    label_index = {label: index for index, label in enumerate(labels)}
    for column, label in enumerate(classes):
        if label in label_index:
            output[:, label_index[label]] = probabilities[:, column]
    return output


def rerank_top3(
    base_scores, learned_scores, strength, confidence_floor=0.0,
    top3_mass_floor=0.0,
):
    scores = np.asarray(base_scores, dtype=np.float64)
    learned = np.asarray(learned_scores, dtype=np.float64)
    top3 = np.argsort(-scores, axis=1)[:, :3]
    selected_base = np.take_along_axis(scores, top3, axis=1)
    selected_learned = np.take_along_axis(learned, top3, axis=1)
    top3_mass = selected_learned.sum(axis=1)
    old = normalize_rows(selected_base)
    evidence = normalize_rows(selected_learned)
    confidence = np.max(evidence, axis=1)
    applicable = (
        (top3_mass >= top3_mass_floor)
        & (confidence >= confidence_floor)
    )
    target = old * (1.0 - strength) + evidence * strength
    target[~applicable] = old[~applicable]
    output = scores.copy()
    for row_index, candidates in enumerate(top3):
        original_values = np.sort(scores[row_index, candidates])[::-1]
        order = candidates[
            np.argsort(-target[row_index], kind="stable")
        ]
        output[row_index, order] = original_values
    return output, {
        "applicableRows": int(np.sum(applicable)),
        "meanTop3Mass": float(np.mean(top3_mass)),
        "meanConfidence": float(np.mean(confidence)),
    }


def build_v102(stack, black, electronic, args, payload, formal, available):
    sources = payload["sources"]
    black_rows, black_features = black.load_overlay(
        args.black_manifest, args.black_librosa
    )
    electronic_rows, electronic_features = black.load_overlay(
        args.electronic_manifest, args.electronic_librosa
    )
    overlay_rows, overlay_features = stack.merge_overlay(
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
    members = stack.STACKS[-1][1]
    v102, _diagnostics = stack.evaluate_stack(
        electronic, black, payload, formal, available, overlay_rows,
        overlay_features, held_sources, incumbent, members,
    )
    return v102, held_sources


def render(report):
    lines = [
        "# Unknown80 global Top3 reranker screen", "",
        "All models are cross-fitted by provider and only reorder v102 Top3.",
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
    stack = load_module(STACK_PATH, "global_top3_stack")
    black = load_module(stack.BLACK_PATH, "global_top3_black")
    electronic = load_module(stack.ELECTRONIC_PATH, "global_top3_electronic")
    payload = np.load(args.oof)
    labels = list(payload["labels"])
    actual = payload["actual"]
    sources = payload["sources"]
    eligible = payload["trainingEligible"].astype(bool)
    formal, available = black.align_features(
        payload["sourceKeys"], black.load_feature_cache(args.formal_librosa)
    )
    positions = payload["positions"].astype(np.float32)
    v102, held_sources = build_v102(
        stack, black, electronic, args, payload, formal, available
    )
    baseline = black.metric(actual, v102, labels, sources)
    if baseline["top1Accuracy"] != 59.27:
        raise ValueError("v102 reconstruction mismatch")
    matrices = {
        view: view_matrix(
            view, positions, formal, v102, black.RHYTHM_INDEXES
        )
        for view in VIEWS
    }
    configurations = [
        (kind, view, strength, confidence_floor, mass_floor)
        for kind in MODEL_KINDS
        for view in VIEWS
        for strength in STRENGTHS
        for confidence_floor in CONFIDENCE_FLOORS
        for mass_floor in TOP3_MASS_FLOORS
    ]
    outputs = {
        config: v102.copy() for config in configurations
    }
    diagnostics = []
    for fold_index, held_source in enumerate(held_sources):
        training_indexes = np.flatnonzero(
            (sources != held_source) & eligible & available
        )
        evaluation_indexes = np.flatnonzero(sources == held_source)
        for kind_index, kind in enumerate(MODEL_KINDS):
            for view_index, view in enumerate(VIEWS):
                model = fit_model(
                    kind,
                    matrices[view][training_indexes],
                    actual[training_indexes],
                    sources[training_indexes],
                    1203001 + fold_index * 10000 + kind_index * 1000
                    + view_index * 100,
                )
                learned = aligned_probabilities(
                    model, matrices[view][evaluation_indexes], labels
                )
                for strength in STRENGTHS:
                    for confidence_floor in CONFIDENCE_FLOORS:
                        for mass_floor in TOP3_MASS_FLOORS:
                            config = (
                                kind, view, strength, confidence_floor,
                                mass_floor,
                            )
                            reranked, detail = rerank_top3(
                                v102[evaluation_indexes], learned, strength,
                                confidence_floor, mass_floor,
                            )
                            outputs[config][evaluation_indexes] = reranked
                            if (
                                strength == 1.0
                                and confidence_floor == 0.75
                                and mass_floor == 0.5
                            ):
                                diagnostics.append({
                                    "heldOutSource": str(held_source),
                                    "kind": kind,
                                    "view": view,
                                    **detail,
                                })
    candidates = {"v102": baseline}
    for config, output in outputs.items():
        kind, view, strength, confidence_floor, mass_floor = config
        name = (
            f"{kind}-{view}-w{strength:g}-confidence{confidence_floor:g}"
            f"-mass{mass_floor:g}"
        )
        candidates[name] = black.compare_output(
            output, v102, actual, labels, sources
        )
    ranking = sorted(candidates, key=lambda name: (
        candidates[name]["top1Accuracy"],
        candidates[name]["balancedTop1"],
        candidates[name]["minimumSourceTop1"],
    ), reverse=True)
    promotions = [
        name for name in ranking if name != "v102"
        and candidates[name]["top1Accuracy"] > baseline["top1Accuracy"]
        and candidates[name]["balancedTop1"] >= baseline["balancedTop1"]
        and candidates[name]["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and candidates[name]["top3Accuracy"] >= baseline["top3Accuracy"]
        and candidates[name]["improved"] >= candidates[name]["harmed"]
    ]
    report = {
        "objective": "Convert fixed v102 Top3 coverage into global audio-only Top1 gains.",
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
            "rows": len(actual),
            "featureCoverage": int(np.sum(available)),
            "labels": len(labels),
            "heldOutSources": [str(value) for value in held_sources],
            "mulanDimensions": int(positions.shape[1]),
        },
        "baseline": baseline,
        "candidates": candidates,
        "ranking": ranking,
        "promotionScreen": promotions,
        "decision": (
            "continue-production-gate" if promotions
            else "reject-no-strict-source-heldout-gain"
        ),
        "diagnostics": diagnostics,
        "runtimeCompatibility": {
            "librosaViews": "current-runtime-compatible",
            "mulanViews": "requires-MuLan-runtime-integration",
        },
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def main():
    stack = load_module(STACK_PATH, "global_top3_defaults")
    electronic = load_module(stack.ELECTRONIC_PATH, "global_top3_electronic_defaults")
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
        "baseline": report["baseline"],
        "topCandidates": [
            {"name": name, **report["candidates"][name]}
            for name in report["ranking"][:12]
        ],
        "promotionScreen": report["promotionScreen"][:20],
        "decision": report["decision"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
