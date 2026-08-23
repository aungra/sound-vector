#!/usr/bin/env python3
"""Evaluate a source-balanced Drone/Noise post-reranker on fixed v105."""

from __future__ import annotations

import argparse
import importlib.util
import json
from collections import Counter
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
V105_SOURCE_PATH = Path(__file__).with_name(
    "genre-unknown80-independent-stack-v105-source-heldout.py"
)
DEFAULT_REPORT = TRAINING / "unknown80-independent-stack-v106-source-heldout.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-independent-stack-v106-source-heldout.md"
DEFAULT_NOISE_MANIFEST = (
    TRAINING / "internet-archive-explicit-noise-v1-cc-source-manifest.json"
)
DEFAULT_NOISE_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "internet-archive-explicit-noise-v1-librosa.json"
)
DRONE_NOISE_CONFIG = (
    ("ドローン", "ノイズミュージック"),
    "logistic-pca64", "rhythm-base", 0.75, 0.6, 2610001,
)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def merge_overlay(black, groups):
    rows = []
    vectors = []
    seen = set()
    for manifest, cache in groups:
        group_rows, group_vectors = black.load_overlay(manifest, cache)
        for row, vector in zip(group_rows, group_vectors):
            key = black.source_key(row)
            if key in seen:
                continue
            seen.add(key)
            rows.append(row)
            vectors.append(vector)
    return rows, np.asarray(vectors, dtype=np.float32)


def render(report):
    baseline = report["baseline"]
    candidate = report["candidate"]
    return "\n".join([
        "# Unknown80 v106 Drone/Noise source-heldout gate", "",
        "| stack | Top1 | balanced | minimum source | Top3 | + / - |",
        "|---|---:|---:|---:|---:|---:|",
        f"| v105 | {baseline['top1Accuracy']:.2f}% | {baseline['balancedTop1']:.2f}% | {baseline['minimumSourceTop1']:.2f}% | {baseline['top3Accuracy']:.2f}% | - |",
        f"| v106 candidate | {candidate['top1Accuracy']:.2f}% | {candidate['balancedTop1']:.2f}% | {candidate['minimumSourceTop1']:.2f}% | {candidate['top3Accuracy']:.2f}% | {candidate['improved']} / {candidate['harmed']} |",
        "", f"Decision: **{report['decision']}**", "",
    ])


def runtime_modules(prefix):
    v105 = load_module(V105_SOURCE_PATH, f"{prefix}_v105")
    helper = load_module(v105.V103_HELPER_PATH, f"{prefix}_helper")
    macro = load_module(helper.MACRO_PATH, f"{prefix}_macro")
    global_screen = load_module(macro.GLOBAL_PATH, f"{prefix}_global")
    stack = load_module(global_screen.STACK_PATH, f"{prefix}_stack")
    black = load_module(stack.BLACK_PATH, f"{prefix}_black")
    electronic = load_module(stack.ELECTRONIC_PATH, f"{prefix}_electronic")
    residual = load_module(v105.V103_RESIDUAL_PATH, f"{prefix}_residual")
    return v105, helper, macro, global_screen, stack, black, electronic, residual


