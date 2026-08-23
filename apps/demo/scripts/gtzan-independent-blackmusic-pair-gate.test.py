#!/usr/bin/env python3
"""Tests for the GTZAN independent black-music gate."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("gtzan-independent-blackmusic-pair-gate.py")


def load_script():
    spec = importlib.util.spec_from_file_location("gtzan_blackmusic_gate", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class GtzanIndependentBlackMusicPairGateTest(unittest.TestCase):
    def setUp(self):
        self.module = load_script()

    def test_combinations_never_include_gtzan_training(self):
        self.assertIn("incumbent", self.module.COMBINATIONS)
        self.assertNotIn("GTZAN", repr(self.module.CONFIGS))

    def test_score_matrix_uses_backbone_predictions(self):
        rows = [{"trackId": "x"}]
        predictions = {"x": {"baselineTop": [
            {"label": "A", "score": 0.7},
            {"label": "B", "score": 0.2},
        ]}}
        matrix = self.module.score_matrix(rows, predictions, ["A", "B", "C"])
        self.assertEqual(matrix[0, 0], 0.7)
        self.assertEqual(matrix[0, 1], 0.2)
        self.assertLess(matrix[0, 2], 1e-6)


if __name__ == "__main__":
    unittest.main()
