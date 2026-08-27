#!/usr/bin/env python3
"""Append source-heldout residual stages to a safety-pruned runtime bundle."""

from __future__ import annotations

import argparse
import importlib.util
import json
import pickle
import sys
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
SCRIPT_DIR = Path(__file__).parent
CACHE_ROOT = Path("/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training")
DEFAULT_MANIFEST = ROOT / "genre-training/unknown65-residual-chain.json"
DEFAULT_OOF = CACHE_ROOT / "unknown65-pruned-replay-oof.npz"
DEFAULT_BASE = CACHE_ROOT / "unknown65-pruned-replay-candidate.pkl"
DEFAULT_OUTPUT = CACHE_ROOT / "unknown65-first-milestone-candidate.pkl"
PAIR_SCREEN = SCRIPT_DIR / "genre-unknown65-frozen-pair-screen.py"
FEATURES = SCRIPT_DIR / "genre-unknown65-frozen-representation-screen.py"
BASE_SCREEN = SCRIPT_DIR / "genre-unknown80-v113-musicfm-top3-screen.py"
RUNTIME = SCRIPT_DIR / "genre_unknown65_runtime.py"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def resolve(value: str) -> Path:
    return Path(value.replace("${ROOT}", str(ROOT)).replace("${CACHE_ROOT}", str(CACHE_ROOT)))


def report_entry(report: dict, step: dict) -> dict:
    return next(
        item for item in report["passed"]
        if item["pair"] == step["pair"] and item["view"] == step["view"]
        and item["modelKind"] == step["modelKind"]
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--oof", type=Path, default=DEFAULT_OOF)
    parser.add_argument("--base-bundle", type=Path, default=DEFAULT_BASE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    loaded = np.load(args.oof)
    payload = {key: loaded[key] for key in loaded.files}
    pair_screen = load_module(PAIR_SCREEN, "unknown65_residual_pair")
    features = load_module(FEATURES, "unknown65_residual_features")
    base_screen = load_module(BASE_SCREEN, "unknown65_residual_base")
    runtime = load_module(RUNTIME, "unknown65_residual_runtime")
    base = runtime.load_bundle(args.base_bundle)
    stages = list(base["stages"])
    stage_summary = []
    keep_indexes = set(manifest.get("keptStageIndexes", []))
    stage_index = 0
    for config in manifest["stages"]:
        report = json.loads(resolve(config["report"]).read_text())
        items_by_view, _overlay = pair_screen.load_items(
            resolve(config["cache"]), config["cacheFormat"], payload,
            features, False, [],
        )
        view_names = list(items_by_view)
        added = 0
        for step in report["greedyChain"]["steps"]:
            if not step["accepted"]:
                continue
            selected = not keep_indexes or stage_index in keep_indexes
            stage_index += 1
            if not selected:
                continue
            entry = report_entry(report, step)
            pair = tuple(step["pair"])
            items = [
                item for item in items_by_view[step["view"]]
                if item["actual"] in pair and item["trainingEligible"]
            ]
            seed = (
                16570001 + view_names.index(step["view"]) * 100000
                + pair_screen.PAIRS.index(pair) * 10000
                + config["modelKinds"].index(step["modelKind"]) * 1000 + 9000
            )
            model = pair_screen.fit_pair_model(
                base_screen, items, step["modelKind"], seed,
                float(config.get("svmC", 1.0)),
            )
            if model is None:
                raise RuntimeError(f"could not fit {config['id']} {pair}")
            stages.append({
                "stageId": config["id"], "pair": list(pair),
                "cacheFormat": config["cacheFormat"], "view": step["view"],
                "modelKind": step["modelKind"], "config": entry["config"],
                "trainingRows": len(items), "model": model,
            })
            added += 1
        stage_summary.append({"stageId": config["id"], "added": added})
    development_report = json.loads(resolve(manifest["developmentReport"]).read_text())
    promotion = manifest.get("promotion") or {}
    bundle = dict(base)
    bundle.update({
        "stages": stages,
        "developmentMetrics": development_report["metric"],
        "modelVersion": promotion.get("modelVersion", manifest["version"]),
        "productionEligible": bool(promotion.get("productionEligible", False)),
        "promotionDecision": promotion.get(
            "decision", "continue-independent-validation",
        ),
        "promotionEvidence": promotion.get("evidence") or {},
        "residualChainVersion": manifest["version"],
    })
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    with temporary.open("wb") as handle:
        pickle.dump(bundle, handle, protocol=pickle.HIGHEST_PROTOCOL)
    temporary.replace(args.output)
    checked = runtime.load_bundle(args.output)
    print(json.dumps({
        "output": str(args.output), "bytes": args.output.stat().st_size,
        "baseStages": len(base["stages"]), "runtimeStages": len(checked["stages"]),
        "keptStageIndexes": sorted(keep_indexes),
        "addedStages": stage_summary,
        "developmentMetrics": bundle["developmentMetrics"],
        "modelVersion": bundle["modelVersion"],
        "productionEligible": bundle["productionEligible"],
        "promotionDecision": bundle["promotionDecision"],
        "featureContractSha256": bundle["runtimeFeatureContractSha256"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
