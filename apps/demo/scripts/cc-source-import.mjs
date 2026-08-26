import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const VERIFIED_PATH = path.join(TRAINING_DIR, "verified-dataset.json");
const REPORT_PATH = path.join(TRAINING_DIR, "cc-source-import-report.json");
const RESULTS_PATH = path.join(TRAINING_DIR, "results.json");
const DEFAULT_MANIFEST = path.join(TRAINING_DIR, "cc-source-manifest.json");

const MANIFEST_PATH = path.resolve(process.env.MMFR_CC_MANIFEST_PATH || DEFAULT_MANIFEST);
const AUDIO_ROOT = process.env.MMFR_CC_AUDIO_ROOT ? path.resolve(process.env.MMFR_CC_AUDIO_ROOT) : "";
const AUDIO_ENDPOINT = process.env.MMFR_AUDIO_ENDPOINT || "http://127.0.0.1:4194/api/audio-analyze";
const LIMIT_PER_GENRE = Math.max(1, Number(process.env.MMFR_CC_LIMIT_PER_GENRE || 50));
const LIMIT_TOTAL = Math.max(0, Number(process.env.MMFR_CC_IMPORT_LIMIT_TOTAL || 0));
const DURATION_SECONDS = Math.max(10, Math.min(180, Number(process.env.MMFR_CC_ANALYSIS_SECONDS || 60)));
const WEAK_ONLY = process.env.MMFR_CC_WEAK_ONLY !== "0";
const SOURCE_KIND = String(process.env.MMFR_CC_SOURCE_KIND || "").trim().toLowerCase();
const DRY_RUN = process.env.MMFR_CC_IMPORT_DRY_RUN === "1";
const START_AFTER = String(process.env.MMFR_CC_IMPORT_START_AFTER || "").trim();
const REPORT_EVERY = Math.max(1, Number(process.env.MMFR_CC_IMPORT_REPORT_EVERY || 25));
const USAGE_SCOPE = String(process.env.MMFR_CC_USAGE_SCOPE || "production").trim().toLowerCase();
const DEFAULT_ALLOWED_LICENSES = USAGE_SCOPE === "research"
  ? "CC0,CC-BY,CC-BY-SA,CC-BY-NC,CC-BY-NC-SA,RESEARCH-USE-COPYRIGHT-CLEARED"
  : "CC0,CC-BY,CC-BY-SA";
const ALLOWED_LICENSES = new Set(
  String(process.env.MMFR_CC_ALLOWED_LICENSES || DEFAULT_ALLOWED_LICENSES)
    .split(",")
    .map(value => value.trim().toUpperCase())
    .filter(Boolean)
);
const REQUIRED_MANIFEST_FIELDS = ["genre", "macroGenre", "filePath", "license", "licenseUrl", "referenceUrl"];

const MACRO_BY_FINE = {
  "アンビエント": "ambient",
  "ドローン": "ambient",
  "ノイズミュージック": "ambient",
  "電子音楽": "electronic",
  "テクノ": "electronic",
  "ハウス": "electronic",
  "ディープ・ハウス": "electronic",
  "トランス": "electronic",
  "ドラムンベース": "electronic",
  "ダブステップ": "electronic",
  "チップチューン": "electronic",
  "ヒップホップ": "black_music",
  "トラップ": "black_music",
  "レゲエ": "black_music",
  "ダブ": "black_music",
  "ブルース": "black_music",
  "ファンク": "black_music",
  "ソウルミュージック": "black_music",
  "ディスコ": "black_music",
  "ロック": "rock",
  "パンク": "rock",
  "ハードコア": "rock",
  "メタル": "rock",
  "ジャズ": "jazz",
  "シティ・ポップ": "pop",
  "J-POP": "pop",
  "アニメソング": "pop",
  "クラシック音楽": "classical",
  "オペラ": "classical",
  "フォーク": "world",
  "ラテン": "world",
  "ワールドミュージック": "world"
};

