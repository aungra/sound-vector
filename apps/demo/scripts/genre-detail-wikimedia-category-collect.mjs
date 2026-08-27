import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { effectiveTrainingUsage, TRAINING_USAGE } from "./genre-training-license-policy.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_CACHE = "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training";
const execFileAsync = promisify(execFile);

export const TARGET_CATEGORIES = Object.freeze({
  opera: "Audio files of opera music",
  choral: "Audio files of choral music",
  jazz: "Audio files of jazz music",
  house: "Audio files of house music",
  "deep-house": "Deep house",
  disco: "Audio files of disco music",
  funk: "Audio files of funk",
  chiptune: "Audio files of chiptune",
  "drum-and-bass": "Audio files of drum and bass"
});

const REJECT_CATEGORY = /license review needed|copyright violation|deletion requests|unknown copyright status|fair use|open-access scholarly articles|original research|piano education|experiments/i;
const REJECT_CONTENT = /\b(midi|exercise|lesson|tutorial|scale|arpeggio|metronome|backing track|accompaniment|accompagnement|loop|sample pack|sound effect|stimulus|stimuli|research example|demonstration|excerpt|snippet|ringtone|karaoke|spoken)\b/i;
const AUDIO_MIME = /^(audio\/(?:mpeg|flac|wav|x-wav|ogg)|application\/ogg)$/i;

function plain(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#0*39;|&apos;/g, "'").replace(/&quot;/g, "\"").replace(/\s+/g, " ").trim();
}

function metadata(info, key) {
  return plain(info.extmetadata?.[key]?.value);
}

function normalizedLicense(info) {
  const short = metadata(info, "LicenseShortName") || metadata(info, "UsageTerms");
  const url = metadata(info, "LicenseUrl");
  if (/public domain/i.test(short)) return "Public Domain";
  if (/cc0/i.test(`${short} ${url}`)) return "CC0";
  const match = `${short} ${url}`.match(/CC[- ]?BY(?:[- ]?NC)?(?:[- ]?SA)?(?:[- ]?ND)?(?:[- ]?\d(?:\.\d)?)?/i);
  return match ? match[0].toUpperCase().replace(/\s+/g, "-").replace(/^CCBY/, "CC-BY") : short;
}

function categories(page, info) {
  const api = (page.categories || []).map(item => String(item.title || "").replace(/^Category:/, ""));
  const embedded = metadata(info, "Categories").split("|").map(value => value.trim()).filter(Boolean);
  return [...new Set([...api, ...embedded])].sort();
}

export function inferOriginFamily(page, info) {
  const text = plain(`${page.title} ${metadata(info, "Artist")} ${metadata(info, "Credit")} ${metadata(info, "ImageDescription")}`);
  if (/United States Air Force|USAF|Airmen of Note/i.test(text)) return "US Air Force recordings";
  if (/United States Coast Guard Band|U\.?S\.? Coast Guard Band/i.test(text)) return "US Coast Guard Band";
  if (/United States Military Academy Band/i.test(text)) return "US Military Academy Band";
  if (/United States Marine Band|US Marine Band/i.test(text)) return "US Marine Band";
  if (/United States Navy Band|US Navy Band/i.test(text)) return "US Navy Band";
  if (/Library of Congress|loc\.gov/i.test(text)) return "Library of Congress recording collection";
  if (/Audio files from Audiotool|Audiotool/i.test(`${text} ${categories(page, info).join(" ")}`)) return "Audiotool";
  if (/Electronic music from Jamendo|Jamendo/i.test(`${text} ${categories(page, info).join(" ")}`)) return "MTG-Jamendo";
  if (/Internet Archive|archive\.org/i.test(text)) return "Internet Archive historic recording collection";
  return "origin-review-required";
}

