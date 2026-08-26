import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const CACHE_ROOT = "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training";

const USAF_JAZZ = [
  "106963080", "106963103", "106963127", "106963152",
  "107441190", "107441373", "107441374", "107441375", "107441378", "107441379",
  "107441382", "107441384", "107441386", "107441390",
  "106984828", "106984829", "106984831", "106984833", "106984834",
  "106984838", "106984841", "106984844", "106984845", "106984849"
];

export const REVIEWED_ITEMS = Object.freeze(Object.fromEntries([
  ...USAF_JAZZ.map(trackId => [trackId, {
    detailTarget: "jazz",
    sourceFamily: "US Air Force recordings",
    note: "USAF-recorded complete jazz performance; exact Commons jazz category and Public Domain metadata verified."
  }]),
  ...["52796564", "52796565", "52796567", "52796573", "52796577"].map(trackId => [trackId, {
    detailTarget: "house",
    sourceFamily: "Luis Gabriel Aguilera creator-supplied recordings",
    note: "Complete creator-supplied track; exact Commons house category and CC-BY-SA metadata verified."
  }]),
  ...["31819204", "33116374", "37597581"].map(trackId => [trackId, {
    detailTarget: "house",
    sourceFamily: "Audiotool",
    note: "Complete Audiotool track with reviewed external-source license and exact Commons house category."
  }]),
  ["34653577", {
    detailTarget: "tech-house", sourceFamily: "Audiotool",
    note: "Complete Audiotool track explicitly categorized as Tech house with reviewed external-source license."
  }],
  ...["40317481", "40317889"].map(trackId => [trackId, {
    detailTarget: "progressive-house",
    sourceFamily: "Audiotool",
    note: "Complete Audiotool track explicitly categorized as Progressive house with reviewed external-source license."
  }])
]));

export function reviewedItems(candidates) {
  return candidates.flatMap(item => {
    const review = REVIEWED_ITEMS[String(item.trackId || "")];
    if (!review) return [];
    return [{
      ...item,
      sourceFamily: review.sourceFamily,
      detailTarget: review.detailTarget,
      detailLabels: [review.detailTarget],
      split: "test",
      needsReview: false,
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
  const candidatePath = path.resolve(process.env.MMFR_WIKIMEDIA_CATEGORY_OUTPUT || path.join(CACHE_ROOT, "detail-genre-wikimedia-category-candidates.json"));
  const outputPath = path.resolve(process.env.MMFR_WIKIMEDIA_CATEGORY_REVIEWED || path.join(CACHE_ROOT, "detail-genre-wikimedia-category-reviewed-manifest.json"));
  const candidates = JSON.parse(fs.readFileSync(candidatePath, "utf8")).items || [];
  const items = reviewedItems(candidates);
  const report = {
    schemaVersion: 1,
    reviewedAt: "2026-08-27",
    candidateRows: candidates.length,
    reviewedRows: items.length,
    byDetail: countsBy(items, "detailTarget"),
    byOrigin: countsBy(items, "sourceFamily"),
    byLicense: countsBy(items, "license"),
    safeguards: [
      "All USAF ensembles are one source family; ensemble names do not inflate independent-source counts.",
      "Wikimedia is only the distributor and is not counted as a separate source.",
      "Holiday arrangements, ambiguous historic recordings, exercises, research audio and mixed-genre rows remain excluded.",
      "Audiotool subgenres use their explicit Tech house or Progressive house category rather than generic House."
    ],
    promotionPolicy: "Reviewed download candidates only; origin-heldout ablation is required before production training."
  };
  fs.writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 1, items }, null, 2)}\n`);
  fs.writeFileSync(path.join(ROOT, "genre-training/detail-genre-wikimedia-category-review-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
