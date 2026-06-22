import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const RESULTS_PATH = path.join(TRAINING_DIR, "results.json");
const VERIFIED_PATH = path.join(TRAINING_DIR, "verified-dataset.json");
const SEEDS_PATH = path.join(TRAINING_DIR, "source-seeds.json");
const REPORT_PATH = path.join(TRAINING_DIR, "goal-report.json");
const COVERAGE_REPORT_PATH = path.join(TRAINING_DIR, "cc-coverage-report.json");

const GOAL_GENRE_COUNT = Math.max(1, Number(process.env.MMFR_GOAL_GENRE_COUNT || 30));
const GOAL_ACCURACY = Math.max(0, Math.min(100, Number(process.env.MMFR_GOAL_ACCURACY || 80)));
const MIN_FORMAL_TEST_PER_GENRE = Math.max(1, Number(process.env.MMFR_MIN_FORMAL_TEST_PER_GENRE || 10));
const DEFAULT_TARGET_TRACKS = Math.max(1, Number(process.env.MMFR_GOAL_DEFAULT_TRACKS || 50));
const PRIORITY_TARGET_TRACKS = Math.max(DEFAULT_TARGET_TRACKS, Number(process.env.MMFR_GOAL_PRIORITY_TRACKS || 100));
const FORMAL_SOURCE_TYPES = new Set(["cc-dataset", "local-audio"]);
const FINE_EXCLUDED = new Set(["電子音楽", "ワールドミュージック"]);
const PRIORITY_GENRES = new Set(["シティ・ポップ", "J-POP", "ドローン", "クラシック音楽", "ダブ", "テクノ"]);

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function seedGenres() {
  const seeds = loadJson(SEEDS_PATH, {});
  const fromGenres = Array.isArray(seeds.genres)
    ? seeds.genres.map(item => ({ genre: item.genre, macroGenre: item.macroGenre }))
    : [];
  if (fromGenres.length) return fromGenres.filter(item => item.genre && item.macroGenre);
  const out = [];
  Object.entries(seeds.macroGenres || {}).forEach(([macroGenre, genres]) => {
    (genres || []).forEach(genre => out.push({ genre, macroGenre }));
  });
  return out.filter(item => item.genre && item.macroGenre);
}

function verifiedItems() {
  const payload = loadJson(VERIFIED_PATH, { items: [] });
  return Array.isArray(payload) ? payload : payload.items || [];
}

function countByGenre(items, predicate = () => true) {
  return items.reduce((acc, item) => {
    if (!predicate(item)) return acc;
    if (!item.genre) return acc;
    acc[item.genre] = (acc[item.genre] || 0) + 1;
    return acc;
  }, {});
}

function resultByGenre() {
  const results = loadJson(RESULTS_PATH, {});
  const map = new Map();
  (results.byGenre || []).forEach(item => {
    map.set(item.genre, item);
  });
  return { results, map };
}

