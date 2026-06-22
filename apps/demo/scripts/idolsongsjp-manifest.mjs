import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
const OUT_PATH = path.join(TRAINING_DIR, "idolsongsjp-source-manifest.json");
const REPORT_PATH = path.join(TRAINING_DIR, "idolsongsjp-import-plan.json");
const AUDIO_EXTENSIONS = new Set([".wav", ".flac", ".mp3", ".m4a", ".ogg", ".aif", ".aiff"]);
const DATASET = "imprt/idol-songs-jp";
const DATASET_URL = "https://huggingface.co/datasets/imprt/idol-songs-jp";
const DOWNLOAD = process.env.MMFR_IDOLSONGSJP_DOWNLOAD === "1";
const MASTER_DIR = process.env.MMFR_IDOLSONGSJP_MASTER_DIR || "master_48k32b_-9LUFS";

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function localCachePaths() {
  const payload = loadJson(CACHE_PATHS_PATH, {});
  return payload && typeof payload === "object" ? payload : {};
}

function defaultAudioRoot() {
  const cachePaths = localCachePaths();
  const configured = process.env.MMFR_EXTERNAL_DATA_DIR || cachePaths.externalDataDir || path.join(ROOT, ".external-data");
  return path.resolve(configured, "idolsongsjp");
}

const AUDIO_ROOT = path.resolve(process.argv[2] || process.env.MMFR_IDOLSONGSJP_AUDIO_ROOT || defaultAudioRoot());
const REFERENCE_URL = process.env.MMFR_IDOLSONGSJP_REFERENCE_URL || DATASET_URL;
const LICENSE = process.env.MMFR_IDOLSONGSJP_LICENSE || "RESEARCH-USE-COPYRIGHT-CLEARED";
const LICENSE_URL = process.env.MMFR_IDOLSONGSJP_LICENSE_URL || REFERENCE_URL;
const GENRE = process.env.MMFR_IDOLSONGSJP_GENRE || "J-POP";
const MACRO_GENRE = process.env.MMFR_IDOLSONGSJP_MACRO || "pop";
const TRAINING_ROLE = process.env.MMFR_IDOLSONGSJP_TRAINING_ROLE || "fine";

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

function tokenFromDisk() {
  const candidates = [
    process.env.HF_TOKEN,
    process.env.HUGGINGFACE_TOKEN,
    process.env.HUGGING_FACE_HUB_TOKEN,
    path.join(process.env.HOME || "", ".cache", "huggingface", "token")
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (/hf_[A-Za-z0-9_]+/.test(candidate)) return candidate.match(/hf_[A-Za-z0-9_]+/)?.[0] || "";
    if (fs.existsSync(candidate)) {
      const value = fs.readFileSync(candidate, "utf8").trim();
      const token = value.match(/hf_[A-Za-z0-9_]+/)?.[0] || "";
      if (token) return token;
    }
  }
  return "";
}

async function hfJson(url, token) {
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  return response.json();
}

async function download(url, outPath, token) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1024) return { skipped: true };
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!response.ok || !response.body) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  await pipeline(response.body, fs.createWriteStream(outPath));
  return { skipped: false };
}

