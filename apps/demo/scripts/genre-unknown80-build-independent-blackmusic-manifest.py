#!/usr/bin/env python3
"""Merge reviewed external rows into the independent black-music candidate set."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / "genre-training/unknown80-independent-blackmusic-candidate-manifest.json"
ALLOWED_LICENSES = {"CC0", "CC-BY", "CC-BY-SA"}
PATH_OVERRIDES = {
    "64461": (
        "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/"
        "ccmixter-third-source-weak-v2/フ-ルース/spinningmerkaba-64461.mp3"
    ),
}
SELECTIONS = (
    (
        "ccmixter-third-source-weak-v2-cc-source-manifest.json", "items",
        {"63608", "64661", "51988", "17734"},
    ),
    (
        "ccmixter-third-source-weak-v1-cc-source-manifest.json", "items",
        {"68924"},
    ),
    (
        "ccmixter-third-source-weak-v2-cc-candidates.json", "rejected",
        {"64461"},
    ),
    (
        "ccmixter-rights-safe-weak-v1-cc-source-manifest.json", "items",
        {"65481"},
    ),
    (
        "openverse-explicit-cc-source-manifest.json", "items",
        {"c0958657-2000-4e3c-b7b0-5f3e2ff1286d"},
    ),
    (
        "fma-medium-weak-crosssource-cc-source-manifest.json", "items",
        {"130397", "130396", "130403"},
    ),
    (
        "internet-archive-soul-disco-expansion-20260811-cc-source-manifest.json",
        "items",
        {
            "buddwyerandthecannabinoids:001_sense.flac",
            "buddwyerandthecannabinoids:002_dangerweed.flac",
            "Shocky-Moaner:01shocky-dispute.ogg",
            "Shocky-Moaner:02shocky-bakermaker.ogg",
            "Shocky-Moaner:04shocky-strangerous.ogg",
            "Shocky-Moaner:05shocky-stage.ogg",
        },
    ),
    (
        "wikimedia-soul-disco-expansion-20260811-cc-source-manifest.json",
        "items", {"143643458", "143922060", "143643675"},
    ),
    (
        "openverse-unknown80-gaps-30s-clean-v2-cc-source-manifest.json",
        "items",
        {
            "98715b3d-4c3e-4ddb-9c35-11eaae3ab5b5",
            "0f29106c-124c-4a85-a40b-b4f10747c880",
            "ba3f4090-3648-4895-b4c0-8fbc74fe2244",
        },
    ),
)


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalized_source(row):
    text = " ".join([
        str(row.get("source", "")), str(row.get("datasetName", "")),
        str(row.get("referenceUrl", "")),
    ]).lower()
    if "ccmixter" in text:
        return "ccMixter"
    if "archive.org" in text or "internet archive" in text:
        return "Internet Archive"
    if "wikimedia" in text or "commons.wikimedia" in text:
        return "Wikimedia Commons"
    if "openverse" in text or "freesound" in text:
        return "Openverse"
    if "free music archive" in text or "freemusicarchive" in text or "fma " in text:
        return "FMA"
    raise ValueError(f"unknown source provider for {row.get('trackId')}")


def normalize_row(row, origin):
    path = Path(PATH_OVERRIDES.get(str(row.get("trackId")), row.get("filePath", "")))
    if not path.is_file():
        raise ValueError(f"missing audio for {row.get('trackId')}: {path}")
    if row.get("license") not in ALLOWED_LICENSES:
        raise ValueError(
            f"unsupported license for {row.get('trackId')}: {row.get('license')}"
        )
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
    output.pop("rejectReason", None)
    output["reviewStatus"] = "approved-candidate-explicit-provider-label"
    return output


def build(base, source_root):
    items = list(base.get("items", []))
    existing = {(row.get("source"), str(row.get("trackId"))) for row in items}
    selected = []
    evidence = []
    for filename, collection, requested in SELECTIONS:
        path = source_root / filename
        payload = json.loads(path.read_text())
        rows = payload.get(collection, [])
        found = {
            str(row.get("trackId")): row for row in rows
            if str(row.get("trackId")) in requested
        }
        missing = requested - set(found)
        if missing:
            raise ValueError(f"missing {sorted(missing)} in {path}")
        for track_id in sorted(requested):
            row = normalize_row(found[track_id], filename)
            key = (row["source"], str(row["trackId"]))
            if key not in existing:
                items.append(row)
                existing.add(key)
                selected.append(key)
        evidence.append({
            "path": str(path),
            "sha256": sha256_file(path),
            "collection": collection,
            "trackIds": sorted(requested),
        })
    audio_hashes = [row["audioSha256"] for row in items]
    if len(audio_hashes) != len(set(audio_hashes)):
        raise ValueError("duplicate audio content in candidate manifest")
    output = dict(base)
    output["description"] = (
        "Rights-clear independent-source candidates for leak-free "
        "Blues/Funk/Disco/Reggae/Dub pair-head ablations."
    )
    output["items"] = items
    output["sourceEvidence"] = evidence
    output["buildSummary"] = {
        "selectedRowsAdded": len(selected),
        "totalRows": len(items),
    }
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-root", type=Path,
        default=Path("/Users/kahanishimoto/Documents/MUSICTee/genre-training"),
    )
    parser.add_argument("--base", type=Path, default=OUTPUT)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    base = json.loads(args.base.read_text())
    output = build(base, args.source_root)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(args.output)
    print(json.dumps(output["buildSummary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