function workKey(page, info) {
  const object = metadata(info, "ObjectName") || String(page.title || "").replace(/^File:/, "").replace(/\.[^.]+$/, "");
  const artist = metadata(info, "Artist");
  return `${plain(object).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${plain(artist).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
}

export function candidateFromPage(detailTarget, expectedCategory, page) {
  const info = page.imageinfo?.[0] || {};
  const categoryList = categories(page, info);
  const text = plain(`${page.title} ${metadata(info, "ObjectName")} ${metadata(info, "ImageDescription")} ${categoryList.join(" ")}`);
  const license = normalizedLicense(info);
  const duration = Number(info.duration || 0);
  const rejectReasons = [];
  if (!AUDIO_MIME.test(String(info.mime || ""))) rejectReasons.push("not-supported-audio");
  if (duration < 90) rejectReasons.push("under-90-seconds");
  if (!categoryList.includes(expectedCategory)) rejectReasons.push("missing-exact-genre-category");
  if (categoryList.some(value => REJECT_CATEGORY.test(value))) rejectReasons.push("rights-review-or-copyright-category");
  if (REJECT_CONTENT.test(text)) rejectReasons.push("support-or-fragment-content");
  const rights = effectiveTrainingUsage({ license, licenseUrl: metadata(info, "LicenseUrl"), contentScope: "full-track" });
  if (rights.usage !== TRAINING_USAGE.PRODUCTION) rejectReasons.push(`license-${rights.usage}`);
  if (!info.url) rejectReasons.push("missing-audio-url");
  if (rejectReasons.length) return { accepted: false, rejectReasons };

  return {
    accepted: true,
    item: {
      datasetName: "Wikimedia Commons reviewed genre category candidates",
      distributionSource: "Wikimedia Commons",
      sourceFamily: inferOriginFamily(page, info),
      trackId: String(page.pageid),
      workGroup: workKey(page, info),
      detailTarget,
      detailLabels: [detailTarget],
      singleTargetEligible: true,
      canonicalArtist: metadata(info, "Artist"),
      canonicalTitle: metadata(info, "ObjectName") || plain(String(page.title || "").replace(/^File:/, "").replace(/\.[^.]+$/, "")),
      duration,
      mime: info.mime,
      downloadUrl: info.url,
      referenceUrl: info.descriptionurl,
      license,
      licenseUrl: metadata(info, "LicenseUrl"),
      labelEvidence: `Wikimedia Commons exact category: ${expectedCategory}`,
      rightsEvidence: "Wikimedia Commons imageinfo.extmetadata; manual page and origin review still required",
      categoryEvidence: categoryList,
      contentScope: "full-track",
      needsReview: true,
      audioStoragePolicy: "candidate-metadata-only; reviewed audio may be stored in external cache"
    }
  };
}

async function fetchCategory(category) {
  const pages = [];
  let continuation = "";
  do {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.search = new URLSearchParams({
      action: "query", format: "json", origin: "*", generator: "categorymembers",
      gcmtitle: `Category:${category}`, gcmtype: "file", gcmlimit: "500",
      prop: "imageinfo|categories", iiprop: "url|mime|size|extmetadata", cllimit: "max",
      ...(continuation ? { gcmcontinue: continuation } : {})
    });
    const { stdout } = await execFileAsync("curl", ["-fsS", String(url)], { maxBuffer: 128 * 1024 * 1024 });
    const payload = JSON.parse(stdout);
    pages.push(...Object.values(payload.query?.pages || {}));
    continuation = payload.continue?.gcmcontinue || "";
  } while (continuation);
  return pages;
}

function countsBy(items, key) {
  const counts = {};
  for (const item of items) counts[item[key]] = (counts[item[key]] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

async function main() {
  const cacheRoot = path.resolve(process.env.MMFR_GENRE_CACHE_DIR || DEFAULT_CACHE);
  const outputPath = path.resolve(process.env.MMFR_WIKIMEDIA_CATEGORY_OUTPUT || path.join(cacheRoot, "detail-genre-wikimedia-category-candidates.json"));
  const targets = String(process.env.MMFR_WIKIMEDIA_CATEGORY_TARGETS || Object.keys(TARGET_CATEGORIES).join(","))
    .split(",").map(value => value.trim()).filter(value => TARGET_CATEGORIES[value]);
  const items = [];
  const byTarget = {};
  const rejected = {};

  for (const detailTarget of targets) {
    const pages = await fetchCategory(TARGET_CATEGORIES[detailTarget]);
    const accepted = [];
    for (const page of pages) {
      const result = candidateFromPage(detailTarget, TARGET_CATEGORIES[detailTarget], page);
      if (result.accepted) accepted.push(result.item);
      else for (const reason of result.rejectReasons) rejected[reason] = (rejected[reason] || 0) + 1;
    }
    const deduplicated = [...new Map(accepted.map(item => [item.workGroup, item])).values()];
    items.push(...deduplicated);
    byTarget[detailTarget] = { categoryFiles: pages.length, acceptedBeforeWorkDeduplication: accepted.length, candidates: deduplicated.length };
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dataset: "Wikimedia Commons exact detailed-genre categories",
    outputPath,
    candidateRows: items.length,
    byTarget,
    byOrigin: countsBy(items, "sourceFamily"),
    byLicense: countsBy(items, "license"),
    rejected,
    safeguards: [
      "Exact Commons genre category membership is required.",
      "Only audio of at least 90 seconds with production-safe CC0, Public Domain, CC-BY or CC-BY-SA metadata is retained.",
      "License-review-needed and copyright-warning categories are excluded.",
      "MIDI, exercises, loops, samples, snippets, accompaniment and research stimuli are excluded.",
      "Alternate encodings of the same artist/work are deduplicated.",
      "Wikimedia remains the distributor; independent source counts use the original recording origin.",
      "Every candidate remains review-only until the page, origin, genre and recording identity are manually verified."
    ]
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 1, items }, null, 2)}\n`);
  fs.writeFileSync(path.join(ROOT, "genre-training/detail-genre-wikimedia-category-candidate-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
