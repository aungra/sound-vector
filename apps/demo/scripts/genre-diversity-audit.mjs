import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const SPLITS_PATH = path.join(TRAINING_DIR, "dataset-splits.json");
const VERIFIED_PATH = path.join(TRAINING_DIR, "verified-dataset.json");
const COVERAGE_PATH = path.join(TRAINING_DIR, "cc-coverage-report.json");
const SEEDS_PATH = path.join(TRAINING_DIR, "source-seeds.json");
const OUT_JSON = path.join(TRAINING_DIR, "genre-diversity-audit.json");
const OUT_MD = path.join(TRAINING_DIR, "genre-diversity-audit.md");

const DEFAULT_MIN_ARTISTS = Math.max(2, Number(process.env.MMFR_MIN_ARTISTS_PER_GENRE || 8));
const PRIORITY_MIN_ARTISTS = Math.max(DEFAULT_MIN_ARTISTS, Number(process.env.MMFR_PRIORITY_MIN_ARTISTS_PER_GENRE || 12));
const DEFAULT_TARGET_TRACKS = Math.max(1, Number(process.env.MMFR_GOAL_DEFAULT_TRACKS || 50));
const PRIORITY_TARGET_TRACKS = Math.max(DEFAULT_TARGET_TRACKS, Number(process.env.MMFR_GOAL_PRIORITY_TRACKS || 100));
const PRIORITY_GENRES = new Set(["シティ・ポップ", "J-POP", "ドローン", "クラシック音楽", "ダブ", "テクノ"]);
const FORMAL_SOURCE_TYPES = new Set(["cc-dataset", "local-audio"]);
const FINE_EXCLUDED = new Set(["電子音楽", "ワールドミュージック"]);

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function artistKey(row = {}) {
  return String(row.canonicalArtist || row.artistName || row.channelName || row.creator || "").trim();
}

function splitRows() {
  const payload = loadJson(SPLITS_PATH, { items: [] });
  return payload.items || [];
}

function verifiedRows() {
  const payload = loadJson(VERIFIED_PATH, { items: [] });
  return Array.isArray(payload) ? payload : payload.items || [];
}

