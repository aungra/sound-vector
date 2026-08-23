#!/usr/bin/env python3
"""Report v103 on all OOF rows and a known-weak-label-excluded subset."""

from __future__ import annotations

import argparse
import importlib.util
import json
from collections import Counter
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
HELPER_PATH = Path(__file__).with_name("genre-unknown80-v103-mulan-summary-screen.py")
DEFAULT_WEAK_MANIFEST = TRAINING / "unknown80-independent-electronic-candidate-manifest.json"
DEFAULT_REPORT = TRAINING / "unknown80-v103-explicit-label-subset-audit.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-v103-explicit-label-subset-audit.md"
KNOWN_WEAK_ORIGINS = {"maest-weak-source-plan.json"}


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def source_key(row):
    return f"{row['sourceType']}:{row['sourceUrl']}"


def known_weak_keys(manifest_path, origins=KNOWN_WEAK_ORIGINS):
    payload = json.loads(Path(manifest_path).read_text())
    return {
        source_key(row): {
            "genre": row.get("genre", ""),
            "source": row.get("source", ""),
            "candidateOrigin": row.get("candidateOrigin", ""),
            "referenceUrl": row.get("referenceUrl", ""),
        }
        for row in payload.get("items", [])
        if row.get("candidateOrigin") in origins
    }


def label_recalls(actual, scores, labels):
    label_array = np.asarray(labels)
    predicted = label_array[np.argmax(scores, axis=1)]
    output = {}
    for label in sorted(set(actual)):
        mask = actual == label
        output[str(label)] = {
            "rows": int(np.sum(mask)),
            "top1Recall": round(float(np.mean(predicted[mask] == actual[mask])) * 100, 2),
        }
    return output


def render(report):
    all_rows = report["allRows"]
    strict = report["knownWeakExcludedSubset"]
    return "\n".join([
        "# Unknown80 v103 explicit-label subset audit", "",
        "The production baseline remains the complete fixed OOF. The subset is diagnostic only and must not be reported as an engine gain.",
        "", "| scope | rows | Top1 | balanced | minimum source | Top3 |",
        "|---|---:|---:|---:|---:|---:|",
        f"| fixed OOF | {all_rows['rows']} | {all_rows['metrics']['top1Accuracy']:.2f}% | {all_rows['metrics']['balancedTop1']:.2f}% | {all_rows['metrics']['minimumSourceTop1']:.2f}% | {all_rows['metrics']['top3Accuracy']:.2f}% |",
        f"| known weak labels excluded | {strict['rows']} | {strict['metrics']['top1Accuracy']:.2f}% | {strict['metrics']['balancedTop1']:.2f}% | {strict['metrics']['minimumSourceTop1']:.2f}% | {strict['metrics']['top3Accuracy']:.2f}% |",
        "", f"Known weak rows excluded: {report['excluded']['rows']}",
        "", "Decision: keep v103 unchanged; audit or replace weak labels before using them in future model selection.", "",
    ])


def run(args):
    helper = load_module(HELPER_PATH, "explicit_subset_v103_helper")
    macro = load_module(helper.MACRO_PATH, "explicit_subset_macro")
    global_screen = load_module(macro.GLOBAL_PATH, "explicit_subset_global")
    stack = load_module(global_screen.STACK_PATH, "explicit_subset_stack")
    black = load_module(stack.BLACK_PATH, "explicit_subset_black")
    electronic = load_module(stack.ELECTRONIC_PATH, "explicit_subset_electronic")
    payload = np.load(args.oof)
    actual = payload["actual"]
    sources = payload["sources"]
    source_keys = np.asarray([str(value) for value in payload["sourceKeys"]])
    labels = list(payload["labels"])
    v103, held_sources, all_metrics, conflicts = helper.build_v103(
        args, macro, global_screen, stack, black, electronic, payload
    )
    weak = known_weak_keys(args.weak_manifest)
    excluded_mask = np.isin(source_keys, list(weak))
    strict_mask = ~excluded_mask
    strict_metrics = black.metric(
        actual[strict_mask], v103[strict_mask], labels, sources[strict_mask]
    )
    predicted = np.asarray(labels)[np.argmax(v103, axis=1)]
    excluded_rows = []
    for index in np.flatnonzero(excluded_mask):
        evidence = weak[source_keys[index]]
        excluded_rows.append({
            "sourceKey": source_keys[index],
            "actual": str(actual[index]),
            "predicted": str(predicted[index]),
            "correct": bool(predicted[index] == actual[index]),
            **evidence,
        })
    report = {
        "objective": "Separate known weak-label sensitivity from engine accuracy.",
        "policy": {
            "productionBaselineReplaced": False,
            "engineGainClaimedFromRowRemoval": False,
            "sealedFinalHoldoutUsed": False,
            "knownWeakOrigins": sorted(KNOWN_WEAK_ORIGINS),
        },
        "allRows": {
            "rows": len(actual),
            "metrics": all_metrics,
            "labelRecalls": label_recalls(actual, v103, labels),
        },
        "knownWeakExcludedSubset": {
            "rows": int(np.sum(strict_mask)),
            "metrics": strict_metrics,
            "labelRecalls": label_recalls(actual[strict_mask], v103[strict_mask], labels),
        },
        "excluded": {
            "rows": int(np.sum(excluded_mask)),
            "bySource": dict(Counter(row["source"] for row in excluded_rows)),
            "byGenre": dict(Counter(row["actual"] for row in excluded_rows)),
            "correct": sum(row["correct"] for row in excluded_rows),
            "items": excluded_rows,
        },
        "heldOutSources": [str(value) for value in held_sources],
        "v103ConflictingRowsLeftAtV102": conflicts,
        "decision": "diagnostic-only-keep-v103",
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def main():
    helper = load_module(HELPER_PATH, "explicit_subset_defaults")
    macro = load_module(helper.MACRO_PATH, "explicit_subset_macro_defaults")
    global_screen = load_module(macro.GLOBAL_PATH, "explicit_subset_global_defaults")
    stack = load_module(global_screen.STACK_PATH, "explicit_subset_stack_defaults")
    electronic = load_module(stack.ELECTRONIC_PATH, "explicit_subset_electronic_defaults")
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=electronic.DEFAULT_OOF)
    parser.add_argument("--formal-librosa", type=Path, action="append", default=[])
    parser.add_argument("--black-manifest", type=Path, default=electronic.DEFAULT_BLACK_MANIFEST)
    parser.add_argument("--black-librosa", type=Path, default=electronic.DEFAULT_BLACK_LIBROSA)
    parser.add_argument("--electronic-manifest", type=Path, default=electronic.DEFAULT_OVERLAY_MANIFEST)
    parser.add_argument("--electronic-librosa", type=Path, default=electronic.DEFAULT_OVERLAY_LIBROSA)
    parser.add_argument("--texture-manifest", type=Path, default=macro.DEFAULT_TEXTURE_MANIFEST)
    parser.add_argument("--texture-librosa", type=Path, default=macro.DEFAULT_TEXTURE_LIBROSA)
    parser.add_argument("--weak-manifest", type=Path, default=DEFAULT_WEAK_MANIFEST)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    if not args.formal_librosa:
        args.formal_librosa = [electronic.DEFAULT_FORMAL_LIBROSA]
    report = run(args)
    print(json.dumps({
        "allRows": report["allRows"]["metrics"],
        "knownWeakExcludedSubset": report["knownWeakExcludedSubset"]["metrics"],
        "excluded": report["excluded"],
        "decision": report["decision"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
