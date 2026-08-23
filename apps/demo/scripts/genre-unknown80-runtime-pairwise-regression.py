#!/usr/bin/env python3
"""Regression-only gate for the candidate reranker on the production model."""

from __future__ import annotations

import argparse
import importlib.util
import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
INFER_PATH = Path(__file__).with_name("genre-embedding-infer.py")
RERANK_PATH = Path(__file__).with_name("genre_unknown80_rhythm_reranker.py")
DEFAULT_OOF = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-incumbent-caphe-oof-audio-only.npz"
)
DEFAULT_MODEL = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "embedding-genre-model.pkl"
)
DEFAULT_CANDIDATE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-rhythm-top3-pairwise-candidate.pkl"
)
DEFAULT_REPORT = TRAINING / "unknown80-runtime-pairwise-regression.json"


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def metric(actual, predicted):
    total = len(actual)
    correct = sum(left == right for left, right in zip(actual, predicted))
    labels = sorted(set(actual))
    recalls = []
    for label in labels:
        indexes = [index for index, value in enumerate(actual) if value == label]
        recalls.append(sum(predicted[index] == label for index in indexes) / len(indexes))
    return {
        "total": total,
        "top1Accuracy": round(correct * 100.0 / max(1, total), 2),
        "balancedTop1": round(float(np.mean(recalls)) * 100.0, 2),
    }


def compare(actual, before, after):
    changed = [index for index, pair in enumerate(zip(before, after)) if pair[0] != pair[1]]
    improved = sum(before[index] != actual[index] and after[index] == actual[index] for index in changed)
    regressed = sum(before[index] == actual[index] and after[index] != actual[index] for index in changed)
    return {
        "changedRows": len(changed),
        "improvedRows": improved,
        "regressedRows": regressed,
        "netCorrectChanges": improved - regressed,
    }


def run(args):
    inference = load_module(INFER_PATH, "unknown80_runtime_regression_inference")
    reranker = load_module(RERANK_PATH, "unknown80_runtime_regression_reranker")
    payload = np.load(args.oof)
    keys = [str(value) for value in payload["sourceKeys"]]
    actual = [str(value) for value in payload["actual"]]
    sources = [str(value) for value in payload["sources"]]
    discogs = inference.load_json(inference.DISCOGS_CACHE)
    mtg = inference.load_json(inference.MTG_CACHE)
    librosa = inference.load_json(inference.LIBROSA_CACHE)
    model = inference.load_model(args.model)
    candidate = reranker.load_bundle(args.candidate)
    before = []
    after = []
    kept_actual = []
    kept_sources = []
    details = []
    missing = Counter()
    for key, label, source in zip(keys, actual, sources):
        if key not in discogs or key not in librosa:
            missing["feature-cache"] += 1
            continue
        vectors = {
            "discogs": np.asarray(discogs[key], dtype=np.float32),
            "librosa": np.asarray(librosa[key], dtype=np.float32),
        }
        if key in mtg:
            vectors["mtg"] = np.asarray(mtg[key], dtype=np.float32)
        vectors["effnet_tail"] = vectors["discogs"][
            inference.DISCOGS_TAG_DIMENSIONS:
        ].copy()
        _alpha, _macro_labels, _macro_scores, fine_labels, fine_scores = (
            inference.score_bundle(model, vectors)
        )
        if label not in fine_labels:
            missing["unsupported-label"] += 1
            continue
        reranked, row_details = reranker.rerank(
            candidate, fine_labels, fine_scores, vectors["librosa"],
        )
        before.append(fine_labels[int(np.argmax(fine_scores))])
        after.append(fine_labels[int(np.argmax(reranked))])
        kept_actual.append(label)
        kept_sources.append(source)
        details.append(row_details)
    by_source = {}
    for source in sorted(set(kept_sources)):
        indexes = [index for index, value in enumerate(kept_sources) if value == source]
        by_source[source] = {
            "before": metric(
                [kept_actual[index] for index in indexes],
                [before[index] for index in indexes],
            ),
            "after": metric(
                [kept_actual[index] for index in indexes],
                [after[index] for index in indexes],
            ),
        }
    baseline = metric(kept_actual, before)
    result = metric(kept_actual, after)
    changes = compare(kept_actual, before, after)
    minimum_before = min(
        (row["before"]["top1Accuracy"] for row in by_source.values()), default=0.0,
    )
    minimum_after = min(
        (row["after"]["top1Accuracy"] for row in by_source.values()), default=0.0,
    )
    passed = (
        result["top1Accuracy"] >= baseline["top1Accuracy"] - 1.0
        and result["balancedTop1"] >= baseline["balancedTop1"] - 1.0
        and minimum_after >= minimum_before - 1.0
    )
    report = {
        "objective": "Production-model regression guard; not an independent accuracy estimate.",
        "policy": {
            "metadataUsedAtInference": False,
            "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "rowsMayOverlapModelTraining": True,
            "eligibleForAccuracyClaim": False,
            "productionModelUpdated": False,
        },
        "dataset": {
            "requestedRows": len(keys),
            "evaluatedRows": len(kept_actual),
            "missing": dict(missing),
        },
        "baseline": baseline,
        "candidate": result,
        "minimumSource": {"before": minimum_before, "after": minimum_after},
        "changes": changes,
        "appliedRows": sum(bool(row.get("applied")) for row in details),
        "changedContractViolations": sum(
            not row.get("top3SetPreserved") or not row.get("scoreMultisetPreserved")
            for row in details
        ),
        "bySource": by_source,
        "promotionGate": "passed" if passed else "failed",
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=DEFAULT_OOF)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--candidate", type=Path, default=DEFAULT_CANDIDATE)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    report = run(args)
    print(json.dumps({
        "baseline": report["baseline"],
        "candidate": report["candidate"],
        "minimumSource": report["minimumSource"],
        "changes": report["changes"],
        "appliedRows": report["appliedRows"],
        "changedContractViolations": report["changedContractViolations"],
        "promotionGate": report["promotionGate"],
        "report": str(args.report),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
