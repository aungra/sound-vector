import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).with_name("genre-unknown80-v108-track-pair-export.py")
SPEC = importlib.util.spec_from_file_location("track_pair_export_tested", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class TrackPairExportTest(unittest.TestCase):
    def test_forced_config_limits_search(self):
        class PairModule:
            WEIGHTS = (0.1, 0.5)
            CONFIDENCE_FLOORS = (0.5, 0.8)

            @staticmethod
            def apply_pair(base, probabilities, pair, labels, config):
                return base, __import__("numpy").zeros(len(base), dtype=bool)

        class Black:
            @staticmethod
            def compare_output(output, baseline, actual, labels, sources):
                return {
                    "top1Accuracy": 1, "balancedTop1": 1,
                    "minimumSourceTop1": 1, "top3Accuracy": 1,
                    "improved": 0, "harmed": 0,
                }

        selected, ranking = MODULE.select_global_config(
            [], ("A", "B"), ["A", "B"], [[0.6, 0.4]],
            {"actual": ["A"], "sources": ["S"]},
            {"top1Accuracy": 1, "balancedTop1": 1,
             "minimumSourceTop1": 1, "top3Accuracy": 1},
            Black(), PairModule(),
            {"weight": 0.5, "confidenceFloor": 0.8},
        )
        self.assertEqual(len(ranking), 1)
        self.assertEqual(selected["config"]["weight"], 0.5)

    def test_selection_requires_passed_multiview_report(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "selection.json"
            path.write_text(json.dumps({"decision": "reject", "selection": []}))
            with self.assertRaises(RuntimeError):
                MODULE.selected_pairs(path)

    def test_selection_reads_only_selected_views(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "selection.json"
            path.write_text(json.dumps({
                "decision": "continue-v108-production-gates",
                "selection": [
                    {"pair": "A / B", "selectedView": "rhythm"},
                    {"pair": "B / C", "selectedView": None},
                ],
            }))
            self.assertEqual(MODULE.selected_pairs(path), [(('A', 'B'), 'rhythm')])


if __name__ == "__main__":
    unittest.main()
