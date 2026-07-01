import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
const RULES_PATH = path.resolve(process.env.MMFR_SOURCE_QUALITY_HOLDOUT_RULES || path.join(TRAINING_DIR, "source-quality-holdout-rules.json"));
const REPORT_PATH = path.join(TRAINING_DIR, "source-quality-holdout-report.json");
const APPLY = process.env.MMFR_SOURCE_QUALITY_HOLDOUT_APPLY === "1";

function readJson(pathname, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function localCachePaths() {
  const payload = readJson(CACHE_PATHS_PATH, {});
  return payload && typeof payload === "object" ? payload : {};
}

const cache = localCachePaths();
const verifiedPath = path.resolve(process.env.MMFR_GENRE_VERIFIED_DATASET_PATH || cache.verifiedDatasetPath || path.join(TRAINING_DIR, "verified-dataset.json"));

function compactRule(rule = {}) {
  return {
    datasetName: String(rule.datasetName || "").trim(),
    genre: String(rule.genre || "").trim(),
    macroGenre: String(rule.macroGenre || "").trim(),
    trainingRole: String(rule.trainingRole || rule.targetTrainingRole || "macro-only").trim(),
    reviewStatus: String(rule.reviewStatus || "").trim(),
    reason: String(rule.reason || "").trim(),
    trackIds: Array.isArray(rule.trackIds) ? rule.trackIds.map(value => String(value).trim()).filter(Boolean) : [],
    excludeTrackIds: Array.isArray(rule.excludeTrackIds) ? rule.excludeTrackIds.map(value => String(value).trim()).filter(Boolean) : [],
    sourceUrlIncludes: Array.isArray(rule.sourceUrlIncludes) ? rule.sourceUrlIncludes.map(value => String(value).trim()).filter(Boolean) : []
  };
}

function ruleKey(rule = {}) {
  return `${rule.datasetName}|${rule.genre}`;
}

function ruleInstanceKey(rule = {}) {
  return [
    rule.datasetName,
    rule.genre,
    rule.trainingRole || "macro-only",
    rule.reviewStatus || "",
    rule.trackIds.join(","),
    rule.excludeTrackIds.join(","),
    rule.sourceUrlIncludes.join(",")
  ].join("|");
}

function ruleSpecificity(rule = {}) {
  return (rule.trackIds.length ? 2000 - Math.min(999, rule.trackIds.length) : 0)
    + (rule.excludeTrackIds.length ? 100 + rule.excludeTrackIds.length : 0)
    + (rule.sourceUrlIncludes.length ? 10 + rule.sourceUrlIncludes.length : 0)
    + (rule.trainingRole === "fine" ? 1 : 0);
}

function itemKey(item = {}) {
  return `${String(item.datasetName || "").trim()}|${String(item.genre || "").trim()}`;
}

function ruleApplies(rule, item) {
  if (!rule) return false;
  if (rule.trackIds.length) {
    const id = String(item.trackId || "").trim();
    if (!rule.trackIds.includes(id)) return false;
  }
  if (rule.excludeTrackIds.length) {
    const id = String(item.trackId || "").trim();
    if (rule.excludeTrackIds.includes(id)) return false;
  }
  if (rule.sourceUrlIncludes.length) {
    const source = String(item.sourceUrl || item.filePath || item.referenceUrl || "");
    if (!rule.sourceUrlIncludes.some(fragment => source.includes(fragment))) return false;
  }
  return true;
}

const verifiedPayload = readJson(verifiedPath, { items: [] });
const items = Array.isArray(verifiedPayload) ? verifiedPayload : verifiedPayload.items || [];
const rulesPayload = readJson(RULES_PATH, { rules: [] });
const rules = (rulesPayload.rules || []).map(compactRule).filter(rule => rule.datasetName && rule.genre);
const rulesByKey = new Map();
rules.forEach(rule => {
  const key = ruleKey(rule);
  if (!rulesByKey.has(key)) rulesByKey.set(key, []);
  rulesByKey.get(key).push(rule);
});
for (const list of rulesByKey.values()) {
  list.sort((a, b) => ruleSpecificity(b) - ruleSpecificity(a));
}

const matches = [];
const byRule = {};
let changed = 0;

for (const item of items) {
  if (!["cc-dataset", "local-audio"].includes(item.sourceType)) continue;
  const rule = (rulesByKey.get(itemKey(item)) || []).find(candidate => ruleApplies(candidate, item));
  if (!rule) continue;
  const wasRole = item.trainingRole || "fine";
  const targetRole = rule.trainingRole || "macro-only";
  const next = {
    trainingRole: targetRole,
    reviewStatus: rule.reviewStatus || `source-quality-holdout-${rule.datasetName}-${rule.genre}`,
    reviewNote: rule.reason
  };
  matches.push({
    datasetName: item.datasetName,
    genre: item.genre,
    trackId: item.trackId || "",
    canonicalArtist: item.canonicalArtist || item.artistName || "",
    canonicalTitle: item.canonicalTitle || item.trackName || "",
    sourceUrl: item.sourceUrl || item.filePath || "",
    referenceUrl: item.referenceUrl || "",
    previousTrainingRole: wasRole,
    nextTrainingRole: next.trainingRole,
    previousReviewStatus: item.reviewStatus || "",
    nextReviewStatus: next.reviewStatus
  });
  const key = ruleInstanceKey(rule);
  byRule[key] ||= {
    datasetName: rule.datasetName,
    genre: rule.genre,
    macroGenre: rule.macroGenre,
    trainingRole: rule.trainingRole,
    reviewStatus: rule.reviewStatus,
    reason: rule.reason,
    trackIds: rule.trackIds,
    excludeTrackIds: rule.excludeTrackIds,
    sourceUrlIncludes: rule.sourceUrlIncludes,
    matched: 0,
    changed: 0
  };
  byRule[key].matched += 1;
  if (wasRole !== targetRole || item.reviewStatus !== next.reviewStatus || item.reviewNote !== next.reviewNote) {
    byRule[key].changed += 1;
    changed += 1;
    if (APPLY) {
      item.trainingRole = next.trainingRole;
      item.reviewStatus = next.reviewStatus;
      item.reviewNote = next.reviewNote;
      if (rule.macroGenre) item.macroGenre = rule.macroGenre;
    }
  }
}

if (APPLY && changed) {
  const nextPayload = Array.isArray(verifiedPayload)
    ? items
    : { ...verifiedPayload, items, updatedAt: new Date().toISOString() };
  fs.writeFileSync(verifiedPath, JSON.stringify(nextPayload, null, 2));
}

const report = {
  generatedAt: new Date().toISOString(),
  apply: APPLY,
  rulesPath: path.relative(ROOT, RULES_PATH),
  verifiedPath,
  ruleCount: rules.length,
  matched: matches.length,
  changed,
  byRule: Object.values(byRule),
  sampleMatches: matches.slice(0, 80)
};

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  apply: APPLY,
  matched: report.matched,
  changed: report.changed,
  report: path.relative(ROOT, REPORT_PATH),
    byRule: report.byRule.map(row => ({
      datasetName: row.datasetName,
      genre: row.genre,
      trainingRole: row.trainingRole,
      matched: row.matched,
      changed: row.changed
    }))
}, null, 2));
