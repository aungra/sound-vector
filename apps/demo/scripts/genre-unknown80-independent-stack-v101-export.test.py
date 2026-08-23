import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name(
    "genre-unknown80-independent-stack-v101-export.py"
)
SPEC = importlib.util.spec_from_file_location("stack_v101_export", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class StackV101ExportTest(unittest.TestCase):
    def test_guitar_member_is_conservative(self):
        self.assertEqual(MODULE.GUITAR_MEMBER["pair"], ("ロック", "メタル"))
        self.assertEqual(MODULE.GUITAR_MEMBER["strength"], 0.25)
        self.assertEqual(MODULE.GUITAR_MEMBER["confidenceFloor"], 0.9)

    def test_output_is_external(self):
        self.assertTrue(str(MODULE.DEFAULT_OUTPUT).startswith("/Volumes/"))


if __name__ == "__main__":
    unittest.main()
