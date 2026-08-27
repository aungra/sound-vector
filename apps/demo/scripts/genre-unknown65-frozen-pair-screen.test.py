#!/usr/bin/env python3

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name("genre-unknown65-frozen-pair-screen.py")
FEATURE_SCRIPT = Path(__file__).with_name(
    "genre-unknown65-frozen-representation-screen.py"
)


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


PAIR = load(SCRIPT, "unknown65_pair_test_subject")
FEATURES = load(FEATURE_SCRIPT, "unknown65_feature_test_subject")


class FrozenPairScreenTest(unittest.TestCase):
    def test_rejects_overlay_with_unavailable_baseline_scores(self):
        args = type("Args", (), {
            "include_base_scores": True,
            "overlay_manifest": [Path("overlay.json")],
        })()
        with self.assertRaisesRegex(ValueError, "leakage-safe baseline OOF"):
            PAIR.run(args)

    def test_production_overlay_filters_license_and_evaluation_duplicates(self):
        rows = [
            self.row("ok.mp3", "CC-BY", "production-training"),
            self.row("nc.mp3", "CC-BY-NC", "research-only"),
            self.row("nd.mp3", "CC-BY-ND", "excluded-no-derivatives"),
            self.row("duplicate.mp3", "CC0", "production-training"),
        ]
        cache = {
            f"cc-dataset:{row['filePath']}": {"embedding": [1.0] * 512,
                                             "moments": [1.0] * 1536}
            for row in rows
        }
        payload = {"sourceKeys": np.asarray(["cc-dataset:duplicate.mp3"])}
        with tempfile.TemporaryDirectory() as directory:
            manifest = Path(directory) / "manifest.json"
            manifest.write_text(json.dumps({"items": rows}))
            result = PAIR.load_overlay(
                [manifest], cache, "clap", FEATURES, payload,
            )
        self.assertEqual([item["sourceKey"] for item in result], ["cc-dataset:ok.mp3"])
        self.assertEqual(result[0]["actual"], "ロック")
        self.assertFalse(result[0]["evaluationEligible"])

    def test_yamnet_rejects_wrong_dimensions(self):
        valid = {
            "embeddingMoments": [0.0] * 3072,
            "embeddingDynamics": [0.0] * 3072,
            "tagMoments": [0.0] * 1563,
        }
        self.assertEqual(
            set(FEATURES.feature_views(valid, 0, "yamnet")),
            {"embedding-mean", "dynamics-mean", "tag-mean", "embedding-tag"},
        )
        valid["tagMoments"] = valid["tagMoments"][:-1]
        self.assertEqual(FEATURES.feature_views(valid, 0, "yamnet"), {})

    @staticmethod
    def row(path, license_name, usage):
        return {
            "datasetName": "FMA direct genre metadata source",
            "sourceFamily": "FMA",
            "filePath": path,
            "detailTarget": "rock",
            "singleTargetEligible": True,
            "license": license_name,
            "trainingUsage": usage,
        }


if __name__ == "__main__":
    unittest.main()
