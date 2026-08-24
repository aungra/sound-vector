import importlib.util
from pathlib import Path
import unittest


PATH = Path(__file__).with_name("genre-unknown80-v110-promote.py")
SPEC = importlib.util.spec_from_file_location("v110_promote_tested", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class V110PromotionTest(unittest.TestCase):
    def fixtures(self):
        export = {
            "decision": "continue-v110-runtime-parity",
            "baseline": {"top1Accuracy": 60, "balancedTop1": 60, "minimumSourceTop1": 30, "top3Accuracy": 80},
            "sourceHeldout": {"top1Accuracy": 61, "balancedTop1": 60, "minimumSourceTop1": 30, "top3Accuracy": 80, "improved": 2, "harmed": 0},
            "finalFitDiagnostic": {"harmed": 0},
        }
        parity = {
            "decision": "continue-production-regression-gate",
            "featureParityPasses": True, "finalFitDiagnostic": {"harmed": 0},
        }
        production = {"promotionGate": "passed"}
        pair = {"sourceSupport": {"A": ["s1", "s2"], "B": ["s2", "s3"]}}
        manifest = {
            "version": "unknown80-track-pair-v110-candidate",
            "promotionState": "candidate-runtime-parity-pending",
            "modelPath": "/model", "modelSha256": "sha",
            "pairs": [pair, pair, pair],
        }
        return export, parity, production, manifest

    def test_all_gates_pass(self):
        self.assertEqual(MODULE.gate_failures(*self.fixtures()), [])

    def test_single_source_label_is_rejected(self):
        export, parity, production, manifest = self.fixtures()
        manifest["pairs"][-1] = {"sourceSupport": {"A": ["s1"], "B": ["s1", "s2"]}}
        self.assertIn(
            "a pair label has fewer than two independent sources",
            MODULE.gate_failures(export, parity, production, manifest),
        )


if __name__ == "__main__":
    unittest.main()
