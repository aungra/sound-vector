#!/usr/bin/env python3
"""Evaluate a source-heldout Latin/Folk post-reranker on fixed v106."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
V106_SOURCE_PATH = Path(__file__).with_name(
    "genre-unknown80-independent-stack-v106-source-heldout.py"
)
DEFAULT_REPORT = TRAINING / "unknown80-independent-stack-v107-source-heldout.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-independent-stack-v107-source-heldout.md"
LATIN_FOLK_CONFIG = (
    ("ラテン", "フォーク"),
    "logistic-pca64", "rhythm-base", 0.5, 0.75, 2701001,
)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def runtime_modules(prefix):
    v106 = load_module(V106_SOURCE_PATH, f"{prefix}_v106")
    return v106, *v106.runtime_modules(prefix)


def build_v106(args, modules, payload, formal, available):
    v106, v105, helper, macro, global_screen, stack, black, electronic, residual = modules
    labels = list(payload["labels"])
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
    texture_rows, texture_features = v106.merge_overlay(black, (
        (args.texture_manifest, args.texture_cache),
        (args.noise_manifest, args.noise_cache),
    ))
    proposals = []
    details = []
    for config, rows, features in (
        *((config, deep_rows, deep_features) for config in v105.V104_CONFIGS),
        (v105.FUNK_ROCK_CONFIG, black_rows, black_features),
        (v106.DRONE_NOISE_CONFIG, texture_rows, texture_features),
    ):
        proposal, detail = v105.crossfit_proposal(
            v103, *config, payload=payload, labels=labels,
            held_sources=held_sources, formal=formal, available=available,
            overlay_rows=rows, overlay_features=features,
            macro=macro, global_screen=global_screen, black=black,
        )
        proposals.append(proposal)
        details.append(detail)
    output, conflicts = helper.compose_unique(v103, proposals)
    return v103, output, held_sources, proposals, details, conflicts


def render(report):
    baseline = report["baseline"]
    candidate = report["candidate"]
    return "\n".join([
        "# Unknown80 v107 Latin/Folk source-heldout gate", "",
        "| stack | Top1 | balanced | minimum source | Top3 | + / - |",
        "|---|---:|---:|---:|---:|---:|",
        f"| v106 | {baseline['top1Accuracy']:.2f}% | {baseline['balancedTop1']:.2f}% | {baseline['minimumSourceTop1']:.2f}% | {baseline['top3Accuracy']:.2f}% | - |",
        f"| v107 candidate | {candidate['top1Accuracy']:.2f}% | {candidate['balancedTop1']:.2f}% | {candidate['minimumSourceTop1']:.2f}% | {candidate['top3Accuracy']:.2f}% | {candidate['improved']} / {candidate['harmed']} |",
        "", f"Decision: **{report['decision']}**", "",
    ])


def run(args):
    modules = runtime_modules("stack_v107")
    v106, v105, helper, macro, global_screen, _stack, black, electronic, _residual = modules
    payload = np.load(args.oof)
    labels = list(payload["labels"])
    actual = payload["actual"]
    sources = payload["sources"]
    formal, available = black.align_features(
        payload["sourceKeys"], black.load_feature_cache((args.formal_librosa,)),
    )
    v103, baseline_scores, held_sources, proposals, existing_details, baseline_conflicts = (
        build_v106(args, modules, payload, formal, available)
    )
    baseline = black.metric(actual, baseline_scores, labels, sources)
    expected = (59.9, 59.7, 31.58, 83.48)
    observed = tuple(baseline[key] for key in (
        "top1Accuracy", "balancedTop1", "minimumSourceTop1", "top3Accuracy",
    ))
    if observed != expected:
        raise ValueError(f"v106 reconstruction mismatch: {observed} != {expected}")
    empty_rows = []
    empty_features = np.empty((0, formal.shape[1]), dtype=np.float32)
    candidate_proposal, candidate_details = v105.crossfit_proposal(
        v103, *LATIN_FOLK_CONFIG, payload=payload, labels=labels,
        held_sources=held_sources, formal=formal, available=available,
        overlay_rows=empty_rows, overlay_features=empty_features,
        macro=macro, global_screen=global_screen, black=black,
    )
    candidate_scores, candidate_conflicts = helper.compose_unique(
        v103, [*proposals, candidate_proposal],
    )
    candidate = black.compare_output(
        candidate_scores, baseline_scores, actual, labels, sources,
    )
    passed = (
        candidate["top1Accuracy"] > baseline["top1Accuracy"]
        and candidate["balancedTop1"] >= baseline["balancedTop1"]
        and candidate["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and candidate["top3Accuracy"] >= baseline["top3Accuracy"]
        and candidate["improved"] >= candidate["harmed"]
    )
    report = {
        "objective": "Resolve Latin/Folk using provider-cross-fitted rhythm evidence.",
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
            "trainingOnlyOverlayRows": 0,
        },
        "baseline": baseline,
        "candidate": candidate,
        "v106ConflictingRowsLeftAtV103": baseline_conflicts,
        "candidateConflictingRowsLeftAtV103": candidate_conflicts,
        "existingDetails": existing_details,
        "latinFolkDetails": candidate_details,
        "decision": "continue-production-gate" if passed else "reject-v107",
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def parser_defaults():
    v106 = load_module(V106_SOURCE_PATH, "stack_v107_defaults")
    parser, v105 = v106.parser_defaults()
    parser.set_defaults(report=DEFAULT_REPORT, markdown=DEFAULT_MARKDOWN)
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
