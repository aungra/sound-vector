#!/usr/bin/env python3
"""Screen production-safe independent-source features on the frozen holdouts."""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.preprocessing import StandardScaler


ROOT = Path(__file__).resolve().parents[3]
CACHE = Path("/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training")
DEFAULT_OOF = CACHE / "unknown80-incumbent-caphe-oof-audio-only.npz"
DEFAULT_FEATURES = CACHE / "essentia-mtg-jamendo-feature-cache.json"
DEFAULT_TRACK_DB = CACHE / "runtime-track-segment-features-v3_0.sqlite3"
DEFAULT_REPORT = ROOT / "genre-training/unknown65-independent-aux-screen.json"
DEFAULT_MARKDOWN = ROOT / "genre-training/unknown65-independent-aux-screen.md"
MANIFESTS = (
    ("MTG-Jamendo", "detail-genre-mtg-source-manifest.json"),
    ("FMA", "detail-genre-fma-source-manifest.json"),
    ("ccMixter", "detail-genre-ccmixter-source-manifest.json"),
    ("Internet Archive", "detail-genre-internet-archive-source-manifest.json"),
    ("Wikimedia Commons", "detail-genre-wikimedia-category-source-manifest.json"),
    ("Wikimedia Commons", "detail-genre-wikimedia-source-manifest.json"),
)
ALPHAS = (0.05, 0.10, 0.20, 0.30, 0.50)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def normalize(values):
    values = np.maximum(np.asarray(values, dtype=np.float64), 1e-12)
    return values / np.maximum(values.sum(axis=1, keepdims=True), 1e-12)


def hierarchy_map(path):
    text = path.read_text()
    rows = re.findall(
        r'^\s*\["([^"]+)",\s*"[^"]+",\s*"([^"]+)"', text, re.MULTILINE,
    )
    return dict(rows)


def production_safe(item):
    license_name = str(item.get("license", "")).upper().replace(" ", "-")
    if "NC" in license_name or "ND" in license_name:
        return False
    return (
        license_name.startswith("CC0")
        or license_name.startswith("CC-BY")
        or "PUBLIC-DOMAIN" in license_name
    )


def feature_key(item):
    path = item.get("filePath")
    return f"cc-dataset:{path}" if path else ""


def load_auxiliary(features, detail_to_visual, labels):
    rows = []
    diagnostics = {}
    label_set = set(labels)
    for default_family, filename in MANIFESTS:
        payload = json.loads((CACHE / filename).read_text())
        accepted = 0
        available = 0
        for item in payload.get("items", []):
            if not item.get("singleTargetEligible") or not production_safe(item):
                continue
            accepted += 1
            visual = detail_to_visual.get(str(item.get("detailTarget", "")))
            key = feature_key(item)
            vector = features.get(key)
            if visual not in label_set or not isinstance(vector, list):
                continue
            values = np.asarray(vector, dtype=np.float32)
            if values.shape != (261,) or not np.all(np.isfinite(values)):
                continue
            family = str(item.get("sourceFamily") or default_family)
            rows.append((key, visual, default_family, family, values))
            available += 1
        diagnostics[filename] = {"productionSafe": accepted, "featureRows": available}
    deduplicated = {}
    for row in rows:
        deduplicated.setdefault((row[0], row[1]), row)
    return list(deduplicated.values()), diagnostics


def related_to_holdout(family, held_source):
    family = family.lower()
    held = held_source.lower()
    if held == "jamendo":
        return "jamendo" in family or family == "mtg-jamendo"
    if held == "fma":
        return family == "fma"
    if "wikimedia" in held:
        return "wikimedia" in family
    if "internet archive" in held:
        return "internet archive" in family or family.startswith("ia netlabel")
    if "rwc" in held:
        return "rwc" in family
    if "idol" in held:
        return "idol" in family
    if "caphe" in held:
        return "caphe" in family
    if "magnatagatune" in held:
        return "magnatagatune" in family
    return False