function buildReport() {
  const seeds = seedGenres();
  const items = verifiedItems();
  const { results, map: resultMap } = resultByGenre();
  const coverage = loadJson(COVERAGE_REPORT_PATH, {});
  const coverageByGenre = new Map((coverage.genres || []).map(row => [row.genre, row]));
  const totalCounts = countByGenre(items, item => item.sourceType !== "fma-metadata");
  const formalCounts = countByGenre(items, item => FORMAL_SOURCE_TYPES.has(item.sourceType));
  const fmaCounts = countByGenre(items, item => item.sourceType === "fma-metadata");
  const rows = seeds.map(seed => {
    const result = resultMap.get(seed.genre) || {};
    const priority = PRIORITY_GENRES.has(seed.genre);
    const targetTracks = priority ? PRIORITY_TARGET_TRACKS : DEFAULT_TARGET_TRACKS;
    const formalCount = formalCounts[seed.genre] || 0;
    const coverageRow = coverageByGenre.get(seed.genre) || {};
    const potentialRows = Number(coverageRow.totalPotentialRows || 0) || Math.max(
      Number(coverageRow.manifestCandidateRows || 0),
      Number(coverageRow.fmaMetadataPotentialRows || 0),
      Number(coverageRow.internetArchiveCandidateRows || 0),
      Number(coverageRow.wikimediaCandidateRows || 0)
    );
    const formalReady = formalCount >= targetTracks;
    const stableTestReady = Number(result.fineTotal || 0) >= MIN_FORMAL_TEST_PER_GENRE && formalCount > 0;
    const fineEvaluable = !FINE_EXCLUDED.has(seed.genre);
    const accuracy = fineEvaluable ? result.fineTop1Accuracy ?? null : result.macroTop1Accuracy ?? null;
    return {
      genre: seed.genre,
      macroGenre: seed.macroGenre,
      priority,
      fineEvaluable,
      totalTrainingRows: totalCounts[seed.genre] || 0,
      formalTrainingRows: formalCount,
      potentialTrainingRows: Math.max(formalCount, potentialRows),
      recommendedSources: coverageRow.recommendedSources || [],
      searchTerms: coverageRow.searchTerms || [],
      fmaMetadataRows: fmaCounts[seed.genre] || 0,
      targetTracks,
      missingFormalTracks: Math.max(0, targetTracks - formalCount),
      missingPotentialTracks: Math.max(0, targetTracks - Math.max(formalCount, potentialRows)),
      testRows: result.fineTotal || 0,
      minFormalTestPerGenre: MIN_FORMAL_TEST_PER_GENRE,
      formalReady,
      stableTestReady,
      top1Accuracy: accuracy,
      top3Accuracy: fineEvaluable ? result.fineTop3Accuracy ?? null : null,
      passesGoal: formalReady && stableTestReady && Number(accuracy) >= GOAL_ACCURACY
    };
  });
  const evaluableRows = rows.filter(row => row.fineEvaluable);
  const passed = rows.filter(row => row.passesGoal);
  const formalReady = rows.filter(row => row.formalReady && row.stableTestReady);
  const potentialReady = rows.filter(row => row.fineEvaluable && row.potentialTrainingRows >= row.targetTracks);
  const missing = rows
    .filter(row => !row.passesGoal)
    .sort((a, b) => Number(b.priority) - Number(a.priority) || b.missingFormalTracks - a.missingFormalTracks || a.genre.localeCompare(b.genre, "ja"));
  const status = passed.length >= GOAL_GENRE_COUNT
    ? "achieved"
    : formalReady.length < GOAL_GENRE_COUNT
    ? "needs-formal-cc-audio"
    : "needs-classifier-improvement";
  return {
    generatedAt: new Date().toISOString(),
    goal: {
      genreCount: GOAL_GENRE_COUNT,
      top1Accuracy: GOAL_ACCURACY,
      formalSourceTypes: [...FORMAL_SOURCE_TYPES],
      minFormalTestPerGenre: MIN_FORMAL_TEST_PER_GENRE,
      defaultTargetTracks: DEFAULT_TARGET_TRACKS,
      priorityTargetTracks: PRIORITY_TARGET_TRACKS
    },
    status,
    summary: {
      seedGenres: rows.length,
      fineEvaluableGenres: evaluableRows.length,
      formalReadyGenres: formalReady.length,
      potentialReadyGenres: potentialReady.length,
      passingGenres: passed.length,
      currentReferenceMacroTop1: results.summary?.macroTop1Accuracy ?? null,
      currentReferenceFineTop1: results.summary?.fineTop1Accuracy ?? null,
      currentReferenceFineTop3: results.summary?.fineTop3Accuracy ?? null,
      formalStatus: results.summary?.formalSummary?.status || "unknown"
    },
    priorityMissing: missing.filter(row => row.priority).slice(0, 12),
    missing: missing.slice(0, 30),
    genres: rows
  };
}

const report = buildReport();
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  status: report.status,
  goal: report.goal,
  summary: report.summary,
  priorityMissing: report.priorityMissing.map(row => ({
    genre: row.genre,
    formalTrainingRows: row.formalTrainingRows,
    missingFormalTracks: row.missingFormalTracks,
    top1Accuracy: row.top1Accuracy
  }))
}, null, 2));
console.log(`Wrote ${path.relative(ROOT, REPORT_PATH)}`);
