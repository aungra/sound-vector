import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const LOCAL_CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");

function loadLocalCachePaths() {
  if (!fs.existsSync(LOCAL_CACHE_PATHS_PATH)) return {};
  try {
    const payload = JSON.parse(fs.readFileSync(LOCAL_CACHE_PATHS_PATH, "utf8"));
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return {};
  }
}

const LOCAL_CACHE_PATHS = loadLocalCachePaths();
const EXTERNAL_DATA_DIR = path.resolve(process.env.MMFR_EXTERNAL_DATA_DIR || LOCAL_CACHE_PATHS.externalDataDir || path.join(ROOT, ".external-data"));
const DEFAULT_MTG_DIR = path.join(EXTERNAL_DATA_DIR, "mtg-jamendo");
const GENRE_TSV = path.resolve(process.env.MMFR_MTG_GENRE_TSV || path.join(DEFAULT_MTG_DIR, "data", "autotagging_genre.tsv"));
const META_TSV = path.resolve(process.env.MMFR_MTG_META_TSV || path.join(DEFAULT_MTG_DIR, "data", "raw.meta.tsv"));
const LICENSES_TXT = path.resolve(process.env.MMFR_MTG_LICENSES_TXT || path.join(DEFAULT_MTG_DIR, "audio_licenses.txt"));
const AUDIO_ROOT = path.resolve(process.argv[2] || process.env.MMFR_MTG_AUDIO_ROOT || path.join(DEFAULT_MTG_DIR, "raw_30s", "audio-low"));
const LIMIT_PER_GENRE = Math.max(1, Number(process.env.MMFR_MTG_LIMIT_PER_GENRE || 120));
const MAX_PER_ARTIST_PER_GENRE = Math.max(1, Number(process.env.MMFR_MTG_MAX_PER_ARTIST_PER_GENRE || 8));
const ALLOW_MISSING_AUDIO = process.env.MMFR_MTG_ALLOW_MISSING_AUDIO === "1";
const DEFAULT_OUTPUT = ALLOW_MISSING_AUDIO
  ? path.join(TRAINING_DIR, "mtg-jamendo-manifest.preview.json")
  : path.join(TRAINING_DIR, "cc-source-manifest.json");
const OUTPUT_PATH = path.resolve(process.env.MMFR_CC_MANIFEST_OUTPUT || DEFAULT_OUTPUT);

const TAG_TO_FINE = [
  [/^genre---ambient$|^genre---newage$|^genre---chillout$|^genre---downtempo$/, "アンビエント"],
  [/^genre---drone$/, "ドローン"],
  [/^genre---noise$|^genre---experimental$/, "ノイズミュージック"],
  [/^genre---techno$|^genre---minimaltechno$/, "テクノ"],
  [/^genre---house$|^genre---deephouse$/, "ハウス"],
  [/^genre---trance$/, "トランス"],
  [/^genre---drumandbass$|^genre---jungle$/, "ドラムンベース"],
  [/^genre---dubstep$/, "ダブステップ"],
  [/^genre---chiptune$|^genre---8bit$/, "チップチューン"],
  [/^genre---hiphop$|^genre---rap$/, "ヒップホップ"],
  [/^genre---trap$/, "トラップ"],
  [/^genre---reggae$|^genre---ska$/, "レゲエ"],
  [/^genre---dub$/, "ダブ"],
  [/^genre---blues$|^genre---rhythmandblues$/, "ブルース"],
  [/^genre---funk$/, "ファンク"],
  [/^genre---soul$|^genre---rnb$/, "ソウルミュージック"],
  [/^genre---disco$/, "ディスコ"],
  [/^genre---rock$|^genre---alternativerock$|^genre---indierock$/, "ロック"],
  [/^genre---punk$|^genre---punkrock$/, "パンク"],
  [/^genre---hardcore$/, "ハードコア"],
  [/^genre---metal$|^genre---heavymetal$/, "メタル"],
  [/^genre---jazz$|^genre---fusion$/, "ジャズ"],
  [/^genre---classical$|^genre---orchestral$/, "クラシック音楽"],
  [/^genre---opera$/, "オペラ"],
  [/^genre---folk$|^genre---singersongwriter$/, "フォーク"],
  [/^genre---latin$|^genre---salsa$|^genre---samba$|^genre---bossanova$|^genre---cumbia$/, "ラテン"],
  [/^genre---world$|^genre---african$|^genre---indian$|^genre---middleeastern$/, "ワールドミュージック"]
];

