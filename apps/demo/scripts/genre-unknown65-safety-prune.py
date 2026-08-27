#!/usr/bin/env python3
"""Remove independently harmful stages and replay development OOF."""

from __future__ import annotations

import argparse
import importlib.util
import json
import pickle
import sys
from collections import Counter
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
SCRIPT_DIR = Path(__file__).parent
CACHE_ROOT = Path("/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training")
DEFAULT_CHAIN = ROOT / "genre-training/unknown65-production-chain.json"
DEFAULT_PRUNING = ROOT / "genre-training/unknown65-gtzan-safety-pruning.json"
DEFAULT_OOF = CACHE_ROOT / "unknown65-v114-musicfm-phase1-oof.npz"
DEFAULT_REPORT_DIR = CACHE_ROOT / "unknown65-production-chain-work"
DEFAULT_BUNDLE = CACHE_ROOT / "unknown65-clap-free-pair-chain-v1.pkl"
DEFAULT_OUTPUT = CACHE_ROOT / "unknown65-clap-free-pair-chain-v1-gtzan-pruned.pkl"
DEFAULT_REPORT = ROOT / "genre-training/unknown65-safety-pruning-report.json"
DEFAULT_OOF_OUTPUT = CACHE_ROOT / "unknown65-clap-free-pair-chain-v1-gtzan-pruned-oof.npz"
PAIR_SCREEN = SCRIPT_DIR / "genre-unknown65-frozen-pair-screen.py"
FEATURES = SCRIPT_DIR / "genre-unknown65-frozen-representation-screen.py"
BASE_SCREEN = SCRIPT_DIR / "genre-unknown80-v113-musicfm-top3-screen.py"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def resolve(value: str) -> Path:
    return Path(value.replace("${CACHE_ROOT}", str(CACHE_ROOT)))


def signature(stage: dict) -> tuple:
    return stage["stageId"], tuple(stage["pair"]), stage["view"]


def report_entry(report: dict, step: dict) -> dict:
    return next(
        item for item in report["passed"]
        if item["pair"] == step["pair"] and item["view"] == step["view"]
        and item["modelKind"] == step["modelKind"]
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--chain", type=Path, default=DEFAULT_CHAIN)
    parser.add_argument("--pruning", type=Path, default=DEFAULT_PRUNING)
    parser.add_argument("--oof", type=Path, default=DEFAULT_OOF)
    parser.add_argument("--report-dir", type=Path, default=DEFAULT_REPORT_DIR)
    parser.add_argument("--bundle", type=Path, default=DEFAULT_BUNDLE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--oof-output", type=Path, default=DEFAULT_OOF_OUTPUT)
    args = parser.parse_args()
    chain = json.loads(args.chain.read_text())
    pruning = json.loads(args.pruning.read_text())
    dropped = {
        (item["stageId"], tuple(item["pair"]), item["view"])
        for item in pruning["dropStages"]
    }
    pair_screen = load_module(PAIR_SCREEN, "unknown65_prune_pair")
    features = load_module(FEATURES, "unknown65_prune_features")
    base_screen = load_module(BASE_SCREEN, "unknown65_prune_base")
    loaded = np.load(args.oof)
    payload = {key: loaded[key] for key in loaded.files}
    labels = [str(value) for value in payload["labels"]]
    current = payload["selectedScores"].astype(np.float64)
    with args.bundle.open("rb") as handle:
        full_bundle = pickle.load(handle)
    held_sources = sorted(
        source for source, count in Counter(payload["sources"]).items() if count >= 8
    )
    stage_metrics = []
    bundle_stage_index = 7
    for stage_config in chain["stages"]:
        stage_report = json.loads((args.report_dir / f"{stage_config['id']}.json").read_text())
        manifests = []
        if stage_config.get("useOverlay"):
            manifests = [resolve(value) for value in chain["overlayManifests"]]
        stage_payload = {**payload, "selectedScores": current}
        items_by_view, _overlay = pair_screen.load_items(
            resolve(stage_config["cache"]), stage_config["cacheFormat"],
            stage_payload, features, False, manifests,
        )
        view_names = list(items_by_view)
        routing_base = current.copy()
        kept = removed = 0
        for step in stage_report["greedyChain"]["steps"]:
            if not step["accepted"]:
                continue
            expected = signature(full_bundle["stages"][bundle_stage_index])
            actual = (stage_config["id"], tuple(step["pair"]), step["view"])
            if expected != actual:
                raise RuntimeError(f"runtime/report stage mismatch: {expected} != {actual}")
            bundle_stage_index += 1
            if actual in dropped:
                removed += 1
                continue
            pair = tuple(step["pair"])
            seed = (
                16570001 + view_names.index(step["view"]) * 100000
                + pair_screen.PAIRS.index(pair) * 10000
                + stage_config["modelKinds"].index(step["modelKind"]) * 1000
            )
            current, _changed = pair_screen.pair_oof_output(
                base_screen, items_by_view[step["view"]], pair,
                step["modelKind"], labels, held_sources, routing_base, current,
                report_entry(stage_report, step)["config"], seed,
                float(stage_config.get("svmC", 1.0)),
            )
            kept += 1
        stage_metrics.append({
            "stageId": stage_config["id"], "kept": kept, "removed": removed,
            "metric": features.metric(
                payload["actual"], current, labels, payload["sources"],
            ),
        })

    bundle = full_bundle
    kept_stages = [stage for stage in bundle["stages"] if signature(stage) not in dropped]
    bundle.update({
        "stages": kept_stages,
        "developmentMetrics": stage_metrics[-1]["metric"],
        "productionEligible": False,
        "promotionDecision": "continue-independent-pruned-gate",
        "safetyPruningVersion": pruning["version"],
    })
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("wb") as handle:
        pickle.dump(bundle, handle, protocol=pickle.HIGHEST_PROTOCOL)
    oof_payload = {key: payload[key] for key in payload}
    oof_payload["selectedScores"] = current
    args.oof_output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(args.oof_output, **oof_payload)
    report = {
        "objective": "Replay development OOF after one-time GTZAN safety pruning.",
        "policy": {"gtzanTrainingRowsAdded": 0, "pruningUsedForSafetyOnly": True},
        "originalStages": len(bundle["stages"]) + len(dropped),
        "keptStages": len(kept_stages), "removedStages": len(dropped),
        "stageMetrics": stage_metrics, "finalDevelopmentMetric": stage_metrics[-1]["metric"],
        "bundle": str(args.output), "oofOutput": str(args.oof_output),
        "promotionEligible": False,
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
