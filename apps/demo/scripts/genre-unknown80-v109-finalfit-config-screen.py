#!/usr/bin/env python3
"""Select temporal pair configs that also bound final-fit runtime behavior."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
EXPORT_PATH = Path(__file__).with_name("genre-unknown80-v108-track-pair-export.py")
PAIR_PATH = Path(__file__).with_name("genre-unknown80-v107-track-pair-screen.py")
SHARED_PATH = Path(__file__).with_name("genre-unknown80-v107-track-reranker-screen.py")
DEFAULT_REPORT = TRAINING / "unknown80-v109-finalfit-config-screen.json"


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def run(args):
    export = load_module(EXPORT_PATH, "v109_config_export")
    pair_module = load_module(PAIR_PATH, "v109_config_pair")
    shared = load_module(SHARED_PATH, "v109_config_shared")
    _source, black, payload, v107, held_sources, baseline = shared.build_v107()
    labels = list(payload["labels"])
    selections = export.selected_pairs(args.selection)
    results = []
    for pair_index, (pair, view) in enumerate(selections):
        view_args = argparse.Namespace(cache=args.cache, view=view)
        items = shared.load_cached_items(view_args, payload, labels)
        for item in items:
            item["evaluationEligible"] = True
            item["baseScores"] = np.asarray(v107[item["index"]], dtype=np.float64)
            order = np.argsort(-item["baseScores"], kind="stable")
            item["top2Labels"] = (labels[int(order[0])], labels[int(order[1])])
        items.extend(export.load_overlay_items(args.overlay_cache, view, shared))
        records, _folds = export.crossfit_probabilities(
            items, pair, labels, held_sources, pair_module,
            4301001 + pair_index * 10000,
        )
        training = [item for item in items if item["trainingEligible"]]
        final_model = pair_module.fit_pair(
            training, pair, 4309001 + pair_index * 10000,
        )
        routed = pair_module.routed_items(
            [item for item in items if item["evaluationEligible"]], pair,
        )
        final_probabilities = pair_module.pair_probabilities(final_model, routed, pair)
        final_indexes = np.asarray([item["index"] for item in routed], dtype=np.int64)
        candidates = []
        for weight in pair_module.WEIGHTS:
            for floor in pair_module.CONFIDENCE_FLOORS:
                config = {"weight": weight, "confidenceFloor": floor}
                source_output = np.asarray(v107, dtype=np.float64).copy()
                if records:
                    indexes = np.asarray([record["item"]["index"] for record in records], dtype=np.int64)
                    probabilities = np.asarray([record["probabilities"] for record in records])
                    changed, _mask = pair_module.apply_pair(
                        source_output[indexes], probabilities, pair, labels, config,
                    )
                    source_output[indexes] = changed
                source_metric = black.compare_output(
                    source_output, v107, payload["actual"], labels, payload["sources"],
                )
                final_output = np.asarray(v107, dtype=np.float64).copy()
                changed, _mask = pair_module.apply_pair(
                    final_output[final_indexes], final_probabilities, pair, labels, config,
                )
                final_output[final_indexes] = changed
                final_metric = black.compare_output(
                    final_output, v107, payload["actual"], labels, payload["sources"],
                )
                passed = (
                    source_metric["top1Accuracy"] > baseline["top1Accuracy"]
                    and source_metric["balancedTop1"] >= baseline["balancedTop1"]
                    and source_metric["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
                    and source_metric["top3Accuracy"] >= baseline["top3Accuracy"]
                    and source_metric["improved"] > 0
                    and source_metric["harmed"] == 0
                    and final_metric["top1Accuracy"] >= baseline["top1Accuracy"]
                    and final_metric["harmed"] == 0
                )
                candidates.append({
                    "config": config, "sourceHeldout": source_metric,
                    "finalFitDiagnostic": final_metric, "passed": passed,
                })
        candidates.sort(key=lambda item: (
            item["passed"], item["sourceHeldout"]["top1Accuracy"],
            item["sourceHeldout"]["balancedTop1"],
            item["finalFitDiagnostic"]["top1Accuracy"],
            item["config"]["confidenceFloor"], -item["config"]["weight"],
        ), reverse=True)
        selected = next((item for item in candidates if item["passed"]), None)
        results.append({
            "pair": pair_module.pair_name(pair), "view": view,
            "routedRows": len(routed), "selected": selected,
            "passedCandidateCount": sum(item["passed"] for item in candidates),
            "best": candidates[0],
        })
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "objective": "Require source-heldout improvement and zero-harm final-fit behavior.",
        "baseline": baseline,
        "results": results,
        "decision": (
            "continue-v109-export-with-safe-configs"
            if any(item["selected"] for item in results)
            else "reject-v109-no-safe-config"
        ),
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


def main():
    export = load_module(EXPORT_PATH, "v109_config_defaults")
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=export.DEFAULT_CACHE)
    parser.add_argument("--overlay-cache", type=Path, default=export.DEFAULT_OVERLAY_CACHE)
    parser.add_argument("--selection", type=Path, default=export.DEFAULT_SELECTION)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    report = run(args)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
