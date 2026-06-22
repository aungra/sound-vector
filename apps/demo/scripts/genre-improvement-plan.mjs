import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const RESULTS_PATH = path.join(TRAINING_DIR, "results.json");
const GOAL_REPORT_PATH = path.join(TRAINING_DIR, "goal-report.json");
const COVERAGE_REPORT_PATH = path.join(TRAINING_DIR, "cc-coverage-report.json");
const APPROVAL_SUMMARY_PATH = path.join(TRAINING_DIR, "cc-approval-summary.json");
const MTG_AUDIO_PLAN_PATH = path.join(TRAINING_DIR, "mtg-jamendo-audio-plan.json");
const MANIFEST_AUDIT_PATH = path.join(TRAINING_DIR, "cc-manifest-audit.json");
const DIVERSITY_AUDIT_PATH = path.join(TRAINING_DIR, "genre-diversity-audit.json");
const OUT_JSON = path.join(TRAINING_DIR, "genre-improvement-plan.json");
const OUT_MD = path.join(TRAINING_DIR, "genre-improvement-plan.md");

const GOAL_ACCURACY = Math.max(0, Math.min(100, Number(process.env.MMFR_GOAL_ACCURACY || 80)));
const MIN_FORMAL_TEST_PER_GENRE = Math.max(1, Number(process.env.MMFR_MIN_FORMAL_TEST_PER_GENRE || 10));

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function pct(value) {
  return value === null || value === undefined ? "n/a" : `${value}%`;
}

function confidenceBand(row) {
  if (!row.fineEvaluable) return "macro-only";
  if (row.formalTrainingRows <= 0) return "no-formal-data";
  if (!row.stableTestReady || row.testRows < MIN_FORMAL_TEST_PER_GENRE) return "unstable-test";
  if (Number(row.top1Accuracy) >= GOAL_ACCURACY) return "passing";
  if (Number(row.top1Accuracy) >= 60) return "classifier-tune";
  return "data-and-classifier";
}

function firstSourceAction(row) {
  const source = (row.recommendedSources || [])[0];
  if (source?.nextAction) return source.nextAction;
  if ((row.searchTerms || []).length) return `Search/curate CC audio with: ${row.searchTerms.slice(0, 3).join(" / ")}`;
  return "Add reviewed CC/public-research audio via cc-source-manifest.json.";
}

const results = loadJson(RESULTS_PATH, {});
const goal = loadJson(GOAL_REPORT_PATH, {});
const coverage = loadJson(COVERAGE_REPORT_PATH, {});
const approvals = loadJson(APPROVAL_SUMMARY_PATH, {});
const mtgAudioPlan = loadJson(MTG_AUDIO_PLAN_PATH, null);
const manifestAudit = loadJson(MANIFEST_AUDIT_PATH, null);
const diversityAudit = loadJson(DIVERSITY_AUDIT_PATH, null);
const coverageByGenre = new Map((coverage.genres || []).map(row => [row.genre, row]));

