#!/usr/bin/env python3
"""Evaluate a conservative Funk/Rock post-reranker on fixed v104."""

from __future__ import annotations

import argparse
import importlib.util
import json
from collections import Counter
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
V103_HELPER_PATH = Path(__file__).with_name(
    "genre-unknown80-v103-mulan-summary-screen.py"
)
V103_RESIDUAL_PATH = Path(__file__).with_name(
    "genre-unknown80-v103-residual-pair-screen.py"
)
DEFAULT_REPORT = TRAINING / "unknown80-independent-stack-v105-source-heldout.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-independent-stack-v105-source-heldout.md"
DEFAULT_DEEP_MANIFESTS = (
    TRAINING / "internet-archive-explicit-deep-house-v1-cc-source-manifest.json",
    TRAINING / "wikimedia-unknown80-deep-house-v1-cc-source-manifest.json",
    TRAINING / "mtg-jamendo-explicit-deep-house-v1-cc-source-manifest.json",
)
DEFAULT_DEEP_CACHES = (
    Path("/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/internet-archive-explicit-deep-house-v1-librosa.json"),
    Path("/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/unknown80-independent-electronic-librosa.json"),
    Path("/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/mtg-jamendo-explicit-deep-house-v1-librosa.json"),
)
V104_CONFIGS = (
    (("ディープ・ハウス", "ハウス"), "extra-trees", "rhythm-base", 0.25, 0.75, 1803001),
    (("ディープ・ハウス", "テクノ"), "extra-trees", "librosa-base", 0.5, 0.6, 2004001),
    (("メタル", "ロック"), "extra-trees", "librosa-base", 0.25, 0.6, 2104001),
)
FUNK_ROCK_CONFIG = (
    ("ファンク", "ロック"), "logistic-pca64", "librosa-base",
    0.25, 0.75, 2511001,
)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def crossfit_proposal(
    base, pair, kind, view, strength, confidence_floor, seed,
    *, payload, labels, held_sources, formal, available,
    overlay_rows, overlay_features, macro, global_screen, black,
):
    actual = payload["actual"]
    sources = payload["sources"]
    eligible = payload["trainingEligible"].astype(bool)
    matrix = global_screen.view_matrix(
        view, payload["positions"], formal, base, black.RHYTHM_INDEXES,
    )
    overlay_matrix = global_screen.view_matrix(
        view,
        np.zeros((len(overlay_features), payload["positions"].shape[1]), dtype=np.float32),
        overlay_features,
        np.ones((len(overlay_features), len(labels)), dtype=np.float64),
        black.RHYTHM_INDEXES,
    )
    base_dimensions = (
        formal.shape[1] if view == "librosa-base" else len(black.RHYTHM_INDEXES)
    )
    overlay_matrix[:, base_dimensions:] = 0.0
    overlay_actual = np.asarray([row["genre"] for row in overlay_rows], dtype=object)
    overlay_sources = np.asarray([row["source"] for row in overlay_rows], dtype=object)
    learned = np.zeros_like(base)
    valid = np.zeros(len(actual), dtype=bool)
    folds = []
    for fold_index, held_source in enumerate(held_sources):
        training_indexes = np.flatnonzero(
            (sources != held_source) & eligible & available & np.isin(actual, pair)
        )
        overlay_indexes = np.flatnonzero(
            (overlay_sources != held_source) & np.isin(overlay_actual, pair)
        )
        features = matrix[training_indexes]
        train_actual = actual[training_indexes]
        train_sources = sources[training_indexes]
        if overlay_indexes.size:
            features = np.concatenate([features, overlay_matrix[overlay_indexes]])
            train_actual = np.concatenate([train_actual, overlay_actual[overlay_indexes]])
            train_sources = np.concatenate([train_sources, overlay_sources[overlay_indexes]])
        counts = Counter(train_actual)
        source_counts = {
            label: len(set(train_sources[train_actual == label])) for label in pair
        }
        if (
            min((counts.get(label, 0) for label in pair), default=0) < 8
            or min(source_counts.values(), default=0) < 2
        ):
            raise ValueError(
                f"blocked source coverage for {pair} holding {held_source}: "
                f"{dict(counts)} / {source_counts}"
            )
        model = macro.fit_model(
            kind, features, train_actual, train_sources, seed + fold_index * 100,
        )
        evaluation_indexes = np.flatnonzero((sources == held_source) & available)
        if evaluation_indexes.size:
            learned[evaluation_indexes] = macro.aligned_probabilities(
                model, matrix[evaluation_indexes], labels,
            )
            valid[evaluation_indexes] = True
        folds.append({
            "heldOutSource": str(held_source),
            "rows": dict(counts),
            "sourcesPerLabel": source_counts,
            "trainingOnlyOverlayRows": int(len(overlay_indexes)),
        })
    output, details = macro.rerank_group(
        base, learned, labels, pair, strength, confidence_floor, 0.0,
    )
    output[~valid] = base[~valid]
    return output, {**details, "folds": folds}


