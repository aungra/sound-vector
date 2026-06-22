import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const SEEDS_PATH = path.join(TRAINING_DIR, "source-seeds.json");
const OUT_JSON = path.join(TRAINING_DIR, "cc-manifest-audit.json");
const OUT_MD = path.join(TRAINING_DIR, "cc-manifest-audit.md");

const DEFAULT_MANIFESTS = [
  path.join(TRAINING_DIR, "cc-source-manifest.json"),
  path.join(TRAINING_DIR, "rwc-popular-cc-source-manifest.json"),
  path.join(TRAINING_DIR, "internet-archive-cc-source-manifest.json"),
  path.join(TRAINING_DIR, "wikimedia-commons-cc-source-manifest.json"),
  path.join(TRAINING_DIR, "mtg-jamendo-manifest.preview.json")
];
const manifestPaths = (process.env.MMFR_CC_AUDIT_MANIFESTS || DEFAULT_MANIFESTS.join(":"))
  .split(":")
  .map(value => value.trim())
  .filter(Boolean)
  .map(value => path.resolve(value));

const REQUIRED_FIELDS = ["genre", "macroGenre", "filePath", "license", "licenseUrl", "referenceUrl"];
const ALLOWED_LICENSES = new Set(
  String(process.env.MMFR_CC_ALLOWED_LICENSES || "CC0,CC-BY,CC-BY-SA,CC-BY-NC,CC-BY-NC-SA,CC-BY-ND,CC-BY-NC-ND,Creative Commons,RESEARCH-USE-COPYRIGHT-CLEARED")
    .split(",")
    .map(value => value.trim().toUpperCase())
    .filter(Boolean)
);
const PRIORITY_GENRES = new Set(["シティ・ポップ", "J-POP", "ドローン", "クラシック音楽", "ダブ", "テクノ"]);
const DEFAULT_TARGET_TRACKS = Math.max(1, Number(process.env.MMFR_GOAL_DEFAULT_TRACKS || 50));
const PRIORITY_TARGET_TRACKS = Math.max(DEFAULT_TARGET_TRACKS, Number(process.env.MMFR_GOAL_PRIORITY_TRACKS || 100));
const FINE_EXCLUDED = new Set(["電子音楽", "ワールドミュージック"]);

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
  const out = [];
  if (Array.isArray(seeds.genres)) {
    seeds.genres.forEach(item => {
      if (item.genre && item.macroGenre) out.push({ genre: item.genre, macroGenre: item.macroGenre });
    });
  }
  Object.entries(seeds.macroGenres || {}).forEach(([macroGenre, genres]) => {
    (genres || []).forEach(genre => {
      if (!out.some(item => item.genre === genre)) out.push({ genre, macroGenre });
    });
  });
  return out;
}

function normalizeLicense(value) {
  const text = String(value || "").trim().toUpperCase();
  if (!text) return "";
  if (/RESEARCH[-_\s]?USE[-_\s]?COPYRIGHT[-_\s]?CLEARED/.test(text)) return "RESEARCH-USE-COPYRIGHT-CLEARED";
  if (/CREATIVE COMMONS/.test(text)) return "CREATIVE COMMONS";
  if (/CC0|PUBLIC DOMAIN/.test(text)) return "CC0";
  const match = text.match(/CC[- ]?BY(?:[- ]?NC)?(?:[- ]?SA)?(?:[- ]?ND)?/);
  return match ? match[0].replace(/\s+/g, "-").replace(/^CCBY/, "CC-BY") : text;
}

