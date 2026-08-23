#!/usr/bin/env python3
"""Screen cached rhythm/acoustic features for leak-free Top3 pair reranking."""

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
HELPER_PATH = Path(__file__).with_name(
    "genre-audio-only-frozen-representation-benchmark.py"
)
FULL_PATH = Path(__file__).with_name("genre-panns-full-source-holdout.py")
REPRO_PATH = Path(__file__).with_name("genre_research_reproducibility.py")
DEFAULT_OOF = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-incumbent-caphe-oof-audio-only.npz"
)
DEFAULT_LIBROSA = (
    Path(
        "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
        "librosa-feature-cache.json"
    ),
    Path(
        "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
        "magnatagatune-research-librosa-overlay.json"
    ),
)
DEFAULT_REPORT = TRAINING / "unknown80-rhythm-pairwise-screen.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-rhythm-pairwise-screen.md"
LIBROSA_DIMENSIONS = 547

# Scalar tempo/onset descriptors, RMS moments, and the 24-lag tempogram block.
RHYTHM_INDEXES = np.asarray([
    *range(0, 7), *range(397, 403), *range(403, 547),
], dtype=np.int64)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_librosa(paths):
    output = {}
    for path in paths:
        payload = json.loads(path.read_text())
        for key, value in payload.items():
            if isinstance(value, list) and len(value) == LIBROSA_DIMENSIONS:
                output[key] = np.asarray(value, dtype=np.float32)
    return output


def align_librosa(keys, cache):
    matrix = np.zeros((len(keys), LIBROSA_DIMENSIONS), dtype=np.float32)
    available = np.zeros(len(keys), dtype=bool)
    for index, key in enumerate(keys):
        value = cache.get(str(key))
        if value is not None:
            matrix[index] = value
            available[index] = True
    return matrix, available


def robust_scale_parameters(matrix, training_indexes):
    train = np.asarray(matrix, dtype=np.float32)[training_indexes]
    median = np.median(train, axis=0)
    q25, q75 = np.percentile(train, (25, 75), axis=0)
    scale = np.maximum(q75 - q25, 1e-6)
    return median.astype(np.float32), scale.astype(np.float32)


def apply_robust_scale(matrix, median, scale):
    output = np.asarray(matrix, dtype=np.float32)
    return np.clip((output - median) / scale, -8.0, 8.0).astype(np.float32)


def robust_scale(matrix, training_indexes):
    median, scale = robust_scale_parameters(matrix, training_indexes)
    return apply_robust_scale(matrix, median, scale)


def robust_scale_pair(matrix, overlay, training_indexes):
    """Scale formal and training-only rows with one fold-local contract."""

    median, scale = robust_scale_parameters(matrix, training_indexes)
    return (
        apply_robust_scale(matrix, median, scale),
        apply_robust_scale(overlay, median, scale),
    )


def view_matrix(name, positions, librosa, training_indexes):
    if name == "positions":
        return positions
    selected = librosa[:, RHYTHM_INDEXES] if name.endswith("rhythm") else librosa
    selected = robust_scale(selected, training_indexes)
    if name.startswith("positions-"):
        return np.concatenate([positions, selected], axis=1)
    return selected


def render(report):
    lines = [
        "# Unknown80 rhythm pairwise screen", "",
        "Audio-only source-heldout screen using cached librosa rhythm features.", "",
        "| candidate | Top1 | balanced | minimum source | Top3 |",
        "|---|---:|---:|---:|---:|",
    ]
    for name in report["ranking"][:24]:
        score = report["candidates"][name]["pooled"]
        lines.append(
            f"| {name} | {score['top1Accuracy']:.2f}% | "
            f"{score['balancedTop1']:.2f}% | {score['minimumSourceTop1']:.2f}% | "
            f"{score['top3Accuracy']:.2f}% |"
        )
    lines.extend(["", f"Selected: **{report['selected']}**", ""])
    reproducibility = report.get("reproducibility") or {}
    if reproducibility:
        runtime = reproducibility["runtime"]
        lines.extend([
            "## Reproducibility", "",
            f"- Script SHA-256: `{reproducibility['script']['sha256']}`",
            f"- OOF SHA-256: `{reproducibility['inputs'][0]['sha256']}`",
            f"- Librosa SHA-256: `{reproducibility['inputs'][1]['sha256']}`",
            f"- Runtime: Python {runtime['python']} / NumPy {runtime['numpy']} / scikit-learn {runtime['sklearn']}",
            "",
        ])
    return "\n".join(lines)


