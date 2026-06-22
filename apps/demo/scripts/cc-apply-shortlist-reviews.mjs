import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const SHORTLIST_PATH = path.join(TRAINING_DIR, "cc-review-shortlist.tsv");

const REVIEW_QUEUES = new Map([
  ["internet-archive", path.join(TRAINING_DIR, "internet-archive-review-queue.tsv")],
  ["wikimedia-commons", path.join(TRAINING_DIR, "wikimedia-commons-review-queue.tsv")]
]);

const REVIEW_FIELDS = [
  "reviewStatus",
  "reviewNote",
  "reviewer",
  "reviewedAt"
];

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

function quote(value) {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

function readTsv(pathname) {
  if (!fs.existsSync(pathname)) return { headers: [], rows: [] };
  const lines = fs.readFileSync(pathname, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length < 1) return { headers: [], rows: [] };
  const headers = parseTsvLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const cells = parseTsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
  return { headers, rows };
}

function writeTsv(pathname, headers, rows) {
  fs.writeFileSync(
    pathname,
    `${headers.map(quote).join("\t")}\n${rows.map(row => headers.map(header => quote(row[header] || "")).join("\t")).join("\n")}\n`
  );
}

function normalizedReviewStatus(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (["approved", "accepted", "ok", "採用", "承認"].includes(text)) return "approved";
  if (["rejected", "reject", "ng", "除外", "却下"].includes(text)) return "rejected";
  if (["needs-review", "review", "保留", "確認"].includes(text)) return "needs-review";
  return text;
}

function keyFor(row) {
  return [
    row.identifier || "",
    row.candidateAudioUrl || "",
    row.referenceUrl || "",
    row.title || "",
    row.creator || ""
  ].join("\u0001");
}

const shortlist = readTsv(SHORTLIST_PATH);
if (!shortlist.rows.length) {
  console.error(`No shortlist rows found: ${path.relative(ROOT, SHORTLIST_PATH)}`);
  process.exitCode = 1;
} else {
  const actionable = shortlist.rows
    .map(row => ({ ...row, reviewStatus: normalizedReviewStatus(row.reviewStatus) }))
    .filter(row => row.source && row.reviewStatus);

  const bySource = actionable.reduce((acc, row) => {
    if (!acc.has(row.source)) acc.set(row.source, []);
    acc.get(row.source).push(row);
    return acc;
  }, new Map());

  const report = [];
  for (const [source, rows] of bySource.entries()) {
    const queuePath = REVIEW_QUEUES.get(source);
    if (!queuePath || !fs.existsSync(queuePath)) {
      report.push({ source, status: "missing-review-queue", requested: rows.length, applied: 0 });
      continue;
    }

    const queue = readTsv(queuePath);
    const headers = [...queue.headers];
    for (const field of REVIEW_FIELDS) {
      if (!headers.includes(field)) headers.push(field);
    }

    const updates = new Map(rows.map(row => [keyFor(row), row]));
    let applied = 0;
    const nextRows = queue.rows.map(row => {
      const update = updates.get(keyFor(row));
      if (!update) return row;
      applied += 1;
      const reviewedAt = update.reviewedAt || row.reviewedAt || new Date().toISOString();
      return {
        ...row,
        reviewStatus: update.reviewStatus,
        reviewNote: update.reviewNote || row.reviewNote || "",
        reviewer: update.reviewer || row.reviewer || "cc-review-shortlist",
        reviewedAt
      };
    });

    writeTsv(queuePath, headers, nextRows);
    report.push({
      source,
      status: "updated",
      requested: rows.length,
      applied,
      reviewQueue: path.relative(ROOT, queuePath)
    });
  }

  console.log(JSON.stringify({
    shortlist: path.relative(ROOT, SHORTLIST_PATH),
    actionableRows: actionable.length,
    sources: report
  }, null, 2));
}
