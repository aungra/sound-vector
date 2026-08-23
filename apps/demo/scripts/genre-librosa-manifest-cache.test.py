#!/usr/bin/env python3
"""Unit tests for the manifest librosa cache builder."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("genre-librosa-manifest-cache.py")


def load_script():
    spec = importlib.util.spec_from_file_location("librosa_manifest_cache", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class LibrosaManifestCacheTest(unittest.TestCase):
    def setUp(self):
        self.module = load_script()

    def test_source_key_uses_runtime_contract(self):
        row = {"sourceType": "cc-dataset", "sourceUrl": "/audio/test.mp3"}
        self.assertEqual(
            self.module.source_key(row), "cc-dataset:/audio/test.mp3"
        )

    def test_build_cache_requires_547_dimensions(self):
        with tempfile.TemporaryDirectory() as directory:
            audio = Path(directory) / "test.mp3"
            audio.write_bytes(b"audio")
            rows = [{
                "sourceType": "cc-dataset",
                "sourceUrl": str(audio),
                "filePath": str(audio),
            }]
            cache, errors = self.module.build_cache(rows, lambda *_: [0.0] * 10)
            self.assertEqual(cache, {})
            self.assertIn("expected 547", errors[0]["error"])

    def test_build_cache_serializes_floats(self):
        with tempfile.TemporaryDirectory() as directory:
            audio = Path(directory) / "test.mp3"
            audio.write_bytes(b"audio")
            rows = [{
                "sourceType": "cc-dataset",
                "sourceUrl": str(audio),
                "filePath": str(audio),
            }]
            cache, errors = self.module.build_cache(
                rows, lambda *_: range(self.module.EXPECTED_DIMENSIONS)
            )
            self.assertFalse(errors)
            self.assertEqual(len(next(iter(cache.values()))), 547)
            self.assertIsInstance(next(iter(cache.values()))[1], float)


if __name__ == "__main__":
    unittest.main()
