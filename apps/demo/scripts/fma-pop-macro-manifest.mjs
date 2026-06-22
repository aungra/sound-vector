import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
const VERIFIED_PATH = path.join(TRAINING_DIR, "verified-dataset.json");
const OUT_PATH = path.join(TRAINING_DIR, "fma-pop-macro-cc-source-manifest.json");
const TARGET_COUNT = Math.max(1, Number(process.env.MMFR_FMA_POP_MACRO_TARGET || 100));

const POP_MATCH = /\b(pop|indie pop|synth pop|electropop|power pop|dream pop|art pop)\b/i;
const REJECT_MATCH = /\b(popcorn|popular music archive|popol|popovich|populous|city of|anime club|podcast|interview)\b/i;

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function parseCsvEach(text, onRow) {
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === "\"" && next === "\"") {
        cell += "\"";
        i += 1;
      } else if (ch === "\"") {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === "\"") {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      onRow(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    onRow(row);
  }
}

function normalizeLicense(value) {
  const text = String(value || "").toUpperCase();
  if (/CC0|PUBLIC DOMAIN/.test(text)) return "CC0";
  if (/ATTRIBUTION/.test(text)) {
    const parts = ["CC-BY"];
    if (/NON.?COMMERCIAL/.test(text)) parts.push("NC");
    if (/SHARE.?ALIKE/.test(text)) parts.push("SA");
    if (/NO.?DERIV|NODERIV|NO DERIV/.test(text)) parts.push("ND");
    return parts.join("-");
  }
  return text;
}

function licenseUrlFor(license) {
  const normalized = normalizeLicense(license);
  const map = {
    "CC0": "https://creativecommons.org/publicdomain/zero/1.0/",
    "CC-BY": "https://creativecommons.org/licenses/by/4.0/",
    "CC-BY-SA": "https://creativecommons.org/licenses/by-sa/4.0/",
    "CC-BY-NC": "https://creativecommons.org/licenses/by-nc/4.0/",
    "CC-BY-NC-SA": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    "CC-BY-ND": "https://creativecommons.org/licenses/by-nd/4.0/",
    "CC-BY-NC-ND": "https://creativecommons.org/licenses/by-nc-nd/4.0/"
  };
  return map[normalized] || "";
}

function localCachePaths() {
  const payload = loadJson(CACHE_PATHS_PATH, {});
  return payload && typeof payload === "object" ? payload : {};
}

function fmaPaths() {
  const cache = localCachePaths();
  const externalDataDir = path.resolve(process.env.MMFR_EXTERNAL_DATA_DIR || cache.externalDataDir || path.join(ROOT, ".external-data"));
  const fmaDir = path.resolve(process.env.MMFR_FMA_DIR || path.join(externalDataDir, "fma"));
  return {
    tracksCsv: path.resolve(process.env.MMFR_FMA_TRACKS_CSV || path.join(fmaDir, "fma_metadata", "tracks.csv")),
    audioRoot: path.resolve(process.env.MMFR_FMA_AUDIO_ROOT || path.join(fmaDir, "fma_small"))
  };
}

function existingKeys() {
  const payload = loadJson(VERIFIED_PATH, { items: [] });
  const rows = Array.isArray(payload) ? payload : payload.items || [];
  return new Set(rows.flatMap(row => [
    row.sourceUrl,
    row.filePath,
    row.referenceUrl,
    row.trackId ? `fma:${row.trackId}` : ""
  ].filter(Boolean)));
}

const { tracksCsv, audioRoot } = fmaPaths();
if (!fs.existsSync(tracksCsv) || !fs.existsSync(audioRoot)) {
  console.error(JSON.stringify({ ok: false, tracksCsv, audioRoot }, null, 2));
  process.exitCode = 1;
} else {
  const existing = existingKeys();
  const selected = [];
  const rejected = { existing: 0, noAudio: 0, noLicense: 0, textReject: 0, limit: 0 };
  const headerRows = [];
  let headers = [];

  parseCsvEach(fs.readFileSync(tracksCsv, "utf8"), values => {
    if (headerRows.length < 3) {
      headerRows.push(values);
      if (headerRows.length === 3) {
        const [top, mid, low] = headerRows;
        headers = top.map((value, index) => [value, mid[index], low[index]].filter(Boolean).join(".") || "track_id");
      }
      return;
    }
    if (selected.length >= TARGET_COUNT) {
      rejected.limit += 1;
      return;
    }
    if (!values.length || !values[0]) return;
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    const text = [
      row["track.genre_top"],
      row["track.genres"],
      row["track.genres_all"],
      row["track.tags"],
      row["track.title"],
      row["album.tags"],
      row["album.title"],
      row["artist.tags"],
      row["artist.name"]
    ].join(" ");
    if (!POP_MATCH.test(text) || REJECT_MATCH.test(text)) {
      if (POP_MATCH.test(text)) rejected.textReject += 1;
      return;
    }
    const trackId = String(row.track_id || "").trim();
    const padded = trackId.padStart(6, "0");
    const filePath = path.join(audioRoot, padded.slice(0, 3), `${padded}.mp3`);
    const referenceUrl = row["track.information"] || `https://freemusicarchive.org/track/${trackId}`;
    if (existing.has(filePath) || existing.has(referenceUrl) || existing.has(`fma:${trackId}`)) {
      rejected.existing += 1;
      return;
    }
    if (!fs.existsSync(filePath)) {
      rejected.noAudio += 1;
      return;
    }
    const license = normalizeLicense(row["track.license"]);
    const licenseUrl = licenseUrlFor(license);
    if (!license || !licenseUrl) {
      rejected.noLicense += 1;
      return;
    }
    selected.push({
      source: "FMA",
      sourceType: "cc-dataset",
      datasetName: "FMA",
      trackId,
      genre: "ポップ大分類",
      macroGenre: "pop",
      trainingRole: "macro-only",
      filePath,
      sourceUrl: filePath,
      referenceUrl,
      license,
      licenseUrl,
      canonicalArtist: row["artist.name"] || "",
      canonicalTitle: row["track.title"] || "",
      audioStoragePolicy: "external-local-audio; persist-features-only",
      reviewStatus: "keyword-targeted-fma-pop-macro"
    });
  });

  fs.writeFileSync(OUT_PATH, JSON.stringify({
    description: "FMA Small CC audio manifest for pop macro-only coverage. These rows fill the pop macro gap without pretending to be J-POP or City Pop.",
    generatedAt: new Date().toISOString(),
    tracksCsv,
    audioRoot,
    targetCount: TARGET_COUNT,
    selected: selected.length,
    rejected,
    items: selected
  }, null, 2));
  console.log(JSON.stringify({
    output: path.relative(ROOT, OUT_PATH),
    selected: selected.length,
    rejected
  }, null, 2));
}