function coverageByGenre() {
  const payload = loadJson(COVERAGE_PATH, { genres: [] });
  return new Map((payload.genres || []).map(row => [row.genre, row]));
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

function summarizeGenre(genre, rows, verified, coverage) {
  const priority = PRIORITY_GENRES.has(genre);
  const minArtists = priority ? PRIORITY_MIN_ARTISTS : DEFAULT_MIN_ARTISTS;
  const targetTracks = priority ? PRIORITY_TARGET_TRACKS : DEFAULT_TARGET_TRACKS;
  const artists = [...new Set(rows.map(artistKey).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
  const formal = verified.filter(row => row.genre === genre && FORMAL_SOURCE_TYPES.has(row.sourceType));
  const formalArtists = [...new Set(formal.map(artistKey).filter(Boolean))];
  const bySplit = rows.reduce((acc, row) => {
    const split = row.split || "unknown";
    acc[split] = (acc[split] || 0) + 1;
    return acc;
  }, {});
  const coverageRow = coverage.get(genre) || {};
  const candidateRows = Number(coverageRow.totalPotentialRows || 0);
  const shortage = {
    tracks: Math.max(0, targetTracks - rows.length),
    artists: Math.max(0, minArtists - artists.length),
    formalTracks: Math.max(0, targetTracks - formal.length),
    formalArtists: Math.max(0, minArtists - formalArtists.length)
  };
  let risk = "ok";
  if (formal.length === 0) risk = "no-formal-audio";
  else if (shortage.formalArtists > 0) risk = "low-formal-artist-diversity";
  else if (shortage.formalTracks > 0) risk = "low-formal-track-count";
  else if (shortage.artists > 0) risk = "low-reference-artist-diversity";
  return {
    genre,
    priority,
    fineEvaluable: !FINE_EXCLUDED.has(genre),
    rows: rows.length,
    artists: artists.length,
    artistNames: artists.slice(0, 20),
    train: bySplit.train || 0,
    validation: bySplit.validation || 0,
    test: bySplit.test || 0,
    formalRows: formal.length,
    formalArtists: formalArtists.length,
    targetTracks,
    minArtists,
    candidateRows,
    missingTracks: shortage.tracks,
    missingArtists: shortage.artists,
    missingFormalTracks: shortage.formalTracks,
    missingFormalArtists: shortage.formalArtists,
    risk,
    nextAction: shortage.formalTracks > 0
      ? `Add ${shortage.formalTracks} formal CC/local-audio track(s) across at least ${shortage.formalArtists} new artist(s).`
      : shortage.artists > 0
      ? `Add tracks from ${shortage.artists} additional artist(s) before trusting genre-level accuracy.`
      : "Artist diversity target met."
  };
}

const rows = splitRows();
const verified = verifiedRows();
const coverage = coverageByGenre();
const seedByGenre = new Map(seedGenres().map(row => [row.genre, row]));
const allGenres = [...new Set([...seedByGenre.keys(), ...rows.map(row => row.genre).filter(Boolean)])];
const genres = allGenres
  .map(genre => {
    const genreRows = rows.filter(row => row.genre === genre);
    return summarizeGenre(genre, genreRows, verified, coverage);
  })
  .filter(row => row.fineEvaluable)
  .sort((a, b) => {
    const riskOrder = { "no-formal-audio": 0, "low-formal-artist-diversity": 1, "low-formal-track-count": 2, "low-reference-artist-diversity": 3, ok: 4 };
    return (riskOrder[a.risk] ?? 9) - (riskOrder[b.risk] ?? 9)
      || Number(b.priority) - Number(a.priority)
      || b.missingFormalTracks - a.missingFormalTracks
      || b.missingFormalArtists - a.missingFormalArtists
      || a.genre.localeCompare(b.genre, "ja");
  });

const report = {
  generatedAt: new Date().toISOString(),
  thresholds: {
    defaultMinArtists: DEFAULT_MIN_ARTISTS,
    priorityMinArtists: PRIORITY_MIN_ARTISTS,
    defaultTargetTracks: DEFAULT_TARGET_TRACKS,
    priorityTargetTracks: PRIORITY_TARGET_TRACKS
  },
  summary: {
    genres: genres.length,
    noFormalAudioGenres: genres.filter(row => row.formalRows === 0).length,
    lowReferenceArtistDiversityGenres: genres.filter(row => row.missingArtists > 0).length,
    priorityLowArtistGenres: genres.filter(row => row.priority && row.missingArtists > 0).length,
    averageArtists: genres.length ? Math.round(genres.reduce((sum, row) => sum + row.artists, 0) / genres.length * 10) / 10 : 0,
    averageFormalArtists: genres.length ? Math.round(genres.reduce((sum, row) => sum + row.formalArtists, 0) / genres.length * 10) / 10 : 0
  },
  genres
};

function mdTable(list) {
  if (!list.length) return "_None._";
  const header = "| Genre | Artists | Formal artists | Tracks | Formal tracks | Test | Risk | Next action |\n|---|---:|---:|---:|---:|---:|---|---|";
  const body = list.map(row => `| ${row.genre} | ${row.artists}/${row.minArtists} | ${row.formalArtists}/${row.minArtists} | ${row.rows}/${row.targetTracks} | ${row.formalRows}/${row.targetTracks} | ${row.test} | ${row.risk} | ${row.nextAction} |`).join("\n");
  return `${header}\n${body}`;
}

const md = [
  "# Genre Diversity Audit",
  "",
  `Generated: ${report.generatedAt}`,
  "",
  "## Summary",
  "",
  `- Genres: ${report.summary.genres}`,
  `- No formal audio genres: ${report.summary.noFormalAudioGenres}`,
  `- Low reference artist diversity genres: ${report.summary.lowReferenceArtistDiversityGenres}`,
  `- Priority low artist genres: ${report.summary.priorityLowArtistGenres}`,
  `- Average reference artists: ${report.summary.averageArtists}`,
  `- Average formal artists: ${report.summary.averageFormalArtists}`,
  "",
  "## Genre Readiness",
  "",
  mdTable(genres)
].join("\n");

fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
fs.writeFileSync(OUT_MD, md);

console.log(JSON.stringify({
  summary: report.summary,
  weakest: genres.slice(0, 8).map(row => ({
    genre: row.genre,
    artists: row.artists,
    minArtists: row.minArtists,
    formalRows: row.formalRows,
    formalArtists: row.formalArtists,
    risk: row.risk
  })),
  json: path.relative(ROOT, OUT_JSON),
  markdown: path.relative(ROOT, OUT_MD)
}, null, 2));
