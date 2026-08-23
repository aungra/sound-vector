"""Shared live-audio feature contract for genre training and inference."""

from __future__ import annotations

import hashlib
import json


CONTRACT_VERSION = "mmfr-runtime-audio-v2.1"
DISCOGS_PRIOR_CONTRACT_VERSION = "mmfr-runtime-audio-v2.3-discogs-prior-isolated"
SEGMENT_COUNT = 3
SEGMENT_DURATION_SECONDS = 45.0
RUNTIME_FEATURES = ("effnet_tail", "librosa")
FEATURE_LENGTHS = {"effnet_tail": 3840, "librosa": 547}

# These broader families deliberately span the old eight macro heads. They let
# the fine model arbitrate nearby sounds without turning a macro guess into a
# hard exclusion.
SPECIALIST_FAMILIES = {
    "electronic": (
        "テクノ", "ハウス", "ディープ・ハウス", "トランス",
        "ドラムンベース", "ダブステップ", "チップチューン",
    ),
    "black_music": (
        "ヒップホップ", "トラップ", "レゲエ", "ダブ", "ブルース",
        "ファンク", "ソウルミュージック", "ディスコ",
    ),
    "acoustic_structural": (
        "アンビエント", "ドローン", "ノイズミュージック",
        "クラシック音楽", "オペラ", "ジャズ", "フォーク", "ラテン",
    ),
    "guitar_pop": (
        "ロック", "パンク", "ハードコア", "メタル", "J-POP",
        "シティ・ポップ", "アニメソング",
    ),
}

SPECIALIST_FAMILY_MACROS = {
    "electronic": ("electronic",),
    "black_music": ("black_music",),
    "acoustic_structural": ("ambient", "classical", "jazz", "world"),
    "guitar_pop": ("rock", "pop"),
}


def feature_contract(discogs_tag_head_required=False):
    return {
        "version": (
            DISCOGS_PRIOR_CONTRACT_VERSION if discogs_tag_head_required else CONTRACT_VERSION
        ),
        "sources": [
            "discogs-effnet-embedding-tail", "librosa-aggregate",
            *(["discogs400-audio-tag-prior"] if discogs_tag_head_required else []),
        ],
        "features": list(RUNTIME_FEATURES),
        "featureLengths": dict(FEATURE_LENGTHS),
        "segmentCount": SEGMENT_COUNT,
        "minimumSegmentCount": 1,
        "segmentDurationSeconds": SEGMENT_DURATION_SECONDS,
        "segmentOffsets": "linspace(0,duration-segmentDuration,segmentCount)",
        "segmentAggregation": "mean-calibrated-probability",
        "shortTrackPolicy": "use-one-full-available-segment-and-reduce-evidence-coverage",
        "segmentDiagnostics": ["agreement", "distributionDrift", "stability"],
        "missingFeaturePolicy": "required-source-fails-inference",
        "discogsTagHeadRequired": bool(discogs_tag_head_required),
        **({"discogsTagHeadExecution": "isolated-one-shot-process"} if discogs_tag_head_required else {}),
        "mtgHeadRequired": False,
        "metadataUsed": False,
    }


def canonical_contract_json(contract=None):
    return json.dumps(
        contract or feature_contract(), ensure_ascii=False,
        sort_keys=True, separators=(",", ":"),
    )


def feature_contract_digest(contract=None):
    return hashlib.sha256(canonical_contract_json(contract).encode("utf-8")).hexdigest()


def validate_runtime_vectors(vectors):
    errors = []
    for name, expected in FEATURE_LENGTHS.items():
        value = vectors.get(name)
        actual = len(value) if value is not None else 0
        if actual != expected:
            errors.append(f"{name}: expected {expected}, got {actual}")
    return errors


def validate_bundle_contract(bundle):
    contract = bundle.get("runtimeFeatureContract") or {}
    expected = feature_contract(bool(contract.get("discogsTagHeadRequired")))
    expected_digest = feature_contract_digest(expected)
    actual_digest = bundle.get("runtimeFeatureContractSha256") or feature_contract_digest(contract)
    errors = []
    if contract != expected:
        errors.append("runtime feature contract payload differs from live inference")
    if actual_digest != expected_digest:
        errors.append("runtime feature contract digest differs from live inference")
    return errors
