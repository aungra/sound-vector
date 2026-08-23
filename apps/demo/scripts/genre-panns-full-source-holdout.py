"""Evaluate the full PANNs cache without shrinking to another cache's cohort.

This development gate uses canonical exact-Fine labels and whole-source
holdouts. It does not read the sealed YouTube holdout or modify production.
"""

from __future__ import annotations

import importlib.util
import json
import os
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from genre_source_family import source_family


ROOT = Path(__file__).resolve().parents[3]
TRAINING_DIR = ROOT / "genre-training"
HELPER_PATH = Path(__file__).with_name("genre-audio-only-frozen-representation-benchmark.py")
DEEP_PATH = Path(__file__).with_name("genre-audio-only-deep-representation-source-holdout.py")
ENGINE_PATH = Path(__file__).with_name("genre-embedding-macro-specialists.py")
BENCHMARK_PATH = Path(__file__).with_name("genre-embedding-32-benchmark.py")
CORPUS_PATH = TRAINING_DIR / "genre-v2-corpus.json"
SPLITS_PATH = TRAINING_DIR / "dataset-splits.json"
FMA_EXACT_POLICY_PATH = TRAINING_DIR / "fma-exact-label-policy.json"
PANNS_CACHE_PATH = Path(os.environ.get(
    "MMFR_PANNS_CACHE_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/panns-cnn14-30s-pilot-cache.json",
))
MAEST_CACHE_PATH = Path(os.environ.get(
    "MMFR_MAEST_30S_CACHE_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/maest-prediction-moments-30s-cache.json",
))
REPORT_PATH = Path(os.environ.get(
    "MMFR_PANNS_FULL_HOLDOUT_REPORT_PATH",
    str(TRAINING_DIR / "panns-full-source-heldout.json"),
))
AUDIT_PATH = Path(os.environ.get(
    "MMFR_PANNS_FULL_HOLDOUT_AUDIT_PATH",
    str(TRAINING_DIR / "panns-full-source-heldout.md"),
))
SEEDS = tuple(int(value) for value in os.environ.get(
    "MMFR_PANNS_FULL_HOLDOUT_SEEDS", "158001",
).split(",") if value.strip())
MIN_SOURCE_ROWS = max(5, int(os.environ.get("MMFR_PANNS_FULL_MIN_SOURCE_ROWS", "12")))
BLEND_MAEST = os.environ.get("MMFR_PANNS_FULL_BLEND_MAEST", "0") == "1"
MAEST_BLEND_WEIGHTS = tuple(float(value) for value in os.environ.get(
    "MMFR_PANNS_FULL_MAEST_BLEND_WEIGHTS", "0.5,0.6,0.7,0.75,0.8,0.85,0.9",
).split(",") if value.strip())
MAEST_LOCAL_DIRECT_WEIGHTS = tuple(float(value) for value in os.environ.get(
    "MMFR_PANNS_FULL_MAEST_LOCAL_DIRECT_WEIGHTS", "0.7,0.75,0.8",
).split(",") if value.strip())
PANNS_TRIPLE_BLEND_WEIGHTS = tuple(float(value) for value in os.environ.get(
    "MMFR_PANNS_FULL_TRIPLE_PANNS_WEIGHTS", "0.1,0.2,0.3,0.4",
).split(",") if value.strip())
NESTED_BASE_DIRECT_WEIGHT = float(os.environ.get(
    "MMFR_PANNS_FULL_NESTED_BASE_DIRECT_WEIGHT", "0.7",
))
NESTED_CLASS_WEIGHTS = tuple(float(value) for value in os.environ.get(
    "MMFR_PANNS_FULL_NESTED_CLASS_WEIGHTS", "0,0.1,0.2,0.3,0.4,0.5",
).split(",") if value.strip())


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_fma_exact_fine(path=FMA_EXACT_POLICY_PATH):
    payload = json.loads(Path(path).read_text())
    allowed = defaultdict(set)
    for rule in payload.get("rules", []):
        if rule.get("action") != "fine":
            continue
        track_ids = {str(value) for value in rule.get("trackIds", [])}
        for genre in rule.get("genres", []):
            allowed[genre].update(track_ids)
    return dict(allowed)


def has_strict_source_evidence(row, label, fma_exact_fine):
    if source_family(row) != "FMA":
        return True
    return str(row.get("trackId") or "") in fma_exact_fine.get(label, set())


