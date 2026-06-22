import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const LOCAL_CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
function loadLocalCachePaths() {
  if (!fs.existsSync(LOCAL_CACHE_PATHS_PATH)) return {};
  try {
    const payload = JSON.parse(fs.readFileSync(LOCAL_CACHE_PATHS_PATH, "utf8"));
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return {};
  }
}
const LOCAL_CACHE_PATHS = loadLocalCachePaths();
const VERIFIED_PATH = path.join(TRAINING_DIR, "verified-dataset.json");
const RESULTS_PATH = path.join(TRAINING_DIR, "results.json");
const REPORT_PATH = path.join(TRAINING_DIR, "fma-metadata-import-report.json");
const EXTERNAL_DATA_DIR = path.resolve(process.env.MMFR_EXTERNAL_DATA_DIR || LOCAL_CACHE_PATHS.externalDataDir || path.join(ROOT, ".external-data"));
const DEFAULT_FMA_DIR = path.join(EXTERNAL_DATA_DIR, "fma", "fma_metadata");

const FMA_DIR = path.resolve(process.env.MMFR_FMA_METADATA_DIR || DEFAULT_FMA_DIR);
const TRACKS_PATH = path.resolve(process.env.MMFR_FMA_TRACKS_CSV || path.join(FMA_DIR, "tracks.csv"));
const FEATURES_PATH = path.resolve(process.env.MMFR_FMA_FEATURES_CSV || path.join(FMA_DIR, "features.csv"));
const LIMIT_PER_GENRE = Math.max(1, Number(process.env.MMFR_FMA_METADATA_LIMIT_PER_GENRE || 120));
const WEAK_ONLY = process.env.MMFR_FMA_WEAK_ONLY !== "0";

