#!/usr/bin/env python3

import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("genre-mtg-jamendo-explicit-deep-house-audit.py")
SPEC = importlib.util.spec_from_file_location("deep_house_audit", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class DeepHouseAuditTest(unittest.TestCase):
    def test_parses_only_attribution_licenses(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "audio_licenses.txt"
            path.write_text(
                "01/101.mp3\nA\nAvailable under a Creative Commons Attribution license: http://creativecommons.org/licenses/by/3.0/\n\n"
                "02/102.mp3\nB\nAvailable under a Creative Commons Attribution-NonCommercial license: http://creativecommons.org/licenses/by-nc/3.0/\n"
            )
            rows = MODULE.parse_licenses(path)
            self.assertEqual(rows["101"]["licenseCode"], "by")
            self.assertEqual(rows["102"]["licenseCode"], "by-nc")

    def test_normalizes_crlf_tags(self):
        self.assertEqual(
            MODULE.normalize_tags(["genre---deephouse", "genre---house\r"]),
            {"deephouse", "house"},
        )

    def test_conflicting_tags_are_explicit(self):
        self.assertIn("techno", MODULE.CONFLICTING_FINE_TAGS)
        self.assertNotIn("house", MODULE.CONFLICTING_FINE_TAGS)


if __name__ == "__main__":
    unittest.main()
