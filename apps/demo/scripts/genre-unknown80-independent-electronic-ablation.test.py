import importlib.util
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name(
    "genre-unknown80-independent-electronic-ablation.py"
)
SPEC = importlib.util.spec_from_file_location("electronic_ablation", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FakeModel:
    classes_ = np.asarray(["A", "B"], dtype=object)

    def predict_proba(self, values):
        return np.repeat([[0.1, 0.9]], len(values), axis=0)


class ElectronicAblationTest(unittest.TestCase):
    def test_group_reranker_only_reorders_existing_top3_values(self):
        scores = np.asarray([[0.6, 0.3, 0.1]], dtype=float)
        output = MODULE.rerank_group(
            scores, np.asarray([[1.0]]), FakeModel(),
            ["A", "B", "C"], ("A", "B"), 1.0, np.asarray([True]),
        )
        self.assertEqual(np.argmax(output[0]), 1)
        self.assertEqual(sorted(output[0].tolist()), sorted(scores[0].tolist()))

    def test_group_reranker_respects_applicability(self):
        scores = np.asarray([[0.6, 0.3, 0.1]], dtype=float)
        output = MODULE.rerank_group(
            scores, np.asarray([[1.0]]), FakeModel(),
            ["A", "B", "C"], ("A", "B"), 1.0, np.asarray([False]),
        )
        np.testing.assert_allclose(output, scores)


if __name__ == "__main__":
    unittest.main()
