#!/usr/bin/env python3
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("genre-internet-archive-explicit-dubstep-audit.py")
SPEC = importlib.util.spec_from_file_location("explicit_dubstep_audit", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

class ExplicitDubstepAuditTest(unittest.TestCase):
    def test_selections_are_distinct_archive_works(self):
        identifiers = [identifier for identifier, _file in MODULE.SELECTIONS]
        self.assertGreaterEqual(len(identifiers), 8)
        self.assertEqual(len(identifiers), len(set(identifiers)))

    def test_audio_stays_outside_repository(self):
        self.assertTrue(str(MODULE.DEFAULT_AUDIO_DIR).startswith("/Volumes/"))

if __name__ == "__main__":
    unittest.main()
