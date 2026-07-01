import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEMO_DIR = path.join(ROOT, "apps/demo");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
const OUT_JSON = path.join(TRAINING_DIR, "source-holdout-experiment.json");
const OUT_MD = path.join(TRAINING_DIR, "source-holdout-experiment.md");

const RESULTS_PATH = path.join(TRAINING_DIR, "results.json");
const MODEL_PATH = path.join(TRAINING_DIR, "genre-model.json");
const DEMO_MODEL_PATH = path.join(DEMO_DIR, "genre-training", "genre-model.json");
const OUTPUTS_TO_RESTORE = [
  RESULTS_PATH,
  MODEL_PATH,
  path.join(TRAINING_DIR, "generated-profiles.json"),
  path.join(TRAINING_DIR, "dataset-splits.json"),
  DEMO_MODEL_PATH,
  path.join(DEMO_DIR, "genre-training", "generated-profiles.json")
];

const EXPERIMENTS = [
  {
    name: "mtg-ambient-macro-only",
    rules: [{ datasetName: "MTG-Jamendo", genre: "アンビエント", macroGenre: "ambient" }]
  },
  {
    name: "mtg-rock-macro-only",
    rules: [{ datasetName: "MTG-Jamendo", genre: "ロック", macroGenre: "rock" }]
  },
  {
    name: "mtg-ambient-rock-macro-only",
    rules: [
      { datasetName: "MTG-Jamendo", genre: "アンビエント", macroGenre: "ambient" },
      { datasetName: "MTG-Jamendo", genre: "ロック", macroGenre: "rock" }
    ]
  },
  {
    name: "mtg-disco-macro-only",
    rules: [{ datasetName: "MTG-Jamendo", genre: "ディスコ", macroGenre: "black_music" }]
  },
  {
    name: "mtg-funk-macro-only",
    rules: [{ datasetName: "MTG-Jamendo", genre: "ファンク", macroGenre: "black_music" }]
  },
  {
    name: "fma-latin-macro-only",
    rules: [{ datasetName: "FMA", genre: "ラテン", macroGenre: "world" }]
  }
];
const SELECTED_NAMES = new Set(process.argv.slice(2).filter(Boolean));

