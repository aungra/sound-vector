#!/usr/bin/env python3
"""Enumerate safety-pruned stage subsets on evaluation-only GTZAN."""

from __future__ import annotations

import argparse
import copy
import importlib.util
import itertools
import json
import sys
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
SCRIPT_DIR = Path(__file__).parent
CACHE_ROOT = Path("/Volumes/20251005_12TBskyhawk/MUSICTee-cache")
DEFAULT_CHECKPOINT = CACHE_ROOT / "external-data/gtzan/production-transfer-predictions-v2.jsonl"
DEFAULT_CACHE = CACHE_ROOT / "external-data/gtzan/unknown65-deep-representations-v1.json"
DEFAULT_MUSICFM = CACHE_ROOT / "genre-training/unknown80-musicfm-top3-v114-candidate.pkl"
DEFAULT_CHAIN = CACHE_ROOT / "genre-training/unknown65-clap-free-pair-chain-v1.pkl"
DEFAULT_PRUNING = ROOT / "genre-training/unknown65-gtzan-safety-pruning.json"
DEFAULT_REPORT = ROOT / "genre-training/unknown65-gtzan-subset-gate.json"
MUSICFM_RUNTIME = SCRIPT_DIR / "genre_musicfm_runtime.py"
CHAIN_RUNTIME = SCRIPT_DIR / "genre_unknown65_runtime.py"
GATE = SCRIPT_DIR / "genre-unknown65-independent-gate.py"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def signature(stage: dict) -> tuple:
    return stage["stageId"], tuple(stage["pair"]), stage["view"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=Path, default=DEFAULT_CHECKPOINT)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--musicfm-bundle", type=Path, default=DEFAULT_MUSICFM)
    parser.add_argument("--chain-bundle", type=Path, default=DEFAULT_CHAIN)
    parser.add_argument("--pruning", type=Path, default=DEFAULT_PRUNING)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()

    musicfm = load_module(MUSICFM_RUNTIME, "unknown65_subset_musicfm")
    runtime = load_module(CHAIN_RUNTIME, "unknown65_subset_runtime")
    gate = load_module(GATE, "unknown65_subset_gate_metrics")
    musicfm_bundle = musicfm.load_bundle(args.musicfm_bundle)
    full_chain = runtime.load_bundle(args.chain_bundle)
    labels = list(full_chain["labels"])
    records = json.loads(args.cache.read_text())
    rows = gate.rows(args.checkpoint)
    actual = [row["actual"] for row in rows]
    baseline = np.asarray([
        gate.score_vector({"top": row.get("baselineTop") or row.get("top")}, labels)
        for row in rows
    ])
    after_musicfm = np.asarray([
        musicfm.rerank(musicfm_bundle, labels, baseline[index], records[row["trackId"]]["musicfm"])[0]
        for index, row in enumerate(rows)
    ])
    pruning = json.loads(args.pruning.read_text())
    candidates = [
        (item["stageId"], tuple(item["pair"]), item["view"])
        for item in pruning["dropStages"]
    ]
    fixed = [stage for stage in full_chain["stages"] if signature(stage) not in candidates]
    fixed_chain = copy.copy(full_chain)
    fixed_chain["stages"] = fixed
    after_fixed = np.asarray([
        runtime.rerank(fixed_chain, labels, after_musicfm[index], records[row["trackId"]])[0]
        for index, row in enumerate(rows)
    ])
    results = []
    for keep_count in range(len(candidates) + 1):
        for kept in itertools.combinations(candidates, keep_count):
            kept_set = set(kept)
            chain = copy.copy(full_chain)
            chain["stages"] = [
                stage for stage in full_chain["stages"] if signature(stage) in kept_set
            ]
            output = np.asarray([
                runtime.rerank(chain, labels, after_fixed[index], records[row["trackId"]])[0]
                for index, row in enumerate(rows)
            ])
            metric = gate.metrics(actual, output, labels)
            results.append({
                "keptDropStageIndexes": [candidates.index(item) for item in kept],
                "runtimeStages": len(fixed) + len(chain["stages"]),
                "metric": metric,
                "safe": (
                    metric["top1Accuracy"] >= pruning["baselineTop1"]
                    and metric["balancedTop1"] >= pruning["baselineBalancedTop1"]
                ),
            })
    results.sort(key=lambda item: (
        not item["safe"], -item["metric"]["top1Accuracy"],
        -item["metric"]["balancedTop1"], -item["runtimeStages"],
    ))
    report = {
        "objective": "GTZAN safety gate over all subsets of the five pruned stages.",
        "role": "evaluation-only-safety-selection",
        "trainingRowsAdded": 0,
        "baseline": gate.metrics(actual, baseline, labels),
        "afterMusicFm": gate.metrics(actual, after_musicfm, labels),
        "afterFixedChain": gate.metrics(actual, after_fixed, labels),
        "candidateStages": [
            {"index": index, "stageId": item[0], "pair": list(item[1]), "view": item[2]}
            for index, item in enumerate(candidates)
        ],
        "safeSubsets": sum(item["safe"] for item in results),
        "results": results,
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
