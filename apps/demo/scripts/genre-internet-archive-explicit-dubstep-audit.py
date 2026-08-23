#!/usr/bin/env python3
"""Acquire reviewed CC Internet Archive works explicitly tagged Dubstep."""

from __future__ import annotations

import argparse
import importlib.util
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
TRAINING = ROOT / "genre-training"
HELPER_PATH = Path(__file__).with_name("genre-internet-archive-explicit-noise-audit.py")
DEFAULT_OUTPUT = TRAINING / "internet-archive-explicit-dubstep-v1-cc-source-manifest.json"
DEFAULT_REPORT = TRAINING / "internet-archive-explicit-dubstep-v1-audit-report.json"
DEFAULT_AUDIO_DIR = Path(
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/"
    "internet-archive-explicit-dubstep-v1"
)
SELECTIONS = (
    ("Eoto2010-09-17BellvueCo.Mishwaka", "eoto100917d1_01_Akawahsim.mp3"),
    ("gt459AnchoreState-ChangesOfLifeEp", "1.ItsNotAToy.mp3"),
    ("rz098", "03_Malevolent_-_Intermittent_Pulse.mp3"),
    ("rz109", "01_Di-Bit_-_Flare_Chaff.mp3"),
    ("onmp225", "02_Boktor_Dead_ball_situation.mp3"),
    ("rz089", "01_-_M.A.R.K_and_POLICAy_-_Therapy.mp3"),
    ("ArcuIris", "Arcu Iris.mp3"),
    ("rz069", "03_Mechant_-_Le_Dub_Mai.mp3"),
    ("EE030-entero", "01. Vía Entero.mp3"),
    ("flembazindigo", "01 - Welcome to The Internet, I'll Be Your Guide.mp3"),
)


def load_helper():
    spec = importlib.util.spec_from_file_location("ia_explicit_genre_helper", HELPER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run(args):
    helper = load_helper()
    items = []
    audit_rows = []
    for identifier, file_name in SELECTIONS:
        payload = helper.get_json(f"https://archive.org/metadata/{identifier}")
        metadata = payload.get("metadata") or {}
        subjects = helper.normalized_subjects(metadata.get("subject"))
        if "dubstep" not in subjects:
            raise ValueError(f"{identifier} lacks an exact Dubstep subject: {subjects}")
        license_url = str(metadata.get("licenseurl") or "")
        license_value = helper.license_name(license_url)
        if not license_value:
            raise ValueError(f"{identifier} has an unsupported license: {license_url}")
        file_row = next(
            (row for row in payload.get("files") or [] if row.get("name") == file_name),
            None,
        )
        if not file_row or not file_row.get("md5"):
            raise ValueError(f"{identifier} is missing reviewed audio file {file_name}")
        audio_url = helper.download_url(identifier, file_name)
        local_path = args.audio_dir / helper.safe_name(identifier, file_name)
        acquisition = "metadata-only"
        if args.download:
            acquisition = helper.download(audio_url, local_path, str(file_row["md5"]))
        creator = file_row.get("artist") or metadata.get("creator") or "Unknown"
        if isinstance(creator, list):
            creator = "; ".join(map(str, creator))
        duration = file_row.get("length") or 0
        try:
            duration = float(str(duration).split(":")[-1]) if ":" not in str(duration) else 0.0
        except (TypeError, ValueError):
            duration = 0.0
        items.append({
            "source": "Internet Archive",
            "sourceType": "cc-dataset",
            "datasetName": "Internet Archive explicit Dubstep v1",
            "trackId": f"{identifier}:{file_name}",
            "workId": identifier,
            "genre": "ダブステップ",
            "macroGenre": "electronic",
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
            "canonicalTitle": str(file_row.get("title") or metadata.get("title") or identifier),
            "durationSeconds": duration,
            "expectedMd5": str(file_row["md5"]),
            "expectedBytes": int(file_row.get("size") or 0),
            "itemLabelEvidence": "Internet Archive subject contains the exact token Dubstep.",
            "trackLabelEvidence": "One reviewed audio file selected from the explicitly tagged work.",
            "reviewStatus": "item-level-explicit-approved",
        })
        audit_rows.append({
            "identifier": identifier, "fileName": file_name,
            "subjects": subjects, "license": license_value,
            "licenseUrl": license_url, "acquisition": acquisition,
            "localAudioPresent": local_path.is_file(),
        })
    creators = [row["canonicalArtist"] for row in items]
    if "Unknown" in creators or len(set(creators)) != len(creators):
        raise ValueError(f"creators must be known and distinct: {Counter(creators)}")
    manifest = {
        "description": "Training-only independent Dubstep overlay with exact Internet Archive item labels and explicit CC licenses.",
        "role": "candidate-training-overlay",
        "policy": {
            "allowedLicenses": ["CC0", "CC-BY", "CC-BY-SA"],
            "labelRequirement": "Exact Dubstep token in Internet Archive item subject.",
            "oneTrackPerArchiveItem": True,
            "metadataUsedAtInference": False,
            "audioStoredOutsideRepository": True,
            "evaluationEligible": False,
            "productionEligible": False,
        },
        "items": items,
    }
    report = {
        "objective": "Add an independent explicit-label Dubstep provider for source-heldout boundary training.",
        "selectedWorks": len(items),
        "distinctCreators": len(set(creators)),
        "licenses": dict(Counter(row["license"] for row in items)),
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
    print(json.dumps(run(args), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
