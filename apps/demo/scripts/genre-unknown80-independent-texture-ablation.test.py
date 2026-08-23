import importlib.util
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name(
    "genre-unknown80-independent-texture-ablation.py"
)
SPEC = importlib.util.spec_from_file_location("texture_ablation", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FakeModel:
    classes_ = np.asarray(["A", "B"], dtype=object)

    def predict_proba(self, values):
        return np.repeat([[0.05, 0.95]], len(values), axis=0)


class TextureAblationTest(unittest.TestCase):
    def test_reranker_moves_points_without_inventing_top3_scores(self):
        scores = np.asarray([[0.7, 0.2, 0.1]], dtype=float)
        output = MODULE.rerank_group(
            scores, np.asarray([[1.0]]), FakeModel(),
            ["A", "B", "C"], ("A", "B"), 1.0, np.asarray([True]),
        )
        self.assertEqual(np.argmax(output[0]), 1)
        self.assertEqual(sorted(output[0].tolist()), sorted(scores[0].tolist()))

    def test_declares_all_texture_boundaries(self):
        self.assertIn(("アンビエント", "ドローン"), MODULE.GROUPS)
        self.assertIn(
            ("アンビエント", "ドローン", "ノイズミュージック"),
            MODULE.GROUPS,
        )


if __name__ == "__main__":
    unittest.main()
