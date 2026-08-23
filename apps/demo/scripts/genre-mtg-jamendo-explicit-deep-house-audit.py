#!/usr/bin/env python3
"""Build a rights-safe, explicit-tag MTG-Jamendo Deep House audit."""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
DEFAULT_MTG_ROOT = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/mtg-jamendo"
)
DEFAULT_MANIFEST = (
    TRAINING / "mtg-jamendo-explicit-deep-house-v1-cc-source-manifest.json"
)
DEFAULT_REPORT = TRAINING / "mtg-jamendo-explicit-deep-house-v1-audit.json"
DEFAULT_MARKDOWN = TRAINING / "mtg-jamendo-explicit-deep-house-v1-audit.md"
DEFAULT_OOF = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/"
    "unknown80-incumbent-caphe-oof-audio-only.npz"
)

ALLOWED_LICENSE_CODES = {"by", "by-sa"}
GENERIC_COMPATIBLE_TAGS = {
    "deephouse", "house", "electronic", "electronica", "dance", "club",
    "edm", "chillout", "lounge", "easylistening", "instrumental", "pop",
}
CONFLICTING_FINE_TAGS = {
    "ambient", "blues", "breakbeat", "classical", "disco", "drumnbass",
    "dub", "dubstep", "funk", "hiphop", "idm", "jazz", "metal", "noise",
    "punk", "reggae", "rnb", "rock", "soul", "techno", "trance", "trap",
    "triphop", "world",
}


def parse_licenses(path: Path):
    output = {}
    for block in path.read_text(errors="replace").strip().split("\n\n"):
        lines = block.splitlines()
        if len(lines) < 3:
            continue
        track_match = re.search(r"/(\d+)\.mp3$", lines[0].strip())
        url_match = re.search(
            r"(https?://creativecommons\.org/licenses/([^/]+)/([^/]+)/?)",
            lines[2],
        )
        if not track_match or not url_match:
            continue
        output[track_match.group(1)] = {
            "licenseCode": url_match.group(2).lower(),
            "licenseVersion": url_match.group(3),
            "licenseUrl": url_match.group(1),
            "licenseEvidence": lines[2].strip(),
        }
    return output


def load_tsv(path: Path, key: str):
    with path.open(newline="") as handle:
        return {
            row[key]: row
            for row in csv.DictReader(handle, delimiter="\t")
        }


def load_oof_keys(path: Path):
    if not path.exists():
        return set()
    try:
        import numpy as np
    except ImportError:
        return set()
    payload = np.load(path)
    return {str(value) for value in payload["sourceKeys"]}


def normalize_tags(values):
    return {
        value.removeprefix("genre---").strip().lower()
        for value in values
        if value.strip()
    }


def parse_genre_rows(path: Path):
    rows = []
    with path.open(newline="") as handle:
        for values in csv.reader(handle, delimiter="\t"):
            if len(values) < 6:
                continue
            try:
                duration_seconds = float(values[4])
            except ValueError:
                continue
            rows.append({
                "trackId": values[0],
                "artistId": values[1],
                "albumId": values[2],
                "sourcePath": values[3],
                "durationSeconds": duration_seconds,
                "tags": normalize_tags(values[5:]),
            })
    return rows


def audit_rows(mtg_root: Path, oof_keys, artist_cap=3, album_cap=2):
    licenses = parse_licenses(mtg_root / "audio_licenses.txt")
    metadata = load_tsv(mtg_root / "data/raw.meta.tsv", "TRACK_ID")
    candidates = []
    rejected = Counter()
    for row in parse_genre_rows(mtg_root / "data/autotagging_genre.tsv"):
        if "deephouse" not in row["tags"]:
            continue
        numeric_id = row["trackId"].removeprefix("track_").lstrip("0") or "0"
        license_row = licenses.get(numeric_id)
        if not license_row or license_row["licenseCode"] not in ALLOWED_LICENSE_CODES:
            rejected["non-production-cc-license"] += 1
            continue
        conflicts = sorted(row["tags"] & CONFLICTING_FINE_TAGS)
        unknown_tags = sorted(row["tags"] - GENERIC_COMPATIBLE_TAGS)
        if conflicts:
            rejected["conflicting-fine-tag"] += 1
            continue
        if unknown_tags:
            rejected["unreviewed-adjacent-tag"] += 1
            continue
        meta = metadata.get(row["trackId"], {})
        source_path = row["sourcePath"].replace(".mp3", ".low.mp3")
        file_path = mtg_root / "raw_30s/audio-low" / source_path
        source_key = f"cc-dataset:{file_path}"
        candidates.append({
            **row,
            **license_row,
            "numericTrackId": numeric_id,
            "canonicalArtist": meta.get("ARTIST_NAME", ""),
            "canonicalTitle": meta.get("TRACK_NAME", ""),
            "albumTitle": meta.get("ALBUM_NAME", ""),
            "referenceUrl": meta.get("URL", f"https://www.jamendo.com/track/{numeric_id}"),
            "filePath": str(file_path),
            "audioExists": file_path.exists(),
            "sourceKey": source_key,
            "oofOverlap": source_key in oof_keys,
        })

    candidates.sort(key=lambda row: (
        not row["audioExists"], row["oofOverlap"], row["artistId"],
        row["albumId"], row["trackId"],
    ))
    selected = []
    artist_counts = Counter()
    album_counts = Counter()
    for row in candidates:
        if artist_counts[row["artistId"]] >= artist_cap:
            rejected["artist-cap"] += 1
            continue
        if album_counts[row["albumId"]] >= album_cap:
            rejected["album-cap"] += 1
            continue
        selected.append(row)
        artist_counts[row["artistId"]] += 1
        album_counts[row["albumId"]] += 1
    return candidates, selected, rejected