def run(args):
    pairwise = load_module(PAIRWISE_PATH, "unknown80_rhythm_pairwise")
    helper = load_module(HELPER_PATH, "unknown80_rhythm_helper")
    full = load_module(FULL_PATH, "unknown80_rhythm_full")
    payload = np.load(args.oof)
    positions = payload["positions"].astype(np.float32)
    base = payload["selectedScores"].astype(np.float64)
    labels = list(payload["labels"])
    actual = payload["actual"]
    sources = payload["sources"]
    keys = payload["sourceKeys"]
    training_eligible = payload["trainingEligible"].astype(bool)
    librosa, available = align_librosa(keys, load_librosa(args.librosa))
    held_sources = sorted(
        source for source, count in Counter(sources).items() if count >= 8
    )
    views = ("positions", "rhythm", "positions-rhythm", "positions-librosa")
    candidates = ["incumbent"] + [
        f"{view}-pair{pair_index + 1}-w{strength:g}"
        for view in views
        for pair_index, _pair in enumerate(pairwise.PAIRS)
        for strength in pairwise.STRENGTHS
    ]
    candidates.extend(
        f"{view}-{config['name']}"
        for view in views for config in pairwise.COMBINATIONS
    )
    runs = {name: [] for name in candidates}
    folds = []
    for source_index, held_source in enumerate(held_sources):
        train_indexes = np.asarray([
            index for index, source in enumerate(sources)
            if source != held_source and training_eligible[index]
        ], dtype=np.int64)
        evaluation_indexes = np.flatnonzero(sources == held_source)
        runs["incumbent"].append({
            "source": held_source,
            "metric": helper.metric(
                actual[evaluation_indexes], base[evaluation_indexes], labels,
            ),
        })
        fold = {"heldOutSource": held_source, "views": {}}
        for view_index, view in enumerate(views):
            matrix = view_matrix(view, positions, librosa, train_indexes)
            models, diagnostics = pairwise.fit_pair_models(
                matrix, actual, sources, train_indexes, labels, "extra-trees",
                341001 + source_index * 1000 + view_index * 100,
            )
            fold["views"][view] = diagnostics
            for pair_index, pair in enumerate(pairwise.PAIRS):
                for strength in pairwise.STRENGTHS:
                    name = f"{view}-pair{pair_index + 1}-w{strength:g}"
                    scores = pairwise.rerank_top3(
                        base[evaluation_indexes], matrix[evaluation_indexes],
                        {pair: models[pair]} if pair in models else {}, labels,
                        strength,
                    )
                    # A missing acoustic vector must never alter an evaluation row.
                    missing = ~available[evaluation_indexes]
                    if view != "positions":
                        scores[missing] = base[evaluation_indexes][missing]
                    runs[name].append({
                        "source": held_source,
                        "metric": helper.metric(
                            actual[evaluation_indexes], scores, labels,
                        ),
                    })
            for config in pairwise.COMBINATIONS:
                name = f"{view}-{config['name']}"
                scores = pairwise.apply_combination(
                    base[evaluation_indexes], matrix[evaluation_indexes], models,
                    labels, config["members"],
                )
                missing = ~available[evaluation_indexes]
                if view != "positions":
                    scores[missing] = base[evaluation_indexes][missing]
                runs[name].append({
                    "source": held_source,
                    "metric": helper.metric(
                        actual[evaluation_indexes], scores, labels,
                    ),
                })
        folds.append(fold)
    scored = {name: full.aggregate_runs(values) for name, values in runs.items()}
    baseline = scored["incumbent"]["pooled"]
    ranking = sorted(scored, key=lambda name: (
        scored[name]["pooled"]["top1Accuracy"],
        scored[name]["pooled"]["balancedTop1"],
        scored[name]["pooled"]["minimumSourceTop1"],
    ), reverse=True)
    selected = next((name for name in ranking if (
        scored[name]["pooled"]["top1Accuracy"] >= baseline["top1Accuracy"]
        and scored[name]["pooled"]["balancedTop1"] >= baseline["balancedTop1"]
        and scored[name]["pooled"]["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and scored[name]["pooled"]["top3Accuracy"] == baseline["top3Accuracy"]
    )), "incumbent")
    report = {
        "objective": "Test whether rhythm/acoustic vectors improve unknown-source pair boundaries.",
        "policy": {
            "metadataUsedAtInference": False,
            "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "evaluationOnlyRowsTrainModels": False,
            "missingAcousticRowsReranked": False,
            "productionModelUpdated": False,
        },
        "dataset": {
            "rows": len(actual), "labels": len(labels), "sources": held_sources,
            "librosaCoverage": int(available.sum()),
            "librosaMissing": int((~available).sum()),
            "featureViews": list(views),
            "rhythmFeatureCount": len(RHYTHM_INDEXES),
        },
        "candidates": scored,
        "ranking": ranking,
        "selected": selected,
        "goalDiagnostic": {
            "targetTop1": 80.0,
            "baselineTop1": baseline["top1Accuracy"],
            "selectedTop1": scored[selected]["pooled"]["top1Accuracy"],
            "remainingGap": round(80.0 - scored[selected]["pooled"]["top1Accuracy"], 2),
        },
        "folds": folds,
        "reproducibility": build_reproducibility(
            Path(__file__),
            dependencies=(PAIRWISE_PATH, HELPER_PATH, FULL_PATH, REPRO_PATH),
            inputs=(args.oof, *args.librosa),
            contract={
                "featureViews": list(views),
                "rhythmFeatureIndexes": RHYTHM_INDEXES.tolist(),
                "minimumRowsPerLabel": 8,
                "minimumIndependentSourcesPerLabel": 2,
                "missingAcousticRowsReranked": False,
                "foldLocalRobustScaling": True,
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
    parser.add_argument("--librosa", type=Path, action="append", default=[])
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    if not args.librosa:
        args.librosa = list(DEFAULT_LIBROSA)
    report = run(args)
    print(json.dumps({
        "selected": report["selected"],
        "score": report["candidates"][report["selected"]]["pooled"],
        "goalDiagnostic": report["goalDiagnostic"],
        "report": str(args.report),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
