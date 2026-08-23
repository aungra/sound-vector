import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name(
    "genre-unknown80-build-independent-electronic-manifest.py"
)
SPEC = importlib.util.spec_from_file_location("electronic_manifest", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ElectronicManifestTest(unittest.TestCase):
    def test_normalize_row_requires_supported_full_track(self):
        with tempfile.TemporaryDirectory() as directory:
            audio = Path(directory) / "track.mp3"
            audio.write_bytes(b"audio")
            row = MODULE.normalize_row({
                "source": "FMA",
                "sourceType": "cc-dataset",
                "trackId": "1",
                "genre": "テクノ",
                "license": "CC-BY",
                "filePath": str(audio),
            }, "source.json")
            self.assertTrue(row["trainingEligible"])
            self.assertFalse(row["evaluationEligible"])
            self.assertFalse(row["productionEligible"])
            self.assertEqual(row["source"], "FMA")

    def test_normalize_row_rejects_non_target_and_noncommercial(self):
        with tempfile.TemporaryDirectory() as directory:
            audio = Path(directory) / "track.mp3"
            audio.write_bytes(b"audio")
            base = {"source": "FMA", "trackId": "1", "filePath": str(audio)}
            self.assertIsNone(MODULE.normalize_row({
                **base, "genre": "ジャズ", "license": "CC-BY",
            }, "source.json"))
            self.assertIsNone(MODULE.normalize_row({
                **base, "genre": "テクノ", "license": "CC-BY-NC",
            }, "source.json"))

    def test_fma_provider_wins_over_archive_distribution_url(self):
        row = {
            "source": "FMA",
            "referenceUrl": "https://archive.org/details/fma_large",
            "filePath": "/cache/external-data/fma/fma_large/track.mp3",
        }
        self.assertEqual(MODULE.normalized_source(row), "FMA")


if __name__ == "__main__":
    unittest.main()
