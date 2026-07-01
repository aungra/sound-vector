import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEMO_DIR = path.join(ROOT, "apps/demo");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
const SOURCE_HOLDOUT_RULES_PATH = path.join(TRAINING_DIR, "source-quality-holdout-rules.json");
const FINE_AUDIT_PATH = path.join(TRAINING_DIR, "fine-label-quality-audit.json");
const CC_SOURCE_MANIFEST_PATH = path.join(TRAINING_DIR, "cc-source-manifest.json");
const OUT_JSON = path.join(TRAINING_DIR, "techno-promotion-experiment.json");
const OUT_MD = path.join(TRAINING_DIR, "techno-promotion-experiment.md");
const PROMOTION_MODE = process.env.MMFR_TECHNO_PROMOTION_MODE || "strict";
const MAX_PROMOTIONS = Math.max(1, Number(process.env.MMFR_TECHNO_PROMOTION_MAX || 20));
const MAX_PER_ARTIST = Math.max(1, Number(process.env.MMFR_TECHNO_PROMOTION_MAX_PER_ARTIST || 3));

const OUTPUTS_TO_RESTORE = [
  path.join(TRAINING_DIR, "results.json"),
  path.join(TRAINING_DIR, "genre-model.json"),
  path.join(TRAINING_DIR, "generated-profiles.json"),
  path.join(TRAINING_DIR, "dataset-splits.json"),
  path.join(DEMO_DIR, "genre-training", "genre-model.json"),
  path.join(DEMO_DIR, "genre-training", "generated-profiles.json")
];

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

function copyFileIfExists(from, to) {
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return true;
}

function backupOutputs(tmpDir) {
  return OUTPUTS_TO_RESTORE.map(file => {
    const backup = path.join(tmpDir, "backup", path.relative(ROOT, file));
    return { file, backup, existed: copyFileIfExists(file, backup) };
  });
}

function restoreOutputs(backups) {
  for (const row of backups) {
    if (row.existed) {
      copyFileIfExists(row.backup, row.file);
    } else if (fs.existsSync(row.file)) {
      fs.rmSync(row.file, { force: true });
    }
  }
}

function sourceItems(payload) {
  return Array.isArray(payload) ? payload : payload?.items || [];
}

function collectKnownHardMisses() {
  const audit = readJson(FINE_AUDIT_PATH, {});
  const rows = sourceItems(audit.reviewCandidates || audit.candidates || audit.items || []);
  return new Set(rows
    .filter(row => row.genre === "テクノ" && row.datasetName === "MTG-Jamendo")
    .filter(row => String(row.reason || "").includes("high-confidence-wrong") || row.priority === "high")
    .map(row => String(row.trackId || "").trim())
    .filter(Boolean));
}

function collectExistingTrackRuleIds() {
  const rules = readJson(SOURCE_HOLDOUT_RULES_PATH, { rules: [] }).rules || [];
  const fine = new Set();
  const macroOnly = new Set();
  for (const rule of rules) {
    if (rule.datasetName !== "MTG-Jamendo" || rule.genre !== "テクノ") continue;
    for (const id of rule.trackIds || []) {
      if ((rule.trainingRole || rule.targetTrainingRole || "macro-only") === "fine") fine.add(id);
      if ((rule.trainingRole || rule.targetTrainingRole || "macro-only") === "macro-only") macroOnly.add(id);
    }
  }
  return { fine, macroOnly };
}

function sourceManifestByTrackId() {
  const manifest = readJson(CC_SOURCE_MANIFEST_PATH, { items: [] });
  return new Map(sourceItems(manifest).map(item => [String(item.trackId || "").trim(), item]));
}

function mergedItem(item, sourceByTrackId) {
  const source = sourceByTrackId.get(String(item.trackId || "").trim()) || {};
  return {
    ...item,
    tags: item.tags || source.tags || "",
    canonicalTitle: item.canonicalTitle || item.trackName || source.canonicalTitle || "",
    canonicalArtist: item.canonicalArtist || item.artistName || source.canonicalArtist || ""
  };
}

function itemLooksExplicitTechno(item) {
  const tags = String(item.tags || "").toLowerCase();
  const title = String(item.canonicalTitle || item.trackName || "").toLowerCase();
  if (!/(^|,)genre---(minimaltechno|techno)(,|$)/.test(tags)) return false;
  if (/no longer techno|not techno/.test(title)) return false;
  return true;
}

function candidateScore(row) {
  const title = String(row.title || "").toLowerCase();
  const artist = String(row.artist || "").toLowerCase();
  const review = String(row.previousReviewStatus || "").toLowerCase();
  let score = 0;
  if (/techno|minimaltechno/.test(title)) score += 10;
  if (/industrial|acid|rave|raver|stomp|energy|adsr|electr|hyper|future|space|dark/.test(title)) score += 4;
  if (/original mix|club|jumpstyle|90/.test(title)) score += 3;
  if (/\bdj\b|dj\s|akusmatic|electrance|cyborg|ed3|white zone/.test(`${artist} ${title}`)) score += 2;
  if (/source-quality-holdout-mtg-jamendo-techno/.test(review)) score += 1;
  if (/quarantined|regression|validation-quality-holdout/.test(review)) score -= 20;
  if (/trance|disco|rock|organ|ballad|guitar/.test(title)) score -= 4;
  return score;
}