const FMA_GENRE_HINTS = [
  [/drum.?n.?bass|jungle/i, "ドラムンベース"],
  [/dubstep/i, "ダブステップ"],
  [/chiptune|8-?bit/i, "チップチューン"],
  [/deep house/i, "ディープ・ハウス"],
  [/\bhouse\b/i, "ハウス"],
  [/\btechno\b|minimal techno/i, "テクノ"],
  [/\btrance\b/i, "トランス"],
  [/ambient/i, "アンビエント"],
  [/drone/i, "ドローン"],
  [/noise/i, "ノイズミュージック"],
  [/hip.?hop|rap/i, "ヒップホップ"],
  [/\btrap\b/i, "トラップ"],
  [/reggae/i, "レゲエ"],
  [/\bdub\b/i, "ダブ"],
  [/blues/i, "ブルース"],
  [/funk/i, "ファンク"],
  [/soul|r&b/i, "ソウルミュージック"],
  [/disco/i, "ディスコ"],
  [/hardcore/i, "ハードコア"],
  [/metal/i, "メタル"],
  [/punk/i, "パンク"],
  [/rock/i, "ロック"],
  [/jazz/i, "ジャズ"],
  [/classical|symphony|chamber/i, "クラシック音楽"],
  [/opera/i, "オペラ"],
  [/folk|singer.?songwriter/i, "フォーク"],
  [/latin|salsa|samba|bossa|cumbia|afro.?cuban/i, "ラテン"],
  [/international|world|african|indian|middle east/i, "ワールドミュージック"],
  [/electronic|electronica|idm|dance/i, "電子音楽"]
];

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === "\"" && next === "\"") {
        cell += "\"";
        i++;
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
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line) {
  const row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (quoted) {
      if (ch === "\"" && next === "\"") {
        cell += "\"";
        i++;
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
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  row.push(cell);
  return row;
}

function parseCsvEach(text, onRow) {
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === "\"" && next === "\"") {
        cell += "\"";
        i++;
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
  if (!text) return "";
  if (/RESEARCH[-_\s]?USE[-_\s]?COPYRIGHT[-_\s]?CLEARED/.test(text)) return "RESEARCH-USE-COPYRIGHT-CLEARED";
  if (/CC0|PUBLIC DOMAIN/.test(text)) return "CC0";
  if (/ATTRIBUTION/.test(text)) {
    const parts = ["CC-BY"];
    if (/NON.?COMMERCIAL/.test(text)) parts.push("NC");
    if (/SHARE.?ALIKE/.test(text)) parts.push("SA");
    if (/NO.?DERIV|NODERIV|NO DERIV/.test(text)) parts.push("ND");
    return parts.join("-");
  }
  const match = text.match(/CC[- ]?BY(?:[- ]?NC)?(?:[- ]?SA)?(?:[- ]?ND)?/);
  return match ? match[0].replace(/\s+/g, "-").replace(/^CCBY/, "CC-BY") : text;
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

function sourceKey(item = {}) {
  const type = item.sourceType || "cc-dataset";
  const value = item.sourceUrl || item.filePath || item.referenceUrl || item.trackId || "";
  return value ? `${type}:${value}` : "";
}

function sourceKeys(item = {}) {
  const type = item.sourceType || "cc-dataset";
  const primary = [
    item.sourceUrl,
    item.filePath,
    item.trackId
  ]
    .map(value => String(value || "").trim())
    .filter(Boolean);
  const values = primary.length ? primary : [item.referenceUrl].map(value => String(value || "").trim()).filter(Boolean);
  return values
    .map(value => `${type}:${value}`);
}

function weakGenreSet() {
  if (!WEAK_ONLY) return null;
  const payload = loadJson(RESULTS_PATH, {});
  const weak = Array.isArray(payload.weakGenres) ? payload.weakGenres : [];
  if (weak.length) return new Set(weak.map(row => row.genre).filter(Boolean));
  const byGenre = Array.isArray(payload.byGenre) ? payload.byGenre : [];
  return new Set(byGenre.filter(row => row.fineTotal && (row.fineTop1Accuracy < 55 || row.fineTop3Accuracy < 70)).map(row => row.genre));
}

function genreFromText(text, fallback = "") {
  const joined = String(text || "");
  for (const [pattern, genre] of FMA_GENRE_HINTS) {
    if (pattern.test(joined)) return genre;
  }
  return fallback;
}

function resolveAudioPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return path.resolve(AUDIO_ROOT || path.dirname(MANIFEST_PATH), raw);
}

function isInsideRepo(value) {
  const relative = path.relative(ROOT, path.resolve(value));
  return Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function fmaAudioPath(trackId) {
  const id = String(trackId || "").padStart(6, "0");
  if (!/^\d{6}$/.test(id) || !AUDIO_ROOT) return "";
  return path.join(AUDIO_ROOT, id.slice(0, 3), `${id}.mp3`);
}

function field(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== "") return row[key];
  }
  return "";
}

function rowsFromFlatCsv(csvRows) {
  const headers = csvRows[0].map(header => String(header || "").trim());
  return csvRows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function rowsFromFmaTracksCsv(csvRows) {
  const top = csvRows[0] || [];
  const mid = csvRows[1] || [];
  const low = csvRows[2] || [];
  const headers = top.map((value, index) => [value, mid[index], low[index]].filter(Boolean).join("."));
  return csvRows.slice(3).map(values => Object.fromEntries(headers.map((header, index) => [header || "track_id", values[index] || ""])));
}

function rowsFromFmaTracksText(text) {
  const headerRows = [];
  const rows = [];
  let headers = [];
  const keep = new Set([
    "track_id",
    "track.genre_top",
    "track.genres",
    "track.genres_all",
    "track.tags",
    "track.title",
    "track.license",
    "track.information",
    "artist.name",
    "artist.tags",
    "album.title"
  ]);
  let keepIndexes = [];
  parseCsvEach(text, values => {
    if (headerRows.length < 3) {
      headerRows.push(values);
      if (headerRows.length === 3) {
        const [top, mid, low] = headerRows;
        headers = top.map((value, index) => [value, mid[index], low[index]].filter(Boolean).join(".") || "track_id");
        keepIndexes = headers
          .map((header, index) => [header, index])
          .filter(([header]) => keep.has(header));
      }
      return;
    }
    if (!values.length || !values[0]) return;
    const row = {};
    for (const [header, index] of keepIndexes) {
      row[header] = values[index] || "";
    }
    rows.push(row);
  });
  return rows;
}

function manifestItems() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`CC manifest not found: ${MANIFEST_PATH}`);
  }
  if (/\.json$/i.test(MANIFEST_PATH)) {
    const payload = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    return Array.isArray(payload) ? payload : payload.items || [];
  }
  if (/\.csv$/i.test(MANIFEST_PATH)) {
    const text = fs.readFileSync(MANIFEST_PATH, "utf8");
    if (SOURCE_KIND === "fma" || /^,album,album,/.test(text.slice(0, 128))) {
      return rowsFromFmaTracksText(text);
    }
    const csvRows = parseCsv(text);
    if (!csvRows.length) return [];
    return rowsFromFlatCsv(csvRows);
  }
  throw new Error(`Unsupported manifest format: ${MANIFEST_PATH}`);
}

