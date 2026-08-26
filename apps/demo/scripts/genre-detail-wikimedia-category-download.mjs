import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const CACHE_ROOT = "/Volumes/20251005_12TBskyhawk/MUSICTee-cache";
const execFileAsync = promisify(execFile);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function download(item, audioRoot) {
  const directory = path.join(audioRoot, item.detailTarget, encodeURIComponent(item.sourceFamily));
  const extension = path.extname(new URL(item.downloadUrl).pathname) || ".audio";
  const filePath = path.join(directory, `${item.trackId}${extension}`);
  fs.mkdirSync(directory, { recursive: true });
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 100_000) {
    const temporary = `${filePath}.part`;
    await execFileAsync("curl", [
      "-fL", "--retry", "6", "--retry-all-errors", "--retry-delay", "5",
      "--connect-timeout", "15", "--max-time", "600",
      "-A", "MUSICtee reviewed Wikimedia audio downloader", "-e", item.referenceUrl,
      "-o", temporary, item.downloadUrl
    ], { maxBuffer: 1024 * 1024 });
    if (fs.statSync(temporary).size < 100_000) throw new Error(`Downloaded file is too small: ${item.trackId}`);
    fs.renameSync(temporary, filePath);
  }
  return { ...item, filePath, audioStoragePolicy: "external-cache-only" };
}

async function main() {
  const reviewedPath = path.resolve(process.env.MMFR_WIKIMEDIA_CATEGORY_REVIEWED || path.join(CACHE_ROOT, "genre-training/detail-genre-wikimedia-category-reviewed-manifest.json"));
  const outputPath = path.resolve(process.env.MMFR_WIKIMEDIA_CATEGORY_SOURCE || path.join(CACHE_ROOT, "genre-training/detail-genre-wikimedia-category-source-manifest.json"));
  const audioRoot = path.resolve(process.env.MMFR_WIKIMEDIA_CATEGORY_AUDIO_ROOT || path.join(CACHE_ROOT, "external-data/wikimedia-category-detail-v1"));
  const candidates = JSON.parse(fs.readFileSync(reviewedPath, "utf8")).items || [];
  const items = [];
  const failures = [];
  for (const item of candidates) {
    try {
      items.push(await download(item, audioRoot));
    } catch (error) {
      failures.push({ trackId: item.trackId, error: error.message });
    }
    await sleep(1500);
  }
  const byDetail = {};
  const byOrigin = {};
  for (const item of items) {
    byDetail[item.detailTarget] = (byDetail[item.detailTarget] || 0) + 1;
    byOrigin[item.sourceFamily] = (byOrigin[item.sourceFamily] || 0) + 1;
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    reviewedCandidates: candidates.length,
    downloadedAndValidated: items.length,
    failures,
    byDetail,
    byOrigin,
    totalBytes: items.reduce((sum, item) => sum + fs.statSync(item.filePath).size, 0),
    promotionPolicy: "Downloaded reviewed candidates only; origin-heldout ablation is required before production training."
  };
  fs.writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 1, items }, null, 2)}\n`);
  fs.writeFileSync(path.join(ROOT, "genre-training/detail-genre-wikimedia-category-download-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
