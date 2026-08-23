#!/usr/bin/env python3

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("genre-internet-archive-explicit-noise-audit.py")
SPEC = importlib.util.spec_from_file_location("explicit_noise_audit", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ExplicitNoiseAuditTest(unittest.TestCase):
    def test_selections_are_distinct_archive_works(self):
        identifiers = [identifier for identifier, _file in MODULE.SELECTIONS]
        self.assertGreaterEqual(len(identifiers), 8)
        self.assertEqual(len(identifiers), len(set(identifiers)))

    def test_only_permitted_license_families_are_mapped(self):
        self.assertEqual(
            MODULE.license_name("https://creativecommons.org/licenses/by/4.0/"),
            "CC-BY",
        )
        self.assertEqual(
            MODULE.license_name("https://creativecommons.org/licenses/by-sa/4.0/"),
            "CC-BY-SA",
        )
        self.assertEqual(
            MODULE.license_name("https://creativecommons.org/licenses/by-nc/4.0/"),
            "",
        )

    def test_subject_matching_is_exact_after_normalization(self):
        self.assertIn("noise", MODULE.normalized_subjects("ambient; Noise; drone"))
        self.assertNotIn("noise", MODULE.normalized_subjects("noise rock"))


if __name__ == "__main__":
    unittest.main()