def render(report):
    baseline = report["baseline"]
    candidate = report["candidate"]
    return "\n".join([
        "# Unknown80 v105 Funk/Rock source-heldout gate", "",
        "| stack | Top1 | balanced | minimum source | Top3 | + / - |",
        "|---|---:|---:|---:|---:|---:|",
        f"| v104 | {baseline['top1Accuracy']:.2f}% | {baseline['balancedTop1']:.2f}% | {baseline['minimumSourceTop1']:.2f}% | {baseline['top3Accuracy']:.2f}% | - |",
        f"| v105 candidate | {candidate['top1Accuracy']:.2f}% | {candidate['balancedTop1']:.2f}% | {candidate['minimumSourceTop1']:.2f}% | {candidate['top3Accuracy']:.2f}% | {candidate['improved']} / {candidate['harmed']} |",
        "", f"Decision: **{report['decision']}**", "",
    ])


def run(args):
    helper = load_module(V103_HELPER_PATH, "stack_v105_helper")
    macro = load_module(helper.MACRO_PATH, "stack_v105_macro")
    global_screen = load_module(macro.GLOBAL_PATH, "stack_v105_global")
    stack = load_module(global_screen.STACK_PATH, "stack_v105_stack")
    black = load_module(stack.BLACK_PATH, "stack_v105_black")
    electronic = load_module(stack.ELECTRONIC_PATH, "stack_v105_electronic")
    residual = load_module(V103_RESIDUAL_PATH, "stack_v105_residual")
    payload = np.load(args.oof)
    labels = list(payload["labels"])
    actual = payload["actual"]
    sources = payload["sources"]
    formal, available = black.align_features(
        payload["sourceKeys"], black.load_feature_cache((args.formal_librosa,)),
    )
    helper_args = argparse.Namespace(
        formal_librosa=[args.formal_librosa],
        black_manifest=args.black_manifest,
        black_librosa=args.black_cache,
        electronic_manifest=args.electronic_manifest,
        electronic_librosa=args.electronic_cache,
        texture_manifest=args.texture_manifest,
        texture_librosa=args.texture_cache,
    )
    v103, held_sources, _metric, _conflicts = helper.build_v103(
        helper_args, macro, global_screen, stack, black, electronic, payload,
    )
    deep_rows, deep_features = residual.load_deep_overlay(
        black, args.deep_manifest, args.deep_cache,
        {str(value) for value in payload["sourceKeys"]},
    )
    v104_proposals = []
    v104_details = []
    for config in V104_CONFIGS:
        proposal, details = crossfit_proposal(
            v103, *config, payload=payload, labels=labels,
            held_sources=held_sources, formal=formal, available=available,
            overlay_rows=deep_rows, overlay_features=deep_features,
            macro=macro, global_screen=global_screen, black=black,
        )
        v104_proposals.append(proposal)
        v104_details.append(details)
    v104, v104_conflicts = helper.compose_unique(v103, v104_proposals)
    baseline = black.metric(actual, v104, labels, sources)
    expected = (59.75, 59.46, 31.58, 83.48)
    observed = tuple(baseline[key] for key in (
        "top1Accuracy", "balancedTop1", "minimumSourceTop1", "top3Accuracy",
    ))
    if observed != expected:
        raise ValueError(f"v104 reconstruction mismatch: {observed} != {expected}")
    funk_rows, funk_features = black.load_overlay(
        args.black_manifest, args.black_cache,
    )
    funk_proposal, funk_details = crossfit_proposal(
        v103, *FUNK_ROCK_CONFIG, payload=payload, labels=labels,
        held_sources=held_sources, formal=formal, available=available,
        overlay_rows=funk_rows, overlay_features=funk_features,
        macro=macro, global_screen=global_screen, black=black,
    )
    candidate_scores, candidate_conflicts = helper.compose_unique(
        v103, [*v104_proposals, funk_proposal],
    )
    candidate = black.compare_output(
        candidate_scores, v104, actual, labels, sources,
    )
    passed = (
        candidate["top1Accuracy"] > baseline["top1Accuracy"]
        and candidate["balancedTop1"] >= baseline["balancedTop1"]
        and candidate["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and candidate["top3Accuracy"] >= baseline["top3Accuracy"]
        and candidate["improved"] >= candidate["harmed"]
    )
    report = {
        "objective": "Add provider-cross-fitted Funk/Rock evidence without song rules.",
        "policy": {
            "metadataUsedAtInference": False,
            "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "top3CandidateSetChanged": False,
            "scoreMultisetChanged": False,
            "matchingProviderExcludedFromOuterFold": True,
            "productionModelUpdated": False,
        },
        "dataset": {
            "rows": len(actual), "labels": len(labels),
            "featureCoverage": int(np.sum(available)),
            "heldOutSources": [str(value) for value in held_sources],
            "funkRockTrainingOnlyRows": sum(
                row.get("genre") in FUNK_ROCK_CONFIG[0] for row in funk_rows
            ),
            "funkRockOverlaySources": dict(Counter(
                row["source"] for row in funk_rows
                if row.get("genre") in FUNK_ROCK_CONFIG[0]
            )),
        },
        "baseline": baseline,
        "candidate": candidate,
        "v104ConflictingRowsLeftAtV103": v104_conflicts,
        "candidateConflictingRowsLeftAtV103": candidate_conflicts,
        "v104Details": v104_details,
        "funkRockDetails": funk_details,
        "decision": "continue-production-gate" if passed else "reject-v105",
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def main():
    helper = load_module(V103_HELPER_PATH, "stack_v105_defaults")
    macro = load_module(helper.MACRO_PATH, "stack_v105_macro_defaults")
    global_screen = load_module(macro.GLOBAL_PATH, "stack_v105_global_defaults")
    stack = load_module(global_screen.STACK_PATH, "stack_v105_stack_defaults")
    electronic = load_module(stack.ELECTRONIC_PATH, "stack_v105_electronic_defaults")
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=electronic.DEFAULT_OOF)
    parser.add_argument("--formal-librosa", type=Path, default=electronic.DEFAULT_FORMAL_LIBROSA)
    parser.add_argument("--black-manifest", type=Path, default=electronic.DEFAULT_BLACK_MANIFEST)
    parser.add_argument("--black-cache", type=Path, default=electronic.DEFAULT_BLACK_LIBROSA)
    parser.add_argument("--electronic-manifest", type=Path, default=electronic.DEFAULT_OVERLAY_MANIFEST)
    parser.add_argument("--electronic-cache", type=Path, default=electronic.DEFAULT_OVERLAY_LIBROSA)
    parser.add_argument("--texture-manifest", type=Path, default=macro.DEFAULT_TEXTURE_MANIFEST)
    parser.add_argument("--texture-cache", type=Path, default=macro.DEFAULT_TEXTURE_LIBROSA)
    parser.add_argument("--deep-manifest", type=Path, action="append", default=[])
    parser.add_argument("--deep-cache", type=Path, action="append", default=[])
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    args.deep_manifest = args.deep_manifest or list(DEFAULT_DEEP_MANIFESTS)
    args.deep_cache = args.deep_cache or list(DEFAULT_DEEP_CACHES)
    report = run(args)
    print(json.dumps({
        "baseline": report["baseline"], "candidate": report["candidate"],
        "decision": report["decision"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
