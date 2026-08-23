#!/usr/bin/env python3
"""Screen the Rock/Metal boundary on the source-heldout v100 stack."""

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
DEFAULT_REPORT = TRAINING / "unknown80-independent-guitar-ablation.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-independent-guitar-ablation.md"
GROUPS = (("ロック", "メタル"),)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def render(report):
    lines = [
        "# Unknown80 independent guitar ablation", "",
        (
            "Rock/Metal is evaluated on the fold-reconstructed v99 stack. "
            "Its Top3 applicability cannot overlap the disjoint Techno/Trance "
            "member added by v100, so the measured delta is also the v100 delta."
        ),
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
    shared = load_module(SHARED_PATH, "guitar_ablation_shared")
    shared.GROUPS = GROUPS
    report = shared.run(args)
    report["objective"] = (
        "Test a source-heldout audio-only Rock/Metal boundary head on v100."
    )
    report["policy"]["v100DeltaEquivalent"] = True
    report["policy"]["equivalenceReason"] = (
        "Disjoint two-label Top3 applicability cannot overlap Techno/Trance."
    )
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def main():
    shared = load_module(SHARED_PATH, "guitar_ablation_defaults")
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=shared.DEFAULT_OOF)
    parser.add_argument("--formal-librosa", type=Path, action="append", default=[])
    parser.add_argument("--black-manifest", type=Path, default=shared.DEFAULT_BLACK_MANIFEST)
    parser.add_argument("--black-librosa", type=Path, default=shared.DEFAULT_BLACK_LIBROSA)
    parser.add_argument("--overlay-manifest", type=Path, default=shared.DEFAULT_OVERLAY_MANIFEST)
    parser.add_argument("--overlay-librosa", type=Path, default=shared.DEFAULT_OVERLAY_LIBROSA)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    if not args.formal_librosa:
        args.formal_librosa = [shared.DEFAULT_FORMAL_LIBROSA]
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
