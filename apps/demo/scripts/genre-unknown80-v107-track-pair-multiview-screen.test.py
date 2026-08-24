import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).with_name("genre-unknown80-v107-track-pair-multiview-screen.py")
SPEC = importlib.util.spec_from_file_location("track_pair_multiview_tested", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class TrackPairMultiviewTest(unittest.TestCase):
    def test_declared_views_keep_rhythm_and_embedding_separate(self):
        self.assertIn("rhythm", MODULE.VIEWS)
        self.assertIn("effnet", MODULE.VIEWS)
        self.assertEqual(len(MODULE.VIEWS), len(set(MODULE.VIEWS)))


if __name__ == "__main__":
    unittest.main()
