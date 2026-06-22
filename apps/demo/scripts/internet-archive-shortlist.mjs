import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const REVIEW_TSV_PATH = path.join(TRAINING_DIR, "internet-archive-review-queue.tsv");
const OUT_MD = path.join(TRAINING_DIR, "internet-archive-review-shortlist.md");
const OUT_TSV = path.join(TRAINING_DIR, "internet-archive-review-shortlist.tsv");
const LIMIT_PER_GENRE = Math.max(1, Number(process.env.MMFR_IA_SHORTLIST_PER_GENRE || 12));
const MIN_PRIORITY = Math.max(0, Math.min(100, Number(process.env.MMFR_IA_SHORTLIST_MIN_PRIORITY || 60)));

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

function rows() {
  if (!fs.existsSync(REVIEW_TSV_PATH)) return [];
  const lines = fs.readFileSync(REVIEW_TSV_PATH, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseTsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cells = parseTsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
}

const allRows = rows();
const grouped = new Map();
for (const row of allRows) {
  if (String(row.riskFlags || "").trim()) continue;
  if (Number(row.reviewPriority || 0) < MIN_PRIORITY) continue;
  if (!grouped.has(row.genre)) grouped.set(row.genre, []);
  grouped.get(row.genre).push(row);
}

const selected = [];
for (const [genre, list] of grouped.entries()) {
  list
    .sort((a, b) => Number(b.reviewPriority || 0) - Number(a.reviewPriority || 0) || Number(b.matchScore || 0) - Number(a.matchScore || 0))
    .slice(0, LIMIT_PER_GENRE)
    .forEach(row => selected.push(row));
}
selected.sort((a, b) => a.genre.localeCompare(b.genre, "ja") || Number(b.reviewPriority || 0) - Number(a.reviewPriority || 0));

const tsvHeaders = [
  "reviewStatus",
  "reviewPriority",
  "genre",
  "title",
  "creator",
  "license",
  "referenceUrl",
  "candidateAudioUrl",
  "identifier"
];
fs.writeFileSync(OUT_TSV, `${tsvHeaders.map(quote).join("\t")}\n${selected.map(row => tsvHeaders.map(key => quote(row[key] || "")).join("\t")).join("\n")}\n`);

const byGenre = selected.reduce((acc, row) => {
  if (!acc[row.genre]) acc[row.genre] = [];
  acc[row.genre].push(row);
  return acc;
}, {});
const md = [
  "# Internet Archive CC Review Shortlist",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "リスクフラグなし、reviewPriorityが高い順の確認候補です。ここでも自動承認はしていません。聴いて問題ないものだけ元のTSVで `reviewStatus` を `approved` にしてください。",
  "",
  ...Object.entries(byGenre).flatMap(([genre, list]) => [
    `## ${genre} (${list.length})`,
    "",
    ...list.map(row => `- ${row.reviewPriority} / ${row.license} / ${row.title} / ${row.creator}\n  - Archive: ${row.referenceUrl}\n  - Audio: ${row.candidateAudioUrl}\n  - id: ${row.identifier}`),
    ""
  ])
].join("\n");
fs.writeFileSync(OUT_MD, md);

console.log(JSON.stringify({
  selected: selected.length,
  byGenre: Object.fromEntries(Object.entries(byGenre).map(([genre, list]) => [genre, list.length])),
  markdown: path.relative(ROOT, OUT_MD),
  tsv: path.relative(ROOT, OUT_TSV)
}, null, 2));
