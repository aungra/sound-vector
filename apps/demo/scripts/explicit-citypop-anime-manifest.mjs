import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
const CANDIDATES_PATH = path.join(TRAINING_DIR, "explicit-citypop-anime-candidates.json");
const REVIEW_TSV_PATH = path.join(TRAINING_DIR, "explicit-citypop-anime-review.tsv");
const MANIFEST_PATH = path.join(TRAINING_DIR, "explicit-citypop-anime-source-manifest.json");
const REPORT_PATH = path.join(TRAINING_DIR, "explicit-citypop-anime-manifest-report.json");

const DOWNLOAD_AUDIO = process.env.MMFR_EXPLICIT_CITYPOP_ANIME_DOWNLOAD_AUDIO === "1";
const ALLOW_RISKY = process.env.MMFR_EXPLICIT_CITYPOP_ANIME_ALLOW_RISKY === "1";
const ALLOW_ADJACENT = process.env.MMFR_EXPLICIT_CITYPOP_ANIME_ALLOW_ADJACENT === "1";

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function cachePaths() {
  const payload = loadJson(CACHE_PATHS_PATH, {});
  return payload && typeof payload === "object" ? payload : {};
}

function externalBaseDir() {
  const configured = process.env.MMFR_EXTERNAL_DATA_DIR || cachePaths().externalDataDir || path.join(ROOT, ".external-data");
  return path.resolve(configured, "explicit-citypop-anime");
}

function parseTsv(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split("\t");
  return lines.slice(1).map(line => {
    const cells = line.split("\t");
    return Object.fromEntries(header.map((key, index) => [key, cells[index] || ""]));
  });
}

function approved(value) {
  return /^(approved|accepted|ok|採用|承認)$/i.test(String(value || "").trim());
}

function safeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "audio";
}

function extensionFromUrl(url) {
  try {
    const ext = path.extname(new URL(url).pathname);
    return ext || ".audio";
  } catch {
    return ".audio";
  }
}

function localAudioPath(item, baseDir) {
  if (item.filePath && fs.existsSync(item.filePath)) return item.filePath;
  const ext = extensionFromUrl(item.candidateAudioUrl);
  return path.join(baseDir, safeName(item.genre), `${safeName(`${item.source}-${item.trackId || item.canonicalTitle}`)}${ext}`);
}

async function download(url, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1024) return { skipped: true };
  const response = await fetch(url, {
    headers: { "User-Agent": "MUSICTee explicit citypop/anime approved downloader" }
  });
  if (!response.ok || !response.body) throw new Error(`${response.status} ${response.statusText}`);
  await pipeline(response.body, fs.createWriteStream(outPath));
  return { skipped: false };
}

function candidateKey(row) {
  return [
    row.genre,
    row.source,
    row.trackId,
    row.referenceUrl,
    row.candidateAudioUrl
  ].filter(Boolean).join("|");
}

async function main() {
  const candidatesPayload = loadJson(CANDIDATES_PATH, { items: [] });
  const candidates = Array.isArray(candidatesPayload) ? candidatesPayload : candidatesPayload.items || [];
  const byKey = new Map(candidates.map(item => [candidateKey(item), item]));
  const reviewRows = fs.existsSync(REVIEW_TSV_PATH) ? parseTsv(fs.readFileSync(REVIEW_TSV_PATH, "utf8")) : [];
  const selected = [];
  const rejected = [];
  const baseDir = externalBaseDir();

  for (const row of reviewRows) {
    if (!approved(row.reviewStatus)) continue;
    const key = candidateKey(row);
    const item = byKey.get(key) || candidates.find(candidate => candidate.trackId === row.trackId && candidate.genre === row.genre && candidate.source === row.source);
    if (!item) {
      rejected.push({ ...row, rejectReason: "candidate-not-found" });
      continue;
    }
    if (item.confidence !== "exact" && !ALLOW_ADJACENT) {
      rejected.push({ ...item, rejectReason: "adjacent-not-allowed" });
      continue;
    }
    if (String(item.safetyFlags || "").trim() && !ALLOW_RISKY) {
      rejected.push({ ...item, rejectReason: `safety-flags:${item.safetyFlags}` });
      continue;
    }
    if (!item.filePath && !item.candidateAudioUrl) {
      rejected.push({ ...item, rejectReason: "missing-audio-source" });
      continue;
    }
    const filePath = localAudioPath(item, baseDir);
    if (!fs.existsSync(filePath) && DOWNLOAD_AUDIO) {
      try {
        await download(item.candidateAudioUrl, filePath);
      } catch (error) {
        rejected.push({ ...item, rejectReason: `download-failed:${error.message}` });
        continue;
      }
    }
    if (!fs.existsSync(filePath)) {
      rejected.push({ ...item, rejectReason: "audio-not-downloaded" });
      continue;
    }
    selected.push({
      source: item.source,
      sourceType: "cc-dataset",
      datasetName: item.datasetName || item.source,
      trackId: `explicit-${safeName(item.genre)}-${safeName(item.trackId || item.canonicalTitle)}`,
      genre: item.genre,
      macroGenre: item.macroGenre,
      trainingRole: "fine",
      filePath,
      sourceUrl: filePath,
      originalAudioUrl: item.candidateAudioUrl || "",
      referenceUrl: item.referenceUrl,
      license: item.license,
      licenseUrl: item.licenseUrl,
      canonicalArtist: item.canonicalArtist,
      canonicalTitle: item.canonicalTitle,
      labelEvidence: item.labelEvidence,
      labelConfidence: item.confidence,
      audioStoragePolicy: "external-local-audio; persist-features-only",
      reviewStatus: "approved-explicit-citypop-anime",
      reviewNote: row.reviewNote || item.reviewNote || ""
    });
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({
    description: "Approved explicit city-pop/anime-song source manifest. Source audio stays outside this repository; cc-import persists features only.",
    generatedAt: new Date().toISOString(),
    reviewTsv: path.relative(ROOT, REVIEW_TSV_PATH),
    audioRoot: baseDir,
    allowRisky: ALLOW_RISKY,
    allowAdjacent: ALLOW_ADJACENT,
    downloadAudio: DOWNLOAD_AUDIO,
    items: selected
  }, null, 2));
  fs.writeFileSync(REPORT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    selected: selected.length,
    rejected: rejected.length,
    rejectedSamples: rejected.slice(0, 100).map(item => ({
      genre: item.genre,
      source: item.source,
      title: item.canonicalTitle || item.title,
      rejectReason: item.rejectReason
    }))
  }, null, 2));
  console.log(JSON.stringify({
    manifest: path.relative(ROOT, MANIFEST_PATH),
    report: path.relative(ROOT, REPORT_PATH),
    selected: selected.length,
    rejected: rejected.length,
    next: `MMFR_CC_MANIFEST_PATH=${path.relative(ROOT, MANIFEST_PATH)} MMFR_CC_WEAK_ONLY=0 npm --prefix apps/demo run cc-import`
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
