#!/usr/bin/env python3
"""Export v102 plus three runtime-compatible macro Top3 rerankers."""

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
V102_PATH = Path(__file__).with_name(
    "genre-unknown80-independent-stack-v102-export.py"
)
MACRO_PATH = Path(__file__).with_name(
    "genre-unknown80-v102-macro-reranker-screen.py"
)
DEFAULT_OUTPUT = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-independent-multiboundary-stack-v103-candidate.pkl"
)
DEFAULT_MANIFEST = TRAINING / "unknown80-independent-stack-v103-model-manifest.json"
SOURCE_HELDOUT_REPORT = TRAINING / "unknown80-v102-macro-reranker-screen.json"
PRODUCTION_REPORT = TRAINING / "unknown80-independent-stack-v103-production-regression.json"

GROUP_CONFIGS = (
    {
        "name": "roots-electric",
        "labels": ("ロック", "ファンク", "ブルース", "ジャズ", "フォーク", "ラテン"),
        "kind": "extra-trees", "view": "rhythm-base", "strength": 0.25,
        "confidenceFloor": 0.75, "candidateMassFloor": 0.0,
    },
    {
        "name": "bass-groove",
        "labels": ("レゲエ", "ダブ", "ヒップホップ", "ファンク", "ディスコ"),
        "kind": "extra-trees", "view": "librosa-base", "strength": 0.25,
        "confidenceFloor": 0.75, "candidateMassFloor": 0.0,
    },
    {
        "name": "acoustic-structural",
        "labels": ("クラシック音楽", "ジャズ", "フォーク", "アンビエント"),
        "kind": "logistic-pca64", "view": "rhythm-base", "strength": 0.25,
        "confidenceFloor": 0.75, "candidateMassFloor": 0.5,
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


def normalize_rows(values):
    values = np.asarray(values, dtype=np.float64)
    return values / np.maximum(values.sum(axis=1, keepdims=True), 1e-12)


def feature_indexes(black, view):
    if view == "rhythm-base":
        return np.asarray(black.RHYTHM_INDEXES, dtype=np.int64)
    if view == "librosa-base":
        return np.arange(black.LIBROSA_DIMENSIONS, dtype=np.int64)
    raise ValueError(f"unknown view: {view}")


def formal_view(librosa_features, scores, indexes):
    return np.concatenate([
        librosa_features[:, indexes],
        np.log(np.maximum(normalize_rows(scores), 1e-12)),
    ], axis=1)


def overlay_view(librosa_features, indexes, label_count):
    return np.concatenate([
        librosa_features[:, indexes],
        np.zeros((len(librosa_features), label_count), dtype=np.float64),
    ], axis=1)


def run(args):
    v102 = load_module(V102_PATH, "stack_v103_v102")
    v102.run(args)
    macro = load_module(MACRO_PATH, "stack_v103_macro")
    global_screen = load_module(macro.GLOBAL_PATH, "stack_v103_global")
    stack = load_module(global_screen.STACK_PATH, "stack_v103_stack")
    black = load_module(stack.BLACK_PATH, "stack_v103_black")
    electronic = load_module(stack.ELECTRONIC_PATH, "stack_v103_electronic")

    payload = np.load(args.oof)
    labels = list(payload["labels"])
    formal, available = black.align_features(
        payload["sourceKeys"], black.load_feature_cache((args.formal_librosa,))
    )
    v102_args = argparse.Namespace(
        black_manifest=args.black_manifest,
        black_librosa=args.black_cache,
        electronic_manifest=args.electronic_manifest,
        electronic_librosa=args.electronic_cache,
    )
    v102_scores, _held_sources = global_screen.build_v102(
        stack, black, electronic, v102_args, payload, formal, available
    )

    black_rows, black_features = black.load_overlay(
        args.black_manifest, args.black_cache
    )
    electronic_rows, electronic_features = black.load_overlay(
        args.electronic_manifest, args.electronic_cache
    )
    texture_rows, texture_features = black.load_overlay(
        args.texture_manifest, args.texture_cache
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

    with args.output.open("rb") as handle:
        bundle = pickle.load(handle)
    group_models = {}
    group_members = []
    training = []
    parity_inputs = []
    eligible = payload["trainingEligible"].astype(bool)
    actual = payload["actual"]
    sources = payload["sources"]
    for config_index, config in enumerate(GROUP_CONFIGS):
        group = config["labels"]
        indexes = feature_indexes(black, config["view"])
        formal_indexes = np.flatnonzero(
            eligible & available & np.isin(actual, group)
        )
        selected_overlay = np.flatnonzero(np.isin(overlay_actual, group))
        matrix = formal_view(
            formal[formal_indexes], v102_scores[formal_indexes], indexes
        )
        train_actual = actual[formal_indexes]
        train_sources = sources[formal_indexes]
        if selected_overlay.size:
            matrix = np.concatenate([
                matrix,
                overlay_view(
                    overlay_features[selected_overlay], indexes, len(labels)
                ),
            ])
            train_actual = np.concatenate([
                train_actual, overlay_actual[selected_overlay]
            ])
            train_sources = np.concatenate([
                train_sources, overlay_sources[selected_overlay]
            ])
        model = macro.fit_model(
            config["kind"], matrix, train_actual, train_sources,
            1503001 + config_index * 10000,
        )
        group_models[group] = model
        group_members.append({
            "name": config["name"],
            "labels": list(group),
            "strength": config["strength"],
            "confidenceFloor": config["confidenceFloor"],
            "candidateMassFloor": config["candidateMassFloor"],
            "featureIndexes": indexes.tolist(),
            "normalizationMode": "identity",
            "appendLogScores": True,
        })
        training.append({
            "name": config["name"], "labels": list(group),
            "kind": config["kind"], "view": config["view"],
            "formalRows": int(len(formal_indexes)),
            "trainingOnlyOverlayRows": int(len(selected_overlay)),
            "rowsByLabel": dict(Counter(train_actual)),
            "rowsBySource": dict(Counter(train_sources)),
        })
        parity_inputs.append((group, matrix[:64]))

    bundle.update({
        "modelVersion": "unknown80-independent-multiboundary-20260823-v103",
        "method": "audio-only-source-heldout-pair-plus-macro-confidence-stack",
        "combinationName": "conservative-six-pair-three-macro-stack",
        "groupMembers": group_members,
        "groupModels": group_models,
    })
    bundle["policy"]["productionModelUpdated"] = False
    with args.output.open("wb") as handle:
        pickle.dump(bundle, handle, protocol=pickle.HIGHEST_PROTOCOL)
    with args.output.open("rb") as handle:
        restored = pickle.load(handle)
    differences = []
    for group, matrix in parity_inputs:
        before = group_models[group].predict_proba(matrix)
        after = restored["groupModels"][group].predict_proba(matrix)
        differences.append(float(np.max(np.abs(before - after))))
    maximum_difference = max(differences, default=0.0)

    manifest = json.loads(args.manifest.read_text())
    manifest.update({
        "candidateModelPath": str(args.output),
        "candidateModelSha256": sha256(args.output),
        "candidateModelBytes": args.output.stat().st_size,
        "modelVersion": bundle["modelVersion"],
        "method": bundle["method"],
        "training": {
            **manifest.get("training", {}),
            "macroMembers": training,
        },
        "combination": {
            **manifest.get("combination", {}),
            "name": bundle["combinationName"],
            "macroMembers": group_members,
        },
        "serializationParity": {
            "rows": int(sum(len(matrix) for _group, matrix in parity_inputs)),
            "maximumProbabilityDifference": maximum_difference,
            "passed": maximum_difference <= 1e-12,
        },
        "promotionDecision": "pending-production-regression",
        "productionModelUpdated": False,
    })
    manifest["evaluation"].update({
        "macroSourceHeldoutReport": str(SOURCE_HELDOUT_REPORT.relative_to(ROOT)),
        "macroSourceHeldoutReportSha256": sha256(SOURCE_HELDOUT_REPORT),
        "strictTop1": 59.59,
        "strictBalancedTop1": 59.31,
        "strictMinimumSourceTop1": 31.58,
        "strictTop3": 83.48,
        "sourceHeldoutImproved": 8,
        "sourceHeldoutHarmed": 2,
        "productionRegressionReport": str(PRODUCTION_REPORT.relative_to(ROOT)),
        "productionRegressionReportSha256": (
            sha256(PRODUCTION_REPORT) if PRODUCTION_REPORT.is_file() else None
        ),
        "productionGate": (
            json.loads(PRODUCTION_REPORT.read_text()).get("promotionGate")
            if PRODUCTION_REPORT.is_file() else "pending"
        ),
    })
    if manifest["evaluation"]["productionGate"] == "passed":
        manifest["promotionDecision"] = "promote-runtime-all-gates-passed"
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return manifest


def main():
    v102 = load_module(V102_PATH, "stack_v103_defaults")
    v101 = load_module(v102.V101_PATH, "stack_v103_v101_defaults")
    v100 = v101.load_module(v101.V100_PATH, "stack_v103_v100_defaults")
    black = v100.load_module(v100.SHARED_PATH, "stack_v103_black_defaults")
    macro = load_module(MACRO_PATH, "stack_v103_macro_defaults")
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=black.DEFAULT_OOF)
    parser.add_argument("--formal-librosa", type=Path, default=black.DEFAULT_FORMAL_LIBROSA)
    parser.add_argument("--black-manifest", type=Path, default=v100.BLACK_MANIFEST)
    parser.add_argument("--black-cache", type=Path, default=v100.BLACK_CACHE)
    parser.add_argument("--electronic-manifest", type=Path, default=v100.ELECTRONIC_MANIFEST)
    parser.add_argument("--electronic-cache", type=Path, default=v100.ELECTRONIC_CACHE)
    parser.add_argument("--texture-manifest", type=Path, default=macro.DEFAULT_TEXTURE_MANIFEST)
    parser.add_argument("--texture-cache", type=Path, default=macro.DEFAULT_TEXTURE_LIBROSA)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()
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
