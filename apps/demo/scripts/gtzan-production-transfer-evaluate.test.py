import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("gtzan-production-transfer-evaluate.py")
SPEC = importlib.util.spec_from_file_location("gtzan_transfer", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class GtzanProductionTransferTest(unittest.TestCase):
    def test_rejects_training_eligible_rows(self):
        with self.assertRaisesRegex(ValueError, "non-evaluation row"):
            MODULE.validate_evaluation_rows({
                "role": "source-heldout-evaluation-only",
                "items": [{
                    "trackId": "blues.00001",
                    "trainingEligible": True,
                    "productionEligible": False,
                    "evaluationEligible": True,
                }],
            })

    def test_metrics_include_balanced_and_top3(self):
        report = MODULE.metrics([
            {
                "actual": "ブルース",
                "top": [{"label": "ブルース"}, {"label": "ロック"}],
            },
            {
                "actual": "ロック",
                "top": [{"label": "メタル"}, {"label": "ロック"}],
            },
        ])
        self.assertEqual(report["top1Accuracy"], 50.0)
        self.assertEqual(report["top3Accuracy"], 100.0)
        self.assertEqual(report["balancedTop1"], 50.0)

    def test_metrics_can_score_pre_reranker_ranking(self):
        report = MODULE.metrics([{
            "actual": "ロック",
            "baselineTop": [{"label": "ロック"}],
            "top": [{"label": "メタル"}],
        }], "baselineTop")
        self.assertEqual(report["top1Accuracy"], 100.0)


if __name__ == "__main__":
    unittest.main()
