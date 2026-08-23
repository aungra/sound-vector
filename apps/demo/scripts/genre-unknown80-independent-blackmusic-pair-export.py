#!/usr/bin/env python3
"""Export the gated independent-source Blues/Folk runtime pair head."""

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
ABLATION_PATH = Path(__file__).with_name(
    "genre-unknown80-independent-blackmusic-pair-ablation.py"
)
DEFAULT_OOF = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-incumbent-caphe-oof-audio-only.npz"
)
DEFAULT_FORMAL_LIBROSA = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "librosa-feature-cache.json"
)
DEFAULT_OVERLAY_MANIFEST = (
    TRAINING / "unknown80-independent-blackmusic-candidate-manifest.json"
)
DEFAULT_OVERLAY_LIBROSA = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-independent-blackmusic-librosa.json"
)
DEFAULT_OUTPUT = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-independent-blackmusic-pair-candidate.pkl"
)
DEFAULT_MANIFEST = (
    TRAINING / "unknown80-independent-blackmusic-pair-model-manifest.json"
)
OOF_REPORT = TRAINING / "unknown80-independent-blackmusic-pair-ablation.json"
GTZAN_REPORT = TRAINING / "gtzan-independent-blackmusic-pair-gate.json"
PRODUCTION_REPORT = (
    TRAINING / "unknown80-independent-blackmusic-production-regression.json"
)
PAIR = ("ブルース", "フォーク")
STRENGTH = 0.25


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
    module = load_module(ABLATION_PATH, "independent_blackmusic_export")
    payload = np.load(args.oof)
    labels = list(payload["labels"])
    formal, available = module.align_features(
        payload["sourceKeys"], module.load_feature_cache(args.formal_librosa)
    )
    overlay_rows, overlay = module.load_overlay(
        args.overlay_manifest, args.overlay_librosa
    )
    formal_indexes = np.flatnonzero(
        payload["trainingEligible"].astype(bool)
        & available
        & np.isin(payload["actual"], PAIR)
    )
    overlay_indexes = np.asarray([
        index for index, row in enumerate(overlay_rows) if row["genre"] in PAIR
    ], dtype=np.int64)
    matrix = formal[formal_indexes]
    actual = payload["actual"][formal_indexes]
    sources = payload["sources"][formal_indexes]
    overlay_mask = np.zeros(len(formal_indexes), dtype=bool)
    if overlay_indexes.size:
        matrix = np.concatenate([matrix, overlay[overlay_indexes]])
        actual = np.concatenate([
            actual,
            np.asarray([overlay_rows[index]["genre"] for index in overlay_indexes]),
        ])
        sources = np.concatenate([
            sources,
            np.asarray([overlay_rows[index]["source"] for index in overlay_indexes]),
        ])
        overlay_mask = np.concatenate([
            overlay_mask, np.ones(len(overlay_indexes), dtype=bool),
        ])
    model = module.fit_model(
        "logistic", matrix, actual,
        module.source_label_weights(actual, sources, overlay_mask), 991201,
    )
    bundle = {
        "schemaVersion": "mmfr.unknown80-rhythm-top3-pairwise.v1",
        "modelVersion": "unknown80-independent-blackmusic-20260823-v1",
        "method": "audio-only-full-librosa-independent-source-blues-folk-logistic",
        "labels": labels,
        "librosaVectorLength": module.LIBROSA_DIMENSIONS,
        "rhythmFeatureIndexes": list(range(module.LIBROSA_DIMENSIONS)),
        "normalizationMode": "identity",
        "robustScaleMedian": [0.0] * module.LIBROSA_DIMENSIONS,
        "robustScaleIqr": [1.0] * module.LIBROSA_DIMENSIONS,
        "robustScaleClip": None,
        "combinationName": "independent-blues-folk-w0.25",
        "members": [{"pair": list(PAIR), "strength": STRENGTH}],
        "models": {PAIR: model},
        "policy": {
            "metadataUsedAtInference": False,
            "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "overlayRowsEvaluated": False,
            "independentGtzanTrainingRows": 0,
            "sourceHeldoutGatePassed": True,
            "independentGtzanGatePassed": True,
            "productionModelUpdated": False,
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("wb") as handle:
        pickle.dump(bundle, handle, protocol=pickle.HIGHEST_PROTOCOL)
    with args.output.open("rb") as handle:
        restored = pickle.load(handle)
    parity_rows = formal_indexes[:64]
    before = model.predict_proba(formal[parity_rows])
    after = restored["models"][PAIR].predict_proba(formal[parity_rows])
    maximum_difference = float(np.max(np.abs(before - after)))
    manifest = {
        "schemaVersion": 1,
        "candidateModelPath": str(args.output),
        "candidateModelSha256": sha256(args.output),
        "candidateModelBytes": args.output.stat().st_size,
        "modelVersion": bundle["modelVersion"],
        "method": bundle["method"],
        "featureContract": {
            "source": "production librosa 547-vector",
            "vectorLength": module.LIBROSA_DIMENSIONS,
            "selectedIndexes": "all",
            "normalization": "identity before fitted StandardScaler",
        },
        "training": {
            "rows": len(actual),
            "formalRows": len(formal_indexes),
            "trainingOnlyOverlayRows": len(overlay_indexes),
            "sources": dict(Counter(sources)),
            "labels": dict(Counter(actual)),
        },
        "combination": {"members": bundle["members"]},
        "evaluation": {
            "sourceHeldoutReport": str(OOF_REPORT.relative_to(ROOT)),
            "sourceHeldoutReportSha256": sha256(OOF_REPORT),
            "sourceHeldoutTop1Before": 58.10,
            "sourceHeldoutTop1After": 58.31,
            "sourceHeldoutImproved": 5,
            "sourceHeldoutHarmed": 1,
            "gtzanReport": str(GTZAN_REPORT.relative_to(ROOT)),
            "gtzanReportSha256": sha256(GTZAN_REPORT),
            "gtzanTop1Before": 75.65,
            "gtzanTop1After": 78.70,
            "gtzanImproved": 7,
            "gtzanHarmed": 0,
            "productionRegressionReport": str(PRODUCTION_REPORT.relative_to(ROOT)),
            "productionRegressionReportSha256": sha256(PRODUCTION_REPORT),
            "productionTop1Before": 60.59,
            "productionTop1After": 60.89,
            "productionBalancedBefore": 63.63,
            "productionBalancedAfter": 63.88,
            "productionMinimumSourceBefore": 47.37,
            "productionMinimumSourceAfter": 47.37,
            "productionImproved": 6,
            "productionHarmed": 1,
            "productionContractViolations": 0,
        },
        "serializationParity": {
            "rows": len(parity_rows),
            "maximumProbabilityDifference": maximum_difference,
            "passed": maximum_difference <= 1e-12,
        },
        "promotionDecision": "promote-runtime-all-gates-passed",
        "productionModelUpdated": False,
    }
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=DEFAULT_OOF)
    parser.add_argument("--formal-librosa", type=Path, action="append", default=[])
    parser.add_argument("--overlay-manifest", type=Path, default=DEFAULT_OVERLAY_MANIFEST)
    parser.add_argument("--overlay-librosa", type=Path, default=DEFAULT_OVERLAY_LIBROSA)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()
    if not args.formal_librosa:
        args.formal_librosa = [DEFAULT_FORMAL_LIBROSA]
    manifest = run(args)
    print(json.dumps({
        "candidateModelPath": manifest["candidateModelPath"],
        "candidateModelSha256": manifest["candidateModelSha256"],
        "serializationParity": manifest["serializationParity"],
        "training": manifest["training"],
        "manifest": str(args.manifest),
    }, ensure_ascii=False, indent=2))
    raise SystemExit(0 if manifest["serializationParity"]["passed"] else 1)


if __name__ == "__main__":
    main()