const genres = (goal.genres || []).filter(row => row.fineEvaluable).map(row => {
  const coverageRow = coverageByGenre.get(row.genre) || {};
  const approvedPotential = Object.values(coverageRow.approvedByGenre || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  const reviewCandidateRows = Number(coverageRow.internetArchiveCandidateRows || 0) + Number(coverageRow.wikimediaCandidateRows || 0);
  const band = confidenceBand(row);
  const estimatedNeededCorrect = row.testRows
    ? Math.max(0, Math.ceil((GOAL_ACCURACY / 100) * row.testRows) - Math.round((Number(row.top1Accuracy || 0) / 100) * row.testRows))
    : null;
  return {
    genre: row.genre,
    macroGenre: row.macroGenre,
    priority: row.priority,
    band,
    targetTracks: row.targetTracks,
    formalTrainingRows: row.formalTrainingRows,
    missingFormalTracks: row.missingFormalTracks,
    potentialTrainingRows: row.potentialTrainingRows,
    missingPotentialTracks: row.missingPotentialTracks,
    reviewCandidateRows,
    approvedPotential,
    testRows: row.testRows,
    top1Accuracy: row.top1Accuracy,
    top3Accuracy: row.top3Accuracy,
    estimatedNeededCorrect,
    nextAction: firstSourceAction(row),
    recommendedSources: (row.recommendedSources || []).map(source => source.id || source.name).filter(Boolean),
    searchTerms: row.searchTerms || []
  };
});

const actionPriority = {
  "no-formal-data": 0,
  "unstable-test": 1,
  "data-and-classifier": 2,
  "classifier-tune": 3,
  "passing": 4,
  "macro-only": 5
};

const prioritized = [...genres].sort((a, b) => {
  return actionPriority[a.band] - actionPriority[b.band]
    || Number(b.priority) - Number(a.priority)
    || b.missingFormalTracks - a.missingFormalTracks
    || b.reviewCandidateRows - a.reviewCandidateRows
    || a.genre.localeCompare(b.genre, "ja");
});

const confusionHints = (results.diagnostics?.topFineConfusions || []).slice(0, 12).map(row => ({
  actual: row.actual,
  predicted: row.predicted,
  count: row.count,
  recommendation: `Increase reviewed formal audio for ${row.actual}, then tune features that separate it from ${row.predicted}.`
}));

const plan = {
  generatedAt: new Date().toISOString(),
  goal: {
    genreCount: goal.goal?.genreCount || 30,
    top1Accuracy: GOAL_ACCURACY,
    minFormalTestPerGenre: MIN_FORMAL_TEST_PER_GENRE
  },
  currentStatus: {
    status: goal.status || "unknown",
    formalStatus: goal.summary?.formalStatus || results.summary?.formalSummary?.status || "unknown",
    currentReferenceMacroTop1: goal.summary?.currentReferenceMacroTop1 ?? results.summary?.macroTop1Accuracy ?? null,
    currentReferenceFineTop1: goal.summary?.currentReferenceFineTop1 ?? results.summary?.fineTop1Accuracy ?? null,
    currentReferenceFineTop3: goal.summary?.currentReferenceFineTop3 ?? results.summary?.fineTop3Accuracy ?? null,
    formalReadyGenres: goal.summary?.formalReadyGenres ?? 0,
    potentialReadyGenres: goal.summary?.potentialReadyGenres ?? 0,
    passingGenres: goal.summary?.passingGenres ?? 0,
    approvedRows: approvals.totals?.approvedRows ?? 0,
    manifestRows: approvals.totals?.manifestRows ?? 0,
    localAudioReadyRows: approvals.totals?.localAudioReadyRows ?? 0,
    mtgSelectedRows: mtgAudioPlan?.selectedRows ?? null,
    mtgExistingAudioRows: mtgAudioPlan?.existingAudioRows ?? null,
    mtgMissingAudioRows: mtgAudioPlan?.missingAudioRows ?? null,
    manifestReadyRows: manifestAudit?.summary?.readyRows ?? null,
    manifestRejectedRows: manifestAudit?.summary?.rejectedRows ?? null,
    manifestReadyFineGenres: manifestAudit?.summary?.readyFineGenres ?? null,
    averageReferenceArtists: diversityAudit?.summary?.averageArtists ?? null,
    lowArtistDiversityGenres: diversityAudit?.summary?.lowReferenceArtistDiversityGenres ?? null,
    priorityLowArtistGenres: diversityAudit?.summary?.priorityLowArtistGenres ?? null
  },
  blockers: [
    approvals.totals?.approvedRows ? null : "No reviewed CC/public candidates are approved yet.",
    approvals.totals?.localAudioReadyRows ? null : "No approved audio files are ready on external storage yet.",
    mtgAudioPlan && mtgAudioPlan.missingAudioRows > 0 ? `MTG-Jamendo audio-low is missing ${mtgAudioPlan.missingAudioRows} selected file(s).` : null,
    manifestAudit && manifestAudit.summary?.readyRows === 0 ? "CC manifest audit has 0 import-ready row(s)." : null,
    diversityAudit && diversityAudit.summary?.lowReferenceArtistDiversityGenres > 0 ? `${diversityAudit.summary.lowReferenceArtistDiversityGenres} genre(s) are below the artist-diversity target.` : null,
    (goal.summary?.formalReadyGenres || 0) >= (goal.goal?.genreCount || 30) ? null : "Formal test coverage is below the 30-genre target."
  ].filter(Boolean),
  actionBuckets: {
    noFormalData: prioritized.filter(row => row.band === "no-formal-data"),
    unstableTest: prioritized.filter(row => row.band === "unstable-test"),
    dataAndClassifier: prioritized.filter(row => row.band === "data-and-classifier"),
    classifierTune: prioritized.filter(row => row.band === "classifier-tune"),
    passing: prioritized.filter(row => row.band === "passing")
  },
  nextFive: prioritized.filter(row => row.band !== "passing").slice(0, 5),
  confusionHints,
  genres: prioritized
};

function mdTable(rows) {
  if (!rows.length) return "_None._";
  const header = "| Genre | Band | Formal | Potential | Test | Top1 | Top3 | Next action |\n|---|---:|---:|---:|---:|---:|---:|---|";
  const body = rows.map(row => [
    row.genre,
    row.band,
    `${row.formalTrainingRows}/${row.targetTracks}`,
    row.potentialTrainingRows,
    row.testRows,
    pct(row.top1Accuracy),
    pct(row.top3Accuracy),
    row.nextAction.replaceAll("|", "/")
  ].join(" | ")).map(line => `| ${line} |`).join("\n");
  return `${header}\n${body}`;
}

const md = [
  "# Genre Improvement Plan",
  "",
  `Generated: ${plan.generatedAt}`,
  "",
  "## Current Score",
  "",
  `- Status: ${plan.currentStatus.status}`,
  `- Formal status: ${plan.currentStatus.formalStatus}`,
  `- Reference Macro Top1: ${pct(plan.currentStatus.currentReferenceMacroTop1)}`,
  `- Reference Fine Top1: ${pct(plan.currentStatus.currentReferenceFineTop1)}`,
  `- Reference Fine Top3: ${pct(plan.currentStatus.currentReferenceFineTop3)}`,
  `- Formal ready genres: ${plan.currentStatus.formalReadyGenres}`,
  `- Passing genres: ${plan.currentStatus.passingGenres}`,
  mtgAudioPlan ? `- MTG selected audio: ${plan.currentStatus.mtgExistingAudioRows}/${plan.currentStatus.mtgSelectedRows} ready` : "",
  manifestAudit ? `- Manifest ready rows: ${plan.currentStatus.manifestReadyRows} / rejected rows: ${plan.currentStatus.manifestRejectedRows}` : "",
  diversityAudit ? `- Average reference artists per genre: ${plan.currentStatus.averageReferenceArtists}` : "",
  diversityAudit ? `- Low artist-diversity genres: ${plan.currentStatus.lowArtistDiversityGenres}` : "",
  "",
  "## Blockers",
  "",
  ...(plan.blockers.length ? plan.blockers.map(item => `- ${item}`) : ["- None."]),
  "",
  "## Next Five Actions",
  "",
  mdTable(plan.nextFive),
  "",
  "## No Formal Data",
  "",
  mdTable(plan.actionBuckets.noFormalData.slice(0, 20)),
  "",
  "## Classifier Confusion Hints",
  "",
  ...(confusionHints.length ? confusionHints.map(row => `- ${row.actual} -> ${row.predicted}: ${row.count} example(s). ${row.recommendation}`) : ["- None."])
].join("\n");

fs.writeFileSync(OUT_JSON, JSON.stringify(plan, null, 2));
fs.writeFileSync(OUT_MD, md);

console.log(JSON.stringify({
  status: plan.currentStatus.status,
  formalStatus: plan.currentStatus.formalStatus,
  referenceFineTop1: plan.currentStatus.currentReferenceFineTop1,
  blockers: plan.blockers,
  buckets: Object.fromEntries(Object.entries(plan.actionBuckets).map(([key, rows]) => [key, rows.length])),
  nextFive: plan.nextFive.map(row => ({
    genre: row.genre,
    band: row.band,
    formal: `${row.formalTrainingRows}/${row.targetTracks}`,
    potential: row.potentialTrainingRows,
    top1: row.top1Accuracy
  })),
  json: path.relative(ROOT, OUT_JSON),
  markdown: path.relative(ROOT, OUT_MD)
}, null, 2));
