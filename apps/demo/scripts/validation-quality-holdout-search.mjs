import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(SCRIPT_DIR, "..");
const ROOT = path.resolve(DEMO_DIR, "../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const TRAIN_SCRIPT = path.join(SCRIPT_DIR, "genre-training.mjs");
const AUDIT_PATH = path.resolve(process.env.MMFR_FINE_LABEL_AUDIT_PATH || path.join(TRAINING_DIR, "fine-label-quality-audit.json"));
const VERIFIED_PATH = path.resolve(process.env.MMFR_GENRE_VERIFIED_DATASET_PATH || path.join(TRAINING_DIR, "verified-dataset.json"));
const RESULTS_PATH = path.join(TRAINING_DIR, "results.json");
const MODEL_PATH = path.join(TRAINING_DIR, "genre-model.json");
const DEMO_MODEL_PATH = path.join(DEMO_DIR, "genre-training", "genre-model.json");
const OUT_JSON = path.join(TRAINING_DIR, "validation-quality-holdout-experiment.json");
const OUT_MD = path.join(TRAINING_DIR, "validation-quality-holdout-experiment.md");
const RUN_DIR = path.join(TRAINING_DIR, "validation-quality-holdout-runs");
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mmfr-quality-holdout-"));

const baseEnv = {
  MMFR_GENRE_STRICT_CC_ONLY: "1",
  MMFR_GENRE_TRAIN_CACHE_ONLY: "1",
  MMFR_GENRE_TRAIN_QUIET: "1",
  MMFR_ENABLE_GENRE_THEORY_PRIORS: "0",
  MMFR_ENABLE_VALIDATION_CALIBRATION: "1"
};

const targetGenres = String(process.env.MMFR_QUALITY_HOLDOUT_TARGETS || "ドローン,テクノ,ダブ")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

function readJson(pathname, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function sourceItems(payload) {
  return Array.isArray(payload) ? payload : payload?.items || [];
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function candidateKey(row = {}) {
  return [
    String(row.datasetName || "").trim(),
    String(row.genre || "").trim(),
    String(row.trackId || "").trim()
  ].join("|");
}

function itemKey(item = {}) {
  return [
    String(item.datasetName || "").trim(),
    String(item.genre || "").trim(),
    String(item.trackId || "").trim()
  ].join("|");
}

function experimentDefinitions(candidates) {
  const validationRows = candidates.filter(row => row.split === "validation" && targetGenres.includes(row.genre));
  const hardMissRows = candidates.filter(row => targetGenres.includes(row.genre));
  const testRows = candidates.filter(row => row.split === "test" && targetGenres.includes(row.genre));
  const definitions = [
    { name: "baseline", rows: [] },
    ...targetGenres.map(genre => ({
      name: `validation-${romanizeGenre(genre)}`,
      rows: validationRows.filter(row => row.genre === genre)
    })),
    ...targetGenres.map(genre => ({
      name: `hard-miss-${romanizeGenre(genre)}`,
      rows: hardMissRows.filter(row => row.genre === genre)
    })),
    ...targetGenres.map(genre => ({
      name: `test-hard-miss-${romanizeGenre(genre)}`,
      rows: testRows.filter(row => row.genre === genre)
    })),
    {
      name: "validation-all-targets",
      rows: validationRows
    },
    {
      name: "hard-miss-all-targets",
      rows: hardMissRows
    },
    {
      name: "validation-high-priority",
      rows: validationRows.filter(row => row.priority === "high")
    }
  ];
  const selected = process.argv.slice(2).filter(Boolean);
  if (!selected.length) return definitions;
  const wanted = new Set(["baseline", ...selected]);
  return definitions.filter(definition => wanted.has(definition.name));
}

function romanizeGenre(genre) {
  const map = {
    "ドローン": "drone",
    "テクノ": "techno",
    "ダブ": "dub",
    "シティ・ポップ": "city-pop",
    "J-POP": "j-pop"
  };
  return map[genre] || genre.replace(/\s+/g, "-");
}

function writeExperimentDataset(basePayload, definition) {
  const nextPayload = cloneJson(basePayload);
  const items = sourceItems(nextPayload);
  const keys = new Set(definition.rows.map(candidateKey));
  let changed = 0;
  for (const item of items) {
    if (!keys.has(itemKey(item))) continue;
    const nextStatus = `validation-quality-holdout-${definition.name}`;
    if (item.trainingRole !== "macro-only" || item.reviewStatus !== nextStatus) changed += 1;
    item.trainingRole = "macro-only";
    item.reviewStatus = nextStatus;
    item.reviewNote = "High-confidence validation hard miss in fine-label-quality-audit; temporary experiment to reduce calibration label noise.";
  }
  if (!Array.isArray(nextPayload)) {
    nextPayload.updatedAt = new Date().toISOString();
    nextPayload.experiment = definition.name;
  }
  const outPath = path.join(TMP_DIR, `${definition.name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(nextPayload));
  return { outPath, changed };
}

function runTraining(datasetPath) {
  return spawnSync(process.execPath, [TRAIN_SCRIPT], {
    cwd: DEMO_DIR,
    env: {
      ...process.env,
      ...baseEnv,
      MMFR_GENRE_VERIFIED_DATASET_PATH: datasetPath
    },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 32
  });
}

function summarizeRun(definition, datasetPath, changed, startedAt, finishedAt) {
  const results = readJson(RESULTS_PATH, {});
  const model = readJson(MODEL_PATH, {});
  const byGenre = Object.fromEntries((results.byGenre || []).map(row => [row.genre, row]));
  const summary = results.summary || {};
  const formal = summary.formalSummary || {};
  const target = formal.status === "available" ? formal : summary;
  const objectiveScore = (
    Number(target.fineTop1Accuracy || 0) * 3
    + Number(target.fineTop3Accuracy || 0)
    + Number(target.macroTop1Accuracy || 0) * .45
    - Number(target.needsReviewRate || 0) * .18
    - Number(target.dubPredictionRate || 0) * .12
  );
  return {
    name: definition.name,
    ok: true,
    candidateRows: definition.rows.length,
    changedRows: changed,
    datasetPath,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationSeconds: Math.round((finishedAt - startedAt) / 1000),
    objectiveScore: Math.round(objectiveScore * 1000) / 1000,
    macro: summary.macroTop1Accuracy,
    fine1: summary.fineTop1Accuracy,
    fine3: summary.fineTop3Accuracy,
    formalMacro: formal.macroTop1Accuracy,
    formalFine1: formal.fineTop1Accuracy,
    formalFine3: formal.fineTop3Accuracy,
    dubRate: summary.dubPredictionRate,
    needs: summary.needsReviewRate,
    drone1: byGenre["ドローン"]?.fineTop1Accuracy,
    techno1: byGenre["テクノ"]?.fineTop1Accuracy,
    dub1: byGenre["ダブ"]?.fineTop1Accuracy,
    modelPolicy: model.sourcePolicy || {}
  };
}

function saveRunArtifacts(run) {
  const dir = path.join(RUN_DIR, run.name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify(run, null, 2));
  fs.copyFileSync(RESULTS_PATH, path.join(dir, "results.json"));
  fs.copyFileSync(MODEL_PATH, path.join(dir, "genre-model.json"));
}

function restoreBaseline(baseline) {
  if (!baseline?.ok) return;
  const dir = path.join(RUN_DIR, baseline.name);
  fs.copyFileSync(path.join(dir, "results.json"), RESULTS_PATH);
  fs.copyFileSync(path.join(dir, "genre-model.json"), MODEL_PATH);
  fs.copyFileSync(path.join(dir, "genre-model.json"), DEMO_MODEL_PATH);
}

function decisionFor(run, baseline) {
  if (run.name === "baseline") return "reference";
  if (!baseline?.ok) return "review";
  const targetDrops = [
    Number(run.drone1 || 0) < Number(baseline.drone1 || 0),
    Number(run.techno1 || 0) < Number(baseline.techno1 || 0),
    Number(run.dub1 || 0) < Number(baseline.dub1 || 0)
  ].some(Boolean);
  if (targetDrops) return "reject-target-drop";
  if (Number(run.fine1 || 0) < Number(baseline.fine1 || 0)) return "reject-fine-top1-drop";
  if (Number(run.formalFine3 || 0) > Number(baseline.formalFine3 || 0)
    || Number(run.fine3 || 0) > Number(baseline.fine3 || 0)) return "candidate";
  return "reject-no-gain";
}

function writeReports(runs, audit) {
  const baseline = runs.find(run => run.name === "baseline");
  const ranked = [...runs].sort((a, b) => b.objectiveScore - a.objectiveScore);
  const candidates = runs
    .map(run => ({ ...run, decision: decisionFor(run, baseline) }))
    .filter(run => run.decision === "candidate");
  const adopted = candidates[0]?.name || "";
  const report = {
    generatedAt: new Date().toISOString(),
    auditPath: path.relative(ROOT, AUDIT_PATH),
    verifiedPath: VERIFIED_PATH,
    restorePolicy: "baseline model/results restored after search",
    targetGenres,
    baseline,
    adopted,
    candidates,
    runs: ranked.map(run => ({ ...run, decision: decisionFor(run, baseline) })),
    auditSummary: audit.summary || {}
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

  const md = [];
  md.push("# Validation Quality Holdout Experiment");
  md.push("");
  md.push(`Generated: ${report.generatedAt}`);
  md.push("");
  md.push("This search tests validation-split high-confidence hard-miss rows as temporary `macro-only` holdouts. It restores the baseline official model/results after the search.");
  md.push("");
  md.push("## Result");
  md.push("");
  md.push(`Adopted candidate: ${adopted ? `\`${adopted}\`` : "_none_"}`);
  md.push("");
  md.push("| experiment | changed | objective | Macro | Fine Top1 | Fine Top3 | Formal Fine Top1 | Formal Fine Top3 | Dub rate | Drone Top1 | Techno Top1 | Dub Top1 | decision |");
  md.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const run of report.runs) {
    md.push(`| ${run.name} | ${run.changedRows} | ${run.objectiveScore} | ${run.macro}% | ${run.fine1}% | ${run.fine3}% | ${run.formalFine1}% | ${run.formalFine3}% | ${run.dubRate}% | ${run.drone1}% | ${run.techno1}% | ${run.dub1}% | ${run.decision} |`);
  }
  md.push("");
  md.push("## Notes");
  md.push("");
  md.push("- Candidate status requires no weak-target Top1 drop and no Fine Top1 drop.");
  md.push("- This script does not edit `source-quality-holdout-rules.json`; adoption still requires an explicit track-level rule.");
  md.push("- Official `results.json` is restored to the baseline run after the search.");
  fs.writeFileSync(OUT_MD, md.join("\n") + "\n");
}

fs.mkdirSync(RUN_DIR, { recursive: true });

const audit = readJson(AUDIT_PATH, { candidateRows: [] });
const candidates = Array.isArray(audit.candidateRows) ? audit.candidateRows : [];
const verifiedPayload = readJson(VERIFIED_PATH, { items: [] });
const definitions = experimentDefinitions(candidates);
const runs = [];

for (const definition of definitions) {
  console.log(`\n=== ${definition.name} ===`);
  const { outPath, changed } = writeExperimentDataset(verifiedPayload, definition);
  const startedAt = new Date();
  const run = runTraining(outPath);
  const finishedAt = new Date();
  if (run.status !== 0) {
    const failed = {
      name: definition.name,
      ok: false,
      status: run.status,
      stdout: run.stdout,
      stderr: run.stderr,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString()
    };
    runs.push(failed);
    console.log(`failed status=${run.status}`);
    continue;
  }
  const summary = summarizeRun(definition, outPath, changed, startedAt, finishedAt);
  runs.push(summary);
  saveRunArtifacts(summary);
  console.log(JSON.stringify({
    name: summary.name,
    changed: summary.changedRows,
    fine1: summary.fine1,
    fine3: summary.fine3,
    formalFine1: summary.formalFine1,
    formalFine3: summary.formalFine3,
    dubRate: summary.dubRate
  }));
}

const baseline = runs.find(run => run.name === "baseline");
restoreBaseline(baseline);
writeReports(runs.filter(run => run.ok), audit);

console.log(`\nWrote ${path.relative(ROOT, OUT_JSON)}`);
console.log(`Wrote ${path.relative(ROOT, OUT_MD)}`);
if (baseline?.ok) console.log("Restored baseline model/results.");
