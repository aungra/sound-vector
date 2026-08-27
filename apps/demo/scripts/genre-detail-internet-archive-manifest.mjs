import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { effectiveTrainingUsage, TRAINING_USAGE } from "./genre-training-license-policy.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_OUTPUT = "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/detail-genre-internet-archive-candidate-manifest.json";
const execFileAsync = promisify(execFile);

export const TARGETS = Object.freeze({
  house: "house", "deep-house": "deep house", trance: "trance", disco: "disco",
  "progressive-trance": "progressive trance", psytrance: "psytrance", soul: "soul",
  "r-and-b": "rhythm and blues", jazz: "jazz", metal: "metal", noise: "noise", "harsh-noise": "harsh noise",
  "post-punk": "post punk"
});
const SUBJECT_TO_DETAIL = Object.freeze({
  ambient: "ambient", "ambient music": "ambient", "new age": "new-age", newage: "new-age", drone: "drone", blues: "blues", jazz: "jazz", "jazz music": "jazz", folk: "folk",
  electronic: "electronic", electronica: "electronic", idm: "idm", techno: "techno",
  electro: "electronic", industrial: "industrial", "minimal techno": "minimal-techno", "acid techno": "acid-techno",
  house: "house", "house music": "house", "tech house": "tech-house", techhouse: "tech-house",
  "deep house": "deep-house", trance: "trance", "trance music": "trance", psytrance: "psytrance",
  "psy trance": "psytrance", "psychedelic trance": "psytrance", "goa trance": "psytrance",
  "progressive trance": "progressive-trance",
  funk: "funk", disco: "disco", "disco music": "disco", soul: "soul", "soul music": "soul",
  "r&b": "r-and-b", "r and b": "r-and-b", "rhythm and blues": "r-and-b",
  "drum and bass": "drum-and-bass", dnb: "drum-and-bass", breakbeat: "breakbeat", dubstep: "dubstep",
  "hip hop": "hip-hop", hiphop: "hip-hop", reggae: "reggae", dub: "dub", rock: "rock",
  punk: "punk", "post punk": "post-punk", hardcore: "hardcore-punk", metal: "metal", "metal music": "metal", classical: "classical",
  chiptune: "chiptune", bitpop: "chiptune", vaporwave: "vaporwave", "vapor wave": "vaporwave",
  noise: "noise", "noise music": "noise", "harsh noise": "harsh-noise", "power electronics": "power-electronics"
});
const GENERIC_COLLECTIONS = new Set([
  "netlabels", "audio_music", "opensource_audio", "community", "folksoundomy_music",
  "folksoundomy", "audio", "internetarchivebooks"
]);
const AUDIO_FORMAT_PRIORITY = new Map([
  ["VBR MP3", 0], ["128Kbps MP3", 1], ["MP3", 2], ["Ogg Vorbis", 3],
  ["Flac", 4], ["24bit Flac", 5]
]);
const SEARCH_ROWS_PER_TARGET = 500;
const MAX_TRACKS_PER_RELEASE = 5;

