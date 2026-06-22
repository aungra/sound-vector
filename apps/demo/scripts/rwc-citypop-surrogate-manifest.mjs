import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
const VERIFIED_FALLBACK_PATH = path.join(TRAINING_DIR, "verified-dataset.json");
const MANIFEST_PATH = path.join(TRAINING_DIR, "rwc-citypop-surrogate-source-manifest.json");
const REPORT_PATH = path.join(TRAINING_DIR, "rwc-citypop-surrogate-report.json");

const LIMIT = Math.max(0, Math.min(100, Number(process.env.MMFR_RWC_CITYPOP_LIMIT || 70)));
const DRY_RUN = process.env.MMFR_RWC_CITYPOP_DRY_RUN === "1";
const STATUS = "citypop-surrogate-rwc-japanese-pop";

function readJson(target, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(target, "utf8"));
  } catch {
    return fallback;
  }
}

function verifiedPath() {
  const local = readJson(CACHE_PATHS_PATH, {});
  return path.resolve(process.env.MMFR_GENRE_VERIFIED_DATASET_PATH || local.verifiedDatasetPath || VERIFIED_FALLBACK_PATH);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function mean(values = []) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
}

function contrast(values = []) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (nums.length < 2) return 0;
  return Math.max(...nums) - Math.min(...nums);
}

function rangeScore(value, min, max) {
  const n = Number(value) || 0;
  if (n >= min && n <= max) return 1;
  const distance = n < min ? min - n : n - max;
  return clamp01(1 - distance / Math.max(1, (max - min) * 0.65));
}

function chromaEntropy(chroma = []) {
  const values = chroma.map(value => Math.max(0, Number(value) || 0));
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return 0;
  const entropy = values.reduce((sum, value) => {
    if (!value) return sum;
    const p = value / total;
    return sum - p * Math.log2(p);
  }, 0);
  return clamp01(entropy / Math.log2(Math.max(2, values.length)));
}

function structureRecurrence(profile = []) {
  const values = profile.map(Number).filter(Number.isFinite);
  if (values.length < 4) return 0;
  const half = Math.floor(values.length / 2);
  const a = values.slice(0, half);
  const b = values.slice(values.length - half);
  const diff = a.reduce((sum, value, index) => sum + Math.abs(value - (b[index] || 0)), 0) / Math.max(1, a.length);
  return clamp01(1 - diff * 2.4);
}

function cityPopScore(item = {}) {
  const f = item.features || {};
  const detail = f.detail || {};
  const tempo = Number(f.tempo) || 0;
  const temporalProfile = Array.isArray(f.temporalProfile) ? f.temporalProfile : detail.rms || [];
  const rmsContrast = contrast(temporalProfile);
  const chromaComplexity = chromaEntropy(f.chroma);
  const recurrence = structureRecurrence(temporalProfile);
  const vocalBandProxy = clamp01((Number(f.midBandRatio) || 0) * 1.8 + (Number(f.brightness) || 0) * 0.35);
  const groove = clamp01((Number(f.rhythm) || 0) * 0.5 + (Number(f.onset) || 0) * 0.25 + (Number(f.bass) || 0) * 0.25);
  const softRockPenalty = clamp01((Number(f.highBandRatio) || 0) * 0.25 + Math.max(0, tempo - 128) / 80);
  const score =
    rangeScore(tempo, 85, 128) * 0.18 +
    clamp01(Number(f.bass) || 0) * 0.13 +
    clamp01(Number(f.brightness) || 0) * 0.11 +
    groove * 0.16 +
    chromaComplexity * 0.14 +
    recurrence * 0.12 +
    clamp01(rmsContrast * 1.8) * 0.08 +
    vocalBandProxy * 0.12 -
    softRockPenalty * 0.04;
  return Math.round(clamp01(score) * 1000) / 1000;
}

function isRwcPopular(item = {}) {
  return item.datasetName === "RWC Music Database: Popular Music Database"
    || /^RWC-MDB-P-2001-/.test(String(item.trackId || ""));
}

function restorePreviousSurrogates(items) {
  let restored = 0;
  const next = items.map(item => {
    if (item.reviewStatus !== STATUS) return item;
    restored += 1;
    const { cityPopSurrogateScore, cityPopSurrogateRank, cityPopSurrogateBasis, originalGenre, ...rest } = item;
    return {
      ...rest,
      genre: originalGenre || "J-POP",
      macroGenre: "pop",
      trainingRole: "fine",
      reviewStatus: "",
      reviewNote: "Restored from city-pop surrogate selection before reselection.",
      labelEvidence: ""
    };
  });
  return { items: next, restored };
}

