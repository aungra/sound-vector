#!/usr/bin/env python3
"""Screen source-isolated Ambient/Drone/Noise heads on top of v99."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
SHARED_PATH = Path(__file__).with_name(
    "genre-unknown80-independent-electronic-ablation.py"
)
DEFAULT_OVERLAY_MANIFEST = (
    TRAINING / "unknown80-independent-texture-candidate-manifest.json"
)
DEFAULT_OVERLAY_LIBROSA = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-independent-texture-librosa.json"
)
DEFAULT_REPORT = TRAINING / "unknown80-independent-texture-ablation.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-independent-texture-ablation.md"
GROUPS = (
    ("アンビエント", "ドローン"),
    ("ドローン", "ノイズミュージック"),
    ("アンビエント", "ノイズミュージック"),
    ("アンビエント", "ドローン", "ノイズミュージック"),
)


def load_shared():
    spec = importlib.util.spec_from_file_location("texture_ablation_shared", SHARED_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SHARED = load_shared()
rerank_group = SHARED.rerank_group


def render(report):
    lines = [
        "# Unknown80 independent texture ablation", "",
        "All candidates are evaluated on top of the fold-reconstructed v99 stack.",
        "", "| candidate | Top1 | balanced | minimum source | Top3 | + / - |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for name in report["ranking"][:24]:
        score = report["candidates"][name]
        lines.append(
            f"| {name} | {score['top1Accuracy']:.2f}% | "
            f"{score['balancedTop1']:.2f}% | "
            f"{score['minimumSourceTop1']:.2f}% | "
            f"{score['top3Accuracy']:.2f}% | "
            f"{score.get('improved', 0)} / {score.get('harmed', 0)} |"
        )
    lines.extend(["", f"Decision: **{report['decision']}**", ""])
    return "\n".join(lines)


def run(args):
    previous_groups = SHARED.GROUPS
    try:
        SHARED.GROUPS = GROUPS
        report = SHARED.run(args)
    finally:
        SHARED.GROUPS = previous_groups
    report["objective"] = (
        "Test full-track independent Ambient/Drone/Noise overlays against "
        "the source-heldout v99 stack."
    )
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=SHARED.DEFAULT_OOF)
    parser.add_argument("--formal-librosa", type=Path, action="append", default=[])
    parser.add_argument(
        "--black-manifest", type=Path, default=SHARED.DEFAULT_BLACK_MANIFEST
    )
    parser.add_argument(
        "--black-librosa", type=Path, default=SHARED.DEFAULT_BLACK_LIBROSA
    )
    parser.add_argument(
        "--overlay-manifest", type=Path, default=DEFAULT_OVERLAY_MANIFEST
    )
    parser.add_argument(
        "--overlay-librosa", type=Path, default=DEFAULT_OVERLAY_LIBROSA
    )
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    if not args.formal_librosa:
        args.formal_librosa = [SHARED.DEFAULT_FORMAL_LIBROSA]
    report = run(args)
    print(json.dumps({
        "decision": report["decision"],
        "incumbent": report["incumbent"],
        "topCandidates": [
            {"name": name, **report["candidates"][name]}
            for name in report["ranking"][:12]
        ],
        "promotionScreen": report["promotionScreen"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
