#!/usr/bin/env python3
"""Audit whether pair heads have enough independent training sources per fold."""

from __future__ import annotations

import argparse
import importlib.util
import json
from collections import Counter
from pathlib import Path

import numpy as np

from genre_research_reproducibility import build_reproducibility


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
PAIRWISE_PATH = Path(__file__).with_name("genre-unknown80-top3-pairwise-screen.py")
REPRO_PATH = Path(__file__).with_name("genre_research_reproducibility.py")
DEFAULT_OOF = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-incumbent-caphe-oof-audio-only.npz"
)
DEFAULT_REPORT = TRAINING / "unknown80-pair-source-audit.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-pair-source-audit.md"


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def source_counts(actual, sources, eligible, label):
    return dict(sorted(Counter(
        str(source) for source in sources[(actual == label) & eligible]
    ).items()))


def audit_pairs(
    actual, sources, eligible, held_sources, pairs,
    minimum_rows=8, minimum_sources=2,
):
    rows = []
    for pair in pairs:
        label_sources = {
            label: source_counts(actual, sources, eligible, label)
            for label in pair
        }
        blocked = []
        for held_source in held_sources:
            fold = []
            for label in pair:
                counts = label_sources[label]
                training_counts = {
                    source: count for source, count in counts.items()
                    if source != held_source
                }
                training_rows = sum(training_counts.values())
                if training_rows < minimum_rows or len(training_counts) < minimum_sources:
                    fold.append({
                        "label": label,
                        "trainingRows": training_rows,
                        "trainingSources": len(training_counts),
                    })
            if fold:
                blocked.append({"heldOutSource": held_source, "labels": fold})
        required = {
            label: max(0, minimum_sources + 1 - len(counts))
            for label, counts in label_sources.items()
        }
        rows.append({
            "pair": list(pair),
            "status": "viable-all-folds" if not blocked else "blocked-source-coverage",
            "sourcesByLabel": label_sources,
            "sourceCountByLabel": {
                label: len(counts) for label, counts in label_sources.items()
            },
            "additionalIndependentSourcesNeeded": required,
            "blockedFoldCount": len(blocked),
            "blockedFolds": blocked,
        })
    return rows


def render(report):
    lines = [
        "# Unknown80 pair source audit", "",
        "A pair head is viable only when every outer fold retains at least two independent training sources per label.",
        "",
        "| pair | status | sources | additional sources needed | blocked folds |",
        "|---|---|---|---|---:|",
    ]
    for row in report["pairs"]:
        sources = " / ".join(
            f"{label} {row['sourceCountByLabel'][label]}"
            for label in row["pair"]
        )
        needed = " / ".join(
            f"{label} +{row['additionalIndependentSourcesNeeded'][label]}"
            for label in row["pair"]
        )
        lines.append(
            f"| {' vs '.join(row['pair'])} | {row['status']} | {sources} | "
            f"{needed} | {row['blockedFoldCount']} |"
        )
    lines.extend(["", "## Priority", ""])
    for item in report["priority"]:
        lines.append(
            f"- {' vs '.join(item['pair'])}: "
            f"{item['additionalIndependentSourcesNeeded']}"
        )
    reproducibility = report.get("reproducibility") or {}
    lines.extend([
        "", "## Reproducibility", "",
        f"- Script SHA-256: `{reproducibility['script']['sha256']}`",
        f"- OOF SHA-256: `{reproducibility['inputs'][0]['sha256']}`",
        "",
    ])
    return "\n".join(lines)


def run(args):
    pairwise = load_module(PAIRWISE_PATH, "unknown80_source_audit_pairwise")
    payload = np.load(args.oof)
    actual = payload["actual"]
    sources = payload["sources"]
    eligible = payload["trainingEligible"].astype(bool)
    held_sources = sorted(
        source for source, count in Counter(sources).items() if count >= 8
    )
    rows = audit_pairs(
        actual, sources, eligible, held_sources, pairwise.PAIRS,
        minimum_rows=8, minimum_sources=2,
    )
    priority = sorted(
        (row for row in rows if row["status"] != "viable-all-folds"),
        key=lambda row: (
            sum(row["additionalIndependentSourcesNeeded"].values()),
            row["blockedFoldCount"],
        ),
        reverse=True,
    )
    report = {
        "objective": "Block pairwise model selection until every fold has independent label sources.",
        "policy": {
            "minimumRowsPerLabelPerFold": 8,
            "minimumIndependentSourcesPerLabelPerFold": 2,
            "sealedFinalHoldoutUsed": False,
            "productionModelUpdated": False,
        },
        "dataset": {
            "rows": len(actual),
            "heldOutSources": held_sources,
        },
        "pairs": rows,
        "priority": [{
            "pair": row["pair"],
            "additionalIndependentSourcesNeeded": row["additionalIndependentSourcesNeeded"],
            "blockedFoldCount": row["blockedFoldCount"],
        } for row in priority],
        "reproducibility": build_reproducibility(
            Path(__file__), dependencies=(PAIRWISE_PATH, REPRO_PATH), inputs=(args.oof,),
            contract={
                "minimumRowsPerLabelPerFold": 8,
                "minimumIndependentSourcesPerLabelPerFold": 2,
            },
            root=ROOT,
        ),
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=DEFAULT_OOF)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    report = run(args)
    print(json.dumps({
        "blockedPairs": len(report["priority"]),
        "priority": report["priority"],
        "report": str(args.report),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
