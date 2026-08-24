#!/usr/bin/env python3
"""Export the safe v112 Top3 Drone/Noise residual stage."""

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
RESIDUAL_PATH = SCRIPT_DIR / "genre-unknown80-v112-residual-top3-screen.py"
DEFAULT_V112_MODEL = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-track-pair-v112-candidate.pkl"
)
DEFAULT_MODEL = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-track-pair-v113-candidate.pkl"
)
DEFAULT_REPORT = TRAINING / "unknown80-v113-drone-noise-export.json"
DEFAULT_MANIFEST = TRAINING / "unknown80-v113-track-pair-model-manifest.json"
PAIR = ("ドローン", "ノイズミュージック")
VIEW = "rhythm"
MODEL_KIND = "logistic"
CONFIG = {"weight": 0.25, "confidenceFloor": 0.5, "routeTopK": 3}
OUTER_SEED = 15201001
FINAL_SEED = 15210001


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


def load_modules(residual):
    return (
        load_module(residual.V112_PATH, "v113_v112_export"),
        load_module(residual.SCREEN_PATH, "v113_v112_screen"),
        load_module(residual.OLD_EXPORT_PATH, "v113_old_export"),
        load_module(residual.PAIR_PATH, "v113_pair"),
        load_module(residual.SHARED_PATH, "v113_shared"),
        load_module(residual.V110_PATH, "v113_v110"),
        load_module(residual.V111_PATH, "v113_v111"),
    )


def apply_records(base, records, labels, pair_module):
    output = np.asarray(base, dtype=np.float64).copy()
    if not records:
        return output, np.zeros(0, dtype=bool)
    indexes = np.asarray([record["item"]["index"] for record in records], dtype=np.int64)
    learned = np.asarray([record["probabilities"] for record in records])
    candidate, changed = pair_module.apply_pair(
        output[indexes], learned, PAIR, labels, CONFIG,
    )
    output[indexes] = candidate
    return output, changed