const MACRO_BY_FINE = {
  "アンビエント": "ambient",
  "ドローン": "ambient",
  "ノイズミュージック": "ambient",
  "テクノ": "electronic",
  "ハウス": "electronic",
  "トランス": "electronic",
  "ドラムンベース": "electronic",
  "ダブステップ": "electronic",
  "チップチューン": "electronic",
  "ヒップホップ": "black_music",
  "トラップ": "black_music",
  "レゲエ": "black_music",
  "ダブ": "black_music",
  "ブルース": "black_music",
  "ファンク": "black_music",
  "ソウルミュージック": "black_music",
  "ディスコ": "black_music",
  "ロック": "rock",
  "パンク": "rock",
  "ハードコア": "rock",
  "メタル": "rock",
  "ジャズ": "jazz",
  "シティ・ポップ": "pop",
  "J-POP": "pop",
  "アニメソング": "pop",
  "クラシック音楽": "classical",
  "オペラ": "classical",
  "フォーク": "world",
  "ラテン": "world",
  "ワールドミュージック": "world"
};

function parseTsv(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split("\t");
  return lines.slice(1).map(line => {
    const cells = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
}

function normalizeCcLicense(urlOrText = "") {
  const text = String(urlOrText || "").toLowerCase();
  if (/by-nc-sa/.test(text)) return "CC-BY-NC-SA";
  if (/by-nc-nd/.test(text)) return "CC-BY-NC-ND";
  if (/by-nc/.test(text)) return "CC-BY-NC";
  if (/by-sa/.test(text)) return "CC-BY-SA";
  if (/by-nd/.test(text)) return "CC-BY-ND";
  if (/\/by\//.test(text) || /attribution/.test(text)) return "CC-BY";
  if (/cc0|public domain/.test(text)) return "CC0";
  return "Creative Commons";
}

function loadLicenses() {
  if (!fs.existsSync(LICENSES_TXT)) return new Map();
  const lines = fs.readFileSync(LICENSES_TXT, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const map = new Map();
  for (let i = 0; i < lines.length; i++) {
    const audioPath = lines[i]?.trim();
    const titleLine = lines[i + 1]?.trim() || "";
    const licenseLine = lines[i + 2]?.trim() || "";
    if (!audioPath || !/\.(mp3|wav|flac|ogg|m4a)$/i.test(audioPath)) continue;
    const licenseUrl = licenseLine.match(/https?:\/\/\S+/)?.[0] || "";
    map.set(audioPath, {
      license: normalizeCcLicense(licenseUrl || licenseLine),
      licenseUrl,
      titleLine
    });
    i += 2;
  }
  return map;
}

function tagToGenre(tag) {
  const normalized = String(tag || "").trim().toLowerCase().replace(/[\s_]+/g, "");
  for (const [pattern, genre] of TAG_TO_FINE) {
    if (pattern.test(normalized)) return genre;
  }
  return "";
}

function chooseGenre(tags, counts) {
  const genres = String(tags || "").split(",").map(tagToGenre).filter(Boolean);
  const unique = [...new Set(genres)];
  if (!unique.length) return "";
  return unique.sort((a, b) => (counts[a] || 0) - (counts[b] || 0) || a.localeCompare(b, "ja"))[0];
}

function audioLowPathFor(rowPath) {
  const normalized = String(rowPath || "").replaceAll("\\", "/");
  return normalized.replace(/\.mp3$/i, ".low.mp3");
}

function audioPathFor(rowPath) {
  return path.join(AUDIO_ROOT, audioLowPathFor(rowPath));
}

function isInsideRepo(value) {
  const relative = path.relative(ROOT, path.resolve(value));
  return Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

if (!fs.existsSync(GENRE_TSV)) {
  console.error(`MTG genre TSV not found: ${GENRE_TSV}`);
  process.exitCode = 1;
} else if (!fs.existsSync(META_TSV)) {
  console.error(`MTG metadata TSV not found: ${META_TSV}`);
  process.exitCode = 1;
} else if (isInsideRepo(AUDIO_ROOT)) {
  console.error(`Refusing repo-local audio root: ${AUDIO_ROOT}`);
  process.exitCode = 1;
} else {
  const genreRows = parseTsv(fs.readFileSync(GENRE_TSV, "utf8"));
  const metaRows = parseTsv(fs.readFileSync(META_TSV, "utf8"));
  const metaByTrackId = new Map(metaRows.map(row => [row.TRACK_ID, row]));
  const licenses = loadLicenses();
  const counts = {};
  const artistCounts = {};
  const missingAudio = [];
  const includedMissingAudio = [];
  const unmapped = [];
  const overflow = [];
  const items = [];
  for (const row of genreRows) {
    const genre = chooseGenre(row.TAGS, counts);
    if (!genre) {
      unmapped.push({ trackId: row.TRACK_ID, tags: row.TAGS });
      continue;
    }
    if ((counts[genre] || 0) >= LIMIT_PER_GENRE) continue;
    const filePath = audioPathFor(row.PATH);
    const audioExists = fs.existsSync(filePath);
    if (!audioExists) {
      includedMissingAudio.push({ trackId: row.TRACK_ID, path: row.PATH, filePath });
    }
    if (!ALLOW_MISSING_AUDIO && !audioExists) {
      missingAudio.push({ trackId: row.TRACK_ID, path: row.PATH, filePath });
      continue;
    }
    const meta = metaByTrackId.get(row.TRACK_ID) || {};
    const artist = meta.ARTIST_NAME || "(unknown)";
    const artistKey = `${genre}\u0001${artist.trim().toLowerCase()}`;
    if ((artistCounts[artistKey] || 0) >= MAX_PER_ARTIST_PER_GENRE) {
      overflow.push({ trackId: row.TRACK_ID, genre, artist, path: row.PATH, reason: "artist-cap" });
      continue;
    }
    const license = licenses.get(row.PATH) || {};
    counts[genre] = (counts[genre] || 0) + 1;
    artistCounts[artistKey] = (artistCounts[artistKey] || 0) + 1;
    items.push({
      datasetName: "MTG-Jamendo",
      trackId: row.TRACK_ID,
      genre,
      macroGenre: MACRO_BY_FINE[genre],
      filePath,
      sourcePath: row.PATH,
      referenceUrl: meta.URL || `https://www.jamendo.com/track/${String(row.TRACK_ID || "").replace(/\D/g, "")}`,
      license: license.license || "Creative Commons",
      licenseUrl: license.licenseUrl || "",
      canonicalArtist: meta.ARTIST_NAME || "",
      canonicalTitle: meta.TRACK_NAME || "",
      tags: row.TAGS,
      duration: Number(row.DURATION) || null
    });
  }
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
    description: "Generated from MTG-Jamendo genre TSV. Source audio remains outside this repository.",
    generatedAt: new Date().toISOString(),
    source: "https://github.com/MTG/mtg-jamendo-dataset",
    genreTsv: GENRE_TSV,
    metaTsv: META_TSV,
    licensesTxt: fs.existsSync(LICENSES_TXT) ? LICENSES_TXT : "",
    audioRoot: AUDIO_ROOT,
    limitPerGenre: LIMIT_PER_GENRE,
    maxPerArtistPerGenre: MAX_PER_ARTIST_PER_GENRE,
    allowMissingAudio: ALLOW_MISSING_AUDIO,
    items,
    missingAudio: missingAudio.slice(0, 500),
    includedMissingAudio: includedMissingAudio.slice(0, 500),
    overflow: overflow.slice(0, 500),
    unmapped: unmapped.slice(0, 500)
  }, null, 2));
  console.log(JSON.stringify({
    output: path.relative(ROOT, OUTPUT_PATH),
    items: items.length,
    byGenre: counts,
    skippedMissingAudio: missingAudio.length,
    includedMissingAudio: includedMissingAudio.length,
    artistCapSkipped: overflow.length,
    unmapped: unmapped.length,
    allowMissingAudio: ALLOW_MISSING_AUDIO
  }, null, 2));
}