function readJson(pathname, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(pathname, payload) {
  fs.mkdirSync(path.dirname(pathname), { recursive: true });
  fs.writeFileSync(pathname, JSON.stringify(payload, null, 2));
}

function pct(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1).replace(/\.0$/, "")}%` : "n/a";
}

function sourceItems(payload) {
  return Array.isArray(payload) ? payload : payload?.items || [];
}

function copyIfExists(from, to) {
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return true;
}

function backupOutputs(tmpDir) {
  return OUTPUTS_TO_RESTORE.map(file => {
    const backup = path.join(tmpDir, "backup", path.relative(ROOT, file));
    return { file, backup, existed: copyIfExists(file, backup) };
  });
}

function restoreOutputs(backups) {
  for (const row of backups) {
    if (row.existed) copyIfExists(row.backup, row.file);
    else if (fs.existsSync(row.file)) fs.rmSync(row.file, { force: true });
  }
}

function summarize(results) {
  const summary = results.summary || {};
  const formal = summary.formalSummary || {};
  const byGenre = Object.fromEntries((results.byGenre || []).map(row => [row.genre, row]));
  return {
    macroTop1Accuracy: summary.macroTop1Accuracy,
    fineTop1Accuracy: summary.fineTop1Accuracy,
    fineTop3Accuracy: summary.fineTop3Accuracy,
    needsReviewRate: summary.needsReviewRate,
    dubPredictionRate: summary.dubPredictionRate,
    formalMacroTop1Accuracy: formal.macroTop1Accuracy,
    formalFineTop1Accuracy: formal.fineTop1Accuracy,
    formalFineTop3Accuracy: formal.fineTop3Accuracy,
    formalNeedsReviewRate: formal.needsReviewRate,
    formalDubPredictionRate: formal.dubPredictionRate,
    formalStableGenreCount: formal.stableGenreCount,
    ambientTop1: byGenre["アンビエント"]?.fineTop1Accuracy,
    rockTop1: byGenre["ロック"]?.fineTop1Accuracy,
    discoTop1: byGenre["ディスコ"]?.fineTop1Accuracy,
    funkTop1: byGenre["ファンク"]?.fineTop1Accuracy,
    latinTop1: byGenre["ラテン"]?.fineTop1Accuracy
  };
}

function objective(metrics) {
  const dubPenalty = Math.max(0, Number(metrics.formalDubPredictionRate || 0) - 10) * 4;
  return Math.round((
    Number(metrics.formalFineTop1Accuracy || 0) * 3
    + Number(metrics.formalFineTop3Accuracy || 0)
    + Number(metrics.formalMacroTop1Accuracy || 0) * .45
    - Number(metrics.formalNeedsReviewRate || 0) * .18
    - Number(metrics.formalDubPredictionRate || 0) * .12
    - dubPenalty
  ) * 1000) / 1000;
}

function applyRules(payload, definition) {
  const next = JSON.parse(JSON.stringify(payload));
  const items = sourceItems(next);
  let changed = 0;
  for (const item of items) {
    const rule = definition.rules.find(candidate =>
      item.datasetName === candidate.datasetName
      && item.genre === candidate.genre
      && ["cc-dataset", "local-audio"].includes(item.sourceType)
    );
    if (!rule) continue;
    if ((item.trainingRole || "fine") !== "macro-only") changed += 1;
    item.trainingRole = "macro-only";
    item.reviewStatus = `source-holdout-experiment-${definition.name}`;
    item.reviewNote = `Temporary source holdout experiment: ${rule.datasetName} ${rule.genre} behaved as noisy fine evidence.`;
    if (rule.macroGenre) item.macroGenre = rule.macroGenre;
  }
  if (!Array.isArray(next)) next.updatedAt = new Date().toISOString();
  return { payload: next, changed };
}

function runTraining(datasetPath) {
  const run = spawnSync(process.execPath, [path.join(SCRIPT_DIR, "genre-training.mjs")], {
    cwd: DEMO_DIR,
    env: {
      ...process.env,
      MMFR_GENRE_VERIFIED_DATASET_PATH: datasetPath,
      MMFR_GENRE_STRICT_CC_ONLY: "1",
      MMFR_GENRE_TRAIN_CACHE_ONLY: "1",
      MMFR_GENRE_TRAIN_QUIET: "1",
      MMFR_ENABLE_GENRE_THEORY_PRIORS: "0",
      MMFR_ENABLE_VALIDATION_CALIBRATION: "1",
      MMFR_ADVANCED_GENRE_FEATURES: "1",
      MMFR_ENABLE_VALIDATION_RERANKER: "1"
    },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64
  });
  if (run.status !== 0) {
    throw new Error(`genre-training failed (${run.status}): ${run.stderr || run.stdout}`);
  }
}

function decision(run, baseline) {
  if (run.name === "baseline") return "reference";
  if (run.changedRows <= 0) return "reject-no-change";
  if (Number(run.metrics.formalStableGenreCount || 0) < Number(baseline.metrics.formalStableGenreCount || 0) - 1) return "reject-coverage-drop";
  if (Number(run.metrics.formalFineTop1Accuracy || 0) < Number(baseline.metrics.formalFineTop1Accuracy || 0)) return "reject-formal-top1-drop";
  if (Number(run.metrics.formalFineTop3Accuracy || 0) < Number(baseline.metrics.formalFineTop3Accuracy || 0)) return "reject-formal-top3-drop";
  if (Number(run.metrics.formalDubPredictionRate || 0) > 10) return "reject-dub-guardrail";
  if (run.objectiveScore <= baseline.objectiveScore) return "reject-no-objective-gain";
  return "candidate";
}

function renderMarkdown(report) {
  const rows = report.runs.map(run => `| ${run.name} | ${run.changedRows} | ${run.objectiveScore} | ${pct(run.metrics.formalFineTop1Accuracy)} | ${pct(run.metrics.formalFineTop3Accuracy)} | ${pct(run.metrics.formalMacroTop1Accuracy)} | ${pct(run.metrics.formalDubPredictionRate)} | ${run.metrics.formalStableGenreCount ?? ""} | ${run.decision} |`);
  return [
    "# Source Holdout Experiment",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Result",
    "",
    `Best candidate: ${report.bestCandidate ? `\`${report.bestCandidate}\`` : "_none_"}`,
    "",
    "| experiment | changed | objective | Formal Fine Top1 | Formal Fine Top3 | Formal Macro | Formal Dub | stable genres | decision |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...rows,
    "",
    "## Interpretation",
    "",
    "This experiment tests whether a source/genre group should become `macro-only` because it behaves as noisy fine-label evidence. It restores the previous official model/results after each run."
  ].join("\n");
}

const cache = readJson(CACHE_PATHS_PATH, {});
const verifiedPath = path.resolve(process.env.MMFR_GENRE_VERIFIED_DATASET_PATH || cache.verifiedDatasetPath || path.join(TRAINING_DIR, "verified-dataset.json"));
const verified = readJson(verifiedPath, { items: [] });
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mmfr-source-holdout-"));
const backups = backupOutputs(tmpDir);
const runs = [];

try {
  const baselineMetrics = summarize(readJson(RESULTS_PATH, {}));
  const baseline = {
    name: "baseline",
    changedRows: 0,
    metrics: baselineMetrics,
    objectiveScore: objective(baselineMetrics),
    decision: "reference"
  };
  runs.push(baseline);
  const selectedExperiments = SELECTED_NAMES.size
    ? EXPERIMENTS.filter(definition => SELECTED_NAMES.has(definition.name))
    : EXPERIMENTS;
  for (const definition of selectedExperiments) {
    const changed = applyRules(verified, definition);
    const datasetPath = path.join(tmpDir, `${definition.name}.json`);
    writeJson(datasetPath, changed.payload);
    const startedAt = new Date();
    runTraining(datasetPath);
    const finishedAt = new Date();
    const metrics = summarize(readJson(RESULTS_PATH, {}));
    runs.push({
      name: definition.name,
      rules: definition.rules,
      changedRows: changed.changed,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationSeconds: Math.round((finishedAt - startedAt) / 1000),
      metrics,
      objectiveScore: objective(metrics)
    });
    restoreOutputs(backups);
  }
  const decorated = runs.map(run => ({ ...run, decision: decision(run, baseline) }));
  const candidates = decorated.filter(run => run.decision === "candidate").sort((a, b) => b.objectiveScore - a.objectiveScore);
  const report = {
    generatedAt: new Date().toISOString(),
    verifiedPath,
    restorePolicy: "official model/results restored after each experiment",
    bestCandidate: candidates[0]?.name || "",
    runs: decorated.sort((a, b) => b.objectiveScore - a.objectiveScore)
  };
  writeJson(OUT_JSON, report);
  fs.writeFileSync(OUT_MD, `${renderMarkdown(report)}\n`);
  console.log(JSON.stringify({
    bestCandidate: report.bestCandidate,
    runs: report.runs.map(run => ({
      name: run.name,
      changedRows: run.changedRows,
      objectiveScore: run.objectiveScore,
      formalFineTop1: run.metrics.formalFineTop1Accuracy,
      formalFineTop3: run.metrics.formalFineTop3Accuracy,
      formalDub: run.metrics.formalDubPredictionRate,
      stableGenres: run.metrics.formalStableGenreCount,
      decision: run.decision
    })),
    report: path.relative(ROOT, OUT_JSON),
    markdown: path.relative(ROOT, OUT_MD)
  }, null, 2));
} finally {
  restoreOutputs(backups);
}
