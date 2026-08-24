import importlib.util
import json
import sqlite3
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).with_name("genre-track-segment-cache.py")
SPEC = importlib.util.spec_from_file_location("track_segment_cache_tested", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class TrackSegmentCacheTest(unittest.TestCase):
    def test_manifest_rows_use_stable_external_audio_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            audio = root / "track.wav"
            audio.write_bytes(b"audio")
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps({"items": [{
                "source": "Independent", "genre": "トランス",
                "filePath": str(audio), "audioSha256": "abc123",
                "trainingEligible": True,
            }]}))
            args = type("Args", (), {
                "manifest": [manifest], "ffprobe": Path("ffprobe"),
            })()
            audit = type("Audit", (), {
                "audio_duration": staticmethod(lambda path, ffprobe: (120.0, "mock", None)),
                "classify_duration": staticmethod(lambda duration: "full-4x30"),
            })()
            rows = MODULE.resolve_manifest_rows(args, audit)
            self.assertEqual(rows[0]["sourceKey"], "overlay:Independent:abc123")
            self.assertEqual(rows[0]["label"], "トランス")

    def test_cache_schema_is_bound_to_new_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            connection = sqlite3.connect(Path(directory) / "cache.sqlite3")
            MODULE.initialize(connection)
            digest = connection.execute(
                "SELECT value FROM metadata WHERE key='featureContractSha256'"
            ).fetchone()[0]
            self.assertEqual(digest, MODULE.feature_contract_digest())
            connection.close()

    def test_selection_round_robins_source_label_cells(self):
        rows = []
        for source in ("A", "B"):
            for index in range(3):
                rows.append({
                    "sourceKey": f"{source}-{index}", "label": "テクノ",
                    "source": source, "fileExists": True, "durationSeconds": 180,
                })
        args = type("Args", (), {
            "genre": [], "source": [], "per_genre_source_limit": 2, "limit": 3,
        })()
        selected = MODULE.balanced_selection(rows, set(), args)
        self.assertEqual([row["source"] for row in selected], ["A", "B", "A"])

    def test_per_cell_limit_counts_previously_cached_rows(self):
        rows = [
            {
                "sourceKey": f"A-{index}", "label": "テクノ", "source": "A",
                "fileExists": True, "durationSeconds": 180,
            }
            for index in range(3)
        ]
        args = type("Args", (), {
            "genre": [], "source": [], "per_genre_source_limit": 1, "limit": 0,
        })()
        self.assertEqual(MODULE.balanced_selection(rows, {"A-0"}, args), [])

    def test_vector_round_trip_checks_length(self):
        values = list(range(8))
        self.assertEqual(MODULE.decode(MODULE.encode(values), 8).tolist(), values)
        with self.assertRaises(ValueError):
            MODULE.decode(MODULE.encode(values), 7)

    def test_cached_segments_round_trip_with_exact_dimensions(self):
        with tempfile.TemporaryDirectory() as directory:
            connection = sqlite3.connect(Path(directory) / "cache.sqlite3")
            MODULE.initialize(connection)
            digest = MODULE.feature_contract_digest()
            connection.execute(
                "INSERT INTO segments VALUES(?,?,?,?,?,?,?,?,?)",
                ("key", 0, "requested", 1.25, 30.0,
                 MODULE.encode([1.0] * 3840), MODULE.encode([2.0] * 547),
                 digest, "now"),
            )
            rows = MODULE.read_cached_segments(connection, "key")
            self.assertEqual(len(rows), 1)
            self.assertEqual(len(rows[0]["vectors"]["effnet_tail"]), 3840)
            self.assertEqual(len(rows[0]["vectors"]["librosa"]), 547)
            connection.close()


if __name__ == "__main__":
    unittest.main()
