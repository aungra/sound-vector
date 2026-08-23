import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).with_name("genre_track_feature_contract.py")
SPEC = importlib.util.spec_from_file_location("genre_track_feature_contract_tested", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class TrackFeatureContractTest(unittest.TestCase):
    def test_long_track_uses_four_full_30_second_ranges(self):
        ranges = MODULE.plan_track_sample_ranges(300, 60)
        self.assertEqual(len(ranges), 4)
        self.assertTrue(all(item["durationSeconds"] == 30 for item in ranges))
        self.assertEqual(ranges[0]["role"], "requested")
        self.assertEqual(ranges[0]["startSeconds"], 60)
        self.assertEqual(len({item["startSeconds"] for item in ranges}), 4)

    def test_short_track_is_split_without_fabricating_audio(self):
        ranges = MODULE.plan_track_sample_ranges(30, 20)
        self.assertEqual(len(ranges), 4)
        self.assertTrue(all(item["durationSeconds"] == 7.5 for item in ranges))
        self.assertAlmostEqual(sum(item["durationSeconds"] for item in ranges), 30)
        self.assertEqual(ranges[0]["role"], "requested")

    def test_contract_digest_is_deterministic_and_distinct_from_incumbent(self):
        digest = MODULE.feature_contract_digest()
        self.assertEqual(len(digest), 64)
        self.assertEqual(digest, MODULE.feature_contract_digest(MODULE.feature_contract()))
        self.assertEqual(MODULE.feature_contract()["segmentCount"], 4)
        self.assertEqual(MODULE.feature_contract()["segmentDurationSeconds"], 30.0)


if __name__ == "__main__":
    unittest.main()
