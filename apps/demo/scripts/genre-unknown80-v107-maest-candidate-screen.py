#!/usr/bin/env python3
"""Screen MAEST candidate extraction on the fixed v107 source-heldout OOF.

MAEST is research-only in this repository because its upstream model license is
CC-BY-NC-SA-4.0. This script therefore diagnoses candidate-set headroom only;
it cannot export or promote a production model.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
from collections import Counter
from pathlib import Path

import numpy as np
from sklearn.decomposition import PCA
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
V107_SOURCE_PATH = Path(__file__).with_name(
    "genre-unknown80-independent-stack-v107-source-heldout.py"
)
DEFAULT_MAEST_CACHE = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-formal-maest-prediction-moments-30s-cache.json"
)
DEFAULT_REPORT = TRAINING / "unknown80-v107-maest-candidate-screen.json"
DEFAULT_MARKDOWN = TRAINING / "unknown80-v107-maest-candidate-screen.md"
MODEL_KINDS = ("logistic-pca96", "extra-trees")
BLEND_WEIGHTS = (0.1, 0.25, 0.5, 0.75, 1.0)
CONFIDENCE_FLOORS = (0.0, 0.5, 0.65, 0.8)
MARGIN_FLOORS = (0.0, 0.1, 0.25)


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def normalize(values):
    values = np.asarray(values, dtype=np.float64)
    return values / np.maximum(values.sum(axis=1, keepdims=True), 1e-12)


def load_maest(path, source_keys):
    cache = json.loads(path.read_text())
    vectors = np.zeros((len(source_keys), 1200), dtype=np.float32)
    available = np.zeros(len(source_keys), dtype=bool)
    for index, key in enumerate(source_keys):
        value = cache.get(str(key))
        if not isinstance(value, list) or len(value) != 1200:
            continue
        vector = np.asarray(value, dtype=np.float32)
        if not np.all(np.isfinite(vector)):
            continue
        vectors[index] = vector
        available[index] = True
    return vectors, available


def make_model(kind, rows, dimensions, seed):
    if kind == "extra-trees":
        return ExtraTreesClassifier(
            n_estimators=480,
            max_features="sqrt",
            min_samples_leaf=2,
            class_weight="balanced",
            n_jobs=-1,
            random_state=seed,
        )
    components = max(2, min(96, dimensions, rows - 2))
    return make_pipeline(
        StandardScaler(),
        PCA(n_components=components, whiten=True, random_state=seed),
        LogisticRegression(
            C=0.5,
            class_weight="balanced",
            max_iter=1800,
            random_state=seed,
        ),
    )


def fit_model(kind, features, actual, sources, seed):
    model = make_model(kind, len(features), features.shape[1], seed)
    counts = Counter(zip(actual, sources))
    weights = np.asarray([
        1.0 / max(1, counts[(label, source)])
        for label, source in zip(actual, sources)
    ], dtype=np.float64)
    weights /= max(float(weights.mean()), 1e-12)
    fit_args = (
        {"sample_weight": weights}
        if kind == "extra-trees"
        else {"logisticregression__sample_weight": weights}
    )
    model.fit(features, actual, **fit_args)
    return model


def aligned_probabilities(model, features, labels):
    probabilities = model.predict_proba(features)
    classes = list(
        model.classes_ if hasattr(model, "classes_") else model[-1].classes_
    )
    output = np.zeros((len(features), len(labels)), dtype=np.float64)
    label_index = {label: index for index, label in enumerate(labels)}
    for column, label in enumerate(classes):
        if label in label_index:
            output[:, label_index[label]] = probabilities[:, column]
    return normalize(output)


def build_v107(args):
    source = load_module(V107_SOURCE_PATH, "maest_candidate_v107")
    modules = source.runtime_modules("maest_candidate")
    _v106, v105, helper, macro, global_screen, _stack, black, _electronic, _residual = modules
    payload = np.load(args.oof)
    labels = list(payload["labels"])
    formal, available = black.align_features(
        payload["sourceKeys"], black.load_feature_cache((args.formal_librosa,)),
    )
    v103, v106, held_sources, proposals, _details, _conflicts = source.build_v106(
        args, modules, payload, formal, available,
    )
    empty_features = np.empty((0, formal.shape[1]), dtype=np.float32)
    proposal, _detail = v105.crossfit_proposal(
        v103, *source.LATIN_FOLK_CONFIG,
        payload=payload,
        labels=labels,
        held_sources=held_sources,
        formal=formal,
        available=available,
        overlay_rows=[],
        overlay_features=empty_features,
        macro=macro,
        global_screen=global_screen,
        black=black,
    )
    scores, _conflicts = helper.compose_unique(v103, [*proposals, proposal])
    metric = black.metric(payload["actual"], scores, labels, payload["sources"])
    expected = (60.06, 59.86, 31.58, 83.48)
    observed = tuple(metric[key] for key in (
        "top1Accuracy", "balancedTop1", "minimumSourceTop1", "top3Accuracy",
    ))
    if observed != expected:
        raise ValueError(f"v107 reconstruction mismatch: {observed} != {expected}")
    return source, black, payload, scores, held_sources, metric


def preserve_multiset_candidate_rerank(
    base_scores, learned_scores, weight, confidence_floor, margin_floor,
):
    output = np.asarray(base_scores, dtype=np.float64).copy()
    base = normalize(base_scores)
    learned = normalize(learned_scores)
    changed_set = 0
    applicable = 0
    for row_index in range(len(output)):
        base_order = np.argsort(-base[row_index], kind="stable")
        learned_order = np.argsort(-learned[row_index], kind="stable")
        confidence = learned[row_index, learned_order[0]]
        margin = confidence - learned[row_index, learned_order[1]]
        if confidence < confidence_floor or margin < margin_floor:
            continue
        applicable += 1
        candidates = list(base_order[:3])
        learned_top = int(learned_order[0])
        if learned_top not in candidates:
            removed = candidates[-1]
            candidates[-1] = learned_top
            output[row_index, removed], output[row_index, learned_top] = (
                output[row_index, learned_top], output[row_index, removed]
            )
            changed_set += 1
        candidates_array = np.asarray(candidates, dtype=np.int64)
        old = normalize(base[row_index, candidates_array].reshape(1, -1))[0]
        evidence = normalize(learned[row_index, candidates_array].reshape(1, -1))[0]
        target = old * (1.0 - weight) + evidence * weight
        values = np.sort(output[row_index, candidates_array])[::-1]
        ordered_candidates = candidates_array[np.argsort(-target, kind="stable")]
        output[row_index, ordered_candidates] = values
    return output, {"applicableRows": applicable, "candidateSetChanges": changed_set}


def full_blend(base_scores, learned_scores, weight):
    return normalize(
        normalize(base_scores) * (1.0 - weight)
        + normalize(learned_scores) * weight
    )


def topk_recall(actual, scores, labels, k):
    label_index = {label: index for index, label in enumerate(labels)}
    expected = np.asarray([label_index[label] for label in actual], dtype=np.int64)
    predicted = np.argsort(-scores, axis=1)[:, :k]
    return round(float(np.mean(np.any(predicted == expected[:, None], axis=1))) * 100, 2)


def candidate_union_recall(actual, left_scores, right_scores, labels, k=3):
    label_index = {label: index for index, label in enumerate(labels)}
    expected = np.asarray([label_index[label] for label in actual], dtype=np.int64)
    left = np.argsort(-left_scores, axis=1)[:, :k]
    right = np.argsort(-right_scores, axis=1)[:, :k]
    covered = np.any(left == expected[:, None], axis=1) | np.any(
        right == expected[:, None], axis=1
    )
    return round(float(np.mean(covered)) * 100, 2)


def topk_breakdown(actual, scores, labels, groups=None):
    label_index = {label: index for index, label in enumerate(labels)}
    expected = np.asarray([label_index[label] for label in actual], dtype=np.int64)
    order = np.argsort(-scores, axis=1)
    top1 = order[:, 0] == expected
    top3 = np.any(order[:, :3] == expected[:, None], axis=1)

    def summarize(indexes):
        total = max(1, len(indexes))
        top1_count = int(np.sum(top1[indexes]))
        top3_count = int(np.sum(top3[indexes]))
        return {
            "total": int(len(indexes)),
            "top1": top1_count,
            "top1Accuracy": round(top1_count / total * 100, 2),
            "top3": top3_count,
            "top3Accuracy": round(top3_count / total * 100, 2),
            "rerankableTop3Errors": top3_count - top1_count,
            "outsideTop3": int(len(indexes)) - top3_count,
        }

    output = {"overall": summarize(np.arange(len(actual), dtype=np.int64))}
    confusions = Counter()
    for row_index, expected_label in enumerate(actual):
        if top1[row_index]:
            continue
        predicted_label = labels[int(order[row_index, 0])]
        confusions[(str(expected_label), str(predicted_label), bool(top3[row_index]))] += 1
    output["topConfusions"] = [
        {
            "actual": expected_label,
            "predicted": predicted_label,
            "actualInTop3": in_top3,
            "count": count,
        }
        for (expected_label, predicted_label, in_top3), count
        in confusions.most_common(80)
    ]
    output["byLabel"] = {
        str(label): summarize(np.flatnonzero(actual == label))
        for label in labels if np.any(actual == label)
    }
    if groups is not None:
        output["bySource"] = {
            str(group): summarize(np.flatnonzero(groups == group))
            for group in sorted(set(groups))
        }
    return output


def render(report):
    lines = [
        "# Unknown80 v107 MAEST candidate screen", "",
        "Research-only diagnostic. MAEST is not eligible for production export.", "",
        "| candidate | Top1 | balanced | min source | Top3 | + / - |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for name in report["ranking"][:30]:
        value = report["candidates"][name]
        lines.append(
            f"| {name} | {value['top1Accuracy']:.2f}% | "
            f"{value['balancedTop1']:.2f}% | {value['minimumSourceTop1']:.2f}% | "
            f"{value['top3Accuracy']:.2f}% | "
            f"{value.get('improved', 0)} / {value.get('harmed', 0)} |"
        )
    lines.extend(["", f"Decision: **{report['decision']}**", ""])
    return "\n".join(lines)


def run(args):
    _source, black, payload, v107, held_sources, baseline = build_v107(args)
    labels = list(payload["labels"])
    actual = payload["actual"]
    sources = payload["sources"]
    eligible = payload["trainingEligible"].astype(bool)
    vectors, available = load_maest(args.maest_cache, payload["sourceKeys"])
    learned_by_kind = {
        kind: np.zeros_like(v107, dtype=np.float64) for kind in MODEL_KINDS
    }
    learned_available = np.zeros(len(actual), dtype=bool)
    fold_details = []
    for fold_index, held_source in enumerate(held_sources):
        train_indexes = np.flatnonzero(
            (sources != held_source) & eligible & available
        )
        evaluation_indexes = np.flatnonzero((sources == held_source) & available)
        if not len(train_indexes) or not len(evaluation_indexes):
            continue
        learned_available[evaluation_indexes] = True
        for kind_index, kind in enumerate(MODEL_KINDS):
            model = fit_model(
                kind,
                vectors[train_indexes],
                actual[train_indexes],
                sources[train_indexes],
                2801001 + fold_index * 1000 + kind_index * 100,
            )
            learned_by_kind[kind][evaluation_indexes] = aligned_probabilities(
                model, vectors[evaluation_indexes], labels,
            )
        fold_details.append({
            "heldOutSource": str(held_source),
            "trainingRows": int(len(train_indexes)),
            "evaluationRows": int(len(evaluation_indexes)),
        })
    candidates = {"v107": baseline}
    diagnostics = {}
    evaluation_indexes = np.flatnonzero(learned_available)
    for kind, learned in learned_by_kind.items():
        learned_output = v107.copy()
        learned_output[evaluation_indexes] = learned[evaluation_indexes]
        diagnostics[kind] = {
            "availableRows": int(len(evaluation_indexes)),
            "learnedTop1": topk_recall(
                actual[evaluation_indexes], learned[evaluation_indexes], labels, 1,
            ),
            "learnedTop3": topk_recall(
                actual[evaluation_indexes], learned[evaluation_indexes], labels, 3,
            ),
            "v107Top1OnAvailable": topk_recall(
                actual[evaluation_indexes], v107[evaluation_indexes], labels, 1,
            ),
            "v107Top3OnAvailable": topk_recall(
                actual[evaluation_indexes], v107[evaluation_indexes], labels, 3,
            ),
            "top3UnionOracle": candidate_union_recall(
                actual[evaluation_indexes], v107[evaluation_indexes],
                learned[evaluation_indexes], labels, 3,
            ),
        }
        for weight in BLEND_WEIGHTS:
            output = v107.copy()
            output[evaluation_indexes] = full_blend(
                v107[evaluation_indexes], learned[evaluation_indexes], weight,
            )
            name = f"{kind}-full-blend-w{weight:g}"
            candidates[name] = black.compare_output(
                output, v107, actual, labels, sources,
            )
            for confidence_floor in CONFIDENCE_FLOORS:
                for margin_floor in MARGIN_FLOORS:
                    reranked, detail = preserve_multiset_candidate_rerank(
                        v107[evaluation_indexes], learned[evaluation_indexes],
                        weight, confidence_floor, margin_floor,
                    )
                    output = v107.copy()
                    output[evaluation_indexes] = reranked
                    name = (
                        f"{kind}-candidate-w{weight:g}-confidence{confidence_floor:g}"
                        f"-margin{margin_floor:g}"
                    )
                    candidates[name] = {
                        **black.compare_output(output, v107, actual, labels, sources),
                        **detail,
                    }
    ranking = sorted(candidates, key=lambda name: (
        candidates[name]["top1Accuracy"],
        candidates[name]["balancedTop1"],
        candidates[name]["minimumSourceTop1"],
        candidates[name]["top3Accuracy"],
    ), reverse=True)
    report = {
        "objective": "Measure whether a stronger audio representation can improve v107 candidate extraction.",
        "policy": {
            "metadataUsedAtInference": False,
            "urlSpecificRulesUsed": False,
            "sealedFinalHoldoutUsed": False,
            "matchingProviderExcludedFromOuterFold": True,
            "researchOnlyModelUsed": True,
            "productionModelUpdated": False,
        },
        "runtimeEligibility": {
            "technicallyReproducible": True,
            "productionEligible": False,
            "blocker": "MAEST upstream model license is CC-BY-NC-SA-4.0",
        },
        "dataset": {
            "rows": int(len(actual)),
            "labels": int(len(labels)),
            "maestCoverage": int(np.sum(available)),
            "crossFittedEvaluationRows": int(np.sum(learned_available)),
            "heldOutSources": [str(value) for value in held_sources],
        },
        "baseline": baseline,
        "baselineHeadroom": topk_breakdown(
            actual, v107, labels, groups=sources,
        ),
        "diagnostics": diagnostics,
        "folds": fold_details,
        "candidates": candidates,
        "ranking": ranking,
        "decision": "research-diagnostic-only-do-not-promote",
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def main():
    source = load_module(V107_SOURCE_PATH, "maest_candidate_defaults")
    parser, v105 = source.parser_defaults()
    parser.add_argument("--maest-cache", type=Path, default=DEFAULT_MAEST_CACHE)
    parser.set_defaults(report=DEFAULT_REPORT, markdown=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    args.deep_manifest = args.deep_manifest or list(v105.DEFAULT_DEEP_MANIFESTS)
    args.deep_cache = args.deep_cache or list(v105.DEFAULT_DEEP_CACHES)
    report = run(args)
    print(json.dumps({
        "baseline": report["baseline"],
        "diagnostics": report["diagnostics"],
        "topCandidates": [
            {"name": name, **report["candidates"][name]}
            for name in report["ranking"][:12]
        ],
        "decision": report["decision"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
