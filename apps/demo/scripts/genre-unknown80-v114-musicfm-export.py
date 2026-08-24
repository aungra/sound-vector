#!/usr/bin/env python3
"""Export the source-heldout MusicFM Top3 candidate for runtime parity."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import pickle
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
SCRIPT_DIR = Path(__file__).parent
SCREEN_PATH = SCRIPT_DIR / "genre-unknown80-v113-musicfm-top3-screen.py"
RUNTIME_PATH = SCRIPT_DIR / "genre_musicfm_runtime.py"
DEFAULT_CACHE_10 = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "musicfm-msd-10s-pilot-cache.json"
)
DEFAULT_CACHE_30 = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "musicfm-house-boundary-30s-cache.json"
)
DEFAULT_MODEL = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-musicfm-top3-v114-candidate.pkl"
)
DEFAULT_REPORT = TRAINING / "unknown80-v114-musicfm-export.json"
DEFAULT_MANIFEST = TRAINING / "unknown80-v114-musicfm-model-manifest.json"
VIEW = "30s-joint-mean"
MODEL_KIND = "extra-trees"
CONFIG = {"weight": 0.5, "confidenceFloor": 0.8, "marginFloor": 0.0}
SEED = 15321001
EXPECTED = (60.7, 60.3, 31.58, 83.48, 3, 0)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(args):
    screen = load_module(SCREEN_PATH, "musicfm_v114_screen")
    runtime = load_module(RUNTIME_PATH, "musicfm_v114_runtime")
    residual = screen.load_module(screen.RESIDUAL_PATH, "musicfm_v114_residual")
    v113 = screen.load_module(screen.V113_PATH, "musicfm_v114_v113")
    black, payload, base, held_sources, baseline = screen.reconstruct_v113(residual, v113)
    labels = list(payload["labels"])
    items = screen.load_items(args, payload)[VIEW]
    candidate = screen.screen_view(
        items, VIEW, MODEL_KIND, labels, held_sources, base, baseline,
        black, payload, SEED,
    )
    metric = candidate["best"]["metric"]
    observed = (
        metric["top1Accuracy"], metric["balancedTop1"],
        metric["minimumSourceTop1"], metric["top3Accuracy"],
        metric["improved"], metric["harmed"],
    )
    if observed != EXPECTED:
        raise RuntimeError(f"v114 screen mismatch: {observed} != {EXPECTED}")

    support = {
        label: sorted({item["source"] for item in items if item["actual"] == label})
        for label in labels
    }
    eligible = sorted(label for label, sources in support.items() if len(sources) >= 2)
    training = [item for item in items if item["trainingEligible"]]
    model = screen.fit_model(training, MODEL_KIND, SEED + 9000)
    bundle = {
        "version": runtime.VERSION,
        "schemaVersion": runtime.SCHEMA_VERSION,
        "labels": labels,
        "eligibleLabels": eligible,
        "view": VIEW,
        "config": CONFIG,
        "pipeline": model,
        "sourceSupport": {label: support[label] for label in eligible},
        "runtimeFeatureContract": runtime.feature_contract(),
        "runtimeFeatureContractSha256": runtime.feature_contract_digest(),
        "metadataUsedAtInference": False,
        "urlSpecificRulesUsed": False,
    }
    args.model.parent.mkdir(parents=True, exist_ok=True)
    with args.model.open("wb") as handle:
        pickle.dump(bundle, handle)
    restored = runtime.load_bundle(args.model)
    sample = np.asarray([item["features"] for item in training[:32]])
    left = model.predict_proba(sample)
    right = restored["pipeline"].predict_proba(sample)
    delta = float(np.max(np.abs(left - right))) if len(sample) else 0.0
    parity = {
        "rows": len(sample), "maxAbsoluteProbabilityDelta": delta,
        "tolerance": 1e-8, "passes": delta <= 1e-8,
    }
    if not parity["passes"]:
        raise RuntimeError("v114 serialization parity failed")

    generated_at = datetime.now(timezone.utc).isoformat()
    model_sha = sha256_file(args.model)
    report = {
        "generatedAt": generated_at,
        "objective": "Export source-heldout MusicFM Top3 v114 runtime candidate.",
        "policy": {
            "metadataUsedAtInference": False,
            "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "matchingProviderExcludedFromOuterFold": True,
            "top3CandidateSetChanged": False,
            "productionModelUpdated": False,
            "finalFitDiagnosticIsNotUnknownSourceAccuracy": True,
        },
        "baseline": baseline,
        "sourceHeldout": metric,
        "sourceHeldoutChangedRows": candidate["best"]["changedRows"],
        "trainingRows": len(training),
        "eligibleLabels": eligible,
        "sourceSupport": bundle["sourceSupport"],
        "serializationParity": parity,
        "runtimeFeatureContract": runtime.feature_contract(),
        "runtimeFeatureContractSha256": runtime.feature_contract_digest(),
        "modelPath": str(args.model),
        "modelSha256": model_sha,
        "decision": "continue-v114-runtime-feature-parity",
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    manifest = {
        "version": runtime.VERSION,
        "schemaVersion": runtime.SCHEMA_VERSION,
        "generatedAt": generated_at,
        "modelPath": str(args.model),
        "modelSha256": model_sha,
        "runtimeFeatureContractSha256": runtime.feature_contract_digest(),
        "sourceHeldout": metric,
        "promotionState": "candidate-runtime-feature-parity-pending",
    }
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache-10", type=Path, default=DEFAULT_CACHE_10)
    parser.add_argument("--cache-30", type=Path, default=DEFAULT_CACHE_30)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()
    report = run(args)
    print(json.dumps({
        "sourceHeldout": report["sourceHeldout"],
        "serializationParity": report["serializationParity"],
        "modelPath": report["modelPath"],
        "modelSha256": report["modelSha256"],
        "decision": report["decision"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
