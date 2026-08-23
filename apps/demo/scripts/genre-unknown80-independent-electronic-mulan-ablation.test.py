import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name(
    "genre-unknown80-independent-electronic-mulan-ablation.py"
)
SPEC = importlib.util.spec_from_file_location("electronic_mulan", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ElectronicMuLanAblationTest(unittest.TestCase):
    def test_load_overlay_requires_three_complete_segments(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_url = str(root / "track.ogg")
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps({"items": [{
                "source": "Wikimedia Commons",
                "sourceType": "cc-dataset",
                "sourceUrl": source_url,
                "genre": "ディープ・ハウス",
                "trainingEligible": True,
                "productionEligible": False,
            }]}))
            cache = root / "segments.sqlite3"
            connection = sqlite3.connect(cache)
            connection.execute(
                "CREATE TABLE segments (source_key TEXT, segment_index INTEGER, vector BLOB)"
            )
            key = f"cc-dataset:{source_url}"
            for index in range(3):
                vector = np.full(512, index + 1, dtype="<f4")
                connection.execute(
                    "INSERT INTO segments VALUES (?, ?, ?)",
                    (key, index, vector.tobytes()),
                )
            connection.commit()
            connection.close()
            rows, vectors = MODULE.load_overlay(manifest, cache)
            self.assertEqual(len(rows), 1)
            self.assertEqual(vectors.shape, (1, 1536))
            self.assertEqual(float(vectors[0, 512]), 2.0)

    def test_declares_house_deep_house_and_three_way_groups(self):
        self.assertIn(("ハウス", "ディープ・ハウス"), MODULE.GROUPS)
        self.assertIn(
            ("テクノ", "ハウス", "ディープ・ハウス"), MODULE.GROUPS
        )


if __name__ == "__main__":
    unittest.main()
