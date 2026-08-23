#!/usr/bin/env python3
"""Export v104 plus the source-heldout Funk/Rock post-reranker."""

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
SOURCE_SCRIPT = Path(__file__).with_name(
    "genre-unknown80-independent-stack-v105-source-heldout.py"
)
V104_MODEL = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-independent-multiboundary-stack-v104-candidate.pkl"
)
DEFAULT_OUTPUT = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-independent-multiboundary-stack-v105-candidate.pkl"
)
DEFAULT_MANIFEST = TRAINING / "unknown80-independent-stack-v105-model-manifest.json"
SOURCE_REPORT = TRAINING / "unknown80-independent-stack-v105-source-heldout.json"
PRODUCTION_REPORT = TRAINING / "unknown80-independent-stack-v105-production-regression.json"


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
    source = load_module(SOURCE_SCRIPT, "stack_v105_source")
    helper = load_module(source.V103_HELPER_PATH, "stack_v105_export_helper")
    macro = load_module(helper.MACRO_PATH, "stack_v105_export_macro")
    global_screen = load_module(macro.GLOBAL_PATH, "stack_v105_export_global")
    stack = load_module(global_screen.STACK_PATH, "stack_v105_export_stack")
    black = load_module(stack.BLACK_PATH, "stack_v105_export_black")
    electronic = load_module(stack.ELECTRONIC_PATH, "stack_v105_export_electronic")
    payload = np.load(args.oof)
    labels = list(payload["labels"])
    actual = payload["actual"]
    sources = payload["sources"]
    eligible = payload["trainingEligible"].astype(bool)
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
    v103, _held_sources, _metric, _conflicts = helper.build_v103(
        helper_args, macro, global_screen, stack, black, electronic, payload,
    )
    pair, kind, view, strength, confidence_floor, seed = source.FUNK_ROCK_CONFIG
    formal_indexes = np.flatnonzero(eligible & available & np.isin(actual, pair))
    matrix = global_screen.view_matrix(
        view, payload["positions"], formal, v103, black.RHYTHM_INDEXES,
    )[formal_indexes]
    train_actual = actual[formal_indexes]
    train_sources = sources[formal_indexes]
    overlay_rows, overlay_features = black.load_overlay(
        args.black_manifest, args.black_cache,
    )
    overlay_actual = np.asarray([row["genre"] for row in overlay_rows], dtype=object)
    overlay_sources = np.asarray([row["source"] for row in overlay_rows], dtype=object)
    overlay_indexes = np.flatnonzero(np.isin(overlay_actual, pair))
    overlay_matrix = global_screen.view_matrix(
        view,
        np.zeros((len(overlay_features), payload["positions"].shape[1]), dtype=np.float32),
        overlay_features,
        np.ones((len(overlay_features), len(labels)), dtype=np.float64),
        black.RHYTHM_INDEXES,
    )
    overlay_matrix[:, formal.shape[1]:] = 0.0
    if overlay_indexes.size:
        matrix = np.concatenate([matrix, overlay_matrix[overlay_indexes]])
        train_actual = np.concatenate([train_actual, overlay_actual[overlay_indexes]])
        train_sources = np.concatenate([train_sources, overlay_sources[overlay_indexes]])
    model = macro.fit_model(kind, matrix, train_actual, train_sources, seed)
    member = {
        "labels": list(pair), "strength": strength,
        "confidenceFloor": confidence_floor, "candidateMassFloor": 0.0,
        "featureIndexes": np.arange(black.LIBROSA_DIMENSIONS, dtype=np.int64).tolist(),
        "normalizationMode": "identity", "appendLogScores": True,
    }
    with args.v104_model.open("rb") as handle:
        bundle = pickle.load(handle)
    post_members = list(bundle.get("postGroupMembers") or [])
    post_members = [row for row in post_members if tuple(row.get("labels") or []) != pair]
    post_members.append(member)
    post_models = dict(bundle.get("postGroupModels") or {})
    post_models[pair] = model
    production_gate = (
        json.loads(PRODUCTION_REPORT.read_text()).get("promotionGate")
        if PRODUCTION_REPORT.is_file() else "pending"
    )
    bundle.update({
        "modelVersion": "unknown80-independent-multiboundary-20260823-v105",
        "method": "audio-only-source-heldout-pair-macro-post-boundary-stack",
        "combinationName": "conservative-v104-plus-funk-rock-post-boundary",
        "postGroupMembers": post_members,
        "postGroupModels": post_models,
    })
    bundle["policy"]["productionModelUpdated"] = production_gate == "passed"
    with args.output.open("wb") as handle:
        pickle.dump(bundle, handle, protocol=pickle.HIGHEST_PROTOCOL)
    with args.output.open("rb") as handle:
        restored = pickle.load(handle)
    maximum_difference = float(np.max(np.abs(
        model.predict_proba(matrix[:64])
        - restored["postGroupModels"][pair].predict_proba(matrix[:64])
    )))
    source_report = json.loads(SOURCE_REPORT.read_text())
    manifest = {
        "objective": "Promote the strict Funk/Rock residual boundary over v104.",
        "candidateModelPath": str(args.output),
        "candidateModelSha256": sha256(args.output),
        "candidateModelBytes": args.output.stat().st_size,
        "modelVersion": bundle["modelVersion"],
        "method": bundle["method"],
        "policy": bundle["policy"],
        "training": {
            "labels": list(pair), "kind": kind, "view": view,
            "formalRows": int(len(formal_indexes)),
            "trainingOnlyOverlayRows": int(len(overlay_indexes)),
            "rowsByLabel": dict(Counter(train_actual)),
            "rowsBySource": dict(Counter(train_sources)),
        },
        "combination": {
            "name": bundle["combinationName"],
            "postGroupMembers": post_members,
            "conflictPolicy": "multiple-proposals-left-at-pre-post-baseline",
        },
        "evaluation": {
            "sourceHeldoutReport": str(SOURCE_REPORT.relative_to(ROOT)),
            "sourceHeldoutReportSha256": sha256(SOURCE_REPORT),
            "strictBaseline": source_report["baseline"],
            "strictCandidate": source_report["candidate"],
            "productionRegressionReport": str(PRODUCTION_REPORT.relative_to(ROOT)),
            "productionRegressionReportSha256": (
                sha256(PRODUCTION_REPORT) if PRODUCTION_REPORT.is_file() else None
            ),
            "productionGate": production_gate,
        },
        "serializationParity": {
            "rows": int(min(64, len(matrix))),
            "maximumProbabilityDifference": maximum_difference,
            "passed": maximum_difference <= 1e-12,
        },
        "promotionDecision": (
            "promote-runtime-all-gates-passed"
            if production_gate == "passed" else "pending-production-regression"
        ),
        "productionModelUpdated": production_gate == "passed",
    }
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return manifest


def main():
    source = load_module(SOURCE_SCRIPT, "stack_v105_export_defaults")
    helper = load_module(source.V103_HELPER_PATH, "stack_v105_helper_defaults")
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
    parser.add_argument("--v104-model", type=Path, default=V104_MODEL)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()
    manifest = run(args)
    print(json.dumps({
        "candidateModelPath": manifest["candidateModelPath"],
        "candidateModelSha256": manifest["candidateModelSha256"],
        "serializationParity": manifest["serializationParity"],
        "promotionDecision": manifest["promotionDecision"],
    }, ensure_ascii=False, indent=2))
    raise SystemExit(0 if manifest["serializationParity"]["passed"] else 1)


if __name__ == "__main__":
    main()
