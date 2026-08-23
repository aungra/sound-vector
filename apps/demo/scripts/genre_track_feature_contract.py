"""Track-level 4 x 30 second feature contract shared by new research jobs.

The incumbent runtime model still uses ``genre_runtime_contract.py`` (3 x 45
seconds).  This module deliberately coexists with it until a source-heldout
candidate passes every production gate.
"""

from __future__ import annotations

import hashlib
import json


CONTRACT_VERSION = "mmfr-track-audio-v3.0-4x30"
SEGMENT_COUNT = 4
SEGMENT_DURATION_SECONDS = 30.0
FEATURE_LENGTHS = {"effnet_tail": 3840, "librosa": 547}


def feature_contract():
    return {
        "version": CONTRACT_VERSION,
        "sources": ["discogs-effnet-embedding-tail", "librosa-aggregate"],
        "features": list(FEATURE_LENGTHS),
        "featureLengths": dict(FEATURE_LENGTHS),
        "segmentCount": SEGMENT_COUNT,
        "minimumSegmentCount": 1,
        "segmentDurationSeconds": SEGMENT_DURATION_SECONDS,
        "segmentOffsets": "requested,track-20,track-50,track-80-with-dedup-grid",
        "segmentAggregation": "median-probability-with-temporal-diagnostics",
        "shortTrackPolicy": "split-full-track-into-four-equal-ranges",
        "segmentDiagnostics": [
            "agreement", "macroAgreement", "probabilityMedian", "probabilityVariance",
            "distributionDrift", "evidenceCoverage",
        ],
        "missingFeaturePolicy": "required-source-fails-segment",
        "metadataUsed": False,
    }


def canonical_contract_json(contract=None):
    return json.dumps(
        contract or feature_contract(), ensure_ascii=False,
        sort_keys=True, separators=(",", ":"),
    )


def feature_contract_digest(contract=None):
    return hashlib.sha256(canonical_contract_json(contract).encode("utf-8")).hexdigest()


def _clamp(value, minimum, maximum):
    return max(minimum, min(maximum, float(value or 0)))


def _rounded(value):
    return round(float(value), 3)


def plan_track_sample_ranges(
    duration_seconds, requested_start_seconds=0,
    window_seconds=SEGMENT_DURATION_SECONDS, count=SEGMENT_COUNT,
):
    """Mirror ``genre-track-sampling.mjs`` for offline feature extraction."""
    duration = max(0.0, float(duration_seconds or 0))
    segment_count = max(1, int(count or SEGMENT_COUNT))
    if not duration:
        return []
    requested = _clamp(requested_start_seconds, 0, max(0, duration - 1))
    segment_duration = min(max(1, float(window_seconds or SEGMENT_DURATION_SECONDS)), duration / segment_count)
    maximum_start = max(0, duration - segment_duration)

    if duration <= segment_duration * segment_count + 0.001:
        ranges = [
            {"role": "coverage", "startSeconds": index * segment_duration}
            for index in range(segment_count)
        ]
        requested_index = min(
            segment_count - 1,
            int(requested // max(segment_duration, 0.001)),
        )
        ranges[requested_index]["role"] = "requested"
        ranges.insert(0, ranges.pop(requested_index))
        return _finish_ranges(ranges, duration, segment_duration)

    proposals = [
        {"role": "requested", "startSeconds": _clamp(requested, 0, maximum_start)},
        {"role": "track-20", "startSeconds": _clamp(duration * 0.2 - segment_duration / 2, 0, maximum_start)},
        {"role": "track-50", "startSeconds": _clamp(duration * 0.5 - segment_duration / 2, 0, maximum_start)},
        {"role": "track-80", "startSeconds": _clamp(duration * 0.8 - segment_duration / 2, 0, maximum_start)},
    ][:segment_count]
    grid_count = max(segment_count * 3, 7)
    grid = [maximum_start * index / max(1, grid_count - 1) for index in range(grid_count)]
    selected = []
    minimum_gap = min(
        segment_duration * 0.6,
        maximum_start / max(1, segment_count - 1) * 0.7,
    )
    for proposal in proposals:
        start = proposal["startSeconds"]
        role = proposal["role"]
        if any(abs(item["startSeconds"] - start) < minimum_gap for item in selected):
            preferred = start
            eligible = [
                candidate for candidate in grid
                if all(abs(item["startSeconds"] - candidate) >= minimum_gap for item in selected)
            ]
            eligible.sort(key=lambda candidate: (
                abs(candidate - preferred),
                -min(abs(item["startSeconds"] - candidate) for item in selected),
                candidate,
            ))
            if not eligible:
                continue
            start = eligible[0]
            role = "coverage"
        selected.append({"role": role, "startSeconds": start})
    for start in grid:
        if len(selected) >= segment_count:
            break
        if all(abs(item["startSeconds"] - start) >= minimum_gap for item in selected):
            selected.append({"role": "coverage", "startSeconds": start})
    return _finish_ranges(selected[:segment_count], duration, segment_duration)


def _finish_ranges(ranges, duration, segment_duration):
    return [
        {
            "index": index,
            "role": item["role"],
            "startSeconds": _rounded(item["startSeconds"]),
            "endSeconds": _rounded(min(duration, item["startSeconds"] + segment_duration)),
            "durationSeconds": _rounded(segment_duration),
        }
        for index, item in enumerate(ranges)
    ]