def exact_rows(corpus, engine, split_membership, fma_exact_fine=None):
    fma_exact_fine = (
        load_fma_exact_fine() if fma_exact_fine is None else fma_exact_fine
    )
    rows = []
    for row in corpus.get("items", []):
        key = engine.source_key(row)
        label = row.get("canonicalFineLabel")
        if (
            key
            and label
            and row.get("sourceLabelAction") == "exact"
            and row.get("v2TrainingRole") == "fine"
            and split_membership.get(key) in {"train", "validation"}
            and has_strict_source_evidence(row, label, fma_exact_fine)
        ):
            rows.append({
                **row,
                "sourceKey": key,
                "genre": label,
                "split": split_membership[key],
            })
    return rows


def aggregate_runs(runs):
    total = sum(run["metric"]["total"] for run in runs)
    by_label = defaultdict(lambda: {"total": 0, "top1": 0})
    by_source = {}
    for run in runs:
        by_source.setdefault(run["source"], []).append(run["metric"])
        for label, value in run["metric"]["byLabel"].items():
            by_label[label]["total"] += value["total"]
            by_label[label]["top1"] += value["top1"]
    pooled = {
        field: round(sum(
            run["metric"][field] * run["metric"]["total"] for run in runs
        ) / max(1, total), 2)
        for field in ("top1Accuracy", "top3Accuracy")
    }
    pooled.update({
        "total": total,
        "balancedTop1": round(float(np.mean([
            value["top1"] / max(1, value["total"]) for value in by_label.values()
        ])) * 100, 2),
        "minimumSourceTop1": min(
            metric["top1Accuracy"]
            for metrics in by_source.values() for metric in metrics
        ),
    })
    return {
        "pooled": pooled,
        "bySource": {
            source: {
                "total": sum(value["total"] for value in metrics),
                "top1Accuracy": round(sum(
                    value["top1Accuracy"] * value["total"] for value in metrics
                ) / sum(value["total"] for value in metrics), 2),
            }
            for source, metrics in sorted(by_source.items())
        },
        "byLabel": {
            label: {
                **value,
                "accuracy": round(value["top1"] / max(1, value["total"]) * 100, 1),
            }
            for label, value in sorted(by_label.items())
        },
        "bySourceLabel": {
            source: {
                label: {
                    "total": value["total"],
                    "top1": value["top1"],
                    "accuracy": round(
                        value["top1"] / max(1, value["total"]) * 100, 1,
                    ),
                }
                for label, value in sorted(metrics[0]["byLabel"].items())
            }
            for source, metrics in sorted(by_source.items())
        },
    }


def source_prototype_scores(matrix, train_rows, evaluation_indexes, labels, reduction="mean", temperature=12.0):
    normalized = matrix / np.maximum(np.linalg.norm(matrix, axis=1, keepdims=True), 1e-12)
    grouped = defaultdict(list)
    for row in train_rows:
        grouped[(row["genre"], source_family(row))].append(row["deepIndex"])
    prototypes = defaultdict(list)
    for (label, _source), indexes in grouped.items():
        centroid = normalized[indexes].mean(axis=0)
        centroid /= max(float(np.linalg.norm(centroid)), 1e-12)
        prototypes[label].append(centroid)
    similarities = np.full((len(evaluation_indexes), len(labels)), -1.0, dtype=np.float64)
    evaluation = normalized[evaluation_indexes]
    for label_index, label in enumerate(labels):
        if not prototypes[label]:
            continue
        local = evaluation @ np.asarray(prototypes[label]).T
        if reduction == "max":
            similarities[:, label_index] = np.max(local, axis=1)
        elif reduction == "mean":
            similarities[:, label_index] = np.mean(local, axis=1)
        else:
            raise ValueError(f"Unknown prototype reduction: {reduction}")
    logits = similarities * temperature
    logits -= np.max(logits, axis=1, keepdims=True)
    scores = np.exp(np.clip(logits, -60.0, 0.0))
    return scores / np.maximum(scores.sum(axis=1, keepdims=True), 1e-12)


def blend_scores(candidate, direct, direct_weight):
    output = candidate * (1.0 - direct_weight) + direct * direct_weight
    return output / np.maximum(output.sum(axis=1, keepdims=True), 1e-12)


def class_blend_scores(base, candidate, weights):
    values = np.asarray(weights, dtype=np.float64).reshape(1, -1)
    output = base * (1.0 - values) + candidate * values
    return output / np.maximum(output.sum(axis=1, keepdims=True), 1e-12)


