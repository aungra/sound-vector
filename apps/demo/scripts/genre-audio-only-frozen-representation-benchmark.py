"""Compare audio representations on one frozen unknown-source cohort.

The benchmark is deliberately isolated from production export and the sealed
YouTube holdout. Every candidate sees the same tracks, source-family holdouts,
labels, and classifier settings; only its audio representation changes.
"""

from __future__ import annotations

import gc
import importlib.util
import json
import os
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from sklearn.decomposition import PCA
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import LinearSVC, SVC

from genre_source_family import source_family


ROOT = Path(__file__).resolve().parents[3]
TRAINING_DIR = ROOT / "genre-training"
ENGINE_PATH = Path(__file__).with_name("genre-embedding-macro-specialists.py")
BENCHMARK_PATH = Path(__file__).with_name("genre-embedding-32-benchmark.py")
REPORT_PATH = Path(os.environ.get(
    "MMFR_AUDIO_REPRESENTATION_REPORT_PATH",
    str(TRAINING_DIR / "audio-only-frozen-representation-benchmark.json"),
))
AUDIT_PATH = Path(os.environ.get(
    "MMFR_AUDIO_REPRESENTATION_AUDIT_PATH",
    str(TRAINING_DIR / "audio-only-frozen-representation-benchmark.md"),
))
EVALUATION_SPLITS_PATH = Path(os.environ.get(
    "MMFR_RUNTIME_GENERALIZATION_EVALUATION_SPLITS_PATH",
    str(TRAINING_DIR / "dataset-splits.json"),
))
MIN_SOURCE_ROWS = max(5, int(os.environ.get("MMFR_AUDIO_REP_MIN_SOURCE_ROWS", "12")))
TREE_COUNT = max(80, int(os.environ.get("MMFR_AUDIO_REP_TREE_COUNT", "260")))
PROBE_PCA_COMPONENTS = max(
    16, int(os.environ.get("MMFR_AUDIO_REP_PROBE_PCA_COMPONENTS", "128"))
)
SEEDS = tuple(
    int(value.strip())
    for value in os.environ.get("MMFR_AUDIO_REP_SEEDS", "108001").split(",")
    if value.strip()
)
DISCOGS_TAG_DIMENSIONS = 1200

CACHE_SPECS = {
    "discogs": (
        Path(os.environ.get(
            "MMFR_ESSENTIA_DISCOGS_CACHE_PATH",
            "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/essentia-discogs-feature-cache.json",
        )),
        5040,
    ),
    "librosa": (
        Path(os.environ.get(
            "MMFR_LIBROSA_FEATURE_CACHE_PATH",
            "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/librosa-feature-cache.json",
        )),
        547,
    ),
    "mtg": (
        Path(os.environ.get(
            "MMFR_ESSENTIA_MTG_CACHE_PATH",
            "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/essentia-mtg-jamendo-feature-cache.json",
        )),
        261,
    ),
    "musicnn": (
        Path(os.environ.get(
            "MMFR_MUSICNN_CACHE_PATH",
            "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/musicnn-feature-cache.json",
        )),
        600,
    ),
    "specialist": (
        Path(os.environ.get(
            "MMFR_ESSENTIA_SPECIALIST_CACHE_PATH",
            "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/essentia-genre-specialist-moment-v2-cache.json",
        )),
        2856,
    ),
    "maest30": (
        Path(os.environ.get(
            "MMFR_MAEST_30S_CACHE_PATH",
            "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/maest-prediction-moments-30s-cache.json",
        )),
        1200,
    ),
}

FEATURE_SPECS = {
    "runtime-v2.1": (("discogs_tail", "librosa"), "logistic-pca192"),
    "runtime-v2.1-extra-trees": (("discogs_tail", "librosa"), "extra-trees"),
    "discogs-full": (("discogs",), "extra-trees"),
    "mtg-head": (("mtg",), "extra-trees"),
    "musicnn": (("musicnn",), "extra-trees"),
    "specialist-heads": (("specialist",), "extra-trees"),
    "maest30-moments": (("maest30",), "extra-trees"),
    "maest30-runtime": (("maest30", "discogs_tail", "librosa"), "extra-trees"),
    "all-audio-heads": (
        ("maest30", "discogs_tail", "librosa", "mtg", "musicnn", "specialist"),
        "extra-trees",
    ),
}
TIMELINE_CACHE_PATH = Path(os.environ.get(
    "MMFR_V2_SEGMENT_CACHE_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/v2-multi-segment-feature-cache.json",
))

# Frozen before this benchmark in genre-maest-pair-rescue-cv.py. These are
# evaluated transfer-only; no threshold is selected on the frozen cohort.
FROZEN_PAIR_RULES = (
    {"predicted": "アンビエント", "rescue": "クラシック音楽", "threshold": 0.75},
    {"predicted": "ロック", "rescue": "フォーク", "threshold": 0.35},
    {"predicted": "ハードコア", "rescue": "メタル", "threshold": 0.15},
    {"predicted": "ジャズ", "rescue": "ラテン", "threshold": 0.45},
    {"predicted": "アンビエント", "rescue": "ドローン", "threshold": 0.35},
    {"predicted": "テクノ", "rescue": "ハウス", "threshold": 0.45},
    {"predicted": "フォーク", "rescue": "ラテン", "threshold": 0.35},
    {"predicted": "パンク", "rescue": "ロック", "threshold": 0.55},
    {"predicted": "アンビエント", "rescue": "ダブ", "threshold": 0.75},
)