def balanced_weights(actual, families):
    counts = Counter(zip(actual, families))
    values = np.asarray([
        1.0 / counts[(label, family)] for label, family in zip(actual, families)
    ], dtype=np.float64)
    return values / max(float(values.mean()), 1e-12)


def aligned_probabilities(model, values, labels):
    raw = model.predict_proba(values)
    indexes = {str(label): index for index, label in enumerate(model.classes_)}
    output = np.asarray([
        [row[indexes[label]] if label in indexes else 0.0 for label in labels]
        for row in raw
    ], dtype=np.float64)
    return normalize(output)


def source_centroid_scores(train_values, train_actual, train_families, test_values, labels):
    scaler = StandardScaler().fit(train_values)
    train = scaler.transform(train_values)
    test = scaler.transform(test_values)
    by_label_source = defaultdict(list)
    for vector, label, family in zip(train, train_actual, train_families):
        by_label_source[(label, family)].append(vector)
    centroids = {}
    for label in labels:
        source_centroids = [
            np.mean(rows, axis=0) for (candidate, _source), rows in by_label_source.items()
            if candidate == label
        ]
        if source_centroids:
            centroids[label] = np.mean(source_centroids, axis=0)
    distances = np.full((len(test), len(labels)), 1e6, dtype=np.float64)
    for column, label in enumerate(labels):
        if label in centroids:
            delta = test - centroids[label]
            distances[:, column] = np.mean(delta * delta, axis=1)
    scale = np.median(distances[np.isfinite(distances) & (distances < 1e6)])
    return normalize(np.exp(-distances / max(float(scale), 1e-6)))


def top3_reorder(base, learned, alpha):
    output = base.copy()
    for row_index, row in enumerate(base):
        columns = np.argsort(-row, kind="stable")[:3]
        current = normalize(row[columns][None, :])[0]
        evidence = normalize(learned[row_index, columns][None, :])[0]
        target = current * (1.0 - alpha) + evidence * alpha
        order = columns[np.argsort(-target, kind="stable")]
        output[row_index, order] = np.sort(row[columns])[::-1]
    return output


def metric(actual, scores, labels, sources):
    labels_array = np.asarray(labels, dtype=object)
    order = np.argsort(-scores, axis=1, kind="stable")
    predicted = labels_array[order[:, 0]]
    correct = predicted == actual
    recalls = [np.mean(correct[actual == label]) for label in sorted(set(actual))]
    by_source = {
        source: round(float(np.mean(correct[sources == source])) * 100, 2)
        for source in sorted(set(sources))
    }
    return {
        "top1Accuracy": round(float(np.mean(correct)) * 100, 2),
        "balancedTop1": round(float(np.mean(recalls)) * 100, 2),
        "minimumSourceTop1": min(by_source.values()),
        "top3Accuracy": round(float(np.mean([
            truth in labels_array[row[:3]] for truth, row in zip(actual, order)
        ])) * 100, 2),
        "bySourceTop1": by_source,
    }


def nested_top1_router(actual, sources, labels, candidate_scores, held_sources):
    """Choose a candidate by incumbent Top1 using other source folds only."""
    incumbent = candidate_scores["incumbent"]
    base_top = np.asarray(labels, dtype=object)[np.argmax(incumbent, axis=1)]
    output = incumbent.copy()
    choices = []
    candidate_names = list(candidate_scores)
    for held_source in held_sources:
        inner = sources != held_source
        outer = sources == held_source
        route = {}
        for label in labels:
            bucket = inner & (base_top == label)
            if int(np.sum(bucket)) < 20:
                route[label] = "incumbent"
                continue
            baseline_correct = int(np.sum(
                np.asarray(labels, dtype=object)[np.argmax(incumbent[bucket], axis=1)]
                == actual[bucket]
            ))
            best_name = "incumbent"
            best_correct = baseline_correct
            for name in candidate_names:
                predicted = np.asarray(labels, dtype=object)[
                    np.argmax(candidate_scores[name][bucket], axis=1)
                ]
                correct = int(np.sum(predicted == actual[bucket]))
                if correct > best_correct:
                    best_name, best_correct = name, correct
            # Require repeatable evidence, not a one-row chance improvement.
            route[label] = best_name if best_correct >= baseline_correct + 2 else "incumbent"
        for label, name in route.items():
            mask = outer & (base_top == label)
            output[mask] = candidate_scores[name][mask]
        choices.append({"heldOutSource": str(held_source), "routes": route})
    return output, choices


