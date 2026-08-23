#!/usr/bin/env python3
"""Reconstruct v99 by outer fold and report its remaining confusions."""

from __future__ import annotations

import argparse
import importlib.util
import json
from collections import Counter
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
SHARED_PATH = Path(__file__).with_name(
    "genre-unknown80-independent-electronic-ablation.py"
)
DEFAULT_REPORT = TRAINING / "unknown80-v99-residual-audit.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-v99-residual-audit.md"


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def render(report):
    lines = [
        "# Unknown80 v99 residual audit", "",
        f"Top1: **{report['metric']['top1Accuracy']:.2f}%**  ",
        f"Balanced Top1: **{report['metric']['balancedTop1']:.2f}%**  ",
        f"Minimum source: **{report['metric']['minimumSourceTop1']:.2f}%**", "",
        "| actual | predicted | errors |",
        "|---|---|---:|",
    ]
    for row in report["confusions"]:
        lines.append(
            f"| {row['actual']} | {row['predicted']} | {row['count']} |"
        )
    lines.extend(["", "## Genre recall", "", "| genre | recall | rows |", "|---|---:|---:|"])
    for row in report["genreRecall"]:
        lines.append(f"| {row['genre']} | {row['recall']:.2f}% | {row['rows']} |")
    lines.append("")
    return "\n".join(lines)


def run(args):
    shared = load_module(SHARED_PATH, "v99_residual_shared")
    black = shared.load_module(shared.BLACK_SCRIPT, "v99_residual_black")
    payload = np.load(args.oof)
    formal, available = black.align_features(
        payload["sourceKeys"], black.load_feature_cache((args.formal_librosa,))
    )
    overlay_rows, overlay_features = black.load_overlay(
        args.black_manifest, args.black_librosa
    )
    held_sources = sorted(
        source for source, count in Counter(payload["sources"]).items()
        if count >= 8
    )
    scores = shared.reconstruct_v99(
        black, payload, formal, available, overlay_rows, overlay_features,
        held_sources,
    )
    labels = np.asarray(payload["labels"])
    actual = payload["actual"]
    predicted = labels[np.argmax(scores, axis=1)]
    mistakes = predicted != actual
    confusions = [
        {"actual": actual_label, "predicted": predicted_label, "count": count}
        for (actual_label, predicted_label), count in Counter(
            zip(actual[mistakes], predicted[mistakes])
        ).most_common()
    ]
    genre_recall = []
    for label in sorted(set(actual)):
        selected = actual == label
        genre_recall.append({
            "genre": label,
            "recall": round(float(np.mean(predicted[selected] == label)) * 100, 2),
            "rows": int(np.sum(selected)),
        })
    genre_recall.sort(key=lambda row: (row["recall"], -row["rows"], row["genre"]))
    report = {
        "objective": "Audit fold-reconstructed v99 residual errors.",
        "policy": {
            "sourceHeldout": True,
            "metadataUsedAtInference": False,
            "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
        },
        "metric": black.metric(actual, scores, labels, payload["sources"]),
        "confusions": confusions,
        "genreRecall": genre_recall,
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def main():
    shared = load_module(SHARED_PATH, "v99_residual_defaults")
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=shared.DEFAULT_OOF)
    parser.add_argument(
        "--formal-librosa", type=Path, default=shared.DEFAULT_FORMAL_LIBROSA
    )
    parser.add_argument(
        "--black-manifest", type=Path, default=shared.DEFAULT_BLACK_MANIFEST
    )
    parser.add_argument(
        "--black-librosa", type=Path, default=shared.DEFAULT_BLACK_LIBROSA
    )
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    report = run(args)
    print(json.dumps({
        "metric": report["metric"],
        "topConfusions": report["confusions"][:20],
        "lowestRecall": report["genreRecall"][:12],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
