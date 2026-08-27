#!/usr/bin/env python3

import importlib.util
import unittest
from pathlib import Path

PATH = Path(__file__).with_name("genre_unknown65_runtime.py")
SPEC = importlib.util.spec_from_file_location("unknown65_runtime_tested", PATH)
RUNTIME = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNTIME)


class RuntimeTest(unittest.TestCase):
    def test_contract_digest_is_stable(self):
        self.assertEqual(
            RUNTIME.feature_contract_digest(),
            RUNTIME.feature_contract_digest(RUNTIME.feature_contract()),
        )

    def test_feature_shapes_reject_incomplete_records(self):
        for representation in ("musicfm", "panns", "yamnet", "ast"):
            with self.assertRaises(ValueError):
                RUNTIME.feature_views({}, representation)

    def test_shared_musicfm_does_not_replace_protected_extracts(self):
        extracted = {"panns": {"protected": True}}
        merged = RUNTIME.merge_records(
            extracted,
            {"musicfm": {"embedding": "shared"}, "panns": {"protected": False}},
        )
        self.assertEqual(merged["panns"], {"protected": True})
        self.assertEqual(merged["musicfm"], {"embedding": "shared"})


if __name__ == "__main__":
    unittest.main()
