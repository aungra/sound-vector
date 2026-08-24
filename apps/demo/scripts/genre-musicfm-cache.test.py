import importlib.util
from pathlib import Path
import sys
import unittest

import numpy as np


MODULE_PATH = Path(__file__).with_name("genre-musicfm-cache.py")
SPEC = importlib.util.spec_from_file_location("musicfm_cache_tested", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class MusicFmCacheTest(unittest.TestCase):
    def test_summary_contract_is_mean_std_max(self):
        frames = np.asarray([[1.0] * 1024, [3.0] * 1024], dtype=np.float32)
        record = MODULE.summarize_embedding(frames)
        moments = np.asarray(record["moments"]).reshape(3, 1024)
        self.assertTrue((np.asarray(record["embedding"]) == 2.0).all())
        self.assertTrue((moments[0] == 2.0).all())
        self.assertTrue((moments[1] == 1.0).all())
        self.assertTrue((moments[2] == 3.0).all())
        self.assertEqual(record["frames"], 2)

    def test_non_cc_source_is_not_treated_as_local_audio(self):
        self.assertIsNone(MODULE.source_key_path("public-research:https://example.test/a.mp3"))


if __name__ == "__main__":
    unittest.main()
