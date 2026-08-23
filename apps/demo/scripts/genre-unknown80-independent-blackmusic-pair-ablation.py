#!/usr/bin/env python3
"""Screen independent-source Blues/Funk/Dub pair-head training overlays."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
DEFAULT_OOF = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-incumbent-caphe-oof-audio-only.npz"
)
DEFAULT_FORMAL_LIBROSA = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "librosa-feature-cache.json"
)
DEFAULT_OVERLAY_MANIFEST = (
    TRAINING / "unknown80-independent-blackmusic-candidate-manifest.json"
)
DEFAULT_OVERLAY_LIBROSA = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-independent-blackmusic-librosa.json"
)
DEFAULT_REPORT = (
    TRAINING / "unknown80-independent-blackmusic-pair-ablation.json"
)
DEFAULT_MARKDOWN = (
    TRAINING / "unknown80-independent-blackmusic-pair-ablation.md"
)
LIBROSA_DIMENSIONS = 547
RHYTHM_INDEXES = np.asarray([
    *range(0, 7), *range(397, 403), *range(403, 547),
], dtype=np.int64)
PAIRS = (
    ("ブルース", "フォーク"),
    ("ブルース", "ロック"),
    ("ファンク", "ディスコ"),
    ("ファンク", "ロック"),
    ("レゲエ", "ダブ"),
)
MODELS = ("logistic", "extra-trees")
VIEWS = ("rhythm", "full")
STRENGTHS = (0.25, 0.5, 0.75, 1.0)
OVERLAY_WEIGHT = 0.5
COMBINATIONS = {
    "conservative-two-pair": (
        "ファンク-ロック-logistic-rhythm-overlay-w0.5",
        "ブルース-フォーク-logistic-full-overlay-w0.25",
    ),
    "conservative-three-pair": (
        "ファンク-ロック-logistic-rhythm-overlay-w0.5",
        "ブルース-フォーク-logistic-full-overlay-w0.25",
        "レゲエ-ダブ-extra-trees-full-overlay-w0.25",
    ),
}


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path):
    return json.loads(Path(path).read_text())


def source_key(row):
    return f"{row['sourceType']}:{row['sourceUrl']}"


def load_feature_cache(paths):
    output = {}
    for path in paths:
        for key, values in load_json(path).items():
            if not isinstance(values, list):
                continue
            vector = np.asarray(values, dtype=np.float32)
            if vector.shape == (LIBROSA_DIMENSIONS,):
                output[key] = vector
    return output


def align_features(keys, cache):
    matrix = np.zeros((len(keys), LIBROSA_DIMENSIONS), dtype=np.float32)
    available = np.zeros(len(keys), dtype=bool)
    for index, key in enumerate(keys):
        vector = cache.get(str(key))
        if vector is None:
            continue
        matrix[index] = vector
        available[index] = True
    return matrix, available


def load_overlay(manifest_path, cache_path):
    cache = load_feature_cache((cache_path,))
    rows = []
    vectors = []
    for row in load_json(manifest_path).get("items", []):
        if not row.get("trainingEligible") or row.get("productionEligible"):
            continue
        vector = cache.get(source_key(row))
        if vector is None:
            continue
        rows.append(row)
        vectors.append(vector)
    return rows, np.asarray(vectors, dtype=np.float32)


def feature_view(matrix, view):
    return matrix[:, RHYTHM_INDEXES] if view == "rhythm" else matrix


def source_label_weights(actual, sources, overlay_mask=None):
    counts = Counter(zip(actual, sources))
    weights = np.asarray([
        1.0 / max(1, counts[(label, source)])
        for label, source in zip(actual, sources)
    ], dtype=np.float64)
    weights /= max(float(weights.mean()), 1e-12)
    if overlay_mask is not None:
        weights[np.asarray(overlay_mask, dtype=bool)] *= OVERLAY_WEIGHT
    return weights


def fit_model(kind, matrix, actual, weights, seed):
    if kind == "extra-trees":
        model = ExtraTreesClassifier(
            n_estimators=320,
            max_features="sqrt",
            min_samples_leaf=2,
            class_weight="balanced",
            n_jobs=-1,
            random_state=seed,
        )
        model.fit(matrix, actual, sample_weight=weights)
        return model
    model = make_pipeline(
        StandardScaler(),
        LogisticRegression(
            C=0.7,
            class_weight="balanced",
            max_iter=1200,
            random_state=seed,
        ),
    )
    model.fit(matrix, actual, logisticregression__sample_weight=weights)
    return model


def rerank_pair(base_scores, features, model, labels, pair, strength, applicable):
    output = np.asarray(base_scores, dtype=np.float64).copy()
    if not np.any(applicable):
        return output
    label_index = {label: index for index, label in enumerate(labels)}
    first, second = (label_index[label] for label in pair)
    pair_scores = output[applicable][:, [first, second]]
    old = pair_scores / np.maximum(pair_scores.sum(axis=1, keepdims=True), 1e-12)
    probabilities = model.predict_proba(features[applicable])
    classes = list(model.classes_ if hasattr(model, "classes_") else model[-1].classes_)
    learned = probabilities[:, [classes.index(pair[0]), classes.index(pair[1])]]
    target = old * (1.0 - strength) + learned * strength
    selected_rows = np.flatnonzero(applicable)
    top3 = np.argsort(-output, axis=1)[:, :3]
    utilities = np.log(np.maximum(output, 1e-12))
    delta = np.log(np.maximum(target, 1e-12)) - np.log(np.maximum(old, 1e-12))
    utilities[selected_rows, first] += delta[:, 0]
    utilities[selected_rows, second] += delta[:, 1]
    for row_index in selected_rows:
        candidates = top3[row_index]
        original_values = np.sort(output[row_index, candidates])[::-1]
        order = candidates[
            np.argsort(-utilities[row_index, candidates], kind="stable")
        ]
        output[row_index, order] = original_values
    return output


def metric(actual, scores, labels, sources):
    labels = np.asarray(labels)
    predicted = labels[np.argmax(scores, axis=1)]
    correct = predicted == actual
    recalls = [
        float(np.mean(correct[actual == label]))
        for label in sorted(set(actual))
    ]
    source_scores = {
        source: float(np.mean(correct[sources == source]))
        for source, count in Counter(sources).items()
        if count >= 8
    }
    top3 = np.argsort(-scores, axis=1)[:, :3]
    top3_correct = np.asarray([
        label in labels[indexes] for label, indexes in zip(actual, top3)
    ])
    return {
        "top1Accuracy": round(float(np.mean(correct)) * 100, 2),
        "balancedTop1": round(float(np.mean(recalls)) * 100, 2),
        "minimumSourceTop1": round(min(source_scores.values()) * 100, 2),
        "top3Accuracy": round(float(np.mean(top3_correct)) * 100, 2),
        "changedTop1": 0,
        "sourceTop1": {
            source: round(value * 100, 2)
            for source, value in sorted(source_scores.items())
        },
    }


def aggregate_fold_scores(fold_outputs, base, actual, labels, sources):
    output = np.asarray(base, dtype=np.float64).copy()
    for indexes, scores in fold_outputs:
        output[indexes] = scores
    return compare_output(output, base, actual, labels, sources)


def compare_output(output, base, actual, labels, sources):
    result = metric(actual, output, labels, sources)
    base_top = np.argmax(base, axis=1)
    candidate_top = np.argmax(output, axis=1)
    changed = candidate_top != base_top
    result["changedTop1"] = int(np.sum(changed))
    result["improved"] = int(np.sum(
        changed
        & (np.asarray(labels)[candidate_top] == actual)
        & (np.asarray(labels)[base_top] != actual)
    ))
    result["harmed"] = int(np.sum(
        changed
        & (np.asarray(labels)[candidate_top] != actual)
        & (np.asarray(labels)[base_top] == actual)
    ))
    return result


def combine_candidate_outputs(base, outputs):
    base = np.asarray(base, dtype=np.float64)
    combined = base.copy()
    occupied = np.zeros(len(base), dtype=bool)
    for output in outputs:
        changed = np.any(np.asarray(output) != base, axis=1)
        if np.any(occupied & changed):
            raise ValueError("candidate combination has overlapping rows")
        combined[changed] = output[changed]
        occupied |= changed
    return combined


def run(args):
    payload = np.load(args.oof)
    base = payload["selectedScores"].astype(np.float64)
    labels = list(payload["labels"])
    actual = payload["actual"]
    sources = payload["sources"]
    eligible = payload["trainingEligible"].astype(bool)
    formal, available = align_features(
        payload["sourceKeys"], load_feature_cache(args.formal_librosa)
    )
    overlay_rows, overlay = load_overlay(
        args.overlay_manifest, args.overlay_librosa
    )
    overlay_actual = np.asarray(
        [row["genre"] for row in overlay_rows], dtype=object
    )
    overlay_sources = np.asarray(
        [row["source"] for row in overlay_rows], dtype=object
    )
    held_sources = sorted(
        source for source, count in Counter(sources).items() if count >= 8
    )
    candidates = {"incumbent": metric(actual, base, labels, sources)}
    candidate_outputs = {"incumbent": base}
    diagnostics = defaultdict(list)
    for pair_index, pair in enumerate(PAIRS):
        pair_overlay_indexes = np.asarray([
            index for index, row in enumerate(overlay_rows)
            if row["genre"] in pair
        ], dtype=np.int64)
        for kind in MODELS:
            for view in VIEWS:
                for include_overlay in (False, True):
                    fold_models = []
                    for fold_index, held_source in enumerate(held_sources):
                        train_indexes = np.asarray([
                            index for index, source in enumerate(sources)
                            if source != held_source
                            and eligible[index]
                            and available[index]
                            and actual[index] in pair
                        ], dtype=np.int64)
                        selected_overlay = np.asarray([
                            index for index in pair_overlay_indexes
                            if include_overlay
                            and overlay_sources[index] != held_source
                        ], dtype=np.int64)
                        train_matrix = formal[train_indexes]
                        train_actual = actual[train_indexes]
                        train_sources = sources[train_indexes]
                        overlay_mask = np.zeros(len(train_indexes), dtype=bool)
                        if selected_overlay.size:
                            train_matrix = np.concatenate([
                                train_matrix, overlay[selected_overlay]
                            ])
                            train_actual = np.concatenate([
                                train_actual, overlay_actual[selected_overlay]
                            ])
                            train_sources = np.concatenate([
                                train_sources, overlay_sources[selected_overlay]
                            ])
                            overlay_mask = np.concatenate([
                                overlay_mask,
                                np.ones(len(selected_overlay), dtype=bool),
                            ])
                        counts = Counter(train_actual)
                        source_counts = {
                            label: len(set(train_sources[train_actual == label]))
                            for label in pair
                        }
                        evaluation_indexes = np.flatnonzero(sources == held_source)
                        if (
                            min((counts.get(label, 0) for label in pair)) < 8
                            or min(source_counts.values()) < 2
                        ):
                            diagnostics[(pair, kind, view, include_overlay)].append({
                                "heldOutSource": held_source,
                                "status": "blocked-source-coverage",
                                "rows": dict(counts),
                                "sourcesPerLabel": source_counts,
                            })
                            fold_models = []
                            break
                        model = fit_model(
                            kind,
                            feature_view(train_matrix, view),
                            train_actual,
                            source_label_weights(
                                train_actual, train_sources, overlay_mask
                            ),
                            886001 + pair_index * 10000 + fold_index * 100,
                        )
                        evaluation_available = available[evaluation_indexes]
                        top3 = np.argsort(-base[evaluation_indexes], axis=1)[:, :3]
                        label_index = {label: index for index, label in enumerate(labels)}
                        pair_indexes = {label_index[label] for label in pair}
                        applicable = np.asarray([
                            evaluation_available[index]
                            and pair_indexes.issubset(set(candidates_row))
                            for index, candidates_row in enumerate(top3)
                        ], dtype=bool)
                        fold_models.append((
                            evaluation_indexes,
                            feature_view(formal[evaluation_indexes], view),
                            model,
                            applicable,
                        ))
                        diagnostics[(pair, kind, view, include_overlay)].append({
                            "heldOutSource": held_source,
                            "status": "fitted",
                            "rows": dict(counts),
                            "sourcesPerLabel": source_counts,
                            "overlayRows": int(len(selected_overlay)),
                            "applicableEvaluationRows": int(np.sum(applicable)),
                        })
                    if not fold_models:
                        continue
                    overlay_name = "overlay" if include_overlay else "formal"
                    for strength in STRENGTHS:
                        name = (
                            f"{'-'.join(pair)}-{kind}-{view}-{overlay_name}-"
                            f"w{strength:g}"
                        )
                        fold_outputs = []
                        for indexes, features, model, applicable in fold_models:
                            scores = rerank_pair(
                                base[indexes], features, model, labels,
                                pair, strength, applicable,
                            )
                            fold_outputs.append((indexes, scores))
                        candidates[name] = aggregate_fold_scores(
                            fold_outputs, base, actual, labels, sources
                        )
                        output = np.asarray(base, dtype=np.float64).copy()
                        for indexes, scores in fold_outputs:
                            output[indexes] = scores
                        candidate_outputs[name] = output
    for name, members in COMBINATIONS.items():
        if not all(member in candidate_outputs for member in members):
            continue
        output = combine_candidate_outputs(
            base, [candidate_outputs[member] for member in members]
        )
        candidate_outputs[name] = output
        candidates[name] = compare_output(
            output, base, actual, labels, sources
        )
    baseline = candidates["incumbent"]
    eligible_names = [
        name for name, score in candidates.items()
        if name != "incumbent"
        and ("-overlay-" in name or name in COMBINATIONS)
        and score["top1Accuracy"] > baseline["top1Accuracy"]
        and score["balancedTop1"] >= baseline["balancedTop1"]
        and score["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and score["top3Accuracy"] >= baseline["top3Accuracy"]
        and score["harmed"] <= score["improved"]
    ]
    ranking = sorted(candidates, key=lambda name: (
        candidates[name]["top1Accuracy"],
        candidates[name]["balancedTop1"],
        candidates[name]["minimumSourceTop1"],
    ), reverse=True)
    report = {
        "objective": "Test rights-clear independent Blues/Funk/Dub rows in leak-free source-heldout pair heads.",
        "policy": {
            "metadataUsedAtInference": False,
            "urlSpecificRulesUsed": False,
            "knownSongRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "overlayRowsEvaluated": False,
            "overlayProviderExcludedFromMatchingOuterFold": True,
            "productionModelUpdated": False,
            "overlayWeight": OVERLAY_WEIGHT,
            "candidateCombinations": COMBINATIONS,
        },
        "dataset": {
            "formalRows": len(actual),
            "formalLibrosaCoverage": int(np.sum(available)),
            "overlayRows": len(overlay_rows),
            "overlayByGenre": dict(Counter(overlay_actual)),
            "overlayBySource": dict(Counter(overlay_sources)),
            "heldOutSources": held_sources,
        },
        "incumbent": baseline,
        "candidates": candidates,
        "ranking": ranking,
        "promotionScreen": eligible_names,
        "decision": (
            "continue-nested-and-outer-gates"
            if eligible_names else "reject-no-strict-oof-gain"
        ),
        "diagnostics": {
            "|".join((*pair, kind, view, "overlay" if overlay else "formal")): rows
            for (pair, kind, view, overlay), rows in diagnostics.items()
        },
        "reproducibility": {
            "scriptSha256": sha256_file(__file__),
            "oofSha256": sha256_file(args.oof),
            "formalLibrosaSha256": [
                sha256_file(path) for path in args.formal_librosa
            ],
            "overlayManifestSha256": sha256_file(args.overlay_manifest),
            "overlayLibrosaSha256": sha256_file(args.overlay_librosa),
        },
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def render(report):
    lines = [
        "# Unknown80 independent black-music pair ablation",
        "",
        "Candidate tracks are training-only. A provider's candidate rows are excluded when that provider is the outer evaluation fold.",
        "",
        "| candidate | Top1 | balanced | minimum source | Top3 | changes | + / - |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for name in report["ranking"][:24]:
        score = report["candidates"][name]
        lines.append(
            f"| {name} | {score['top1Accuracy']:.2f}% | "
            f"{score['balancedTop1']:.2f}% | "
            f"{score['minimumSourceTop1']:.2f}% | "
            f"{score['top3Accuracy']:.2f}% | {score['changedTop1']} | "
            f"{score.get('improved', 0)} / {score.get('harmed', 0)} |"
        )
    lines.extend([
        "",
        f"Decision: **{report['decision']}**",
        "",
        "Promotion-screen candidates:",
        "",
    ])
    if report["promotionScreen"]:
        lines.extend(f"- {name}" for name in report["promotionScreen"])
    else:
        lines.append("- none")
    lines.append("")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=DEFAULT_OOF)
    parser.add_argument(
        "--formal-librosa", type=Path, action="append", default=[]
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
        args.formal_librosa = [DEFAULT_FORMAL_LIBROSA]
    report = run(args)
    print(json.dumps({
        "decision": report["decision"],
        "incumbent": report["incumbent"],
        "topCandidates": [
            {"name": name, **report["candidates"][name]}
            for name in report["ranking"][:10]
        ],
        "promotionScreen": report["promotionScreen"],
        "report": str(args.report),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
