import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const OUT_MD = path.join(TRAINING_DIR, "cc-review-shortlist.md");
const OUT_TSV = path.join(TRAINING_DIR, "cc-review-shortlist.tsv");
const OUT_HTML = path.join(TRAINING_DIR, "cc-review-shortlist.html");
const LIMIT_PER_GENRE = Math.max(1, Number(process.env.MMFR_CC_SHORTLIST_PER_GENRE || 16));
const MIN_PRIORITY = Math.max(0, Math.min(100, Number(process.env.MMFR_CC_SHORTLIST_MIN_PRIORITY || 60)));

const SOURCES = [
  {
    id: "internet-archive",
    label: "Internet Archive",
    reviewQueue: path.join(TRAINING_DIR, "internet-archive-review-queue.tsv"),
    approvalCommand: "npm --prefix apps/demo run ia-cc-manifest"
  },
  {
    id: "wikimedia-commons",
    label: "Wikimedia Commons",
    reviewQueue: path.join(TRAINING_DIR, "wikimedia-commons-review-queue.tsv"),
    approvalCommand: "npm --prefix apps/demo run wiki-cc-manifest"
  }
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

function rowsForSource(source) {
  if (!fs.existsSync(source.reviewQueue)) return [];
  const lines = fs.readFileSync(source.reviewQueue, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseTsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cells = parseTsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
    return {
      ...row,
      source: source.id,
      sourceLabel: source.label,
      sourceReviewQueue: path.relative(ROOT, source.reviewQueue),
      approvalCommand: source.approvalCommand
    };
  });
}

function approved(row) {
  return /^(approved|accepted|ok)$/i.test(String(row.reviewStatus || "").trim());
}

const allRows = SOURCES.flatMap(rowsForSource);
const candidates = allRows
  .filter(row => !approved(row))
  .filter(row => !String(row.riskFlags || "").trim())
  .filter(row => Number(row.reviewPriority || 0) >= MIN_PRIORITY)
  .sort((a, b) => a.genre.localeCompare(b.genre, "ja") || Number(b.reviewPriority || 0) - Number(a.reviewPriority || 0) || a.sourceLabel.localeCompare(b.sourceLabel));

const selected = [];
const grouped = new Map();
for (const row of candidates) {
  if (!grouped.has(row.genre)) grouped.set(row.genre, []);
  const list = grouped.get(row.genre);
  if (list.length >= LIMIT_PER_GENRE) continue;
  list.push(row);
  selected.push(row);
}

const headers = [
  "source",
  "reviewStatus",
  "reviewNote",
  "reviewer",
  "reviewedAt",
  "reviewPriority",
  "genre",
  "title",
  "creator",
  "license",
  "referenceUrl",
  "candidateAudioUrl",
  "identifier",
  "sourceReviewQueue"
];
fs.writeFileSync(OUT_TSV, `${headers.map(quote).join("\t")}\n${selected.map(row => headers.map(key => quote(row[key] || "")).join("\t")).join("\n")}\n`);

const byGenre = selected.reduce((acc, row) => {
  if (!acc[row.genre]) acc[row.genre] = [];
  acc[row.genre].push(row);
  return acc;
}, {});

const md = [
  "# CC Audio Review Shortlist",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "Internet Archive と Wikimedia Commons の未承認候補を統合した確認用リストです。ここでは自動承認しません。採用する場合は `sourceReviewQueue` の元TSVで `reviewStatus` を `approved` にしてください。",
  "",
  "まとめて確認する場合は、この `cc-review-shortlist.tsv` の `reviewStatus` に `approved` / `rejected` / `needs-review` を書き、`npm --prefix apps/demo run cc-review:apply-shortlist` を実行すると元TSVへ同期できます。",
  "",
  ...Object.entries(byGenre).flatMap(([genre, list]) => [
    `## ${genre} (${list.length})`,
    "",
    ...list.map(row => `- ${row.reviewPriority} / ${row.sourceLabel} / ${row.license} / ${row.title} / ${row.creator}\n  - Page: ${row.referenceUrl}\n  - Audio: ${row.candidateAudioUrl}\n  - Review TSV: ${row.sourceReviewQueue}\n  - id: ${row.identifier}`),
    ""
  ])
].join("\n");
fs.writeFileSync(OUT_MD, md);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

const htmlRows = selected.map(row => `
  <tr>
    <td class="status"><code>${escapeHtml(row.reviewStatus || "blank")}</code></td>
    <td><strong>${escapeHtml(row.genre)}</strong><br><span>${escapeHtml(row.sourceLabel)} / priority ${escapeHtml(row.reviewPriority)}</span></td>
    <td>${escapeHtml(row.title)}<br><span>${escapeHtml(row.creator)}</span></td>
    <td><code>${escapeHtml(row.license)}</code></td>
    <td><audio controls preload="none" src="${escapeHtml(row.candidateAudioUrl)}"></audio></td>
    <td><a href="${escapeHtml(row.referenceUrl)}" target="_blank" rel="noreferrer">page</a></td>
    <td><code>${escapeHtml(row.identifier)}</code></td>
  </tr>`).join("\n");

const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CC Audio Review Shortlist</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; margin: 28px; color: #111; background: #fff; }
    h1 { font-size: 24px; margin: 0 0 8px; letter-spacing: 0; }
    p { max-width: 920px; line-height: 1.65; }
    table { border-collapse: collapse; width: 100%; margin-top: 24px; }
    th, td { border-top: 1px solid #111; padding: 10px 8px; text-align: left; vertical-align: top; font-size: 13px; }
    th { position: sticky; top: 0; background: #fff; z-index: 1; }
    audio { width: 260px; max-width: 28vw; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    span { color: #555; }
    .status { white-space: nowrap; }
  </style>
</head>
<body>
  <h1>CC Audio Review Shortlist</h1>
  <p>候補音源を聴いて、採用するものだけ <code>genre-training/cc-review-shortlist.tsv</code> の <code>reviewStatus</code> に <code>approved</code> と記入してください。記入後に <code>npm --prefix apps/demo run cc-review:apply-shortlist</code> を実行すると、元のレビューTSVへ同期されます。</p>
  <p>このHTMLは確認用です。正式学習に入るのは、承認後にmanifest作成、外付けキャッシュへの音源取得、特徴量インポートまで完了したものだけです。</p>
  <table>
    <thead>
      <tr>
        <th>Status</th>
        <th>Genre / Source</th>
        <th>Title / Creator</th>
        <th>License</th>
        <th>Audio</th>
        <th>Page</th>
        <th>ID</th>
      </tr>
    </thead>
    <tbody>${htmlRows}</tbody>
  </table>
</body>
</html>`;
fs.writeFileSync(OUT_HTML, html);

console.log(JSON.stringify({
  selected: selected.length,
  byGenre: Object.fromEntries(Object.entries(byGenre).map(([genre, list]) => [genre, list.length])),
  markdown: path.relative(ROOT, OUT_MD),
  tsv: path.relative(ROOT, OUT_TSV),
  html: path.relative(ROOT, OUT_HTML)
}, null, 2));
