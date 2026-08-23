import importlib.util
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name("genre-unknown80-v103-mulan-summary-screen.py")
SPEC = importlib.util.spec_from_file_location("v103_mulan_summary", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class MulanSummaryScreenTests(unittest.TestCase):
    def test_summary_views_are_order_stable_except_mean_std(self):
        segments = np.zeros((1, 3, 512), dtype=np.float32)
        segments[0, 0, 0] = 1.0
        segments[0, 1, 1] = 1.0
        segments[0, 2, 2] = 1.0
        scores = np.asarray([[0.7, 0.2, 0.1]], dtype=np.float32)
        first, available = MODULE.mulan_summary_views(
            segments.reshape(1, -1), scores
        )
        second, second_available = MODULE.mulan_summary_views(
            segments[:, ::-1].reshape(1, -1), scores
        )
        self.assertTrue(available[0])
        self.assertTrue(second_available[0])
        for name in MODULE.VIEWS:
            np.testing.assert_allclose(first[name], second[name])

    def test_zero_segment_marks_row_unavailable(self):
        positions = np.ones((2, 1536), dtype=np.float32)
        positions[1, 512:1024] = 0.0
        _views, available = MODULE.mulan_summary_views(
            positions, np.ones((2, 3), dtype=np.float32)
        )
        self.assertEqual(available.tolist(), [True, False])

    def test_compose_unique_keeps_conflicts_at_baseline(self):
        base = np.asarray([[3.0, 2.0], [3.0, 2.0], [3.0, 2.0]])
        one = base.copy()
        two = base.copy()
        one[0] = one[0, ::-1]
        one[1] = one[1, ::-1]
        two[1] = two[1, ::-1]
        two[2] = two[2, ::-1]
        output, conflicts = MODULE.compose_unique(base, [one, two])
        np.testing.assert_array_equal(output[0], one[0])
        np.testing.assert_array_equal(output[1], base[1])
        np.testing.assert_array_equal(output[2], two[2])
        self.assertEqual(conflicts, 1)


if __name__ == "__main__":
    unittest.main()