SEMANTIC_FAMILIES = {
    "electronic": (
        "テクノ", "ハウス", "ディープ・ハウス", "トランス",
        "ドラムンベース", "ダブステップ", "チップチューン",
    ),
    "black_music": (
        "ヒップホップ", "トラップ", "レゲエ", "ダブ", "ブルース",
        "ファンク", "ソウルミュージック", "ディスコ",
    ),
    "acoustic_structural": (
        "アンビエント", "ドローン", "ノイズミュージック",
        "クラシック音楽", "オペラ", "ジャズ", "フォーク", "ラテン",
    ),
    "guitar_pop": (
        "ロック", "パンク", "ハードコア", "メタル", "J-POP",
        "シティ・ポップ", "アニメソング",
    ),
}


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def iter_json_object(path: Path, chunk_size: int = 1024 * 1024):
    """Yield a top-level JSON object's entries without retaining the object."""

    decoder = json.JSONDecoder()
    with path.open("r", encoding="utf-8") as handle:
        buffer = ""
        position = 0
        eof = False

        def refill():
            nonlocal buffer, position, eof
            if position:
                buffer = buffer[position:]
                position = 0
            chunk = handle.read(chunk_size)
            if chunk:
                buffer += chunk
            else:
                eof = True

        def ensure_content():
            nonlocal position
            while True:
                while position < len(buffer) and buffer[position].isspace():
                    position += 1
                if position < len(buffer) or eof:
                    return
                refill()

        def decode_value():
            nonlocal position
            while True:
                ensure_content()
                try:
                    value, end = decoder.raw_decode(buffer, position)
                    position = end
                    return value
                except json.JSONDecodeError:
                    if eof:
                        raise
                    refill()

        refill()
        ensure_content()
        if position >= len(buffer) or buffer[position] != "{":
            raise ValueError(f"Expected a JSON object: {path}")
        position += 1
        while True:
            ensure_content()
            if position < len(buffer) and buffer[position] == "}":
                return
            key = decode_value()
            if not isinstance(key, str):
                raise ValueError(f"Expected a string key in {path}")
            ensure_content()
            if position >= len(buffer) or buffer[position] != ":":
                raise ValueError(f"Expected ':' after {key!r} in {path}")
            position += 1
            value = decode_value()
            yield key, value
            ensure_content()
            if position < len(buffer) and buffer[position] == ",":
                position += 1
                continue
            if position < len(buffer) and buffer[position] == "}":
                return
            if eof:
                raise ValueError(f"Unexpected end of JSON object: {path}")
            refill()


def load_selected_vectors(path: Path, expected_size: int, wanted_keys: set[str]):
    values = {}
    invalid = 0
    for key, value in iter_json_object(path):
        if key not in wanted_keys:
            continue
        if not isinstance(value, list) or len(value) != expected_size:
            invalid += 1
            continue
        vector = np.asarray(value, dtype=np.float32)
        vector[~np.isfinite(vector)] = 0.0
        values[key] = vector
    return values, invalid


def load_timeline_vectors(path: Path, wanted_keys: set[str], rows_by_key):
    payload = json.loads(path.read_text())
    items = payload.get("items", {}) if isinstance(payload, dict) else {}
    output = {}
    invalid = 0
    for source_key in wanted_keys:
        row = rows_by_key[source_key]
        candidates = (
            row.get("sourceUrl"), row.get("filePath"), row.get("referenceUrl"),
        )
        record = next((items.get(key) for key in candidates if key and key in items), None)
        vector = record.get("vector") if isinstance(record, dict) else None
        if not isinstance(vector, list) or len(vector) != 237:
            invalid += 1
            continue
        value = np.asarray(vector, dtype=np.float32)
        value[~np.isfinite(value)] = 0.0
        output[source_key] = value
    return output, invalid


def active_feature_specs(include_timeline=False):
    specs = dict(FEATURE_SPECS)
    if include_timeline:
        specs.update({
            "timeline-three-segment": (("timeline",), "extra-trees"),
            "maest30-timeline": (("maest30", "timeline"), "extra-trees"),
            "runtime-timeline": (("discogs_tail", "librosa", "timeline"), "logistic-pca192"),
        })
    return specs


def row_key(engine, row):
    return engine.source_key(row)


def metric(actual, scores, labels):
    actual = np.asarray(actual, dtype=object)
    order = np.argsort(-scores, axis=1)
    predicted = np.asarray([labels[index] for index in order[:, 0]], dtype=object)
    top3 = [set(labels[index] for index in row[:3]) for row in order]
    by_label = {}
    for label in sorted(set(actual)):
        mask = actual == label
        count = int(mask.sum())
        correct = int(np.sum(predicted[mask] == label))
        top3_correct = sum(
            label in candidates
            for candidates, selected in zip(top3, mask)
            if selected
        )
        by_label[label] = {
            "total": count,
            "top1": correct,
            "top3": int(top3_correct),
            "accuracy": round(correct / max(1, count) * 100, 1),
            "top3Accuracy": round(top3_correct / max(1, count) * 100, 1),
            "topPredictions": [
                {"label": name, "count": value}
                for name, value in Counter(predicted[mask]).most_common(5)
            ],
        }
    return {
        "total": len(actual),
        "top1Accuracy": round(float(np.mean(predicted == actual)) * 100, 2),
        "top3Accuracy": round(
            sum(label in candidates for label, candidates in zip(actual, top3))
            / max(1, len(actual)) * 100,
            2,
        ),
        "balancedTop1": round(float(np.mean([
            value["top1"] / value["total"] for value in by_label.values()
        ])) * 100, 2),
        "byLabel": by_label,
    }


