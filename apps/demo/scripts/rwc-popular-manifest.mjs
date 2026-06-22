import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const AUDIO_EXTENSIONS = new Set([".wav", ".aif", ".aiff", ".flac", ".mp3", ".m4a", ".ogg"]);

const AUDIO_ROOT = path.resolve(process.argv[2] || process.env.MMFR_RWC_AUDIO_ROOT || "");
const OUTPUT_PATH = path.resolve(
  process.env.MMFR_RWC_MANIFEST_OUTPUT || path.join(TRAINING_DIR, "rwc-popular-cc-source-manifest.json")
);
const GENRE = process.env.MMFR_RWC_GENRE || "J-POP";
const MACRO_GENRE = process.env.MMFR_RWC_MACRO_GENRE || "pop";
const TRAINING_ROLE = process.env.MMFR_RWC_TRAINING_ROLE || "fine";
const DATASET_NAME = "RWC Music Database: Popular Music Database";
const LICENSE = "research-use-copyright-cleared";
const LICENSE_URL = "https://staff.aist.go.jp/m.goto/RWC-MDB/";
const REFERENCE_URL = "https://staff.aist.go.jp/m.goto/RWC-MDB/";

function isInsideRepo(value) {
  const relative = path.relative(ROOT, path.resolve(value));
  return Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function inferTrackNumber(filePath, index) {
  const name = path.basename(filePath, path.extname(filePath));
  const normalized = name.replace(/[＿ー−–—]/g, "-");
  const patterns = [
    /RWC[-_\s]?MDB[-_\s]?P[-_\s]?2001[-_\s]?(?:No\.?)?[-_\s]?(\d{1,3})/i,
    /RWC[-_\s]?MDB[-_\s]?P[-_\s]?(\d{1,3})/i,
    /RM[-_\s]?P[-_\s]?(\d{1,3})/i,
    /(?:^|[-_\s])No\.?[-_\s]?(\d{1,3})(?:$|[-_\s])/i,
    /(?:^|[-_\s])(\d{1,3})(?:$|[-_\s])/
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return Number(match[1]);
  }
  return index + 1;
}

function canonicalTitle(filePath, trackNumber) {
  const base = path.basename(filePath, path.extname(filePath)).replace(/[_-]+/g, " ").trim();
  return base || `RWC-MDB-P-2001 No.${String(trackNumber).padStart(3, "0")}`;
}

function usage() {
  console.error("Usage: npm --prefix apps/demo run rwc-popular-manifest -- /Volumes/DRIVE/RWC-MDB-P-2001");
  console.error("Audio must stay outside this repository. The manifest stores file paths only.");
}

if (!AUDIO_ROOT || !fs.existsSync(AUDIO_ROOT)) {
  usage();
  process.exitCode = 1;
} else if (isInsideRepo(AUDIO_ROOT)) {
  console.error(`Refusing repo-local RWC audio root: ${AUDIO_ROOT}`);
  process.exitCode = 1;
} else {
  const files = walk(AUDIO_ROOT).sort((a, b) => a.localeCompare(b, "ja"));
  const items = files.map((filePath, index) => {
    const trackNumber = inferTrackNumber(filePath, index);
    const padded = String(trackNumber).padStart(3, "0");
    return {
      source: "RWC",
      sourceType: "local-audio",
      datasetName: DATASET_NAME,
      trackId: `RWC-MDB-P-2001-${padded}`,
      genre: GENRE,
      macroGenre: MACRO_GENRE,
      trainingRole: TRAINING_ROLE,
      filePath,
      sourceUrl: filePath,
      referenceUrl: REFERENCE_URL,
      license: LICENSE,
      licenseUrl: LICENSE_URL,
      canonicalArtist: `RWC Popular No.${padded}`,
      canonicalTitle: canonicalTitle(filePath, trackNumber),
      audioStoragePolicy: "external-local-audio; persist-features-only",
      notes: "User-acquired RWC audio. Do not copy or redistribute source audio."
    };
  });

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
    description: "RWC Popular Music Database manifest. Source audio stays outside this repository; cc-import persists features only.",
    generatedAt: new Date().toISOString(),
    audioRoot: AUDIO_ROOT,
    datasetName: DATASET_NAME,
    audioStoragePolicy: "external-local-audio; persist-features-only",
    requiredFields: ["genre", "macroGenre", "filePath", "license", "licenseUrl", "referenceUrl"],
    items
  }, null, 2));

  console.log(JSON.stringify({
    output: path.relative(ROOT, OUTPUT_PATH),
    audioRoot: AUDIO_ROOT,
    items: items.length,
    genre: GENRE,
    macroGenre: MACRO_GENRE,
    trainingRole: TRAINING_ROLE,
    importCommand: [
      `MMFR_CC_MANIFEST_PATH=${path.relative(ROOT, OUTPUT_PATH)}`,
      "MMFR_CC_WEAK_ONLY=0",
      "MMFR_CC_LIMIT_PER_GENRE=120",
      "npm --prefix apps/demo run cc-import"
    ].join(" ")
  }, null, 2));
}