function normalizeItem(raw, index) {
  const trackId = field(raw, ["trackId", "track_id", "track.track_id", ""]);
  const fmaText = [
    field(raw, ["genre", "track.genre_top", "track.genres", "track.genres_all"]),
    field(raw, ["tags", "track.tags"]),
    field(raw, ["title", "track.title"]),
    field(raw, ["artistName", "artist.name"])
  ].join(" ");
  const explicitGenre = field(raw, ["targetGenre", "genreJa", "mmfrGenre", "genre"]);
  const genre = MACRO_BY_FINE[explicitGenre] ? explicitGenre : genreFromText(fmaText, explicitGenre);
  const macroGenre = field(raw, ["macroGenre", "macro"]) || MACRO_BY_FINE[genre] || "";
  const explicitTrainingRole = field(raw, ["trainingRole", "training_role"]);
  const license = normalizeLicense(field(raw, ["license", "track.license", "licenseTitle"]));
  const licenseUrl = field(raw, ["licenseUrl", "license_url", "license.url"]) || licenseUrlFor(license);
  const filePath = resolveAudioPath(field(raw, ["filePath", "localAudioPath", "audioPath", "path"])) || fmaAudioPath(trackId);
  const referenceUrl = field(raw, ["referenceUrl", "trackUrl", "url", "track.information"])
    || (SOURCE_KIND === "fma" && trackId ? `https://freemusicarchive.org/track/${trackId}` : "");
  return {
    source: field(raw, ["source"]) || (SOURCE_KIND === "fma" ? "FMA" : "CreativeCommonsDataset"),
    sourceType: "cc-dataset",
    datasetName: field(raw, ["datasetName", "dataset"]) || (SOURCE_KIND === "fma" ? "FMA" : "cc-dataset"),
    trackId: trackId || String(index + 1),
    genre,
    macroGenre,
    trainingRole: explicitTrainingRole || (genre === "電子音楽" || genre === "ワールドミュージック" || genre === "ポップ大分類" ? "macro-only" : "fine"),
    filePath,
    sourceUrl: filePath,
    referenceUrl,
    license,
    licenseUrl,
    canonicalArtist: field(raw, ["canonicalArtist", "artistName", "artist.name"]),
    canonicalTitle: field(raw, ["canonicalTitle", "trackName", "track.title", "title"]),
    tags: field(raw, ["tags", "track.tags"]),
    segmentType: field(raw, ["segmentType", "segment_type"]),
    labelEvidence: field(raw, ["labelEvidence", "label_evidence"]),
    labelConfidence: field(raw, ["labelConfidence", "label_confidence"]),
    reviewStatus: field(raw, ["reviewStatus", "review_status"]),
    reviewNote: field(raw, ["reviewNote", "review_note"]),
    audioStoragePolicy: "external-local-audio; persist-features-only"
  };
}