def run(args):
    residual = load_module(RESIDUAL_PATH, "v113_residual")
    modules = load_modules(residual)
    _v112, _screen, old_export, pair_module, shared, _v110, _v111 = modules
    black, payload, v112, held_sources, baseline = residual.reconstruct_v112(modules)
    labels = list(payload["labels"])
    items = shared.load_cached_items(
        argparse.Namespace(cache=args.cache, view=VIEW), payload, labels,
    )
    for item in items:
        item["evaluationEligible"] = True
        item["baseScores"] = np.asarray(v112[item["index"]], dtype=np.float64)
        order = np.argsort(-item["baseScores"], kind="stable")[:3]
        item["top3Labels"] = tuple(labels[int(index)] for index in order)
    residual.append_overlay(
        items, residual.ELECTRONIC_OVERLAY, VIEW, old_export, shared,
    )
    residual.append_overlay(
        items, residual.BLACK_OVERLAY, VIEW, old_export, shared,
    )
    residual.append_overlay(
        items, residual.TEXTURE_OVERLAY, VIEW, old_export, shared,
    )
    items = residual.deduplicate(items)
    records = []
    folds = []
    for fold_index, held_source in enumerate(held_sources):
        training = [
            item for item in items
            if item["source"] != held_source and item["trainingEligible"]
        ]
        validation = residual.routed([
            item for item in items
            if item.get("evaluationEligible") and item["source"] == held_source
        ], PAIR)
        model = residual.fit_pair(
            training, PAIR, MODEL_KIND, OUTER_SEED + fold_index * 100, pair_module,
        )
        if model is None or not validation:
            continue
        learned = residual.probabilities(model, validation, PAIR)
        records.extend(
            {"item": item, "probabilities": score}
            for item, score in zip(validation, learned)
        )
        folds.append({
            "heldOutSource": str(held_source),
            "trainingRows": sum(item["actual"] in PAIR for item in training),
            "routedRows": len(validation),
        })
    source_output, changed = apply_records(v112, records, labels, pair_module)
    source_metric = black.compare_output(
        source_output, v112, payload["actual"], labels, payload["sources"],
    )
    training = [item for item in items if item["trainingEligible"]]
    final_model = residual.fit_pair(training, PAIR, MODEL_KIND, FINAL_SEED, pair_module)
    routed = residual.routed(
        [item for item in items if item.get("evaluationEligible")], PAIR,
    )
    learned = residual.probabilities(final_model, routed, PAIR)
    final_records = [
        {"item": item, "probabilities": score}
        for item, score in zip(routed, learned)
    ]
    final_output, final_changed = apply_records(v112, final_records, labels, pair_module)
    final_metric = black.compare_output(
        final_output, v112, payload["actual"], labels, payload["sources"],
    )
    source_support = {
        label: sorted({item["source"] for item in training if item["actual"] == label})
        for label in PAIR
    }
    top3_preserved = all(
        set(left) == set(right) for left, right in zip(
            np.argsort(-v112, axis=1)[:, :3],
            np.argsort(-source_output, axis=1)[:, :3],
        )
    )
    passed = (
        source_metric["top1Accuracy"] > baseline["top1Accuracy"]
        and source_metric["balancedTop1"] >= baseline["balancedTop1"]
        and source_metric["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and source_metric["top3Accuracy"] >= baseline["top3Accuracy"]
        and source_metric["improved"] > 0 and source_metric["harmed"] == 0
        and final_metric["improved"] > 0 and final_metric["harmed"] == 0
        and all(len(sources) >= 2 for sources in source_support.values())
        and top3_preserved and final_model is not None
    )
    model_sha = None
    parity = None
    manifest_pairs = []
    if passed:
        with args.v112_model.open("rb") as handle:
            bundle = pickle.load(handle)
        bundle = {
            **bundle, "version": "unknown80-track-pair-v113-candidate",
            "pairs": [*bundle["pairs"], {
                "labels": list(PAIR), "view": VIEW, "config": CONFIG,
                "pipeline": final_model, "sourceSupport": source_support,
                "modelKind": MODEL_KIND, "stage": "v113-drone-noise",
            }],
        }
        args.model.parent.mkdir(parents=True, exist_ok=True)
        with args.model.open("wb") as handle:
            pickle.dump(bundle, handle)
        with args.model.open("rb") as handle:
            restored = pickle.load(handle)
        sample = np.asarray([item["features"] for item in training[:24]])
        left = bundle["pairs"][-1]["pipeline"].predict_proba(sample)
        right = restored["pairs"][-1]["pipeline"].predict_proba(sample)
        delta = float(np.max(np.abs(left - right))) if len(sample) else 0.0
        parity = {
            "rows": len(sample), "maxAbsoluteProbabilityDelta": delta,
            "tolerance": 1e-8, "passes": delta <= 1e-8,
        }
        if not parity["passes"]:
            raise RuntimeError("v113 serialization parity failed")
        model_sha = sha256_file(args.model)
        manifest_pairs = [{
            "labels": item["labels"], "view": item["view"],
            "config": item["config"], "sourceSupport": item["sourceSupport"],
            **({"modelKind": item["modelKind"]} if item.get("modelKind") else {}),
            **({"stage": item["stage"]} if item.get("stage") else {}),
        } for item in bundle["pairs"]]
    generated_at = datetime.now(timezone.utc).isoformat()
    report = {
        "generatedAt": generated_at,
        "objective": "Add a source-isolated Top3 Drone/Noise stage after v112.",
        "policy": {
            "metadataUsedAtInference": False, "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False, "overlayRowsEvaluated": False,
            "matchingProviderExcludedFromOuterFold": True,
            "top3CandidateSetChanged": not top3_preserved,
            "productionModelUpdated": False,
        },
        "dataset": {
            "oofRows": len(payload["actual"]),
            "cachedRows": sum(item.get("evaluationEligible", False) for item in items),
            "trainingOnlyOverlayRows": sum(not item.get("evaluationEligible", False) for item in items),
            "pair": list(PAIR), "view": VIEW, "sourceSupport": source_support,
        },
        "config": CONFIG, "folds": folds, "baseline": baseline,
        "sourceHeldout": source_metric,
        "sourceHeldoutChangedRows": int(np.sum(changed)),
        "finalFitDiagnostic": final_metric,
        "finalFitChangedRows": int(np.sum(final_changed)),
        "serializationParity": parity,
        "modelPath": str(args.model) if passed else None,
        "modelSha256": model_sha,
        "decision": "continue-v113-runtime-parity" if passed else "reject-v113",
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    manifest = {
        "version": "unknown80-track-pair-v113-candidate", "schemaVersion": 1,
        "generatedAt": generated_at, "modelPath": report["modelPath"],
        "modelSha256": model_sha,
        "runtimeFeatureContractSha256": shared.feature_contract_digest(),
        "baseVersion": "unknown80-track-pair-v112-candidate",
        "pairs": manifest_pairs,
        "addedStage": {
            "labels": list(PAIR), "view": VIEW, "config": CONFIG,
            "sourceSupport": source_support, "modelKind": MODEL_KIND,
        },
        "promotionState": "candidate-runtime-parity-pending" if passed else "rejected",
    }
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return report


def main():
    residual = load_module(RESIDUAL_PATH, "v113_defaults")
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=residual.DEFAULT_CACHE)
    parser.add_argument("--v112-model", type=Path, default=DEFAULT_V112_MODEL)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()
    report = run(args)
    print(json.dumps({
        "baseline": report["baseline"],
        "sourceHeldout": report["sourceHeldout"],
        "finalFitDiagnostic": report["finalFitDiagnostic"],
        "serializationParity": report["serializationParity"],
        "modelPath": report["modelPath"], "modelSha256": report["modelSha256"],
        "decision": report["decision"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
