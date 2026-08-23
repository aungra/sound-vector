#!/usr/bin/env python3

import importlib.util
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name("genre-unknown80-v102-macro-reranker-screen.py")
SPEC = importlib.util.spec_from_file_location("macro_screen", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class MacroRerankerTest(unittest.TestCase):
    def setUp(self):
        self.labels = ["A", "B", "C", "D"]
        self.base = np.asarray([[0.6, 0.3, 0.1, 0.0]], dtype=float)

    def test_reorders_points_without_changing_top3_set_or_values(self):
        learned = np.asarray([[0.1, 0.8, 0.1, 0.0]], dtype=float)
        output, detail = MODULE.rerank_group(
            self.base, learned, self.labels, ("A", "B"), 1.0,
        )
        self.assertEqual(np.argmax(output[0]), 1)
        self.assertEqual(set(np.argsort(-output[0])[:3]), {0, 1, 2})
        np.testing.assert_allclose(
            np.sort(output[0, :3]), np.sort(self.base[0, :3])
        )
        self.assertEqual(detail["applicableRows"], 1)

    def test_requires_two_group_candidates(self):
        learned = np.asarray([[0.1, 0.0, 0.0, 0.9]], dtype=float)
        output, detail = MODULE.rerank_group(
            self.base, learned, self.labels, ("A", "D"), 1.0,
        )
        np.testing.assert_allclose(output, self.base)
        self.assertEqual(detail["applicableRows"], 0)

    def test_respects_candidate_mass_and_confidence(self):
        learned = np.asarray([[0.05, 0.15, 0.8, 0.0]], dtype=float)
        output, detail = MODULE.rerank_group(
            self.base, learned, self.labels, ("A", "B"), 1.0,
            confidence_floor=0.7, candidate_mass_floor=0.5,
        )
        np.testing.assert_allclose(output, self.base)
        self.assertEqual(detail["applicableRows"], 0)


if __name__ == "__main__":
    unittest.main()
