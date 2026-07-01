import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
const REVIEW_TSV = path.resolve(process.env.MMFR_FREESOUND_REVIEW_TSV || path.join(TRAINING_DIR, "freesound-cc-review.tsv"));
const OUT_PATH = path.resolve(process.env.MMFR_CC_MANIFEST_OUTPUT || path.join(TRAINING_DIR, "freesound-cc-source-manifest.json"));
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aif", ".aiff"]);

function readJson(pathname, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function parseTsv(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (!lines.length) return [];
  const headers = parseRow(lines[0]);
  return lines.slice(1).map(line => {
    const cells = parseRow(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
}

function parseRow(line) {
  const out = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === "\"" && quoted && line[i + 1] === "\"") {
      value += "\"";
      i += 1;
      continue;
    }
    if (char === "\"") {
      quoted = !quoted;
      continue;
    }
    if (char === "\t" && !quoted) {
      out.push(value);
      value = "";
      continue;
    }
    value += char;
  }
  out.push(value);
  return out;
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function isInsideRepo(value) {
  const relative = path.relative(ROOT, path.resolve(value));
  return Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function findAudio(row, audioRoot, audioIndex) {
  const explicit = row.localFilePath || row.filePath || "";
  if (explicit && fs.existsSync(explicit)) return path.resolve(explicit);
  const id = String(row.freesoundId || "").trim();
  if (!id) return "";
  return audioIndex.get(id) || "";
}

function licenseUrlFor(row) {
  const value = row.licenseUrl || "";
  if (/^https?:\/\//.test(value)) return value;
  if (row.license === "CC0") return "https://creativecommons.org/publicdomain/zero/1.0/";
  if (row.license === "CC-BY") return "https://creativecommons.org/licenses/by/4.0/";
  return value;
}

const cache = readJson(CACHE_PATHS_PATH, {});
const defaultAudioRoot = path.join(cache.externalDataDir || "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data", "freesound");
const audioRoot = path.resolve(process.argv[2] || process.env.MMFR_FREESOUND_AUDIO_ROOT || defaultAudioRoot);

if (!fs.existsSync(REVIEW_TSV)) {
  console.error(`Review TSV not found: ${REVIEW_TSV}`);
  process.exitCode = 1;
} else if (isInsideRepo(audioRoot)) {
  console.error(`Refusing repo-local audio root: ${audioRoot}`);
  process.exitCode = 1;
} else {
  const audioFiles = walk(audioRoot);
  const audioIndex = new Map();
  for (const filePath of audioFiles) {
    const base = path.basename(filePath);
    const id = base.match(/\d+/)?.[0];
    if (id && !audioIndex.has(id)) audioIndex.set(id, filePath);
  }
  const rows = parseTsv(fs.readFileSync(REVIEW_TSV, "utf8"));
  const approved = rows.filter(row => String(row.reviewStatus || "").trim().toLowerCase() === "approved");
  const items = [];
  const rejected = [];
  for (const row of approved) {
    const filePath = findAudio(row, audioRoot, audioIndex);
    if (!filePath) {
      rejected.push({ ...row, rejectReason: "audio-file-not-found" });
      continue;
    }
    items.push({
      datasetName: "Freesound CC",
      source: "Freesound",
      trackId: `freesound_${row.freesoundId}`,
      freesoundId: row.freesoundId,
      genre: row.genre,
      macroGenre: row.macroGenre,
      trainingRole: row.trainingRole || "fine",
      filePath,
      referenceUrl: row.referenceUrl || `https://freesound.org/s/${row.freesoundId}/`,
      license: row.license || "CC-BY",
      licenseUrl: licenseUrlFor(row),
      canonicalArtist: row.username || "",
      canonicalTitle: row.name || "",
      tags: row.tags || "",
      segmentType: "loop",
      labelEvidence: `Freesound query=${row.query}; review=approved; role=${row.role}`,
      labelConfidence: row.score || "",
      reviewStatus: "approved-freesound-cc-loop",
      reviewNote: "Approved Freesound CC loop candidate for electronic substyle boundary training."
    });
  }
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify({
    description: "Generated from reviewed Freesound CC candidates. Source audio stays outside this repository; cc-import persists features only.",
    generatedAt: new Date().toISOString(),
    reviewTsv: path.relative(ROOT, REVIEW_TSV),
    audioRoot,
    items,
    rejected
  }, null, 2));
  console.log(JSON.stringify({
    output: path.relative(ROOT, OUT_PATH),
    audioRoot,
    approvedRows: approved.length,
    items: items.length,
    rejected: rejected.length,
    byGenre: items.reduce((acc, item) => {
      acc[item.genre] = (acc[item.genre] || 0) + 1;
      return acc;
    }, {})
  }, null, 2));
}