class WeightedCosineCentroidClassifier:
    """Source-weighted class prototypes for frozen neural embeddings."""

    def __init__(self, temperature=12.0):
        self.temperature = float(temperature)

    @staticmethod
    def _normalize(values):
        matrix = np.asarray(values, dtype=np.float64)
        return matrix / np.maximum(np.linalg.norm(matrix, axis=1, keepdims=True), 1e-12)

    def fit(self, x, y, sample_weight=None):
        matrix = self._normalize(x)
        targets = np.asarray(y, dtype=object)
        weights = np.ones(len(targets), dtype=np.float64) if sample_weight is None else np.asarray(
            sample_weight, dtype=np.float64,
        )
        self.classes_ = np.asarray(sorted(set(targets)), dtype=object)
        centroids = []
        for label in self.classes_:
            mask = targets == label
            centroid = np.average(matrix[mask], axis=0, weights=weights[mask])
            centroids.append(centroid)
        self.centroids_ = self._normalize(np.asarray(centroids))
        return self

    def predict_proba(self, x):
        similarities = self._normalize(x) @ self.centroids_.T
        logits = similarities * self.temperature
        logits -= np.max(logits, axis=1, keepdims=True)
        scores = np.exp(np.clip(logits, -60.0, 0.0))
        return scores / np.maximum(scores.sum(axis=1, keepdims=True), 1e-12)


class EncodedXGBoostClassifier:
    """Keep the public class contract in canonical string-label space."""

    def __init__(self, seed):
        self.seed = seed

    def fit(self, x, y, sample_weight=None):
        try:
            from xgboost import XGBClassifier
        except ImportError as error:
            raise RuntimeError(
                "xgboost model requested but the xgboost package is unavailable"
            ) from error
        targets = np.asarray(y, dtype=object)
        self.classes_ = np.asarray(sorted(set(targets)), dtype=object)
        lookup = {label: index for index, label in enumerate(self.classes_)}
        encoded = np.asarray([lookup[label] for label in targets], dtype=np.int32)
        classifier_options = {
            "objective": "binary:logistic" if len(self.classes_) == 2 else "multi:softprob",
        }
        if len(self.classes_) > 2:
            classifier_options["num_class"] = len(self.classes_)
        self.model_ = XGBClassifier(
            n_estimators=420,
            max_depth=4,
            learning_rate=0.035,
            min_child_weight=3.0,
            subsample=0.85,
            colsample_bytree=0.45,
            reg_alpha=0.05,
            reg_lambda=1.5,
            eval_metric="mlogloss",
            tree_method="hist",
            n_jobs=-1,
            random_state=self.seed,
            **classifier_options,
        )
        self.model_.fit(x, encoded, sample_weight=sample_weight)
        return self

    def predict_proba(self, x):
        return self.model_.predict_proba(x)


def fit_model(kind, x, y, seed, sample_weight=None):
    if kind == "cosine-centroid":
        return WeightedCosineCentroidClassifier().fit(x, y, sample_weight)
    if kind == "extra-trees":
        model = ExtraTreesClassifier(
            n_estimators=TREE_COUNT,
            max_features="sqrt",
            min_samples_leaf=1,
            class_weight="balanced",
            n_jobs=-1,
            random_state=seed,
        )
        model.fit(x, y, sample_weight=sample_weight)
        return model
    if kind == "xgboost":
        return EncodedXGBoostClassifier(seed).fit(x, y, sample_weight)
    if kind == "logistic":
        model = make_pipeline(
            StandardScaler(),
            LogisticRegression(
                C=0.35,
                class_weight="balanced",
                max_iter=1600,
                solver="lbfgs",
                random_state=seed + 1,
            ),
        )
        kwargs = {"logisticregression__sample_weight": sample_weight} if sample_weight is not None else {}
        model.fit(x, y, **kwargs)
        return model
    if kind == "logistic-pca192":
        components = max(1, min(192, x.shape[0] - 1, x.shape[1]))
        model = make_pipeline(
            StandardScaler(),
            PCA(n_components=components, random_state=seed, svd_solver="randomized"),
            LogisticRegression(
                C=0.7,
                class_weight="balanced",
                max_iter=1600,
                solver="lbfgs",
                random_state=seed + 1,
            ),
        )
        kwargs = {"logisticregression__sample_weight": sample_weight} if sample_weight is not None else {}
        model.fit(x, y, **kwargs)
        return model
    if kind in {"pca-rbf-svm", "pca-linear-svm", "pca-shrinkage-lda"}:
        components = max(1, min(PROBE_PCA_COMPONENTS, x.shape[0] - 1, x.shape[1]))
        if kind == "pca-rbf-svm":
            classifier = SVC(
                C=3.0,
                gamma="scale",
                kernel="rbf",
                class_weight="balanced",
                cache_size=4096,
                random_state=seed + 1,
            )
            fit_key = "svc__sample_weight"
        elif kind == "pca-linear-svm":
            classifier = LinearSVC(
                C=0.35,
                class_weight="balanced",
                dual="auto",
                max_iter=6000,
                random_state=seed + 1,
            )
            fit_key = "linearsvc__sample_weight"
        else:
            classifier = LinearDiscriminantAnalysis(solver="lsqr", shrinkage="auto")
            fit_key = None
        model = make_pipeline(
            StandardScaler(),
            PCA(n_components=components, random_state=seed, svd_solver="randomized"),
            classifier,
        )
        # LDA has no sample_weight contract. SVM probes receive the exact same
        # source/work weights as the existing production-oriented probes.
        kwargs = {fit_key: sample_weight} if fit_key and sample_weight is not None else {}
        model.fit(x, y, **kwargs)
        return model
    raise ValueError(f"Unknown model kind: {kind}")


