#!/usr/bin/env python3
"""Tests for the independent black-music pair ablation."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name(
    "genre-unknown80-independent-blackmusic-pair-ablation.py"
)


def load_script():
    spec = importlib.util.spec_from_file_location("blackmusic_pair_ablation", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class IndependentBlackMusicPairAblationTest(unittest.TestCase):
    def setUp(self):
        self.module = load_script()

    def test_source_label_weights_downweights_overlay(self):
        actual = np.asarray(["A", "A", "B", "B"], dtype=object)
        sources = np.asarray(["x", "x", "y", "z"], dtype=object)
        weights = self.module.source_label_weights(
            actual, sources, np.asarray([False, False, False, True])
        )
        self.assertLess(weights[3], weights[2])

    def test_rerank_only_changes_applicable_row(self):
        class Model:
            classes_ = np.asarray(["A", "B"])

            def predict_proba(self, features):
                return np.tile([0.1, 0.9], (len(features), 1))

        scores = np.asarray([[0.6, 0.3, 0.1], [0.6, 0.3, 0.1]])
        output = self.module.rerank_pair(
            scores,
            np.ones((2, 3)),
            Model(),
            ["A", "B", "C"],
            ("A", "B"),
            1.0,
            np.asarray([True, False]),
        )
        self.assertEqual(np.argmax(output[0]), 1)
        np.testing.assert_allclose(output[1], scores[1])

    def test_feature_view_contract(self):
        matrix = np.ones((2, self.module.LIBROSA_DIMENSIONS))
        self.assertEqual(
            self.module.feature_view(matrix, "rhythm").shape[1],
            len(self.module.RHYTHM_INDEXES),
        )
        self.assertEqual(
            self.module.feature_view(matrix, "full").shape[1],
            self.module.LIBROSA_DIMENSIONS,
        )


if __name__ == "__main__":
    unittest.main()
