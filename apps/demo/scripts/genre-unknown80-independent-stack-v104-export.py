#!/usr/bin/env python3
"""Export v103 plus strict multi-source post-macro boundary rerankers."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import pickle
from collections import Counter
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
V103_EXPORT_PATH = Path(__file__).with_name(
    "genre-unknown80-independent-stack-v103-export.py"
)
V103_HELPER_PATH = Path(__file__).with_name(
    "genre-unknown80-v103-mulan-summary-screen.py"
)
RESIDUAL_PATH = Path(__file__).with_name(
    "genre-unknown80-v103-residual-pair-screen.py"
)
DEFAULT_OUTPUT = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-independent-multiboundary-stack-v104-candidate.pkl"
)
DEFAULT_MANIFEST = TRAINING / "unknown80-independent-stack-v104-model-manifest.json"
SOURCE_HELDOUT_REPORT = (
    TRAINING / "unknown80-v103-strict-multisource-deep-house-pair-screen.json"
)
PRODUCTION_REPORT = TRAINING / "unknown80-independent-stack-v104-production-regression.json"
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

POST_GROUP_CONFIGS = (
    {
        "labels": ("ディープ・ハウス", "ハウス"),
        "kind": "extra-trees", "view": "rhythm-base", "strength": 0.25,
        "confidenceFloor": 0.75, "candidateMassFloor": 0.0,
    },
    {
        "labels": ("ディープ・ハウス", "テクノ"),
        "kind": "extra-trees", "view": "librosa-base", "strength": 0.5,
        "confidenceFloor": 0.6, "candidateMassFloor": 0.0,
    },
    {
        "labels": ("メタル", "ロック"),
        "kind": "extra-trees", "view": "librosa-base", "strength": 0.25,
        "confidenceFloor": 0.6, "candidateMassFloor": 0.0,
    },
)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(args):
    v103_export = load_module(V103_EXPORT_PATH, "stack_v104_v103_export")
    v103_export.run(args)
    helper = load_module(V103_HELPER_PATH, "stack_v104_helper")
    macro = load_module(helper.MACRO_PATH, "stack_v104_macro")
    global_screen = load_module(macro.GLOBAL_PATH, "stack_v104_global")
    stack = load_module(global_screen.STACK_PATH, "stack_v104_stack")
    black = load_module(stack.BLACK_PATH, "stack_v104_black")
    electronic = load_module(stack.ELECTRONIC_PATH, "stack_v104_electronic")
    residual = load_module(RESIDUAL_PATH, "stack_v104_residual")

    payload = np.load(args.oof)
    labels = list(payload["labels"])
    actual = payload["actual"]
    sources = payload["sources"]
    eligible = payload["trainingEligible"].astype(bool)
    formal, available = black.align_features(
        payload["sourceKeys"], black.load_feature_cache((args.formal_librosa,))
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
    v103_scores, _held_sources, _metric, _conflicts = helper.build_v103(
        helper_args, macro, global_screen, stack, black, electronic, payload
    )
    overlay_rows, overlay_features = residual.load_deep_overlay(
        black, args.deep_manifest, args.deep_cache,
        {str(value) for value in payload["sourceKeys"]},
    )
    overlay_actual = np.asarray([row["genre"] for row in overlay_rows], dtype=object)
    overlay_sources = np.asarray([row["source"] for row in overlay_rows], dtype=object)
    views = {config["view"] for config in POST_GROUP_CONFIGS}
    matrices = {
        view: global_screen.view_matrix(
            view, payload["positions"], formal, v103_scores, black.RHYTHM_INDEXES
        )
        for view in views
    }
    overlay_matrices = {}
    for view in views:
        overlay_matrices[view] = global_screen.view_matrix(
            view,
            np.zeros((len(overlay_features), payload["positions"].shape[1]), dtype=np.float32),
            overlay_features,
            np.ones((len(overlay_features), len(labels)), dtype=np.float64),
            black.RHYTHM_INDEXES,
        )
        base_dimensions = (
            formal.shape[1] if view == "librosa-base" else len(black.RHYTHM_INDEXES)
        )
        overlay_matrices[view][:, base_dimensions:] = 0.0

    post_models = {}
    post_members = []
    training = []
    parity_inputs = []
    for index, config in enumerate(POST_GROUP_CONFIGS):
        pair = config["labels"]
        formal_indexes = np.flatnonzero(
            eligible & available & np.isin(actual, pair)
        )
        overlay_indexes = np.flatnonzero(np.isin(overlay_actual, pair))
        matrix = matrices[config["view"]][formal_indexes]
        train_actual = actual[formal_indexes]
        train_sources = sources[formal_indexes]
        if overlay_indexes.size:
            matrix = np.concatenate([
                matrix, overlay_matrices[config["view"]][overlay_indexes]
            ])
            train_actual = np.concatenate([
                train_actual, overlay_actual[overlay_indexes]
            ])
            train_sources = np.concatenate([
                train_sources, overlay_sources[overlay_indexes]
            ])
        model = macro.fit_model(
            config["kind"], matrix, train_actual, train_sources,
            1803001 + index * 10000,
        )
        feature_indexes = (
            np.arange(black.LIBROSA_DIMENSIONS, dtype=np.int64)
            if config["view"] == "librosa-base"
            else np.asarray(black.RHYTHM_INDEXES, dtype=np.int64)
        )
        post_models[pair] = model
        post_members.append({
            "labels": list(pair),
            "strength": config["strength"],
            "confidenceFloor": config["confidenceFloor"],
            "candidateMassFloor": config["candidateMassFloor"],
            "featureIndexes": feature_indexes.tolist(),
            "normalizationMode": "identity",
            "appendLogScores": True,
        })
        training.append({
            "labels": list(pair), "kind": config["kind"], "view": config["view"],
            "formalRows": int(len(formal_indexes)),
            "trainingOnlyOverlayRows": int(len(overlay_indexes)),
            "rowsByLabel": dict(Counter(train_actual)),
            "rowsBySource": dict(Counter(train_sources)),
        })
        parity_inputs.append((pair, matrix[:64]))

    production_gate = (
        json.loads(PRODUCTION_REPORT.read_text()).get("promotionGate")
        if PRODUCTION_REPORT.is_file() else "pending"
    )
    with args.output.open("rb") as handle:
        bundle = pickle.load(handle)
    bundle.update({
        "modelVersion": "unknown80-independent-multiboundary-20260823-v104",
        "method": "audio-only-source-heldout-pair-macro-post-boundary-stack",
        "combinationName": "conservative-v103-plus-three-post-boundary-stack",
        "postGroupMembers": post_members,
        "postGroupModels": post_models,
    })
    bundle["policy"]["productionModelUpdated"] = production_gate == "passed"
    with args.output.open("wb") as handle:
        pickle.dump(bundle, handle, protocol=pickle.HIGHEST_PROTOCOL)
    with args.output.open("rb") as handle:
        restored = pickle.load(handle)
    maximum_difference = max((
        float(np.max(np.abs(
            post_models[pair].predict_proba(matrix)
            - restored["postGroupModels"][pair].predict_proba(matrix)
        )))
        for pair, matrix in parity_inputs
    ), default=0.0)

    manifest = json.loads(args.manifest.read_text())
    manifest.update({
        "candidateModelPath": str(args.output),
        "candidateModelSha256": sha256(args.output),
        "candidateModelBytes": args.output.stat().st_size,
        "modelVersion": bundle["modelVersion"],
        "method": bundle["method"],
        "training": {**manifest.get("training", {}), "postGroupMembers": training},
        "combination": {
            **manifest.get("combination", {}),
            "name": bundle["combinationName"],
            "postGroupMembers": post_members,
        },
        "serializationParity": {
            "rows": int(sum(len(matrix) for _pair, matrix in parity_inputs)),
            "maximumProbabilityDifference": maximum_difference,
            "passed": maximum_difference <= 1e-12,
        },
        "promotionDecision": "pending-production-regression",
        "productionModelUpdated": production_gate == "passed",
    })
    manifest["evaluation"].update({
        "postBoundarySourceHeldoutReport": str(SOURCE_HELDOUT_REPORT.relative_to(ROOT)),
        "postBoundarySourceHeldoutReportSha256": sha256(SOURCE_HELDOUT_REPORT),
        "strictTop1": 59.75,
        "strictBalancedTop1": 59.46,
        "strictMinimumSourceTop1": 31.58,
        "strictTop3": 83.48,
        "sourceHeldoutImproved": 4,
        "sourceHeldoutHarmed": 1,
        "productionRegressionReport": str(PRODUCTION_REPORT.relative_to(ROOT)),
        "productionRegressionReportSha256": (
            sha256(PRODUCTION_REPORT) if PRODUCTION_REPORT.is_file() else None
        ),
        "productionGate": production_gate,
    })
    if manifest["evaluation"]["productionGate"] == "passed":
        manifest["promotionDecision"] = "promote-runtime-all-gates-passed"
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return manifest


def main():
    v103 = load_module(V103_EXPORT_PATH, "stack_v104_defaults")
    v102 = load_module(v103.V102_PATH, "stack_v104_v102_defaults")
    v101 = load_module(v102.V101_PATH, "stack_v104_v101_defaults")
    v100 = v101.load_module(v101.V100_PATH, "stack_v104_v100_defaults")
    black = v100.load_module(v100.SHARED_PATH, "stack_v104_black_defaults")
    macro = load_module(v103.MACRO_PATH, "stack_v104_macro_defaults")
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=black.DEFAULT_OOF)
    parser.add_argument("--formal-librosa", type=Path, default=black.DEFAULT_FORMAL_LIBROSA)
    parser.add_argument("--black-manifest", type=Path, default=v100.BLACK_MANIFEST)
    parser.add_argument("--black-cache", type=Path, default=v100.BLACK_CACHE)
    parser.add_argument("--electronic-manifest", type=Path, default=v100.ELECTRONIC_MANIFEST)
    parser.add_argument("--electronic-cache", type=Path, default=v100.ELECTRONIC_CACHE)
    parser.add_argument("--texture-manifest", type=Path, default=macro.DEFAULT_TEXTURE_MANIFEST)
    parser.add_argument("--texture-cache", type=Path, default=macro.DEFAULT_TEXTURE_LIBROSA)
    parser.add_argument("--deep-manifest", type=Path, action="append", default=[])
    parser.add_argument("--deep-cache", type=Path, action="append", default=[])
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()
    if not args.deep_manifest:
        args.deep_manifest = list(DEFAULT_DEEP_MANIFESTS)
    if not args.deep_cache:
        args.deep_cache = list(DEFAULT_DEEP_CACHES)
    manifest = run(args)
    print(json.dumps({
        "candidateModelPath": manifest["candidateModelPath"],
        "candidateModelSha256": manifest["candidateModelSha256"],
        "serializationParity": manifest["serializationParity"],
        "strictTop1": manifest["evaluation"]["strictTop1"],
        "promotionDecision": manifest["promotionDecision"],
    }, ensure_ascii=False, indent=2))
    raise SystemExit(0 if manifest["serializationParity"]["passed"] else 1)


if __name__ == "__main__":
    main()
