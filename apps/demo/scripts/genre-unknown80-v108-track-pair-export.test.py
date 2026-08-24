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
