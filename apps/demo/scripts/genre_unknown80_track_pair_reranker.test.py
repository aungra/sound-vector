import importlib.util
import pickle
from pathlib import Path
import tempfile
import unittest

import numpy as np


MODULE_PATH = Path(__file__).with_name("genre_unknown80_track_pair_reranker.py")
SPEC = importlib.util.spec_from_file_location("track_pair_runtime_tested", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FakePipeline:
    classes_ = np.asarray(["A", "B"])

    def __getitem__(self, index):
        return self

    def predict_proba(self, values):
        return np.asarray([[0.1, 0.9]])


def vectors(value):
    return {
        "effnet_tail": np.full(4, value, dtype=np.float64),
        "librosa": np.full(547, value, dtype=np.float64),
    }


class TrackPairRuntimeTest(unittest.TestCase):
    def test_raw_temporal_features_requires_four_segments(self):
        with self.assertRaises(ValueError):
            MODULE.raw_temporal_features([vectors(0), vectors(1)], "rhythm")

    def test_rerank_preserves_score_values(self):
        bundle = {
            "version": "unknown80-track-pair-v108-candidate",
            "labels": ["A", "B", "C"],
            "pairs": [{
                "labels": ["A", "B"], "view": "rhythm",
                "config": {"weight": 1.0, "confidenceFloor": 0.8},
                "pipeline": FakePipeline(),
            }],
        }
        scores, details = MODULE.rerank(
            bundle, ["A", "B", "C"], np.asarray([0.6, 0.3, 0.1]),
            [vectors(index) for index in range(4)],
        )
        self.assertTrue(details["applied"])
        self.assertEqual(list(scores), [0.3, 0.6, 0.1])

    def test_rerank_accepts_runtime_label_subset(self):
        bundle = {
            "version": "unknown80-track-pair-v108-candidate",
            "labels": ["A", "B", "C", "training-only-style"],
            "pairs": [{
                "labels": ["A", "B"], "view": "effnet",
                "config": {"weight": 1.0, "confidenceFloor": 0.8},
                "pipeline": FakePipeline(),
            }],
        }
        scores, details = MODULE.rerank(
            bundle, ["A", "B", "C"], np.asarray([0.6, 0.3, 0.1]),
            [vectors(index) for index in range(4)],
        )
        self.assertTrue(details["applied"])
        self.assertEqual(list(scores), [0.3, 0.6, 0.1])

    def test_route_top3_can_rescue_the_third_ranked_pair_member(self):
        bundle = {
            "version": "unknown80-track-pair-v112-candidate",
            "labels": ["A", "B", "C"],
            "pairs": [{
                "labels": ["A", "B"], "view": "rhythm",
                "config": {
                    "weight": 1.0, "confidenceFloor": 0.8,
                    "routeTopK": 3,
                },
                "pipeline": FakePipeline(),
            }],
        }
        scores, details = MODULE.rerank(
            bundle, ["A", "B", "C"], np.asarray([0.6, 0.1, 0.3]),
            [vectors(index) for index in range(4)],
        )
        self.assertTrue(details["applied"])
        self.assertEqual(details["evaluatedPairs"][0]["routeTopK"], 3)
        self.assertEqual(list(scores), [0.1, 0.6, 0.3])

    def test_rerank_falls_back_with_three_segments(self):
        scores, details = MODULE.rerank(
            {"version": "v", "labels": ["A"], "pairs": []},
            ["A"], np.asarray([1.0]), [vectors(0)] * 3,
        )
        self.assertEqual(list(scores), [1.0])
        self.assertEqual(details["reason"], "requires-four-segments")


if __name__ == "__main__":
    unittest.main()