function validateManifestItem(item) {
  const missing = REQUIRED_MANIFEST_FIELDS.filter(fieldName => !String(item[fieldName] || "").trim());
  if (missing.length) return `manifest-required-field-missing:${missing.join(",")}`;
  if (!fs.existsSync(item.filePath)) return "audio-file-missing";
  if (isInsideRepo(item.filePath)) return "audio-file-inside-repo";
  if (item.license && !ALLOWED_LICENSES.has(item.license)) return `license-not-allowed:${item.license}`;
  if (/artlist/i.test([item.source, item.datasetName, item.referenceUrl, item.licenseUrl].join(" "))) return "source-not-allowed:artlist";
  return "";
}

function shortItemLabel(item = {}) {
  return [
    item.genre || "unknown",
    item.trackId || item.canonicalTitle || path.basename(String(item.filePath || "")) || "item"
  ].join(" ");
}

function increment(acc, key) {
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}

function compactSeries(values, length = 64) {
  if (!Array.isArray(values)) return [];
  if (values.length <= length) return values.map(value => Number(value) || 0);
  return Array.from({ length }, (_, index) => {
    const sourceIndex = Math.min(values.length - 1, Math.round(index * (values.length - 1) / Math.max(1, length - 1)));
    return Number(values[sourceIndex]) || 0;
  });
}

function compactMatrix(rows, rowCount = 24, colCount = 12) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const sampledIndexes = compactSeries(rows.map((_, index) => index), Math.min(rowCount, rows.length));
  return sampledIndexes.map(index => compactSeries(rows[Math.max(0, Math.min(rows.length - 1, Math.round(index)))] || [], colCount));
}