function isInsideRepo(value) {
  const resolved = path.resolve(value);
  const relative = path.relative(ROOT, resolved);
  return Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function manifestItems(pathname) {
  const payload = loadJson(pathname, null);
  if (!payload) return [];
  const items = Array.isArray(payload) ? payload : payload.items || [];
  return items.map((item, index) => ({
    ...item,
    manifestPath: pathname,
    manifestName: path.basename(pathname),
    manifestIndex: index
  }));
}

function auditItem(item) {
  const reasons = [];
  const missing = REQUIRED_FIELDS.filter(field => !String(item[field] || "").trim());
  if (missing.length) reasons.push(`missing:${missing.join(",")}`);
  if (!item.filePath || !fs.existsSync(item.filePath)) reasons.push("audio-file-missing");
  if (item.filePath && isInsideRepo(item.filePath)) reasons.push("audio-file-inside-repo");
  const license = normalizeLicense(item.license);
  if (license && !ALLOWED_LICENSES.has(license)) reasons.push(`license-not-allowed:${license}`);
  if (/artlist/i.test([item.source, item.datasetName, item.referenceUrl, item.licenseUrl, item.filePath].join(" "))) {
    reasons.push("source-not-allowed:artlist");
  }
  return {
    ok: reasons.length === 0,
    reasons,
    license
  };
}

const seeds = seedGenres();
const seedByGenre = new Map(seeds.map(seed => [seed.genre, seed]));
const rows = manifestPaths.flatMap(pathname => manifestItems(pathname));
const auditedRows = rows.map(row => {
  const audit = auditItem(row);
  const seed = seedByGenre.get(row.genre) || {};
  return {
    genre: row.genre || "",
    macroGenre: row.macroGenre || seed.macroGenre || "",
    fineEvaluable: row.genre ? !FINE_EXCLUDED.has(row.genre) : false,
    datasetName: row.datasetName || "",
    trackId: row.trackId || "",
    filePath: row.filePath || "",
    referenceUrl: row.referenceUrl || "",
    license: row.license || "",
    normalizedLicense: audit.license,
    manifestName: row.manifestName,
    manifestPath: path.relative(ROOT, row.manifestPath),
    manifestIndex: row.manifestIndex,
    ok: audit.ok,
    reasons: audit.reasons
  };
});

function countBy(rows, getter) {
  return rows.reduce((acc, row) => {
    const key = getter(row);
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

const byGenre = seeds.map(seed => {
  const target = PRIORITY_GENRES.has(seed.genre) ? PRIORITY_TARGET_TRACKS : DEFAULT_TARGET_TRACKS;
  const genreRows = auditedRows.filter(row => row.genre === seed.genre);
  const readyRows = genreRows.filter(row => row.ok);
  const candidateRows = genreRows.length;
  return {
    genre: seed.genre,
    macroGenre: seed.macroGenre,
    fineEvaluable: !FINE_EXCLUDED.has(seed.genre),
    priority: PRIORITY_GENRES.has(seed.genre),
    target,
    candidateRows,
    readyRows: readyRows.length,
    missingReadyRows: Math.max(0, target - readyRows.length),
    topReasons: Object.entries(countBy(genreRows.filter(row => !row.ok).flatMap(row => row.reasons.map(reason => ({ reason }))), row => row.reason))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }))
  };
});

const reasonCounts = countBy(auditedRows.filter(row => !row.ok).flatMap(row => row.reasons.map(reason => ({ reason }))), row => row.reason);
const readyRows = auditedRows.filter(row => row.ok);
const report = {
  generatedAt: new Date().toISOString(),
  manifests: manifestPaths.map(pathname => ({
    path: path.relative(ROOT, pathname),
    exists: fs.existsSync(pathname),
    items: fs.existsSync(pathname) ? manifestItems(pathname).length : 0
  })),
  requiredFields: REQUIRED_FIELDS,
  allowedLicenses: [...ALLOWED_LICENSES],
  summary: {
    totalRows: auditedRows.length,
    readyRows: readyRows.length,
    rejectedRows: auditedRows.length - readyRows.length,
    readyFineGenres: byGenre.filter(row => row.fineEvaluable && row.readyRows >= row.target).length,
    candidateFineGenres: byGenre.filter(row => row.fineEvaluable && row.candidateRows >= row.target).length
  },
  rejectedByReason: Object.fromEntries(Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])),
  readyByGenre: countBy(readyRows, row => row.genre),
  byGenre,
  sampleRejected: auditedRows.filter(row => !row.ok).slice(0, 200)
};

function mdTable(rows) {
  if (!rows.length) return "_None._";
  const header = "| Genre | Candidates | Ready | Target | Missing ready | Top reason |\n|---|---:|---:|---:|---:|---|";
  const body = rows.map(row => {
    const topReason = row.topReasons[0] ? `${row.topReasons[0].reason} (${row.topReasons[0].count})` : "";
    return `| ${row.genre} | ${row.candidateRows} | ${row.readyRows} | ${row.target} | ${row.missingReadyRows} | ${topReason} |`;
  }).join("\n");
  return `${header}\n${body}`;
}

const mdRows = byGenre
  .filter(row => row.fineEvaluable && (row.candidateRows || row.readyRows || row.priority))
  .sort((a, b) => Number(b.priority) - Number(a.priority) || b.missingReadyRows - a.missingReadyRows || b.candidateRows - a.candidateRows || a.genre.localeCompare(b.genre, "ja"));

const md = [
  "# CC Manifest Audit",
  "",
  `Generated: ${report.generatedAt}`,
  "",
  "## Summary",
  "",
  `- Total rows: ${report.summary.totalRows}`,
  `- Ready rows: ${report.summary.readyRows}`,
  `- Rejected rows: ${report.summary.rejectedRows}`,
  `- Ready fine genres: ${report.summary.readyFineGenres}`,
  `- Candidate fine genres: ${report.summary.candidateFineGenres}`,
  "",
  "## Rejected By Reason",
  "",
  ...Object.entries(report.rejectedByReason).map(([reason, count]) => `- ${reason}: ${count}`),
  "",
  "## Genre Readiness",
  "",
  mdTable(mdRows)
].join("\n");

fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
fs.writeFileSync(OUT_MD, md);

console.log(JSON.stringify({
  summary: report.summary,
  rejectedByReason: report.rejectedByReason,
  json: path.relative(ROOT, OUT_JSON),
  markdown: path.relative(ROOT, OUT_MD)
}, null, 2));
