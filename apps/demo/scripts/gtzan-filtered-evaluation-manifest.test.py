import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("gtzan-filtered-evaluation-manifest.py")
SPEC = importlib.util.spec_from_file_location("gtzan_manifest", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class GtzanManifestTest(unittest.TestCase):
    def test_reads_literal_filtered_assignment(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "split.py"
            path.write_text("filtered_test = ['blues.00001', 'rock.00002']\n")
            self.assertEqual(MODULE.load_assignment(path), [
                "blues.00001", "rock.00002",
            ])

    def test_manifest_is_evaluation_only_and_excludes_unmapped_labels(self):
        rows, rejected = MODULE.build_manifest([
            "blues.00001", "country.00001", "pop.00001", "rock.00002",
        ], "/Volumes/test", exists=lambda _path: True)
        self.assertEqual([row["genre"] for row in rows], ["ブルース", "ロック"])
        self.assertEqual(rejected, {"outside-32-genre-contract": 2})
        self.assertTrue(all(row["evaluationEligible"] for row in rows))
        self.assertTrue(all(not row["trainingEligible"] for row in rows))
        self.assertTrue(all(not row["productionEligible"] for row in rows))
        self.assertTrue(all("UNSPECIFIED" in row["license"] for row in rows))

    def test_missing_audio_is_rejected(self):
        rows, rejected = MODULE.build_manifest(
            ["jazz.00001"], "/missing", exists=lambda _path: False,
        )
        self.assertEqual(rows, [])
        self.assertEqual(rejected, {"missing-audio": 1})

    def test_dataset_artifacts_are_revision_pinned(self):
        self.assertEqual(len(MODULE.DATASET_REVISION), 40)
        self.assertEqual(len(MODULE.PINNED_ARCHIVE_SHA256), 64)
        self.assertEqual(len(MODULE.PINNED_SPLIT_SHA256), 64)


if __name__ == "__main__":
    unittest.main()
