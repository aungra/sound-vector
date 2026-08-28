import json
import importlib.util
import os
import pickle
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from sklearn.decomposition import PCA
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from genre_source_family import source_family


ROOT = Path(__file__).resolve().parents[3]
TRAINING_DIR = ROOT / "genre-training"
SPLITS_PATH = Path(os.environ.get(
    "MMFR_GENRE_SPLITS_PATH",
    str(TRAINING_DIR / "dataset-splits.json"),
))


def root_path(value):
    pathname = Path(value)
    return pathname if pathname.is_absolute() else ROOT / pathname


REPORT_PATH = root_path(os.environ.get(
    "MMFR_MACRO_SPECIALISTS_REPORT_PATH",
    str(TRAINING_DIR / "embedding-macro-specialists-report.json"),
))
MODEL_EXPORT_PATH = root_path(os.environ["MMFR_MACRO_SPECIALISTS_MODEL_PATH"]) if os.environ.get("MMFR_MACRO_SPECIALISTS_MODEL_PATH") else None
MODEL_MANIFEST_PATH = root_path(os.environ.get(
    "MMFR_MACRO_SPECIALISTS_MODEL_MANIFEST_PATH",
    str(TRAINING_DIR / "embedding-macro-specialists-model-manifest.json"),
))
EVALUATE_TEST = os.environ.get("MMFR_SPECIALISTS_EVALUATE_TEST", "0") == "1"
ENABLE_RESEARCH_SPECIALIST = os.environ.get("MMFR_ENABLE_RESEARCH_SPECIALIST", "0") == "1"
BENCHMARK_SCRIPT = Path(__file__).with_name("genre-embedding-32-benchmark.py")
DISCOGS_CACHE = Path(os.environ.get("MMFR_ESSENTIA_DISCOGS_CACHE_PATH", str(TRAINING_DIR / "essentia-discogs-feature-cache.json")))
MTG_CACHE = Path(os.environ.get("MMFR_ESSENTIA_MTG_JAMENDO_CACHE_PATH", str(TRAINING_DIR / "essentia-mtg-jamendo-feature-cache.json")))
LIBROSA_CACHE = Path(os.environ.get("MMFR_LIBROSA_FEATURE_CACHE_PATH", str(TRAINING_DIR / "librosa-feature-cache.json")))
SPECIALIST_CACHE = Path(os.environ.get(
    "MMFR_ESSENTIA_SPECIALIST_CACHE_PATH",
    str(TRAINING_DIR / "essentia-genre-specialist-moment-v2-cache.json"),
))

TARGET_GENRES = [
    "アンビエント", "ドローン", "ノイズミュージック", "電子音楽",
    "テクノ", "ハウス", "ディープ・ハウス", "トランス",
    "ドラムンベース", "ダブステップ", "チップチューン",
    "ヒップホップ", "トラップ", "レゲエ", "ダブ", "ブルース",
    "ファンク", "ソウルミュージック", "ディスコ",
    "ロック", "パンク", "ハードコア", "メタル",
    "ジャズ", "シティ・ポップ", "J-POP", "アニメソング",
    "クラシック音楽", "オペラ", "フォーク", "ラテン", "ワールドミュージック",
]
PARENT_LABELS = {"電子音楽", "ワールドミュージック"}
GENRE_MACRO = {
    "アンビエント": "ambient", "ドローン": "ambient", "ノイズミュージック": "ambient",
    "テクノ": "electronic", "ハウス": "electronic", "ディープ・ハウス": "electronic",
    "トランス": "electronic", "ドラムンベース": "electronic", "ダブステップ": "electronic", "チップチューン": "electronic",
    "ヒップホップ": "black_music", "トラップ": "black_music", "レゲエ": "black_music", "ダブ": "black_music",
    "ブルース": "black_music", "ファンク": "black_music", "ソウルミュージック": "black_music", "ディスコ": "black_music",
    "ロック": "rock", "パンク": "rock", "ハードコア": "rock", "メタル": "rock",
    "ジャズ": "jazz", "シティ・ポップ": "pop", "J-POP": "pop", "アニメソング": "pop",
    "クラシック音楽": "classical", "オペラ": "classical", "フォーク": "world", "ラテン": "world",
}
FINE_LABELS = [label for label in TARGET_GENRES if label not in PARENT_LABELS]
PAIR_CORRECTION_CANDIDATES = [
    ("テクノ", "トランス"),
    ("テクノ", "ハウス"),
    ("ハウス", "ディープ・ハウス"),
    ("ダブステップ", "ドラムンベース"),
    ("ファンク", "ディスコ"),
    ("ファンク", "ソウルミュージック"),
    ("ダブ", "レゲエ"),
    ("ヒップホップ", "トラップ"),
    ("ロック", "パンク"),
    ("ロック", "メタル"),
    ("パンク", "ハードコア"),
    ("アンビエント", "ドローン"),
    ("アンビエント", "ノイズミュージック"),
    ("ドローン", "ノイズミュージック"),
    ("クラシック音楽", "オペラ"),
    ("フォーク", "ラテン"),
]
FEATURE_SETS = {
    "discogs": ("discogs",),
    "discogs+mtg": ("discogs", "mtg"),
    "discogs+mtg+librosa": ("discogs", "mtg", "librosa"),
}
if ENABLE_RESEARCH_SPECIALIST:
    FEATURE_SETS.update({
        "discogs+specialist": ("discogs", "specialist"),
        "discogs+mtg+librosa+specialist": ("discogs", "mtg", "librosa", "specialist"),
    })


