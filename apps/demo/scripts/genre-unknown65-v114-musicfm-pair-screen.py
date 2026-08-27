#!/usr/bin/env python3
"""Screen expanded MusicFM pairs after the frozen v114 source-heldout output."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
SCRIPT_DIR = Path(__file__).parent
AUX_PATH = SCRIPT_DIR / "genre-unknown65-independent-aux-screen.py"
SCREEN_PATH = SCRIPT_DIR / "genre-unknown80-v113-musicfm-top3-screen.py"
CACHE = Path("/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training")
DEFAULT_CACHE_10 = CACHE / "musicfm-msd-10s-pilot-cache.json"
DEFAULT_CACHE_30 = CACHE / "musicfm-house-boundary-30s-cache.json"
DEFAULT_REPORT = ROOT / "genre-training/unknown65-v114-musicfm-pair-screen.json"
VIEWS = ("30s-embedding", "30s-moment-mean", "30s-joint-mean")
KINDS = ("logistic", "extra-trees")
PAIRS = (
    ("ダブ", "レゲエ"),
    ("ハウス", "テクノ"),
    ("ディープ・ハウス", "ハウス"),
    ("テクノ", "トランス"),
    ("メタル", "ロック"),
    ("ディープ・ハウス", "テクノ"),
    ("ファンク", "ロック"),
    ("ブルース", "ロック"),
    ("アンビエント", "ドローン"),
    ("アンビエント", "クラシック音楽"),
    ("クラシック音楽", "フォーク"),
    ("ブルース", "フォーク"),
    ("ジャズ", "ブルース"),
    ("ジャズ", "ファンク"),
    ("ダブステップ", "ドラムンベース"),
    ("テクノ", "ドラムンベース"),
    ("アンビエント", "ダブ"),
    ("フォーク", "ラテン"),
    ("クラシック音楽", "オペラ"),
    ("パンク", "ロック"),
    ("ハードコア", "メタル"),
    ("クラシック音楽", "ジャズ"),
    ("ジャズ", "ロック"),
)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def compact(result):
    best = result["best"]
    return {
        "pair": list(result["pair"]), "view": result["view"],
        "modelKind": result["modelKind"], "rows": result["rows"],
        "sourceSupport": result["sourceSupport"],
        "config": best["config"], "sourceHeldout": best["metric"],
        "sourceHeldoutChangedRows": best["changedRows"],
        "finalFitDiagnostic": result["finalFitDiagnostic"],
        "finalFitChangedRows": result["finalFitChangedRows"],
        "passed": best["passed"],
    }


def pair_oof_output(screen, items, pair, kind, labels, held_sources,
                    routing_base, current, config, seed):
    records = []
    for fold_index, held_source in enumerate(held_sources):
        training = [
            item for item in items
            if item["source"] != held_source and item["actual"] in pair
            and item["trainingEligible"]
        ]
        validation = []
        for item in items:
            if item["source"] != held_source:
                continue
            order = np.argsort(-routing_base[item["index"]], kind="stable")[:3]
            if set(pair).issubset({labels[int(index)] for index in order}):
                validation.append(item)
        model = screen.fit_model(training, kind, seed + fold_index * 100)
        if model is None or not validation:
            continue
        learned = screen.pair_probabilities(model, validation, pair)
        records.extend(
            {"item": item, "learned": score}
            for item, score in zip(validation, learned)
        )
    output = np.asarray(current, dtype=np.float64).copy()
    indexes = np.asarray([record["item"]["index"] for record in records], dtype=np.int64)
    if len(indexes):
        learned = np.asarray([record["learned"] for record in records])
        candidate, changed = screen.apply_pair(
            output[indexes], learned, pair, labels, config,
        )
        output[indexes] = candidate
        return output, int(np.sum(changed))
    return output, 0


def run(args):
    aux = load_module(AUX_PATH, "unknown65_v114_pair_aux")
    screen = load_module(SCREEN_PATH, "unknown65_v114_pair_screen")
    payload, base, v114 = aux.reconstruct_v114(args)
    residual = screen.load_module(screen.RESIDUAL_PATH, "unknown65_v114_pair_residual")
    v113 = screen.load_module(screen.V113_PATH, "unknown65_v114_pair_v113")
    black, _payload, _old_base, held_sources, _old_metric = screen.reconstruct_v113(
        residual, v113,
    )
    labels = list(payload["labels"])
    baseline = black.metric(payload["actual"], base, labels, payload["sources"])
    item_args = argparse.Namespace(
        cache_10=args.musicfm_10, cache_30=args.musicfm_30,
    )
    items_by_view = screen.load_items(item_args, payload)
    results = []
    for view_index, view in enumerate(VIEWS):
        for pair_index, pair in enumerate(PAIRS):
            for kind_index, kind in enumerate(KINDS):
                seed = (
                    16500001 + view_index * 100000 + pair_index * 10000
                    + kind_index * 1000
                )
                result = screen.screen_pair(
                    items_by_view[view], pair, view, kind, labels, held_sources,
                    base, baseline, black, payload,
                    seed,
                )
                if result is not None:
                    result["seed"] = seed
                    results.append(result)
    results.sort(key=lambda item: (
        item["best"]["passed"], item["best"]["metric"]["top1Accuracy"],
        item["best"]["metric"]["balancedTop1"],
        item["best"]["metric"]["minimumSourceTop1"],
    ), reverse=True)
    passed = [item for item in results if item["best"]["passed"]]
    current = base.copy()
    current_metric = baseline
    chain = []
    used_pairs = set()
    for item in passed:
        pair_key = tuple(sorted(item["pair"]))
        if pair_key in used_pairs:
            continue
        candidate, changed = pair_oof_output(
            screen, items_by_view[item["view"]], tuple(item["pair"]),
            item["modelKind"], labels, held_sources, base, current,
            item["best"]["config"], item["seed"],
        )
        comparison = black.compare_output(
            candidate, current, payload["actual"], labels, payload["sources"],
        )
        overall = black.metric(
            payload["actual"], candidate, labels, payload["sources"],
        )
        accepted = (
            comparison["improved"] > 0 and comparison["harmed"] == 0
            and overall["top1Accuracy"] > current_metric["top1Accuracy"]
            and overall["balancedTop1"] >= current_metric["balancedTop1"]
            and overall["minimumSourceTop1"] >= current_metric["minimumSourceTop1"]
            and overall["top3Accuracy"] >= current_metric["top3Accuracy"]
        )
        chain.append({
            "pair": list(item["pair"]), "view": item["view"],
            "modelKind": item["modelKind"], "changedRows": changed,
            "comparison": comparison, "metric": overall, "accepted": accepted,
        })
        if accepted:
            current, current_metric = candidate, overall
            used_pairs.add(pair_key)
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "objective": "Screen expanded MusicFM boundaries after frozen v114.",
        "policy": {
            "metadataUsedAtInference": False, "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "matchingProviderExcludedFromOuterFold": True,
            "top3CandidateSetChanged": False,
            "finalFitDiagnosticIsNotUnknownSourceAccuracy": True,
            "productionModelUpdated": False,
        },
        "dataset": {
            "oofRows": len(payload["actual"]),
            "rowsByView": {view: len(items_by_view[view]) for view in VIEWS},
            "pairs": [list(pair) for pair in PAIRS],
            "sources": sorted(
                source for source, count in Counter(payload["sources"]).items()
                if count >= 8
            ),
        },
        "v114Diagnostics": v114, "baseline": baseline,
        "passed": [compact(item) for item in passed],
        "results": [compact(item) for item in results],
        "greedyChain": {
            "steps": chain, "selectedPairs": [list(pair) for pair in sorted(used_pairs)],
            "metric": current_metric,
        },
        "decision": "inspect-passed-candidates" if passed else "reject-expanded-pairs",
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--musicfm-10", "--cache-10", dest="musicfm_10", type=Path, default=DEFAULT_CACHE_10)
    parser.add_argument("--musicfm-30", "--cache-30", dest="musicfm_30", type=Path, default=DEFAULT_CACHE_30)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    report = run(args)
    print(json.dumps({
        "baseline": report["baseline"], "passed": report["passed"],
        "decision": report["decision"], "report": str(args.report),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
