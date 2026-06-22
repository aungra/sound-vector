import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const LOCAL_CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
const PLAN_PATH = path.join(TRAINING_DIR, "mtg-jamendo-audio-plan.json");
const OUT_REPORT = path.join(TRAINING_DIR, "mtg-jamendo-partial-download-report.json");

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function loadLocalCachePaths() {
  const payload = loadJson(LOCAL_CACHE_PATHS_PATH, {});
  return payload && typeof payload === "object" ? payload : {};
}

function audioLowPathFor(sourcePath) {
  return String(sourcePath || "").replaceAll("\\", "/").replace(/\.mp3$/i, ".low.mp3");
}

function isInsideRepo(value) {
  const relative = path.relative(ROOT, path.resolve(value));
  return Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function loadTrackChecksums(checksumPath) {
  const map = new Map();
  if (!fs.existsSync(checksumPath)) return map;
  const lines = fs.readFileSync(checksumPath, "utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const [sha256, trackPath] = line.trim().split(/\s+/);
    if (sha256 && trackPath) map.set(trackPath, sha256);
  }
  return map;
}

function sha256File(pathname) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(pathname);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadOne(url, destPath, expectedSha256) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const partialPath = `${destPath}.part`;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      await pipeline(response.body, fs.createWriteStream(partialPath));
      if (expectedSha256) {
        const actual = await sha256File(partialPath);
        if (actual !== expectedSha256) {
          throw new Error(`sha256 mismatch: ${actual}`);
        }
      }
      fs.renameSync(partialPath, destPath);
      return { ok: true, attempts: attempt };
    } catch (error) {
      try {
        if (fs.existsSync(partialPath)) fs.rmSync(partialPath);
      } catch {
        // ignore partial cleanup errors
      }
      if (attempt >= MAX_RETRIES) {
        return { ok: false, attempts: attempt, error: error?.message || String(error) };
      }
      await sleep(750 * attempt);
    }
  }
  return { ok: false, attempts: MAX_RETRIES, error: "unknown download failure" };
}

async function runPool(items, worker) {
  let index = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      await worker(current, index, items.length);
    }
  });
  await Promise.all(workers);
}

