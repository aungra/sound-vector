import importlib.util
from pathlib import Path
import unittest

import numpy as np


MODULE_PATH = Path(__file__).with_name("genre-unknown80-v107-track-reranker-screen.py")
SPEC = importlib.util.spec_from_file_location("track_reranker_screen_tested", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class TrackRerankerScreenTest(unittest.TestCase):
    def test_raw_temporal_features_use_all_four_segments(self):
        segments = [
            {
                "effnet_tail": np.asarray([index, index + 1], dtype=float),
                "librosa": np.asarray([index + 2], dtype=float),
            }
            for index in range(4)
        ]
        features = MODULE.raw_temporal_features(segments)
        self.assertEqual(features.shape, (15,))
        with self.assertRaises(ValueError):
            MODULE.raw_temporal_features(segments[:3])

    def test_rhythm_view_uses_only_contract_rhythm_indexes(self):
        segments = [
            {"effnet_tail": np.zeros(3840), "librosa": np.arange(547) + index}
            for index in range(4)
        ]
        self.assertEqual(MODULE.raw_temporal_features(segments, "rhythm").shape, (785,))

    def test_rerank_preserves_top3_set_and_score_multiset(self):
        base = np.asarray([[0.5, 0.3, 0.15, 0.05]])
        learned = np.asarray([[0.05, 0.1, 0.8, 0.05]])
        config = {"weight": 0.75, "confidenceFloor": 0.0, "marginFloor": 0.0}
        output, changed = MODULE.rerank_top3(base, learned, config)
        self.assertTrue(changed[0])
        self.assertEqual(set(np.argsort(-base[0])[:3]), set(np.argsort(-output[0])[:3]))
        self.assertEqual(sorted(base[0]), sorted(output[0]))
        self.assertEqual(int(np.argmax(output[0])), 2)

    def test_confidence_gate_can_retain_baseline(self):
        base = np.asarray([[0.5, 0.3, 0.2]])
        learned = np.asarray([[0.34, 0.33, 0.33]])
        config = {"weight": 0.75, "confidenceFloor": 0.7, "marginFloor": 0.3}
        output, changed = MODULE.rerank_top3(base, learned, config)
        np.testing.assert_allclose(output, base)
        self.assertFalse(changed[0])


if __name__ == "__main__":
    unittest.main()