const FMA_TO_FINE = [
  [/drum.?n.?bass|jungle/i, "ドラムンベース"],
  [/dubstep/i, "ダブステップ"],
  [/chiptune|chip music|8-?bit/i, "チップチューン"],
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
  [/\bpop\b/i, "J-POP"],
  [/electronic|electronica|idm|dance/i, "電子音楽"],
  [/experimental/i, "ノイズミュージック"],
  [/instrumental/i, "クラシック音楽"]
];

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

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function parseCsvLine(line) {
  const cells = [];
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
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

function splitLines(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(line => line.length);
}

function fineGenreFromText(text) {
  for (const [pattern, genre] of FMA_TO_FINE) {
    if (pattern.test(text)) return genre;
  }
  return "";
}

function weakGenreSet() {
  if (!WEAK_ONLY) return null;
  const payload = loadJson(RESULTS_PATH, {});
  const weak = Array.isArray(payload.weakGenres) ? payload.weakGenres : [];
  return new Set(weak.map(row => row.genre).filter(Boolean));
}

function sourceKey(item = {}) {
  return `${item.sourceType || "fma-metadata"}:${item.trackId || item.sourceUrl || ""}`;
}

function loadTracks() {
  const lines = splitLines(fs.readFileSync(TRACKS_PATH, "utf8"));
  const h0 = parseCsvLine(lines[0] || "");
  const h1 = parseCsvLine(lines[1] || "");
  const headers = h0.map((top, index) => {
    if (index === 0) return "track_id";
    return [top, h1[index]].filter(Boolean).join(".");
  });
  const tracks = new Map();
  for (const line of lines.slice(3)) {
    const cells = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
    const trackId = String(row.track_id || "").trim();
    if (!trackId) continue;
    const genreText = [
      row["track.genre_top"],
      row["track.genres"],
      row["track.genres_all"],
      row["track.tags"],
      row["album.tags"],
      row["artist.tags"]
    ].join(" ");
    const genre = fineGenreFromText(genreText);
    if (!genre) continue;
    tracks.set(trackId, {
      trackId,
      genre,
      macroGenre: MACRO_BY_FINE[genre],
      artistName: row["artist.name"] || "",
      trackName: row["track.title"] || "",
      referenceUrl: row["track.information"] || row["album.information"] || "",
      license: "Creative Commons",
      licenseUrl: ""
    });
  }
  return tracks;
}

function statsFor(headers, cells, feature, stat) {
  const values = [];
  headers.forEach((header, index) => {
    const parts = String(header || "").split(".");
    if (parts[0] === feature && (parts[1] === stat || parts[2] === stat)) {
      const value = Number(cells[index]);
      if (Number.isFinite(value)) values.push(value);
    }
  });
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function vectorFromFma(headers, cells) {
  const rmse = statsFor(headers, cells, "rmse", "mean");
  const rmseStd = statsFor(headers, cells, "rmse", "std");
  const centroid = statsFor(headers, cells, "spectral_centroid", "mean");
  const centroidStd = statsFor(headers, cells, "spectral_centroid", "std");
  const bandwidth = statsFor(headers, cells, "spectral_bandwidth", "mean");
  const rolloff = statsFor(headers, cells, "spectral_rolloff", "mean");
  const zcr = statsFor(headers, cells, "zcr", "mean");
  const zcrStd = statsFor(headers, cells, "zcr", "std");
  const contrast = statsFor(headers, cells, "spectral_contrast", "mean");
  const contrastStd = statsFor(headers, cells, "spectral_contrast", "std");
  const chroma = statsFor(headers, cells, "chroma_cqt", "mean") || statsFor(headers, cells, "chroma_stft", "mean");
  const chromaStd = statsFor(headers, cells, "chroma_cqt", "std") || statsFor(headers, cells, "chroma_stft", "std");
  const mfcc = statsFor(headers, cells, "mfcc", "mean");
  const mfccStd = statsFor(headers, cells, "mfcc", "std");
  const tonnetz = statsFor(headers, cells, "tonnetz", "mean");
  const tonnetzStd = statsFor(headers, cells, "tonnetz", "std");

  const energy = clamp01(Math.sqrt(Math.max(0, rmse)) * 2.4);
  const brightness = clamp01((centroid - 500) / 5200);
  const highBandRatio = clamp01((rolloff - 2500) / 6000);
  const midBandRatio = clamp01((bandwidth - 900) / 3000);
  const lowBandRatio = clamp01(1 - highBandRatio * .72 - midBandRatio * .28);
  const onset = clamp01(rmseStd * 5.6 + zcrStd * 3.2);
  const chromaMotion = clamp01(chromaStd * 2.2 + tonnetzStd * 1.4);
  const chromaEntropy = clamp01(Math.abs(chroma) * .18 + chromaStd * 2);
  const distortion = clamp01(zcr * 4.8 + contrastStd * .12);
  const acousticness = clamp01(1 - distortion * .45 - highBandRatio * .24 + chromaMotion * .16);
  const tempoProxy = 86 + Math.round(onset * 72 + zcr * 160);

  return {
    source: "fma-precomputed-features",
    sourceType: "fma-metadata",
    tempo: Math.max(60, Math.min(190, tempoProxy)),
    energy,
    rms: energy,
    bass: lowBandRatio,
    lowBandRatio,
    midBandRatio,
    highBandRatio,
    rhythm: clamp01(onset * 1.2),
    onset,
    brightness,
    zcr: clamp01(zcr * 4),
    rmsContrast: clamp01(rmseStd * 6),
    onsetContrast: clamp01(onset * .9 + contrastStd * .06),
    bassContrast: clamp01(lowBandRatio * rmseStd * 4),
    centroidContrast: clamp01(centroidStd / 3200),
    chromaEntropy,
    chromaMotion,
    onsetDensity: clamp01(onset * 1.16),
    onsetRegularity: clamp01(1 - contrastStd * .07 + onset * .14),
    rmsBuild: clamp01(rmseStd * 4.5),
    chorusLift: clamp01(rmseStd * 4 + chromaMotion * .3),
    midDensity: midBandRatio,
    guitarBand: clamp01(midBandRatio * .7 + distortion * .34),
    vocalBand: clamp01(midBandRatio * .62 + chromaMotion * .28),
    acousticness,
    distortion,
    breakbeatDensity: clamp01(onset * .8 + zcr * 2.2),
    squareWave: clamp01(zcr * 3.2 + Math.abs(mfcc) * .006),
    tonalCentroid: Math.round(centroid),
    spectralCentroid: Math.round(centroid),
    phase: 0,
    chroma: Array.from({ length: 12 }, (_, index) => clamp01(chromaEntropy * (index % 3 === 0 ? 1 : .55))),
    temporalProfile: Array.from({ length: 16 }, (_, index) => clamp01(energy * (.72 + Math.sin(index / 15 * Math.PI) * .28))),
    detail: {
      version: "fma-precomputed-detail.v1",
      frameCount: 0,
      waveformFrameCount: 0,
      waveform: [],
      rms: [],
      bass: [],
      centroid: [],
      onset: [],
      zeroCrossing: [],
      chromaTimeline: [],
      bandTimeline: []
    }
  };
}

async function eachFeatureRow(onRow) {
  const input = fs.createReadStream(FEATURES_PATH, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let lineIndex = 0;
  let top = [];
  let mid = [];
  let low = [];
  let headers = [];
  for await (const line of rl) {
    if (!line.length) continue;
    if (lineIndex === 0) {
      top = parseCsvLine(line);
    } else if (lineIndex === 1) {
      mid = parseCsvLine(line);
    } else if (lineIndex === 2) {
      low = parseCsvLine(line);
      headers = top.map((value, index) => {
        if (index === 0) return "track_id";
        return [value, mid[index], low[index]].filter(Boolean).join(".");
      });
    } else if (lineIndex > 3) {
      await onRow(headers, parseCsvLine(line));
    }
    lineIndex++;
  }
}

function featureHeadersFromProbe() {
  const lines = [];
  const fd = fs.openSync(FEATURES_PATH, "r");
  const buffer = Buffer.alloc(1024 * 256);
  const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
  fs.closeSync(fd);
  for (const line of buffer.subarray(0, bytesRead).toString("utf8").split(/\r?\n/)) {
    if (line.length) lines.push(line);
    if (lines.length >= 3) break;
  }
  const top = parseCsvLine(lines[0] || "");
  const mid = parseCsvLine(lines[1] || "");
  const low = parseCsvLine(lines[2] || "");
  const headers = top.map((value, index) => {
    if (index === 0) return "track_id";
    return [value, mid[index], low[index]].filter(Boolean).join(".");
  });
  return headers;
}

async function main() {
  if (!fs.existsSync(TRACKS_PATH)) throw new Error(`tracks.csv not found: ${TRACKS_PATH}`);
  if (!fs.existsSync(FEATURES_PATH)) throw new Error(`features.csv not found: ${FEATURES_PATH}`);
  const weakSet = weakGenreSet();
  const tracks = loadTracks();
  const probedHeaders = featureHeadersFromProbe();
  const verifiedPayload = loadJson(VERIFIED_PATH, { items: [] });
  const items = Array.isArray(verifiedPayload) ? verifiedPayload : verifiedPayload.items || [];
  const usedKeys = new Set(items.map(sourceKey).filter(Boolean));
  const counts = items.reduce((acc, item) => {
    if (item.sourceType === "fma-metadata") acc[item.genre] = (acc[item.genre] || 0) + 1;
    return acc;
  }, {});
  const imported = [];
  const rejected = [];

  await eachFeatureRow(async (headers, cells) => {
    const trackId = String(cells[0] || "").trim();
    const meta = tracks.get(trackId);
    if (!meta) return;
    if (weakSet && weakSet.size && !weakSet.has(meta.genre)) {
      rejected.push({ trackId, genre: meta.genre, rejectReason: "not-in-current-weak-genre-set" });
      return;
    }
    if ((counts[meta.genre] || 0) >= LIMIT_PER_GENRE) {
      rejected.push({ trackId, genre: meta.genre, rejectReason: "genre-limit-reached" });
      return;
    }
    const row = {
      source: "FMA",
      sourceType: "fma-metadata",
      datasetName: "FMA metadata/features",
      trackId,
      genre: meta.genre,
      macroGenre: meta.macroGenre,
      trainingRole: meta.genre === "電子音楽" || meta.genre === "ワールドミュージック" ? "macro-only" : "fine",
      sourceUrl: `fma:track:${trackId}`,
      referenceUrl: meta.referenceUrl || `https://github.com/mdeff/fma`,
      license: meta.license,
      licenseUrl: meta.licenseUrl,
      canonicalArtist: meta.artistName,
      canonicalTitle: meta.trackName,
      audioOk: true,
      verifiedAt: new Date().toISOString(),
      audioStoragePolicy: "precomputed-features-only; no-audio-imported",
      memo: "Imported from FMA precomputed features. Source audio is Creative Commons in FMA, but audio was not downloaded or stored.",
      features: vectorFromFma(headers.length ? headers : probedHeaders, cells)
    };
    if (usedKeys.has(sourceKey(row))) return;
    imported.push(row);
    items.push(row);
    usedKeys.add(sourceKey(row));
    counts[row.genre] = (counts[row.genre] || 0) + 1;
  });

  fs.writeFileSync(VERIFIED_PATH, JSON.stringify({
    description: "Verified genre training items. FMA metadata rows persist precomputed acoustic features only; audio is not stored.",
    collectedAt: new Date().toISOString(),
    sourcePolicy: "mixed; Creative Commons/public research datasets preferred for new training data",
    audioStoragePolicy: "features-only",
    items,
    missing: []
  }, null, 2));
  fs.writeFileSync(REPORT_PATH, JSON.stringify({
    importedAt: new Date().toISOString(),
    fmaDir: FMA_DIR,
    tracksPath: TRACKS_PATH,
    featuresPath: FEATURES_PATH,
    weakOnly: WEAK_ONLY,
    limitPerGenre: LIMIT_PER_GENRE,
    imported: imported.length,
    importedByGenre: imported.reduce((acc, item) => {
      acc[item.genre] = (acc[item.genre] || 0) + 1;
      return acc;
    }, {}),
    rejectedByReason: rejected.reduce((acc, item) => {
      acc[item.rejectReason] = (acc[item.rejectReason] || 0) + 1;
      return acc;
    }, {})
  }, null, 2));
  console.log(`Imported ${imported.length} FMA metadata feature rows.`);
  console.log(`Wrote ${path.relative(ROOT, VERIFIED_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, REPORT_PATH)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