def aligned_scores(model, x, labels):
    if hasattr(model, "predict_proba"):
        source = model.predict_proba(x)
    elif hasattr(model, "decision_function"):
        logits = np.asarray(model.decision_function(x), dtype=np.float64)
        if logits.ndim == 1:
            logits = np.column_stack([-logits, logits])
        logits -= np.max(logits, axis=1, keepdims=True)
        source = np.exp(np.clip(logits, -60.0, 0.0))
        source /= np.maximum(source.sum(axis=1, keepdims=True), 1e-12)
    else:
        raise TypeError(f"Model {type(model).__name__} exposes neither probabilities nor margins")
    classes = model.classes_ if hasattr(model, "classes_") else model[-1].classes_
    source_index = {label: index for index, label in enumerate(classes)}
    scores = np.asarray([
        [row[source_index[label]] if label in source_index else 0.0 for label in labels]
        for row in source
    ], dtype=np.float64)
    return scores / np.maximum(scores.sum(axis=1, keepdims=True), 1e-12)


def source_work_weights(rows, target):
    pair_counts = Counter((row[target], source_family(row)) for row in rows)
    work_counts = Counter(
        (row[target], source_family(row), str(
            row.get("canonicalArtist") or row.get("artistName") or row.get("artist") or row_key_placeholder(row)
        ).strip().casefold())
        for row in rows
    )
    label_counts = Counter(row[target] for row in rows)
    label_sources = defaultdict(set)
    for row in rows:
        label_sources[row[target]].add(source_family(row))
    weights = []
    for row in rows:
        label = row[target]
        source = source_family(row)
        work = str(
            row.get("canonicalArtist") or row.get("artistName") or row.get("artist") or row_key_placeholder(row)
        ).strip().casefold()
        source_weight = label_counts[label] / max(1, len(label_sources[label]) * pair_counts[(label, source)])
        work_weight = 1.0 / max(1, work_counts[(label, source, work)])
        weights.append(source_weight * work_weight)
    values = np.asarray(weights, dtype=np.float64)
    return values / max(float(values.mean()), 1e-12)


def row_key_placeholder(row):
    return row.get("sourceUrl") or row.get("filePath") or row.get("trackId") or "unknown"


def oracle_macro_scores(scores, labels, actual_macros, macro_lookup):
    masked = np.zeros_like(scores)
    for row_index, macro in enumerate(actual_macros):
        for label_index, label in enumerate(labels):
            if macro_lookup.get(label) == macro:
                masked[row_index, label_index] = scores[row_index, label_index]
    empty = masked.sum(axis=1) <= 0
    masked[empty] = scores[empty]
    return masked / np.maximum(masked.sum(axis=1, keepdims=True), 1e-12)


def predicted_macro_scores(scores, labels, macro_scores, macro_labels, macro_lookup, alpha=1.0):
    indexes = {label: index for index, label in enumerate(macro_labels)}
    prior = np.asarray([
        [0.08 + row[indexes[macro_lookup[label]]] for label in labels]
        for row in macro_scores
    ], dtype=np.float64)
    output = scores * np.power(prior, alpha)
    return output / np.maximum(output.sum(axis=1, keepdims=True), 1e-12)


def apply_frozen_pair_rules(scores, labels, rules=FROZEN_PAIR_RULES):
    output = np.asarray(scores, dtype=np.float64).copy()
    label_index = {label: index for index, label in enumerate(labels)}
    changed = 0
    for rule in rules:
        predicted_index = label_index[rule["predicted"]]
        rescue_index = label_index[rule["rescue"]]
        current = np.argmax(output, axis=1)
        ratio = output[:, rescue_index] / np.maximum(output[:, predicted_index], 1e-12)
        mask = (current == predicted_index) & (ratio >= rule["threshold"])
        output[mask, rescue_index] = output[mask, predicted_index] * 1.001
        changed += int(mask.sum())
    output /= np.maximum(output.sum(axis=1, keepdims=True), 1e-12)
    return output, changed


def redistribute_semantic_families(base_scores, labels, family_scores, weight):
    output = np.asarray(base_scores, dtype=np.float64).copy()
    label_index = {label: index for index, label in enumerate(labels)}
    for family, local_scores in family_scores.items():
        family_labels = [label for label in SEMANTIC_FAMILIES[family] if label in label_index]
        indexes = [label_index[label] for label in family_labels]
        mass = output[:, indexes].sum(axis=1, keepdims=True)
        normalized = local_scores / np.maximum(local_scores.sum(axis=1, keepdims=True), 1e-12)
        output[:, indexes] = (
            output[:, indexes] * (1.0 - weight)
            + normalized * mass * weight
        )
    output /= np.maximum(output.sum(axis=1, keepdims=True), 1e-12)
    return output


