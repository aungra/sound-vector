#!/usr/bin/env python3

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("genre-unknown80-independent-stack-v106-export.py")
SPEC = importlib.util.spec_from_file_location("stack_v106_export", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class StackV106ExportTest(unittest.TestCase):
    def test_candidate_is_external_and_keeps_v105_immutable(self):
        self.assertTrue(str(MODULE.DEFAULT_OUTPUT).startswith("/Volumes/"))
        self.assertNotEqual(MODULE.DEFAULT_OUTPUT, MODULE.V105_MODEL)

    def test_source_gate_is_required(self):
        self.assertEqual(
            MODULE.SOURCE_REPORT.name,
            "unknown80-independent-stack-v106-source-heldout.json",
        )


if __name__ == "__main__":
    unittest.main()
