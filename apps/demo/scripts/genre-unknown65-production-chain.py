#!/usr/bin/env python3
"""Rebuild the frozen CLAP-free unknown65 development chain."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = Path(__file__).with_name("genre-unknown65-frozen-pair-screen.py")
DEFAULT_CHAIN = ROOT / "genre-training/unknown65-production-chain.json"
DEFAULT_OOF = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown65-v114-musicfm-phase1-oof.npz"
)
DEFAULT_WORK = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown65-production-chain-work"
)
CACHE_ROOT = Path("/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training")


def resolve(value: str) -> Path:
    return Path(value.replace("${CACHE_ROOT}", str(CACHE_ROOT)))


def command_for(stage: dict, chain: dict, source: Path, report: Path, output: Path) -> list[str]:
    command = [
        sys.executable, str(SCRIPT), "--oof", str(source),
        "--cache", str(resolve(stage["cache"])),
        "--cache-format", stage["cacheFormat"],
        "--report", str(report), "--oof-output", str(output),
    ]
    for kind in stage["modelKinds"]:
        command.extend(("--model-kind", kind))
    if "svmC" in stage:
        command.extend(("--svm-c", str(stage["svmC"])))
    if stage.get("useOverlay"):
        for manifest in chain["overlayManifests"]:
            command.extend(("--overlay-manifest", str(resolve(manifest))))
    return command


def observed(report: dict) -> dict:
    metric = report["greedyChain"]["metric"]
    return {key: metric[key] for key in (
        "top1Accuracy", "balancedTop1", "minimumSourceTop1",
    )}


def meets_floor(metric: dict, expected: dict) -> bool:
    return all(float(metric[key]) >= float(expected[key]) for key in expected)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--chain", type=Path, default=DEFAULT_CHAIN)
    parser.add_argument("--oof", type=Path, default=DEFAULT_OOF)
    parser.add_argument("--work-dir", type=Path, default=DEFAULT_WORK)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    chain = json.loads(args.chain.read_text())
    args.work_dir.mkdir(parents=True, exist_ok=True)
    source = args.oof
    summary = []
    for stage in chain["stages"]:
        report = args.work_dir / f"{stage['id']}.json"
        output = args.work_dir / f"{stage['id']}.npz"
        if not (args.resume and report.is_file() and output.is_file()):
            subprocess.run(command_for(stage, chain, source, report, output), check=True)
        payload = json.loads(report.read_text())
        metric = observed(payload)
        if not meets_floor(metric, stage["expected"]):
            raise RuntimeError(
                f"{stage['id']} fell below frozen floor: {metric} < {stage['expected']}"
            )
        summary.append({
            "id": stage["id"], "metric": metric,
            "frozenFloor": stage["expected"],
            "exactFrozenMatch": metric == stage["expected"],
        })
        source = output
    print(json.dumps({
        "version": chain["version"], "stages": summary,
        "finalOof": str(source), "reportDir": str(args.work_dir),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
