#!/usr/bin/env python3
"""Screen production-eligible audio representations on the fixed 61.50% OOF."""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.decomposition import PCA
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


ROOT = Path(__file__).resolve().parents[3]
CACHE_ROOT = Path("/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training")
DEFAULT_OOF = CACHE_ROOT / "unknown65-v114-musicfm-phase1-oof.npz"
DEFAULT_CACHE = CACHE_ROOT / "musicnn-feature-cache.json"
DEFAULT_REPORT = ROOT / "genre-training/unknown65-frozen-representation-screen.json"
WEIGHTS = (0.05, 0.10, 0.20, 0.30, 0.50, 0.75, 1.0)
FLOORS = (0.0, 0.40, 0.50, 0.60, 0.70, 0.80)
MARGINS = (0.0, 0.05, 0.10, 0.20)


def normalize(values):
    output = np.maximum(np.asarray(values, dtype=np.float64), 1e-12)
    return output / np.maximum(output.sum(axis=1, keepdims=True), 1e-12)


def metric(actual, scores, labels, sources):
    label_array = np.asarray(labels, dtype=object)
    order = np.argsort(-scores, axis=1, kind="stable")
    predicted = label_array[order[:, 0]]
    correct = predicted == actual
    recalls = [
        float(np.mean(correct[actual == label]))
        for label in sorted(set(actual)) if np.any(actual == label)
    ]
    by_source = {
        source: round(float(np.mean(correct[sources == source])) * 100, 2)
        for source in sorted(set(sources))
    }
    return {
        "top1Accuracy": round(float(np.mean(correct)) * 100, 2),
        "balancedTop1": round(float(np.mean(recalls)) * 100, 2),
        "minimumSourceTop1": min(by_source.values(), default=0.0),
        "top3Accuracy": round(float(np.mean([
            truth in label_array[row[:3]] for truth, row in zip(actual, order)
        ])) * 100, 2),
        "sourceTop1": by_source,
    }


def compare(candidate, baseline, actual, labels, sources):
    result = metric(actual, candidate, labels, sources)
    baseline_metric = metric(actual, baseline, labels, sources)
    label_array = np.asarray(labels, dtype=object)
    old = label_array[np.argmax(baseline, axis=1)]
    new = label_array[np.argmax(candidate, axis=1)]
    source_deltas = {
        source: round(
            result["sourceTop1"][source] - baseline_metric["sourceTop1"][source], 2,
        )
        for source in result["sourceTop1"]
    }
    result.update({
        "changedTop1": int(np.sum(old != new)),
        "improved": int(np.sum((old != actual) & (new == actual))),
        "harmed": int(np.sum((old == actual) & (new != actual))),
        "sourceTop1Delta": source_deltas,
        "maximumSourceDrop": min(source_deltas.values(), default=0.0),
    })
    return result


def source_label_weights(actual, sources, indexes):
    counts = Counter((actual[index], sources[index]) for index in indexes)
    weights = np.asarray([
        1.0 / counts[(actual[index], sources[index])] for index in indexes
    ], dtype=np.float64)
    return weights / max(float(weights.mean()), 1e-12)


class SourceCentroidClassifier:
    def fit(self, values, actual, sources):
        self.scaler = StandardScaler().fit(values)
        transformed = self.scaler.transform(values)
        grouped = defaultdict(list)
        for vector, label, source in zip(transformed, actual, sources):
            grouped[(label, source)].append(vector)
        self.classes_ = np.asarray(sorted(set(actual)), dtype=object)
        centroids = []
        for label in self.classes_:
            per_source = [
                np.mean(rows, axis=0)
                for (candidate, _source), rows in grouped.items()
                if candidate == label
            ]
            centroids.append(np.mean(per_source, axis=0))
        self.centroids_ = np.asarray(centroids, dtype=np.float64)
        return self

    def predict_proba(self, values):
        transformed = self.scaler.transform(values)
        distances = np.mean(
            (transformed[:, None, :] - self.centroids_[None, :, :]) ** 2,
            axis=2,
        )
        scale = max(float(np.median(distances)), 1e-6)
        return normalize(np.exp(-distances / scale))