def manifest_item(row):
    license_name = "CC-BY-SA" if row["licenseCode"] == "by-sa" else "CC-BY"
    return {
        "source": "Jamendo",
        "sourceType": "cc-dataset",
        "datasetName": "MTG-Jamendo explicit deephouse tag",
        "trackId": row["trackId"],
        "genre": "ディープ・ハウス",
        "macroGenre": "electronic",
        "trainingRole": "fine",
        "filePath": row["filePath"],
        "sourceUrl": row["filePath"],
        "sourcePath": row["sourcePath"],
        "referenceUrl": row["referenceUrl"],
        "license": license_name,
        "licenseUrl": row["licenseUrl"],
        "canonicalArtist": row["canonicalArtist"],
        "canonicalTitle": row["canonicalTitle"],
        "albumTitle": row["albumTitle"],
        "durationSeconds": row["durationSeconds"],
        "tags": sorted(row["tags"]),
        "labelEvidence": "MTG-Jamendo exact genre---deephouse tag",
        "licenseEvidence": row["licenseEvidence"],
        "labelConfidence": "explicit-catalog-tag-conflict-filtered",
        "reviewStatus": "machine-audited-explicit-tag-and-license",
        "audioStoragePolicy": "external-local-audio; persist-features-only",
        "trainingEligible": True,
        "evaluationEligible": False,
        "productionEligible": True,
        "audioExists": row["audioExists"],
        "oofOverlap": row["oofOverlap"],
        "sourceFoldIsolation": "Exclude all Jamendo rows from the Jamendo outer fold",
    }


def render(report):
    summary = report["summary"]
    return "\n".join([
        "# MTG-Jamendo explicit Deep House audit", "",
        "This audit joins the official MTG-Jamendo genre tags, metadata, and per-track Creative Commons license table.",
        "Inference never uses title, artist, URL, or tags.", "",
        f"- Exact rights-safe candidates before caps: {summary['strictCandidatesBeforeCaps']}",
        f"- Selected after artist/album caps: {summary['selectedRows']}",
        f"- Audio already present: {summary['audioPresentRows']}",
        f"- New rows outside the fixed OOF: {summary['nonOofRows']}",
        f"- Training-ready rows outside the fixed OOF: {summary['trainingReadyNonOofRows']}",
        f"- Artists / albums: {summary['artists']} / {summary['albums']}", "",
        "## Limitation", "",
        "Jamendo is already an outer source family. These rows can train non-Jamendo folds but cannot improve the Jamendo-held-out fold by themselves.", "",
        "## Rejections", "",
        *[f"- {name}: {count}" for name, count in report["rejections"].items()], "",
    ])


def run(args):
    oof_keys = load_oof_keys(args.oof)
    candidates, selected, rejected = audit_rows(
        args.mtg_root, oof_keys, args.artist_cap, args.album_cap
    )
    items = [manifest_item(row) for row in selected]
    now = datetime.now(timezone.utc).isoformat()
    manifest = {
        "description": "Rights-safe MTG-Jamendo Deep House training overlay with exact tag and conflict filtering.",
        "generatedAt": now,
        "role": "candidate-training-overlay",
        "policy": {
            "allowedLicenses": ["CC-BY", "CC-BY-SA"],
            "requiredTag": "genre---deephouse",
            "conflictingFineTagsExcluded": sorted(CONFLICTING_FINE_TAGS),
            "maxPerArtist": args.artist_cap,
            "maxPerAlbum": args.album_cap,
            "metadataUsedAtInference": False,
            "audioStoredOutsideRepository": True,
            "matchingProviderExcludedFromOuterFold": True,
        },
        "items": items,
    }
    report = {
        "generatedAt": now,
        "summary": {
            "strictCandidatesBeforeCaps": len(candidates),
            "selectedRows": len(selected),
            "audioPresentRows": sum(row["audioExists"] for row in selected),
            "nonOofRows": sum(not row["oofOverlap"] for row in selected),
            "trainingReadyNonOofRows": sum(
                row["audioExists"] and not row["oofOverlap"] for row in selected
            ),
            "artists": len({row["artistId"] for row in selected}),
            "albums": len({row["albumId"] for row in selected}),
        },
        "rejections": dict(sorted(rejected.items())),
        "selectedTrackIds": [row["trackId"] for row in selected],
        "policy": manifest["policy"],
        "decision": "training-only-provider-aware-ablation",
    }
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.markdown.write_text(render(report))
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mtg-root", type=Path, default=DEFAULT_MTG_ROOT)
    parser.add_argument("--oof", type=Path, default=DEFAULT_OOF)
    parser.add_argument("--artist-cap", type=int, default=3)
    parser.add_argument("--album-cap", type=int, default=2)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    print(json.dumps(run(args), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
