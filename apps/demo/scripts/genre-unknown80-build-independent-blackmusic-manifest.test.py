#!/usr/bin/env python3
"""Tests for the independent black-music manifest builder."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name(
    "genre-unknown80-build-independent-blackmusic-manifest.py"
)


def load_script():
    spec = importlib.util.spec_from_file_location("blackmusic_manifest_builder", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class IndependentBlackMusicManifestBuilderTest(unittest.TestCase):
    def setUp(self):
        self.module = load_script()

    def test_normalized_source(self):
        self.assertEqual(
            self.module.normalized_source({"datasetName": "FMA Medium"}), "FMA"
        )
        self.assertEqual(
            self.module.normalized_source({"referenceUrl": "https://archive.org/x"}),
            "Internet Archive",
        )

    def test_normalize_row_sets_training_only_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            audio = Path(directory) / "track.mp3"
            audio.write_bytes(b"audio")
            row = {
                "trackId": "1", "genre": "ブルース", "license": "CC-BY",
                "filePath": str(audio), "source": "ccMixter",
            }
            output = self.module.normalize_row(row, "source.json")
            self.assertTrue(output["trainingEligible"])
            self.assertFalse(output["evaluationEligible"])
            self.assertFalse(output["productionEligible"])
            self.assertEqual(output["sourceLabelAction"], "exact")


if __name__ == "__main__":
    unittest.main()