def run(args):
    v105, helper, macro, global_screen, stack, black, electronic, residual = (
        runtime_modules("stack_v106")
    )
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
    black_rows, black_features = black.load_overlay(
        args.black_manifest, args.black_cache,
    )
    texture_rows, texture_features = merge_overlay(black, (
        (args.texture_manifest, args.texture_cache),
        (args.noise_manifest, args.noise_cache),
    ))
    proposals = []
    existing_details = []
    for config in v105.V104_CONFIGS:
        proposal, details = v105.crossfit_proposal(
            v103, *config, payload=payload, labels=labels,
            held_sources=held_sources, formal=formal, available=available,
            overlay_rows=deep_rows, overlay_features=deep_features,
            macro=macro, global_screen=global_screen, black=black,
        )
        proposals.append(proposal)
        existing_details.append(details)
    funk_proposal, funk_details = v105.crossfit_proposal(
        v103, *v105.FUNK_ROCK_CONFIG, payload=payload, labels=labels,
        held_sources=held_sources, formal=formal, available=available,
        overlay_rows=black_rows, overlay_features=black_features,
        macro=macro, global_screen=global_screen, black=black,
    )
    proposals.append(funk_proposal)
    v105_scores, v105_conflicts = helper.compose_unique(v103, proposals)
    baseline = black.metric(actual, v105_scores, labels, sources)
    expected = (59.8, 59.49, 31.58, 83.48)
    observed = tuple(baseline[key] for key in (
        "top1Accuracy", "balancedTop1", "minimumSourceTop1", "top3Accuracy",
    ))
    if observed != expected:
        raise ValueError(f"v105 reconstruction mismatch: {observed} != {expected}")
    candidate_proposal, candidate_details = v105.crossfit_proposal(
        v103, *DRONE_NOISE_CONFIG, payload=payload, labels=labels,
        held_sources=held_sources, formal=formal, available=available,
        overlay_rows=texture_rows, overlay_features=texture_features,
        macro=macro, global_screen=global_screen, black=black,
    )
    candidate_scores, candidate_conflicts = helper.compose_unique(
        v103, [*proposals, candidate_proposal],
    )
    candidate = black.compare_output(
        candidate_scores, v105_scores, actual, labels, sources,
    )
    passed = (
        candidate["top1Accuracy"] > baseline["top1Accuracy"]
        and candidate["balancedTop1"] >= baseline["balancedTop1"]
        and candidate["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and candidate["top3Accuracy"] >= baseline["top3Accuracy"]
        and candidate["improved"] >= candidate["harmed"]
    )
    relevant = set(DRONE_NOISE_CONFIG[0])
    report = {
        "objective": "Resolve Drone/Noise with a third explicit-label Noise provider.",
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
            "trainingOnlyRows": sum(row.get("genre") in relevant for row in texture_rows),
            "sourcesByLabel": {
                label: dict(Counter(
                    row["source"] for row in texture_rows if row.get("genre") == label
                )) for label in relevant
            },
        },
        "baseline": baseline,
        "candidate": candidate,
        "v105ConflictingRowsLeftAtV103": v105_conflicts,
        "candidateConflictingRowsLeftAtV103": candidate_conflicts,
        "existingDetails": existing_details,
        "funkRockDetails": funk_details,
        "droneNoiseDetails": candidate_details,
        "decision": "continue-production-gate" if passed else "reject-v106",
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def parser_defaults():
    v105, _helper, macro, _global, _stack, _black, electronic, _residual = (
        runtime_modules("stack_v106_defaults")
    )
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=electronic.DEFAULT_OOF)
    parser.add_argument("--formal-librosa", type=Path, default=electronic.DEFAULT_FORMAL_LIBROSA)
    parser.add_argument("--black-manifest", type=Path, default=electronic.DEFAULT_BLACK_MANIFEST)
    parser.add_argument("--black-cache", type=Path, default=electronic.DEFAULT_BLACK_LIBROSA)
    parser.add_argument("--electronic-manifest", type=Path, default=electronic.DEFAULT_OVERLAY_MANIFEST)
    parser.add_argument("--electronic-cache", type=Path, default=electronic.DEFAULT_OVERLAY_LIBROSA)
    parser.add_argument("--texture-manifest", type=Path, default=macro.DEFAULT_TEXTURE_MANIFEST)
    parser.add_argument("--texture-cache", type=Path, default=macro.DEFAULT_TEXTURE_LIBROSA)
    parser.add_argument("--noise-manifest", type=Path, default=DEFAULT_NOISE_MANIFEST)
    parser.add_argument("--noise-cache", type=Path, default=DEFAULT_NOISE_CACHE)
    parser.add_argument("--deep-manifest", type=Path, action="append", default=[])
    parser.add_argument("--deep-cache", type=Path, action="append", default=[])
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    return parser, v105


def main():
    parser, v105 = parser_defaults()
    args = parser.parse_args()
    args.deep_manifest = args.deep_manifest or list(v105.DEFAULT_DEEP_MANIFESTS)
    args.deep_cache = args.deep_cache or list(v105.DEFAULT_DEEP_CACHES)
    report = run(args)
    print(json.dumps({
        "baseline": report["baseline"], "candidate": report["candidate"],
        "decision": report["decision"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
