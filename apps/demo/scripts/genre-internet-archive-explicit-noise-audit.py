#!/usr/bin/env python3
"""Acquire reviewed CC Internet Archive works explicitly tagged Noise."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
DEFAULT_OUTPUT = TRAINING / "internet-archive-explicit-noise-v1-cc-source-manifest.json"
DEFAULT_REPORT = TRAINING / "internet-archive-explicit-noise-v1-audit-report.json"
DEFAULT_AUDIO_DIR = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/"
    "internet-archive-explicit-noise-v1"
)
SELECTIONS = (
    ("Stigmancy", "01_Stigmancy.ogg"),
    ("analogvsratioi", "Analog Vs - Ratio I - ConneXtT.ogg"),
    ("fnq-adlm", "CH=gcrt~.mp3"),
    (
        "SPNet064-nuoh-nuohshandsinflataffectsguts",
        "Spnet064-Nuoh-NuohsHandsInFlatAffectsGuts-01-DoYouLikeItNow.ogg",
    ),
    ("expensiveequipmentcheaprecording_201501", "01 - Discovery.ogg"),
    ("thunderverbolt11-10-10", "thunderverbolt11-10-10.ogg"),
    ("SleepDeprivationRevisited", "01_stage1_64kb.mp3"),
    (
        "drugvomitsoundvomit",
        "drugvomit - Soundvomit (compilation) - 02 sss-(((O)))-⁑- (long distance etc.).mp3",
    ),
    ("acidct_001", "02_track_02.ogg"),
    ("JVidlehands", "idlehands_64kb.mp3"),
)
LICENSE_PATTERNS = (
    (re.compile(r"creativecommons\.org/licenses/by-sa/", re.I), "CC-BY-SA"),
    (re.compile(r"creativecommons\.org/licenses/by/", re.I), "CC-BY"),
    (re.compile(r"creativecommons\.org/publicdomain/zero/", re.I), "CC0"),
)


def get_json(url):
    request = urllib.request.Request(
        url, headers={"User-Agent": "MUSICtee explicit CC genre audit"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def normalized_subjects(value):
    if isinstance(value, list):
        values = value
    else:
        values = re.split(r"[;,]", str(value or ""))
    return [re.sub(r"\s+", " ", str(item)).strip().lower() for item in values]


def license_name(url):
    for pattern, name in LICENSE_PATTERNS:
        if pattern.search(str(url or "")):
            return name
    return ""


def download_url(identifier, file_name):
    encoded_name = "/".join(
        urllib.parse.quote(part, safe="") for part in file_name.split("/")
    )
    return f"https://archive.org/download/{urllib.parse.quote(identifier, safe='')}/{encoded_name}"


def safe_name(identifier, file_name):
    suffix = Path(file_name).suffix.lower() or ".audio"
    return re.sub(r"[^A-Za-z0-9._-]+", "-", identifier).strip("-") + suffix


def download(url, output, expected_md5):
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.is_file():
        actual = hashlib.md5(output.read_bytes()).hexdigest()
        if actual == expected_md5:
            return "checksum-cache-hit"
    temporary = output.with_suffix(output.suffix + ".part")
    request = urllib.request.Request(
        url, headers={"User-Agent": "MUSICtee CC training data downloader"},
    )
    digest = hashlib.md5()
    with urllib.request.urlopen(request, timeout=180) as response, temporary.open("wb") as handle:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            handle.write(chunk)
    actual = digest.hexdigest()
    if actual != expected_md5:
        temporary.unlink(missing_ok=True)
        raise ValueError(f"MD5 mismatch for {url}: {actual} != {expected_md5}")
    os.replace(temporary, output)
    return "downloaded-and-verified"


def run(args):
    items = []
    audit_rows = []
    for identifier, file_name in SELECTIONS:
        payload = get_json(f"https://archive.org/metadata/{identifier}")
        metadata = payload.get("metadata") or {}
        subjects = normalized_subjects(metadata.get("subject"))
        if "noise" not in subjects and "noise music" not in subjects:
            raise ValueError(f"{identifier} lacks an exact Noise subject: {subjects}")
        license_url = str(metadata.get("licenseurl") or "")
        license_value = license_name(license_url)
        if not license_value:
            raise ValueError(f"{identifier} has an unsupported license: {license_url}")
        file_row = next(
            (row for row in payload.get("files") or [] if row.get("name") == file_name),
            None,
        )
        if not file_row or not file_row.get("md5"):
            raise ValueError(f"{identifier} is missing reviewed audio file {file_name}")
        audio_url = download_url(identifier, file_name)
        local_path = args.audio_dir / safe_name(identifier, file_name)
        acquisition = "metadata-only"
        if args.download:
            acquisition = download(audio_url, local_path, str(file_row["md5"]))
        creator = metadata.get("creator") or "Unknown"
        if isinstance(creator, list):
            creator = "; ".join(map(str, creator))
        duration = file_row.get("length") or 0
        try:
            duration = float(duration)
        except (TypeError, ValueError):
            duration = 0.0
        row = {
            "source": "Internet Archive",
            "sourceType": "cc-dataset",
            "datasetName": "Internet Archive explicit Noise v1",
            "trackId": f"{identifier}:{file_name}",
            "workId": identifier,
            "genre": "ノイズミュージック",
            "macroGenre": "ambient",
            "trainingRole": "fine",
            "trainingEligible": True,
            "evaluationEligible": False,
            "productionEligible": False,
            "filePath": str(local_path),
            "sourceUrl": str(local_path),
            "candidateAudioUrl": audio_url,
            "referenceUrl": f"https://archive.org/details/{identifier}",
            "license": license_value,
            "licenseUrl": license_url,
            "canonicalArtist": str(creator),
            "canonicalTitle": str(metadata.get("title") or identifier),
            "durationSeconds": duration,
            "expectedMd5": str(file_row["md5"]),
            "expectedBytes": int(file_row.get("size") or 0),
            "itemLabelEvidence": "Internet Archive subject contains the exact token Noise.",
            "trackLabelEvidence": "One reviewed audio file selected from the explicitly tagged work.",
            "reviewStatus": "item-level-explicit-approved",
        }
        items.append(row)
        audit_rows.append({
            "identifier": identifier, "fileName": file_name,
            "subjects": subjects, "license": license_value,
            "licenseUrl": license_url, "acquisition": acquisition,
            "localAudioPresent": local_path.is_file(),
        })
    manifest = {
        "description": "Training-only independent Noise overlay with exact Internet Archive item labels and explicit CC licenses.",
        "role": "candidate-training-overlay",
        "policy": {
            "allowedLicenses": ["CC0", "CC-BY", "CC-BY-SA"],
            "labelRequirement": "Exact Noise or Noise Music token in Internet Archive item subject.",
            "oneTrackPerArchiveItem": True,
            "metadataUsedAtInference": False,
            "audioStoredOutsideRepository": True,
            "evaluationEligible": False,
            "productionEligible": False,
        },
        "items": items,
    }
    report = {
        "objective": "Add an independent explicit-label Noise provider for source-heldout boundary training.",
        "selectedWorks": len(items),
        "distinctCreators": len({row["canonicalArtist"] for row in items}),
        "licenses": {name: sum(row["license"] == name for row in items) for name in ("CC0", "CC-BY", "CC-BY-SA")},
        "audioDownloaded": bool(args.download),
        "rows": audit_rows,
        "decision": "ready-for-feature-extraction" if args.download else "metadata-audit-passed",
    }
    args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--audio-dir", type=Path, default=DEFAULT_AUDIO_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    report = run(args)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