def _record_score(records, labels, weights, helper):
    actual = []
    scores = []
    for record in records:
        actual.extend(record["actual"])
        scores.append(class_blend_scores(record["base"], record["candidate"], weights))
    return helper.metric(actual, np.concatenate(scores), labels)


def select_nested_class_weights(records, labels, helper):
    weights = np.zeros(len(labels), dtype=np.float64)
    source_names = sorted({record["source"] for record in records})
    accepted = []
    for _pass in range(2):
        changed = False
        for label_index, label in enumerate(labels):
            baseline = _record_score(records, labels, weights, helper)
            baseline_by_source = {
                source: _record_score(
                    [record for record in records if record["source"] == source],
                    labels, weights, helper,
                )["top1Accuracy"]
                for source in source_names
            }
            trials = []
            for value in NESTED_CLASS_WEIGHTS:
                trial_weights = weights.copy()
                trial_weights[label_index] = value
                score = _record_score(records, labels, trial_weights, helper)
                source_scores = {
                    source: _record_score(
                        [record for record in records if record["source"] == source],
                        labels, trial_weights, helper,
                    )["top1Accuracy"]
                    for source in source_names
                }
                gains = [source_scores[source] - baseline_by_source[source] for source in source_names]
                trials.append({
                    "value": value,
                    "weights": trial_weights,
                    "score": score,
                    "gain": score["top1Accuracy"] - baseline["top1Accuracy"],
                    "balancedGain": score["balancedTop1"] - baseline["balancedTop1"],
                    "improvedSources": sum(gain > 0 for gain in gains),
                    "harmedSources": sum(gain < 0 for gain in gains),
                    "worstSourceGain": min(gains) if gains else 0.0,
                })
            trials.sort(key=lambda row: (
                row["gain"], row["balancedGain"], row["improvedSources"],
                -row["harmedSources"], -row["value"],
            ), reverse=True)
            selected = next((row for row in trials if (
                row["gain"] > 0
                and row["improvedSources"] >= 2
                and row["harmedSources"] <= 1
                and row["worstSourceGain"] >= -1.0
            )), None)
            if selected is not None and selected["value"] != weights[label_index]:
                weights = selected["weights"]
                accepted.append({
                    "label": label,
                    **{key: selected[key] for key in (
                        "value", "gain", "balancedGain", "improvedSources",
                        "harmedSources", "worstSourceGain",
                    )},
                })
                changed = True
        if not changed:
            break
    return weights, accepted


def select_robust_nested_class_weights(records, labels, helper):
    """Select class blends that improve both pooled and balanced accuracy.

    This is deliberately stricter than the legacy selector. A trial must help
    at least two development sources and may not reduce any development source.
    The held-out source is never present in ``records``.
    """

    weights = np.zeros(len(labels), dtype=np.float64)
    source_names = sorted({record["source"] for record in records})
    accepted = []
    for _pass in range(2):
        changed = False
        for label_index, label in enumerate(labels):
            baseline = _record_score(records, labels, weights, helper)
            baseline_by_source = {
                source: _record_score(
                    [record for record in records if record["source"] == source],
                    labels, weights, helper,
                )["top1Accuracy"]
                for source in source_names
            }
            trials = []
            for value in NESTED_CLASS_WEIGHTS:
                trial_weights = weights.copy()
                trial_weights[label_index] = value
                score = _record_score(records, labels, trial_weights, helper)
                source_scores = {
                    source: _record_score(
                        [record for record in records if record["source"] == source],
                        labels, trial_weights, helper,
                    )["top1Accuracy"]
                    for source in source_names
                }
                gains = [
                    source_scores[source] - baseline_by_source[source]
                    for source in source_names
                ]
                trials.append({
                    "value": value,
                    "weights": trial_weights,
                    "score": score,
                    "gain": score["top1Accuracy"] - baseline["top1Accuracy"],
                    "balancedGain": score["balancedTop1"] - baseline["balancedTop1"],
                    "improvedSources": sum(gain > 0 for gain in gains),
                    "harmedSources": sum(gain < 0 for gain in gains),
                    "worstSourceGain": min(gains) if gains else 0.0,
                })
            trials.sort(key=lambda row: (
                row["gain"], row["balancedGain"], row["improvedSources"],
                -row["value"],
            ), reverse=True)
            selected = next((row for row in trials if (
                row["gain"] > 0
                and row["balancedGain"] >= 0
                and row["improvedSources"] >= 2
                and row["harmedSources"] == 0
                and row["worstSourceGain"] >= 0
            )), None)
            if selected is not None and selected["value"] != weights[label_index]:
                weights = selected["weights"]
                accepted.append({
                    "label": label,
                    **{key: selected[key] for key in (
                        "value", "gain", "balancedGain", "improvedSources",
                        "harmedSources", "worstSourceGain",
                    )},
                })
                changed = True
        if not changed:
            break
    return weights, accepted


