import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const LOCAL_CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
const VERIFIED_PATH = path.join(TRAINING_DIR, "verified-dataset.json");

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

const LOCAL_CACHE_PATHS = loadJson(LOCAL_CACHE_PATHS_PATH, {});
const FEATURE_CACHE_PATH = path.resolve(
  process.env.MMFR_GENRE_FEATURE_CACHE_PATH
  || LOCAL_CACHE_PATHS.featureCachePath
  || path.join(TRAINING_DIR, "feature-cache.json")
);

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

function compactVerified() {
  const payload = loadJson(VERIFIED_PATH, null);
  if (!payload?.items) return { path: VERIFIED_PATH, skipped: true };
  let compacted = 0;
  for (const item of payload.items) {
    if (item.features || item.audioFeatures) {
      item.features = compactAudioFeatures(item.features || item.audioFeatures);
      delete item.audioFeatures;
      compacted += 1;
    }
  }
  fs.writeFileSync(VERIFIED_PATH, JSON.stringify(payload, null, 2));
  return { path: VERIFIED_PATH, compacted };
}

function compactFeatureCache() {
  const payload = loadJson(FEATURE_CACHE_PATH, null);
  if (!payload?.items) return { path: FEATURE_CACHE_PATH, skipped: true };
  let compacted = 0;
  for (const item of Object.values(payload.items)) {
    if (item?.features) {
      item.features = compactAudioFeatures(item.features);
      compacted += 1;
    }
  }
  fs.writeFileSync(FEATURE_CACHE_PATH, JSON.stringify(payload, null, 2));
  return { path: FEATURE_CACHE_PATH, compacted };
}

const before = {
  verifiedBytes: fs.existsSync(VERIFIED_PATH) ? fs.statSync(VERIFIED_PATH).size : 0,
  cacheBytes: fs.existsSync(FEATURE_CACHE_PATH) ? fs.statSync(FEATURE_CACHE_PATH).size : 0
};
const verified = compactVerified();
const cache = compactFeatureCache();
const after = {
  verifiedBytes: fs.existsSync(VERIFIED_PATH) ? fs.statSync(VERIFIED_PATH).size : 0,
  cacheBytes: fs.existsSync(FEATURE_CACHE_PATH) ? fs.statSync(FEATURE_CACHE_PATH).size : 0
};

console.log(JSON.stringify({ before, after, verified, cache }, null, 2));
