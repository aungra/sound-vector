#!/usr/bin/env python3
"""Screen provider-heldout residual pair rerankers on fixed v103."""

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
V103_HELPER_PATH = Path(__file__).with_name(
    "genre-unknown80-v103-mulan-summary-screen.py"
)
DEFAULT_REPORT = TRAINING / "unknown80-v103-residual-pair-screen.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-v103-residual-pair-screen.md"
DEFAULT_DEEP_OVERLAY_MANIFEST = TRAINING / "fma-target-cc-source-manifest.json"
DEFAULT_DEEP_OVERLAY_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "librosa-feature-cache.json"
)
PAIRS = (
    ("ディープ・ハウス", "ハウス"),
    ("ハウス", "テクノ"),
    ("ディープ・ハウス", "テクノ"),
    ("メタル", "ロック"),
    ("ロック", "パンク"),
    ("メタル", "パンク"),
    ("クラシック音楽", "アンビエント"),
    ("クラシック音楽", "ジャズ"),
)
KINDS = ("extra-trees", "logistic-pca64")
VIEWS = ("rhythm-base", "librosa-base")
STRENGTHS = (0.25, 0.5, 0.75, 1.0)
CONFIDENCE_FLOORS = (0.0, 0.6, 0.75, 0.9)
CANDIDATE_MASS_FLOORS = (0.0, 0.5, 0.7)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def render(report):
    lines = [
        "# Unknown80 v103 residual pair screen", "",
        "Provider-cross-fitted runtime features only reorder existing v103 Top3 values.",
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


def load_deep_overlay(black, manifest_paths, cache_paths, excluded_keys):
    cache = black.load_feature_cache(tuple(cache_paths))
    rows = []
    vectors = []
    seen = set()
    allowed_licenses = {"CC0", "CC-BY", "CC-BY-SA"}
    for manifest_path in manifest_paths:
        for row in json.loads(manifest_path.read_text()).get("items", []):
            if row.get("genre") != "ディープ・ハウス":
                continue
            if row.get("license") not in allowed_licenses:
                continue
            key = black.source_key(row)
            vector = cache.get(key)
            if not key or key in seen or key in excluded_keys or vector is None:
                continue
            seen.add(key)
            rows.append(row)
            vectors.append(vector)
    return rows, np.asarray(vectors, dtype=np.float32)


def run(args):
    helper = load_module(V103_HELPER_PATH, "v103_pair_helper")
    macro = load_module(helper.MACRO_PATH, "v103_pair_macro")
    global_screen = load_module(macro.GLOBAL_PATH, "v103_pair_global")
    stack = load_module(global_screen.STACK_PATH, "v103_pair_stack")
    black = load_module(stack.BLACK_PATH, "v103_pair_black")
    electronic = load_module(stack.ELECTRONIC_PATH, "v103_pair_electronic")
    payload = np.load(args.oof)
    labels = list(payload["labels"])
    actual = payload["actual"]
    sources = payload["sources"]
    eligible = payload["trainingEligible"].astype(bool)
    formal, available = black.align_features(
        payload["sourceKeys"], black.load_feature_cache(args.formal_librosa)
    )
    deep_rows, deep_features = load_deep_overlay(
        black, args.deep_overlay_manifest, args.deep_overlay_cache,
        {str(value) for value in payload["sourceKeys"]},
    )
    deep_actual = np.asarray([row["genre"] for row in deep_rows], dtype=object)
    deep_sources = np.asarray([row["source"] for row in deep_rows], dtype=object)
    v103, held_sources, baseline, v103_conflicts = helper.build_v103(
        args, macro, global_screen, stack, black, electronic, payload
    )
    matrices = {
        view: global_screen.view_matrix(
            view, payload["positions"], formal, v103, black.RHYTHM_INDEXES
        )
        for view in VIEWS
    }
    overlay_matrices = {}
    for view in VIEWS:
        overlay_matrices[view] = global_screen.view_matrix(
            view,
            np.zeros((len(deep_features), payload["positions"].shape[1]), dtype=np.float32),
            deep_features,
            np.ones((len(deep_features), len(labels)), dtype=np.float64),
            black.RHYTHM_INDEXES,
        )
        base_dimensions = (
            formal.shape[1] if view == "librosa-base" else len(black.RHYTHM_INDEXES)
        )
        overlay_matrices[view][:, base_dimensions:] = 0.0
    candidates = {"v103": baseline}
    candidate_outputs = {}
    candidate_pairs = {}
    diagnostics = []
    for pair_index, pair in enumerate(PAIRS):
        for kind_index, kind in enumerate(KINDS):
            for view_index, view in enumerate(VIEWS):
                learned = np.zeros_like(v103)
                valid = np.zeros(len(actual), dtype=bool)
                folds = []
                blocked = False
                for fold_index, held_source in enumerate(held_sources):
                    training_indexes = np.flatnonzero(
                        (sources != held_source) & eligible & available
                        & np.isin(actual, pair)
                    )
                    overlay_indexes = np.flatnonzero(
                        (deep_sources != held_source) & np.isin(deep_actual, pair)
                    )
                    training_features = matrices[view][training_indexes]
                    training_actual = actual[training_indexes]
                    training_sources = sources[training_indexes]
                    if overlay_indexes.size:
                        training_features = np.concatenate([
                            training_features, overlay_matrices[view][overlay_indexes]
                        ])
                        training_actual = np.concatenate([
                            training_actual, deep_actual[overlay_indexes]
                        ])
                        training_sources = np.concatenate([
                            training_sources, deep_sources[overlay_indexes]
                        ])
                    counts = Counter(training_actual)
                    source_counts = {
                        label: len(set(training_sources[training_actual == label]))
                        for label in pair
                    }
                    if (
                        min((counts.get(label, 0) for label in pair), default=0) < 8
                        or min(source_counts.values(), default=0) < 2
                    ):
                        blocked = True
                        folds.append({
                            "heldOutSource": str(held_source),
                            "status": "blocked-source-coverage",
                            "rows": dict(counts),
                            "sourcesPerLabel": source_counts,
                        })
                        break
                    model = macro.fit_model(
                        kind, training_features, training_actual, training_sources,
                        1803001 + pair_index * 100000 + kind_index * 10000
                        + view_index * 1000 + fold_index * 100,
                    )
                    evaluation_indexes = np.flatnonzero(
                        (sources == held_source) & available
                    )
                    if evaluation_indexes.size:
                        learned[evaluation_indexes] = macro.aligned_probabilities(
                            model, matrices[view][evaluation_indexes], labels
                        )
                        valid[evaluation_indexes] = True
                    folds.append({
                        "heldOutSource": str(held_source),
                        "status": "fitted",
                        "rows": dict(counts),
                        "sourcesPerLabel": source_counts,
                        "trainingOnlyOverlayRows": int(len(overlay_indexes)),
                    })
                diagnostics.append({
                    "pair": list(pair), "kind": kind, "view": view,
                    "folds": folds,
                })
                if blocked:
                    continue
                for strength in STRENGTHS:
                    for confidence_floor in CONFIDENCE_FLOORS:
                        for mass_floor in CANDIDATE_MASS_FLOORS:
                            output, detail = macro.rerank_group(
                                v103, learned, labels, pair, strength,
                                confidence_floor, mass_floor,
                            )
                            output[~valid] = v103[~valid]
                            name = (
                                f"{'-'.join(pair)}-{kind}-{view}-w{strength:g}"
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
                                candidate_pairs[name] = pair

    best_by_pair = {}
    for name in candidate_outputs:
        pair = candidate_pairs[name]
        old = best_by_pair.get(pair)
        if old is None or (
            candidates[name]["top1Accuracy"],
            candidates[name]["balancedTop1"],
            candidates[name]["minimumSourceTop1"],
        ) > (
            candidates[old]["top1Accuracy"],
            candidates[old]["balancedTop1"],
            candidates[old]["minimumSourceTop1"],
        ):
            best_by_pair[pair] = name
    best_names = list(best_by_pair.values())
    for size in range(2, len(best_names) + 1):
        for members in itertools.combinations(best_names, size):
            output, conflicts = helper.compose_unique(
                v103, [candidate_outputs[name] for name in members]
            )
            name = "combined-" + "+".join(
                "-".join(candidate_pairs[value]) for value in members
            )
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
    report = {
        "objective": "Convert recurrent v103 pair confusions with runtime features.",
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
            "deepHouseTrainingOnlyOverlayRows": len(deep_rows),
            "deepHouseOverlaySources": dict(Counter(deep_sources)),
            "heldOutSources": [str(value) for value in held_sources],
            "pairs": [list(pair) for pair in PAIRS],
        },
        "baseline": baseline,
        "v103ConflictingRowsLeftAtV102": v103_conflicts,
        "candidates": candidates,
        "ranking": ranking,
        "promotionScreen": promotions,
        "bestCandidateByPair": {
            "|".join(pair): name for pair, name in best_by_pair.items()
        },
        "decision": (
            "continue-production-gate"
            if promotions else "reject-no-strict-source-heldout-gain"
        ),
        "diagnostics": diagnostics,
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def main():
    helper = load_module(V103_HELPER_PATH, "v103_pair_defaults")
    macro = load_module(helper.MACRO_PATH, "v103_pair_macro_defaults")
    global_screen = load_module(macro.GLOBAL_PATH, "v103_pair_global_defaults")
    stack = load_module(global_screen.STACK_PATH, "v103_pair_stack_defaults")
    electronic = load_module(stack.ELECTRONIC_PATH, "v103_pair_electronic_defaults")
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=electronic.DEFAULT_OOF)
    parser.add_argument("--formal-librosa", type=Path, action="append", default=[])
    parser.add_argument("--black-manifest", type=Path, default=electronic.DEFAULT_BLACK_MANIFEST)
    parser.add_argument("--black-librosa", type=Path, default=electronic.DEFAULT_BLACK_LIBROSA)
    parser.add_argument("--electronic-manifest", type=Path, default=electronic.DEFAULT_OVERLAY_MANIFEST)
    parser.add_argument("--electronic-librosa", type=Path, default=electronic.DEFAULT_OVERLAY_LIBROSA)
    parser.add_argument("--texture-manifest", type=Path, default=macro.DEFAULT_TEXTURE_MANIFEST)
    parser.add_argument("--texture-librosa", type=Path, default=macro.DEFAULT_TEXTURE_LIBROSA)
    parser.add_argument("--deep-overlay-manifest", type=Path, action="append", default=[])
    parser.add_argument("--deep-overlay-cache", type=Path, action="append", default=[])
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    if not args.formal_librosa:
        args.formal_librosa = [electronic.DEFAULT_FORMAL_LIBROSA]
    if not args.deep_overlay_manifest:
        args.deep_overlay_manifest = [DEFAULT_DEEP_OVERLAY_MANIFEST]
    if not args.deep_overlay_cache:
        args.deep_overlay_cache = [DEFAULT_DEEP_OVERLAY_CACHE]
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
