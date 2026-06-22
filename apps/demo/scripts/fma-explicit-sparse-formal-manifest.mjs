import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
const VERIFIED_PATH = path.join(TRAINING_DIR, "verified-dataset.json");
const OUT_PATH = path.join(TRAINING_DIR, "fma-explicit-sparse-formal-source-manifest.json");
const REPORT_PATH = path.join(TRAINING_DIR, "fma-explicit-sparse-formal-report.json");

const TARGETS = String(process.env.MMFR_FMA_SPARSE_TARGET_GENRES || "トラップ,アニメソング,シティ・ポップ")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);
const TARGET_PER_GENRE = Math.max(1, Number(process.env.MMFR_FMA_SPARSE_TARGET_PER_GENRE || 100));
const ALLOW_CITY_POP_ADJACENT = process.env.MMFR_FMA_ALLOW_CITY_POP_ADJACENT === "1";

const MACRO_BY_FINE = {
  "トラップ": "black_music",
  "アニメソング": "pop",
  "シティ・ポップ": "pop"
};

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
  return text.trim();
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

function textField(row, names) {
  return names.map(name => row[name] || "").join(" ").toLowerCase();
}

function hasBadSignal(text) {
  return /\b(spoken|podcast|interview|lecture|sample packs?|loop packs?|karaoke|cover|reaction|tutorial|mixtape|dj set|continuous mix)\b/i.test(text);
}

function evidenceFor(row) {
  const tagText = textField(row, ["track.tags", "album.tags", "artist.tags"]);
  const titleText = textField(row, ["track.title", "album.title"]);
  const allText = textField(row, [
    "track.genre_top",
    "track.genres",
    "track.genres_all",
    "track.tags",
    "track.title",
    "album.tags",
    "album.title",
    "artist.tags",
    "artist.name"
  ]);
  if (hasBadSignal(allText)) return null;

  if (TARGETS.includes("トラップ") && /\btrap\b|trap[- ]?beat|baroque trap|\bphonk\b|\b808\b/.test(tagText) && !/trapped|trapdoor|strap|trapez|trappist/.test(tagText)) {
    return {
      genre: "トラップ",
      labelEvidence: "FMA track/album/artist tags contain explicit trap/phonk/808 wording",
      labelConfidence: "explicit-tag"
    };
  }

  if (TARGETS.includes("アニメソング") && /\banime\b|anisong|ani[- ]?song|anime theme|anime ost|anime soundtrack/.test(titleText)) {
    return {
      genre: "アニメソング",
      labelEvidence: "FMA track or album title contains explicit anime/anison wording",
      labelConfidence: "explicit-title-or-album"
    };
  }

  if (TARGETS.includes("シティ・ポップ") && /\bcity[- ]?pop\b/.test(tagText)) {
    return {
      genre: "シティ・ポップ",
      labelEvidence: "FMA tag contains explicit city-pop wording",
      labelConfidence: "explicit-tag"
    };
  }

  if (TARGETS.includes("シティ・ポップ") && ALLOW_CITY_POP_ADJACENT && /\bfuture funk\b|\bsynth[- ]?pop\b|\bretrofuture\b/.test(tagText)) {
    return {
      genre: "シティ・ポップ",
      labelEvidence: "FMA tag contains city-pop-adjacent future funk/synth-pop/retrofuture wording",
      labelConfidence: "adjacent-tag"
    };
  }

  return null;
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
  const rejected = {
    noEvidence: 0,
    noMacro: 0,
    noLicense: 0,
    existing: 0,
    noAudio: 0,
    genreLimit: 0
  };
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
    const evidence = evidenceFor(row);
    if (!evidence) {
      rejected.noEvidence += 1;
      return;
    }
    if ((counts[evidence.genre] || 0) >= TARGET_PER_GENRE) {
      rejected.genreLimit += 1;
      return;
    }
    const macroGenre = MACRO_BY_FINE[evidence.genre] || "";
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
    if (!license || !licenseUrl) {
      rejected.noLicense += 1;
      return;
    }
    selected.push({
      source: "FMA",
      sourceType: "cc-dataset",
      datasetName: "FMA explicit sparse formal",
      trackId,
      genre: evidence.genre,
      macroGenre,
      trainingRole: "fine",
      filePath,
      sourceUrl: filePath,
      referenceUrl,
      license,
      licenseUrl,
      canonicalArtist: row["artist.name"] || "",
      canonicalTitle: row["track.title"] || "",
      labelEvidence: evidence.labelEvidence,
      labelConfidence: evidence.labelConfidence,
      audioStoragePolicy: "external-local-audio; persist-features-only",
      reviewStatus: "auto-approved-fma-explicit-sparse",
      reviewNote: "Promoted only from explicit FMA tags/title/album evidence. Artist biography and long descriptions are intentionally ignored."
    });
    counts[evidence.genre] = (counts[evidence.genre] || 0) + 1;
  });

  const payload = {
    description: "Strict FMA manifest for sparse MMFR formal genres. Source audio stays outside this repository; cc-import persists features only.",
    generatedAt: new Date().toISOString(),
    tracksCsv,
    audioRoot,
    targetGenres: TARGETS,
    targetPerGenre: TARGET_PER_GENRE,
    allowCityPopAdjacent: ALLOW_CITY_POP_ADJACENT,
    selectionPolicy: "Use explicit FMA tags for trap/city-pop and explicit title/album wording for anime-song. Ignore biographies and long descriptions to avoid accidental matches.",
    counts,
    rejected,
    items: selected
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  fs.writeFileSync(REPORT_PATH, JSON.stringify({
    generatedAt: payload.generatedAt,
    selected: selected.length,
    counts,
    rejected,
    sampleItems: selected.slice(0, 40).map(item => ({
      genre: item.genre,
      trackId: item.trackId,
      title: item.canonicalTitle,
      artist: item.canonicalArtist,
      labelEvidence: item.labelEvidence,
      labelConfidence: item.labelConfidence,
      license: item.license
    }))
  }, null, 2));
  console.log(JSON.stringify({
    output: path.relative(ROOT, OUT_PATH),
    report: path.relative(ROOT, REPORT_PATH),
    selected: selected.length,
    counts,
    rejected
  }, null, 2));
}