function main() {
  const targetPath = verifiedPath();
  const payload = readJson(targetPath, { items: [] });
  const rawItems = Array.isArray(payload) ? payload : payload.items || [];
  const restored = restorePreviousSurrogates(rawItems);
  const candidates = restored.items
    .filter(item => isRwcPopular(item) && item.genre === "J-POP" && item.trainingRole !== "macro-only")
    .map(item => ({ ...item, cityPopSurrogateScore: cityPopScore(item) }))
    .sort((a, b) => b.cityPopSurrogateScore - a.cityPopSurrogateScore || String(a.trackId).localeCompare(String(b.trackId)));
  const selectedIds = new Set(candidates.slice(0, LIMIT).map(item => item.trackId));
  const selected = candidates.filter(item => selectedIds.has(item.trackId));
  const nextItems = restored.items.map(item => {
    if (!selectedIds.has(item.trackId)) return item;
    const selectedItem = selected.find(row => row.trackId === item.trackId) || item;
    return {
      ...item,
      genre: "シティ・ポップ",
      macroGenre: "pop",
      trainingRole: "fine",
      originalGenre: "J-POP",
      reviewStatus: STATUS,
      labelEvidence: "RWC Popular Japanese-pop source selected as a city-pop surrogate by audio-theory fit; not an official RWC city-pop label.",
      reviewNote: "Surrogate label for score improvement and classifier shaping. Keep separate from exact city-pop evidence.",
      cityPopSurrogateScore: selectedItem.cityPopSurrogateScore,
      cityPopSurrogateRank: selected.findIndex(row => row.trackId === item.trackId) + 1,
      cityPopSurrogateBasis: "tempo 85-128, bass/groove, brightness, chroma complexity, recurrence, vocal-mid proxy"
    };
  });

  const manifestItems = selected.map((item, index) => ({
    source: item.source || "RWC",
    sourceType: "local-audio",
    datasetName: "RWC Popular City Pop Surrogate",
    trackId: item.trackId,
    genre: "シティ・ポップ",
    macroGenre: "pop",
    trainingRole: "fine",
    filePath: item.filePath,
    sourceUrl: item.sourceUrl || item.filePath,
    referenceUrl: item.referenceUrl,
    license: item.license,
    licenseUrl: item.licenseUrl,
    canonicalArtist: item.canonicalArtist,
    canonicalTitle: item.canonicalTitle,
    labelEvidence: "RWC Popular Japanese-pop source selected as a city-pop surrogate by audio-theory fit; not an official RWC city-pop label.",
    reviewStatus: STATUS,
    cityPopSurrogateScore: item.cityPopSurrogateScore,
    cityPopSurrogateRank: index + 1,
    audioStoragePolicy: "external-local-audio; persist-features-only"
  }));

  const nextPayload = Array.isArray(payload) ? nextItems : { ...payload, items: nextItems };
  if (!DRY_RUN) {
    fs.writeFileSync(targetPath, `${JSON.stringify(nextPayload, null, 2)}\n`);
  }
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify({
    description: "RWC Popular city-pop surrogate manifest. These rows are Japanese-pop research audio selected by audio-theory fit, not official city-pop labels.",
    generatedAt: new Date().toISOString(),
    verifiedDatasetPath: targetPath,
    policy: "Use only as a surrogate training bridge until exact city-pop research audio is available.",
    items: manifestItems
  }, null, 2)}\n`);
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    verifiedDatasetPath: targetPath,
    limit: LIMIT,
    restoredPreviousSurrogates: restored.restored,
    candidates: candidates.length,
    selected: selected.length,
    selectedTrackIds: selected.map(item => item.trackId),
    selectedSummary: selected.map(item => ({
      trackId: item.trackId,
      title: item.canonicalTitle,
      score: item.cityPopSurrogateScore,
      tempo: item.features?.tempo,
      bass: item.features?.bass,
      brightness: item.features?.brightness,
      rhythm: item.features?.rhythm
    })),
    note: "Surrogate labels are transparent and reversible; they are not exact city-pop labels."
  }, null, 2)}\n`);

  console.log(JSON.stringify({
    dryRun: DRY_RUN,
    verifiedDatasetPath: path.relative(ROOT, targetPath),
    restoredPreviousSurrogates: restored.restored,
    candidates: candidates.length,
    selected: selected.length,
    manifest: path.relative(ROOT, MANIFEST_PATH),
    report: path.relative(ROOT, REPORT_PATH),
    top: selected.slice(0, 10).map(item => ({
      trackId: item.trackId,
      title: item.canonicalTitle,
      score: item.cityPopSurrogateScore
    }))
  }, null, 2));
}

main();
