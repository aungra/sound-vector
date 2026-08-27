#!/usr/bin/env python3
"""Screen audio-only pair rerankers on the fixed 61.50% source-heldout OOF."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import sys
import warnings
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.decomposition import PCA
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC


warnings.filterwarnings(
    "ignore", message="The `probability` parameter was deprecated", category=FutureWarning,
)


ROOT = Path(__file__).resolve().parents[3]
SCRIPT_DIR = Path(__file__).parent
CACHE_ROOT = Path("/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training")
OOF = CACHE_ROOT / "unknown65-v114-musicfm-phase1-oof.npz"
PAIR_PATH = SCRIPT_DIR / "genre-unknown80-v113-musicfm-top3-screen.py"
FEATURE_PATH = SCRIPT_DIR / "genre-unknown65-frozen-representation-screen.py"
PAIRS = (
    ("ダブ", "レゲエ"), ("ハウス", "テクノ"),
    ("ディープ・ハウス", "ハウス"), ("テクノ", "トランス"),
    ("メタル", "ロック"), ("ディープ・ハウス", "テクノ"),
    ("ファンク", "ロック"), ("ブルース", "ロック"),
    ("アンビエント", "ドローン"), ("アンビエント", "クラシック音楽"),
    ("クラシック音楽", "フォーク"), ("ブルース", "フォーク"),
    ("ジャズ", "ブルース"), ("ジャズ", "ファンク"),
    ("ダブステップ", "ドラムンベース"), ("テクノ", "ドラムンベース"),
    ("アンビエント", "ダブ"), ("フォーク", "ラテン"),
    ("クラシック音楽", "オペラ"), ("パンク", "ロック"),
    ("ハードコア", "メタル"), ("クラシック音楽", "ジャズ"),
    ("ジャズ", "ロック"), ("ディスコ", "ファンク"),
    ("ディスコ", "ソウルミュージック"), ("ヒップホップ", "トラップ"),
    ("ドローン", "ノイズミュージック"), ("ハウス", "トランス"),
    ("アンビエント", "ジャズ"), ("ファンク", "ソウルミュージック"),
    ("メタル", "パンク"), ("フォーク", "ロック"),
    ("ダブステップ", "テクノ"), ("ドラムンベース", "ハウス"),
    ("ドラムンベース", "トランス"), ("ダブステップ", "トランス"),
    ("アンビエント", "テクノ"), ("ハードコア", "テクノ"),
    ("ダブステップ", "ヒップホップ"), ("ハウス", "ヒップホップ"),
    ("パンク", "レゲエ"), ("ジャズ", "ソウルミュージック"),
    ("ラテン", "ロック"), ("アンビエント", "ディープ・ハウス"),
    ("ダブ", "ヒップホップ"), ("ブルース", "ソウルミュージック"),
    ("レゲエ", "ロック"), ("アンビエント", "ドラムンベース"),
    ("ジャズ", "ラテン"), ("ドラムンベース", "ヒップホップ"),
    ("ハードコア", "ロック"), ("ダブ", "ダブステップ"),
    ("ディスコ", "ハウス"), ("テクノ", "ノイズミュージック"),
    ("フォーク", "ジャズ"),
)
PRODUCTION_LICENSES = {
    "CC-BY", "CC-BY-SA", "CC0", "Public Domain",
    "CC-BY-SA-3.0", "CC-BY-SA-2.0", "CC-BY-3.0",
}


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
        "sourceSupport": result["sourceSupport"], "config": best["config"],
        "sourceHeldout": best["metric"], "changedRows": best["changedRows"],
        "passed": best["passed"],
    }


def hierarchy_map():
    text = (ROOT / "apps/demo/genre-hierarchy.js").read_text()
    return {
        detail: parent
        for detail, parent in re.findall(
            r'^\s*\["([^"]+)",\s*"[^"]+",\s*"([^"]+)"', text, re.M,
        )
    }


def overlay_source(row):
    dataset = str(row.get("datasetName") or "")
    distribution = str(row.get("distributionSource") or "")
    family = str(row.get("sourceFamily") or "")
    if "FMA" in dataset or family == "FMA":
        return "FMA"
    if "Jamendo" in dataset:
        return "Jamendo"
    if "Internet Archive" in distribution or "Internet Archive" in dataset:
        return "Internet Archive"
    if "Wikimedia" in distribution or "Wikimedia" in dataset:
        return "Wikimedia Commons"
    if "ccMixter" in distribution or "ccMixter" in dataset:
        return "ccMixter"
    return family or distribution or dataset


def load_overlay(manifests, cache, cache_format, features, payload):
    parents = hierarchy_map()
    evaluation_keys = {str(key) for key in payload["sourceKeys"]}
    result = []
    seen = set()
    for manifest in manifests:
        document = json.loads(manifest.read_text())
        for row in document.get("items") or []:
            path = row.get("filePath")
            key = f"cc-dataset:{path}" if path else ""
            detail = str(row.get("detailTarget") or "")
            label = parents.get(detail)
            if (
                not key or key in seen or key in evaluation_keys or key not in cache
                or not label or not row.get("singleTargetEligible")
                or str(row.get("license") or "") not in PRODUCTION_LICENSES
                or str(row.get("trainingUsage") or "") not in ("", "production-training")
            ):
                continue
            views = features.feature_views(cache[key], 0, cache_format)
            if not views:
                continue
            seen.add(key)
            result.append({
                "sourceKey": key, "actual": label, "source": overlay_source(row),
                "trainingEligible": True, "evaluationEligible": False,
                "views": views,
            })
    return result


def load_items(cache_path, cache_format, payload, features, include_base_scores,
               overlay_manifests):
    cache = json.loads(cache_path.read_text())
    rows = [
        features.feature_views(cache.get(str(key)), 0, cache_format)
        for key in payload["sourceKeys"]
    ]
    views = sorted({name for row in rows for name in row})
    result = {view: [] for view in views}
    for index, row in enumerate(rows):
        for view, vector in row.items():
            if include_base_scores:
                probabilities = np.maximum(payload["selectedScores"][index], 1e-8)
                vector = np.concatenate([vector, np.log(probabilities)])
            result[view].append({
                "index": index, "sourceKey": str(payload["sourceKeys"][index]),
                "actual": str(payload["actual"][index]),
                "source": str(payload["sources"][index]),
                "trainingEligible": bool(payload["trainingEligible"][index]),
                "evaluationEligible": True,
                "features": vector,
            })
    overlay = load_overlay(
        overlay_manifests, cache, cache_format, features, payload,
    )
    for item in overlay:
        for view, vector in item["views"].items():
            if view not in result:
                continue
            result[view].append({**item, "features": vector})
    return result, overlay


def pair_oof_output(screen, items, pair, kind, labels, held_sources,
                    routing_base, current, config, seed, svm_c):
    records = []
    for fold_index, held_source in enumerate(held_sources):
        training = [
            item for item in items
            if item["source"] != held_source and item["actual"] in pair
            and item["trainingEligible"]
        ]
        validation = []
        for item in items:
            if item["source"] != held_source or not item.get("evaluationEligible"):
                continue
            order = np.argsort(-routing_base[item["index"]], kind="stable")[:3]
            if set(pair).issubset({labels[int(index)] for index in order}):
                validation.append(item)
        model = fit_pair_model(
            screen, training, kind, seed + fold_index * 100, svm_c,
        )
        if model is None or not validation:
            continue
        learned = screen.pair_probabilities(model, validation, pair)
        records.extend(zip(validation, learned))
    output = np.asarray(current, dtype=np.float64).copy()
    indexes = np.asarray([item["index"] for item, _score in records], dtype=np.int64)
    if len(indexes):
        learned = np.asarray([score for _item, score in records])
        candidate, changed = screen.apply_pair(
            output[indexes], learned, pair, labels, config,
        )
        output[indexes] = candidate
        return output, int(np.sum(changed))
    return output, 0


def fit_pair_model(screen, items, kind, seed, svm_c=1.0):
    if kind != "svm-rbf":
        return screen.fit_model(items, kind, seed)
    labels = sorted({item["actual"] for item in items})
    if len(labels) < 2:
        return None
    matrix = np.asarray([item["features"] for item in items], dtype=np.float64)
    actual = np.asarray([item["actual"] for item in items], dtype=object)
    counts = Counter((item["actual"], item["source"]) for item in items)
    weights = np.asarray([
        1.0 / counts[(item["actual"], item["source"])] for item in items
    ], dtype=np.float64)
    weights /= max(float(weights.mean()), 1e-12)
    model = make_pipeline(
        StandardScaler(),
        PCA(
            n_components=max(2, min(48, len(items) - len(labels), matrix.shape[1])),
            whiten=True, random_state=seed,
        ),
        SVC(
            C=svm_c, kernel="rbf", gamma="scale", probability=True,
            class_weight="balanced", random_state=seed,
        ),
    )
    model.fit(matrix, actual, svc__sample_weight=weights)
    return model


def screen_pair(items, pair, view, kind, labels, held_sources, base,
                baseline, features, payload, screen, seed, max_source_drop,
                svm_c):
    support = {
        label: sorted({item["source"] for item in items if item["actual"] == label})
        for label in pair
    }
    if any(len(sources) < 2 for sources in support.values()):
        return None
    records = []
    for fold_index, held_source in enumerate(held_sources):
        training = [
            item for item in items
            if item["source"] != held_source and item["actual"] in pair
            and item["trainingEligible"]
        ]
        validation = []
        for item in items:
            if item["source"] != held_source or not item.get("evaluationEligible"):
                continue
            order = np.argsort(-base[item["index"]], kind="stable")[:3]
            if set(pair).issubset({labels[int(index)] for index in order}):
                validation.append(item)
        model = fit_pair_model(
            screen, training, kind, seed + fold_index * 100, svm_c,
        )
        if model is None or not validation:
            continue
        learned = screen.pair_probabilities(model, validation, pair)
        records.extend(zip(validation, learned))
    indexes = np.asarray([item["index"] for item, _score in records], dtype=np.int64)
    learned = np.asarray([score for _item, score in records])
    if not len(indexes):
        return None
    ranking = []
    for weight in screen.WEIGHTS:
        for confidence in screen.CONFIDENCE_FLOORS:
            config = {"weight": weight, "confidenceFloor": confidence, "routeTopK": 3}
            output = np.asarray(base, dtype=np.float64).copy()
            candidate, changed = screen.apply_pair(
                output[indexes], learned, pair, labels, config,
            )
            output[indexes] = candidate
            result = features.compare(
                output, base, payload["actual"], labels, payload["sources"],
            )
            passed = (
                result["top1Accuracy"] > baseline["top1Accuracy"]
                and result["balancedTop1"] >= baseline["balancedTop1"]
                and result["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
                and result["top3Accuracy"] >= baseline["top3Accuracy"]
                and result["improved"] > result["harmed"]
                and result["maximumSourceDrop"] >= max_source_drop
            )
            ranking.append({
                "config": config, "metric": result,
                "changedRows": int(np.sum(changed)), "passed": passed,
            })
    ranking.sort(key=lambda item: (
        item["passed"], item["metric"]["top1Accuracy"],
        item["metric"]["balancedTop1"], item["metric"]["minimumSourceTop1"],
    ), reverse=True)
    return {
        "pair": pair, "view": view, "modelKind": kind, "rows": len(items),
        "sourceSupport": support, "best": ranking[0],
    }


def run(args):
    if args.include_base_scores and args.overlay_manifest:
        raise ValueError(
            "training-only overlays do not have leakage-safe baseline OOF scores"
        )
    screen = load_module(PAIR_PATH, "unknown65_frozen_pair_base")
    features = load_module(FEATURE_PATH, "unknown65_frozen_pair_features")
    loaded = np.load(args.oof)
    payload = {key: loaded[key] for key in loaded.files}
    labels = [str(value) for value in payload["labels"]]
    base = payload["selectedScores"].astype(np.float64)
    baseline = features.metric(payload["actual"], base, labels, payload["sources"])
    features.compare_output = features.compare
    held_sources = sorted(
        source for source, count in Counter(payload["sources"]).items() if count >= 8
    )
    items_by_view, overlay = load_items(
        args.cache, args.cache_format, payload, features, args.include_base_scores,
        args.overlay_manifest,
    )
    results = []
    for view_index, (view, items) in enumerate(items_by_view.items()):
        for pair_index, pair in enumerate(PAIRS):
            for kind_index, kind in enumerate(args.model_kind):
                seed = 16570001 + view_index * 100000 + pair_index * 10000 + kind_index * 1000
                result = screen_pair(
                    items, pair, view, kind, labels, held_sources, base,
                    baseline, features, payload, screen, seed,
                    args.max_source_drop, args.svm_c,
                )
                if result is not None:
                    result.update({"pair": pair, "seed": seed})
                    results.append(result)
    passed = sorted(
        (item for item in results if item["best"]["passed"]),
        key=lambda item: (
            item["best"]["metric"]["top1Accuracy"],
            item["best"]["metric"]["balancedTop1"],
        ), reverse=True,
    )
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
            item["best"]["config"], item["seed"], args.svm_c,
        )
        comparison = features.compare(
            candidate, current, payload["actual"], labels, payload["sources"],
        )
        overall = features.metric(
            payload["actual"], candidate, labels, payload["sources"],
        )
        accepted = (
            comparison["improved"] > comparison["harmed"]
            and overall["top1Accuracy"] > current_metric["top1Accuracy"]
            and overall["balancedTop1"] >= current_metric["balancedTop1"]
            and overall["minimumSourceTop1"] >= current_metric["minimumSourceTop1"]
            and overall["top3Accuracy"] >= current_metric["top3Accuracy"]
            and comparison["maximumSourceDrop"] >= args.max_source_drop
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
        "objective": "Audio-only pair reranking after fixed 61.50% OOF.",
        "policy": {
            "metadataUsedAtInference": False, "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False, "heldOutSourceExcludedFromTraining": True,
            "individualSourceNonRegressionRequired": args.max_source_drop >= 0.0,
            "maximumAllowedSourceDrop": args.max_source_drop,
            "svmC": args.svm_c,
            "top3CandidateSetChanged": False, "productionModelUpdated": False,
        },
        "dataset": {
            "rows": len(base), "cache": str(args.cache),
            "cacheFormat": args.cache_format,
            "baseScoresIncludedAsFeatures": args.include_base_scores,
            "viewRowsIncludingOverlay": {
                name: len(items) for name, items in items_by_view.items()
            },
            "trainingOnlyOverlayRows": len(overlay),
            "overlayBySource": dict(Counter(item["source"] for item in overlay)),
            "overlayByLabel": dict(Counter(item["actual"] for item in overlay)),
        },
        "baseline": baseline,
        "passed": [compact(item) for item in passed],
        "greedyChain": {
            "steps": chain, "selectedPairs": [list(pair) for pair in sorted(used_pairs)],
            "metric": current_metric,
        },
        "decision": "continue-independent-validation" if (
            current_metric["top1Accuracy"] > baseline["top1Accuracy"]
        ) else "reject-representation",
    }
    if args.oof_output:
        args.oof_output.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            args.oof_output,
            selectedScores=current,
            baselineScores=base,
            actual=np.asarray(payload["actual"], dtype=str),
            sources=np.asarray(payload["sources"], dtype=str),
            sourceKeys=np.asarray(payload["sourceKeys"], dtype=str),
            labels=np.asarray(labels, dtype=str),
            trainingEligible=np.asarray(payload["trainingEligible"], dtype=bool),
        )
        report["oofOutput"] = {
            "path": str(args.oof_output),
            "sha256": hashlib.sha256(args.oof_output.read_bytes()).hexdigest(),
            "rows": len(current),
        }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=OOF)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument(
        "--cache-format", choices=("ast", "panns", "yamnet", "clap"),
        required=True,
    )
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--oof-output", type=Path)
    parser.add_argument("--include-base-scores", action="store_true")
    parser.add_argument("--overlay-manifest", type=Path, action="append", default=[])
    parser.add_argument("--max-source-drop", type=float, default=0.0)
    parser.add_argument("--svm-c", type=float, default=1.0)
    parser.add_argument(
        "--model-kind", action="append",
        choices=("logistic", "extra-trees", "svm-rbf"), default=[],
    )
    args = parser.parse_args()
    if not args.model_kind:
        args.model_kind = ["logistic", "extra-trees"]
    report = run(args)
    print(json.dumps({
        "baseline": report["baseline"], "passed": len(report["passed"]),
        "candidate": report["greedyChain"]["metric"],
        "decision": report["decision"], "report": str(args.report),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
