#!/usr/bin/env python3

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("genre-unknown80-explicit-label-subset-audit.py")
SPEC = importlib.util.spec_from_file_location("explicit_subset_audit", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ExplicitSubsetAuditTest(unittest.TestCase):
    def test_only_known_weak_origin_is_excluded(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text(json.dumps({"items": [
                {"sourceType": "cc-dataset", "sourceUrl": "/weak.mp3", "candidateOrigin": "maest-weak-source-plan.json"},
                {"sourceType": "cc-dataset", "sourceUrl": "/explicit.mp3", "candidateOrigin": "explicit-source.json"},
            ]}))
            keys = MODULE.known_weak_keys(path)
            self.assertEqual(set(keys), {"cc-dataset:/weak.mp3"})


if __name__ == "__main__":
    unittest.main()
