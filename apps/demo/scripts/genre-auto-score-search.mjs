import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(SCRIPT_DIR, "..");
const ROOT = path.resolve(DEMO_DIR, "../..");
const TRAIN_SCRIPT = path.join(SCRIPT_DIR, "genre-training.mjs");
const RESULTS_PATH = path.join(ROOT, "genre-training", "results.json");
const MODEL_PATH = path.join(ROOT, "genre-training", "genre-model.json");
const DEMO_MODEL_PATH = path.join(DEMO_DIR, "genre-training", "genre-model.json");
const OUT_DIR = path.join(ROOT, "genre-training", "score-search");

const baseEnv = {
  MMFR_GENRE_STRICT_CC_ONLY: "1",
  MMFR_GENRE_TRAIN_CACHE_ONLY: "1",
  MMFR_GENRE_TRAIN_QUIET: "1"
};

const configs = [
  { name: "baseline", env: {} },
  { name: "distribution", env: { MMFR_DISTRIBUTION_CLASSIFIER: "1" } },
  { name: "balanced-knn", env: { MMFR_BALANCED_KNN: "1" } },
  { name: "separability", env: { MMFR_SEPARABILITY_WEIGHTS: "1" } },
  { name: "advanced", env: { MMFR_ADVANCED_GENRE_FEATURES: "1" } },
  { name: "extended", env: { MMFR_EXTENDED_GENRE_FEATURES: "1" } },
  { name: "advanced-extended", env: { MMFR_ADVANCED_GENRE_FEATURES: "1", MMFR_EXTENDED_GENRE_FEATURES: "1" } },
  { name: "theory-features", env: { MMFR_ENABLE_THEORY_GENRE_FEATURES: "1" } },
  { name: "distribution-balanced", env: { MMFR_DISTRIBUTION_CLASSIFIER: "1", MMFR_BALANCED_KNN: "1" } },
  { name: "distribution-separability", env: { MMFR_DISTRIBUTION_CLASSIFIER: "1", MMFR_SEPARABILITY_WEIGHTS: "1" } },
  { name: "calibration", env: { MMFR_ENABLE_VALIDATION_CALIBRATION: "1" } },
  { name: "distribution-calibration", env: { MMFR_DISTRIBUTION_CLASSIFIER: "1", MMFR_ENABLE_VALIDATION_CALIBRATION: "1" } },
  { name: "strict-two-stage", env: { MMFR_STRICT_TWO_STAGE: "1" } },
  { name: "harder-theory", env: { MMFR_GENRE_THEORY_WEIGHT: "0.08", MMFR_GENRE_THEORY_MACRO_WEIGHT: "0.06" } },
  { name: "best-theory-off", env: { MMFR_DISTRIBUTION_CLASSIFIER: "1", MMFR_SEPARABILITY_WEIGHTS: "1", MMFR_ENABLE_GENRE_THEORY_PRIORS: "0" } },
  { name: "best-theory-light", env: { MMFR_DISTRIBUTION_CLASSIFIER: "1", MMFR_SEPARABILITY_WEIGHTS: "1", MMFR_GENRE_THEORY_WEIGHT: "0.03", MMFR_GENRE_THEORY_MACRO_WEIGHT: "0.02" } },
  { name: "best-theory-strong", env: { MMFR_DISTRIBUTION_CLASSIFIER: "1", MMFR_SEPARABILITY_WEIGHTS: "1", MMFR_GENRE_THEORY_WEIGHT: "0.08", MMFR_GENRE_THEORY_MACRO_WEIGHT: "0.06" } },
  { name: "best-fma-full", env: { MMFR_DISTRIBUTION_CLASSIFIER: "1", MMFR_SEPARABILITY_WEIGHTS: "1", MMFR_FMA_AUDIO_WEIGHT: "1" } },
  { name: "best-fma-light", env: { MMFR_DISTRIBUTION_CLASSIFIER: "1", MMFR_SEPARABILITY_WEIGHTS: "1", MMFR_FMA_AUDIO_WEIGHT: "0.6" } },
  { name: "best-no-macro-heuristics", env: { MMFR_DISTRIBUTION_CLASSIFIER: "1", MMFR_SEPARABILITY_WEIGHTS: "1", MMFR_ENABLE_MACRO_HEURISTICS: "0" } },
  { name: "best-hard-macro-gate", env: { MMFR_DISTRIBUTION_CLASSIFIER: "1", MMFR_SEPARABILITY_WEIGHTS: "1", MMFR_SOFT_TWO_STAGE: "0" } },
  { name: "best-with-theory-features", env: { MMFR_DISTRIBUTION_CLASSIFIER: "1", MMFR_SEPARABILITY_WEIGHTS: "1", MMFR_ENABLE_THEORY_GENRE_FEATURES: "1" } }
];

