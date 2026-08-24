#!/usr/bin/env python3
"""Promote v108 only after every reproducible evaluation gate passes."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
DEFAULT_EXPORT = TRAINING / "unknown80-v108-track-pair-export.json"
DEFAULT_PARITY = TRAINING / "unknown80-v108-runtime-parity.json"
DEFAULT_PRODUCTION = TRAINING / "unknown80-independent-stack-v107-production-regression.json"
DEFAULT_MANIFEST = TRAINING / "unknown80-v108-track-pair-model-manifest.json"


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def gate_failures(export, parity, production, manifest):
    candidate = export.get("candidate") or {}
    baseline = export.get("baseline") or {}
    final_fit = parity.get("finalFitDiagnostic") or {}
    failures = []
    checks = [
        (export.get("decision") == "continue-runtime-parity-gate", "export gate did not pass"),
        (candidate.get("top1Accuracy", 0) > baseline.get("top1Accuracy", 0), "Top1 did not improve"),
        (candidate.get("balancedTop1", 0) >= baseline.get("balancedTop1", 0), "balanced Top1 regressed"),
        (candidate.get("minimumSourceTop1", 0) >= baseline.get("minimumSourceTop1", 0), "minimum source regressed"),
        (candidate.get("top3Accuracy", 0) >= baseline.get("top3Accuracy", 0), "Top3 regressed"),
        (candidate.get("improved", 0) > 0 and candidate.get("harmed", 0) == 0, "source-heldout changes were not zero-harm"),
        (parity.get("decision") == "continue-production-regression-gate", "runtime parity gate did not pass"),
        (parity.get("featureParityPasses") is True, "training/runtime features differ"),
        (final_fit.get("harmed", 0) == 0, "final-fit diagnostic harmed rows"),
        (production.get("promotionGate") == "passed", "incumbent production regression gate is not passed"),
        (manifest.get("promotionState") == "candidate-runtime-parity-pending", "manifest is not a pending candidate"),
        (bool(manifest.get("modelPath") and manifest.get("modelSha256")), "candidate model identity is missing"),
        (len(manifest.get("pairs") or []) > 0, "candidate has no pair models"),
        (all(
            len(sources) >= 2
            for pair in manifest.get("pairs") or []
            for sources in (pair.get("sourceSupport") or {}).values()
        ), "a pair label has fewer than two independent sources"),
    ]
    for passed, reason in checks:
        if not passed:
            failures.append(reason)
    return failures


def run(args):
    export = json.loads(args.export_report.read_text())
    parity = json.loads(args.parity_report.read_text())
    production = json.loads(args.production_report.read_text())
    manifest = json.loads(args.manifest.read_text())
    failures = gate_failures(export, parity, production, manifest)
    model_path = Path(str(manifest.get("modelPath") or ""))
    if not failures:
        if not model_path.is_file():
            failures.append("candidate model file is missing")
        elif sha256_file(model_path) != manifest.get("modelSha256"):
            failures.append("candidate model SHA-256 differs from manifest")
    if failures:
        raise RuntimeError("track-pair promotion rejected: " + "; ".join(failures))
    manifest.update({
        "promotionState": "promoted",
        "promotedAt": datetime.now(timezone.utc).isoformat(),
        "productionModelUpdated": True,
        "sealedFinalHoldoutUsed": False,
        "evaluation": {
            "sourceHeldoutReport": str(args.export_report.resolve().relative_to(ROOT)),
            "sourceHeldoutReportSha256": sha256_file(args.export_report),
            "runtimeParityReport": str(args.parity_report.resolve().relative_to(ROOT)),
            "runtimeParityReportSha256": sha256_file(args.parity_report),
            "incumbentProductionRegressionReport": str(args.production_report.resolve().relative_to(ROOT)),
            "incumbentProductionRegressionReportSha256": sha256_file(args.production_report),
        },
    })
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--export-report", type=Path, default=DEFAULT_EXPORT)
    parser.add_argument("--parity-report", type=Path, default=DEFAULT_PARITY)
    parser.add_argument("--production-report", type=Path, default=DEFAULT_PRODUCTION)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()
    manifest = run(args)
    print(json.dumps({
        "promotionState": manifest["promotionState"],
        "modelPath": manifest["modelPath"],
        "modelSha256": manifest["modelSha256"],
        "pairs": manifest["pairs"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
