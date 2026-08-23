#!/usr/bin/env python3
"""Export v105 plus the strict Drone/Noise post-reranker."""

from __future__ import annotations

import argparse
import hashlib
import json
import pickle
from collections import Counter
from pathlib import Path

import numpy as np


from importlib.util import module_from_spec, spec_from_file_location


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
SOURCE_PATH = Path(__file__).with_name(
    "genre-unknown80-independent-stack-v106-source-heldout.py"
)
V105_MODEL = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-independent-multiboundary-stack-v105-candidate.pkl"
)
DEFAULT_OUTPUT = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-independent-multiboundary-stack-v106-candidate.pkl"
)
DEFAULT_MANIFEST = TRAINING / "unknown80-independent-stack-v106-model-manifest.json"
SOURCE_REPORT = TRAINING / "unknown80-independent-stack-v106-source-heldout.json"
PRODUCTION_REPORT = TRAINING / "unknown80-independent-stack-v106-production-regression.json"


def load_module(path, name):
    spec = spec_from_file_location(name, path)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(args):
    source = load_module(SOURCE_PATH, "stack_v106_export_source")
    v105, helper, macro, global_screen, stack, black, electronic, _residual = (
        source.runtime_modules("stack_v106_export")
    )
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
    pair, kind, view, strength, confidence_floor, seed = source.DRONE_NOISE_CONFIG
    formal_indexes = np.flatnonzero(eligible & available & np.isin(actual, pair))
    matrix = global_screen.view_matrix(
        view, payload["positions"], formal, v103, black.RHYTHM_INDEXES,
    )[formal_indexes]
    train_actual = actual[formal_indexes]
    train_sources = sources[formal_indexes]
    overlay_rows, overlay_features = source.merge_overlay(black, (
        (args.texture_manifest, args.texture_cache),
        (args.noise_manifest, args.noise_cache),
    ))
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
    overlay_matrix[:, len(black.RHYTHM_INDEXES):] = 0.0
    if overlay_indexes.size:
        matrix = np.concatenate([matrix, overlay_matrix[overlay_indexes]])
        train_actual = np.concatenate([train_actual, overlay_actual[overlay_indexes]])
        train_sources = np.concatenate([train_sources, overlay_sources[overlay_indexes]])
    model = macro.fit_model(kind, matrix, train_actual, train_sources, seed)
    member = {
        "labels": list(pair), "strength": strength,
        "confidenceFloor": confidence_floor, "candidateMassFloor": 0.0,
        "featureIndexes": np.asarray(black.RHYTHM_INDEXES, dtype=np.int64).tolist(),
        "normalizationMode": "identity", "appendLogScores": True,
    }
    with args.v105_model.open("rb") as handle:
        bundle = pickle.load(handle)
    post_members = [
        row for row in list(bundle.get("postGroupMembers") or [])
        if tuple(row.get("labels") or []) != pair
    ]
    post_members.append(member)
    post_models = dict(bundle.get("postGroupModels") or {})
    post_models[pair] = model
    production_gate = (
        json.loads(PRODUCTION_REPORT.read_text()).get("promotionGate")
        if PRODUCTION_REPORT.is_file() else "pending"
    )
    bundle.update({
        "modelVersion": "unknown80-independent-multiboundary-20260823-v106",
        "method": "audio-only-source-heldout-pair-macro-post-boundary-stack",
        "combinationName": "conservative-v105-plus-drone-noise-post-boundary",
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
        "objective": "Promote the strict Drone/Noise residual boundary over v105.",
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
    source = load_module(SOURCE_PATH, "stack_v106_export_defaults")
    parser, v105 = source.parser_defaults()
    parser.add_argument("--v105-model", type=Path, default=V105_MODEL)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.set_defaults(report=None, markdown=None)
    args = parser.parse_args()
    args.deep_manifest = args.deep_manifest or list(v105.DEFAULT_DEEP_MANIFESTS)
    args.deep_cache = args.deep_cache or list(v105.DEFAULT_DEEP_CACHES)
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
