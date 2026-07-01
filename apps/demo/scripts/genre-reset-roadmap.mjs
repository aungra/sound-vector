import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");

const RESULTS_PATH = path.join(TRAINING_DIR, "results.json");
const GOAL_PATH = path.join(TRAINING_DIR, "goal-report.json");
const VERIFIED_PATH = path.join(TRAINING_DIR, "verified-dataset.json");
const SCORE_SEARCH_PATH = path.join(TRAINING_DIR, "score-search", "summary.json");
const OUT_JSON = path.join(TRAINING_DIR, "genre-reset-roadmap.json");
const OUT_MD = path.join(TRAINING_DIR, "genre-reset-roadmap.md");

const PRIORITY_TARGETS = new Set(["テクノ", "ドローン", "ダブ", "J-POP", "シティ・ポップ", "アニメソング"]);
const MIN_FORMAL_FINE = 50;
const MIN_TEST = 10;
const GOAL_ACCURACY = 80;

function readJson(pathname, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function sourceItems(payload) {
  return Array.isArray(payload) ? payload : payload?.items || [];
}

function pct(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1).replace(/\.0$/, "")}%` : "n/a";
}

function countBy(items, selector) {
  const out = {};
  for (const item of items) {
    const key = selector(item) || "(empty)";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function topCounts(map, limit = 3) {
  return Object.entries(map || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function genreStatsFromVerified(items) {
  const byGenre = new Map();
  for (const item of items) {
    const genre = item.genre || "(missing)";
    if (!byGenre.has(genre)) {
      byGenre.set(genre, {
        genre,
        totalRows: 0,
        formalRows: 0,
        formalFineRows: 0,
        fineRows: 0,
        macroOnlyRows: 0,
        datasets: {},
        reviewStatuses: {}
      });
    }
    const row = byGenre.get(genre);
    const sourceType = item.sourceType || "";
    const role = item.trainingRole || "fine";
    const formal = sourceType === "cc-dataset" || sourceType === "local-audio";
    row.totalRows += 1;
    if (formal) row.formalRows += 1;
    if (role === "macro-only") row.macroOnlyRows += 1;
    else row.fineRows += 1;
    if (formal && role !== "macro-only") row.formalFineRows += 1;
    row.datasets[item.datasetName || "undefined"] = (row.datasets[item.datasetName || "undefined"] || 0) + 1;
    row.reviewStatuses[item.reviewStatus || ""] = (row.reviewStatuses[item.reviewStatus || ""] || 0) + 1;
  }
  return byGenre;
}

function classifyGenre(row) {
  const missingFormal = Math.max(0, MIN_FORMAL_FINE - row.formalFineRows);
  const missingTest = Math.max(0, MIN_TEST - (row.testRows || 0));
  const noisyRatio = row.formalRows ? row.macroOnlyRows / row.formalRows : 0;
  const top1 = Number(row.fineTop1Accuracy ?? row.top1Accuracy ?? -1);
  const top3 = Number(row.fineTop3Accuracy ?? row.top3Accuracy ?? -1);
  const styleTop1 = Number(row.styleTop1Accuracy ?? -1);

  if ((top1 >= GOAL_ACCURACY || styleTop1 >= GOAL_ACCURACY) && !missingTest) return "passing-or-style-passing";
  if (missingFormal > 0 || missingTest > 0) return "data-gap";
  if (noisyRatio >= 0.25) return "label-noise";
  if (top3 >= 55 && top1 < 40) return "ranker-gap";
  if (top1 < 40) return "model-and-data-gap";
  return "needs-incremental-improvement";
}

function nextActionFor(row) {
  if (row.bucket === "data-gap") {
    return `Add ${row.missingFormalFine || 0} explicit formal fine row(s) and keep at least ${MIN_TEST} test rows before more tuning.`;
  }
  if (row.bucket === "label-noise") {
    return "Review source/track labels first; promote only explicit substyle rows and keep broad labels macro-only.";
  }
  if (row.bucket === "ranker-gap") {
    return "Use validation examples to train a narrow per-macro reranker; avoid global boosts.";
  }
  if (row.bucket === "passing-or-style-passing") {
    return "Freeze as a reference/control genre; do not spend tuning budget here unless regressions appear.";
  }
  return "Collect cleaner contrast pairs against the most common wrong predictions before changing weights.";
}

const results = readJson(RESULTS_PATH);
const goal = readJson(GOAL_PATH);
const verified = sourceItems(readJson(VERIFIED_PATH, { items: [] }));
const scoreSearch = readJson(SCORE_SEARCH_PATH, {});

const verifiedByGenre = genreStatsFromVerified(verified);
const byGenreRows = results.byGenre || [];
const goalRows = new Map((goal.priorityMissing || []).map(row => [row.genre, row]));
const allGenres = new Set([...verifiedByGenre.keys(), ...byGenreRows.map(row => row.genre).filter(Boolean), ...goalRows.keys()]);

const rows = [...allGenres].map(genre => {
  const verifiedStats = verifiedByGenre.get(genre) || { genre, totalRows: 0, formalRows: 0, formalFineRows: 0, fineRows: 0, macroOnlyRows: 0, datasets: {}, reviewStatuses: {} };
  const resultStats = byGenreRows.find(row => row.genre === genre) || {};
  const goalStats = goalRows.get(genre) || {};
  const row = {
    ...verifiedStats,
    macroGenre: resultStats.macroGenre || goalStats.macroGenre || "",
    testRows: resultStats.fineTotal ?? goalStats.testRows ?? 0,
    fineTop1Accuracy: resultStats.fineTop1Accuracy ?? goalStats.genreTop1Accuracy ?? goalStats.top1Accuracy ?? null,
    fineTop3Accuracy: resultStats.fineTop3Accuracy ?? goalStats.genreTop3Accuracy ?? goalStats.top3Accuracy ?? null,
    macroTop1Accuracy: resultStats.macroTop1Accuracy ?? goalStats.macroTop1Accuracy ?? null,
    styleTop1Accuracy: goalStats.styleTop1Accuracy ?? resultStats.styleTop1Accuracy ?? null,
    priority: PRIORITY_TARGETS.has(genre) || Boolean(goalStats.priority),
    commonPredictions: resultStats.mostCommonPredictions || [],
    missingFormalFine: Math.max(0, MIN_FORMAL_FINE - verifiedStats.formalFineRows),
    missingTest: Math.max(0, MIN_TEST - Number(resultStats.fineTotal ?? goalStats.testRows ?? 0)),
    topDatasets: topCounts(verifiedStats.datasets, 4),
    topReviewStatuses: topCounts(verifiedStats.reviewStatuses, 4)
  };
  row.bucket = classifyGenre(row);
  row.nextAction = nextActionFor(row);
  row.urgency = (
    (row.priority ? 1000 : 0)
    + (genre === "テクノ" ? 400 : 0)
    - (row.bucket === "passing-or-style-passing" ? 800 : 0)
    + row.missingFormalFine * 8
    + row.missingTest * 20
    + Math.max(0, 60 - Number(row.fineTop1Accuracy || 0)) * 2
    + (row.bucket === "label-noise" ? 120 : 0)
  );
  return row;
}).sort((a, b) => b.urgency - a.urgency);

const buckets = countBy(rows, row => row.bucket);
const stopDoing = [
  "Stop broad global score-search runs unless a new feature family is added; recent global flags mostly traded one metric for another.",
  "Stop promoting broad FMA/MTG genre labels directly to fine labels without source-level review.",
  "Stop optimizing against a single weak target if it crosses the dub guardrail or drops Fine Top1."
];
const continueDoing = [
  "Keep advanced-validation-reranker as the reference model because it improved Fine Top3, Formal Fine Top3, Style Top1, and needs-review rate.",
  "Keep styleHint evaluation for city-pop and similar ambiguous substyles instead of forcing exact fine labels.",
  "Keep source-quality holdouts and track-level overrides; they prevent noisy formal rows from dominating fine training."
];
const startDoing = [
  "Run data-first sprints: each sprint selects 3-5 genres, adds explicit formal rows, then retrains once.",
  "Create per-macro specialist evaluation sets before adding more weighting knobs.",
  "Treat techno as the first acquisition sprint: explicit techno rows, explicit non-techno electronic contrast rows, and no broad electronic labels."
];

const report = {
  generatedAt: new Date().toISOString(),
  baseline: {
    macroTop1Accuracy: results.summary?.macroTop1Accuracy,
    fineTop1Accuracy: results.summary?.fineTop1Accuracy,
    fineTop3Accuracy: results.summary?.fineTop3Accuracy,
    formalFineTop1Accuracy: results.summary?.formalSummary?.fineTop1Accuracy,
    formalFineTop3Accuracy: results.summary?.formalSummary?.fineTop3Accuracy,
    styleTop1Accuracy: results.summary?.styleTop1Accuracy,
    needsReviewRate: results.summary?.needsReviewRate,
    dubPredictionRate: results.summary?.dubPredictionRate,
    bestScoreSearchConfig: scoreSearch.best?.config?.name || ""
  },
  bucketCounts: buckets,
  stopDoing,
  continueDoing,
  startDoing,
  priorityRows: rows.slice(0, 20),
  rows
};

fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

const md = [];
md.push("# Genre Reset Roadmap");
md.push("");
md.push(`Generated: ${report.generatedAt}`);
md.push("");
md.push("## Why Reset");
md.push("");
md.push("Recent work improved the reference model, but the remaining gap to 80% is no longer mainly a classifier-weight problem. The current bottleneck is mixed evaluation quality: sparse formal rows, broad/noisy source labels, and under-separated macro families are being optimized together.");
md.push("");
md.push("## Current Baseline");
md.push("");
md.push("| metric | value |");
md.push("| --- | ---: |");
md.push(`| Macro Top1 | ${pct(report.baseline.macroTop1Accuracy)} |`);
md.push(`| Fine Top1 | ${pct(report.baseline.fineTop1Accuracy)} |`);
md.push(`| Fine Top3 | ${pct(report.baseline.fineTop3Accuracy)} |`);
md.push(`| Formal Fine Top1 | ${pct(report.baseline.formalFineTop1Accuracy)} |`);
md.push(`| Formal Fine Top3 | ${pct(report.baseline.formalFineTop3Accuracy)} |`);
md.push(`| Style Top1 | ${pct(report.baseline.styleTop1Accuracy)} |`);
md.push(`| Needs review | ${pct(report.baseline.needsReviewRate)} |`);
md.push(`| Dub prediction rate | ${pct(report.baseline.dubPredictionRate)} |`);
md.push(`| Best config | ${report.baseline.bestScoreSearchConfig || "unknown"} |`);
md.push("");
md.push("## Buckets");
md.push("");
md.push("| bucket | genres | meaning |");
md.push("| --- | ---: | --- |");
md.push(`| data-gap | ${buckets["data-gap"] || 0} | Not enough explicit formal fine rows or stable test rows. |`);
md.push(`| label-noise | ${buckets["label-noise"] || 0} | Enough rows exist, but broad labels/holdouts dominate. |`);
md.push(`| ranker-gap | ${buckets["ranker-gap"] || 0} | Top3 is more promising than Top1; use local reranking. |`);
md.push(`| model-and-data-gap | ${buckets["model-and-data-gap"] || 0} | Low accuracy despite some data; add contrast data before tuning. |`);
md.push(`| passing-or-style-passing | ${buckets["passing-or-style-passing"] || 0} | Meets exact or style target; freeze as control. |`);
md.push("");
md.push("## Stop Doing");
md.push("");
for (const item of stopDoing) md.push(`- ${item}`);
md.push("");
md.push("## Continue Doing");
md.push("");
for (const item of continueDoing) md.push(`- ${item}`);
md.push("");
md.push("## Start Doing");
md.push("");
for (const item of startDoing) md.push(`- ${item}`);
md.push("");
md.push("## Next Priority Rows");
md.push("");
md.push("| genre | bucket | formal fine | test | Top1 | Top3 | style Top1 | next action |");
md.push("| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |");
for (const row of rows.slice(0, 20)) {
  md.push(`| ${row.genre} | ${row.bucket} | ${row.formalFineRows} | ${row.testRows} | ${pct(row.fineTop1Accuracy)} | ${pct(row.fineTop3Accuracy)} | ${pct(row.styleTop1Accuracy)} | ${row.nextAction} |`);
}
md.push("");
md.push("## New Approach");
md.push("");
md.push("1. Run acquisition sprints instead of open-ended tuning. Each sprint chooses 3-5 genres, adds explicit formal rows, retrains once, then stops.");
md.push("2. Split the work by failure bucket. Data-gap genres get audio first; label-noise genres get review/holdouts first; ranker-gap genres get local rerankers only after data is stable.");
md.push("3. Make `テクノ` the first sprint. It needs explicit techno audio and explicit electronic contrast examples, not stronger global style boosting.");
md.push("4. Treat 80% as a data-quality target before a model target. Do not count a genre toward the 30-genre goal until it has enough formal fine rows and stable test coverage.");
md.push("");
md.push("## Output");
md.push("");
md.push("- `genre-training/genre-reset-roadmap.json`");
md.push("- `genre-training/genre-reset-roadmap.md`");

fs.writeFileSync(OUT_MD, md.join("\n") + "\n");

console.log(`Wrote ${path.relative(ROOT, OUT_JSON)}`);
console.log(`Wrote ${path.relative(ROOT, OUT_MD)}`);
