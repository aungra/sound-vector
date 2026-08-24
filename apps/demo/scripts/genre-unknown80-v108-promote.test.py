import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).with_name("genre-unknown80-v108-promote.py")
SPEC = importlib.util.spec_from_file_location("v108_promote_tested", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class V108PromotionTest(unittest.TestCase):
    def fixtures(self):
        export = {
            "decision": "continue-runtime-parity-gate",
            "baseline": {"top1Accuracy": 60, "balancedTop1": 60, "minimumSourceTop1": 30, "top3Accuracy": 80},
            "candidate": {"top1Accuracy": 61, "balancedTop1": 60, "minimumSourceTop1": 30, "top3Accuracy": 80, "improved": 2, "harmed": 0},
        }
        parity = {
            "decision": "continue-production-regression-gate",
            "featureParityPasses": True,
            "finalFitDiagnostic": {"harmed": 0},
        }
        production = {"promotionGate": "passed"}
        manifest = {
            "promotionState": "candidate-runtime-parity-pending",
            "modelPath": "/model", "modelSha256": "sha",
            "pairs": [{"sourceSupport": {"A": ["s1", "s2"], "B": ["s2", "s3"]}}],
        }
        return export, parity, production, manifest

    def test_all_gates_pass(self):
        self.assertEqual(MODULE.gate_failures(*self.fixtures()), [])

    def test_single_source_pair_is_rejected(self):
        export, parity, production, manifest = self.fixtures()
        manifest["pairs"][0]["sourceSupport"]["B"] = ["s1"]
        failures = MODULE.gate_failures(export, parity, production, manifest)
        self.assertIn("a pair label has fewer than two independent sources", failures)


if __name__ == "__main__":
    unittest.main()