def fit_model(kind, values, actual, sources, indexes, seed):
    x = values[indexes]
    y = actual[indexes]
    if kind == "centroid":
        return SourceCentroidClassifier().fit(x, y, sources[indexes])
    weights = source_label_weights(actual, sources, indexes)
    if kind == "extra-trees":
        model = ExtraTreesClassifier(
            n_estimators=500, max_features="sqrt", min_samples_leaf=2,
            class_weight="balanced", n_jobs=-1, random_state=seed,
        )
        model.fit(x, y, sample_weight=weights)
        return model
    components = max(2, min(64, len(indexes) - len(set(y)), x.shape[1]))
    model = make_pipeline(
        StandardScaler(),
        PCA(n_components=components, whiten=True, random_state=seed),
        LogisticRegression(
            C=0.1, class_weight="balanced", max_iter=2000,
            random_state=seed,
        ),
    )
    model.fit(x, y, logisticregression__sample_weight=weights)
    return model


def align(model, values, labels):
    raw = model.predict_proba(values)
    classes = list(model.classes_ if hasattr(model, "classes_") else model[-1].classes_)
    lookup = {str(label): index for index, label in enumerate(classes)}
    return normalize(np.asarray([
        [row[lookup[label]] if label in lookup else 0.0 for label in labels]
        for row in raw
    ], dtype=np.float64))


