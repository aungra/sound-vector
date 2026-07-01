import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const SEEDS_PATH = path.join(TRAINING_DIR, "source-seeds.json");
const OUTPUT_PATH = path.resolve(process.env.MMFR_CC_MANIFEST_OUTPUT || path.join(TRAINING_DIR, "cc-source-manifest.json"));
const AUDIO_ROOT = path.resolve(process.argv[2] || process.env.MMFR_CC_AUDIO_ROOT || "");
const DATASET_NAME = process.env.MMFR_CC_DATASET_NAME || "Creative Commons local audio";
const LICENSE = process.env.MMFR_CC_LICENSE || "CC-BY";
const LICENSE_URL = process.env.MMFR_CC_LICENSE_URL || "https://creativecommons.org/licenses/by/4.0/";
const REFERENCE_URL = process.env.MMFR_CC_REFERENCE_URL || "";
const SEGMENT_TYPE = process.env.MMFR_CC_SEGMENT_TYPE || "";
const SOURCE_TAGS = process.env.MMFR_CC_SOURCE_TAGS || "";
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aif", ".aiff"]);
const REQUIRED = ["genre", "macroGenre", "filePath", "license", "licenseUrl", "referenceUrl"];

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function seedMap() {
  const seeds = loadJson(SEEDS_PATH, {});
  const map = new Map();
  if (Array.isArray(seeds.genres)) {
    seeds.genres.forEach(item => {
      if (item.genre && item.macroGenre) map.set(item.genre, item.macroGenre);
    });
  }
  Object.entries(seeds.macroGenres || {}).forEach(([macroGenre, genres]) => {
    (genres || []).forEach(genre => map.set(genre, macroGenre));
  });
  return map;
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function genreFromPath(filePath, genreToMacro) {
  const parts = path.relative(AUDIO_ROOT, filePath).split(path.sep);
  for (const part of parts.slice(0, -1)) {
    if (genreToMacro.has(part)) return part;
  }
  return "";
}

function trackTitle(filePath) {
  return path.basename(filePath, path.extname(filePath)).replace(/[_-]+/g, " ").trim();
}

function isInsideRepo(value) {
  const relative = path.relative(ROOT, path.resolve(value));
  return Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

if (!AUDIO_ROOT || !fs.existsSync(AUDIO_ROOT)) {
  console.error("Usage: npm --prefix apps/demo run cc-manifest:from-folder -- /Volumes/path/to/cc-audio");
  process.exitCode = 1;
} else if (isInsideRepo(AUDIO_ROOT)) {
  console.error(`Refusing repo-local audio root: ${AUDIO_ROOT}`);
  process.exitCode = 1;
} else {
  const genreToMacro = seedMap();
  const missingGenre = [];
  const items = walk(AUDIO_ROOT).flatMap((filePath, index) => {
    const genre = genreFromPath(filePath, genreToMacro);
    if (!genre) {
      missingGenre.push(filePath);
      return [];
    }
    return [{
      datasetName: DATASET_NAME,
      trackId: `${genre}-${String(index + 1).padStart(5, "0")}`,
      genre,
      macroGenre: genreToMacro.get(genre),
      filePath,
      referenceUrl: REFERENCE_URL || `file://${filePath}`,
      license: LICENSE,
      licenseUrl: LICENSE_URL,
      segmentType: SEGMENT_TYPE,
      tags: SOURCE_TAGS,
      canonicalArtist: "",
      canonicalTitle: trackTitle(filePath)
    }];
  });
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
    description: "Generated CC/public research local audio manifest. Keep source audio outside this repository.",
    generatedAt: new Date().toISOString(),
    audioRoot: AUDIO_ROOT,
    requiredFields: REQUIRED,
    items,
    missingGenre: missingGenre.slice(0, 500)
  }, null, 2));
  const byGenre = items.reduce((acc, item) => {
    acc[item.genre] = (acc[item.genre] || 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({
    output: path.relative(ROOT, OUTPUT_PATH),
    audioRoot: AUDIO_ROOT,
    items: items.length,
    missingGenre: missingGenre.length,
    byGenre
  }, null, 2));
}
