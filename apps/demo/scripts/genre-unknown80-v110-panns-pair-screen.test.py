#!/usr/bin/env python3

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name("genre-unknown80-v110-panns-pair-screen.py")
SPEC = importlib.util.spec_from_file_location("v110_deep_pair_test_target", SCRIPT)
TARGET = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = TARGET
SPEC.loader.exec_module(TARGET)


class DeepPairScreenTest(unittest.TestCase):
    def test_streams_top_level_json_object(self):
        payload = {"first": {"value": 1}, "second": [2, 3]}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cache.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            self.assertEqual(dict(TARGET.iter_json_object(path, chunk_size=7)), payload)

    def test_extracts_panns_views(self):
        views = TARGET.representation_views("panns", {
            "embeddingMoments": list(range(6144)),
            "tagMoments": list(range(1581)),
        })
        self.assertEqual(views["embedding-mean"].shape, (2048,))
        self.assertEqual(views["tag-mean"].shape, (527,))
        self.assertEqual(views["joint-mean"].shape, (2575,))
        np.testing.assert_array_equal(views["embedding-mean"][:3], [0, 1, 2])

    def test_extracts_clap_views(self):
        views = TARGET.representation_views("clap", {
            "embedding": list(range(512)),
            "moments": list(range(1536)),
        })
        self.assertEqual(views["clap-embedding"].shape, (512,))
        self.assertEqual(views["clap-moment-mean"].shape, (512,))
        self.assertEqual(views["clap-joint-mean"].shape, (1024,))

    def test_rejects_invalid_records(self):
        self.assertIsNone(TARGET.representation_views("panns", {}))
        self.assertIsNone(TARGET.representation_views("clap", {"embedding": []}))


if __name__ == "__main__":
    unittest.main()
