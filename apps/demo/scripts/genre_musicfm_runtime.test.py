import importlib.util
import unittest
from pathlib import Path

import numpy as np


MODULE_PATH = Path(__file__).with_name("genre_musicfm_runtime.py")
SPEC = importlib.util.spec_from_file_location("musicfm_runtime_tested", MODULE_PATH)
RUNTIME = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNTIME)


class FixedModel:
    classes_ = np.asarray(["A", "B", "C"], dtype=object)

    def predict_proba(self, features):
        self.shape = features.shape
        return np.asarray([[0.05, 0.9, 0.05]])


class MusicFmRuntimeTest(unittest.TestCase):
    def record(self):
        return {"embedding": [0.0] * 1024, "moments": [0.0] * 3072}

    def test_features_match_joint_mean_view(self):
        features = RUNTIME.features_from_record(self.record())
        self.assertEqual(features.shape, (2048,))

    def test_reranks_only_supported_top3(self):
        model = FixedModel()
        bundle = {
            "version": RUNTIME.VERSION,
            "pipeline": model,
            "eligibleLabels": ["A", "B", "C"],
            "config": {"weight": 0.5, "confidenceFloor": 0.8, "marginFloor": 0.0},
        }
        output, details = RUNTIME.rerank(
            bundle, ["A", "B", "C", "D"], [0.6, 0.3, 0.1, 0.0], self.record(),
        )
        self.assertTrue(details["applied"])
        self.assertEqual(int(np.argmax(output)), 1)
        self.assertEqual(model.shape, (1, 2048))

    def test_unsupported_top3_is_unchanged(self):
        bundle = {
            "version": RUNTIME.VERSION,
            "pipeline": FixedModel(),
            "eligibleLabels": ["A", "B"],
            "config": {"weight": 0.5, "confidenceFloor": 0.8},
        }
        scores = np.asarray([0.6, 0.3, 0.1])
        output, details = RUNTIME.rerank(
            bundle, ["A", "B", "C"], scores, self.record(),
        )
        np.testing.assert_array_equal(output, scores)
        self.assertFalse(details["applied"])
        self.assertEqual(details["reason"], "top3-not-supported")


if __name__ == "__main__":
    unittest.main()
