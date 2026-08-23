#!/usr/bin/env python3

import importlib.util
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name("genre-unknown80-v107-maest-candidate-screen.py")
SPEC = importlib.util.spec_from_file_location("maest_candidate_screen", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CandidateScreenTest(unittest.TestCase):
    def test_candidate_rerank_preserves_score_multiset(self):
        base = np.asarray([[0.6, 0.3, 0.09, 0.01]], dtype=np.float64)
        learned = np.asarray([[0.05, 0.1, 0.15, 0.7]], dtype=np.float64)
        output, detail = MODULE.preserve_multiset_candidate_rerank(
            base, learned, 1.0, 0.0, 0.0,
        )
        np.testing.assert_allclose(np.sort(output[0]), np.sort(base[0]))
        self.assertEqual(int(np.argmax(output[0])), 3)
        self.assertEqual(detail["candidateSetChanges"], 1)

    def test_topk_breakdown_separates_rerankable_and_missing(self):
        actual = np.asarray(["a", "b", "c"], dtype=object)
        labels = ["a", "b", "c", "d"]
        scores = np.asarray([
            [0.8, 0.1, 0.05, 0.05],
            [0.5, 0.3, 0.1, 0.1],
            [0.5, 0.3, 0.01, 0.19],
        ])
        result = MODULE.topk_breakdown(actual, scores, labels)
        self.assertEqual(result["overall"]["top1"], 1)
        self.assertEqual(result["overall"]["rerankableTop3Errors"], 1)
        self.assertEqual(result["overall"]["outsideTop3"], 1)


if __name__ == "__main__":
    unittest.main()
