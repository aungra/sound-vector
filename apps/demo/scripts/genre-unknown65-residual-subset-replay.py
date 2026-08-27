#!/usr/bin/env python3
"""Replay a selected residual-stage subset on source-heldout OOF."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
SCRIPT_DIR = Path(__file__).parent
CACHE_ROOT = Path("/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training")
DEFAULT_MANIFEST = ROOT / "genre-training/unknown65-residual-chain.json"
DEFAULT_OOF = CACHE_ROOT / "unknown65-pruned-replay-oof.npz"
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
    parser.add_argument("--keep-index", type=int, action="append", default=[])
    parser.add_argument("--oof-output", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    loaded = np.load(args.oof)
    payload = {key: loaded[key] for key in loaded.files}
    labels = [str(value) for value in payload["labels"]]
    current = payload["selectedScores"].astype(np.float64)
    pair_screen = load_module(PAIR_SCREEN, "unknown65_subset_replay_pair")
    features = load_module(FEATURES, "unknown65_subset_replay_features")
    base_screen = load_module(BASE_SCREEN, "unknown65_subset_replay_base")
    held_sources = sorted(
        source for source, count in Counter(payload["sources"]).items() if count >= 8
    )
    keep = set(args.keep_index)
    stage_index = 0
    replayed = []
    for config in manifest["stages"]:
        report = json.loads(resolve(config["report"]).read_text())
        items_by_view, _overlay = pair_screen.load_items(
            resolve(config["cache"]), config["cacheFormat"], payload,
            features, False, [],
        )
        view_names = list(items_by_view)
        routing_base = current.copy()
        for step in report["greedyChain"]["steps"]:
            if not step["accepted"]:
                continue
            selected = stage_index in keep
            if selected:
                entry = report_entry(report, step)
                pair = tuple(step["pair"])
                seed = (
                    16570001 + view_names.index(step["view"]) * 100000
                    + pair_screen.PAIRS.index(pair) * 10000
                    + config["modelKinds"].index(step["modelKind"]) * 1000
                )
                current, changed = pair_screen.pair_oof_output(
                    base_screen, items_by_view[step["view"]], pair,
                    step["modelKind"], labels, held_sources, routing_base, current,
                    entry["config"], seed, float(config.get("svmC", 1.0)),
                )
            else:
                changed = 0
            replayed.append({
                "index": stage_index, "stageId": config["id"],
                "pair": step["pair"], "view": step["view"],
                "selected": selected, "changedRows": changed,
            })
            stage_index += 1
    if keep - set(range(stage_index)):
        raise ValueError("keep-index contains an unknown stage")
    metric = features.metric(payload["actual"], current, labels, payload["sources"])
    result = {
        "objective": "Source-heldout replay of an independently safe residual subset.",
        "keptIndexes": sorted(keep), "availableStages": stage_index,
        "replayed": replayed, "metric": metric,
    }
    if args.oof_output:
        np.savez_compressed(args.oof_output, **{**payload, "selectedScores": current})
        result["oofOutput"] = str(args.oof_output)
    if args.report:
        args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
