import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name(
    "genre-unknown80-build-independent-texture-manifest.py"
)
SPEC = importlib.util.spec_from_file_location("texture_manifest", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class TextureManifestTest(unittest.TestCase):
    def test_normalize_row_accepts_target_with_redistributable_license(self):
        with tempfile.TemporaryDirectory() as directory:
            audio = Path(directory) / "track.flac"
            audio.write_bytes(b"audio")
            previous_targets = MODULE.SHARED.TARGET_GENRES
            try:
                MODULE.SHARED.TARGET_GENRES = MODULE.TARGET_GENRES
                row = MODULE.normalize_row({
                    "source": "FMA",
                    "sourceType": "cc-dataset",
                    "trackId": "ambient-1",
                    "genre": "アンビエント",
                    "license": "CC-BY-SA",
                    "filePath": str(audio),
                }, "source.json")
            finally:
                MODULE.SHARED.TARGET_GENRES = previous_targets
            self.assertEqual(row["genre"], "アンビエント")
            self.assertTrue(row["trainingEligible"])
            self.assertFalse(row["productionEligible"])

    def test_noncommercial_license_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            audio = Path(directory) / "track.mp3"
            audio.write_bytes(b"audio")
            previous_targets = MODULE.SHARED.TARGET_GENRES
            try:
                MODULE.SHARED.TARGET_GENRES = MODULE.TARGET_GENRES
                row = MODULE.normalize_row({
                    "source": "FMA",
                    "trackId": "drone-1",
                    "genre": "ドローン",
                    "license": "CC-BY-NC",
                    "filePath": str(audio),
                }, "source.json")
            finally:
                MODULE.SHARED.TARGET_GENRES = previous_targets
            self.assertIsNone(row)


if __name__ == "__main__":
    unittest.main()