function readJson(target) {
  return JSON.parse(fs.readFileSync(target, "utf8"));
}

function metricPayload(config) {
  const results = readJson(RESULTS_PATH);
  const model = readJson(MODEL_PATH);
  const summary = results.summary || {};
  const formal = summary.formalSummary || {};
  const target = formal.status === "available" ? formal : summary;
  const score = (
    Number(target.fineTop1Accuracy || 0) * 3
    + Number(target.fineTop3Accuracy || 0)
    + Number(target.macroTop1Accuracy || 0) * .45
    - Number(target.needsReviewRate || 0) * .18
    - Number(target.dubPredictionRate || 0) * .12
  );
  return {
    config,
    objectiveScore: Math.round(score * 1000) / 1000,
    summary: {
      macroTop1Accuracy: summary.macroTop1Accuracy,
      fineTop1Accuracy: summary.fineTop1Accuracy,
      fineTop3Accuracy: summary.fineTop3Accuracy,
      needsReviewRate: summary.needsReviewRate,
      dubPredictionRate: summary.dubPredictionRate,
      formalSummary: formal
    },
    modelPolicy: model.sourcePolicy,
    featureCount: Array.isArray(model.featureKeys) ? model.featureKeys.length : 0
  };
}

function runConfig(config) {
  const env = { ...process.env, ...baseEnv, ...config.env };
  const startedAt = new Date();
  const run = spawnSync(process.execPath, [TRAIN_SCRIPT], {
    cwd: DEMO_DIR,
    env,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16
  });
  const finishedAt = new Date();
  if (run.status !== 0) {
    return {
      config,
      ok: false,
      status: run.status,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      stderr: run.stderr,
      stdout: run.stdout
    };
  }
  const payload = {
    ok: true,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationSeconds: Math.round((finishedAt - startedAt) / 1000),
    ...metricPayload(config)
  };
  const runDir = path.join(OUT_DIR, config.name);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, "result.json"), JSON.stringify(payload, null, 2));
  fs.copyFileSync(RESULTS_PATH, path.join(runDir, "results.json"));
  fs.copyFileSync(MODEL_PATH, path.join(runDir, "genre-model.json"));
  return payload;
}

function restoreBest(best) {
  const runDir = path.join(OUT_DIR, best.config.name);
  fs.copyFileSync(path.join(runDir, "results.json"), RESULTS_PATH);
  fs.copyFileSync(path.join(runDir, "genre-model.json"), MODEL_PATH);
  fs.copyFileSync(path.join(runDir, "genre-model.json"), DEMO_MODEL_PATH);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const selected = process.argv.slice(2).filter(Boolean);
const selectedConfigs = selected.length ? configs.filter(config => selected.includes(config.name)) : configs;
const runs = [];

for (const config of selectedConfigs) {
  console.log(`\n=== ${config.name} ===`);
  const result = runConfig(config);
  runs.push(result);
  if (!result.ok) {
    console.log(`failed status=${result.status}`);
    continue;
  }
  const formal = result.summary.formalSummary || {};
  console.log(`objective=${result.objectiveScore} macro=${result.summary.macroTop1Accuracy} fine1=${result.summary.fineTop1Accuracy} fine3=${result.summary.fineTop3Accuracy} formalFine1=${formal.fineTop1Accuracy} formalFine3=${formal.fineTop3Accuracy}`);
}

const successful = runs.filter(run => run.ok);
const best = successful.sort((a, b) => b.objectiveScore - a.objectiveScore)[0] || null;
if (best) restoreBest(best);

const report = {
  generatedAt: new Date().toISOString(),
  configCount: selectedConfigs.length,
  best: best ? {
    config: best.config,
    objectiveScore: best.objectiveScore,
    summary: best.summary,
    featureCount: best.featureCount
  } : null,
  runs
};
fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(report, null, 2));
console.log(`\nWrote ${path.relative(ROOT, path.join(OUT_DIR, "summary.json"))}`);
if (best) console.log(`Restored best model: ${best.config.name}`);