const localCache = loadLocalCachePaths();
const externalDataDir = path.resolve(process.env.MMFR_EXTERNAL_DATA_DIR || localCache.externalDataDir || path.join(ROOT, ".external-data"));
const mtgDir = path.resolve(process.env.MMFR_MTG_DIR || path.join(externalDataDir, "mtg-jamendo"));
const toolsDir = path.resolve(process.env.MMFR_MTG_TOOLS_DIR || path.join(mtgDir, "mtg-jamendo-dataset-tools"));
const audioRoot = path.resolve(process.env.MMFR_MTG_AUDIO_ROOT || path.join(mtgDir, "raw_30s", "audio-low"));
const checksumPath = path.join(toolsDir, "data", "download", "raw_30s_audio-low_sha256_tracks.txt");
const CDN_BASE = String(process.env.MMFR_MTG_CDN_BASE || "https://cdn.freesound.org/mtg-jamendo/raw_30s/audio-low").replace(/\/+$/, "");
const CONCURRENCY = Math.max(1, Number(process.env.MMFR_MTG_DOWNLOAD_CONCURRENCY || 16));
const MAX_RETRIES = Math.max(1, Number(process.env.MMFR_MTG_DOWNLOAD_RETRIES || 3));
const DOWNLOAD_TIMEOUT_MS = Math.max(10_000, Number(process.env.MMFR_MTG_DOWNLOAD_TIMEOUT_MS || 90_000));
const LIMIT = Math.max(0, Number(process.env.MMFR_MTG_DOWNLOAD_LIMIT || 0));
const TARGET_GENRES = new Set(
  String(process.env.MMFR_MTG_DOWNLOAD_GENRES || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
);

const plan = loadJson(PLAN_PATH, null);
if (!plan?.selected?.length) {
  console.error(`MTG audio plan not found or empty: ${path.relative(ROOT, PLAN_PATH)}`);
  process.exitCode = 1;
} else if (!fs.existsSync(checksumPath)) {
  console.error(`MTG checksum file not found: ${checksumPath}`);
  process.exitCode = 1;
} else if (isInsideRepo(audioRoot)) {
  console.error(`Refusing repo-local audio root: ${audioRoot}`);
  process.exitCode = 1;
} else {
  const checksums = loadTrackChecksums(checksumPath);
  const rows = plan.selected
    .filter(row => !TARGET_GENRES.size || TARGET_GENRES.has(row.genre))
    .map(row => {
      const audioPath = audioLowPathFor(row.sourcePath);
      return {
        ...row,
        audioPath,
        destPath: path.join(audioRoot, audioPath),
        url: `${CDN_BASE}/${audioPath}`,
        expectedSha256: checksums.get(audioPath) || ""
      };
    })
    .filter(row => row.sourcePath && row.audioPath);
  const uniqueRows = [...new Map(rows.map(row => [row.audioPath, row])).values()];
  const missingChecksum = uniqueRows.filter(row => !row.expectedSha256);
  const existing = [];
  const queue = [];
  for (const row of uniqueRows) {
    if (fs.existsSync(row.destPath)) {
      const actual = await sha256File(row.destPath).catch(() => "");
      if (!row.expectedSha256 || actual === row.expectedSha256) {
        existing.push(row);
        continue;
      }
      fs.rmSync(row.destPath);
    }
    queue.push(row);
  }
  const targetQueue = LIMIT ? queue.slice(0, LIMIT) : queue;
  const downloaded = [];
  const failed = [];
  console.log(JSON.stringify({
    audioRoot,
    selected: uniqueRows.length,
    existing: existing.length,
    queued: targetQueue.length,
    skippedByLimit: queue.length - targetQueue.length,
    missingChecksum: missingChecksum.length,
    concurrency: CONCURRENCY,
    downloadTimeoutMs: DOWNLOAD_TIMEOUT_MS,
    targetGenres: [...TARGET_GENRES]
  }, null, 2));
  await runPool(targetQueue, async (row, done, total) => {
    const result = await downloadOne(row.url, row.destPath, row.expectedSha256);
    if (result.ok) {
      downloaded.push(row);
      if (downloaded.length % 25 === 0 || downloaded.length === targetQueue.length) {
        console.log(`downloaded ${downloaded.length}/${targetQueue.length}`);
      }
    } else {
      failed.push({ ...row, error: result.error });
      console.error(`failed ${done}/${total}: ${row.audioPath}: ${result.error}`);
    }
  });
  const report = {
    generatedAt: new Date().toISOString(),
    source: "MTG-Jamendo raw_30s/audio-low individual CDN files",
    cdnBase: CDN_BASE,
    audioRoot,
    selectedRows: uniqueRows.length,
    existingRows: existing.length,
    downloadedRows: downloaded.length,
    failedRows: failed.length,
    skippedByLimit: queue.length - targetQueue.length,
    missingChecksumRows: missingChecksum.length,
    failed: failed.slice(0, 200),
    missingChecksum: missingChecksum.slice(0, 200).map(row => row.audioPath),
    nextCommands: [
      "npm --prefix apps/demo run mtg-audio-plan",
      `npm --prefix apps/demo run cc-manifest:mtg-jamendo -- ${audioRoot}`,
      "npm --prefix apps/demo run cc-import",
      "npm --prefix apps/demo run genre-features:compact",
      "npm --prefix apps/demo run genre-train:cached",
      "npm --prefix apps/demo run genre-goal-report"
    ]
  };
  fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    report: path.relative(ROOT, OUT_REPORT),
    selectedRows: report.selectedRows,
    existingRows: report.existingRows,
    downloadedRows: report.downloadedRows,
    failedRows: report.failedRows,
    nextCommands: report.nextCommands
  }, null, 2));
  if (failed.length) process.exitCode = 1;
}
