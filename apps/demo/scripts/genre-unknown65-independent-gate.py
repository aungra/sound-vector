#!/usr/bin/env python3
"""Gate the frozen unknown65 chain on evaluation-only GTZAN predictions."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
SCRIPT_DIR = Path(__file__).parent
DEFAULT_CHECKPOINT = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/gtzan/"
    "production-transfer-predictions-v2.jsonl"
)
DEFAULT_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/gtzan/"
    "unknown65-deep-representations-v1.json"
)
DEFAULT_MUSICFM = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-musicfm-top3-v114-candidate.pkl"
)
DEFAULT_CHAIN = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown65-clap-free-pair-chain-v1.pkl"
)
DEFAULT_REPORT = ROOT / "genre-training/unknown65-independent-gtzan-gate.json"
MUSICFM_RUNTIME = SCRIPT_DIR / "genre_musicfm_runtime.py"
CHAIN_RUNTIME = SCRIPT_DIR / "genre_unknown65_runtime.py"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def rows(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def score_vector(row: dict, labels: list[str]) -> np.ndarray:
    lookup = {item["label"]: float(item["score"]) for item in row.get("top") or []}
    return np.asarray([lookup.get(label, 0.0) for label in labels], dtype=np.float64)


def metrics(actual: list[str], scores: np.ndarray, labels: list[str]) -> dict:
    label_array = np.asarray(labels, dtype=object)
    order = np.argsort(-scores, axis=1, kind="stable")
    predicted = label_array[order[:, 0]]
    correct = predicted == np.asarray(actual, dtype=object)
    grouped = defaultdict(lambda: Counter(total=0, top1=0, top3=0))
    for truth, row, is_correct in zip(actual, order, correct):
        grouped[truth]["total"] += 1
        grouped[truth]["top1"] += int(is_correct)
        grouped[truth]["top3"] += int(truth in label_array[row[:3]])
    by_label = {
        label: {
            "total": value["total"], "top1": value["top1"],
            "top3": value["top3"],
            "top1Accuracy": round(value["top1"] / value["total"] * 100, 2),
            "top3Accuracy": round(value["top3"] / value["total"] * 100, 2),
        }
        for label, value in sorted(grouped.items())
    }
    return {
        "total": len(actual),
        "top1Accuracy": round(float(np.mean(correct)) * 100, 2),
        "balancedTop1": round(float(np.mean([
            value["top1Accuracy"] for value in by_label.values()
        ])), 2),
        "top3Accuracy": round(float(np.mean([
            truth in label_array[row[:3]] for truth, row in zip(actual, order)
        ])) * 100, 2),
        "byLabel": by_label,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=Path, default=DEFAULT_CHECKPOINT)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--musicfm-bundle", type=Path, default=DEFAULT_MUSICFM)
    parser.add_argument("--chain-bundle", type=Path, default=DEFAULT_CHAIN)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    musicfm = load_module(MUSICFM_RUNTIME, "unknown65_gate_musicfm")
    runtime = load_module(CHAIN_RUNTIME, "unknown65_gate_chain")
    musicfm_bundle = musicfm.load_bundle(args.musicfm_bundle)
    chain = runtime.load_bundle(args.chain_bundle)
    labels = list(chain["labels"])
    records = json.loads(args.cache.read_text())
    prediction_rows = rows(args.checkpoint)
    actual = [row["actual"] for row in prediction_rows]
    baseline = np.asarray([
        score_vector({"top": row.get("baselineTop") or row.get("top")}, labels)
        for row in prediction_rows
    ])
    current_production = np.asarray([score_vector(row, labels) for row in prediction_rows])
    after_musicfm = baseline.copy()
    after_chain = baseline.copy()
    changed_musicfm = changed_chain = 0
    missing = []
    for index, row in enumerate(prediction_rows):
        track_id = row["trackId"]
        record = records.get(track_id) or {}
        if not all(name in record for name in ("musicfm", "panns", "yamnet", "ast")):
            missing.append(track_id)
            continue
        first, _detail = musicfm.rerank(
            musicfm_bundle, labels, baseline[index], record["musicfm"],
        )
        final, _details = runtime.rerank(chain, labels, first, record)
        after_musicfm[index] = first
        after_chain[index] = final
        changed_musicfm += int(np.argmax(first) != np.argmax(baseline[index]))
        changed_chain += int(np.argmax(final) != np.argmax(first))
    if missing:
        raise RuntimeError(f"independent representations missing for {len(missing)} tracks")
    baseline_metric = metrics(actual, baseline, labels)
    musicfm_metric = metrics(actual, after_musicfm, labels)
    final_metric = metrics(actual, after_chain, labels)
    repeat = np.asarray([
        runtime.rerank(
            chain, labels,
            musicfm.rerank(musicfm_bundle, labels, baseline[index], records[row["trackId"]]["musicfm"])[0],
            records[row["trackId"]],
        )[0]
        for index, row in enumerate(prediction_rows)
    ])
    deterministic = bool(np.array_equal(after_chain, repeat))
    promotion_eligible = (
        final_metric["top1Accuracy"] >= baseline_metric["top1Accuracy"]
        and final_metric["balancedTop1"] >= baseline_metric["balancedTop1"]
        and final_metric["top3Accuracy"] >= baseline_metric["top3Accuracy"]
        and deterministic
    )
    report = {
        "objective": "Independent GTZAN non-regression gate for unknown65.",
        "role": "source-heldout-evaluation-only", "trainingRowsAdded": 0,
        "baseline": baseline_metric,
        "currentProductionBeforeUnknown65": metrics(actual, current_production, labels),
        "afterV114MusicFm": musicfm_metric,
        "afterUnknown65Chain": final_metric,
        "impact": {"musicFmChangedTop1": changed_musicfm, "chainChangedTop1": changed_chain},
        "serializedInferenceDeterministic": deterministic,
        "runtimeStages": len(chain["stages"]),
        "runtimeFeatureContractSha256": chain["runtimeFeatureContractSha256"],
        "promotionEligible": promotion_eligible,
        "decision": "continue-latency-and-production-regression-gates" if promotion_eligible else "reject-chain-independent-regression",
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
