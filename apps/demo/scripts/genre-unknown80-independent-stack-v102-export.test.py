import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name(
    "genre-unknown80-independent-stack-v102-export.py"
)
SPEC = importlib.util.spec_from_file_location("stack_v102_export", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class StackV102ExportTest(unittest.TestCase):
    def test_latin_folk_member_is_high_confidence(self):
        self.assertEqual(MODULE.LATIN_FOLK_MEMBER["pair"], ("ラテン", "フォーク"))
        self.assertEqual(MODULE.LATIN_FOLK_MEMBER["strength"], 1.0)
        self.assertEqual(MODULE.LATIN_FOLK_MEMBER["confidenceFloor"], 0.95)

    def test_output_is_external(self):
        self.assertTrue(str(MODULE.DEFAULT_OUTPUT).startswith("/Volumes/"))


if __name__ == "__main__":
    unittest.main()