def nested_pair_router(actual, sources, labels, candidate_scores, held_sources):
    """Choose a candidate by the unordered incumbent Top2 boundary."""
    labels_array = np.asarray(labels, dtype=object)
    incumbent = candidate_scores["incumbent"]
    top2 = np.argsort(-incumbent, axis=1, kind="stable")[:, :2]
    keys = np.asarray([
        "\u0000".join(sorted((str(labels_array[row[0]]), str(labels_array[row[1]]))))
        for row in top2
    ], dtype=object)
    output = incumbent.copy()
    choices = []
    candidate_names = list(candidate_scores)
    for held_source in held_sources:
        inner = sources != held_source
        outer = sources == held_source
        route = {}
        for key in sorted(set(keys[inner])):
            bucket = inner & (keys == key)
            if int(np.sum(bucket)) < 12:
                route[key] = "incumbent"
                continue
            baseline_predicted = labels_array[np.argmax(incumbent[bucket], axis=1)]
            baseline_correct = int(np.sum(baseline_predicted == actual[bucket]))
            best_name = "incumbent"
            best_correct = baseline_correct
            for name in candidate_names:
                predicted = labels_array[np.argmax(candidate_scores[name][bucket], axis=1)]
                correct = int(np.sum(predicted == actual[bucket]))
                if correct > best_correct:
                    best_name, best_correct = name, correct
            route[key] = best_name if best_correct >= baseline_correct + 2 else "incumbent"
        for key, name in route.items():
            mask = outer & (keys == key)
            output[mask] = candidate_scores[name][mask]
        choices.append({"heldOutSource": str(held_source), "routes": route})
    return output, choices


def render(report):
    lines = [
        "# Unknown65 independent auxiliary screen", "",
        "Production-safe full tracks only; outer holdout source is removed from auxiliary training.", "",
        "| candidate | Top1 | balanced | minimum source | Top3 |",
        "|---|---:|---:|---:|---:|",
    ]
    for name in report["ranking"]:
        score = report["candidates"][name]
        lines.append(
            f"| {name} | {score['top1Accuracy']:.2f}% | {score['balancedTop1']:.2f}% | "
            f"{score['minimumSourceTop1']:.2f}% | {score['top3Accuracy']:.2f}% |"
        )
    lines.extend(["", f"Selected: **{report['selected']}**", ""])
    return "\n".join(lines)


