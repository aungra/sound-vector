import importlib.util
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name(
    "genre-unknown80-independent-stack-source-heldout.py"
)
SPEC = importlib.util.spec_from_file_location("stack_source_heldout", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class StackSourceHeldoutTest(unittest.TestCase):
    def test_versions_add_one_member_at_a_time(self):
        lengths = [len(members) for _name, members in MODULE.STACKS]
        self.assertEqual(lengths, [1, 2, 3])

    def test_merge_overlay_deduplicates_source_keys(self):
        row = {"sourceType": "cc", "sourceUrl": "/a.wav"}
        rows, features = MODULE.merge_overlay(
            ([row], [row]),
            (np.asarray([[1.0]], dtype=np.float32), np.asarray([[2.0]], dtype=np.float32)),
        )
        self.assertEqual(len(rows), 1)
        np.testing.assert_allclose(features, [[1.0]])

    def test_latin_folk_candidate_is_confidence_gated(self):
        member = MODULE.STACKS[-1][1][-1]
        self.assertEqual(member["pair"], ("ラテン", "フォーク"))
        self.assertEqual(member["confidenceFloor"], 0.95)


if __name__ == "__main__":
    unittest.main()