function values(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function normalizedSubjectTokens(subject) {
  return values(subject).flatMap(value => String(value).split(/[,;|/]+/)).map(value => value
    .toLowerCase().replaceAll("_", " ").replaceAll("-", " ").replace(/\s+/g, " ").trim()).filter(Boolean);
}

function detailLabels(subject) {
  const labels = new Set(normalizedSubjectTokens(subject).map(token => SUBJECT_TO_DETAIL[token]).filter(Boolean));
  for (const [specific, parent] of [["deep-house", "house"], ["tech-house", "house"], ["minimal-techno", "techno"], ["acid-techno", "techno"], ["psytrance", "trance"], ["progressive-trance", "trance"], ["harsh-noise", "noise"], ["power-electronics", "noise"]]) {
    if (labels.has(specific)) labels.delete(parent);
  }
  return [...labels].sort();
}

function licenseFromUrl(value) {
  const url = String(value || "").toLowerCase();
  if (/by-nc-nd|by-nd-nc/.test(url)) return "CC-BY-NC-ND";
  if (/by-nc-sa/.test(url)) return "CC-BY-NC-SA";
  if (/by-nc/.test(url)) return "CC-BY-NC";
  if (/by-nd/.test(url)) return "CC-BY-ND";
  if (/by-sa/.test(url)) return "CC-BY-SA";
  if (/\/by\//.test(url)) return "CC-BY";
  if (/publicdomain\/zero|creativecommons\.org\/zero/.test(url)) return "CC0";
  if (/publicdomain\/mark/.test(url)) return "Public Domain Mark";
  return "";
}

function originFamily(collections) {
  return values(collections).find(value => {
    const id = String(value).toLowerCase();
    return !GENERIC_COLLECTIONS.has(id) && !id.startsWith("fav-");
  }) || "";
}

function seconds(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  const cells = String(value || "").split(":").map(Number);
  return cells.every(Number.isFinite) ? cells.reduce((sum, cell) => sum * 60 + cell, 0) : 0;
}

function audioFiles(files) {
  const grouped = new Map();
  for (const file of files || []) {
    const priority = AUDIO_FORMAT_PRIORITY.get(file.format);
    if (priority === undefined || seconds(file.length) < 90 || !file.name) continue;
    const group = path.basename(file.original || file.name, path.extname(file.original || file.name)).toLowerCase();
    const existing = grouped.get(group);
    if (!existing || priority < existing.priority) grouped.set(group, { ...file, priority });
  }
  return [...grouped.values()].sort((a, b) => String(a.track || a.name).localeCompare(String(b.track || b.name))).slice(0, MAX_TRACKS_PER_RELEASE);
}

function hasRestrictedRightsConflict(metadata) {
  const text = String(metadata?.description || "").toLowerCase();
  return /creativecommons\.org\/licenses\/by-(?:nc|nd)|attribution[ -](?:noncommercial|no derivatives|noderivatives)/i.test(text);
}

export function buildInternetArchiveCandidates(docs, metadataById) {
  const items = [];
  for (const doc of docs) {
    const origin = originFamily(doc.collection);
    const labels = detailLabels(doc.subject);
    const license = licenseFromUrl(doc.licenseurl);
    const rights = effectiveTrainingUsage({ license, contentScope: "full-track" });
    const metadata = metadataById.get(String(doc.identifier)) || {};
    if (!origin || labels.length !== 1 || (doc.queriedDetail && labels[0] !== doc.queriedDetail)
      || rights.usage !== TRAINING_USAGE.PRODUCTION || hasRestrictedRightsConflict(metadata.metadata)) continue;
    for (const file of audioFiles(metadata.files)) {
      items.push({
        datasetName: "Internet Archive reviewed netlabel releases",
        distributionSource: "Internet Archive",
        sourceFamily: `IA netlabel:${origin}`,
        trackId: `${doc.identifier}:${file.name}`,
        workGroup: String(doc.identifier),
        split: "unassigned",
        detailLabels: labels,
        detailTarget: labels[0],
        singleTargetEligible: true,
        downloadUrl: `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${encodeURIComponent(file.name)}`,
        referenceUrl: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
        license,
        licenseUrl: doc.licenseurl,
        canonicalArtist: values(doc.creator)[0] || "",
        canonicalTitle: file.title || file.name,
        duration: seconds(file.length),
        labelEvidence: `Internet Archive item subject: ${normalizedSubjectTokens(doc.subject).join(", ")}`,
        rightsEvidence: "Internet Archive item metadata licenseurl on a netlabel collection release",
        rightsReferenceUrl: "https://archive.org/about/terms.php",
        contentScope: "full-track",
        audioStoragePolicy: "candidate-metadata-only; manual origin review required before download"
      });
    }
  }
  return items.sort((a, b) => a.detailTarget.localeCompare(b.detailTarget) || a.sourceFamily.localeCompare(b.sourceFamily) || a.trackId.localeCompare(b.trackId));
}

function countsBy(items, key) {
  const counts = {};
  for (const item of items) counts[item[key]] = (counts[item[key]] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

async function fetchJson(url) {
  const { stdout } = await execFileAsync("curl", ["-fsS", String(url)], { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function main() {
  const docs = [];
  const failures = [];
  const requested = new Set(String(process.env.MMFR_IA_DETAIL_TARGETS || "").split(",").map(value => value.trim()).filter(Boolean));
  const targets = Object.entries(TARGETS).filter(([detail]) => !requested.size || requested.has(detail));
  for (const [detail, subject] of targets) {
    const url = new URL("https://archive.org/advancedsearch.php");
    url.search = new URLSearchParams({
      q: `mediatype:audio AND collection:netlabels AND subject:"${subject}" AND licenseurl:*`,
      "fl[]": "identifier,title,creator,subject,licenseurl,collection", rows: String(SEARCH_ROWS_PER_TARGET),
      "sort[]": "downloads desc", output: "json"
    });
    try {
      const result = await fetchJson(url);
      docs.push(...(result.response?.docs || []).map(doc => ({ ...doc, queriedDetail: detail })));
    } catch (error) {
      failures.push({ detail, stage: "search", error: error.message });
    }
  }
  const uniqueDocs = [...new Map(docs.map(doc => [String(doc.identifier), doc])).values()]
    .filter(doc => detailLabels(doc.subject).length === 1 && detailLabels(doc.subject)[0] === doc.queriedDetail && originFamily(doc.collection)
      && effectiveTrainingUsage({ license: licenseFromUrl(doc.licenseurl), contentScope: "full-track" }).usage === TRAINING_USAGE.PRODUCTION);
  const metadataById = new Map();
  for (let offset = 0; offset < uniqueDocs.length; offset += 8) {
    await Promise.all(uniqueDocs.slice(offset, offset + 8).map(async doc => {
      try {
        metadataById.set(String(doc.identifier), await fetchJson(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`));
      } catch (error) {
        failures.push({ identifier: doc.identifier, stage: "metadata", error: error.message });
      }
    }));
  }
  const items = buildInternetArchiveCandidates(uniqueDocs, metadataById);
  const outputPath = path.resolve(process.env.MMFR_IA_DETAIL_MANIFEST_OUTPUT || DEFAULT_OUTPUT);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dataset: "Internet Archive reviewed netlabel releases",
    queriedTargets: Object.fromEntries(targets),
    searchRowsPerTarget: SEARCH_ROWS_PER_TARGET,
    maximumTracksPerRelease: MAX_TRACKS_PER_RELEASE,
    searchRowsBeforeDeduplication: docs.length,
    eligibleReleaseRows: uniqueDocs.length,
    productionLicenseFullTrackCandidates: items.length,
    representedDetailLabels: Object.keys(countsBy(items, "detailTarget")).length,
    representedOriginFamilies: Object.keys(countsBy(items, "sourceFamily")).length,
    byDetail: countsBy(items, "detailTarget"),
    byOrigin: countsBy(items, "sourceFamily"),
    byLicense: countsBy(items, "license"),
    failures,
    safeguards: [
      "Only netlabels collection releases with a distinct origin collection are retained.",
      "Only CC0, Public Domain Mark, CC-BY and CC-BY-SA item license URLs are retained; NC and ND are excluded.",
      "A restricted NC or ND license mentioned in the release description overrides a permissive item field and excludes the release.",
      "Only one recognized detailed genre per release and audio files of at least 90 seconds are retained.",
      "At most five tracks per release are retained and all share one workGroup to prevent split leakage.",
      "Candidates require manual origin review and source-heldout ablation before production training."
    ]
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 1, items }, null, 2)}\n`);
  fs.writeFileSync(path.join(ROOT, "genre-training/detail-genre-internet-archive-candidate-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