def aggregate_metrics(values):
    total = sum(value["total"] for value in values)
    return {
        "total": total,
        "top1Accuracy": round(sum(value["top1Accuracy"] * value["total"] for value in values) / total, 2),
        "top3Accuracy": round(sum(value["top3Accuracy"] * value["total"] for value in values) / total, 2),
        "balancedTop1": round(float(np.mean([value["balancedTop1"] for value in values])), 2),
    }


def summarize_runs(runs):
    by_source = defaultdict(list)
    by_label = defaultdict(lambda: {"total": 0, "top1": 0, "predictions": Counter()})
    changed_predictions = 0
    for run in runs:
        by_source[run["source"]].append(run["fine"])
        changed_predictions += int(run.get("changedPredictions", 0))
        for label, value in run["fine"].get("byLabel", {}).items():
            bucket = by_label[label]
            bucket["total"] += int(value.get("total", 0))
            bucket["top1"] += int(value.get("top1", 0))
            for prediction in value.get("topPredictions", []):
                bucket["predictions"][prediction["label"]] += int(prediction["count"])
    sources = {source: aggregate_metrics(values) for source, values in sorted(by_source.items())}
    pooled = aggregate_metrics([run["fine"] for run in runs])
    pooled["minimumSourceTop1"] = min(value["top1Accuracy"] for value in sources.values())
    pooled["minimumSourceBalancedTop1"] = min(value["balancedTop1"] for value in sources.values())
    macro = aggregate_metrics([run["macro"] for run in runs])
    oracle = aggregate_metrics([run["oracleMacroFine"] for run in runs])
    predicted_macro = aggregate_metrics([run["predictedMacroFine"] for run in runs])
    return {
        "pooled": pooled,
        "macro": macro,
        "oracleMacroFine": oracle,
        "predictedMacroFine": predicted_macro,
        "bySource": sources,
        "changedPredictions": changed_predictions,
        "byLabel": {
            label: {
                "total": value["total"],
                "top1": value["top1"],
                "accuracy": round(value["top1"] / max(1, value["total"]) * 100, 1),
                "topPredictions": [
                    {"label": predicted, "count": count}
                    for predicted, count in value["predictions"].most_common(5)
                ],
            }
            for label, value in sorted(by_label.items())
        },
    }


def direct_scores(name, evaluation, vectors, engine, benchmark, macro_labels):
    wrapped = [
        {**row, "vectors": {
            "discogs": vectors["discogs"][row["matrixIndex"]],
            "mtg": vectors["mtg"][row["matrixIndex"]],
            "specialist": vectors["specialist"][row["matrixIndex"]],
            "maest30": vectors["maest30"][row["matrixIndex"]],
        }}
        for row in evaluation
    ]
    if name == "discogs-direct":
        classes = benchmark.load_json(benchmark.DISCOGS_META_PATH, {"classes": []})["classes"]
        macro = benchmark.discogs_tag_scores(wrapped, macro_labels, benchmark.MACRO_TAG_PATTERNS, classes)
        fine = benchmark.discogs_tag_scores(wrapped, engine.FINE_LABELS, benchmark.FINE_TAG_PATTERNS, classes)
    elif name == "maest30-direct":
        classes = benchmark.load_json(benchmark.DISCOGS_META_PATH, {"classes": []})["classes"]
        macro = benchmark.pretrained_tag_scores(
            wrapped, macro_labels, benchmark.MACRO_TAG_PATTERNS, classes, "maest30",
        )
        fine = benchmark.pretrained_tag_scores(
            wrapped, engine.FINE_LABELS, benchmark.FINE_TAG_PATTERNS, classes, "maest30",
        )
    elif name == "mtg-direct":
        classes = benchmark.load_json(benchmark.MTG_META_PATH, {"classes": []})["classes"]
        macro = benchmark.mtg_tag_scores(wrapped, macro_labels, benchmark.MTG_MACRO_TAG_PATTERNS, classes)
        fine = benchmark.mtg_tag_scores(wrapped, engine.FINE_LABELS, benchmark.MTG_FINE_TAG_PATTERNS, classes)
    elif name == "specialist-direct":
        macro = benchmark.specialist_tag_scores(
            wrapped, macro_labels, benchmark.SPECIALIST_MACRO_MAP,
        )
        fine = benchmark.specialist_tag_scores(
            wrapped, engine.FINE_LABELS, benchmark.SPECIALIST_FINE_MAP,
        )
    else:
        raise ValueError(name)
    return macro, fine


