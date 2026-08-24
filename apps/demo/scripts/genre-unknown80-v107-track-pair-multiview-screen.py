#!/usr/bin/env python3
"""Select the safest raw temporal feature view independently per boundary."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
PAIR_PATH = Path(__file__).with_name("genre-unknown80-v107-track-pair-screen.py")
SHARED_PATH = Path(__file__).with_name("genre-unknown80-v107-track-reranker-screen.py")
DEFAULT_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "runtime-track-segment-features-v3_0.sqlite3"
)
DEFAULT_REPORT = TRAINING / "unknown80-v107-track-pair-multiview-screen.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-v107-track-pair-multiview-screen.md"
VIEWS = ("rhythm", "effnet", "full", "librosa")


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def screen_view(args, view, shared, pair_module, payload, v107, labels, held_sources, baseline, black):
    view_args = argparse.Namespace(cache=args.cache, view=view)
    items = shared.load_cached_items(view_args, payload, labels)
    for item in items:
        item["baseScores"] = np.asarray(v107[item["index"]], dtype=np.float64)
        order = np.argsort(-item["baseScores"], kind="stable")
        item["top2Labels"] = (labels[int(order[0])], labels[int(order[1])])
    results = []
    for pair_index, pair in enumerate(pair_module.PAIRS):
        proposal = np.asarray(v107, dtype=np.float64).copy()
        changed_indexes = set()
        folds = []
        for fold_index, held_source in enumerate(held_sources):
            train = [
                item for item in items
                if item["source"] != held_source and item["trainingEligible"]
            ]
            validation = pair_module.routed_items(
                [item for item in items if item["source"] == held_source], pair,
            )
            config, inner = pair_module.choose_inner_config(
                train, pair, labels,
                3201001 + pair_index * 10000 + fold_index * 100,
            )
            model = pair_module.fit_pair(
                train, pair,
                3201501 + pair_index * 10000 + fold_index * 100,
            )
            if model is None or not validation:
                continue
            probabilities = pair_module.pair_probabilities(model, validation, pair)
            base = np.asarray([item["baseScores"] for item in validation])
            candidate, changed = pair_module.apply_pair(
                base, probabilities, pair, labels, config,
            )
            indexes = np.asarray([item["index"] for item in validation], dtype=np.int64)
            proposal[indexes] = candidate
            changed_indexes.update(int(value) for value in indexes[changed])
            folds.append({
                "heldOutSource": str(held_source),
                "trainingRows": len(pair_module.pair_training_items(train, pair)),
                "routedRows": len(validation),
                "selectedConfig": config,
                "innerSelection": inner,
                "changedRows": int(np.sum(changed)),
            })
        metric = black.compare_output(
            proposal, v107, payload["actual"], labels, payload["sources"],
        )
        passed = (
            metric["top1Accuracy"] > baseline["top1Accuracy"]
            and metric["balancedTop1"] >= baseline["balancedTop1"]
            and metric["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
            and metric["top3Accuracy"] >= baseline["top3Accuracy"]
            and metric["improved"] > metric["harmed"]
        )
        results.append({
            "view": view,
            "pair": pair,
            "proposal": proposal,
            "changedIndexes": changed_indexes,
            "metric": metric,
            "passed": passed,
            "folds": folds,
        })
    return items, results


def render(report):
    baseline = report["baseline"]
    candidate = report["candidate"]
    lines = [
        "# Unknown80 v107 temporal pair multiview screen", "",
        "| model | Top1 | balanced | minimum source | Top3 | + / - |",
        "|---|---:|---:|---:|---:|---:|",
        f"| v107 | {baseline['top1Accuracy']:.2f}% | {baseline['balancedTop1']:.2f}% | {baseline['minimumSourceTop1']:.2f}% | {baseline['top3Accuracy']:.2f}% | - |",
        f"| multiview | {candidate['top1Accuracy']:.2f}% | {candidate['balancedTop1']:.2f}% | {candidate['minimumSourceTop1']:.2f}% | {candidate['top3Accuracy']:.2f}% | {candidate['improved']} / {candidate['harmed']} |",
        "", "| pair | selected view | changed |",
        "|---|---|---:|",
    ]
    for item in report["selection"]:
        lines.append(f"| {item['pair']} | {item.get('selectedView') or '-'} | {item['changedRows']} |")
    lines.extend(["", f"Decision: **{report['decision']}**", ""])
    return "\n".join(lines)


def run(args):
    shared = load_module(SHARED_PATH, "track_multiview_shared")
    pair_module = load_module(PAIR_PATH, "track_multiview_pair")
    _source, black, payload, v107, held_sources, baseline = shared.build_v107()
    labels = list(payload["labels"])
    by_pair = {pair: [] for pair in pair_module.PAIRS}
    cached_rows = 0
    for view in VIEWS:
        items, results = screen_view(
            args, view, shared, pair_module, payload, v107, labels,
            held_sources, baseline, black,
        )
        cached_rows = max(cached_rows, len(items))
        for result in results:
            by_pair[result["pair"]].append(result)
    output = np.asarray(v107, dtype=np.float64).copy()
    used_indexes = set()
    selection = []
    for pair in pair_module.PAIRS:
        passed = [result for result in by_pair[pair] if result["passed"]]
        passed.sort(key=lambda result: (
            result["metric"]["top1Accuracy"],
            result["metric"]["balancedTop1"],
            result["metric"]["improved"] - result["metric"]["harmed"],
            result["metric"]["minimumSourceTop1"],
        ), reverse=True)
        selected = passed[0] if passed else None
        accepted = set()
        conflicts = set()
        if selected:
            conflicts = selected["changedIndexes"] & used_indexes
            accepted = selected["changedIndexes"] - conflicts
            if accepted:
                indexes = np.asarray(sorted(accepted), dtype=np.int64)
                output[indexes] = selected["proposal"][indexes]
                used_indexes.update(accepted)
        selection.append({
            "pair": pair_module.pair_name(pair),
            "selectedView": selected["view"] if selected else None,
            "changedRows": len(accepted),
            "conflicts": len(conflicts),
            "selectedMetric": selected["metric"] if selected else None,
            "views": [
                {
                    "view": result["view"], "passed": result["passed"],
                    "changedRows": len(result["changedIndexes"]),
                    "metric": result["metric"],
                }
                for result in by_pair[pair]
            ],
        })
    candidate = black.compare_output(
        output, v107, payload["actual"], labels, payload["sources"],
    )
    top3_preserved = all(
        set(left) == set(right)
        for left, right in zip(np.argsort(-v107, axis=1)[:, :3], np.argsort(-output, axis=1)[:, :3])
    )
    passed = (
        candidate["top1Accuracy"] > baseline["top1Accuracy"]
        and candidate["balancedTop1"] >= baseline["balancedTop1"]
        and candidate["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and candidate["top3Accuracy"] >= baseline["top3Accuracy"]
        and candidate["improved"] >= candidate["harmed"]
        and top3_preserved
    )
    report = {
        "objective": "Select production-input temporal views per v107 boundary without source leakage.",
        "policy": {
            "metadataUsedAtInference": False,
            "sealedFinalHoldoutUsed": False,
            "matchingProviderExcludedFromOuterFold": True,
            "pairViewSelectedOnFixedSourceHeldoutOOF": True,
            "fittedGenreHeadUsedAsTemporalInput": False,
            "top3CandidateSetChanged": not top3_preserved,
            "productionModelUpdated": False,
        },
        "dataset": {
            "oofRows": len(payload["actual"]), "cachedRows": cached_rows,
            "views": list(VIEWS),
        },
        "baseline": baseline,
        "candidate": candidate,
        "selection": selection,
        "decision": "continue-v108-production-gates" if passed else "reject-multiview-candidate",
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    report = run(args)
    print(json.dumps({
        "dataset": report["dataset"], "baseline": report["baseline"],
        "candidate": report["candidate"],
        "selected": [item for item in report["selection"] if item["selectedView"]],
        "decision": report["decision"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
