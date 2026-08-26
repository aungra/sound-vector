import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const CACHE_ROOT = "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training";

export const REVIEWED_RELEASES = Object.freeze({
  alg033: { detailTarget: "soul", files: "all", note: "Official alg-a netlabel release; subject and release text identify original songs as soul." },
  "Wuerfel28-DLIKDH-Es_ist_schwer": { detailTarget: "metal", files: "all", note: "Official label uploader; release subject is metal and item license is CC-BY-SA 4.0." },
  "visionary-worlds-feelings": { detailTarget: "progressive-trance", files: "all", note: "Official USC release page and description identify progressive/uplifting trance." },
  SSTAR11: { detailTarget: "psytrance", files: "all", note: "Official Sun Station release description identifies psychedelic trance." },
  SSTAR12: { detailTarget: "psytrance", files: "all", note: "Official Sun Station release with psytrance subject and permissive item license." },
  SSTAR17: { detailTarget: "psytrance", files: "all", note: "Official Sun Station release with psytrance subject and permissive item license." },
  va_space_inhabitant_psydg010a: { detailTarget: "psytrance", files: "all", note: "Psy-Dance-Global compilation explicitly labeled psytrance and CC0." },
  tou245: { detailTarget: "trance", files: ["tou245a.mp3", "tou245c.mp3"], note: "Official Toucan release; the chillout remix tou245b is excluded." },
  tou251: { detailTarget: "trance", files: ["tou251a.mp3", "tou251b.mp3"], note: "Official Toucan release; the downtempo chillout remix tou251c is excluded." },
  tou265: { detailTarget: "trance", files: "all", note: "Official Toucan release description identifies both full-length tracks as trance." }
});

function fileName(item) {
  return decodeURIComponent(new URL(item.downloadUrl).pathname.split("/").pop());
}

export function reviewedItems(candidates) {
  return candidates.flatMap(item => {
    const review = REVIEWED_RELEASES[item.workGroup];
    if (!review || item.detailTarget !== review.detailTarget) return [];
    if (review.files !== "all" && !review.files.includes(fileName(item))) return [];
    return [{
      ...item,
      split: "test",
      rightsVerifiedAt: "2026-08-27",
      manualReviewNote: review.note,
      audioStoragePolicy: "external-cache-only after reviewed download"
    }];
  });
}

function countsBy(items, key) {
  const counts = {};
  for (const item of items) counts[item[key]] = (counts[item[key]] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function main() {
  const candidatePath = path.resolve(process.env.MMFR_IA_CANDIDATE_MANIFEST || path.join(CACHE_ROOT, "detail-genre-internet-archive-candidate-manifest.json"));
  const outputPath = path.resolve(process.env.MMFR_IA_REVIEWED_MANIFEST || path.join(CACHE_ROOT, "detail-genre-internet-archive-reviewed-manifest.json"));
  const candidates = JSON.parse(fs.readFileSync(candidatePath, "utf8")).items || [];
  const items = reviewedItems(candidates);
  const report = {
    schemaVersion: 1,
    reviewedAt: "2026-08-27",
    candidateRows: candidates.length,
    reviewedRows: items.length,
    reviewedReleases: new Set(items.map(item => item.workGroup)).size,
    representedDetailLabels: Object.keys(countsBy(items, "detailTarget")).length,
    representedOriginFamilies: Object.keys(countsBy(items, "sourceFamily")).length,
    byDetail: countsBy(items, "detailTarget"),
    byOrigin: countsBy(items, "sourceFamily"),
    byLicense: countsBy(items, "license"),
    excludedExamples: {
      jazzLoops: "Description identifies Sound Collage rather than Jazz.",
      parodySoul: "Multiple Soul/R&B/experimental/parody labels.",
      mixedDeepHouse: "Releases also identify Tech House, Hip House, chiptune or DJ-mix material.",
      restrictedConflict: "Description-level NC or ND overrides permissive item metadata.",
      chilloutRemixes: "Two Toucan chillout/downtempo remix files are excluded at track level."
    },
    promotionPolicy: "Reviewed download candidates only; source-heldout ablation is required before production model training."
  };
  fs.writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 1, items }, null, 2)}\n`);
  fs.writeFileSync(path.join(ROOT, "genre-training/detail-genre-internet-archive-review-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