function compactAudioFeatures(features = {}) {
  const detail = features.detail && typeof features.detail === "object" ? features.detail : {};
  return {
    source: features.source,
    tempo: features.tempo,
    energy: features.energy,
    rms: features.rms,
    bass: features.bass,
    brightness: features.brightness,
    lowBandRatio: features.lowBandRatio,
    midBandRatio: features.midBandRatio,
    highBandRatio: features.highBandRatio,
    tonalCentroid: features.tonalCentroid,
    spectralCentroid: features.spectralCentroid,
    centroid: features.centroid,
    rhythm: features.rhythm,
    onset: features.onset,
    phase: features.phase,
    chroma: compactSeries(features.chroma, 12),
    temporalProfile: compactSeries(features.temporalProfile, 16),
    detail: {
      version: detail.version || "mmfr.training-detail.v1",
      frameCount: detail.frameCount,
      waveformFrameCount: Math.min(Number(detail.waveformFrameCount || detail.waveform?.length || 0), 64),
      chromaFrameCount: Math.min(Number(detail.chromaFrameCount || detail.chromaTimeline?.length || 0), 24),
      bandFrameCount: Math.min(Number(detail.bandFrameCount || detail.bandTimeline?.length || 0), 24),
      waveform: compactSeries(detail.waveform, 64),
      rms: compactSeries(detail.rms, 64),
      bass: compactSeries(detail.bass, 64),
      centroid: compactSeries(detail.centroid, 64),
      onset: compactSeries(detail.onset, 64),
      zeroCrossing: compactSeries(detail.zeroCrossing, 64),
      chromaTimeline: compactMatrix(detail.chromaTimeline, 24, 12),
      bandTimeline: compactMatrix(detail.bandTimeline, 24, 8)
    },
    sourceType: features.sourceType,
    sourceUrl: features.sourceUrl,
    normalizedUrl: features.normalizedUrl,
    startSeconds: features.startSeconds,
    analysisWindowSeconds: features.analysisWindowSeconds,
    localMeta: features.localMeta
  };
}

