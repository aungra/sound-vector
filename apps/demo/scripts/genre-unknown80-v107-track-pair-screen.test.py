import importlib.util
from pathlib import Path
import unittest

import numpy as np


MODULE_PATH = Path(__file__).with_name("genre-unknown80-v107-track-pair-screen.py")
SPEC = importlib.util.spec_from_file_location("track_pair_screen_tested", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class TrackPairScreenTest(unittest.TestCase):
    def test_pair_swap_preserves_score_multiset(self):
        labels = ["A", "B", "C"]
        base = np.asarray([[0.6, 0.3, 0.1]])
        learned = np.asarray([[0.05, 0.95]])
        output, changed = MODULE.apply_pair(
            base, learned, ("A", "B"), labels,
            {"weight": 1.0, "confidenceFloor": 0.5},
        )
        self.assertTrue(changed[0])
        self.assertEqual(int(np.argmax(output[0])), 1)
        self.assertEqual(sorted(output[0]), sorted(base[0]))

    def test_pair_gate_keeps_uncertain_prediction(self):
        labels = ["A", "B", "C"]
        base = np.asarray([[0.6, 0.3, 0.1]])
        output, changed = MODULE.apply_pair(
            base, np.asarray([[0.51, 0.49]]), ("A", "B"), labels,
            {"weight": 1.0, "confidenceFloor": 0.8},
        )
        np.testing.assert_allclose(output, base)
        self.assertFalse(changed[0])


if __name__ == "__main__":
    unittest.main()
