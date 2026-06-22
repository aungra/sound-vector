import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const LOCAL_CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
const PREVIEW_MANIFEST = path.join(TRAINING_DIR, "mtg-jamendo-manifest.preview.json");
const GOAL_REPORT = path.join(TRAINING_DIR, "goal-report.json");
const OUT_JSON = path.join(TRAINING_DIR, "mtg-jamendo-audio-plan.json");
const OUT_TSV = path.join(TRAINING_DIR, "mtg-jamendo-required-audio.tsv");
const OUT_PATHS = path.join(TRAINING_DIR, "mtg-jamendo-required-paths.txt");
const OUT_MD = path.join(TRAINING_DIR, "mtg-jamendo-audio-plan.md");

const DEFAULT_TARGET_TRACKS = Math.max(1, Number(process.env.MMFR_GOAL_DEFAULT_TRACKS || 50));
const PRIORITY_TARGET_TRACKS = Math.max(DEFAULT_TARGET_TRACKS, Number(process.env.MMFR_GOAL_PRIORITY_TRACKS || 100));
const MAX_PER_ARTIST_PER_GENRE = Math.max(1, Number(process.env.MMFR_MTG_PLAN_MAX_PER_ARTIST_PER_GENRE || 8));
const PRIORITY_GENRES = new Set(["シティ・ポップ", "J-POP", "ドローン", "クラシック音楽", "ダブ", "テクノ"]);

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function quote(value) {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

function loadLocalCachePaths() {
  if (!fs.existsSync(LOCAL_CACHE_PATHS_PATH)) return {};
  try {
    const payload = JSON.parse(fs.readFileSync(LOCAL_CACHE_PATHS_PATH, "utf8"));
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return {};
  }
}

const localCache = loadLocalCachePaths();
const externalDataDir = path.resolve(process.env.MMFR_EXTERNAL_DATA_DIR || localCache.externalDataDir || path.join(ROOT, ".external-data"));
const defaultAudioRoot = path.join(externalDataDir, "mtg-jamendo", "raw_30s", "audio-low");
const audioRoot = path.resolve(process.env.MMFR_MTG_AUDIO_ROOT || defaultAudioRoot);
const manifest = loadJson(PREVIEW_MANIFEST, { items: [] });
const goal = loadJson(GOAL_REPORT, { genres: [] });
const goalByGenre = new Map((goal.genres || []).map(row => [row.genre, row]));
const items = Array.isArray(manifest) ? manifest : manifest.items || [];

function audioLowPathFor(sourcePath) {
  return String(sourcePath || "").replaceAll("\\", "/").replace(/\.mp3$/i, ".low.mp3");
}

if (!items.length) {
  console.error(`MTG preview manifest not found or empty: ${path.relative(ROOT, PREVIEW_MANIFEST)}`);
  process.exitCode = 1;
} else {
  const selected = [];
  const byGenre = {};
  const genres = [...new Set(items.map(item => item.genre).filter(Boolean))].sort((a, b) => {
    return Number(PRIORITY_GENRES.has(b)) - Number(PRIORITY_GENRES.has(a)) || a.localeCompare(b, "ja");
  });
  for (const genre of genres) {
    const genreItems = items.filter(item => item.genre === genre);
    const goalRow = goalByGenre.get(genre) || {};
    const target = goalRow.targetTracks || (PRIORITY_GENRES.has(genre) ? PRIORITY_TARGET_TRACKS : DEFAULT_TARGET_TRACKS);
    const artistCounts = new Map();
    const passes = [MAX_PER_ARTIST_PER_GENRE, MAX_PER_ARTIST_PER_GENRE * 2, Infinity];
    for (const cap of passes) {
      for (const item of genreItems) {
        if ((byGenre[genre]?.length || 0) >= target) break;
        if (byGenre[genre]?.some(row => row.trackId === item.trackId)) continue;
        const artist = String(item.canonicalArtist || "(unknown)").trim().toLowerCase();
        if ((artistCounts.get(artist) || 0) >= cap) continue;
        const filePath = path.join(audioRoot, audioLowPathFor(item.sourcePath || ""));
        const row = {
          ...item,
          targetTracks: target,
          expectedFilePath: filePath,
          audioExists: fs.existsSync(filePath)
        };
        if (!byGenre[genre]) byGenre[genre] = [];
        byGenre[genre].push(row);
        selected.push(row);
        artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
      }
      if ((byGenre[genre]?.length || 0) >= target) break;
    }
  }

  const summaryByGenre = Object.fromEntries(Object.entries(byGenre).map(([genre, rows]) => {
    const existing = rows.filter(row => row.audioExists).length;
    const artists = new Set(rows.map(row => row.canonicalArtist || "(unknown)").filter(Boolean));
    return [genre, {
      targetTracks: rows[0]?.targetTracks || 0,
      selectedRows: rows.length,
      selectedArtists: artists.size,
      existingAudioRows: existing,
      missingAudioRows: rows.length - existing,
      samplePaths: rows.slice(0, 5).map(row => row.sourcePath)
    }];
  }));

  const missingRows = selected.filter(row => !row.audioExists);
  const headers = [
    "genre",
    "macroGenre",
    "trackId",
    "sourcePath",
    "expectedFilePath",
    "audioExists",
    "license",
    "licenseUrl",
    "referenceUrl",
    "canonicalArtist",
    "canonicalTitle",
    "tags"
  ];
  const tsv = [
    headers.map(quote).join("\t"),
    ...selected.map(row => headers.map(header => quote(row[header] || "")).join("\t"))
  ].join("\n");
  fs.writeFileSync(OUT_TSV, `${tsv}\n`);
  fs.writeFileSync(OUT_PATHS, `${missingRows.map(row => audioLowPathFor(row.sourcePath)).filter(Boolean).join("\n")}\n`);

  const plan = {
    generatedAt: new Date().toISOString(),
    source: "MTG-Jamendo",
    sourceRepository: "https://github.com/MTG/mtg-jamendo-dataset",
    officialDownloadNote: "The official dataset downloader fetches raw_30s/audio-low archives. This plan lists only the app-selected paths needed for target genres, but official distribution may still require archive-level downloads.",
    audioRoot,
    maxPerArtistPerGenre: MAX_PER_ARTIST_PER_GENRE,
    selectedRows: selected.length,
    existingAudioRows: selected.filter(row => row.audioExists).length,
    missingAudioRows: missingRows.length,
    byGenre: summaryByGenre,
    outputs: {
      json: path.relative(ROOT, OUT_JSON),
      tsv: path.relative(ROOT, OUT_TSV),
      paths: path.relative(ROOT, OUT_PATHS),
      markdown: path.relative(ROOT, OUT_MD)
    },
    nextCommands: [
      "Download MTG-Jamendo raw_30s/audio-low outside this repository using the official downloader.",
      `npm --prefix apps/demo run cc-manifest:mtg-jamendo -- ${audioRoot}`,
      "npm --prefix apps/demo run cc-import",
      "npm --prefix apps/demo run genre-train:cached",
      "npm --prefix apps/demo run genre-goal-report",
      "npm --prefix apps/demo run genre-improvement-plan"
    ],
    selected: selected.map(row => ({
      genre: row.genre,
      macroGenre: row.macroGenre,
      trackId: row.trackId,
      sourcePath: row.sourcePath,
      expectedFilePath: row.expectedFilePath,
      audioExists: row.audioExists,
      license: row.license,
      licenseUrl: row.licenseUrl,
      referenceUrl: row.referenceUrl,
      canonicalArtist: row.canonicalArtist,
      canonicalTitle: row.canonicalTitle,
      tags: row.tags
    }))
  };

  const mdRows = Object.entries(summaryByGenre)
    .sort((a, b) => b[1].missingAudioRows - a[1].missingAudioRows || a[0].localeCompare(b[0], "ja"))
    .map(([genre, row]) => `| ${genre} | ${row.selectedRows}/${row.targetTracks} | ${row.selectedArtists} | ${row.existingAudioRows} | ${row.missingAudioRows} | ${row.samplePaths.join(", ")} |`)
    .join("\n");
  const md = [
    "# MTG-Jamendo Audio Plan",
    "",
    `Generated: ${plan.generatedAt}`,
    "",
    `Audio root: \`${audioRoot}\``,
    "",
    `Selected rows: ${plan.selectedRows}`,
    `Max per artist per genre: ${plan.maxPerArtistPerGenre}`,
    `Existing audio rows: ${plan.existingAudioRows}`,
    `Missing audio rows: ${plan.missingAudioRows}`,
    "",
    "The official MTG-Jamendo downloader fetches archive chunks for `raw_30s/audio-low`. This file narrows the target to the tracks this app would use after the audio is present.",
    "",
    "## Next Commands",
    "",
    "```bash",
    `npm --prefix apps/demo run cc-manifest:mtg-jamendo -- ${audioRoot}`,
    "npm --prefix apps/demo run cc-import",
    "npm --prefix apps/demo run genre-train:cached",
    "npm --prefix apps/demo run genre-goal-report",
    "npm --prefix apps/demo run genre-improvement-plan",
    "```",
    "",
    "## Required Audio By Genre",
    "",
    "| Genre | Selected | Artists | Existing | Missing | Sample source paths |",
    "|---|---:|---:|---:|---:|---|",
    mdRows
  ].join("\n");

  fs.writeFileSync(OUT_JSON, JSON.stringify(plan, null, 2));
  fs.writeFileSync(OUT_MD, md);

  console.log(JSON.stringify({
    audioRoot,
    selectedRows: plan.selectedRows,
    existingAudioRows: plan.existingAudioRows,
    missingAudioRows: plan.missingAudioRows,
    genres: Object.keys(summaryByGenre).length,
    json: path.relative(ROOT, OUT_JSON),
    tsv: path.relative(ROOT, OUT_TSV),
    paths: path.relative(ROOT, OUT_PATHS),
    markdown: path.relative(ROOT, OUT_MD)
  }, null, 2));
}