function promoteTechnoRows(payload) {
  const items = sourceItems(payload);
  const hardMisses = collectKnownHardMisses();
  const existingRules = collectExistingTrackRuleIds();
  const sourceByTrackId = sourceManifestByTrackId();
  const candidates = [];
  const skipped = [];

  for (const item of items) {
    if (item.datasetName !== "MTG-Jamendo" || item.genre !== "テクノ") continue;
    const merged = mergedItem(item, sourceByTrackId);
    const trackId = String(item.trackId || "").trim();
    const row = {
      trackId,
      title: merged.canonicalTitle || "",
      artist: merged.canonicalArtist || "",
      tags: merged.tags || "",
      previousTrainingRole: item.trainingRole || "fine",
      previousReviewStatus: item.reviewStatus || ""
    };
    if (!itemLooksExplicitTechno(merged)) {
      skipped.push({ ...row, reason: "not-explicit-techno-tag-or-title-block" });
      continue;
    }
    if (hardMisses.has(trackId) || existingRules.macroOnly.has(trackId)) {
      skipped.push({ ...row, reason: "known-hard-miss" });
      continue;
    }
    if (/quarantined|regression|validation-quality-holdout/.test(String(row.previousReviewStatus || "").toLowerCase())) {
      skipped.push({ ...row, reason: "previous-review-block" });
      continue;
    }
    if ((item.trainingRole || "fine") !== "fine") {
      candidates.push({ item, row: { ...row, score: candidateScore(row) } });
    }
  }

  const artistCounts = new Map();
  const selected = (PROMOTION_MODE === "broad" ? candidates : candidates.filter(candidate => candidate.row.score > 0))
    .sort((a, b) => b.row.score - a.row.score || a.row.artist.localeCompare(b.row.artist) || a.row.title.localeCompare(b.row.title))
    .filter(candidate => {
      if (PROMOTION_MODE === "broad") return true;
      const artist = String(candidate.row.artist || "(unknown)").trim().toLowerCase();
      if ((artistCounts.get(artist) || 0) >= MAX_PER_ARTIST) return false;
      artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
      return true;
    })
    .slice(0, PROMOTION_MODE === "broad" ? candidates.length : MAX_PROMOTIONS);

  const selectedIds = new Set(selected.map(candidate => candidate.row.trackId));
  for (const candidate of candidates) {
    if (selectedIds.has(candidate.row.trackId)) {
      const item = candidate.item;
      item.trainingRole = "fine";
      item.reviewStatus = "techno-promotion-experiment-explicit-mtg";
      item.reviewNote = "Temporary experiment: promote explicit MTG-Jamendo genre---techno rows, excluding known high-confidence hard misses.";
    } else {
      skipped.push({ ...candidate.row, reason: "not-selected-by-strict-cap" });
    }
  }
  return { promoted: selected.map(candidate => candidate.row), skipped };
}

function summarize(results) {
  const summary = results.summary || {};
  const byGenre = results.byGenre || [];
  const techno = byGenre.find(row => row.genre === "テクノ") || {};
  return {
    macroTop1Accuracy: summary.macroTop1Accuracy,
    fineTop1Accuracy: summary.fineTop1Accuracy,
    fineTop3Accuracy: summary.fineTop3Accuracy,
    formalFineTop1Accuracy: summary.formalSummary?.fineTop1Accuracy,
    formalFineTop3Accuracy: summary.formalSummary?.fineTop3Accuracy,
    styleTop1Accuracy: summary.styleTop1Accuracy,
    needsReviewRate: summary.needsReviewRate,
    dubPredictionRate: summary.dubPredictionRate,
    formalDubPredictionRate: summary.formalSummary?.dubPredictionRate,
    technoFineTotal: techno.fineTotal,
    technoFineTop1Accuracy: techno.fineTop1Accuracy,
    technoFineTop3Accuracy: techno.fineTop3Accuracy,
    technoMacroTop1Accuracy: techno.macroTop1Accuracy,
    technoMostCommonPredictions: techno.mostCommonPredictions || []
  };
}

