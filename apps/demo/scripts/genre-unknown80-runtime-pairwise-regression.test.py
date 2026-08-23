import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("genre-unknown80-runtime-pairwise-regression.py")
SPEC = importlib.util.spec_from_file_location("runtime_pairwise_regression", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class RuntimePairwiseRegressionTest(unittest.TestCase):
    def test_compare_counts_only_changed_correctness(self):
        result = MODULE.compare(
            ["a", "b", "c", "d"],
            ["b", "b", "c", "a"],
            ["a", "a", "c", "b"],
        )
        self.assertEqual(result["changedRows"], 3)
        self.assertEqual(result["improvedRows"], 1)
        self.assertEqual(result["regressedRows"], 1)
        self.assertEqual(result["netCorrectChanges"], 0)

    def test_metric_reports_balanced_accuracy(self):
        result = MODULE.metric(["a", "a", "b"], ["a", "a", "a"])
        self.assertEqual(result["top1Accuracy"], 66.67)
        self.assertEqual(result["balancedTop1"], 50.0)


if __name__ == "__main__":
    unittest.main()
