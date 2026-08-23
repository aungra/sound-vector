#!/usr/bin/env python3
"""Screen MuLan electronic heads after adding an independent Deep House source."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
SHARED_PATH = Path(__file__).with_name(
    "genre-unknown80-independent-electronic-ablation.py"
)
DEFAULT_OVERLAY_MANIFEST = (
    TRAINING / "wikimedia-unknown80-deep-house-v1-cc-source-manifest.json"
)
DEFAULT_OVERLAY_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "wikimedia-unknown80-deep-house-v1-muq-mulan.sqlite3"
)
DEFAULT_REPORT = TRAINING / "unknown80-independent-electronic-mulan-ablation.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-independent-electronic-mulan-ablation.md"
GROUPS = (
    ("ハウス", "ディープ・ハウス"),
    ("テクノ", "ハウス", "ディープ・ハウス"),
)
MODEL_KINDS = ("logistic", "extra-trees")
STRENGTHS = (0.15, 0.25, 0.4, 0.6, 0.8, 1.0)
CONFIDENCE_FLOORS = (0.0, 0.7, 0.8, 0.9, 0.95)
VECTOR_DIMENSIONS = 1536


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def source_key(row):
    return f"{row['sourceType']}:{row['sourceUrl']}"


def load_overlay(manifest_path, cache_path):
    rows = json.loads(manifest_path.read_text()).get("items", [])
    grouped = defaultdict(dict)
    connection = sqlite3.connect(cache_path)
    try:
        for key, segment_index, blob in connection.execute(
            "SELECT source_key, segment_index, vector FROM segments"
        ):
            grouped[str(key)][int(segment_index)] = np.frombuffer(
                blob, dtype="<f4"
            ).copy()
    finally:
        connection.close()
    kept = []
    vectors = []
    for row in rows:
        if not row.get("trainingEligible") or row.get("productionEligible"):
            continue
        segments = grouped.get(source_key(row), {})
        if set(segments) != {0, 1, 2}:
            continue
        vector = np.concatenate([segments[index] for index in range(3)])
        if vector.shape != (VECTOR_DIMENSIONS,) or not np.isfinite(vector).all():
            continue
        kept.append(row)
        vectors.append(vector.astype(np.float32))
    return kept, np.asarray(vectors, dtype=np.float32)


def render(report):
    lines = [
        "# Unknown80 independent electronic MuLan ablation", "",
        "Fold-reconstructed v99 plus source-isolated three-position MuLan heads.",
        "", "| candidate | Top1 | balanced | minimum source | Top3 | + / - |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for name in report["ranking"]:
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
    shared = load_module(SHARED_PATH, "electronic_mulan_shared")
    black = shared.load_module(shared.BLACK_SCRIPT, "electronic_mulan_black")
    payload = np.load(args.oof)
    labels = list(payload["labels"])
    actual = payload["actual"]
    sources = payload["sources"]
    eligible = payload["trainingEligible"].astype(bool)
    positions = payload["positions"].astype(np.float32)
    formal_librosa, available = black.align_features(
        payload["sourceKeys"], black.load_feature_cache((args.formal_librosa,))
    )
    black_rows, black_features = black.load_overlay(
        args.black_manifest, args.black_librosa
    )
    held_sources = sorted(
        source for source, count in Counter(sources).items() if count >= 8
    )
    incumbent = shared.reconstruct_v99(
        black, payload, formal_librosa, available, black_rows, black_features,
        held_sources,
    )
    incumbent_metric = black.metric(actual, incumbent, labels, sources)
    if incumbent_metric["top1Accuracy"] != 58.68:
        raise ValueError(
            f"v99 reconstruction mismatch: {incumbent_metric['top1Accuracy']}"
        )
    overlay_rows, overlay = load_overlay(
        args.overlay_manifest, args.overlay_cache
    )
    overlay_actual = np.asarray(
        [row["genre"] for row in overlay_rows], dtype=object
    )
    overlay_sources = np.asarray(
        [row["source"] for row in overlay_rows], dtype=object
    )
    candidates = {"v99-incumbent": incumbent_metric}
    diagnostics = defaultdict(list)
    for group_index, group in enumerate(GROUPS):
        for kind in MODEL_KINDS:
            fold_models = []
            for fold_index, held_source in enumerate(held_sources):
                train_indexes = np.flatnonzero(
                    (sources != held_source) & eligible & np.isin(actual, group)
                )
                overlay_indexes = np.asarray([
                    index for index, row in enumerate(overlay_rows)
                    if row["genre"] in group and row["source"] != held_source
                ], dtype=np.int64)
                matrix = positions[train_indexes]
                train_actual = actual[train_indexes]
                train_sources = sources[train_indexes]
                overlay_mask = np.zeros(len(train_indexes), dtype=bool)
                if overlay_indexes.size:
                    matrix = np.concatenate([matrix, overlay[overlay_indexes]])
                    train_actual = np.concatenate([
                        train_actual, overlay_actual[overlay_indexes]
                    ])
                    train_sources = np.concatenate([
                        train_sources, overlay_sources[overlay_indexes]
                    ])
                    overlay_mask = np.concatenate([
                        overlay_mask, np.ones(len(overlay_indexes), dtype=bool)
                    ])
                counts = Counter(train_actual)
                source_counts = {
                    label: len(set(train_sources[train_actual == label]))
                    for label in group
                }
                if (
                    min(counts.get(label, 0) for label in group) < 8
                    or min(source_counts.values()) < 2
                ):
                    diagnostics[(group, kind)].append({
                        "heldOutSource": held_source,
                        "status": "blocked-source-coverage",
                        "rows": dict(counts),
                        "sourcesPerLabel": source_counts,
                    })
                    fold_models = []
                    break
                model = black.fit_model(
                    kind, matrix, train_actual,
                    black.source_label_weights(
                        train_actual, train_sources, overlay_mask
                    ),
                    1213001 + group_index * 10000 + fold_index * 100,
                )
                evaluation_indexes = np.flatnonzero(sources == held_source)
                columns = {labels.index(label) for label in group}
                top3 = np.argsort(-incumbent[evaluation_indexes], axis=1)[:, :3]
                applicable = np.asarray([
                    columns.issubset(set(candidate_columns))
                    for candidate_columns in top3
                ], dtype=bool)
                fold_models.append((evaluation_indexes, model, applicable))
                diagnostics[(group, kind)].append({
                    "heldOutSource": held_source,
                    "status": "fitted",
                    "rows": dict(counts),
                    "sourcesPerLabel": source_counts,
                    "trainingOnlyOverlayRows": int(len(overlay_indexes)),
                    "applicableEvaluationRows": int(np.sum(applicable)),
                })
            if not fold_models:
                continue
            for strength in STRENGTHS:
                for confidence_floor in CONFIDENCE_FLOORS:
                    floor_suffix = (
                        "" if confidence_floor == 0.0
                        else f"-confidence{confidence_floor:g}"
                    )
                    name = (
                        f"{'-'.join(group)}-{kind}-mulan-w{strength:g}"
                        f"{floor_suffix}"
                    )
                    output = incumbent.copy()
                    for indexes, model, applicable in fold_models:
                        output[indexes] = shared.rerank_group(
                            incumbent[indexes], positions[indexes], model, labels,
                            group, strength, applicable,
                            min_confidence=confidence_floor,
                        )
                    candidates[name] = black.compare_output(
                        output, incumbent, actual, labels, sources
                    )
    baseline = candidates["v99-incumbent"]
    promotion = [
        name for name, score in candidates.items()
        if name != "v99-incumbent"
        and score["top1Accuracy"] > baseline["top1Accuracy"]
        and score["balancedTop1"] >= baseline["balancedTop1"]
        and score["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and score["top3Accuracy"] >= baseline["top3Accuracy"]
        and score["improved"] >= score["harmed"]
    ]
    ranking = sorted(candidates, key=lambda name: (
        candidates[name]["top1Accuracy"],
        candidates[name]["balancedTop1"],
        candidates[name]["minimumSourceTop1"],
    ), reverse=True)
    report = {
        "objective": (
            "Test independent Deep House evidence with three-position MuLan "
            "electronic rerankers on source-heldout v99."
        ),
        "policy": {
            "metadataUsedAtInference": False,
            "urlSpecificRulesUsed": False,
            "knownSongRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "overlayRowsEvaluated": False,
            "matchingProviderExcludedFromOuterFold": True,
            "productionModelUpdated": False,
        },
        "dataset": {
            "formalRows": len(actual),
            "overlayRows": len(overlay_rows),
            "overlayByGenre": dict(Counter(overlay_actual)),
            "overlayBySource": dict(Counter(overlay_sources)),
            "heldOutSources": held_sources,
        },
        "incumbent": incumbent_metric,
        "candidates": candidates,
        "ranking": ranking,
        "promotionScreen": promotion,
        "decision": (
            "continue-independent-outer-gates"
            if promotion else "reject-no-strict-oof-gain"
        ),
        "diagnostics": {
            "|".join((*group, kind)): rows
            for (group, kind), rows in diagnostics.items()
        },
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def main():
    shared = load_module(SHARED_PATH, "electronic_mulan_defaults")
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
    parser.add_argument(
        "--overlay-manifest", type=Path, default=DEFAULT_OVERLAY_MANIFEST
    )
    parser.add_argument("--overlay-cache", type=Path, default=DEFAULT_OVERLAY_CACHE)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
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
