#!/usr/bin/env python3
"""Build an evaluation-only manifest from PyTorch's filtered GTZAN split."""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
CACHE_ROOT = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/gtzan"
)
DEFAULT_SPLIT_SOURCE = CACHE_ROOT / "torchaudio-gtzan-4e3e282.py"
DEFAULT_AUDIO_ROOT = CACHE_ROOT / "genres"
DEFAULT_OUTPUT = TRAINING / "gtzan-filtered-evaluation-manifest.json"
DEFAULT_REPORT = TRAINING / "gtzan-filtered-evaluation-report.json"
PINNED_TORCHAUDIO_COMMIT = "4e3e282b0e23a0b9133abc8f719e2fa39be2a6e3"
PINNED_SPLIT_SHA256 = "2397513ff406b90d63a17591c19c2dbe9c22db6b994dbf10666f4caf65b9e4c8"
DATASET_REVISION = "d2146561ecc7df707d9e6b8318885fe6a39668a2"
PINNED_ARCHIVE_SHA256 = "b28cc067ff6199bd826f5d1a6931458586d64acae7f44b2e882b7a97af057531"
GENRE_MAP = {
    "blues": "ブルース",
    "classical": "クラシック音楽",
    "disco": "ディスコ",
    "hiphop": "ヒップホップ",
    "jazz": "ジャズ",
    "metal": "メタル",
    "reggae": "レゲエ",
    "rock": "ロック",
}


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_assignment(path, name="filtered_test"):
    module = ast.parse(Path(path).read_text())
    for node in module.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == name
            for target in node.targets
        ):
            values = ast.literal_eval(node.value)
            if not isinstance(values, list) or not all(
                isinstance(value, str) for value in values
            ):
                raise ValueError(f"{name} must be a list of strings")
            return values
    raise ValueError(f"assignment not found: {name}")


def build_manifest(file_ids, audio_root, exists=lambda path: Path(path).exists()):
    rows = []
    rejected = Counter()
    seen = set()
    for file_id in file_ids:
        genre_key = file_id.split(".", 1)[0]
        genre = GENRE_MAP.get(genre_key)
        if genre is None:
            rejected["outside-32-genre-contract"] += 1
            continue
        if file_id in seen:
            rejected["duplicate-file-id"] += 1
            continue
        seen.add(file_id)
        file_path = Path(audio_root) / genre_key / f"{file_id}.wav"
        if not exists(file_path):
            rejected["missing-audio"] += 1
            continue
        rows.append({
            "genre": genre,
            "canonicalFineLabel": genre,
            "datasetName": "GTZAN filtered research evaluation",
            "sourceFamily": "GTZAN",
            "sourceType": "public-research-dataset",
            "trackId": file_id,
            "workId": f"gtzan:{file_id}",
            "filePath": str(file_path.resolve()),
            "sourceUrl": str(file_path.resolve()),
            "referenceUrl": "https://huggingface.co/datasets/marsyas/gtzan",
            "splitReferenceUrl": (
                "https://github.com/pytorch/audio/blob/"
                f"{PINNED_TORCHAUDIO_COMMIT}/src/torchaudio/datasets/gtzan.py"
            ),
            "providerLabel": genre_key,
            "labelEvidence": "GTZAN directory label in PyTorch filtered testing split",
            "license": "LICENSE-UNSPECIFIED-RESEARCH-EVALUATION-ONLY",
            "sourceLabelAction": "exact",
            "v2TrainingRole": "evaluation-only",
            "trainingEligible": False,
            "evaluationEligible": True,
            "productionEligible": False,
        })
    rows.sort(key=lambda row: row["trackId"])
    return rows, dict(rejected)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--split-source", type=Path, default=DEFAULT_SPLIT_SOURCE)
    parser.add_argument("--audio-root", type=Path, default=DEFAULT_AUDIO_ROOT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    split_hash = sha256_file(args.split_source)
    if split_hash != PINNED_SPLIT_SHA256:
        raise RuntimeError(
            f"PyTorch split SHA-256 mismatch: {split_hash} != {PINNED_SPLIT_SHA256}"
        )
    rows, rejected = build_manifest(
        load_assignment(args.split_source), args.audio_root,
    )
    manifest = {
        "schemaVersion": 1,
        "datasetName": "GTZAN filtered research evaluation",
        "datasetRevision": DATASET_REVISION,
        "archiveSha256": PINNED_ARCHIVE_SHA256,
        "role": "source-heldout-evaluation-only",
        "licensePolicy": (
            "Dataset audio license is unspecified. Never use these rows for "
            "training or production export."
        ),
        "splitPolicy": "PyTorch filtered testing split mitigates known duplication.",
        "splitSourceSha256": split_hash,
        "items": rows,
    }
    report = {
        "objective": "Measure unknown-source transfer on a filtered public research cohort.",
        "rows": len(rows),
        "byGenre": dict(sorted(Counter(row["genre"] for row in rows).items())),
        "rejected": rejected,
        "allAudioExternal": all(row["filePath"].startswith("/Volumes/") for row in rows),
        "allEvaluationOnly": all(
            row["evaluationEligible"] and not row["trainingEligible"]
            and not row["productionEligible"] for row in rows
        ),
        "productionModelUpdated": False,
        "archiveSha256": PINNED_ARCHIVE_SHA256,
    }
    args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "manifest": str(args.output), "report": str(args.report), **report,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
