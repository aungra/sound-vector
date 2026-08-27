#!/usr/bin/env python3

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("genre-unknown65-production-chain.py")
SPEC = importlib.util.spec_from_file_location("unknown65_chain_tested", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ProductionChainTest(unittest.TestCase):
    def test_command_preserves_fixed_stage_contract(self):
        chain = {
            "overlayManifests": ["${CACHE_ROOT}/manifest.json"],
        }
        stage = {
            "cache": "${CACHE_ROOT}/cache.json", "cacheFormat": "panns",
            "modelKinds": ["svm-rbf"], "svmC": 10, "useOverlay": True,
        }
        command = MODULE.command_for(
            stage, chain, Path("base.npz"), Path("report.json"), Path("next.npz"),
        )
        self.assertIn("--svm-c", command)
        self.assertIn("--overlay-manifest", command)
        self.assertEqual(command[command.index("--cache-format") + 1], "panns")

    def test_observed_uses_only_promotion_metrics(self):
        payload = {"greedyChain": {"metric": {
            "top1Accuracy": 65.0, "balancedTop1": 64.66,
            "minimumSourceTop1": 57.89, "top3Accuracy": 83.48,
        }}}
        self.assertEqual(MODULE.observed(payload), {
            "top1Accuracy": 65.0, "balancedTop1": 64.66,
            "minimumSourceTop1": 57.89,
        })

    def test_floor_accepts_strict_improvement(self):
        expected = {
            "top1Accuracy": 63.52, "balancedTop1": 62.58,
            "minimumSourceTop1": 47.37,
        }
        actual = {
            "top1Accuracy": 63.83, "balancedTop1": 62.83,
            "minimumSourceTop1": 47.37,
        }
        self.assertTrue(MODULE.meets_floor(actual, expected))


if __name__ == "__main__":
    unittest.main()