def nested_class_blend_runs(records, labels, helper):
    runs = []
    diagnostics = []
    for source in sorted({record["source"] for record in records}):
        development = [
            record for record in records
            if record["source"] != source
            and record.get("developmentEligible", True)
        ]
        evaluation = [record for record in records if record["source"] == source]
        weights, accepted = select_nested_class_weights(development, labels, helper)
        diagnostics.append({
            "heldOutSource": source,
            "nonzeroWeights": {
                label: round(float(weights[index]), 3)
                for index, label in enumerate(labels) if weights[index] > 0
            },
            "accepted": accepted,
        })
        for record in evaluation:
            scores = class_blend_scores(record["base"], record["candidate"], weights)
            runs.append({
                "source": source,
                "seed": record["seed"],
                "metric": helper.metric(record["actual"], scores, labels),
            })
    return runs, diagnostics


def robust_nested_class_blend_runs(records, labels, helper):
    """Cross-fit the robust class selector with one source held out."""

    runs = []
    diagnostics = []
    for source in sorted({record["source"] for record in records}):
        development = [
            record for record in records
            if record["source"] != source
            and record.get("developmentEligible", True)
        ]
        evaluation = [record for record in records if record["source"] == source]
        weights, accepted = select_robust_nested_class_weights(
            development, labels, helper,
        )
        diagnostics.append({
            "heldOutSource": source,
            "policy": "pooled-and-balanced-no-source-harm",
            "nonzeroWeights": {
                label: round(float(weights[index]), 3)
                for index, label in enumerate(labels) if weights[index] > 0
            },
            "accepted": accepted,
        })
        for record in evaluation:
            scores = class_blend_scores(record["base"], record["candidate"], weights)
            runs.append({
                "source": source,
                "seed": record["seed"],
                "metric": helper.metric(record["actual"], scores, labels),
            })
    return runs, diagnostics


def render(report):
    lines = [
        "# Full PANNs exact-Fine source holdout",
        "",
        "Audio-only development gate. The sealed holdout and production model are unchanged.",
        "",
        f"- Cached exact-Fine rows: {report['dataset']['cachedRows']}",
        f"- Labels: {report['dataset']['labels']}",
        f"- Held-out sources: {', '.join(report['dataset']['sources'])}",
        "",
        "| candidate | Top1 | balanced | minimum source |",
        "|---|---:|---:|---:|",
    ]
    for name in report["ranking"]:
        score = report["candidates"][name]["pooled"]
        lines.append(
            f"| {name} | {score['top1Accuracy']:.2f}% | "
            f"{score['balancedTop1']:.2f}% | {score['minimumSourceTop1']:.2f}% |"
        )
    lines.extend([
        "",
        f"Selected: **{report['selected']}**",
        f"80% reached: **{'yes' if report['goalDiagnostic']['audioOnlyTop1AtLeast80'] else 'no'}**",
        "",
    ])
    return "\n".join(lines)


