import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const OUT_PATH = path.join(TRAINING_DIR, "cc-approval-summary.json");

const SOURCES = [
  {
    id: "internet-archive",
    reviewQueue: path.join(TRAINING_DIR, "internet-archive-review-queue.tsv"),
    manifest: path.join(TRAINING_DIR, "internet-archive-cc-source-manifest.json")
  },
  {
    id: "wikimedia-commons",
    reviewQueue: path.join(TRAINING_DIR, "wikimedia-commons-review-queue.tsv"),
    manifest: path.join(TRAINING_DIR, "wikimedia-commons-cc-source-manifest.json")
  }
];

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

function tsvRows(pathname) {
  if (!fs.existsSync(pathname)) return [];
  const lines = fs.readFileSync(pathname, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseTsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cells = parseTsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
}

function approved(row) {
  return /^(approved|accepted|ok)$/i.test(String(row.reviewStatus || "").trim());
}

function shortlistReady(row) {
  return !approved(row) && !String(row.riskFlags || "").trim() && Number(row.reviewPriority || 0) >= 60;
}

function countByGenre(rows) {
  return rows.reduce((acc, row) => {
    if (!row.genre) return acc;
    acc[row.genre] = (acc[row.genre] || 0) + 1;
    return acc;
  }, {});
}

const sourceReports = SOURCES.map(source => {
  const reviews = tsvRows(source.reviewQueue);
  const approvedRows = reviews.filter(approved);
  const shortlistRows = reviews.filter(shortlistReady);
  const manifest = loadJson(source.manifest, { items: [] });
  const manifestItems = Array.isArray(manifest) ? manifest : manifest.items || [];
  const ready = manifestItems.filter(item => item.filePath && fs.existsSync(item.filePath));
  return {
    id: source.id,
    reviewQueue: fs.existsSync(source.reviewQueue) ? path.relative(ROOT, source.reviewQueue) : "",
    manifest: fs.existsSync(source.manifest) ? path.relative(ROOT, source.manifest) : "",
    reviewRows: reviews.length,
    approvedRows: approvedRows.length,
    shortlistRows: shortlistRows.length,
    manifestRows: manifestItems.length,
    localAudioReadyRows: ready.length,
    approvedByGenre: countByGenre(approvedRows),
    shortlistByGenre: countByGenre(shortlistRows),
    manifestByGenre: countByGenre(manifestItems),
    readyByGenre: countByGenre(ready)
  };
});

const totals = sourceReports.reduce((acc, row) => {
  acc.reviewRows += row.reviewRows;
  acc.approvedRows += row.approvedRows;
  acc.shortlistRows += row.shortlistRows;
  acc.manifestRows += row.manifestRows;
  acc.localAudioReadyRows += row.localAudioReadyRows;
  return acc;
}, { reviewRows: 0, approvedRows: 0, shortlistRows: 0, manifestRows: 0, localAudioReadyRows: 0 });

const report = {
  generatedAt: new Date().toISOString(),
  totals,
  sources: sourceReports,
  nextCommands: [
    "npm --prefix apps/demo run ia-cc-manifest",
    "npm --prefix apps/demo run wiki-cc-manifest",
    "npm --prefix apps/demo run ia-cc-download-approved",
    "npm --prefix apps/demo run wiki-cc-download-approved",
    "npm --prefix apps/demo run cc-import:ia",
    "npm --prefix apps/demo run cc-import:wiki",
    "npm --prefix apps/demo run genre-train:cached",
    "npm --prefix apps/demo run genre-goal-report"
  ]
};

fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  totals,
  sources: sourceReports.map(row => ({
    id: row.id,
    reviewRows: row.reviewRows,
    approvedRows: row.approvedRows,
    shortlistRows: row.shortlistRows,
    manifestRows: row.manifestRows,
    localAudioReadyRows: row.localAudioReadyRows
  }))
}, null, 2));
console.log(`Wrote ${path.relative(ROOT, OUT_PATH)}`);
