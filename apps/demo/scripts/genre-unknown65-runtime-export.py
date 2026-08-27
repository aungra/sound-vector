#!/usr/bin/env python3
"""Fit and serialize the fixed unknown65 pair chain for runtime evaluation."""

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
CHAIN = ROOT / "genre-training/unknown65-production-chain.json"
OOF = Path("/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/unknown65-v114-musicfm-phase1-oof.npz")
DEFAULT_OUTPUT = Path("/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/unknown65-clap-free-pair-chain-v1.pkl")
PAIR_SCREEN = SCRIPT_DIR / "genre-unknown65-frozen-pair-screen.py"
FEATURES = SCRIPT_DIR / "genre-unknown65-frozen-representation-screen.py"
BASE_SCREEN = SCRIPT_DIR / "genre-unknown80-v113-musicfm-top3-screen.py"
RUNTIME = SCRIPT_DIR / "genre_unknown65_runtime.py"
MUSICFM_SCREEN = SCRIPT_DIR / "genre-unknown65-v114-musicfm-pair-screen.py"
MUSICFM_CACHE_10 = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "musicfm-msd-10s-pilot-cache.json"
)
MUSICFM_CACHE_30 = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "musicfm-house-boundary-30s-cache.json"
)
MUSICFM_REPORT = ROOT / "genre-training/unknown65-v114-musicfm-pair-screen.json"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def resolve(value: str, cache_root: Path) -> Path:
    return Path(value.replace("${CACHE_ROOT}", str(cache_root)))


def report_entry(report: dict, step: dict) -> dict:
    for item in report["passed"]:
        if item["pair"] == step["pair"] and item["view"] == step["view"] and item["modelKind"] == step["modelKind"]:
            return item
    raise ValueError(f"accepted step missing from passed list: {step}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--chain", type=Path, default=CHAIN)
    parser.add_argument("--report-dir", type=Path, required=True)
    parser.add_argument("--oof", type=Path, default=OOF)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    chain = json.loads(args.chain.read_text())
    loaded = np.load(args.oof)
    payload = {key: loaded[key] for key in loaded.files}
    cache_root = Path("/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training")
    pair_screen = load_module(PAIR_SCREEN, "unknown65_export_pair")
    features = load_module(FEATURES, "unknown65_export_features")
    base_screen = load_module(BASE_SCREEN, "unknown65_export_base")
    runtime = load_module(RUNTIME, "unknown65_export_runtime")
    stages = []

    musicfm_screen = load_module(MUSICFM_SCREEN, "unknown65_export_musicfm")
    musicfm_report = json.loads(MUSICFM_REPORT.read_text())
    base_screen_module = load_module(BASE_SCREEN, "unknown65_export_musicfm_base")
    musicfm_items = base_screen_module.load_items(
        argparse.Namespace(cache_10=MUSICFM_CACHE_10, cache_30=MUSICFM_CACHE_30),
        payload,
    )
    for step in musicfm_report["greedyChain"]["steps"]:
        if not step["accepted"]:
            continue
        pair = tuple(step["pair"])
        entry = next(
            item for item in musicfm_report["passed"]
            if item["pair"] == step["pair"] and item["view"] == step["view"]
            and item["modelKind"] == step["modelKind"]
        )
        items = [
            item for item in musicfm_items[step["view"]]
            if item["actual"] in pair and item["trainingEligible"]
        ]
        seed = (
            16500001 + musicfm_screen.VIEWS.index(step["view"]) * 100000
            + musicfm_screen.PAIRS.index(pair) * 10000
            + musicfm_screen.KINDS.index(step["modelKind"]) * 1000 + 9000
        )
        model = base_screen_module.fit_model(items, step["modelKind"], seed)
        if model is None:
            raise RuntimeError(f"could not fit MusicFM phase-1 {pair}")
        stages.append({
            "stageId": "00-musicfm-phase1", "pair": list(pair),
            "cacheFormat": "musicfm", "view": step["view"],
            "modelKind": step["modelKind"], "config": entry["config"],
            "trainingRows": len(items), "model": model,
        })

    for stage_config in chain["stages"]:
        report = json.loads((args.report_dir / f"{stage_config['id']}.json").read_text())
        manifests = []
        if stage_config.get("useOverlay"):
            manifests = [resolve(value, cache_root) for value in chain["overlayManifests"]]
        items_by_view, _ = pair_screen.load_items(
            resolve(stage_config["cache"], cache_root), stage_config["cacheFormat"],
            payload, features, False, manifests,
        )
        view_names = list(items_by_view)
        for step in report["greedyChain"]["steps"]:
            if not step["accepted"]:
                continue
            entry = report_entry(report, step)
            pair = tuple(step["pair"])
            items = [item for item in items_by_view[step["view"]] if item["actual"] in pair and item["trainingEligible"]]
            seed = (
                16570001 + view_names.index(step["view"]) * 100000
                + pair_screen.PAIRS.index(pair) * 10000
                + stage_config["modelKinds"].index(step["modelKind"]) * 1000 + 9000
            )
            model = pair_screen.fit_pair_model(
                base_screen, items, step["modelKind"], seed,
                float(stage_config.get("svmC", 1.0)),
            )
            if model is None:
                raise RuntimeError(f"could not fit {stage_config['id']} {pair}")
            stages.append({
                "stageId": stage_config["id"], "pair": list(pair),
                "cacheFormat": stage_config["cacheFormat"], "view": step["view"],
                "modelKind": step["modelKind"], "config": entry["config"],
                "trainingRows": len(items), "model": model,
            })

    contract = runtime.feature_contract()
    bundle = {
        "version": runtime.VERSION, "schemaVersion": runtime.SCHEMA_VERSION,
        "runtimeFeatureContract": contract,
        "runtimeFeatureContractSha256": runtime.feature_contract_digest(contract),
        "labels": [str(value) for value in payload["labels"]], "stages": stages,
        "developmentMetrics": json.loads(
            (args.report_dir / f"{chain['stages'][-1]['id']}.json").read_text()
        )["greedyChain"]["metric"],
        "productionEligible": False, "promotionDecision": "continue-independent-validation",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("wb") as handle:
        pickle.dump(bundle, handle, protocol=pickle.HIGHEST_PROTOCOL)
    loaded_bundle = runtime.load_bundle(args.output)
    if len(loaded_bundle["stages"]) != len(stages):
        raise RuntimeError("serialized stage count changed")
    print(json.dumps({
        "output": str(args.output), "bytes": args.output.stat().st_size,
        "stages": len(stages),
        "featureContractSha256": bundle["runtimeFeatureContractSha256"],
        "productionEligible": False,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
