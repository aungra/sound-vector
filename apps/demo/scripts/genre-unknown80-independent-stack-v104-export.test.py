#!/usr/bin/env python3

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("genre-unknown80-independent-stack-v104-export.py")
SPEC = importlib.util.spec_from_file_location("stack_v104_export", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class StackV104ExportTest(unittest.TestCase):
    def test_post_group_members_are_frozen(self):
        self.assertEqual(len(MODULE.POST_GROUP_CONFIGS), 3)
        self.assertEqual(
            {tuple(row["labels"]) for row in MODULE.POST_GROUP_CONFIGS},
            {
                ("ディープ・ハウス", "ハウス"),
                ("ディープ・ハウス", "テクノ"),
                ("メタル", "ロック"),
            },
        )

    def test_only_rights_safe_deep_house_manifests_are_defaults(self):
        self.assertEqual(len(MODULE.DEFAULT_DEEP_MANIFESTS), 3)
        self.assertNotIn("fma", " ".join(map(str, MODULE.DEFAULT_DEEP_MANIFESTS)).lower())

    def test_output_is_external(self):
        self.assertTrue(str(MODULE.DEFAULT_OUTPUT).startswith("/Volumes/"))


if __name__ == "__main__":
    unittest.main()
