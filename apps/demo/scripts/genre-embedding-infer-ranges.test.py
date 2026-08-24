import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np


MODULE_PATH = Path(__file__).with_name("genre-embedding-infer.py")
SPEC = importlib.util.spec_from_file_location("genre_embedding_ranges_tested", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FakeExtractors:
    def __init__(self):
        self.calls = []

    def discogs(self, audio_path, offset, duration):
        self.calls.append((str(audio_path), offset, duration))
        return np.arange(5040, dtype=np.float32) + duration

    def mtg(self, audio_path, offset, duration):
        return np.zeros(261, dtype=np.float32)


class EmbeddingRangeExtractionTest(unittest.TestCase):
    def test_track_pair_requires_promoted_manifest_and_matching_hash(self):
        original_manifest = MODULE.UNKNOWN80_TRACK_PAIR_MANIFEST_PATH
        original_model = MODULE.UNKNOWN80_TRACK_PAIR_MODEL_PATH
        try:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                model = root / "model.pkl"
                model.write_bytes(b"candidate")
                manifest = root / "manifest.json"
                MODULE.UNKNOWN80_TRACK_PAIR_MODEL_PATH = model
                MODULE.UNKNOWN80_TRACK_PAIR_MANIFEST_PATH = manifest
                manifest.write_text(json.dumps({"promotionState": "rejected"}))
                self.assertFalse(MODULE.track_pair_promotion_status()["promoted"])
                manifest.write_text(json.dumps({
                    "promotionState": "promoted",
                    "modelSha256": hashlib.sha256(b"candidate").hexdigest(),
                }))
                self.assertTrue(MODULE.track_pair_promotion_status()["promoted"])
                model.write_bytes(b"changed")
                status = MODULE.track_pair_promotion_status()
                self.assertFalse(status["promoted"])
                self.assertEqual(status["reason"], "promoted-model-sha256-mismatch")
        finally:
            MODULE.UNKNOWN80_TRACK_PAIR_MANIFEST_PATH = original_manifest
            MODULE.UNKNOWN80_TRACK_PAIR_MODEL_PATH = original_model

    def test_exact_range_duration_reaches_both_extractors(self):
        original_sources = MODULE.INFER_SOURCES
        original_librosa = MODULE.extract_librosa
        calls = []
        MODULE.INFER_SOURCES = ("discogs", "librosa")
        MODULE.extract_librosa = lambda path, offset, duration: (
            calls.append((str(path), offset, duration)) or np.ones(547) * duration
        )
        try:
            extractors = FakeExtractors()
            ranges = [
                {"startSeconds": index * 7.5, "durationSeconds": 7.5}
                for index in range(4)
            ]
            output = MODULE.vectors_from_audio_ranges(
                Path("short.mp3"), ranges, extractors=extractors,
            )
        finally:
            MODULE.INFER_SOURCES = original_sources
            MODULE.extract_librosa = original_librosa
        self.assertEqual(len(output), 4)
        self.assertEqual([call[2] for call in extractors.calls], [7.5] * 4)
        self.assertEqual([call[2] for call in calls], [7.5] * 4)
        self.assertEqual(output[0][2]["effnet_tail"].shape, (3840,))
        self.assertEqual(output[0][2]["librosa"].shape, (547,))

    def test_release_audio_keeps_models_and_drops_track_buffers(self):
        extractors = MODULE.EssentiaExtractors(())
        extractors.audio_cache["track.wav"] = np.ones(4)
        extractors.embedding_cache[("track.wav", 0.0, 30.0)] = np.ones((1, 2))
        extractors.embedding_cache[("other.wav", 0.0, 30.0)] = np.ones((1, 2))
        model = object()
        extractors.embedding_model = model
        extractors.release_audio("track.wav")
        self.assertNotIn("track.wav", extractors.audio_cache)
        self.assertNotIn(("track.wav", 0.0, 30.0), extractors.embedding_cache)
        self.assertIn(("other.wav", 0.0, 30.0), extractors.embedding_cache)
        self.assertIs(extractors.embedding_model, model)


if __name__ == "__main__":
    unittest.main()
