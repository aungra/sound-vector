"""Serializable classifier components shared by genre training and inference."""

import numpy as np
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.linear_model import LogisticRegression


SEGMENT_ARBITRATOR_SCHEMA_VERSION = 1


def segment_arbitrator_features(segment_scores):
    """Summarize per-segment probabilities without depending on track metadata."""
    scores = np.asarray(segment_scores, dtype=np.float64)
    if scores.ndim != 2 or scores.shape[0] < 1 or scores.shape[1] < 2:
        raise ValueError("segment_scores must be a non-empty 2D probability matrix")
    scores = np.maximum(scores, 1e-12)
    scores /= np.maximum(scores.sum(axis=1, keepdims=True), 1e-12)
    mean = scores.mean(axis=0)
    median = np.median(scores, axis=0)
    variance = scores.var(axis=0)
    logit_median = np.median(np.log(scores), axis=0)
    logit_median -= np.max(logit_median)
    logit_median = np.exp(logit_median)
    logit_median /= np.maximum(logit_median.sum(), 1e-12)
    top_indexes = np.argmax(scores, axis=1)
    aggregate_top = int(np.argmax(mean))
    agreement = float(np.mean(top_indexes == aggregate_top))
    drift = float(np.mean(np.sum(np.abs(scores - mean), axis=1) * 0.5))
    ordered = np.sort(scores, axis=1)
    margins = ordered[:, -1] - ordered[:, -2]
    diagnostics = np.asarray([
        agreement,
        drift,
        float(np.mean(margins)),
        float(np.std(margins)),
        min(1.0, scores.shape[0] / 3.0),
    ], dtype=np.float64)
    return np.concatenate([mean, median, variance, logit_median, diagnostics])


def segment_override_gate_features(base_scores, arbitrator_scores, segment_features):
    base = np.asarray(base_scores, dtype=np.float64)
    arbitrator = np.asarray(arbitrator_scores, dtype=np.float64)
    segments = np.asarray(segment_features, dtype=np.float64)
    if base.ndim == 1:
        base = base.reshape(1, -1)
    if arbitrator.ndim == 1:
        arbitrator = arbitrator.reshape(1, -1)
    if segments.ndim == 1:
        segments = segments.reshape(1, -1)
    if base.shape != arbitrator.shape or len(base) != len(segments):
        raise ValueError("override gate inputs must have aligned rows and class scores")
    base_ordered = np.sort(base, axis=1)
    arbitrator_ordered = np.sort(arbitrator, axis=1)
    diagnostics = np.column_stack([
        np.max(base, axis=1),
        base_ordered[:, -1] - base_ordered[:, -2],
        np.max(arbitrator, axis=1),
        arbitrator_ordered[:, -1] - arbitrator_ordered[:, -2],
        np.sum(np.abs(base - arbitrator), axis=1) * 0.5,
    ])
    return np.concatenate([
        base, arbitrator, arbitrator - base, diagnostics, segments[:, -5:],
    ], axis=1)


def segment_family_specialist_scores(base_scores, segment_features, specialists, labels):
    output = np.asarray(base_scores, dtype=np.float64).copy()
    features = np.asarray(segment_features, dtype=np.float64)
    destination = {label: index for index, label in enumerate(labels)}
    top_labels = np.asarray([
        labels[index] for index in np.argmax(output, axis=1)
    ], dtype=object)
    for specialist in specialists.values():
        local_labels = [label for label in specialist["labels"] if label in destination]
        if len(local_labels) < 2:
            continue
        routed = np.asarray([label in local_labels for label in top_labels], dtype=bool)
        if not np.any(routed):
            continue
        row_indexes = np.flatnonzero(routed)
        indexes = np.asarray([destination[label] for label in local_labels], dtype=np.int64)
        pipeline = specialist["pipeline"]
        raw = pipeline.predict_proba(features[routed])
        source_indexes = {
            label: index for index, label in enumerate(pipeline.classes_)
        }
        replacement = np.asarray([
            [row[source_indexes[label]] for label in local_labels]
            for row in raw
        ], dtype=np.float64)
        replacement /= np.maximum(replacement.sum(axis=1, keepdims=True), 1e-12)
        family_mass = output[np.ix_(row_indexes, indexes)].sum(axis=1, keepdims=True)
        output[np.ix_(row_indexes, indexes)] = replacement * family_mass
    output /= np.maximum(output.sum(axis=1, keepdims=True), 1e-12)
    return output


class OVRNeighborClassifier(ClassifierMixin, BaseEstimator):
    """Independent binary genre heads with stronger same-family negatives."""

    def __init__(self, c=0.55, max_iter=1600, same_macro_weight=2.0, macro_lookup=None, random_state=0):
        self.c = c
        self.max_iter = max_iter
        self.same_macro_weight = same_macro_weight
        self.macro_lookup = macro_lookup
        self.random_state = random_state

    def fit(self, values, targets, sample_weight=None):
        x = np.asarray(values, dtype=np.float64)
        y = np.asarray(targets, dtype=object)
        self.classes_ = np.asarray(sorted(set(y)), dtype=object)
        self.models_ = []
        base = np.ones(len(y), dtype=np.float64) if sample_weight is None else np.asarray(sample_weight, dtype=np.float64)
        lookup = self.macro_lookup or {}
        for index, label in enumerate(self.classes_):
            binary = (y == label).astype(int)
            if binary.min() == binary.max():
                self.models_.append(None)
                continue
            weights = base.copy()
            macro = lookup.get(label)
            if macro:
                hard_negative = np.asarray([
                    target != label and lookup.get(target) == macro for target in y
                ], dtype=bool)
                weights[hard_negative] *= float(self.same_macro_weight)
            model = LogisticRegression(
                C=self.c, class_weight="balanced", max_iter=self.max_iter,
                solver="liblinear", random_state=self.random_state + index,
            )
            model.fit(x, binary, sample_weight=weights)
            self.models_.append(model)
        return self

    def predict_proba(self, values):
        x = np.asarray(values, dtype=np.float64)
        scores = np.zeros((len(x), len(self.classes_)), dtype=np.float64)
        for index, model in enumerate(self.models_):
            scores[:, index] = 1.0 if model is None else model.predict_proba(x)[:, 1]
        scores += 1e-12
        return scores / scores.sum(axis=1, keepdims=True)