function isLikelyMaster(filePath) {
  const text = path.relative(AUDIO_ROOT, filePath).toLowerCase();
  if (/\/(stems?|dry|vocal|drums?|bass|guitar|inst|instrumental|karaoke)\//.test(text)) return false;
  if (/(dry|stem|vocal|drum|bass|guitar|instrumental|karaoke)/.test(path.basename(text))) return false;
  return true;
}

function isMainMasterPath(remotePath) {
  if (!remotePath.startsWith(`${MASTER_DIR}/`)) return false;
  if (!AUDIO_EXTENSIONS.has(path.extname(remotePath).toLowerCase())) return false;
  const name = path.basename(remotePath, path.extname(remotePath)).toLowerCase();
  if (/(^|[-_])(inst|instrumental|minus[_-]?one|with[_-]?call)$/.test(name)) return false;
  if (/-inst$|-minus_one$|-with_call$/.test(name)) return false;
  return true;
}

function titleFromPath(filePath) {
  return path.basename(filePath, path.extname(filePath)).replace(/[_-]+/g, " ").trim();
}

function isInsideRepo(value) {
  const relative = path.relative(ROOT, path.resolve(value));
  return Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

async function buildFromHuggingFace() {
  const token = tokenFromDisk();
  if (!token) {
    fs.writeFileSync(REPORT_PATH, JSON.stringify({
      generatedAt: new Date().toISOString(),
      download: DOWNLOAD,
      tokenAvailable: false,
      manifestItems: 0,
      downloadErrors: [{
        error: "Missing Hugging Face token. Accept the IdolSongsJp dataset license on Hugging Face, then set HF_TOKEN or save the token at ~/.cache/huggingface/token."
      }]
    }, null, 2));
    throw new Error("Missing Hugging Face token. IdolSongsJp is gated; accept the license and set HF_TOKEN before downloading.");
  }
  const tree = await hfJson(`https://huggingface.co/api/datasets/${DATASET}/tree/main?recursive=1`, token);
  const remoteFiles = tree
    .filter(item => item.type === "file")
    .map(item => item.path)
    .filter(isMainMasterPath);
  const downloadErrors = [];
  for (const remotePath of remoteFiles) {
    const outPath = path.join(AUDIO_ROOT, remotePath);
    process.stdout.write(`${remotePath} ... `);
    try {
      const result = await download(`https://huggingface.co/datasets/${DATASET}/resolve/main/${remotePath}`, outPath, token);
      console.log(result.skipped ? "exists" : "downloaded");
    } catch (error) {
      console.log(`error: ${error.message}`);
      downloadErrors.push({ remotePath, error: error.message });
    }
  }
  fs.writeFileSync(REPORT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    download: DOWNLOAD,
    tokenAvailable: Boolean(token),
    candidateMasters: remoteFiles.length,
    downloaded: remoteFiles.length - downloadErrors.length,
    downloadErrors
  }, null, 2));
}

async function writeManifest() {
if (!fs.existsSync(AUDIO_ROOT)) {
  fs.writeFileSync(OUT_PATH, JSON.stringify({
    description: "IdolSongsJp manifest placeholder. Put downloaded corpus audio outside the repo, then rerun this script.",
    generatedAt: new Date().toISOString(),
    expectedAudioRoot: AUDIO_ROOT,
    source: "IdolSongsJp Corpus",
    referenceUrl: REFERENCE_URL,
    items: []
  }, null, 2));
  console.error(`Missing IdolSongsJp audio root: ${AUDIO_ROOT}`);
  process.exitCode = 1;
} else if (isInsideRepo(AUDIO_ROOT)) {
  console.error(`Refusing repo-local audio root: ${AUDIO_ROOT}`);
  process.exitCode = 1;
} else {
  const audioFiles = walk(AUDIO_ROOT).filter(isLikelyMaster);
  const items = audioFiles.map((filePath, index) => ({
    source: "IdolSongsJp",
    sourceType: "cc-dataset",
    datasetName: "IdolSongsJp Corpus",
    trackId: `idolsongsjp-${String(index + 1).padStart(3, "0")}`,
    genre: GENRE,
    macroGenre: MACRO_GENRE,
    trainingRole: TRAINING_ROLE,
    filePath,
    sourceUrl: filePath,
    referenceUrl: REFERENCE_URL,
    license: LICENSE,
    licenseUrl: LICENSE_URL,
    canonicalArtist: "IdolSongsJp Corpus",
    canonicalTitle: titleFromPath(filePath),
    labelEvidence: "IdolSongsJp commissioned corpus in the style of Japanese idol groups; imported as J-POP unless overridden.",
    labelConfidence: "corpus-style-label",
    audioStoragePolicy: "external-local-audio; persist-features-only",
      reviewStatus: "pending-idolsongsjp-license-confirmation",
    reviewNote: "Confirm official distribution terms before formal import. Do not relabel as anime song without explicit metadata."
  }));
  fs.writeFileSync(OUT_PATH, JSON.stringify({
    description: "IdolSongsJp local-audio manifest. Source audio stays outside this repository; cc-import persists features only.",
    generatedAt: new Date().toISOString(),
    audioRoot: AUDIO_ROOT,
    referenceUrl: REFERENCE_URL,
    license: LICENSE,
    licenseUrl: LICENSE_URL,
    items
  }, null, 2));
  console.log(JSON.stringify({
    output: path.relative(ROOT, OUT_PATH),
    audioRoot: AUDIO_ROOT,
    items: items.length,
    next: `MMFR_CC_MANIFEST_PATH=${path.relative(ROOT, OUT_PATH)} MMFR_CC_WEAK_ONLY=0 npm --prefix apps/demo run cc-import`
  }, null, 2));
}
}

if (DOWNLOAD) {
  await buildFromHuggingFace();
}
await writeManifest();
