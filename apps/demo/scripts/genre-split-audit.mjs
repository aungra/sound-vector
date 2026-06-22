import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const SPLITS_PATH = path.join(TRAINING_DIR, "dataset-splits.json");
const MODEL_PATH = path.join(TRAINING_DIR, "genre-model.json");
const OUT_JSON = path.join(TRAINING_DIR, "genre-split-audit.json");
const OUT_MD = path.join(TRAINING_DIR, "genre-split-audit.md");

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function artistKey(row) {
  const artist = String(row.canonicalArtist || row.artistName || row.channelName || "").trim().toLowerCase();
  if (artist) return artist;
  return "";
}

function rowSource(row) {
  return row.sourceUrl || row.youtubeUrl || row.previewUrl || row.filePath || row.referenceUrl || "";
}

const splitPayload = loadJson(SPLITS_PATH, { items: [] });
const model = loadJson(MODEL_PATH, { examples: [] });
const rows = (splitPayload.items || []).map(row => ({ ...row, source: rowSource(row) }));
const modelRows = (model.examples || []).map(row => ({ ...row, source: rowSource(row) }));

const sourceToModel = new Map(modelRows.map(row => [row.source, row]));
const enrichedRows = rows.map(row => ({
  ...row,
  canonicalArtist: row.canonicalArtist || sourceToModel.get(row.source)?.canonicalArtist || "",
  canonicalTitle: row.canonicalTitle || sourceToModel.get(row.source)?.canonicalTitle || ""
}));

const groups = new Map();
enrichedRows.forEach(row => {
  const artist = artistKey(row);
  if (!artist) return;
  const key = `${row.genre}\u0001${artist}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
});

const leaks = [...groups.entries()].flatMap(([key, groupRows]) => {
  const splits = [...new Set(groupRows.map(row => row.split).filter(Boolean))].sort();
  if (splits.length <= 1) return [];
  const [genre, artist] = key.split("\u0001");
  return [{
    genre,
    artist,
    splits,
    rows: groupRows.length,
    examples: groupRows.slice(0, 8).map(row => ({
      split: row.split,
      sourceType: row.sourceType,
      sourceUrl: row.source,
      title: row.canonicalTitle || ""
    }))
  }];
});

const byGenre = Object.values(enrichedRows.reduce((acc, row) => {
  if (!acc[row.genre]) acc[row.genre] = { genre: row.genre, train: 0, validation: 0, test: 0, unknown: 0, rows: 0, artistRows: 0 };
  const bucket = acc[row.genre];
  bucket[row.split || "unknown"] = (bucket[row.split || "unknown"] || 0) + 1;
  bucket.rows += 1;
  if (artistKey(row)) bucket.artistRows += 1;
  return acc;
}, {})).sort((a, b) => a.genre.localeCompare(b.genre, "ja"));

const report = {
  generatedAt: new Date().toISOString(),
  splitFile: path.relative(ROOT, SPLITS_PATH),
  modelFile: path.relative(ROOT, MODEL_PATH),
  summary: {
    rows: enrichedRows.length,
    rowsWithArtist: enrichedRows.filter(row => artistKey(row)).length,
    artistGenreGroups: groups.size,
    leakingArtistGenreGroups: leaks.length,
    trainRows: enrichedRows.filter(row => row.split === "train").length,
    validationRows: enrichedRows.filter(row => row.split === "validation").length,
    testRows: enrichedRows.filter(row => row.split === "test").length
  },
  byGenre,
  leaks
};

const md = [
  "# Genre Split Audit",
  "",
  `Generated: ${report.generatedAt}`,
  "",
  "## Summary",
  "",
  `- Rows: ${report.summary.rows}`,
  `- Rows with artist: ${report.summary.rowsWithArtist}`,
  `- Artist+genre groups: ${report.summary.artistGenreGroups}`,
  `- Leaking artist+genre groups: ${report.summary.leakingArtistGenreGroups}`,
  `- Split rows: train ${report.summary.trainRows}, validation ${report.summary.validationRows}, test ${report.summary.testRows}`,
  "",
  "## Leaks",
  "",
  ...(leaks.length ? leaks.slice(0, 50).map(row => `- ${row.genre} / ${row.artist}: ${row.splits.join(", ")} (${row.rows} rows)`) : ["- None."]),
  "",
  "## Rows By Genre",
  "",
  "| Genre | Train | Validation | Test | Artist rows |",
  "|---|---:|---:|---:|---:|",
  ...byGenre.map(row => `| ${row.genre} | ${row.train} | ${row.validation} | ${row.test} | ${row.artistRows}/${row.rows} |`)
].join("\n");

fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
fs.writeFileSync(OUT_MD, md);

console.log(JSON.stringify({
  summary: report.summary,
  json: path.relative(ROOT, OUT_JSON),
  markdown: path.relative(ROOT, OUT_MD)
}, null, 2));
