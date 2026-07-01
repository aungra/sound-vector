import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
const VERIFIED_PATH = path.join(TRAINING_DIR, "verified-dataset.json");
const OUT_PATH = path.resolve(process.env.MMFR_FMA_TARGET_OUT_PATH || path.join(TRAINING_DIR, "fma-target-cc-source-manifest.json"));

const TARGETS = String(process.env.MMFR_FMA_TARGET_GENRES || "ドローン,ドラムンベース,チップチューン,ディープ・ハウス,オペラ")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);
const TARGET_PER_GENRE = Math.max(1, Number(process.env.MMFR_FMA_TARGET_PER_GENRE || 50));

const MACRO_BY_FINE = {
  "ドローン": "ambient",
  "ドラムンベース": "electronic",
  "チップチューン": "electronic",
  "ディープ・ハウス": "electronic",
  "オペラ": "classical"
};

const MATCHERS = [
  ["ディープ・ハウス", /\bdeep[- ]?house\b|\bdeephouse\b/i],
  ["ドラムンベース", /drum\s*['’`-]?\s*n\s*['’`-]?\s*bass|\bdnb\b|\bjungle\b/i],
  ["チップチューン", /\bchiptune\b|\bchip music\b|\b8[- ]?bit\b|\bgameboy\b|\bnintendo\b/i],
  ["オペラ", /\bopera\b|\baria\b|\bsoprano\b|\btenor\b|\bbaritone\b|\bbel canto\b/i],
  ["ドローン", /\bdrone\b|\bdark ambient\b|\bsoundscape\b|\bfield recording\b/i]
];

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function localCachePaths() {
  const payload = loadJson(CACHE_PATHS_PATH, {});
  return payload && typeof payload === "object" ? payload : {};
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

function fmaPaths() {
  const cache = localCachePaths();
  const externalDataDir = path.resolve(process.env.MMFR_EXTERNAL_DATA_DIR || cache.externalDataDir || path.join(ROOT, ".external-data"));
  const fmaDir = path.resolve(process.env.MMFR_FMA_DIR || path.join(externalDataDir, "fma"));
  return {
    tracksCsv: path.resolve(process.env.MMFR_FMA_TRACKS_CSV || path.join(fmaDir, "fma_metadata", "tracks.csv")),
    audioRoot: path.resolve(process.env.MMFR_FMA_AUDIO_ROOT || path.join(fmaDir, "fma_small"))
  };
}

function matchGenre(row, text) {
  for (const [genre, pattern] of MATCHERS) {
    if (!TARGETS.includes(genre)) continue;
    if (pattern.test(text)) return genre;
  }
  return "";
}

const { tracksCsv, audioRoot } = fmaPaths();
if (!fs.existsSync(tracksCsv)) {
  console.error(`Missing FMA tracks.csv: ${tracksCsv}`);
  process.exitCode = 1;
} else if (!fs.existsSync(audioRoot)) {
  console.error(`Missing FMA audio root: ${audioRoot}`);
  process.exitCode = 1;
} else {
  const existing = existingKeys();
  const counts = Object.fromEntries(TARGETS.map(genre => [genre, 0]));
  const selected = [];
  const rejected = { existing: 0, noAudio: 0, noMacro: 0, genreLimit: 0 };
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
    if (!values.length || !values[0]) return;
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    const text = [
      row["track.genre_top"],
      row["track.genres"],
      row["track.genres_all"],
      row["track.tags"],
      row["track.title"],
      row["track.information"],
      row["album.tags"],
      row["album.title"],
      row["album.information"],
      row["artist.tags"],
      row["artist.bio"],
      row["artist.name"]
    ].join(" ");
    const genre = matchGenre(row, text);
    if (!genre) return;
    if ((counts[genre] || 0) >= TARGET_PER_GENRE) {
      rejected.genreLimit += 1;
      return;
    }
    const macroGenre = MACRO_BY_FINE[genre] || "";
    if (!macroGenre) {
      rejected.noMacro += 1;
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
    if (!license || !licenseUrl) return;
    selected.push({
      source: "FMA",
      sourceType: "cc-dataset",
      datasetName: "FMA",
      trackId,
      genre,
      macroGenre,
      trainingRole: "fine",
      filePath,
      sourceUrl: filePath,
      referenceUrl,
      license,
      licenseUrl,
      canonicalArtist: row["artist.name"] || "",
      canonicalTitle: row["track.title"] || "",
      audioStoragePolicy: "external-local-audio; persist-features-only",
      reviewStatus: "keyword-targeted-fma"
    });
    counts[genre] = (counts[genre] || 0) + 1;
  });

  fs.writeFileSync(OUT_PATH, JSON.stringify({
    description: "Targeted FMA Small CC audio manifest for sparse MMFR genres. Audio stays outside repo; features only are persisted.",
    generatedAt: new Date().toISOString(),
    tracksCsv,
    audioRoot,
    targetGenres: TARGETS,
    targetPerGenre: TARGET_PER_GENRE,
    counts,
    rejected,
    items: selected
  }, null, 2));
  console.log(JSON.stringify({
    output: path.relative(ROOT, OUT_PATH),
    selected: selected.length,
    counts,
    rejected
  }, null, 2));
}
