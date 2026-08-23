import importlib.util
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name(
    "genre-unknown80-global-top3-reranker-screen.py"
)
SPEC = importlib.util.spec_from_file_location("global_top3", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class GlobalTop3RerankerTest(unittest.TestCase):
    def test_reranker_preserves_candidate_and_score_multisets(self):
        base = np.asarray([[0.6, 0.3, 0.1, 0.0]], dtype=float)
        learned = np.asarray([[0.1, 0.8, 0.1, 0.0]], dtype=float)
        output, detail = MODULE.rerank_top3(base, learned, 1.0)
        self.assertEqual(np.argmax(output[0]), 1)
        self.assertEqual(sorted(output[0].tolist()), sorted(base[0].tolist()))
        self.assertEqual(set(np.argsort(-output[0])[:3]), set(np.argsort(-base[0])[:3]))
        self.assertEqual(detail["applicableRows"], 1)

    def test_confidence_and_mass_gates_keep_base_order(self):
        base = np.asarray([[0.6, 0.3, 0.1]], dtype=float)
        learned = np.asarray([[0.1, 0.2, 0.1]], dtype=float)
        output, _detail = MODULE.rerank_top3(
            base, learned, 1.0, confidence_floor=0.9, top3_mass_floor=0.9
        )
        np.testing.assert_allclose(output, base)

    def test_runtime_views_use_only_librosa_and_base_scores(self):
        librosa = np.ones((2, 547), dtype=np.float32)
        positions = np.ones((2, 1536), dtype=np.float32)
        scores = np.ones((2, 28), dtype=np.float32)
        rhythm = np.arange(157)
        self.assertEqual(
            MODULE.view_matrix(
                "librosa-base", positions, librosa, scores, rhythm
            ).shape,
            (2, 575),
        )
        self.assertEqual(
            MODULE.view_matrix(
                "rhythm-base", positions, librosa, scores, rhythm
            ).shape,
            (2, 185),
        )
        self.assertEqual(
            MODULE.view_matrix(
                "mulan-librosa-base", positions, librosa, scores, rhythm
            ).shape,
            (2, 2111),
        )


if __name__ == "__main__":
    unittest.main()