function renderMarkdown(report) {
  const rows = [
    ["Macro Top1", report.baseline.macroTop1Accuracy, report.experiment.macroTop1Accuracy],
    ["Fine Top1", report.baseline.fineTop1Accuracy, report.experiment.fineTop1Accuracy],
    ["Fine Top3", report.baseline.fineTop3Accuracy, report.experiment.fineTop3Accuracy],
    ["Formal Fine Top1", report.baseline.formalFineTop1Accuracy, report.experiment.formalFineTop1Accuracy],
    ["Formal Fine Top3", report.baseline.formalFineTop3Accuracy, report.experiment.formalFineTop3Accuracy],
    ["Dub prediction", report.baseline.dubPredictionRate, report.experiment.dubPredictionRate],
    ["Formal dub prediction", report.baseline.formalDubPredictionRate, report.experiment.formalDubPredictionRate],
    ["Techno Top1", report.baseline.technoFineTop1Accuracy, report.experiment.technoFineTop1Accuracy],
    ["Techno Top3", report.baseline.technoFineTop3Accuracy, report.experiment.technoFineTop3Accuracy]
  ];
  return [
    "# Techno Promotion Experiment",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `Promoted rows: ${report.promoted.length}`,
    `Skipped rows: ${report.skipped.length}`,
    `Mode: ${report.promotionMode}`,
    `Accepted: ${report.accepted ? "yes" : "no"}`,
    "",
    report.recommendation,
    "",
    "## Score Diff",
    "",
    "| metric | baseline | experiment | delta |",
    "| --- | ---: | ---: | ---: |",
    ...rows.map(([name, before, after]) => `| ${name} | ${pct(before)} | ${pct(after)} | ${pct(Number(after) - Number(before))} |`),
    "",
    "## Promoted Samples",
    "",
    "| trackId | title | artist | previous role | score |",
    "| --- | --- | --- | --- | ---: |",
    ...report.promoted.slice(0, 30).map(row => `| ${row.trackId} | ${String(row.title).replaceAll("|", "/")} | ${String(row.artist).replaceAll("|", "/")} | ${row.previousTrainingRole} | ${row.score ?? ""} |`),
    ""
  ].join("\n");
}

const cache = readJson(CACHE_PATHS_PATH, {});
const verifiedPath = path.resolve(process.env.MMFR_GENRE_VERIFIED_DATASET_PATH || cache.verifiedDatasetPath || path.join(TRAINING_DIR, "verified-dataset.json"));
const baselineResults = readJson(path.join(TRAINING_DIR, "results.json"), {});
const tmpDir = fs.mkdtempSync(path.join("/tmp", "mmfr-techno-promotion-"));
const tempVerifiedPath = path.join(tmpDir, "verified-dataset.json");
const backups = backupOutputs(tmpDir);

try {
  const payload = readJson(verifiedPath, { items: [] });
  const change = promoteTechnoRows(payload);
  writeJson(tempVerifiedPath, payload);

  const env = {
    ...process.env,
    MMFR_GENRE_VERIFIED_DATASET_PATH: tempVerifiedPath,
    MMFR_GENRE_STRICT_CC_ONLY: "1",
    MMFR_GENRE_TRAIN_CACHE_ONLY: "1",
    MMFR_GENRE_TRAIN_QUIET: "1",
    MMFR_ENABLE_GENRE_THEORY_PRIORS: "0",
    MMFR_ENABLE_VALIDATION_CALIBRATION: "1",
    MMFR_ADVANCED_GENRE_FEATURES: "1",
    MMFR_ENABLE_VALIDATION_RERANKER: "1"
  };
  const run = spawnSync(process.execPath, [path.join(SCRIPT_DIR, "genre-training.mjs")], {
    cwd: DEMO_DIR,
    env,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64
  });
  if (run.status !== 0) {
    throw new Error(`genre-training failed (${run.status}): ${run.stderr || run.stdout}`);
  }
  const experimentResults = readJson(path.join(TRAINING_DIR, "results.json"), {});
  const baseline = summarize(baselineResults);
  const experiment = summarize(experimentResults);
  const accepted = change.promoted.length > 0 && (
    Number(experiment.formalFineTop3Accuracy || 0) >= Number(baseline.formalFineTop3Accuracy || 0)
    && Number(experiment.dubPredictionRate || 0) <= 10
    && Number(experiment.fineTop1Accuracy || 0) >= Number(baseline.fineTop1Accuracy || 0)
  );
  const report = {
    generatedAt: new Date().toISOString(),
    promotionMode: PROMOTION_MODE,
    maxPromotions: MAX_PROMOTIONS,
    maxPerArtist: MAX_PER_ARTIST,
    verifiedPath,
    tempVerifiedPath,
    promoted: change.promoted,
    skipped: change.skipped,
    baseline,
    experiment,
    accepted,
    recommendation: accepted
      ? "Experiment passes the guardrails. Consider converting the promoted trackIds into a specific fine-restore rule, then rerun formal-cached on the real dataset."
      : "Experiment does not pass the guardrails. Keep the current holdout rules and acquire cleaner explicit techno data instead of broad promotion."
  };
  writeJson(OUT_JSON, report);
  fs.writeFileSync(OUT_MD, renderMarkdown(report));
  console.log(JSON.stringify({
    promoted: report.promoted.length,
    skipped: report.skipped.length,
    accepted: report.accepted,
    baseline: report.baseline,
    experiment: report.experiment,
    report: path.relative(ROOT, OUT_JSON),
    markdown: path.relative(ROOT, OUT_MD)
  }, null, 2));
} finally {
  restoreOutputs(backups);
}