def load_json(path, fallback=None):
    if not path.exists():
        return {} if fallback is None else fallback
    return json.loads(path.read_text())


def load_benchmark_module():
    spec = importlib.util.spec_from_file_location("genre_embedding_32_benchmark_for_specialists", BENCHMARK_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def source_key(row):
    source_type = row.get("sourceType") or ("itunes-preview" if row.get("previewUrl") else "youtube")
    value = row.get("sourceUrl") or row.get("previewUrl") or row.get("youtubeUrl") or row.get("url") or ""
    return f"{source_type}:{value}" if value else ""


def load_rows():
    items = load_json(SPLITS_PATH, {"items": []}).get("items", [])
    caches = {
        "discogs": load_json(DISCOGS_CACHE),
        "mtg": load_json(MTG_CACHE),
        "librosa": load_json(LIBROSA_CACHE),
    }
    if ENABLE_RESEARCH_SPECIALIST:
        caches["specialist"] = load_json(SPECIALIST_CACHE)
    rows = []
    missing = Counter()
    for row in items:
        if row.get("genre") not in TARGET_GENRES:
            continue
        key = source_key(row)
        vectors = {}
        for name, cache in caches.items():
            value = cache.get(key)
            if isinstance(value, list):
                vector = np.asarray(value, dtype=np.float32)
                vector[~np.isfinite(vector)] = 0
                vectors[name] = vector
            else:
                missing[name] += 1
        if len(vectors) == len(caches):
            rows.append({**row, "vectors": vectors})
    return rows, dict(missing)


def fine_rows(rows):
    return [row for row in rows if row.get("trainingRole") != "macro-only" and row.get("genre") in FINE_LABELS]


def annotate_discogs_evidence(rows):
    module = load_benchmark_module()
    classes = load_json(module.DISCOGS_META_PATH, {"classes": []}).get("classes", [])
    scores = module.discogs_tag_scores(rows, FINE_LABELS, module.FINE_TAG_PATTERNS, classes)
    for row, row_scores in zip(rows, scores):
        ranked = [FINE_LABELS[index] for index in np.argsort(-row_scores)]
        row["discogsEvidenceRank"] = ranked.index(row["genre"]) + 1


def evidence_filtered_train(rows, max_rank, minimum_per_label=5):
    if max_rank is None:
        return list(rows)
    selected = [row for row in rows if row.get("discogsEvidenceRank", 999) <= max_rank]
    by_label = Counter(row["genre"] for row in selected)
    for label in sorted({row["genre"] for row in rows}):
        needed = max(0, minimum_per_label - by_label[label])
        if not needed:
            continue
        existing = {source_key(row) for row in selected}
        selected.extend(sorted(
            [row for row in rows if row["genre"] == label and source_key(row) not in existing],
            key=lambda row: (row.get("discogsEvidenceRank", 999), source_key(row)),
        )[:needed])
    return selected


def split(rows, name):
    return [row for row in rows if row.get("split") == name]


def matrix(rows, feature_names):
    return np.asarray([np.concatenate([row["vectors"][name] for name in feature_names]) for row in rows], dtype=np.float32)


def labels(rows, target):
    return np.asarray([row[target] for row in rows], dtype=object)


def normalize(scores):
    values = np.asarray(scores, dtype=np.float64)
    return values / np.maximum(values.sum(axis=1, keepdims=True), 1e-12)


def source_balanced_weights(rows, target, exponent=1.0, clip=(0.2, 4.0)):
    pair_counts = Counter(
        (row[target], source_family(row))
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
        weights.append(label_counts[label] / max(1, len(label_sources[label]) * pair_counts[(label, source)]))
    values = np.asarray(weights, dtype=np.float64) ** exponent
    values /= max(float(np.mean(values)), 1e-12)
    return np.clip(values, clip[0], clip[1])


def model_factories(seed):
    return {
        "extra-trees": lambda: ExtraTreesClassifier(
            n_estimators=420, max_features="sqrt", min_samples_leaf=1,
            class_weight="balanced", n_jobs=-1, random_state=seed,
        ),
        "random-forest": lambda: RandomForestClassifier(
            n_estimators=420, max_features="sqrt", min_samples_leaf=1,
            class_weight="balanced_subsample", n_jobs=-1, random_state=seed + 1,
        ),
        "logistic": lambda: LogisticRegression(
            C=0.7, class_weight="balanced", max_iter=1200, solver="lbfgs", random_state=seed + 2,
        ),
    }


class ConstantClassifier:
    def __init__(self, label):
        self.classes_ = np.asarray([label], dtype=object)

    def predict_proba(self, values):
        return np.ones((len(values), 1), dtype=np.float64)


def fit_model(train, target, feature_names, model_name, seed, weight_mode="none"):
    y = labels(train, target)
    if len(set(y)) == 1:
        return ConstantClassifier(y[0])
    x = matrix(train, feature_names)
    estimator = model_factories(seed)[model_name]()
    if model_name == "logistic":
        components = min(192, len(train) - 1, x.shape[1])
        model = make_pipeline(StandardScaler(), PCA(n_components=components, random_state=seed, svd_solver="randomized"), estimator)
    else:
        model = estimator
    fit_kwargs = {}
    if weight_mode in {"source-balanced", "source-balanced-sqrt", "source-balanced-unclipped"}:
        if weight_mode == "source-balanced-sqrt":
            weights = source_balanced_weights(train, target, exponent=0.5, clip=(0.35, 3.0))
        elif weight_mode == "source-balanced-unclipped":
            weights = source_balanced_weights(train, target, exponent=1.0, clip=(0.05, 12.0))
        else:
            weights = source_balanced_weights(train, target)
        if hasattr(model, "steps"):
            fit_kwargs[f"{model.steps[-1][0]}__sample_weight"] = weights
        else:
            fit_kwargs["sample_weight"] = weights
    model.fit(x, y, **fit_kwargs)
    return model


def aligned_scores(model, rows, feature_names, all_labels):
    if not rows:
        return np.zeros((0, len(all_labels)), dtype=np.float64)
    x = matrix(rows, feature_names)
    source = model.predict_proba(x)
    source_labels = list(model.classes_ if hasattr(model, "classes_") else model[-1].classes_)
    indexes = {label: index for index, label in enumerate(all_labels)}
    scores = np.zeros((len(rows), len(all_labels)), dtype=np.float64)
    for source_index, label in enumerate(source_labels):
        if label in indexes:
            scores[:, indexes[label]] = source[:, source_index]
    return scores


def metric(rows, scores, all_labels, target):
    if not rows:
        return {"total": 0, "top1Accuracy": None, "top3Accuracy": None, "balancedTop1": None, "byLabel": {}}
    y = labels(rows, target)
    order = np.argsort(-scores, axis=1)
    pred = np.asarray([all_labels[indexes[0]] for indexes in order], dtype=object)
    top3 = sum(actual in [all_labels[index] for index in indexes[:3]] for actual, indexes in zip(y, order))
    by_label = {}
    for actual, predicted in zip(y, pred):
        bucket = by_label.setdefault(actual, {"total": 0, "top1": 0, "predictions": Counter()})
        bucket["total"] += 1
        bucket["top1"] += actual == predicted
        bucket["predictions"][predicted] += 1
    balanced = np.mean([
        np.mean(pred[y == label] == label)
        for label in sorted(set(y))
    ])
    return {
        "total": len(rows),
        "top1Accuracy": round(float(accuracy_score(y, pred)) * 100, 1),
        "top3Accuracy": round(top3 / len(rows) * 100, 1),
        "balancedTop1": round(float(balanced) * 100, 1),
        "byLabel": {
            label: {
                "total": value["total"],
                "top1": value["top1"],
                "accuracy": round(value["top1"] / value["total"] * 100, 1),
                "topPredictions": [
                    {"label": predicted, "count": count}
                    for predicted, count in value["predictions"].most_common(5)
                ],
            }
            for label, value in sorted(by_label.items())
        },
    }


def select_model(train, validation, target, all_labels, seed):
    trials = []
    trained = []
    for feature_set, feature_names in FEATURE_SETS.items():
        for model_name in model_factories(seed):
            for weight_mode in ("none", "source-balanced"):
                model = fit_model(train, target, feature_names, model_name, seed, weight_mode)
                scores = aligned_scores(model, validation, feature_names, all_labels)
                score = metric(validation, scores, all_labels, target)
                trial = {
                    "featureSet": feature_set,
                    "model": model_name,
                    "weightMode": weight_mode,
                    "validation": score,
                }
                trials.append(trial)
                trained.append((trial, model))
    trained.sort(key=lambda item: (
        item[0]["validation"]["balancedTop1"] or -1,
        item[0]["validation"]["top1Accuracy"] or -1,
        item[0]["validation"]["top3Accuracy"] or -1,
    ), reverse=True)
    return trained[0], trials, trained


def pretrained_tag_sources(module, rows, all_labels, target):
    discogs_classes = load_json(module.DISCOGS_META_PATH, {"classes": []}).get("classes", [])
    mtg_classes = load_json(module.MTG_META_PATH, {"classes": []}).get("classes", [])
    if target == "macroGenre":
        discogs_patterns = module.MACRO_TAG_PATTERNS
        mtg_patterns = module.MTG_MACRO_TAG_PATTERNS
    else:
        discogs_patterns = module.FINE_TAG_PATTERNS
        mtg_patterns = module.MTG_FINE_TAG_PATTERNS
    discogs = module.discogs_tag_scores(rows, all_labels, discogs_patterns, discogs_classes)
    mtg = module.mtg_tag_scores(rows, all_labels, mtg_patterns, mtg_classes)
    return {
        "discogs": discogs,
        "mtg": mtg,
        "discogs+mtg": normalize(discogs + mtg),
    }


def select_tag_blended_model(train, validation, target, all_labels, seed, module):
    _, model_trials, trained = select_model(train, validation, target, all_labels, seed)
    tag_sources = pretrained_tag_sources(module, validation, all_labels, target)
    candidates = []
    trials = []
    for base_trial, model in trained:
        model_scores = aligned_scores(model, validation, FEATURE_SETS[base_trial["featureSet"]], all_labels)
        for tag_source, tag_scores in tag_sources.items():
            for tag_weight in (0.0, 0.1, 0.2, 0.3, 0.4, 0.55, 0.7):
                scores = normalize(model_scores * (1.0 - tag_weight) + tag_scores * tag_weight)
                trial = {
                    **{key: value for key, value in base_trial.items() if key != "validation"},
                    "tagSource": tag_source,
                    "tagWeight": tag_weight,
                    "validation": metric(validation, scores, all_labels, target),
                }
                trials.append(trial)
                candidates.append((trial, model))
    candidates.sort(key=lambda item: (
        item[0]["validation"]["balancedTop1"] or -1,
        item[0]["validation"]["top1Accuracy"] or -1,
        item[0]["validation"]["top3Accuracy"] or -1,
    ), reverse=True)
    return candidates[0], {"baseModelTrials": model_trials, "tagBlendTrials": trials}


def select_global_fine_model(train, validation, all_labels, seed, module):
    candidates = []
    searches = {}
    for max_rank in (1, 3, 5, None):
        filtered = evidence_filtered_train(train, max_rank)
        if len({row["genre"] for row in filtered}) < len(all_labels):
            continue
        (trial, model), search = select_tag_blended_model(
            filtered, validation, "genre", all_labels, seed + len(candidates) * 100, module,
        )
        enriched = {
            **trial,
            "discogsEvidenceMaxRank": max_rank,
            "trainingRows": len(filtered),
            "unfilteredTrainingRows": len(train),
        }
        candidates.append((enriched, model))
        searches["all" if max_rank is None else str(max_rank)] = search
    candidates.sort(key=lambda item: (
        item[0]["validation"]["balancedTop1"] or -1,
        item[0]["validation"]["top1Accuracy"] or -1,
        item[0]["validation"]["top3Accuracy"] or -1,
        item[0]["trainingRows"],
    ), reverse=True)
    return candidates[0], searches


def selected_model_scores(selected, model, rows, all_labels, target, module):
    model_scores = aligned_scores(model, rows, FEATURE_SETS[selected["featureSet"]], all_labels)
    if not selected.get("tagWeight"):
        return normalize(model_scores)
    tags = pretrained_tag_sources(module, rows, all_labels, target)[selected["tagSource"]]
    return normalize(model_scores * (1.0 - selected["tagWeight"]) + tags * selected["tagWeight"])


def expand_scores(scores, source_labels, destination_labels):
    source_index = {label: index for index, label in enumerate(source_labels)}
    return np.asarray([
        [row[source_index[label]] if label in source_index else 0.0 for label in destination_labels]
        for row in scores
    ], dtype=np.float64)


def blended_fine_scores(global_scores, specialist, tag_scores, specialist_weight, tag_weight):
    base = normalize(global_scores * (1.0 - specialist_weight) + specialist * specialist_weight)
    return normalize(base * (1.0 - tag_weight) + tag_scores * tag_weight)


def blended_fine_scores_with_macro_weights(global_scores, specialist, tag_scores,
                                           macro_scores, macro_labels,
                                           default_specialist_weight,
                                           macro_specialist_weights, tag_weight):
    predicted_macro = np.asarray(macro_labels, dtype=object)[np.argmax(macro_scores, axis=1)]
    weights = np.asarray([
        macro_specialist_weights.get(label, default_specialist_weight)
        for label in predicted_macro
    ], dtype=np.float64)[:, None]
    base = normalize(global_scores * (1.0 - weights) + specialist * weights)
    return normalize(base * (1.0 - tag_weight) + tag_scores * tag_weight)


def select_specialist_model(train, validation, all_labels, seed):
    candidates = []
    trials = []
    for max_rank in (1, 3, 5, 10, None):
        filtered = evidence_filtered_train(train, max_rank)
        if len({row["genre"] for row in filtered}) < len(all_labels):
            continue
        (trial, model), local_trials, _ = select_model(filtered, validation, "genre", all_labels, seed)
        enriched = {
            **trial,
            "discogsEvidenceMaxRank": max_rank,
            "trainingRows": len(filtered),
            "unfilteredTrainingRows": len(train),
        }
        candidates.append((enriched, model))
        trials.extend({
            **item,
            "discogsEvidenceMaxRank": max_rank,
            "trainingRows": len(filtered),
            "unfilteredTrainingRows": len(train),
        } for item in local_trials)
    candidates.sort(key=lambda item: (
        item[0]["validation"]["balancedTop1"] or -1,
        item[0]["validation"]["top1Accuracy"] or -1,
        item[0]["validation"]["top3Accuracy"] or -1,
        item[0]["trainingRows"],
    ), reverse=True)
    return candidates[0], trials


def specialist_scores(rows, macro_labels, macro_scores, specialist_models, alpha, floor):
    scores = np.zeros((len(rows), len(FINE_LABELS)), dtype=np.float64)
    fine_index = {label: index for index, label in enumerate(FINE_LABELS)}
    macro_index = {label: index for index, label in enumerate(macro_labels)}
    for macro, selected in specialist_models.items():
        labels_in_macro = [label for label in FINE_LABELS if GENRE_MACRO.get(label) == macro and label in selected["labels"]]
        if not labels_in_macro:
            continue
        local = aligned_scores(selected["model"], rows, FEATURE_SETS[selected["featureSet"]], labels_in_macro)
        gate = np.power(np.maximum(floor, macro_scores[:, macro_index[macro]]), alpha)
        for local_index, label in enumerate(labels_in_macro):
            scores[:, fine_index[label]] = local[:, local_index] * gate
    sums = scores.sum(axis=1, keepdims=True)
    return scores / np.maximum(sums, 1e-12)


def raw_top1_metrics(rows, scores, all_labels, target):
    if not rows:
        return {"top1": 0.0, "balancedTop1": 0.0}
    actual = labels(rows, target)
    predicted = np.asarray([all_labels[index] for index in np.argmax(scores, axis=1)], dtype=object)
    recalls = [np.mean(predicted[actual == label] == label) for label in sorted(set(actual))]
    return {
        "top1": float(np.mean(predicted == actual)),
        "balancedTop1": float(np.mean(recalls)),
    }


def pair_confusion_count(rows, scores, all_labels, pair):
    indexes = {label: index for index, label in enumerate(all_labels)}
    predicted = [all_labels[index] for index in np.argmax(scores, axis=1)]
    return sum(
        row["genre"] in pair and guess in pair and row["genre"] != guess
        for row, guess in zip(rows, predicted)
    )


def select_pair_model(train, validation, pair, seed):
    pair_train = [row for row in train if row["genre"] in pair]
    pair_validation = [row for row in validation if row["genre"] in pair]
    train_counts = Counter(row["genre"] for row in pair_train)
    validation_counts = Counter(row["genre"] for row in pair_validation)
    if min((train_counts[label] for label in pair), default=0) < 5:
        return None, {"reason": "insufficient-train", "trainCounts": dict(train_counts), "validationCounts": dict(validation_counts)}
    if min((validation_counts[label] for label in pair), default=0) < 3:
        return None, {"reason": "insufficient-validation", "trainCounts": dict(train_counts), "validationCounts": dict(validation_counts)}

    trials = []
    trained = []
    for max_rank in (1, 3, None):
        filtered = evidence_filtered_train(pair_train, max_rank, minimum_per_label=5)
        if any(sum(row["genre"] == label for row in filtered) < 5 for label in pair):
            continue
        for feature_set in FEATURE_SETS:
            for model_name in ("logistic", "extra-trees"):
                model = fit_model(filtered, "genre", FEATURE_SETS[feature_set], model_name, seed)
                scores = aligned_scores(model, pair_validation, FEATURE_SETS[feature_set], list(pair))
                result = metric(pair_validation, scores, list(pair), "genre")
                trial = {
                    "pair": list(pair),
                    "featureSet": feature_set,
                    "modelName": model_name,
                    "discogsEvidenceMaxRank": max_rank,
                    "trainingRows": len(filtered),
                    "validation": result,
                }
                trials.append(trial)
                trained.append((trial, model))
    if not trained:
        return None, {"reason": "no-trainable-candidate", "trainCounts": dict(train_counts), "validationCounts": dict(validation_counts)}
    trained.sort(key=lambda item: (
        item[0]["validation"]["balancedTop1"] or -1,
        item[0]["validation"]["top1Accuracy"] or -1,
        item[0]["validation"]["top3Accuracy"] or -1,
        -item[0]["trainingRows"],
    ), reverse=True)
    trial, model = trained[0]
    return {
        **trial,
        "model": model,
        "labels": list(pair),
    }, {"trainCounts": dict(train_counts), "validationCounts": dict(validation_counts), "trials": trials}


def apply_pair_correction(scores, rows, corrector, weight):
    result = np.asarray(scores, dtype=np.float64).copy()
    pair = corrector["labels"]
    destination = {label: index for index, label in enumerate(FINE_LABELS)}
    pair_indexes = [destination[label] for label in pair]
    current_top = np.argmax(result, axis=1)
    eligible = np.isin(current_top, pair_indexes)
    if not np.any(eligible):
        return result
    local = aligned_scores(
        corrector["model"],
        rows,
        FEATURE_SETS[corrector["featureSet"]],
        pair,
    )
    local = normalize(local)
    current_pair = result[:, pair_indexes]
    pair_mass = current_pair.sum(axis=1, keepdims=True)
    current_distribution = current_pair / np.maximum(pair_mass, 1e-12)
    corrected_distribution = normalize(current_distribution * (1.0 - weight) + local * weight)
    result[np.ix_(eligible, pair_indexes)] = (pair_mass * corrected_distribution)[eligible]
    return normalize(result)


def select_pair_corrections(train, validation, base_scores, seed):
    pair_models = []
    pair_search = {}
    for index, pair in enumerate(PAIR_CORRECTION_CANDIDATES):
        selected, search = select_pair_model(train, validation, pair, seed + index * 100)
        key = "__".join(pair)
        pair_search[key] = search
        if selected:
            selected["baseConfusionCount"] = pair_confusion_count(validation, base_scores, FINE_LABELS, pair)
            pair_models.append(selected)

    pair_models.sort(key=lambda item: (-item["baseConfusionCount"], item["labels"]))
    current = np.asarray(base_scores, dtype=np.float64).copy()
    current_raw = raw_top1_metrics(validation, current, FINE_LABELS, "genre")
    selected = []
    greedy_trials = []
    for corrector in pair_models:
        best = None
        for weight in (0.25, 0.5, 0.75, 1.0):
            candidate = apply_pair_correction(current, validation, corrector, weight)
            raw = raw_top1_metrics(validation, candidate, FINE_LABELS, "genre")
            item = {
                "pair": corrector["labels"],
                "weight": weight,
                "rawTop1": raw["top1"],
                "rawBalancedTop1": raw["balancedTop1"],
                "validation": metric(validation, candidate, FINE_LABELS, "genre"),
            }
            greedy_trials.append(item)
            if best is None or (raw["balancedTop1"], raw["top1"]) > (best[0]["balancedTop1"], best[0]["top1"]):
                best = (raw, weight, candidate)
        raw, weight, candidate = best
        balanced_gain = raw["balancedTop1"] - current_raw["balancedTop1"]
        top1_gain = raw["top1"] - current_raw["top1"]
        if balanced_gain >= 0.0005 and top1_gain >= -0.0005:
            current = candidate
            current_raw = raw
            selected.append({
                **{key: value for key, value in corrector.items() if key != "model"},
                "model": corrector["model"],
                "weight": weight,
                "balancedGainPoints": round(balanced_gain * 100, 2),
                "top1GainPoints": round(top1_gain * 100, 2),
            })
    return current, selected, {"pairSearch": pair_search, "greedyTrials": greedy_trials}


def apply_selected_pair_corrections(scores, rows, selected):
    result = np.asarray(scores, dtype=np.float64).copy()
    for corrector in selected:
        result = apply_pair_correction(result, rows, corrector, corrector["weight"])
    return result


def main():
    rows, missing = load_rows()
    benchmark = load_benchmark_module()
    macro_train, macro_validation, macro_test = (split(rows, name) for name in ("train", "validation", "test"))
    fine = fine_rows(rows)
    annotate_discogs_evidence(fine)
    fine_train, fine_validation, fine_test = (split(fine, name) for name in ("train", "validation", "test"))
    macro_labels = sorted({row["macroGenre"] for row in rows})

    (macro_trial, macro_model), macro_search = select_tag_blended_model(
        macro_train, macro_validation, "macroGenre", macro_labels, 27001, benchmark,
    )
    macro_validation_scores = selected_model_scores(
        macro_trial, macro_model, macro_validation, macro_labels, "macroGenre", benchmark,
    )
    macro_fine_validation_scores = selected_model_scores(
        macro_trial, macro_model, fine_validation, macro_labels, "macroGenre", benchmark,
    )
    macro_test_scores = selected_model_scores(
        macro_trial, macro_model, macro_test, macro_labels, "macroGenre", benchmark,
    )
    macro_fine_test_scores = selected_model_scores(
        macro_trial, macro_model, fine_test, macro_labels, "macroGenre", benchmark,
    )

    specialists = {}
    specialist_trials = {}
    for macro in macro_labels:
        train_rows = [row for row in fine_train if row["macroGenre"] == macro]
        validation_rows = [row for row in fine_validation if row["macroGenre"] == macro]
        local_labels = sorted({row["genre"] for row in train_rows})
        if not train_rows or not validation_rows or not local_labels:
            continue
        (trial, model), trials = select_specialist_model(train_rows, validation_rows, local_labels, 28000 + len(specialists) * 100)
        specialists[macro] = {
            "model": model,
            "featureSet": trial["featureSet"],
            "modelName": trial["model"],
            "weightMode": trial["weightMode"],
            "labels": local_labels,
            "discogsEvidenceMaxRank": trial["discogsEvidenceMaxRank"],
            "trainingRows": trial["trainingRows"],
            "unfilteredTrainingRows": trial["unfilteredTrainingRows"],
            "validation": trial["validation"],
        }
        specialist_trials[macro] = trials

    global_labels = sorted({row["genre"] for row in fine_train})
    (global_trial, global_model), global_search = select_global_fine_model(
        fine_train, fine_validation, global_labels, 29001, benchmark,
    )
    global_validation_scores = expand_scores(
        selected_model_scores(global_trial, global_model, fine_validation, global_labels, "genre", benchmark),
        global_labels,
        FINE_LABELS,
    )
    global_test_scores = expand_scores(
        selected_model_scores(global_trial, global_model, fine_test, global_labels, "genre", benchmark),
        global_labels,
        FINE_LABELS,
    )
    fine_validation_tags = pretrained_tag_sources(benchmark, fine_validation, FINE_LABELS, "genre")
    fine_test_tags = pretrained_tag_sources(benchmark, fine_test, FINE_LABELS, "genre")

    gating_trials = []
    for alpha in (0.5, 0.75, 1.0, 1.25, 1.5, 2.0):
        for floor in (0.005, 0.01, 0.025, 0.05, 0.1):
            specialist = specialist_scores(
                fine_validation, macro_labels, macro_fine_validation_scores, specialists, alpha, floor,
            )
            for specialist_weight in (0.0, 0.25, 0.5, 0.75, 1.0):
                for tag_source, tag_scores in fine_validation_tags.items():
                    for tag_weight in (0.0, 0.1, 0.2, 0.3):
                        scores = blended_fine_scores(
                            global_validation_scores,
                            specialist,
                            tag_scores,
                            specialist_weight,
                            tag_weight,
                        )
                        gating_trials.append({
                            "alpha": alpha,
                            "floor": floor,
                            "specialistWeight": specialist_weight,
                            "tagSource": tag_source,
                            "tagWeight": tag_weight,
                            "validation": metric(fine_validation, scores, FINE_LABELS, "genre"),
                        })
    gating_trials.sort(key=lambda item: (
        item["validation"]["balancedTop1"] or -1,
        item["validation"]["top1Accuracy"] or -1,
        item["validation"]["top3Accuracy"] or -1,
    ), reverse=True)
    selected_gate = gating_trials[0]
    base_validation_specialist_scores = specialist_scores(
        fine_validation,
        macro_labels,
        macro_fine_validation_scores,
        specialists,
        selected_gate["alpha"],
        selected_gate["floor"],
    )
    base_validation_scores = blended_fine_scores(
        global_validation_scores,
        base_validation_specialist_scores,
        fine_validation_tags[selected_gate["tagSource"]],
        selected_gate["specialistWeight"],
        selected_gate["tagWeight"],
    )
    final_validation_scores, selected_pair_corrections, pair_search = select_pair_corrections(
        fine_train, fine_validation, base_validation_scores, 31001,
    )
    test_fine_scores = None
    if EVALUATE_TEST:
        test_specialist_scores = specialist_scores(
            fine_test,
            macro_labels,
            macro_fine_test_scores,
            specialists,
            selected_gate["alpha"],
            selected_gate["floor"],
        )
        test_fine_scores = blended_fine_scores(
            global_test_scores,
            test_specialist_scores,
            fine_test_tags[selected_gate["tagSource"]],
            selected_gate["specialistWeight"],
            selected_gate["tagWeight"],
        )
        test_fine_scores = apply_selected_pair_corrections(test_fine_scores, fine_test, selected_pair_corrections)

    report = {
        "generatedAt": str(np.datetime64("now")),
        "objective": "Validation-selected 8-macro classifier plus global/fine-specialist ensemble; test is evaluated only after all choices are frozen.",
        "selectionRule": "All feature/model/gate choices use train and validation only. Test is never part of ranking.",
        "externalFeaturePolicy": {
            "researchSpecialistEnabled": ENABLE_RESEARCH_SPECIALIST,
            "specialistCache": str(SPECIALIST_CACHE),
            "models": ["genre_dortmund", "genre_rosamerica", "genre_electronic", "genre_tzanetakis", "fma_small"],
            "productionEligible": False,
            "reason": "Upstream specialist-head model and training-data license terms are not declared in model metadata.",
        },
        "testEvaluationEnabled": EVALUATE_TEST,
        "dataset": {"rows": len(rows), "fineRows": len(fine), "macro": {"train": len(macro_train), "validation": len(macro_validation), "test": len(macro_test)}, "fine": {"train": len(fine_train), "validation": len(fine_validation), "test": len(fine_test)}},
        "missingFeatureRows": missing,
        "supportedFineLabels": sorted({label for selected in specialists.values() for label in selected["labels"]}),
        "unsupportedFineLabels": [label for label in FINE_LABELS if not any(label in selected["labels"] for selected in specialists.values())],
        "selectedMacro": {**macro_trial, "validation": metric(macro_validation, macro_validation_scores, macro_labels, "macroGenre")},
        "macroSearch": macro_search,
        "selectedSpecialists": {macro: {key: value for key, value in selected.items() if key != "model"} for macro, selected in specialists.items()},
        "specialistTrials": specialist_trials,
        "selectedGlobalFine": {
            **global_trial,
            "labels": global_labels,
            "validation": metric(fine_validation, global_validation_scores, FINE_LABELS, "genre"),
        },
        "globalFineSearch": global_search,
        "selectedGate": selected_gate,
        "gatingTrials": gating_trials,
        "pairCorrection": {
            "selectionRule": "Audio-feature one-vs-one correction is applied only when the base top1 belongs to the pair. Greedy selection uses validation only; official test remains unopened.",
            "baseValidation": metric(fine_validation, base_validation_scores, FINE_LABELS, "genre"),
            "selected": [
                {key: value for key, value in item.items() if key != "model"}
                for item in selected_pair_corrections
            ],
            "search": pair_search,
        },
        "finalValidation": metric(fine_validation, final_validation_scores, FINE_LABELS, "genre"),
        "test": {
            "macro": metric(macro_test, macro_test_scores, macro_labels, "macroGenre"),
            "fine": metric(fine_test, test_fine_scores, FINE_LABELS, "genre"),
        } if EVALUATE_TEST else None,
    }
    if MODEL_EXPORT_PATH:
        model_bundle = {
            "version": "embedding-macro-specialists-v2",
            "createdAt": report["generatedAt"],
            "method": "validation-selected-macro-global-specialist-pair-ensemble",
            "officialTestUsed": EVALUATE_TEST,
            "fineLabels": FINE_LABELS,
            "macro": {
                "labels": macro_labels,
                "config": {key: value for key, value in macro_trial.items() if key != "validation"},
                "model": macro_model,
            },
            "globalFine": {
                "labels": global_labels,
                "config": {key: value for key, value in global_trial.items() if key != "validation"},
                "model": global_model,
            },
            "specialists": specialists,
            "gate": {key: value for key, value in selected_gate.items() if key != "validation"},
            "pairCorrections": [
                {
                    "labels": item["labels"],
                    "featureSet": item["featureSet"],
                    "modelName": item["modelName"],
                    "discogsEvidenceMaxRank": item["discogsEvidenceMaxRank"],
                    "weight": item["weight"],
                    "model": item["model"],
                }
                for item in selected_pair_corrections
            ],
            "validation": report["finalValidation"],
        }
        MODEL_EXPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with MODEL_EXPORT_PATH.open("wb") as handle:
            pickle.dump(model_bundle, handle)
        MODEL_MANIFEST_PATH.write_text(json.dumps({
            "generatedAt": report["generatedAt"],
            "version": model_bundle["version"],
            "method": model_bundle["method"],
            "modelPath": str(MODEL_EXPORT_PATH),
            "officialTestUsed": EVALUATE_TEST,
            "validation": report["finalValidation"],
            "pairCorrections": report["pairCorrection"]["selected"],
            "note": "Pickle is stored outside the repository. Regenerate with npm run genre-goal:macro-specialists-export.",
        }, ensure_ascii=False, indent=2))
        report["exportedModel"] = {
            "modelPath": str(MODEL_EXPORT_PATH),
            "manifestPath": str(MODEL_MANIFEST_PATH),
            "version": model_bundle["version"],
        }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({
        "dataset": report["dataset"], "missing": missing,
        "supportedFineLabels": len(report["supportedFineLabels"]), "unsupportedFineLabels": report["unsupportedFineLabels"],
        "selectedMacro": {
            "featureSet": macro_trial["featureSet"], "model": macro_trial["model"],
            "weightMode": macro_trial["weightMode"], "tagSource": macro_trial["tagSource"],
            "tagWeight": macro_trial["tagWeight"], "validation": macro_trial["validation"],
        },
        "selectedGlobalFine": {
            "featureSet": global_trial["featureSet"], "model": global_trial["model"],
            "weightMode": global_trial["weightMode"], "tagSource": global_trial["tagSource"],
            "tagWeight": global_trial["tagWeight"], "validation": report["selectedGlobalFine"]["validation"],
        },
        "selectedGate": selected_gate,
        "pairCorrection": report["pairCorrection"]["selected"],
        "finalValidation": report["finalValidation"],
        "testEvaluationEnabled": EVALUATE_TEST, "test": report["test"], "report": str(REPORT_PATH),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
