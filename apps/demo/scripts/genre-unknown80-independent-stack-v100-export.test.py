import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name(
    "genre-unknown80-independent-stack-v100-export.py"
)
SPEC = importlib.util.spec_from_file_location("stack_v100_export", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class StackV100ExportTest(unittest.TestCase):
    def test_merge_inputs_deduplicates_source_keys(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            row = {
                "sourceType": "cc-dataset", "sourceUrl": "/a.wav",
                "genre": "テクノ",
            }
            first = root / "first.json"
            second = root / "second.json"
            first.write_text(json.dumps({"items": [row]}))
            second.write_text(json.dumps({"items": [row]}))
            first_cache = root / "first-cache.json"
            second_cache = root / "second-cache.json"
            first_cache.write_text(json.dumps({"cc-dataset:/a.wav": [1]}))
            second_cache.write_text(json.dumps({"cc-dataset:/b.wav": [2]}))
            manifest, cache = MODULE.merge_inputs(
                (first, second), (first_cache, second_cache), root
            )
            self.assertEqual(len(json.loads(manifest.read_text())["items"]), 1)
            self.assertEqual(len(json.loads(cache.read_text())), 2)

    def test_output_is_external(self):
        self.assertTrue(str(MODULE.DEFAULT_OUTPUT).startswith("/Volumes/"))


if __name__ == "__main__":
    unittest.main()
