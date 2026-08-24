#!/usr/bin/env python3
"""Verify MusicFM v114 cache/runtime/extractor parity and promote safely."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
SCRIPT_DIR = Path(__file__).parent
SCREEN_PATH = SCRIPT_DIR / "genre-unknown80-v113-musicfm-top3-screen.py"
RUNTIME_PATH = SCRIPT_DIR / "genre_musicfm_runtime.py"
EXTRACTOR_PATH = SCRIPT_DIR / "genre-musicfm-runtime-extract.py"
DEFAULT_MODEL = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-musicfm-top3-v114-candidate.pkl"
)
DEFAULT_CACHE_10 = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "musicfm-msd-10s-pilot-cache.json"
)
DEFAULT_CACHE_30 = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "musicfm-house-boundary-30s-cache.json"
)
DEFAULT_SELECTION = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "musicfm-house-boundary-selection.json"
)
DEFAULT_REPORT = TRAINING / "unknown80-v114-musicfm-runtime-parity.json"
DEFAULT_MANIFEST = TRAINING / "unknown80-v114-musicfm-model-manifest.json"
MUSICFM_PYTHONPATH = (
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/python/mulan-runtime:"
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/python/musicfm-runtime"
)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def extract_record(audio_path):
    environment = os.environ.copy()
    environment.update({
        "PYTHONPATH": MUSICFM_PYTHONPATH,
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
    })
    completed = subprocess.run(
        ["/usr/bin/python3", str(EXTRACTOR_PATH), "--audio", str(audio_path)],
        check=True, capture_output=True, text=True, timeout=120, env=environment,
    )
    return json.loads([line for line in completed.stdout.splitlines() if line.strip()][-1])


def run(args):
    screen = load_module(SCREEN_PATH, "musicfm_v114_parity_screen")
    runtime = load_module(RUNTIME_PATH, "musicfm_v114_parity_runtime")
    residual = screen.load_module(screen.RESIDUAL_PATH, "musicfm_v114_parity_residual")
    v113 = screen.load_module(screen.V113_PATH, "musicfm_v114_parity_v113")
    black, payload, base, _held_sources, baseline = screen.reconstruct_v113(residual, v113)
    labels = list(payload["labels"])
    bundle = runtime.load_bundle(args.model)
    cache = json.loads(args.cache_30.read_text())
    source_indexes = {str(key): index for index, key in enumerate(payload["sourceKeys"])}
    output = np.asarray(base, dtype=np.float64).copy()
    rows = applied = 0
    for source_key, record in cache.items():
        index = source_indexes.get(source_key)
        if index is None:
            continue
        output[index], details = runtime.rerank(
            bundle, labels, output[index], record,
        )
        rows += 1
        applied += int(details["applied"])
    diagnostic = black.compare_output(
        output, base, payload["actual"], labels, payload["sources"],
    )

    selection = json.loads(args.selection.read_text())
    sample = next(
        item for item in selection["items"]
        if item["sourceKey"] in cache and Path(item["filePath"]).is_file()
    )
    extraction_started = time.perf_counter()
    extracted = extract_record(sample["filePath"])
    extraction_seconds = time.perf_counter() - extraction_started
    expected_features = runtime.features_from_record(cache[sample["sourceKey"]])
    actual_features = runtime.features_from_record(extracted["record"])
    feature_delta = float(np.max(np.abs(expected_features - actual_features)))
    left = bundle["pipeline"].predict_proba(expected_features.reshape(1, -1))
    right = bundle["pipeline"].predict_proba(actual_features.reshape(1, -1))
    probability_delta = float(np.max(np.abs(left - right)))
    model_sha = sha256_file(args.model)
    manifest = json.loads(args.manifest.read_text())
    gates = {
        "modelShaMatches": model_sha == manifest.get("modelSha256"),
        "sourceHeldoutImproves": float(manifest["sourceHeldout"]["top1Accuracy"]) > float(baseline["top1Accuracy"]),
        "sourceHeldoutHarmedZero": int(manifest["sourceHeldout"]["harmed"]) == 0,
        "cachedRuntimeHarmedZero": int(diagnostic["harmed"]) == 0,
        "featureParity": feature_delta <= 1e-3,
        "probabilityParity": probability_delta <= 1e-8,
        "contractParity": extracted.get("runtimeFeatureContractSha256") == bundle.get("runtimeFeatureContractSha256"),
    }
    passed = all(gates.values())
    if args.promote and passed:
        manifest["promotionState"] = "promoted"
        manifest["promotedAt"] = datetime.now(timezone.utc).isoformat()
        manifest["runtimeParityReport"] = str(args.report)
        args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    elif passed:
        manifest["promotionState"] = "candidate-latency-gate-pending"
        manifest["runtimeParityReport"] = str(args.report)
        args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "objective": "Verify v114 runtime helper, live extraction, and promotion gates.",
        "policy": {
            "metadataUsedAtInference": False,
            "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "cachedFinalFitIsNotUnknownSourceAccuracy": True,
        },
        "baseline": baseline,
        "sourceHeldout": manifest["sourceHeldout"],
        "cachedRows": rows,
        "cachedRuntimeAppliedRows": applied,
        "cachedRuntimeDiagnostic": diagnostic,
        "liveExtractionSample": {
            "sourceKey": sample["sourceKey"],
            "maxAbsoluteFeatureDelta": feature_delta,
            "maxAbsoluteProbabilityDelta": probability_delta,
            "extractionSeconds": round(extraction_seconds, 3),
        },
        "modelSha256": model_sha,
        "gates": gates,
        "passes": passed,
        "promotionRequested": args.promote,
        "promotionState": "promoted" if args.promote and passed else manifest.get("promotionState"),
        "decision": "measure-production-latency" if passed else "reject-v114-runtime",
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--cache-10", type=Path, default=DEFAULT_CACHE_10)
    parser.add_argument("--cache-30", type=Path, default=DEFAULT_CACHE_30)
    parser.add_argument("--selection", type=Path, default=DEFAULT_SELECTION)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--promote", action="store_true")
    args = parser.parse_args()
    report = run(args)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
