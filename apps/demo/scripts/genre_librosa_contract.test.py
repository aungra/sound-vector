import importlib.util
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name("genre_librosa_contract.py")
SPEC = importlib.util.spec_from_file_location("genre_librosa_contract_tested", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class LibrosaContractTest(unittest.TestCase):
    def test_stat_block_matches_runtime_six_stat_contract(self):
        values = np.asarray([[1.0, 2.0, 3.0]])
        result = MODULE.stat_block(values)
        self.assertEqual(len(result), 6)
        self.assertEqual(result[2:4], [1.0, 3.0])

    def test_safe_feature_unwraps_tuple(self):
        value = MODULE.safe_feature(lambda: (np.asarray([2.0]), 3), None)
        self.assertEqual(value.tolist(), [2.0])

    def test_vector_contract_declares_expected_length(self):
        self.assertEqual(MODULE.VECTOR_LENGTH, 547)


if __name__ == "__main__":
    unittest.main()
