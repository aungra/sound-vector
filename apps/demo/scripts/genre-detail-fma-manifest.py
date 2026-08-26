#!/usr/bin/env python3
import csv
import json
import os
import sys
from collections import Counter
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parents[2]
DEFAULT_CACHE = Path("/Volumes/20251005_12TBskyhawk/MUSICTee-cache")

DETAIL_BY_TOP_GENRE = {
    "Blues": "blues",
    "Classical": "classical",
    "Electronic": "electronic",
    "Folk": "folk",
    "Hip-Hop": "hip-hop",
    "Jazz": "jazz",
    "Rock": "rock",
}


def classify_license(value):
    text = str(value or "").strip().lower()
    if not text:
        return "verification-required", ""
    if "no deriv" in text or "noderiv" in text or "music sharing" in text:
        return "excluded-no-derivatives", "CC-BY-ND"
    if "noncommercial" in text or "non-commercial" in text:
        normalized = "CC-BY-NC-SA" if "share" in text else "CC-BY-NC"
        return "research-only", normalized
    if "cc0" in text:
        return "production-training", "CC0"
    if "public domain" in text:
        return "production-training", "Public Domain"
    if "attribution" in text and "share" in text:
        return "production-training", "CC-BY-SA"
    if "attribution" in text:
        return "production-training", "CC-BY"
    return "verification-required", ""


def audio_path(track_id, roots):
    padded = f"{int(track_id):06d}"
    relative = Path(padded[:3]) / f"{padded}.mp3"
    return next((root / relative for root in roots if (root / relative).exists()), None)


def generate(cache_root):
    fma_root = cache_root / "external-data" / "fma"
    tracks_path = fma_root / "fma_metadata" / "tracks.csv"
    audio_roots = [
        fma_root / "fma_large_selective",
        fma_root / "fma_medium_selective",
        fma_root / "fma_small",
    ]
    output_path = cache_root / "genre-training" / "detail-genre-fma-source-manifest.json"
    items = []
    with tracks_path.open(newline="", encoding="utf-8") as source:
        reader = csv.reader(source)
        group_headers = next(reader)
        field_headers = next(reader)
        next(reader)
        headers = [f"{group}.{field}" for group, field in zip(group_headers, field_headers)]
        for row in reader:
            data = dict(zip(headers, row))
            detail = DETAIL_BY_TOP_GENRE.get(data.get("track.genre_top"))
            if not detail:
                continue
            file_path = audio_path(row[0], audio_roots)
            if not file_path:
                continue
            usage, license_id = classify_license(data.get("track.license"))
            items.append({
                "datasetName": "FMA direct top-genre detail source",
                "trackId": str(int(row[0])),
                "split": data.get("set.split") or "unassigned",
                "detailLabels": [detail],
                "detailTarget": detail,
                "singleTargetEligible": True,
                "trainingUsage": usage,
                "filePath": str(file_path),
                "referenceUrl": f"https://freemusicarchive.org/track/{int(row[0])}",
                "license": license_id or data.get("track.license") or "",
                "licenseEvidence": data.get("track.license") or "",
                "canonicalArtist": data.get("artist.name") or "",
                "canonicalTitle": data.get("track.title") or "",
                "labelEvidence": f"FMA track.genre_top={data.get('track.genre_top')}",
                "contentScope": "full-track",
                "audioStoragePolicy": "external-cache-only",
            })
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps({"schemaVersion": 1, "items": items}, ensure_ascii=False, indent=2) + "\n")
    usage = Counter(item["trainingUsage"] for item in items)
    licenses = Counter(item["license"] for item in items)
    production = [item for item in items if item["trainingUsage"] == "production-training"]
    report = {
        "schemaVersion": 1,
        "dataset": "FMA direct top-genre detail source",
        "fullManifestPath": str(output_path),
        "audioStoragePolicy": "external-cache-only",
        "totalAudioCandidates": len(items),
        "usage": dict(usage),
        "licenses": dict(licenses),
        "productionTrainingRows": len(production),
        "productionDetailLabels": len(set(item["detailTarget"] for item in production)),
        "productionByDetail": dict(Counter(item["detailTarget"] for item in production)),
        "productionBySplit": dict(Counter(item["split"] for item in production)),
        "labelPolicy": "Only exact FMA track.genre_top labels represented in the 120-detail vocabulary.",
        "licensePolicy": "Production allows CC0/Public Domain/CC-BY/CC-BY-SA; NC is research-only; ND is excluded.",
        "promotionPolicy": "Candidate only until source-heldout ablation passes."
    }
    report_path = ROOT / "genre-training" / "detail-genre-fma-source-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


def self_test():
    assert classify_license("Attribution 4.0") == ("production-training", "CC-BY")
    assert classify_license("Attribution-ShareAlike") == ("production-training", "CC-BY-SA")
    assert classify_license("Attribution-NonCommercial-ShareAlike")[0] == "research-only"
    assert classify_license("Attribution-NonCommercial-NoDerivatives")[0] == "excluded-no-derivatives"
    assert classify_license("Music Sharing")[0] == "excluded-no-derivatives"
    print("FMA detail license policy self-test passed")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
    else:
        cache_root = Path(os.environ.get("MMFR_CACHE_ROOT", DEFAULT_CACHE)).resolve()
        print(json.dumps(generate(cache_root), ensure_ascii=False, indent=2))
