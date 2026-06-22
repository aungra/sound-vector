import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const CANDIDATES_PATH = path.join(TRAINING_DIR, "openverse-pop-cc-candidates.json");
const MANIFEST_PATH = path.join(TRAINING_DIR, "openverse-pop-cc-source-manifest.json");
const LIMIT_PER_GENRE = Math.max(1, Number(process.env.MMFR_OPENVERSE_DOWNLOAD_LIMIT_PER_GENRE || 30));
const DRY_RUN = process.env.MMFR_OPENVERSE_DOWNLOAD_DRY_RUN === "1";

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function download(url, destination) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const file = fs.createWriteStream(destination);
    const request = https.get(url, { headers: { "User-Agent": "MUSICTee genre collector" } }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close(() => fs.rmSync(destination, { force: true }));
        resolve(download(new URL(response.headers.location, url).toString(), destination));
        return;
      }
      if (response.statusCode !== 200) {
        file.close(() => fs.rmSync(destination, { force: true }));
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
    });
    request.on("error", error => {
      file.close(() => fs.rmSync(destination, { force: true }));
      reject(error);
    });
  });
}

function isInsideRepo(value) {
  const relative = path.relative(ROOT, path.resolve(value));
  return Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

async function main() {
  const payload = loadJson(CANDIDATES_PATH, null);
  if (!payload) throw new Error(`Missing candidates: ${CANDIDATES_PATH}`);
  const audioDir = path.resolve(process.env.MMFR_OPENVERSE_AUDIO_DIR || payload.audioDir || "");
  if (!audioDir) throw new Error("Missing Openverse audioDir.");
  if (isInsideRepo(audioDir)) throw new Error(`Refusing repo-local audioDir: ${audioDir}`);
  const counts = {};
  const manifestItems = [];
  const rejected = [];
  for (const candidate of payload.candidates || []) {
    counts[candidate.genre] = counts[candidate.genre] || 0;
    if (counts[candidate.genre] >= LIMIT_PER_GENRE) {
      rejected.push({ ...candidate, rejectReason: "genre-limit" });
      continue;
    }
    const filePath = path.join(audioDir, candidate.suggestedFileName);
    try {
      if (!DRY_RUN && !fs.existsSync(filePath)) {
        await download(candidate.downloadUrl, filePath);
      }
      manifestItems.push({
        source: candidate.source,
        sourceType: "cc-dataset",
        datasetName: candidate.datasetName,
        trackId: candidate.openverseId,
        genre: candidate.genre,
        macroGenre: candidate.macroGenre,
        trainingRole: candidate.trainingRole,
        filePath,
        sourceUrl: filePath,
        referenceUrl: candidate.referenceUrl,
        license: candidate.license,
        licenseUrl: candidate.licenseUrl,
        canonicalArtist: candidate.canonicalArtist,
        canonicalTitle: candidate.canonicalTitle,
        audioStoragePolicy: "external-local-audio; persist-features-only",
        reviewStatus: `openverse-${candidate.confidence}`
      });
      counts[candidate.genre] += 1;
      console.log(`${DRY_RUN ? "ready" : "downloaded"} ${candidate.genre} ${candidate.canonicalTitle}`);
    } catch (error) {
      rejected.push({ ...candidate, rejectReason: `download-failed:${error.message}` });
      console.log(`error ${candidate.canonicalTitle}: ${error.message}`);
    }
  }
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({
    description: "Downloaded Openverse CC audio manifest for reviewed J-POP / City Pop / Anime Song candidates. Audio stays outside repo.",
    generatedAt: new Date().toISOString(),
    audioDir,
    dryRun: DRY_RUN,
    limitPerGenre: LIMIT_PER_GENRE,
    items: manifestItems,
    rejected: rejected.slice(0, 500)
  }, null, 2));
  console.log(JSON.stringify({ output: path.relative(ROOT, MANIFEST_PATH), audioDir, items: manifestItems.length, rejected: rejected.length, counts }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
