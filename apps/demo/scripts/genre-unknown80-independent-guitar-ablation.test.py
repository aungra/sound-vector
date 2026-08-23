import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name(
    "genre-unknown80-independent-guitar-ablation.py"
)
SPEC = importlib.util.spec_from_file_location("guitar_ablation", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class GuitarAblationTest(unittest.TestCase):
    def test_group_is_rock_metal(self):
        self.assertEqual(MODULE.GROUPS, (("ロック", "メタル"),))

    def test_render_documents_v100_equivalence(self):
        report = {
            "ranking": ["candidate"],
            "candidates": {
                "candidate": {
                    "top1Accuracy": 1.0,
                    "balancedTop1": 2.0,
                    "minimumSourceTop1": 3.0,
                    "top3Accuracy": 4.0,
                    "improved": 1,
                    "harmed": 0,
                }
            },
            "decision": "promote",
        }
        rendered = MODULE.render(report)
        self.assertIn("v100 delta", rendered)
        self.assertIn("1 / 0", rendered)


if __name__ == "__main__":
    unittest.main()
