import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { effectiveTrainingUsage, TRAINING_USAGE } from "./genre-training-license-policy.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_CACHE = "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training";

// Verified against the Wikimedia Commons API on 2026-08-27. The origin is
// retained because a mirror is not an independent source by itself.
export const REVIEWED_ITEMS = Object.freeze({
  "39113258": { detailTarget: "drone", originFamily: "Audiotool", requiredCategory: "Drone (musical genre)" },
  "33988659": { detailTarget: "minimal-techno", originFamily: "Audiotool", requiredCategory: "Minimal techno" },
  "33989379": { detailTarget: "minimal-techno", originFamily: "Audiotool", requiredCategory: "Minimal techno" },
  "21379676": { detailTarget: "techno", originFamily: "Wikimedia self-published", requiredCategory: "Techno" },
  "64254904": { detailTarget: "acid-techno", originFamily: "SoundCloud", requiredCategory: "Techno" },
  "194649798": { detailTarget: "minimal-techno", originFamily: "Wikimedia self-published", requiredCategory: "Minimal techno" },
  "386682": { detailTarget: "drum-and-bass", originFamily: "Internet Archive", requiredCategory: "Audio files of drum and bass" },
  "48805253": { detailTarget: "drum-and-bass", originFamily: "SoundCloud", requiredCategory: "Audio files of drum and bass" },
  "166712915": { detailTarget: "drum-and-bass", originFamily: "Bandcamp via Internet Archive", requiredCategory: "Audio files of drum and bass" },
  "166714563": { detailTarget: "drum-and-bass", originFamily: "Bandcamp via Internet Archive", requiredCategory: "Audio files of drum and bass" }
});

function countsBy(items, key) {
  const counts = {};
  for (const item of items) counts[item[key]] = (counts[item[key]] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

export function buildWikimediaIndependentManifest(rows, fileExists = fs.existsSync) {
  return rows.flatMap(row => {
    const review = REVIEWED_ITEMS[String(row.trackId || "")];
    if (!review || row.audioOk !== true || !fileExists(row.filePath || "")) return [];
    const rights = effectiveTrainingUsage({ ...row, contentScope: "full-track" });
    if (rights.usage !== TRAINING_USAGE.PRODUCTION) return [];
    return [{
      datasetName: "Wikimedia Commons reviewed genre audio",
      sourceFamily: review.originFamily,
      distributionSource: "Wikimedia Commons",
      trackId: String(row.trackId),
      split: "test",
      detailLabels: [review.detailTarget],
      detailTarget: review.detailTarget,
      singleTargetEligible: true,
      filePath: row.filePath,
      referenceUrl: row.referenceUrl,
      license: row.license,
      licenseUrl: row.licenseUrl,
      canonicalArtist: row.canonicalArtist || "",
      canonicalTitle: row.canonicalTitle || "",
      labelEvidence: `Wikimedia Commons category: ${review.requiredCategory}`,
      rightsEvidence: "Wikimedia Commons API imageinfo.extmetadata",
      rightsVerifiedAt: "2026-08-27",
      contentScope: "full-track",
      audioStoragePolicy: "external-cache-only"
    }];
  });
}

function main() {
  const cacheRoot = path.resolve(process.env.MMFR_GENRE_CACHE_DIR || DEFAULT_CACHE);
  const verifiedPath = path.join(ROOT, "genre-training/verified-dataset.json");
  const outputPath = path.resolve(process.env.MMFR_WIKIMEDIA_DETAIL_MANIFEST_OUTPUT || path.join(cacheRoot, "detail-genre-wikimedia-source-manifest.json"));
  const source = JSON.parse(fs.readFileSync(verifiedPath, "utf8"));
  const items = buildWikimediaIndependentManifest(source.items || source.tracks || []);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dataset: "Wikimedia Commons reviewed genre audio",
    fullManifestPath: outputPath,
    candidates: items.length,
    representedDetailLabels: Object.keys(countsBy(items, "detailTarget")).length,
    representedOriginFamilies: Object.keys(countsBy(items, "sourceFamily")).length,
    byDetail: countsBy(items, "detailTarget"),
    byOriginFamily: countsBy(items, "sourceFamily"),
    byLicense: countsBy(items, "license"),
    exclusions: [
      "FMA mirrors are excluded from independent-source counts.",
      "License-review-needed files are excluded even when their displayed license is permissive.",
      "Files with ambiguous or multiple genre evidence are excluded from single-target evaluation.",
      "Wikimedia is recorded as the distributor; the original publication family defines source independence."
    ],
    promotionPolicy: "Evaluation candidate only. Promote after origin-heldout ablation."
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 1, items }, null, 2)}\n`);
  fs.writeFileSync(path.join(ROOT, "genre-training/detail-genre-wikimedia-source-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
