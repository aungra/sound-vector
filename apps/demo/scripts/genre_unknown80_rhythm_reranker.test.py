import importlib.util
import pickle
import tempfile
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name("genre_unknown80_rhythm_reranker.py")
SPEC = importlib.util.spec_from_file_location("unknown80_rhythm_reranker", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FixedModel:
    classes_ = np.asarray(["a", "b"], dtype=object)

    def predict_proba(self, values):
        return np.tile([[0.05, 0.95]], (len(values), 1))


def bundle():
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
        bundle = {
            "librosaVectorLength": 4,
            "rhythmFeatureIndexes": [0, 2, 3],
            "normalizationMode": "identity",
            "robustScaleMedian": [0.0, 0.0, 0.0],
            "robustScaleIqr": [1.0, 1.0, 1.0],
        }
        values = MODULE.rhythm_features(bundle, [12.0, 2.0, 300.0, -4.0])
        np.testing.assert_allclose(values, [12.0, 300.0, -4.0])

    def test_rerank_preserves_top3_and_score_values(self):
        scores, details = MODULE.rerank(
            bundle(), ["a", "b", "c", "d"],
            [0.45, 0.35, 0.15, 0.05], [0.0, 1.0, 0.0, 1.0],
        )
        self.assertEqual(details["before"], "a")
        self.assertEqual(details["after"], "b")
        self.assertTrue(details["top3SetPreserved"])
        self.assertTrue(details["scoreMultisetPreserved"])
        np.testing.assert_allclose(np.sort(scores), [0.05, 0.15, 0.35, 0.45])

    def test_load_bundle_validates_schema(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "candidate.pkl"
            with path.open("wb") as handle:
                pickle.dump({"schemaVersion": "wrong"}, handle)
            with self.assertRaises(ValueError):
                MODULE.load_bundle(path)

    def test_rhythm_features_rejects_wrong_vector_length(self):
        with self.assertRaises(ValueError):
            MODULE.rhythm_features(bundle(), [0.0, 1.0])


if __name__ == "__main__":
    unittest.main()