def run(args):
    payload = np.load(args.oof)
    labels = [str(value) for value in payload["labels"]]
    actual = payload["actual"].astype(object)
    sources = payload["sources"].astype(object)
    eligible = payload["trainingEligible"].astype(bool)
    base = payload["selectedScores"].astype(np.float64)
    feature_payload = json.loads(args.features.read_text())
    evaluation = np.zeros((len(actual), 261), dtype=np.float32)
    available = np.zeros(len(actual), dtype=bool)
    for index, key in enumerate(payload["sourceKeys"]):
        vector = feature_payload.get(str(key))
        if isinstance(vector, list) and len(vector) == 261:
            evaluation[index] = np.asarray(vector, dtype=np.float32)
            available[index] = bool(np.all(np.isfinite(evaluation[index])))
    detail_map = hierarchy_map(ROOT / "apps/demo/genre-hierarchy.js")
    auxiliary, manifest_diagnostics = load_auxiliary(feature_payload, detail_map, labels)
    pair = load_module(
        Path(__file__).with_name("genre-unknown65-track-pair-screen.py"),
        "unknown65_aux_track",
    )
    track_views, track_available = pair.load_track_views(
        args.track_db, payload["sourceKeys"],
    )
    held_sources = sorted(source for source, count in Counter(sources).items() if count >= 8)
    names = ["incumbent"]
    for kind in ("logistic", "centroid"):
        for alpha in ALPHAS:
            names.extend((f"{kind}-global-a{alpha:g}", f"{kind}-top3-a{alpha:g}"))
    names.extend(("track-effnet-top3-a0.1", "track-punk-rock-pair"))
    outputs = {name: [] for name in names}
    fold_actual, fold_sources, folds = [], [], []
    for fold_index, held_source in enumerate(held_sources):
        test = np.flatnonzero(sources == held_source)
        test_available = test[available[test]]
        train = np.flatnonzero((sources != held_source) & eligible & available)
        track_train = np.flatnonzero(
            (sources != held_source) & eligible & track_available
        )
        track_test_available = test[track_available[test]]
        rows = {}
        for index in train:
            key = str(payload["sourceKeys"][index])
            rows[(key, str(actual[index]))] = (
                key, str(actual[index]), str(sources[index]), evaluation[index],
            )
        for key, label, default_family, family, vector in auxiliary:
            if not related_to_holdout(default_family, str(held_source)):
                rows.setdefault((key, label), (key, label, family, vector))
        train_rows = list(rows.values())
        train_values = np.asarray([row[3] for row in train_rows], dtype=np.float32)
        train_actual = np.asarray([row[1] for row in train_rows], dtype=object)
        train_families = np.asarray([row[2] for row in train_rows], dtype=object)
        learned_by_kind = {}
        if len(test_available):
            scaler = StandardScaler().fit(train_values)
            model = LogisticRegression(
                C=0.08, class_weight="balanced", max_iter=1800,
                solver="lbfgs", random_state=65001 + fold_index,
            )
            model.fit(
                scaler.transform(train_values), train_actual,
                sample_weight=balanced_weights(train_actual, train_families),
            )
            learned_by_kind["logistic"] = aligned_probabilities(
                model, scaler.transform(evaluation[test_available]), labels,
            )
            learned_by_kind["centroid"] = source_centroid_scores(
                train_values, train_actual, train_families,
                evaluation[test_available], labels,
            )
        owner = {row: local for local, row in enumerate(test)}
        outputs["incumbent"].append(base[test].copy())
        for kind in ("logistic", "centroid"):
            for alpha in ALPHAS:
                for mode in ("global", "top3"):
                    name = f"{kind}-{mode}-a{alpha:g}"
                    result = base[test].copy()
                    if len(test_available):
                        current = base[test_available]
                        learned = learned_by_kind[kind]
                        adjusted = (
                            normalize(current * (1.0 - alpha) + learned * alpha)
                            if mode == "global" else top3_reorder(current, learned, alpha)
                        )
                        for local, row in enumerate(test_available):
                            result[owner[int(row)]] = adjusted[local]
                    outputs[name].append(result)
        track_owner = {row: local for local, row in enumerate(test)}
        track_backbone = base[test].copy()
        if len(track_train) and len(track_test_available):
            track_model = ExtraTreesClassifier(
                n_estimators=420, max_features="sqrt", min_samples_leaf=2,
                class_weight="balanced", n_jobs=-1,
                random_state=166001 + fold_index,
            )
            track_model.fit(
                track_views["effnet"][track_train], actual[track_train],
                sample_weight=pair.source_label_weights(actual, sources, track_train),
            )
            learned = aligned_probabilities(
                track_model, track_views["effnet"][track_test_available], labels,
            )
            adjusted = top3_reorder(
                base[track_test_available], learned, 0.10,
            )
            for local, row in enumerate(track_test_available):
                track_backbone[track_owner[int(row)]] = adjusted[local]
        outputs["track-effnet-top3-a0.1"].append(track_backbone)

        pair_candidate = base[test].copy()
        pair_config = {
            "labels": ("パンク", "ロック"), "view": "effnet", "kind": "trees",
            "weight": 0.25, "floor": 0.50, "topk": 2,
        }
        pair_model, _detail = pair.fit_model(
            pair_config, track_views["effnet"], actual, sources, track_train,
            166501 + fold_index,
        )
        if pair_model is not None and len(track_test_available):
            adjusted, _applied, _changed = pair.apply_pair(
                base[track_test_available].copy(), track_views["effnet"],
                track_test_available, labels, pair_config, pair_model,
            )
            for local, row in enumerate(track_test_available):
                pair_candidate[track_owner[int(row)]] = adjusted[local]
        outputs["track-punk-rock-pair"].append(pair_candidate)
        fold_actual.append(actual[test])
        fold_sources.append(sources[test])
        folds.append({
            "heldOutSource": str(held_source), "trainingRows": len(train_rows),
            "evaluationRows": len(test), "evaluationFeatureRows": len(test_available),
            "trackFeatureRows": len(track_test_available),
        })
    joined_actual = np.concatenate(fold_actual)
    joined_sources = np.concatenate(fold_sources)
    joined_outputs = {name: np.concatenate(outputs[name]) for name in names}
    nested_scores, nested_choices = nested_top1_router(
        joined_actual, joined_sources, labels, joined_outputs, held_sources,
    )
    joined_outputs["nested-top1-router"] = nested_scores
    pair_scores, pair_choices = nested_pair_router(
        joined_actual, joined_sources, labels, joined_outputs, held_sources,
    )
    joined_outputs["nested-pair-router"] = pair_scores
    candidates = {
        name: metric(joined_actual, scores, labels, joined_sources)
        for name, scores in joined_outputs.items()
    }
    ranking = sorted(candidates, key=lambda name: (
        candidates[name]["top1Accuracy"], candidates[name]["balancedTop1"],
        candidates[name]["minimumSourceTop1"], candidates[name]["top3Accuracy"],
    ), reverse=True)
    baseline = candidates["incumbent"]
    eligible_candidates = [name for name in ranking if (
        candidates[name]["top1Accuracy"] >= baseline["top1Accuracy"]
        and candidates[name]["balancedTop1"] >= baseline["balancedTop1"]
        and candidates[name]["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
        and candidates[name]["top3Accuracy"] >= baseline["top3Accuracy"] - 1.0
    )]
    selected = eligible_candidates[0] if eligible_candidates else "incumbent"
    report = {
        "objective": "Production-safe independent-source auxiliary screen toward strict 65% Top1.",
        "policy": {
            "metadataUsedAtInference": False, "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False, "outerSourceExcludedFromAuxiliaryTraining": True,
            "licenses": ["CC0", "Public Domain", "CC-BY", "CC-BY-SA"],
        },
        "dataset": {
            "rows": len(joined_actual), "labels": len(labels),
            "evaluationFeatureRows": int(np.sum(available)),
            "auxiliaryRows": len(auxiliary), "sources": held_sources,
        },
        "manifestDiagnostics": manifest_diagnostics, "folds": folds,
        "nestedRouter": nested_choices, "nestedPairRouter": pair_choices,
        "candidates": candidates, "ranking": ranking, "selected": selected,
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=DEFAULT_OOF)
    parser.add_argument("--features", type=Path, default=DEFAULT_FEATURES)
    parser.add_argument("--track-db", type=Path, default=DEFAULT_TRACK_DB)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    print(render(run(args)))


if __name__ == "__main__":
    main()
