import importlib.util
import sys
import types
import unittest
from pathlib import Path

import numpy as np


INFER_PATH = Path(__file__).with_name("genre-embedding-infer.py")


def install_audio_dependency_stubs():
    try:
        import librosa  # noqa: F401
    except ModuleNotFoundError:
        sys.modules["librosa"] = types.ModuleType("librosa")
    try:
        import essentia.standard  # noqa: F401
    except ModuleNotFoundError:
        essentia = types.ModuleType("essentia")
        standard = types.ModuleType("essentia.standard")
        standard.MonoLoader = object
        standard.TensorflowPredict2D = object
        standard.TensorflowPredictEffnetDiscogs = object
        essentia.standard = standard
        sys.modules["essentia"] = essentia
        sys.modules["essentia.standard"] = standard


def load_infer():
    install_audio_dependency_stubs()
    spec = importlib.util.spec_from_file_location("genre_embedding_infer_blend_test_runtime", INFER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TargetBlendTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.infer = load_infer()
        cls.labels = ["ハウス", "ロック", "オペラ"]
        cls.config = {
            "scope": "candidate-top-target",
            "targetGenres": ["ハウス", "オペラ"],
            "defaultWeight": 0.0,
            "targetWeight": 0.8,
            "candidateTargetThreshold": 0.2,
            "candidateToBaseRatio": 1.2,
            "candidateMargin": 0.05,
        }

    def test_target_evidence_opens_gate(self):
        mixed, weight, details = self.infer.blend_model_scores(
            self.labels, [0.2, 0.7, 0.1],
            self.labels, [0.75, 0.15, 0.1], self.config,
        )
        self.assertEqual(weight, 0.8)
        self.assertEqual(details["reason"], "target-gate-passed")
        self.assertEqual(self.labels[int(np.argmax(mixed))], "ハウス")

    def test_non_target_challenger_cannot_change_base(self):
        base = np.asarray([0.2, 0.7, 0.1])
        mixed, weight, details = self.infer.blend_model_scores(
            self.labels, base,
            self.labels, [0.1, 0.85, 0.05], self.config,
        )
        self.assertEqual(weight, 0.0)
        self.assertEqual(details["reason"], "target-gate-closed")
        np.testing.assert_allclose(mixed, base)

    def test_candidate_labels_are_aligned(self):
        mixed, weight, _details = self.infer.blend_model_scores(
            self.labels, [0.2, 0.7, 0.1],
            ["オペラ", "ロック", "ハウス"], [0.1, 0.15, 0.75], self.config,
        )
        self.assertEqual(weight, 0.8)
        self.assertEqual(self.labels[int(np.argmax(mixed))], "ハウス")

    def test_base_top_label_weight_overrides_global_gate_weight(self):
        config = {
            **self.config,
            "weightsByBaseTop": {"ロック": 0.25},
        }
        _mixed, weight, details = self.infer.blend_model_scores(
            self.labels, [0.2, 0.7, 0.1],
            self.labels, [0.75, 0.15, 0.1], config,
        )
        self.assertEqual(weight, 0.25)
        self.assertEqual(details["reason"], "base-top-label-weight")


class Top3TransitionGateTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.infer = load_infer()

    def bundle(self, allowed):
        class Model:
            classes_ = np.asarray(["A", "B", "C"])

            @staticmethod
            def predict_proba(_features):
                return np.asarray([[0.1, 0.8, 0.1]])

        return {"top3Stacker": {
            "members": [Model()], "labels": ["A", "B", "C"],
            "weight": 1.0, "topK": 3, "allowedTransitions": allowed,
        }}

    def test_disallowed_top1_transition_returns_base_scores(self):
        base = np.asarray([0.6, 0.3, 0.1])
        output = self.infer.apply_top3_stacker(
            self.bundle([]), ["A", "B", "C"], base,
        )
        np.testing.assert_allclose(output, base)

    def test_allowed_top1_transition_is_applied(self):
        base = np.asarray([0.6, 0.3, 0.1])
        output = self.infer.apply_top3_stacker(
            self.bundle([{"from": "A", "to": "B"}]),
            ["A", "B", "C"], base,
        )
        self.assertEqual(int(np.argmax(output)), 1)


class RawSegmentArbitratorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.infer = load_infer()

    def bundle(self):
        class Model:
            @staticmethod
            def predict_proba(values):
                return np.asarray([[0.1, 0.9] for _ in values])

        return {"segmentArbitrator": {
            "pipeline": Model(), "labels": ["A", "B"],
            "featureMode": "rawSegments", "minimumSegments": 2,
            "blendWeight": 0.5, "baseMaximum": 1.0,
            "marginAdvantage": -1.0,
        }}

    def test_raw_segments_can_change_low_margin_mean(self):
        base = [np.asarray([0.55, 0.45]), np.asarray([0.55, 0.45])]
        vectors = [
            {"effnet_tail": [1.0], "librosa": [0.0]},
            {"effnet_tail": [2.0], "librosa": [0.0]},
        ]
        output, details = self.infer.apply_segment_arbitrator(
            self.bundle(), ["A", "B"], base, vectors,
        )
        self.assertTrue(details["applied"])
        self.assertEqual(int(np.argmax(output)), 1)

    def test_raw_segment_mode_requires_matching_vectors(self):
        base = [np.asarray([0.6, 0.4]), np.asarray([0.6, 0.4])]
        output, details = self.infer.apply_segment_arbitrator(
            self.bundle(), ["A", "B"], base,
        )
        self.assertFalse(details["applied"])
        self.assertEqual(details["reason"], "missing-raw-segment-vectors")
        np.testing.assert_allclose(output, [0.6, 0.4])

class DiscogsTagPriorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.infer = load_infer()

    def test_discogs_tag_prior_uses_label_reliability_gate(self):
        vectors = {"discogs": np.asarray([0.1, 0.9, 0.0, 0.0, 0.1, 0.9])}
        ensemble = {
            "enabled": True,
            "source": "discogs",
            "discogsClasses": ["Tag A", "Tag B"],
            "tagMap": {"A": ["Tag A"], "B": ["Tag B"]},
            "baseWeight": 0.25,
            "tagWeight": 0.75,
            "reliabilityThreshold": 0.3,
            "labelReliability": {"B": 0.2},
        }
        base = np.asarray([0.8, 0.2])
        gated = self.infer.apply_tag_ensemble_if_available(
            {"tagEnsemble": ensemble}, vectors, ["A", "B"], base,
        )
        np.testing.assert_allclose(gated, base)
        ensemble["labelReliability"]["B"] = 0.8
        applied = self.infer.apply_tag_ensemble_if_available(
            {"tagEnsemble": ensemble}, vectors, ["A", "B"], base,
        )
        self.assertEqual(int(np.argmax(applied)), 1)

    def test_validate_model_reports_matching_contract_digest(self):
        contract = self.infer.feature_contract(True)
        bundle = {
            "version": "embedding-genre-model-v2",
            "modelVersion": "validation-test",
            "runtimeFeatureContract": contract,
            "runtimeFeatureContractSha256": self.infer.feature_contract_digest(contract),
        }
        payload = self.infer.model_validation_payload(bundle)
        self.assertTrue(payload["ok"])
        self.assertEqual(
            payload["runtimeFeatureContractSha256"],
            payload["expectedRuntimeFeatureContractSha256"],
        )

    def test_discogs_fallback_requires_broad_family_agreement(self):
        vectors = {"discogs": np.asarray([0.1, 0.9, 0.0, 0.0, 0.1, 0.9])}
        ensemble = {
            "enabled": True,
            "source": "discogs",
            "discogsClasses": ["Techno", "Trance"],
            "tagMap": {"テクノ": ["Techno"], "トランス": ["Trance"], "ロック": []},
            "baseWeight": 0.25,
            "tagWeight": 0.75,
            "fallbackWeight": 0.5,
            "fallbackRequireFamilyAgreement": True,
            "reliabilityThreshold": 0.3,
            "labelReliability": {"トランス": 0.1},
        }
        labels = ["テクノ", "トランス", "ロック"]
        same_family = self.infer.apply_tag_ensemble_if_available(
            {"tagEnsemble": ensemble}, vectors, labels, np.asarray([0.8, 0.1, 0.1]),
        )
        self.assertGreater(float(same_family[1]), 0.1)
        different_family = self.infer.apply_tag_ensemble_if_available(
            {"tagEnsemble": ensemble}, vectors, labels, np.asarray([0.1, 0.1, 0.8]),
        )
        np.testing.assert_allclose(different_family, [0.1, 0.1, 0.8])

    def test_discogs_calibrator_is_aligned_before_blending(self):
        class Calibrator:
            classes_ = np.asarray(["B", "A"])

            @staticmethod
            def predict_proba(_scores):
                return np.asarray([[0.9, 0.1]])

        vectors = {"discogs": np.asarray([0.9, 0.1, 0.0, 0.0, 0.9, 0.1])}
        ensemble = {
            "enabled": True,
            "source": "discogs",
            "discogsClasses": ["Tag A", "Tag B"],
            "tagMap": {"A": ["Tag A"], "B": ["Tag B"]},
            "baseWeight": 0.25,
            "tagWeight": 0.75,
            "calibratorPipeline": Calibrator(),
            "calibratorLabels": ["B", "A"],
        }
        mixed = self.infer.apply_tag_ensemble_if_available(
            {"tagEnsemble": ensemble}, vectors, ["A", "B"], np.asarray([0.8, 0.2]),
        )
        self.assertEqual(int(np.argmax(mixed)), 1)

    def test_discogs_calibrator_family_disagreement_keeps_base(self):
        class Calibrator:
            classes_ = np.asarray(["トランス", "ロック"])

            @staticmethod
            def predict_proba(_scores):
                return np.asarray([[0.9, 0.1]])

        vectors = {"discogs": np.asarray([0.9, 0.1, 0.0, 0.0, 0.9, 0.1])}
        ensemble = {
            "enabled": True,
            "source": "discogs",
            "discogsClasses": ["Trance", "Rock"],
            "tagMap": {"トランス": ["Trance"], "ロック": ["Rock"]},
            "baseWeight": 0.25,
            "tagWeight": 0.75,
            "calibratorPipeline": Calibrator(),
            "calibratorLabels": ["トランス", "ロック"],
            "calibratorRequireFamilyAgreement": True,
        }
        base = np.asarray([0.2, 0.8])
        mixed = self.infer.apply_tag_ensemble_if_available(
            {"tagEnsemble": ensemble}, vectors, ["トランス", "ロック"], base,
        )
        np.testing.assert_allclose(mixed, base)

    def test_pair_reranker_preserves_pair_mass_and_other_labels(self):
        class PairModel:
            classes_ = np.asarray(["レゲエ", "ダブ"])

            @staticmethod
            def predict_proba(_scores):
                return np.asarray([[0.9, 0.1]])

        labels = ["レゲエ", "ダブ", "ロック"]
        base = np.asarray([0.1, 0.5, 0.4])
        bundle = {
            "fine": {"tagEnsemble": {
                "enabled": True,
                "source": "discogs",
                "discogsClasses": ["Reggae", "Dub"],
                "tagMap": {"レゲエ": ["Reggae"], "ダブ": ["Dub"], "ロック": []},
            }},
            "pairRerankers": [{
                "labels": ["レゲエ", "ダブ"],
                "inputLabels": labels,
                "weight": 0.5,
                "model": PairModel(),
            }],
        }
        vectors = {"discogs": np.asarray([0.9, 0.1, 0.0, 0.0, 0.9, 0.1])}
        adjusted = self.infer.apply_pair_rerankers(bundle, vectors, labels, base)
        self.assertAlmostEqual(float(adjusted[0] + adjusted[1]), 0.6)
        self.assertAlmostEqual(float(adjusted[2]), 0.4)
        self.assertGreater(float(adjusted[0]), float(base[0]))

    def test_pair_reranker_is_skipped_without_audio_tag_vector(self):
        class PairModel:
            classes_ = np.asarray(["レゲエ", "ダブ"])

            @staticmethod
            def predict_proba(_scores):
                return np.asarray([[0.9, 0.1]])

        labels = ["レゲエ", "ダブ", "ロック"]
        base = np.asarray([0.1, 0.5, 0.4])
        bundle = {
            "fine": {"tagEnsemble": {"enabled": True, "source": "discogs"}},
            "pairRerankers": [{
                "labels": ["レゲエ", "ダブ"], "weight": 0.5, "model": PairModel(),
            }],
        }
        adjusted = self.infer.apply_pair_rerankers(bundle, {}, labels, base)
        np.testing.assert_allclose(adjusted, base)

    def test_pair_reranker_target_gate_prevents_low_confidence_override(self):
        class PairModel:
            classes_ = np.asarray(["ハードコア", "パンク"])

            @staticmethod
            def predict_proba(_scores):
                return np.asarray([[0.6, 0.4]])

        labels = ["ハードコア", "パンク", "ロック"]
        base = np.asarray([0.1, 0.8, 0.1])
        bundle = {
            "fine": {"tagEnsemble": {
                "enabled": True, "source": "discogs",
                "discogsClasses": ["Hardcore", "Punk"],
                "tagMap": {"ハードコア": ["Hardcore"], "パンク": ["Punk"], "ロック": []},
            }},
            "pairRerankers": [{
                "labels": ["ハードコア", "パンク"], "inputLabels": labels,
                "weight": 1.0, "targetLabel": "ハードコア",
                "targetThreshold": 0.75, "allowedBaseLabels": ["パンク"],
                "model": PairModel(),
            }],
        }
        vectors = {"discogs": np.asarray([0.6, 0.4, 0.0, 0.0, 0.6, 0.4])}
        adjusted = self.infer.apply_pair_rerankers(bundle, vectors, labels, base)
        np.testing.assert_allclose(adjusted, base)

    def test_target_bundle_applies_serialized_feature_indexes(self):
        class IndexedModel:
            classes_ = np.asarray(["A", "B"])

            @staticmethod
            def predict_proba(values):
                np.testing.assert_allclose(values, [[2.0, 4.0]])
                return np.asarray([[0.25, 0.75]])

        target = {
            "labels": ["A", "B"],
            "members": [{
                "featureSet": ["runtime"],
                "featureIndexes": [1, 3],
                "pipeline": IndexedModel(),
                "weight": 1.0,
            }],
        }
        labels, scores = self.infer.score_target_raw(
            target, {"runtime": np.asarray([1.0, 2.0, 3.0, 4.0])},
        )
        self.assertEqual(labels, ["A", "B"])
        np.testing.assert_allclose(scores, [0.25, 0.75])

    def test_top3_stacker_only_redistributes_existing_top3_mass(self):
        class Stacker:
            classes_ = np.asarray(["A", "B", "C", "D"])

            @staticmethod
            def predict_proba(_values):
                return np.asarray([[0.1, 0.8, 0.1, 0.0]])

        labels = ["A", "B", "C", "D"]
        base = np.asarray([0.5, 0.3, 0.15, 0.05])
        bundle = {"top3Stacker": {
            "labels": labels, "topK": 3, "weight": 0.5, "members": [Stacker()],
        }}
        adjusted = self.infer.apply_top3_stacker(bundle, labels, base)
        self.assertAlmostEqual(float(np.sum(adjusted[:3])), 0.95)
        self.assertAlmostEqual(float(adjusted[3]), 0.05)
        self.assertGreater(float(adjusted[1]), float(base[1]))

    def test_top3_stacker_aligns_missing_backbone_label(self):
        class Stacker:
            classes_ = np.asarray(["A", "B", "C"])

            @staticmethod
            def predict_proba(values):
                self_shape = values.shape
                if self_shape != (1, 6):
                    raise AssertionError(self_shape)
                return np.asarray([[0.2, 0.7, 0.1]])

        adjusted = self.infer.apply_top3_stacker(
            {"top3Stacker": {
                "labels": ["A", "B", "C"], "topK": 2,
                "weight": 0.25, "members": [Stacker()],
            }},
            ["A", "B"],
            np.asarray([0.7, 0.3]),
        )
        self.assertEqual(adjusted.shape, (2,))
        self.assertAlmostEqual(float(np.sum(adjusted)), 1.0)

if __name__ == "__main__":
    unittest.main()