function postJson(endpoint, body) {
  return new Promise((resolve, reject) => {
    const target = new URL(endpoint);
    const payload = JSON.stringify(body);
    const transport = target.protocol === "https:" ? https : http;
    const request = transport.request({
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    }, response => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { raw += chunk; });
      response.on("end", () => {
        try {
          const json = raw ? JSON.parse(raw) : {};
          resolve({ ok: response.statusCode >= 200 && response.statusCode < 300 && json.ok !== false, json });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.setTimeout(180000, () => request.destroy(new Error("CC audio analysis timed out")));
    request.write(payload);
    request.end();
  });
}

async function analyzeItem(item) {
  const response = await postJson(AUDIO_ENDPOINT, {
    action: "analyze-local-file",
    filePath: item.filePath,
    sourceType: "cc-dataset",
    durationSeconds: DURATION_SECONDS,
    localMeta: {
      datasetName: item.datasetName,
      trackId: item.trackId,
      artistName: item.canonicalArtist,
      trackName: item.canonicalTitle,
      license: item.license,
      licenseUrl: item.licenseUrl,
      referenceUrl: item.referenceUrl
    }
  });
  if (!response.ok) throw new Error(response.json?.error || "analysis failed");
  return compactAudioFeatures(response.json?.features || response.json?.audioFeatures || {});
}

async function main() {
  fs.mkdirSync(TRAINING_DIR, { recursive: true });
  const weakSet = weakGenreSet();
  const existingPayload = loadJson(VERIFIED_PATH, { items: [] });
  const existing = Array.isArray(existingPayload) ? existingPayload : existingPayload.items || [];
  const usedKeys = new Set(existing.flatMap(sourceKeys));
  const currentCounts = existing.reduce((acc, item) => {
    if (item.sourceType === "cc-dataset") acc[item.genre] = (acc[item.genre] || 0) + 1;
    return acc;
  }, {});
  const manifest = manifestItems();
  const selected = [];
  const imported = [];
  const rejected = [];
  const stats = {
    manifestRows: manifest.length,
    scanned: 0,
    skippedBeforeCursor: 0,
    ready: 0,
    analyzed: 0,
    dryRun: DRY_RUN
  };
  let cursorReached = !START_AFTER;

  for (const [index, raw] of manifest.entries()) {
    const item = normalizeItem(raw, index);
    const keys = sourceKeys(item);
    const key = keys[0] || sourceKey(item);
    stats.scanned += 1;
    if (!cursorReached) {
      if (keys.includes(START_AFTER) || key === START_AFTER || item.trackId === START_AFTER || item.filePath === START_AFTER || item.referenceUrl === START_AFTER) {
        cursorReached = true;
      } else {
        stats.skippedBeforeCursor += 1;
        rejected.push({ ...item, rejectReason: "before-start-after-cursor" });
        continue;
      }
    }
    if (!item.genre || !item.macroGenre) {
      rejected.push({ ...item, rejectReason: "genre-not-mapped" });
      continue;
    }
    if (weakSet && weakSet.size && !weakSet.has(item.genre)) {
      rejected.push({ ...item, rejectReason: "not-in-current-weak-genre-set" });
      continue;
    }
    const validationError = validateManifestItem(item);
    if (validationError) {
      rejected.push({ ...item, rejectReason: validationError });
      continue;
    }
    if (keys.some(value => usedKeys.has(value))) {
      rejected.push({ ...item, rejectReason: "already-imported" });
      continue;
    }
    if ((currentCounts[item.genre] || 0) >= LIMIT_PER_GENRE) {
      rejected.push({ ...item, rejectReason: "genre-limit-reached" });
      continue;
    }
    stats.ready += 1;
    selected.push(item);
    if (LIMIT_TOTAL && selected.length > LIMIT_TOTAL) {
      selected.pop();
      rejected.push({ ...item, rejectReason: "total-limit-reached" });
      break;
    }
    process.stdout.write(`${shortItemLabel(item)} ... `);
    if (DRY_RUN) {
      console.log("ready");
      continue;
    }
    try {
      stats.analyzed += 1;
      const features = await analyzeItem(item);
      const verified = {
        ...item,
        features,
        audioOk: true,
        verifiedAt: new Date().toISOString(),
        memo: `Verified Creative Commons dataset item from ${item.datasetName}`,
        audioStoragePolicy: "external-local-audio; features-only"
      };
      imported.push(verified);
      existing.push(verified);
      for (const value of keys) usedKeys.add(value);
      currentCounts[item.genre] = (currentCounts[item.genre] || 0) + 1;
      console.log("ok");
    } catch (error) {
      rejected.push({ ...item, rejectReason: `audio-validation-failed:${error.message}` });
      console.log(`error: ${error.message}`);
    }
    if ((imported.length + rejected.length) % REPORT_EVERY === 0) {
      console.log(`progress scanned=${stats.scanned}/${manifest.length} ready=${stats.ready} imported=${imported.length} rejected=${rejected.length}`);
    }
  }

  const collectedAt = new Date().toISOString();
  if (!DRY_RUN) {
    fs.writeFileSync(VERIFIED_PATH, JSON.stringify({
      description: "Verified genre training items. CC dataset items persist features only; source audio stays outside this repo.",
      collectedAt,
      endpoint: AUDIO_ENDPOINT,
      sourcePolicy: "mixed; Creative Commons/public research datasets preferred for new training data",
      audioStoragePolicy: "features-only",
      requiredManifestFields: REQUIRED_MANIFEST_FIELDS,
      disallowedSources: ["Artlist"],
      items: existing,
      missing: []
    }, null, 2));
  }
  fs.writeFileSync(REPORT_PATH, JSON.stringify({
    collectedAt,
    manifestPath: MANIFEST_PATH,
    audioRoot: AUDIO_ROOT,
    sourceKind: SOURCE_KIND || "manifest",
    weakOnly: WEAK_ONLY,
    dryRun: DRY_RUN,
    importLimitTotal: LIMIT_TOTAL || null,
    startAfter: START_AFTER || null,
    reportEvery: REPORT_EVERY,
    durationSeconds: DURATION_SECONDS,
    allowedLicenses: [...ALLOWED_LICENSES],
    usageScope: USAGE_SCOPE,
    stats,
    selected: selected.length,
    imported: imported.length,
    rejected: rejected.length,
    readyByGenre: selected.reduce((acc, item) => increment(acc, item.genre), {}),
    importedByGenre: imported.reduce((acc, item) => increment(acc, item.genre), {}),
    rejectedByReason: rejected.reduce((acc, item) => increment(acc, item.rejectReason), {}),
    rejected: rejected.slice(0, 200)
  }, null, 2));
  if (!DRY_RUN) console.log(`Wrote ${path.relative(ROOT, VERIFIED_PATH)}`);
  else console.log(`Dry run: did not write ${path.relative(ROOT, VERIFIED_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, REPORT_PATH)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
