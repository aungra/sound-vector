import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name("genre-unknown80-rhythm-pairwise-screen.py")
SPEC = importlib.util.spec_from_file_location("unknown80_rhythm_pairwise", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class RhythmPairwiseScreenTest(unittest.TestCase):
    def test_align_librosa_marks_missing_rows(self):
        value = np.arange(MODULE.LIBROSA_DIMENSIONS, dtype=np.float32)
        matrix, available = MODULE.align_librosa(
            ["present", "missing"], {"present": value},
        )
        np.testing.assert_allclose(matrix[0], value)
        np.testing.assert_allclose(matrix[1], 0)
        self.assertEqual(available.tolist(), [True, False])

    def test_load_librosa_rejects_wrong_dimensions(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cache.json"
            path.write_text(json.dumps({
                "good": [0.0] * MODULE.LIBROSA_DIMENSIONS,
                "bad": [0.0] * 2,
            }))
            cache = MODULE.load_librosa([path])
        self.assertEqual(set(cache), {"good"})

    def test_rhythm_view_has_named_contract_size(self):
        positions = np.ones((3, 6), dtype=np.float32)
        librosa = np.ones((3, MODULE.LIBROSA_DIMENSIONS), dtype=np.float32)
        view = MODULE.view_matrix(
            "positions-rhythm", positions, librosa, np.asarray([0, 1]),
        )
        self.assertEqual(view.shape, (3, 6 + len(MODULE.RHYTHM_INDEXES)))

    def test_robust_scale_pair_uses_same_fold_contract(self):
        formal = np.asarray([[0.0], [2.0], [100.0]], dtype=np.float32)
        overlay = np.asarray([[1.0]], dtype=np.float32)
        scaled, scaled_overlay = MODULE.robust_scale_pair(
            formal, overlay, np.asarray([0, 1]),
        )
        self.assertAlmostEqual(float(scaled_overlay[0, 0]), 0.0)
        self.assertAlmostEqual(float(scaled[0, 0]), -1.0)
        self.assertAlmostEqual(float(scaled[1, 0]), 1.0)

    def test_robust_scale_parameters_round_trip_contract(self):
        matrix = np.asarray([[0.0], [2.0], [4.0]], dtype=np.float32)
        median, scale = MODULE.robust_scale_parameters(
            matrix, np.asarray([0, 1, 2]),
        )
        transformed = MODULE.apply_robust_scale(matrix, median, scale)
        np.testing.assert_allclose(transformed[:, 0], [-1.0, 0.0, 1.0])


if __name__ == "__main__":
    unittest.main()
