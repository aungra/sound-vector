import importlib.util
from pathlib import Path
import sys
import unittest


MODULE_PATH = Path(__file__).with_name(
    "genre-unknown80-v112-residual-top3-screen.py"
)
SPEC = importlib.util.spec_from_file_location("v112_residual_screen_tested", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ResidualTop3ScreenTest(unittest.TestCase):
    def test_routed_accepts_pair_in_any_top3_positions(self):
        items = [
            {"id": 1, "top3Labels": ("A", "C", "B")},
            {"id": 2, "top3Labels": ("A", "C", "D")},
        ]
        self.assertEqual(
            [item["id"] for item in MODULE.routed(items, ("A", "B"))],
            [1],
        )

    def test_deduplicate_keeps_first_source_identity(self):
        items = [
            {"sourceKey": "same", "value": "evaluation"},
            {"sourceKey": "same", "value": "overlay"},
            {"sourceKey": "different", "value": "overlay"},
        ]
        self.assertEqual(
            [(item["sourceKey"], item["value"]) for item in MODULE.deduplicate(items)],
            [("same", "evaluation"), ("different", "overlay")],
        )


if __name__ == "__main__":
    unittest.main()