def render_audit(report):
    lines = [
        "# Audio-only frozen representation benchmark",
        "",
        "This is a development-only source-family holdout. Metadata, URL rules, the official test, and the sealed 96-song holdout are excluded.",
        "",
        "## Cohort",
        "",
        f"- Common audio rows: {report['dataset']['commonRows']}",
        f"- Evaluation observations per seed: {report['dataset']['evaluationRowsPerSeed']}",
        f"- Held-out source families: {', '.join(report['dataset']['sources'])}",
        f"- Seeds: {', '.join(str(value) for value in report['dataset']['seeds'])}",
        "",
        "## Ranking",
        "",
        "| candidate | Top1 | balanced | min source | macro | oracle-macro Fine |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for name in report["ranking"]:
        result = report["candidates"][name]["summary"]
        lines.append(
            f"| {name} | {result['pooled']['top1Accuracy']:.2f}% | "
            f"{result['pooled']['balancedTop1']:.2f}% | "
            f"{result['pooled']['minimumSourceTop1']:.2f}% | "
            f"{result['macro']['top1Accuracy']:.2f}% | "
            f"{result['oracleMacroFine']['top1Accuracy']:.2f}% |"
        )
    lines.extend([
        "",
        "## Decision",
        "",
        f"- Selected research representation: **{report['selected']}**",
        f"- 80% gate reached: **{'yes' if report['goalDiagnostic']['audioOnlyTop1AtLeast80'] else 'no'}**",
        f"- Best measured Top1: {report['goalDiagnostic']['bestTop1']:.2f}%",
        f"- Best oracle-macro Fine ceiling: {report['goalDiagnostic']['bestOracleMacroFine']:.2f}%",
        "- Production export remains unchanged. The sealed holdout remains unopened.",
        "",
    ])
    return "\n".join(lines)


def main():
    engine = load_module(ENGINE_PATH, "genre_audio_rep_engine")
    benchmark = load_module(BENCHMARK_PATH, "genre_audio_rep_benchmark_helpers")
    split_payload = json.loads(engine.SPLITS_PATH.read_text())
    evaluation_payload = json.loads(EVALUATION_SPLITS_PATH.read_text())
    evaluation_membership = {
        row_key(engine, row): row.get("split")
        for row in evaluation_payload.get("items", [])
        if row_key(engine, row)
    }
    rows_by_key = {}
    for row in split_payload.get("items", []):
        key = row_key(engine, row)
        if (
            key
            and row.get("genre") in engine.FINE_LABELS
            and row.get("trainingRole") != "macro-only"
        ):
            rows_by_key[key] = {**row, "sourceKey": key}
    wanted = set(rows_by_key)
    include_timeline = os.environ.get("MMFR_AUDIO_REP_INCLUDE_TIMELINE", "0") == "1"
    cache_values = {}
    availability = {}
    invalid_vectors = {}
    for cache_index, (name, (path, size)) in enumerate(CACHE_SPECS.items(), start=1):
        print(f"cache {cache_index}/{len(CACHE_SPECS)} {name}: streaming {path}", flush=True)
        values, invalid = load_selected_vectors(path, size, wanted)
        cache_values[name] = values
        availability[name] = len(values)
        invalid_vectors[name] = invalid
        wanted.intersection_update(values)
        print(f"cache {name}: available={len(values)} common={len(wanted)}", flush=True)
    if include_timeline:
        print(f"cache timeline: loading {TIMELINE_CACHE_PATH}", flush=True)
        values, invalid = load_timeline_vectors(TIMELINE_CACHE_PATH, wanted, rows_by_key)
        cache_values["timeline"] = values
        availability["timeline"] = len(values)
        invalid_vectors["timeline"] = invalid
        wanted.intersection_update(values)
        print(f"cache timeline: available={len(values)} common={len(wanted)}", flush=True)
    common_keys = sorted(wanted)
    if not common_keys:
        raise RuntimeError("No rows share all requested audio representations")
    vectors = {
        name: np.stack([values[key] for key in common_keys]).astype(np.float32, copy=False)
        for name, values in cache_values.items()
    }
    vectors["discogs_tail"] = vectors["discogs"][:, DISCOGS_TAG_DIMENSIONS:]
    cache_values.clear()
    gc.collect()
    rows = [
        {**rows_by_key[key], "matrixIndex": index}
        for index, key in enumerate(common_keys)
    ]
    evaluation_rows = [
        row for row in rows
        if evaluation_membership.get(row["sourceKey"]) in {"train", "validation"}
    ]
    source_counts = Counter(source_family(row) for row in evaluation_rows)
    sources = sorted(
        source for source, count in source_counts.items() if count >= MIN_SOURCE_ROWS
    )
    if not sources:
        raise RuntimeError("Frozen common cohort has no eligible source-family holdout")
    feature_specs = active_feature_specs(include_timeline)
    feature_matrices = {
        name: np.concatenate([vectors[part] for part in parts], axis=1)
        for name, (parts, _kind) in feature_specs.items()
    }
    macro_labels = sorted(set(engine.GENRE_MACRO.values()))
    outputs = {name: [] for name in feature_specs}
    outputs.update({name: [] for name in (
        "discogs-direct", "mtg-direct", "specialist-direct", "maest30-direct",
        "maest30-local-direct-w0.5", "maest30-local-direct-w0.75",
        "maest30-local-direct-w0.75-frozen-pair-rescue",
        "semantic-family-w0.25", "semantic-family-w0.5", "semantic-family-w0.75",
        "maest30-runtime-direct-w0.5", "maest30-runtime-direct-w0.75",
    )})
    evaluation_rows_per_seed = 0
    for seed_index, seed in enumerate(SEEDS):
        for source_index, source in enumerate(sources):
            train = [
                row for row in rows
                if row.get("split") == "train" and source_family(row) != source
            ]
            evaluation = [row for row in evaluation_rows if source_family(row) == source]
            if not train or not evaluation:
                continue
            if seed_index == 0:
                evaluation_rows_per_seed += len(evaluation)
            train_indexes = np.asarray([row["matrixIndex"] for row in train], dtype=np.int64)
            eval_indexes = np.asarray([row["matrixIndex"] for row in evaluation], dtype=np.int64)
            actual = [row["genre"] for row in evaluation]
            actual_macro = [row["macroGenre"] for row in evaluation]
            print(
                f"seed {seed_index + 1}/{len(SEEDS)} source {source_index + 1}/{len(sources)} "
                f"{source} train={len(train)} eval={len(evaluation)}",
                flush=True,
            )
            direct = {}
            for direct_name in ("discogs-direct", "mtg-direct", "specialist-direct", "maest30-direct"):
                macro_scores, fine_scores = direct_scores(
                    direct_name, evaluation, vectors, engine, benchmark, macro_labels,
                )
                direct[direct_name] = (macro_scores, fine_scores)
                outputs[direct_name].append({
                    "source": source,
                    "seed": seed,
                    "fine": metric(actual, fine_scores, engine.FINE_LABELS),
                    "macro": metric(actual_macro, macro_scores, macro_labels),
                    "oracleMacroFine": metric(
                        actual,
                        oracle_macro_scores(fine_scores, engine.FINE_LABELS, actual_macro, engine.GENRE_MACRO),
                        engine.FINE_LABELS,
                    ),
                    "predictedMacroFine": metric(
                        actual,
                        predicted_macro_scores(
                            fine_scores, engine.FINE_LABELS, macro_scores, macro_labels, engine.GENRE_MACRO,
                        ),
                        engine.FINE_LABELS,
                    ),
                })
            train_direct = {}
            for direct_name in ("discogs-direct", "mtg-direct", "specialist-direct", "maest30-direct"):
                train_direct[direct_name] = direct_scores(
                    direct_name, train, vectors, engine, benchmark, macro_labels,
                )
            learned = {}
            for feature_index, (name, (_parts, kind)) in enumerate(feature_specs.items()):
                x = feature_matrices[name]
                fine_weights = source_work_weights(train, "genre")
                macro_weights = source_work_weights(train, "macroGenre")
                fine_model = fit_model(
                    kind, x[train_indexes], np.asarray([row["genre"] for row in train], dtype=object),
                    seed + source_index * 1000 + feature_index * 20, fine_weights,
                )
                macro_model = fit_model(
                    kind, x[train_indexes], np.asarray([row["macroGenre"] for row in train], dtype=object),
                    seed + source_index * 1000 + feature_index * 20 + 1, macro_weights,
                )
                fine_scores = aligned_scores(fine_model, x[eval_indexes], engine.FINE_LABELS)
                macro_scores = aligned_scores(macro_model, x[eval_indexes], macro_labels)
                learned[name] = (macro_scores, fine_scores)
                outputs[name].append({
                    "source": source,
                    "seed": seed,
                    "fine": metric(actual, fine_scores, engine.FINE_LABELS),
                    "macro": metric(actual_macro, macro_scores, macro_labels),
                    "oracleMacroFine": metric(
                        actual,
                        oracle_macro_scores(fine_scores, engine.FINE_LABELS, actual_macro, engine.GENRE_MACRO),
                        engine.FINE_LABELS,
                    ),
                    "predictedMacroFine": metric(
                        actual,
                        predicted_macro_scores(
                            fine_scores, engine.FINE_LABELS, macro_scores, macro_labels, engine.GENRE_MACRO,
                        ),
                        engine.FINE_LABELS,
                    ),
                })
            maest_direct_macro, maest_direct_fine = direct["maest30-direct"]
            family_base = None
            for local_name, prefix in (
                ("maest30-moments", "maest30-local-direct"),
                ("maest30-runtime", "maest30-runtime-direct"),
            ):
                local_macro, local_fine = learned[local_name]
                for weight in (0.5, 0.75):
                    name = f"{prefix}-w{weight}"
                    macro_scores = benchmark.normalize(
                        local_macro * (1.0 - weight) + maest_direct_macro * weight
                    )
                    fine_scores = benchmark.normalize(
                        local_fine * (1.0 - weight) + maest_direct_fine * weight
                    )
                    outputs[name].append({
                        "source": source,
                        "seed": seed,
                        "fine": metric(actual, fine_scores, engine.FINE_LABELS),
                        "macro": metric(actual_macro, macro_scores, macro_labels),
                        "oracleMacroFine": metric(
                            actual,
                            oracle_macro_scores(fine_scores, engine.FINE_LABELS, actual_macro, engine.GENRE_MACRO),
                            engine.FINE_LABELS,
                        ),
                        "predictedMacroFine": metric(
                            actual,
                            predicted_macro_scores(
                                fine_scores, engine.FINE_LABELS, macro_scores, macro_labels, engine.GENRE_MACRO,
                            ),
                            engine.FINE_LABELS,
                        ),
                    })
                    if prefix == "maest30-local-direct" and weight == 0.75:
                        rescued_fine, changed = apply_frozen_pair_rules(
                            fine_scores, engine.FINE_LABELS,
                        )
                        outputs["maest30-local-direct-w0.75-frozen-pair-rescue"].append({
                            "source": source,
                            "seed": seed,
                            "changedPredictions": changed,
                            "fine": metric(actual, rescued_fine, engine.FINE_LABELS),
                            "macro": metric(actual_macro, macro_scores, macro_labels),
                            "oracleMacroFine": metric(
                                actual,
                                oracle_macro_scores(
                                    rescued_fine, engine.FINE_LABELS, actual_macro, engine.GENRE_MACRO,
                                ),
                                engine.FINE_LABELS,
                            ),
                            "predictedMacroFine": metric(
                                actual,
                                predicted_macro_scores(
                                    rescued_fine, engine.FINE_LABELS, macro_scores, macro_labels,
                                    engine.GENRE_MACRO,
                                ),
                                engine.FINE_LABELS,
                            ),
                        })
                        family_base = (macro_scores, rescued_fine)
            if family_base is None:
                raise RuntimeError("Semantic family base was not produced")
            train_evidence = np.concatenate([
                train_direct[name][1]
                for name in ("discogs-direct", "mtg-direct", "specialist-direct", "maest30-direct")
            ], axis=1)
            eval_evidence = np.concatenate([
                direct[name][1]
                for name in ("discogs-direct", "mtg-direct", "specialist-direct", "maest30-direct")
            ], axis=1)
            family_scores = {}
            for family_index, (family, family_labels) in enumerate(SEMANTIC_FAMILIES.items()):
                allowed = set(family_labels)
                local_indexes = [index for index, row in enumerate(train) if row["genre"] in allowed]
                local_rows = [train[index] for index in local_indexes]
                local_classes = sorted({row["genre"] for row in local_rows})
                if len(local_classes) < 2:
                    continue
                model = fit_model(
                    "logistic",
                    train_evidence[local_indexes],
                    np.asarray([row["genre"] for row in local_rows], dtype=object),
                    seed + source_index * 1000 + 800 + family_index * 10,
                    source_work_weights(local_rows, "genre"),
                )
                family_scores[family] = aligned_scores(
                    model, eval_evidence, list(family_labels),
                )
            family_macro, family_fine = family_base
            for weight in (0.25, 0.5, 0.75):
                refined = redistribute_semantic_families(
                    family_fine, engine.FINE_LABELS, family_scores, weight,
                )
                outputs[f"semantic-family-w{weight}"].append({
                    "source": source,
                    "seed": seed,
                    "fine": metric(actual, refined, engine.FINE_LABELS),
                    "macro": metric(actual_macro, family_macro, macro_labels),
                    "oracleMacroFine": metric(
                        actual,
                        oracle_macro_scores(
                            refined, engine.FINE_LABELS, actual_macro, engine.GENRE_MACRO,
                        ),
                        engine.FINE_LABELS,
                    ),
                    "predictedMacroFine": metric(
                        actual,
                        predicted_macro_scores(
                            refined, engine.FINE_LABELS, family_macro, macro_labels, engine.GENRE_MACRO,
                        ),
                        engine.FINE_LABELS,
                    ),
                })
    candidates = {
        name: {
            "featureSpec": (
                {"parts": list(feature_specs[name][0]), "model": feature_specs[name][1]}
                if name in feature_specs else {"model": "pretrained-audio-head-or-probability-blend"}
            ),
            "summary": summarize_runs(runs),
        }
        for name, runs in outputs.items() if runs
    }
    ranking = sorted(
        candidates,
        key=lambda name: (
            candidates[name]["summary"]["pooled"]["top1Accuracy"],
            candidates[name]["summary"]["pooled"]["balancedTop1"],
            candidates[name]["summary"]["pooled"]["minimumSourceTop1"],
        ),
        reverse=True,
    )
    selected = ranking[0]
    best_top1 = candidates[selected]["summary"]["pooled"]["top1Accuracy"]
    best_oracle = max(
        value["summary"]["oracleMacroFine"]["top1Accuracy"]
        for value in candidates.values()
    )
    report = {
        "generatedAt": str(np.datetime64("now")),
        "objective": "Comparable audio-only representation benchmark for unknown-source generalization.",
        "policy": {
            "metadataUsed": False,
            "urlSpecificRulesUsed": False,
            "officialTestUsed": False,
            "sealedFinalHoldoutUsed": False,
            "productionModelUpdated": False,
            "cohortPolicy": "intersection of all six audio caches on frozen train+validation source-family holdouts",
            "audioRetentionChanged": False,
        },
        "dataset": {
            "splitRows": len(split_payload.get("items", [])),
            "eligibleFineRows": len(rows_by_key),
            "commonRows": len(rows),
            "evaluationRowsPerSeed": evaluation_rows_per_seed,
            "evaluationSplitsPath": str(EVALUATION_SPLITS_PATH),
            "sources": sources,
            "sourceCounts": dict(source_counts),
            "seeds": list(SEEDS),
            "cacheAvailabilityBeforeIntersection": availability,
            "invalidVectors": invalid_vectors,
            "timelineIncluded": include_timeline,
        },
        "ranking": ranking,
        "selected": selected,
        "goalDiagnostic": {
            "targetTop1": 80.0,
            "bestTop1": best_top1,
            "remainingGap": round(80.0 - best_top1, 2),
            "bestOracleMacroFine": best_oracle,
            "audioOnlyTop1AtLeast80": best_top1 >= 80.0,
            "oracleMacroFineAtLeast80": best_oracle >= 80.0,
        },
        "candidates": candidates,
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    AUDIT_PATH.write_text(render_audit(report))
    print(json.dumps({
        "selected": selected,
        "goalDiagnostic": report["goalDiagnostic"],
        "ranking": [
            {"name": name, **candidates[name]["summary"]["pooled"],
             "macroTop1": candidates[name]["summary"]["macro"]["top1Accuracy"],
             "oracleMacroFineTop1": candidates[name]["summary"]["oracleMacroFine"]["top1Accuracy"]}
            for name in ranking
        ],
        "report": str(REPORT_PATH),
        "audit": str(AUDIT_PATH),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