def main():
    helper = load_module(HELPER_PATH, "panns_full_helper")
    deep = load_module(DEEP_PATH, "panns_full_deep")
    engine = load_module(ENGINE_PATH, "panns_full_engine")
    benchmark = load_module(BENCHMARK_PATH, "panns_full_benchmark") if BLEND_MAEST else None
    corpus = json.loads(CORPUS_PATH.read_text())
    splits = json.loads(SPLITS_PATH.read_text())
    membership = {
        engine.source_key(row): row.get("split")
        for row in splits.get("items", []) if engine.source_key(row)
    }
    rows = exact_rows(corpus, engine, membership)
    rows_by_key = {row["sourceKey"]: row for row in rows}
    cached = deep.load_deep_cache(helper, "panns", PANNS_CACHE_PATH, set(rows_by_key))
    keys = sorted(cached)
    rows = [{**rows_by_key[key], "deepIndex": index} for index, key in enumerate(keys)]
    vectors = {name: np.stack([cached[key][name] for key in keys]).astype(np.float32)
               for name in sorted(next(iter(cached.values())))}
    maest_by_key = {}
    if BLEND_MAEST:
        maest_by_key, _invalid = helper.load_selected_vectors(MAEST_CACHE_PATH, 1200, set(keys))
    matrices = {
        "panns-embedding-mean-extra-trees": vectors["panns-embedding-mean"],
        "panns-moments-extra-trees": vectors["panns-moments"],
        "panns-tag-mean-extra-trees": vectors["panns-tag-mean"],
        "panns-embedding-mean-pca-logistic": vectors["panns-embedding-mean"],
        "panns-embedding-mean-cosine-centroid": vectors["panns-embedding-mean"],
        "panns-embedding-mean-source-prototype-mean": vectors["panns-embedding-mean"],
        "panns-embedding-mean-source-prototype-max": vectors["panns-embedding-mean"],
    }
    model_kind = {
        name: (
            "logistic-pca192" if name.endswith("pca-logistic")
            else "cosine-centroid" if name.endswith("cosine-centroid")
            else "source-prototype-mean" if name.endswith("source-prototype-mean")
            else "source-prototype-max" if name.endswith("source-prototype-max")
            else "extra-trees"
        )
        for name in matrices
    }
    labels = sorted({row["genre"] for row in rows})
    source_counts = Counter(source_family(row) for row in rows)
    sources = sorted(source for source, count in source_counts.items() if count >= MIN_SOURCE_ROWS)
    runs = {name: [] for name in matrices}
    nested_records = []
    nested_diagnostics = []
    if BLEND_MAEST:
        runs["maest30-direct"] = []
        for weight in MAEST_BLEND_WEIGHTS:
            runs[f"panns-source-prototype-max-maest-direct-w{weight:g}"] = []
        for direct_weight in MAEST_LOCAL_DIRECT_WEIGHTS:
            base_name = f"maest-local-direct-w{direct_weight:g}"
            runs[base_name] = []
            for panns_weight in PANNS_TRIPLE_BLEND_WEIGHTS:
                runs[f"{base_name}-panns-w{panns_weight:g}"] = []
        discogs_classes = benchmark.load_json(
            benchmark.DISCOGS_META_PATH, {"classes": []},
        )["classes"]
    observations_per_seed = 0
    for seed_index, seed in enumerate(SEEDS):
        for source_index, source in enumerate(sources):
            train = [row for row in rows if row["split"] == "train" and source_family(row) != source]
            evaluation = [
                row for row in rows
                if source_family(row) == source
                and (not BLEND_MAEST or row["sourceKey"] in maest_by_key)
            ]
            if not train or not evaluation:
                continue
            if seed_index == 0:
                observations_per_seed += len(evaluation)
            train_indexes = np.asarray([row["deepIndex"] for row in train], dtype=np.int64)
            eval_indexes = np.asarray([row["deepIndex"] for row in evaluation], dtype=np.int64)
            print(
                f"seed {seed_index + 1}/{len(SEEDS)} source {source_index + 1}/{len(sources)} "
                f"{source} train={len(train)} eval={len(evaluation)}",
                flush=True,
            )
            fold_scores = {}
            for feature_index, (name, matrix) in enumerate(matrices.items()):
                if model_kind[name].startswith("source-prototype-"):
                    scores = source_prototype_scores(
                        matrix, train, eval_indexes, labels,
                        reduction=model_kind[name].removeprefix("source-prototype-"),
                    )
                else:
                    model = helper.fit_model(
                        model_kind[name], matrix[train_indexes],
                        np.asarray([row["genre"] for row in train], dtype=object),
                        seed + source_index * 1000 + feature_index * 20,
                        helper.source_work_weights(train, "genre"),
                    )
                    scores = helper.aligned_scores(model, matrix[eval_indexes], labels)
                fold_scores[name] = scores
                runs[name].append({
                    "source": source,
                    "seed": seed,
                    "metric": helper.metric([row["genre"] for row in evaluation], scores, labels),
                })
            if BLEND_MAEST:
                wrapped = [
                    {**row, "vectors": {"maest30": maest_by_key[row["sourceKey"]]}}
                    for row in evaluation
                ]
                direct = benchmark.pretrained_tag_scores(
                    wrapped, labels, benchmark.FINE_TAG_PATTERNS,
                    discogs_classes, "maest30",
                )
                actual = [row["genre"] for row in evaluation]
                maest_train = [row for row in train if row["sourceKey"] in maest_by_key]
                maest_train_matrix = np.stack([
                    maest_by_key[row["sourceKey"]] for row in maest_train
                ]).astype(np.float32)
                maest_eval_matrix = np.stack([
                    maest_by_key[row["sourceKey"]] for row in evaluation
                ]).astype(np.float32)
                maest_model = helper.fit_model(
                    "extra-trees",
                    maest_train_matrix,
                    np.asarray([row["genre"] for row in maest_train], dtype=object),
                    seed + source_index * 1000 + 9000,
                    helper.source_work_weights(maest_train, "genre"),
                )
                maest_local = helper.aligned_scores(maest_model, maest_eval_matrix, labels)
                runs["maest30-direct"].append({
                    "source": source,
                    "seed": seed,
                    "metric": helper.metric(actual, direct, labels),
                })
                prototype = fold_scores["panns-embedding-mean-source-prototype-max"]
                for weight in MAEST_BLEND_WEIGHTS:
                    name = f"panns-source-prototype-max-maest-direct-w{weight:g}"
                    runs[name].append({
                        "source": source,
                        "seed": seed,
                        "metric": helper.metric(
                            actual, blend_scores(prototype, direct, weight), labels,
                        ),
                    })
                for direct_weight in MAEST_LOCAL_DIRECT_WEIGHTS:
                    base_name = f"maest-local-direct-w{direct_weight:g}"
                    base = blend_scores(maest_local, direct, direct_weight)
                    runs[base_name].append({
                        "source": source,
                        "seed": seed,
                        "metric": helper.metric(actual, base, labels),
                    })
                    for panns_weight in PANNS_TRIPLE_BLEND_WEIGHTS:
                        name = f"{base_name}-panns-w{panns_weight:g}"
                        runs[name].append({
                            "source": source,
                            "seed": seed,
                            "metric": helper.metric(
                                actual, blend_scores(base, prototype, panns_weight), labels,
                            ),
                        })
                    if abs(direct_weight - NESTED_BASE_DIRECT_WEIGHT) < 1e-9:
                        nested_records.append({
                            "source": source,
                            "seed": seed,
                            "actual": actual,
                            "base": base,
                            "candidate": prototype,
                        })
    if nested_records:
        nested_runs, nested_diagnostics = nested_class_blend_runs(
            nested_records, labels, helper,
        )
        runs["maest-local-direct-nested-class-panns"] = nested_runs
    candidates = {name: aggregate_runs(values) for name, values in runs.items() if values}
    ranking = sorted(candidates, key=lambda name: (
        candidates[name]["pooled"]["top1Accuracy"],
        candidates[name]["pooled"]["balancedTop1"],
        candidates[name]["pooled"]["minimumSourceTop1"],
    ), reverse=True)
    selected = ranking[0]
    top1 = candidates[selected]["pooled"]["top1Accuracy"]
    report = {
        "objective": "Measure PANNs scaling on all cached exact-Fine rows with whole-source holdout.",
        "policy": {
            "metadataUsed": False,
            "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "productionModelUpdated": False,
            "labelPolicy": "canonical exact-Fine only",
            "maestDirectBlend": BLEND_MAEST,
        },
        "dataset": {
            "eligibleRows": len(rows_by_key),
            "cachedRows": len(rows),
            "evaluationRowsPerSeed": observations_per_seed,
            "labels": len(labels),
            "sources": sources,
            "sourceCounts": dict(source_counts),
            "maestAvailableRows": len(maest_by_key),
        },
        "seeds": list(SEEDS),
        "candidates": candidates,
        "ranking": ranking,
        "selected": selected,
        "nestedClassBlendDiagnostics": nested_diagnostics,
        "goalDiagnostic": {
            "targetTop1": 80.0,
            "bestTop1": top1,
            "remainingGap": round(80.0 - top1, 2),
            "audioOnlyTop1AtLeast80": top1 >= 80.0,
        },
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    AUDIT_PATH.write_text(render(report))
    print(json.dumps({
        "selected": selected,
        "score": candidates[selected]["pooled"],
        "goalDiagnostic": report["goalDiagnostic"],
        "report": str(REPORT_PATH),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
