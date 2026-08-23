#!/usr/bin/env python3

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name(
    "genre-unknown80-independent-stack-v103-export.py"
)
SPEC = importlib.util.spec_from_file_location("stack_v103_export", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class StackV103ExportTest(unittest.TestCase):
    def test_three_runtime_macro_members_are_frozen(self):
        self.assertEqual(len(MODULE.GROUP_CONFIGS), 3)
        self.assertEqual(
            {row["name"] for row in MODULE.GROUP_CONFIGS},
            {"roots-electric", "bass-groove", "acoustic-structural"},
        )
        self.assertTrue(all(row["strength"] == 0.25 for row in MODULE.GROUP_CONFIGS))

    def test_output_is_external(self):
        self.assertTrue(str(MODULE.DEFAULT_OUTPUT).startswith("/Volumes/"))


if __name__ == "__main__":
    unittest.main()
