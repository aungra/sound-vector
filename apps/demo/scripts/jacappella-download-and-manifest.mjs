import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
const OUT_PATH = path.join(TRAINING_DIR, "jacappella-source-manifest.json");
const REPORT_PATH = path.join(TRAINING_DIR, "jacappella-import-plan.json");

const DATASET = "jaCappella/jaCappella";
const DATASET_URL = "https://huggingface.co/datasets/jaCappella/jaCappella";
const TERMS_URL = "https://tomohikonakamura.github.io/jaCappella_corpus/";
const DOWNLOAD = process.env.MMFR_JACAPPELLA_DOWNLOAD !== "0";
const LIMIT = Math.max(0, Number(process.env.MMFR_JACAPPELLA_LIMIT || 0));
const INCLUDE_NEUTRAL = process.env.MMFR_JACAPPELLA_INCLUDE_NEUTRAL === "1";

const SUBSET_MAP = {
  jazz: { genre: "ジャズ", macroGenre: "jazz", trainingRole: "fine" },
  punk_rock: { genre: "パンク", macroGenre: "rock", trainingRole: "fine" },
  bossa_nova: { genre: "ボサノヴァ", macroGenre: "world", trainingRole: "fine" },
  popular: { genre: "ポップ", macroGenre: "pop", trainingRole: "fine" },
  reggae: { genre: "レゲエ", macroGenre: "black_music", trainingRole: "fine" },
  enka: { genre: "演歌", macroGenre: "world", trainingRole: "fine" },
  ballad: { genre: "バラード", macroGenre: "pop", trainingRole: "fine" },
  edm: { genre: "電子音楽", macroGenre: "electronic", trainingRole: "macro-only" },
  soulfunk: { genre: "ソウルミュージック", macroGenre: "black_music", trainingRole: "fine" },
  neutral: { genre: "ポップ", macroGenre: "pop", trainingRole: "macro-only" }
};

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

function externalBaseDir() {
  const cachePaths = localCachePaths();
  const configured = process.env.MMFR_EXTERNAL_DATA_DIR || cachePaths.externalDataDir || path.join(ROOT, ".external-data");
  return path.resolve(configured, "jacappella");
}

function relativeAudioPath(remotePath) {
  return remotePath.split("/").slice(0, -1).join("/");
}

function itemMeta(remotePath) {
  const parts = remotePath.split("/");
  const subset = parts[0] || "";
  const title = parts[1] || "";
  const mapping = SUBSET_MAP[subset];
  if (!mapping) return null;
  if (subset === "neutral" && !INCLUDE_NEUTRAL) return null;
  return { subset, title, ...mapping };
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

async function main() {
  const token = tokenFromDisk();
  const audioRoot = externalBaseDir();
  if (DOWNLOAD && !token) {
    fs.writeFileSync(REPORT_PATH, JSON.stringify({
      generatedAt: new Date().toISOString(),
      download: DOWNLOAD,
      tokenAvailable: false,
      candidateMixtures: 0,
      manifestItems: 0,
      byGenre: {},
      downloadErrors: [{
        error: "Missing Hugging Face token. Accept the jaCappella dataset terms on Hugging Face, then set HF_TOKEN or save the token at ~/.cache/huggingface/token."
      }]
    }, null, 2));
    throw new Error("Missing Hugging Face token. jaCappella is gated; accept the terms and set HF_TOKEN before downloading.");
  }
  const treeUrl = `https://huggingface.co/api/datasets/${DATASET}/tree/main?recursive=1`;
  const tree = await hfJson(treeUrl, token);
  const mixtureFiles = tree
    .filter(item => item.type === "file" && /(^|\/)mixture\.wav$/i.test(item.path))
    .map(item => item.path)
    .filter(remotePath => itemMeta(remotePath))
    .slice(0, LIMIT || undefined);

  const downloadErrors = [];
  const items = [];
  for (const remotePath of mixtureFiles) {
    const meta = itemMeta(remotePath);
    const filePath = path.join(audioRoot, remotePath);
    if (DOWNLOAD) {
      process.stdout.write(`${meta.subset}/${meta.title} ... `);
      try {
        const url = `https://huggingface.co/datasets/${DATASET}/resolve/main/${remotePath}`;
        const result = await download(url, filePath, token);
        console.log(result.skipped ? "exists" : "downloaded");
      } catch (error) {
        console.log(`error: ${error.message}`);
        downloadErrors.push({ remotePath, error: error.message });
        continue;
      }
    }
    items.push({
      source: "jaCappella",
      sourceType: "cc-dataset",
      datasetName: "jaCappella Corpus",
      trackId: `jacappella-${meta.subset}-${meta.title}`,
      genre: meta.genre,
      macroGenre: meta.macroGenre,
      trainingRole: meta.trainingRole,
      filePath,
      sourceUrl: filePath,
      originalAudioPath: remotePath,
      referenceUrl: DATASET_URL,
      license: "RESEARCH-USE-COPYRIGHT-CLEARED",
      licenseUrl: TERMS_URL,
      canonicalArtist: "jaCappella Corpus",
      canonicalTitle: `${meta.title} (${meta.subset} mixture)`,
      labelEvidence: `jaCappella subset ${meta.subset}; source path ${relativeAudioPath(remotePath)}`,
      labelConfidence: meta.trainingRole === "macro-only" ? "subset-macro" : "subset-label",
      audioStoragePolicy: "external-local-audio; persist-features-only; source redistribution prohibited",
      reviewStatus: "auto-approved-jacappella-subset",
      reviewNote: "Use only extracted features in repo. Source audio remains external and must not be redistributed."
    });
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify({
    description: "jaCappella mixture-only manifest. Source audio stays outside this repository; cc-import persists features only.",
    generatedAt: new Date().toISOString(),
    dataset: DATASET,
    datasetUrl: DATASET_URL,
    termsUrl: TERMS_URL,
    audioRoot,
    sourceAccess: "Hugging Face gated dataset; requires accepted conditions and authenticated token.",
    downloadedAudioPolicy: "external-local-audio; do-not-redistribute",
    items
  }, null, 2));

  const byGenre = items.reduce((acc, item) => {
    acc[item.genre] = (acc[item.genre] || 0) + 1;
    return acc;
  }, {});

  fs.writeFileSync(REPORT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    download: DOWNLOAD,
    tokenAvailable: Boolean(token),
    candidateMixtures: mixtureFiles.length,
    manifestItems: items.length,
    byGenre,
    downloadErrors
  }, null, 2));

  console.log(JSON.stringify({
    output: path.relative(ROOT, OUT_PATH),
    report: path.relative(ROOT, REPORT_PATH),
    audioRoot,
    tokenAvailable: Boolean(token),
    items: items.length,
    byGenre,
    downloadErrors: downloadErrors.length,
    next: `MMFR_CC_MANIFEST_PATH=${path.relative(ROOT, OUT_PATH)} MMFR_CC_WEAK_ONLY=0 npm --prefix apps/demo run cc-import`
  }, null, 2));
}

main().catch(error => {
  const tokenMessage = /401|403|restricted|authenticated|Authorization/i.test(String(error?.message || ""))
    ? "jaCappella is gated. Accept the dataset terms on Hugging Face and set HF_TOKEN, then rerun this script."
    : "";
  console.error(tokenMessage || error);
  if (tokenMessage) console.error(error.message);
  process.exitCode = 1;
});
