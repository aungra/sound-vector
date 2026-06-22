import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const REVIEW_TSV_PATH = path.join(TRAINING_DIR, "internet-archive-review-queue.tsv");
const MANIFEST_PATH = path.join(TRAINING_DIR, "internet-archive-cc-source-manifest.json");
const COVERAGE_PATH = path.join(TRAINING_DIR, "cc-coverage-report.json");
const OUT_PATH = path.join(TRAINING_DIR, "internet-archive-approval-report.json");

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function parseTsvLine(line) {
  const out = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const ch = line[index];
    const next = line[index + 1];
    if (quoted) {
      if (ch === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (ch === "\"") {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === "\"") {
      quoted = true;
    } else if (ch === "\t") {
      out.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  out.push(cell);
  return out;
}

function reviewRows() {
  if (!fs.existsSync(REVIEW_TSV_PATH)) return [];
  const lines = fs.readFileSync(REVIEW_TSV_PATH, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseTsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cells = parseTsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
}

function isApproved(row) {
  return /^(approved|accepted|ok)$/i.test(String(row.reviewStatus || "").trim());
}

function isHighPriority(row) {
  return Number(row.reviewPriority || 0) >= 70 && !String(row.riskFlags || "").trim();
}

function countByGenre(rows) {
  return rows.reduce((acc, row) => {
    if (!row.genre) return acc;
    acc[row.genre] = (acc[row.genre] || 0) + 1;
    return acc;
  }, {});
}

const reviews = reviewRows();
const approved = reviews.filter(isApproved);
const highPriority = reviews.filter(isHighPriority);
const manifest = loadJson(MANIFEST_PATH, { items: [] });
const manifestItems = Array.isArray(manifest) ? manifest : manifest.items || [];
const coverage = loadJson(COVERAGE_PATH, { genres: [] });
const manifestAudioReady = manifestItems.filter(item => item.filePath && fs.existsSync(item.filePath));
const manifestAudioMissing = manifestItems.filter(item => !item.filePath || !fs.existsSync(item.filePath));

const coverageByGenre = new Map((coverage.genres || []).map(row => [row.genre, row]));
const approvedByGenre = countByGenre(approved);
const manifestByGenre = countByGenre(manifestItems);
const readyByGenre = countByGenre(manifestAudioReady);
const genres = [...new Set([
  ...Object.keys(approvedByGenre),
  ...Object.keys(manifestByGenre),
  ...Object.keys(readyByGenre),
  ...(coverage.missingPotential || []).map(row => row.genre).filter(Boolean)
])].sort((a, b) => a.localeCompare(b, "ja")).map(genre => {
  const coverageRow = coverageByGenre.get(genre) || {};
  return {
    genre,
    target: coverageRow.target || null,
    approvedRows: approvedByGenre[genre] || 0,
    manifestRows: manifestByGenre[genre] || 0,
    localAudioReadyRows: readyByGenre[genre] || 0,
    missingPotentialRows: coverageRow.missingPotentialRows ?? null,
    missingFormalRows: coverageRow.missingFormalRows ?? null
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  reviewQueue: path.relative(ROOT, REVIEW_TSV_PATH),
  manifestPath: path.relative(ROOT, MANIFEST_PATH),
  summary: {
    reviewRows: reviews.length,
    approvedRows: approved.length,
    highPriorityRows: highPriority.length,
    manifestRows: manifestItems.length,
    localAudioReadyRows: manifestAudioReady.length,
    localAudioMissingRows: manifestAudioMissing.length,
    importReady: manifestAudioReady.length > 0 && manifestAudioMissing.length === 0
  },
  byGenre: genres,
  nextCommands: [
    "npm --prefix apps/demo run ia-cc-manifest",
    "npm --prefix apps/demo run ia-cc-download-approved",
    "npm --prefix apps/demo run cc-import:ia",
    "npm --prefix apps/demo run genre-train:cached",
    "npm --prefix apps/demo run genre-goal-report"
  ],
  localAudioMissing: manifestAudioMissing.slice(0, 100).map(item => ({
    genre: item.genre,
    title: item.canonicalTitle,
    filePath: item.filePath,
    referenceUrl: item.referenceUrl
  }))
};

fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  summary: report.summary,
  byGenre: report.byGenre.filter(row => row.approvedRows || row.manifestRows || row.localAudioReadyRows).slice(0, 20),
  nextCommands: report.nextCommands
}, null, 2));
console.log(`Wrote ${path.relative(ROOT, OUT_PATH)}`);
