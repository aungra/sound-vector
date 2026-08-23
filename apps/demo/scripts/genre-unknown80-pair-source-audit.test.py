import importlib.util
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name("genre-unknown80-pair-source-audit.py")
SPEC = importlib.util.spec_from_file_location("unknown80_pair_source_audit", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PairSourceAuditTest(unittest.TestCase):
    def test_three_sources_per_label_survive_each_outer_fold(self):
        actual = np.asarray(["a"] * 6 + ["b"] * 6)
        sources = np.asarray(["s1", "s1", "s2", "s2", "s3", "s3"] * 2)
        rows = MODULE.audit_pairs(
            actual, sources, np.ones(12, dtype=bool), ["s1", "s2", "s3"],
            (("a", "b"),), minimum_rows=4, minimum_sources=2,
        )
        self.assertEqual(rows[0]["status"], "viable-all-folds")
        self.assertEqual(rows[0]["blockedFoldCount"], 0)

    def test_two_sources_are_blocked_when_one_is_held_out(self):
        actual = np.asarray(["a"] * 4 + ["b"] * 4)
        sources = np.asarray(["s1", "s1", "s2", "s2"] * 2)
        rows = MODULE.audit_pairs(
            actual, sources, np.ones(8, dtype=bool), ["s1", "s2"],
            (("a", "b"),), minimum_rows=2, minimum_sources=2,
        )
        self.assertEqual(rows[0]["status"], "blocked-source-coverage")
        self.assertEqual(rows[0]["additionalIndependentSourcesNeeded"], {
            "a": 1, "b": 1,
        })


if __name__ == "__main__":
    unittest.main()
