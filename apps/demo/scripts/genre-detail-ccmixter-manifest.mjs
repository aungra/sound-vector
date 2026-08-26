import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { effectiveTrainingUsage, TRAINING_USAGE } from "./genre-training-license-policy.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_OUTPUT = "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/detail-genre-ccmixter-candidate-manifest.json";
const execFileAsync = promisify(execFile);

export const TAG_TO_DETAIL = Object.freeze({
  ambient: "ambient", blues: "blues", jazz: "jazz", bebop: "bebop", free_jazz: "free-jazz",
  folk: "folk", electronic: "electronic", idm: "idm", techno: "techno", minimal_techno: "minimal-techno",
  acid_techno: "acid-techno", house: "house", deep_house: "deep-house", trance: "trance", funk: "funk",
  disco: "disco", soul: "soul", rnb: "r-and-b", drum_and_bass: "drum-and-bass", dnb: "drum-and-bass",
  dubstep: "dubstep", hip_hop: "hip-hop", hiphop: "hip-hop", reggae: "reggae", dub: "dub",
  rock: "rock", punk: "punk", metal: "metal", classical: "classical", noise: "noise"
});

const QUERY_TAGS = Object.keys(TAG_TO_DETAIL);

function parseDuration(value) {
  const cells = String(value || "").split(":").map(Number);
  if (cells.some(value => !Number.isFinite(value))) return 0;
  return cells.reduce((total, value) => total * 60 + value, 0);
}

function licenseFromUrl(value) {
  const url = String(value || "").toLowerCase();
  if (/by-nc-sa/.test(url)) return "CC-BY-NC-SA";
  if (/by-nc-nd/.test(url)) return "CC-BY-NC-ND";
  if (/by-nc/.test(url)) return "CC-BY-NC";
  if (/by-nd/.test(url)) return "CC-BY-ND";
  if (/by-sa/.test(url)) return "CC-BY-SA";
  if (/\/by\//.test(url)) return "CC-BY";
  if (/zero|cc0/.test(url)) return "CC0";
  return "Creative Commons";
}

function resolveDetails(tags) {
  const details = new Set(tags.map(tag => TAG_TO_DETAIL[tag]).filter(Boolean));
  for (const [specific, parent] of [["minimal-techno", "techno"], ["acid-techno", "techno"], ["deep-house", "house"]]) {
    if (details.has(specific)) details.delete(parent);
  }
  return [...details].sort();
}

function fullMixFile(record) {
  return (record.files || []).find(file => {
    const info = file.file_format_info || {};
    return info["media-type"] === "audio" && !file.file_extra?.type && parseDuration(info.ps) >= 90;
  });
}

export function buildCcmixterCandidates(records) {
  const byId = new Map();
  for (const record of records) byId.set(String(record.upload_id), record);
  const items = [];
  for (const record of byId.values()) {
    const tags = String(record.upload_extra?.usertags || "").toLowerCase().split(",").map(tag => tag.trim()).filter(Boolean);
    const uploadKinds = String(record.upload_extra?.ccud || "").toLowerCase().split(",").map(tag => tag.trim()).filter(Boolean);
    const detailLabels = resolveDetails(tags);
    const file = fullMixFile(record);
    const license = licenseFromUrl(record.license_url);
    const rights = effectiveTrainingUsage({ license, contentScope: "full-track" });
    if (detailLabels.length !== 1 || !file || rights.usage !== TRAINING_USAGE.PRODUCTION || uploadKinds.includes("acappella")) continue;
    items.push({
      datasetName: "ccMixter uploader-tagged music",
      sourceFamily: "ccMixter",
      trackId: String(record.upload_id),
      detailLabels,
      detailTarget: detailLabels[0],
      singleTargetEligible: true,
      split: "unassigned",
      downloadUrl: file.download_url,
      referenceUrl: record.file_page_url,
      license,
      licenseUrl: record.license_url,
      canonicalArtist: record.user_real_name || record.user_name || "",
      canonicalTitle: record.upload_name || "",
      workGroup: record.user_name || "",
      duration: parseDuration(file.file_format_info?.ps),
      uploadKinds,
      labelEvidence: `Uploader tag: ${tags.filter(tag => TAG_TO_DETAIL[tag]).join(",")}`,
      rightsEvidence: "ccMixter item API license_url",
      rightsReferenceUrl: "https://ccmixter.org/terms",
      contentScope: "full-track",
      audioStoragePolicy: "candidate-metadata-only; download to external cache after review"
    });
  }
  return items.sort((a, b) => a.detailTarget.localeCompare(b.detailTarget) || a.trackId.localeCompare(b.trackId));
}

function countsBy(items, key) {
  const counts = {};
  for (const item of items) counts[item[key]] = (counts[item[key]] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

async function fetchJson(url) {
  // ccMixter occasionally emits headers that exceed Node's HTTP parser limit.
  // curl is already a project dependency and handles this legacy API reliably.
  const { stdout } = await execFileAsync("curl", ["-fsS", String(url)], { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function main() {
  const records = [];
  const failedTags = [];
  const batches = await Promise.all(QUERY_TAGS.map(async tag => {
    const url = new URL("https://ccmixter.org/api/query");
    url.search = new URLSearchParams({ datasource: "uploads", tags: tag, f: "json", limit: "10" });
    try { return await fetchJson(url); } catch (error) {
      failedTags.push({ tag, error: error.message });
      return [];
    }
  }));
  records.push(...batches.flat());
  const items = buildCcmixterCandidates(records);
  const outputPath = path.resolve(process.env.MMFR_CCMIXTER_DETAIL_MANIFEST_OUTPUT || DEFAULT_OUTPUT);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dataset: "ccMixter uploader-tagged music",
    queriedTags: QUERY_TAGS,
    fetchedRowsBeforeDeduplication: records.length,
    failedTags,
    productionSafeSingleTargetFullTrackCandidates: items.length,
    representedDetailLabels: Object.keys(countsBy(items, "detailTarget")).length,
    byDetail: countsBy(items, "detailTarget"),
    byLicense: countsBy(items, "license"),
    rightsReview: {
      itemLicenses: "Each candidate retains the item API license_url.",
      officialTerms: "https://ccmixter.org/terms",
      officialAbout: "https://ccmixter.org/about",
      productionAllow: ["CC0", "CC-BY", "CC-BY-SA"],
      exclusions: ["NC", "ND", "unspecified license", "stems/samples", "under 90 seconds", "multi-genre labels"]
    },
    promotionPolicy: "Candidate metadata only. Download, verify availability, extract production features and pass origin-heldout ablation before training."
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 1, items }, null, 2)}\n`);
  fs.writeFileSync(path.join(ROOT, "genre-training/detail-genre-ccmixter-candidate-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.basename(process.argv[1]) === path.basename(fileURLToPath(import.meta.url))) await main();
