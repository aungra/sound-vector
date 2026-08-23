#!/usr/bin/env python3

import importlib.util
import pickle
import tempfile
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name("genre_unknown80_rhythm_reranker.py")
SPEC = importlib.util.spec_from_file_location("runtime_reranker", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FixedModel:
    def __init__(self, classes=("a", "b"), probabilities=(0.05, 0.95)):
        self.classes_ = np.asarray(classes, dtype=object)
        self.probabilities = np.asarray(probabilities, dtype=float)

    def predict_proba(self, values):
        return np.tile(self.probabilities, (len(values), 1))


class DimensionModel(FixedModel):
    def __init__(self, dimensions):
        super().__init__()
        self.dimensions = dimensions

    def predict_proba(self, values):
        if values.shape[1] != self.dimensions:
            raise ValueError("wrong feature dimensions")
        return super().predict_proba(values)


def bundle(group_members, group_models):
    return {
        "schemaVersion": MODULE.SCHEMA_VERSION,
        "modelVersion": "test",
        "labels": ["A", "B", "C", "D"],
        "librosaVectorLength": 4,
        "rhythmFeatureIndexes": [0, 1, 2, 3],
        "normalizationMode": "identity",
        "robustScaleMedian": [0.0] * 4,
        "robustScaleIqr": [1.0] * 4,
        "members": [],
        "models": {},
        "groupMembers": group_members,
        "groupModels": group_models,
    }


def pair_bundle():
    return {
        "schemaVersion": MODULE.SCHEMA_VERSION,
        "modelVersion": "test",
        "librosaVectorLength": 4,
        "rhythmFeatureIndexes": [0, 2],
        "robustScaleMedian": [0.0, 0.0],
        "robustScaleIqr": [1.0, 1.0],
        "members": [{"pair": ["a", "b"], "strength": 1.0}],
        "models": {("a", "b"): FixedModel()},
    }


class Unknown80RhythmRerankerTest(unittest.TestCase):
    def test_identity_normalization_preserves_full_feature_values(self):
        value = {
            "librosaVectorLength": 4,
            "rhythmFeatureIndexes": [0, 2, 3],
            "normalizationMode": "identity",
            "robustScaleMedian": [0.0, 0.0, 0.0],
            "robustScaleIqr": [1.0, 1.0, 1.0],
        }
        values = MODULE.rhythm_features(value, [12.0, 2.0, 300.0, -4.0])
        np.testing.assert_allclose(values, [12.0, 300.0, -4.0])

    def test_member_can_select_its_own_feature_view(self):
        value = pair_bundle()
        value["normalizationMode"] = "identity"
        value["members"][0]["featureIndexes"] = [0, 1, 2]
        value["members"][0]["normalizationMode"] = "identity"
        value["models"] = {("a", "b"): DimensionModel(3)}
        _scores, details = MODULE.rerank(
            value, ["a", "b", "c", "d"],
            [0.45, 0.35, 0.15, 0.05], [0.0, 1.0, 2.0, 3.0],
        )
        self.assertTrue(details["applied"])

    def test_rerank_preserves_top3_and_score_values(self):
        scores, details = MODULE.rerank(
            pair_bundle(), ["a", "b", "c", "d"],
            [0.45, 0.35, 0.15, 0.05], [0.0, 1.0, 0.0, 1.0],
        )
        self.assertEqual(details["before"], "a")
        self.assertEqual(details["after"], "b")
        self.assertTrue(details["top3SetPreserved"])
        self.assertTrue(details["scoreMultisetPreserved"])
        np.testing.assert_allclose(np.sort(scores), [0.05, 0.15, 0.35, 0.45])

    def test_member_confidence_floor_blocks_low_confidence_model(self):
        value = pair_bundle()
        value["members"][0]["confidenceFloor"] = 0.99
        scores, details = MODULE.rerank(
            value, ["a", "b", "c", "d"],
            [0.45, 0.35, 0.15, 0.05], [0.0, 1.0, 0.0, 1.0],
        )
        self.assertFalse(details["applied"])
        self.assertEqual(details["before"], details["after"])
        np.testing.assert_allclose(scores, [0.45, 0.35, 0.15, 0.05])

    def test_load_bundle_validates_schema(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "candidate.pkl"
            with path.open("wb") as handle:
                pickle.dump({"schemaVersion": "wrong"}, handle)
            with self.assertRaises(ValueError):
                MODULE.load_bundle(path)

    def test_rhythm_features_rejects_wrong_vector_length(self):
        with self.assertRaises(ValueError):
            MODULE.rhythm_features(pair_bundle(), [0.0, 1.0])


class RuntimeMacroRerankerTest(unittest.TestCase):
    def test_group_reorders_existing_top3_values(self):
        member = {
            "labels": ["A", "B"], "strength": 1.0,
            "confidenceFloor": 0.0, "candidateMassFloor": 0.0,
            "featureIndexes": [0, 1], "normalizationMode": "identity",
            "appendLogScores": True,
        }
        scores, details = MODULE.rerank(
            bundle([member], {("A", "B"): FixedModel(["A", "B"], [0.1, 0.9])}),
            ["A", "B", "C", "D"], [0.6, 0.3, 0.1, 0.0], [1, 2, 3, 4],
        )
        self.assertEqual(int(np.argmax(scores)), 1)
        self.assertTrue(details["top3SetPreserved"])
        self.assertTrue(details["scoreMultisetPreserved"])

    def test_conflicting_groups_leave_baseline_unchanged(self):
        first = {
            "labels": ["A", "B"], "strength": 1.0,
            "featureIndexes": [0], "normalizationMode": "identity",
        }
        second = {
            "labels": ["A", "C"], "strength": 1.0,
            "featureIndexes": [0], "normalizationMode": "identity",
        }
        scores, details = MODULE.rerank(
            bundle(
                [first, second],
                {
                    ("A", "B"): FixedModel(["A", "B"], [0.1, 0.9]),
                    ("A", "C"): FixedModel(["A", "C"], [0.1, 0.9]),
                },
            ),
            ["A", "B", "C", "D"], [0.6, 0.3, 0.1, 0.0], [1, 2, 3, 4],
        )
        np.testing.assert_allclose(scores, [0.6, 0.3, 0.1, 1e-12], atol=1e-10)
        self.assertTrue(details["groupConflictLeftAtBaseline"])


if __name__ == "__main__":
    unittest.main()
