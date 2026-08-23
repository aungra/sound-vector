import importlib.util
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).with_name("genre-unknown80-v107-track-duration-audit.py")
SPEC = importlib.util.spec_from_file_location("duration_audit_tested", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class DurationAuditTest(unittest.TestCase):
    def test_direct_local_source_key_is_resolved(self):
        with tempfile.NamedTemporaryFile() as handle:
            path, resolution = MODULE.resolve_path(f"cc-dataset:{handle.name}", {})
            self.assertEqual(path, Path(handle.name))
            self.assertEqual(resolution, "source-key-path")

    def test_duration_categories_match_four_by_thirty_requirement(self):
        self.assertEqual(MODULE.classify_duration(120), "full-4x30")
        self.assertEqual(MODULE.classify_duration(119.9), "shorter-than-4x30")
        self.assertEqual(MODULE.classify_duration(30), "shorter-than-4x30")
        self.assertEqual(MODULE.classify_duration(29.9), "shorter-than-30")
        self.assertEqual(MODULE.classify_duration(None), "unreadable")


if __name__ == "__main__":
    unittest.main()
