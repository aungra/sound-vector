import importlib.util
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name("genre-unknown80-top3-pairwise-screen.py")
SPEC = importlib.util.spec_from_file_location("unknown80_top3_pairwise", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FixedModel:
    classes_ = np.asarray(["a", "b"])

    def predict_proba(self, features):
        return np.tile(np.asarray([[0.05, 0.95]]), (len(features), 1))


class Top3PairwiseTest(unittest.TestCase):
    def test_selected_three_pair_recipe_is_available(self):
        names = {config["name"] for config in MODULE.COMBINATIONS}
        self.assertIn(
            "top3-extra-trees-pair3w0.75-pair9w0.25-pair4w0.25", names,
        )

    def test_reorders_only_existing_top3_and_preserves_values(self):
        base = np.asarray([[0.5, 0.3, 0.15, 0.05]])
        output = MODULE.rerank_top3(
            base, np.ones((1, 2)), {("a", "b"): FixedModel()},
            ["a", "b", "c", "d"], 1.0,
        )
        self.assertEqual(int(np.argmax(output[0])), 1)
        self.assertEqual(set(np.argsort(-output[0])[:3]), {0, 1, 2})
        np.testing.assert_allclose(np.sort(output[0]), np.sort(base[0]))
        self.assertAlmostEqual(float(output.sum()), 1.0)

    def test_pair_absent_from_top3_does_not_change_scores(self):
        base = np.asarray([[0.5, 0.3, 0.15, 0.05]])
        output = MODULE.rerank_top3(
            base, np.ones((1, 2)), {("a", "d"): FixedModel()},
            ["a", "b", "c", "d"], 1.0,
        )
        np.testing.assert_allclose(output, base)

    def test_confidence_floor_preserves_low_confidence_pair(self):
        class LowConfidenceModel(FixedModel):
            def predict_proba(self, features):
                return np.tile(np.asarray([[0.4, 0.6]]), (len(features), 1))

        base = np.asarray([[0.5, 0.3, 0.15, 0.05]])
        output = MODULE.rerank_top3(
            base, np.ones((1, 2)), {("a", "b"): LowConfidenceModel()},
            ["a", "b", "c", "d"], 1.0, min_confidence=0.7,
        )
        np.testing.assert_allclose(output, base)

    def test_pair_training_requires_two_sources_per_label(self):
        original_pairs = MODULE.PAIRS
        try:
            MODULE.PAIRS = (("a", "b"),)
            actual = np.asarray(["a"] * 8 + ["b"] * 8)
            sources = np.asarray(["source-a"] * 8 + ["source-b"] * 8)
            models, diagnostics = MODULE.fit_pair_models(
                np.ones((16, 4)), actual, sources, np.arange(16),
                ["a", "b"], "extra-trees", 11,
            )
        finally:
            MODULE.PAIRS = original_pairs
        self.assertEqual(models, {})
        self.assertEqual(diagnostics[0]["status"], "insufficient-independent-sources")


if __name__ == "__main__":
    unittest.main()