def feature_views(record, expected_dimension, cache_format):
    if cache_format == "mert":
        layers = record.get("layerMeans") if isinstance(record, dict) else None
        if not isinstance(layers, list):
            return {}
        hidden = int(record.get("hiddenSize") or (1024 if len(layers) % 1024 == 0 else 768))
        values = np.asarray(layers, dtype=np.float32)
        if len(values) % hidden or not np.all(np.isfinite(values)):
            return {}
        matrix = values.reshape(-1, hidden)
        indexes = sorted(set((0, len(matrix) // 4, len(matrix) // 2, len(matrix) * 3 // 4, len(matrix) - 1)))
        output = {f"layer-{index}": matrix[index] for index in indexes}
        output["layer-mean"] = np.mean(matrix, axis=0)
        return output
    if cache_format == "ast":
        if not isinstance(record, dict):
            return {}
        embedding = record.get("embedding")
        moments = record.get("moments")
        tags = record.get("tagMoments")
        if not all(isinstance(value, list) for value in (embedding, moments, tags)):
            return {}
        embedding = np.asarray(embedding, dtype=np.float32)
        moments = np.asarray(moments, dtype=np.float32)
        tags = np.asarray(tags, dtype=np.float32)
        if moments.shape != (embedding.size * 3,) or tags.size % 3:
            return {}
        if not all(np.all(np.isfinite(value)) for value in (embedding, moments, tags)):
            return {}
        return {
            "embedding": embedding,
            "moment-mean": moments.reshape(3, -1)[0],
            "tag-mean": tags.reshape(3, -1)[0],
            "embedding-tag": np.concatenate([embedding, tags.reshape(3, -1)[0]]),
        }
    if cache_format == "panns":
        if not isinstance(record, dict):
            return {}
        moments = record.get("embeddingMoments")
        tags = record.get("tagMoments")
        if not isinstance(moments, list) or len(moments) != 6144:
            return {}
        if not isinstance(tags, list) or len(tags) != 1581:
            return {}
        moments = np.asarray(moments, dtype=np.float32).reshape(3, 2048)
        tags = np.asarray(tags, dtype=np.float32).reshape(3, 527)
        if not np.all(np.isfinite(moments)) or not np.all(np.isfinite(tags)):
            return {}
        return {
            "embedding-mean": moments[0],
            "tag-mean": tags[0],
            "embedding-tag": np.concatenate([moments[0], tags[0]]),
        }
    if cache_format == "yamnet":
        if not isinstance(record, dict):
            return {}
        moments = record.get("embeddingMoments")
        dynamics = record.get("embeddingDynamics")
        tags = record.get("tagMoments")
        if not isinstance(moments, list) or len(moments) != 3072:
            return {}
        if not isinstance(dynamics, list) or len(dynamics) != 3072:
            return {}
        if not isinstance(tags, list) or len(tags) != 1563:
            return {}
        moments = np.asarray(moments, dtype=np.float32).reshape(3, 1024)
        dynamics = np.asarray(dynamics, dtype=np.float32).reshape(3, 1024)
        tags = np.asarray(tags, dtype=np.float32).reshape(3, 521)
        if not all(np.all(np.isfinite(value)) for value in (moments, dynamics, tags)):
            return {}
        return {
            "embedding-mean": moments[0],
            "dynamics-mean": dynamics[0],
            "tag-mean": tags[0],
            "embedding-tag": np.concatenate([moments[0], tags[0]]),
        }
    if cache_format == "clap":
        if not isinstance(record, dict):
            return {}
        embedding = record.get("embedding")
        moments = record.get("moments")
        if not isinstance(embedding, list) or len(embedding) != 512:
            return {}
        if not isinstance(moments, list) or len(moments) != 1536:
            return {}
        embedding = np.asarray(embedding, dtype=np.float32)
        moments = np.asarray(moments, dtype=np.float32).reshape(3, 512)
        if not np.all(np.isfinite(embedding)) or not np.all(np.isfinite(moments)):
            return {}
        return {
            "embedding": embedding,
            "moment-mean": moments[0],
            "embedding-moment": np.concatenate([embedding, moments[0]]),
        }
    values = np.asarray(record, dtype=np.float32)
    if values.shape != (expected_dimension,) or not np.all(np.isfinite(values)):
        return {}
    result = {"full": values}
    if expected_dimension % 3 == 0:
        width = expected_dimension // 3
        moments = values.reshape(3, width)
        result.update({"first-third": moments[0], "third-mean": np.mean(moments, axis=0)})
    return result


def rerank(base, learned, config):
    output = np.asarray(base, dtype=np.float64).copy()
    for row_index, base_row in enumerate(base):
        columns = np.argsort(-base_row, kind="stable")[:3]
        evidence = normalize(learned[row_index, columns][None, :])[0]
        order = np.argsort(-evidence, kind="stable")
        confidence = float(evidence[order[0]])
        margin = confidence - float(evidence[order[1]])
        if confidence < config["floor"] or margin < config["margin"]:
            continue
        current = normalize(base_row[columns][None, :])[0]
        target = current * (1.0 - config["weight"]) + evidence * config["weight"]
        new_order = columns[np.argsort(-target, kind="stable")]
        output[row_index, new_order] = np.sort(base_row[columns])[::-1]
    return output


def run(args):
    payload = np.load(args.oof)
    base = payload["selectedScores"].astype(np.float64)
    labels = [str(value) for value in payload["labels"]]
    actual = payload["actual"].astype(object)
    sources = payload["sources"].astype(object)
    eligible = payload["trainingEligible"].astype(bool)
    cache = json.loads(args.cache.read_text()) if not args.base_only else {}
    views = {}
    row_views = (
        [{"base-logits": np.log(np.maximum(row, 1e-8))} for row in base]
        if args.base_only else [
            feature_views(cache.get(str(key)), args.dimension, args.cache_format)
            for key in payload["sourceKeys"]
        ]
    )
    for index, row in enumerate(row_views):
        for name, vector in row.items():
            if args.include_base_scores:
                vector = np.concatenate([
                    vector, np.log(np.maximum(base[index], 1e-8)),
                ])
            if name not in views:
                views[name] = np.zeros((len(actual), len(vector)), dtype=np.float32)
            views[name][index] = vector
    available = {
        name: np.asarray([
            name in row for row in row_views
        ], dtype=bool)
        for name in views
    }
    held_sources = sorted(source for source, count in Counter(sources).items() if count >= 8)
    learned_outputs = {}
    fold_diagnostics = []
    for view_index, (view, matrix) in enumerate(views.items()):
        for kind_index, kind in enumerate(("extra-trees", "logistic", "centroid")):
            name = f"{view}-{kind}"
            learned = np.zeros_like(base)
            learned_available = np.zeros(len(actual), dtype=bool)
            for fold_index, held_source in enumerate(held_sources):
                train = np.flatnonzero(
                    (sources != held_source) & eligible & available[view]
                )
                test = np.flatnonzero((sources == held_source) & available[view])
                if len(train) < 40 or not len(test):
                    continue
                model = fit_model(
                    kind, matrix, actual, sources, train,
                    16550001 + view_index * 100000 + kind_index * 10000 + fold_index * 100,
                )
                learned[test] = align(model, matrix[test], labels)
                learned_available[test] = True
            learned_outputs[name] = (learned, learned_available)
            fold_diagnostics.append({
                "candidate": name,
                "rows": int(np.sum(learned_available)),
            })
    baseline = metric(actual, base, labels, sources)
    candidates = []
    outputs = {}
    for name, (learned, mask) in learned_outputs.items():
        for weight in WEIGHTS:
            for floor in FLOORS:
                for margin in MARGINS:
                    config = {"weight": weight, "floor": floor, "margin": margin}
                    output = base.copy()
                    output[mask] = rerank(base[mask], learned[mask], config)
                    result = compare(output, base, actual, labels, sources)
                    key = f"{name}-w{weight:g}-f{floor:g}-m{margin:g}"
                    outputs[key] = output
                    candidates.append({
                        "name": key, "representation": name, "config": config,
                        "metric": result,
                    })
    def passes_source_gate(row):
        result = row["metric"]
        return (
            result["maximumSourceDrop"] >= 0.0
            and result["balancedTop1"] >= baseline["balancedTop1"]
            and result["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
            and result["top3Accuracy"] >= baseline["top3Accuracy"]
        )

    candidates.sort(key=lambda row: (
        passes_source_gate(row),
        row["metric"]["top1Accuracy"], row["metric"]["balancedTop1"],
        row["metric"]["minimumSourceTop1"], -row["metric"]["harmed"],
    ), reverse=True)
    selected = candidates[0] if candidates else None
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "objective": "Screen a frozen audio representation after the 61.50% candidate.",
        "policy": {
            "metadataUsedAtInference": False,
            "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "heldOutSourceExcludedFromTraining": True,
            "top3CandidateSetChanged": False,
            "individualSourceNonRegressionRequired": True,
            "productionModelUpdated": False,
        },
        "dataset": {
            "rows": len(actual), "cache": str(args.cache),
            "dimension": args.dimension, "cacheFormat": args.cache_format,
            "baseScoresIncludedAsFeatures": args.include_base_scores,
            "baseScoresOnly": args.base_only,
            "viewCoverage": {name: int(np.sum(mask)) for name, mask in available.items()},
        },
        "baseline": baseline,
        "foldDiagnostics": fold_diagnostics,
        "selected": selected,
        "ranking": candidates[:50],
        "decision": "continue-independent-validation" if selected and (
            selected["metric"]["top1Accuracy"] > baseline["top1Accuracy"]
            and selected["metric"]["balancedTop1"] >= baseline["balancedTop1"]
            and selected["metric"]["minimumSourceTop1"] >= baseline["minimumSourceTop1"]
            and selected["metric"]["top3Accuracy"] >= baseline["top3Accuracy"]
            and selected["metric"]["maximumSourceDrop"] >= 0.0
        ) else "reject-representation",
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--oof", type=Path, default=DEFAULT_OOF)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--dimension", type=int, default=600)
    parser.add_argument(
        "--cache-format",
        choices=("vector", "mert", "ast", "panns", "yamnet", "clap"),
        default="vector",
    )
    parser.add_argument("--include-base-scores", action="store_true")
    parser.add_argument("--base-only", action="store_true")
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    report = run(args)
    print(json.dumps({
        "baseline": report["baseline"], "selected": report["selected"],
        "decision": report["decision"], "report": str(args.report),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
