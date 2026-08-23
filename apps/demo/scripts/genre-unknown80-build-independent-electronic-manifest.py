#!/usr/bin/env python3
"""Build a rights-clear, full-track electronic training-only overlay."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / "genre-training/unknown80-independent-electronic-candidate-manifest.json"
SOURCE_ROOT = Path("/Users/kahanishimoto/Documents/MUSICTee/genre-training")
TARGET_GENRES = {"テクノ", "ハウス", "ディープ・ハウス", "トランス"}
ALLOWED_LICENSES = {"CC0", "CC-BY", "CC-BY-SA"}
SOURCE_MANIFESTS = (
    "internet-archive-independent-8-cc-source-manifest.json",
    "wikimedia-independent-8-20260811-cc-source-manifest.json",
    "ccmixter-rights-safe-weak-v1-cc-source-manifest.json",
    "wikimedia-category-expansion1-cc-source-manifest.json",
    "maest-weak-source-plan.json",
    "fma-target-cc-source-manifest.json",
    "fma-low-genres-expansion-cc-source-manifest.json",
    "fma-large-expansion-cc-source-manifest.json",
)


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rows_from(payload):
    for key in ("items", "tracks", "entries", "candidates", "plan"):
        rows = payload.get(key)
        if isinstance(rows, list):
            return rows
    return []


def normalized_source(row):
    text = " ".join([
        str(row.get("source", "")), str(row.get("datasetName", "")),
        str(row.get("referenceUrl", "")), str(row.get("filePath", "")),
    ]).lower()
    if "ccmixter" in text:
        return "ccMixter"
    if "wikimedia" in text or "commons.wikimedia" in text:
        return "Wikimedia Commons"
    if (
        "free music archive" in text
        or "/external-data/fma/" in text
        or row.get("source") == "FMA"
    ):
        return "FMA"
    if "archive.org" in text or "internet archive" in text:
        return "Internet Archive"
    raise ValueError(f"unknown provider for {row.get('trackId')}")


def normalize_row(row, origin):
    path = Path(row.get("filePath", ""))
    if not path.is_file():
        return None
    genre = row.get("genre")
    license_name = row.get("license")
    if genre not in TARGET_GENRES or license_name not in ALLOWED_LICENSES:
        return None
    output = dict(row)
    output.update({
        "source": normalized_source(row),
        "sourceType": row.get("sourceType") or "cc-dataset",
        "sourceUrl": str(path),
        "filePath": str(path),
        "sourceLabelAction": "exact",
        "v2TrainingRole": "fine",
        "trainingEligible": True,
        "evaluationEligible": False,
        "productionEligible": False,
        "audioSha256": sha256_file(path),
        "candidateOrigin": origin,
    })
    return output


def build(source_root):
    items = []
    evidence = []
    seen_audio = set()
    for filename in SOURCE_MANIFESTS:
        path = source_root / filename
        payload = json.loads(path.read_text())
        selected = 0
        for raw in rows_from(payload):
            row = normalize_row(raw, filename)
            if row is None or row["audioSha256"] in seen_audio:
                continue
            seen_audio.add(row["audioSha256"])
            items.append(row)
            selected += 1
        evidence.append({
            "path": str(path),
            "sha256": sha256_file(path),
            "selectedRows": selected,
        })
    items.sort(key=lambda row: (
        row["genre"], row["source"], str(row.get("trackId", ""))
    ))
    return {
        "description": (
            "Rights-clear full-track electronic candidates for leak-free "
            "Techno/House/Deep House/Trance boundary ablations."
        ),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "role": "candidate-training-overlay",
        "policy": {
            "allowedLicenses": sorted(ALLOWED_LICENSES),
            "fullTracksOnly": True,
            "loopsExcluded": True,
            "metadataUsedAtInference": False,
            "audioStoredOutsideRepository": True,
            "sourceFoldIsolation": (
                "Exclude every overlay row from the matching provider in each "
                "outer source fold."
            ),
            "productionEligible": False,
        },
        "items": items,
        "sourceEvidence": evidence,
        "buildSummary": {
            "rows": len(items),
            "byGenre": dict(Counter(row["genre"] for row in items)),
            "bySource": dict(Counter(row["source"] for row in items)),
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, default=SOURCE_ROOT)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    payload = build(args.source_root)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(args.output)
    print(json.dumps(payload["buildSummary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
