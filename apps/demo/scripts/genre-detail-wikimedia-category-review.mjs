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

const KEVIN_MACLEOD_CHIPTUNE = [
  "64731654", "64731841", "64731871", "64733440", "64733816", "64734903",
  "64736900", "64736915", "64736948", "64737431", "64739119"
];
const DROZERIX_CHIPTUNE = ["35271561", "41302890", "41303200", "41304185", "41304664", "41305064"];
const ANTTI_LUODE_CHIPTUNE = ["84701671", "84701677", "84701778", "84702831"];
const AUDIOTOOL_DNB = ["24418750", "25682671", "28358474", "30473222", "32827647", "33739140", "34203052"];
const DWS_CHORALE = ["2690354", "2694518", "2694522", "2694526", "2694533", "2694535", "2694538"];
const ENSEMBLE_MORALES_CHORAL = ["62008861", "62008862", "62008863", "62008865", "62008866"];
const TRINITY_CHURCH_CHORAL = ["61955359", "61956160", "61956161"];
const MIKE_HAYES_CHORAL = ["43246978", "43447354", "43694224"];
const PETITS_CHANTEURS_PASSY = ["18047221", "18047222", "18047225"];
const SCHUMANN_HEINK_OPERA = ["15933691", "15933693", "15933822"];

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
  }]),
  ...KEVIN_MACLEOD_CHIPTUNE.map(trackId => [trackId, {
    detailTarget: "chiptune", sourceFamily: "Kevin MacLeod creator recordings",
    note: "Complete CC-BY track by Kevin MacLeod in the exact Commons chiptune category."
  }]),
  ...DROZERIX_CHIPTUNE.map(trackId => [trackId, {
    detailTarget: "chiptune", sourceFamily: "Drozerix creator recordings",
    note: "Complete CC0 or Public Domain track by Drozerix in the exact Commons chiptune category."
  }]),
  ...ANTTI_LUODE_CHIPTUNE.map(trackId => [trackId, {
    detailTarget: "chiptune", sourceFamily: "Antti Luode creator recordings",
    note: "Complete CC-BY track by Antti Luode in the exact Commons chiptune category."
  }]),
  ...AUDIOTOOL_DNB.map(trackId => [trackId, {
    detailTarget: "drum-and-bass", sourceFamily: "Audiotool",
    note: "Complete Audiotool track with an exact Commons drum and bass category and CC-BY-SA metadata."
  }]),
  ...DWS_CHORALE.map(trackId => [trackId, {
    detailTarget: "choral", sourceFamily: "dwsChorale creator recordings",
    note: "Complete dwsChorale performance in the exact Commons choral category with CC-BY-SA metadata."
  }]),
  ...ENSEMBLE_MORALES_CHORAL.map(trackId => [trackId, {
    detailTarget: "choral", sourceFamily: "Ensemble Morales recordings",
    note: "Complete Ensemble Morales mass movement in the exact Commons choral category with CC-BY metadata."
  }]),
  ...TRINITY_CHURCH_CHORAL.map(trackId => [trackId, {
    detailTarget: "choral", sourceFamily: "Trinity Church Boston recordings",
    note: "Complete Trinity Church Boston choral performance in the exact Commons choral category with CC-BY metadata."
  }]),
  ...MIKE_HAYES_CHORAL.map(trackId => [trackId, {
    detailTarget: "choral", sourceFamily: "Mike Hayes choral recordings",
    note: "Complete creator-supplied choral performance in the exact Commons choral category with CC-BY-SA metadata."
  }]),
  ...PETITS_CHANTEURS_PASSY.map(trackId => [trackId, {
    detailTarget: "choral", sourceFamily: "Les Petits Chanteurs de Passy recordings",
    note: "Complete choir performance in the exact Commons choral category with CC-BY-SA metadata."
  }]),
  ...SCHUMANN_HEINK_OPERA.map(trackId => [trackId, {
    detailTarget: "opera", sourceFamily: "Ernestine Schumann-Heink historic recordings",
    note: "Public Domain historic operatic solo recording in the exact Commons opera category."
  }]),
  ...[
    ["7659299", "Jeanette Ekornaasvaag recording"],
    ["10262332", "Feodor Chaliapin historic recording"],
    ["18355621", "CTMusic2012 opera recording"],
    ["22327272", "Andreas Dippel historic recording"],
    ["92424432", "Alexander Pirogov historic recording"]
  ].map(([trackId, sourceFamily]) => [trackId, {
    detailTarget: "opera", sourceFamily,
    note: "Complete operatic vocal performance in the exact Commons opera category with production-safe rights metadata."
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
  const supplementalPath = path.resolve(process.env.MMFR_WIKIMEDIA_CATEGORY_SUPPLEMENTAL || path.join(CACHE_ROOT, "detail-genre-wikimedia-electronic-category-candidates.json"));
  const additionalPaths = String(process.env.MMFR_WIKIMEDIA_CATEGORY_ADDITIONAL || "")
    .split(",").map(value => value.trim()).filter(Boolean).map(value => path.resolve(value));
  const outputPath = path.resolve(process.env.MMFR_WIKIMEDIA_CATEGORY_REVIEWED || path.join(CACHE_ROOT, "detail-genre-wikimedia-category-reviewed-manifest.json"));
  const candidatePaths = [...new Set([candidatePath, supplementalPath, ...additionalPaths])].filter(filePath => fs.existsSync(filePath));
  const candidates = [...new Map(candidatePaths.flatMap(filePath =>
    (JSON.parse(fs.readFileSync(filePath, "utf8")).items || []).map(item => [String(item.trackId), item])
  )).values()];
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
      "Each creator catalog is one origin family; multiple tracks by the same creator never inflate source counts.",
      "Holiday arrangements, ambiguous historic recordings, exercises, research audio and mixed-genre rows remain excluded.",
      "Audiotool subgenres use their explicit Tech house or Progressive house category rather than generic House."
      ,"Opera and choral recordings are grouped by performer or recording origin; Commons distribution does not merge them into one source."
    ],
    promotionPolicy: "Reviewed download candidates only; origin-heldout ablation is required before production training."
  };
  fs.writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 1, items }, null, 2)}\n`);
  fs.writeFileSync(path.join(ROOT, "genre-training/detail-genre-wikimedia-category-review-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
