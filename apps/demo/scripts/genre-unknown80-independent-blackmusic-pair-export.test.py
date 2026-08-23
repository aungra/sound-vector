#!/usr/bin/env python3
"""Tests for the independent black-music pair exporter."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name(
    "genre-unknown80-independent-blackmusic-pair-export.py"
)


def load_script():
    spec = importlib.util.spec_from_file_location("blackmusic_pair_export", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class IndependentBlackMusicPairExportTest(unittest.TestCase):
    def setUp(self):
        self.module = load_script()

    def test_locked_conservative_three_pair_stack(self):
        self.assertEqual(
            [member["pair"] for member in self.module.MEMBER_CONFIGS],
            [
                ("ファンク", "ロック"),
                ("ブルース", "フォーク"),
                ("レゲエ", "ダブ"),
            ],
        )
        self.assertEqual(
            [member["strength"] for member in self.module.MEMBER_CONFIGS],
            [0.5, 0.25, 0.25],
        )

    def test_output_is_external(self):
        self.assertTrue(str(self.module.DEFAULT_OUTPUT).startswith("/Volumes/"))


if __name__ == "__main__":
    unittest.main()
