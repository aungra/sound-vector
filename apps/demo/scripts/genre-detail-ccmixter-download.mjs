import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const CACHE_ROOT = "/Volumes/20251005_12TBskyhawk/MUSICTee-cache";
const execFileAsync = promisify(execFile);

async function download(item, audioRoot) {
  const directory = path.join(audioRoot, item.detailTarget);
  const extension = path.extname(new URL(item.downloadUrl).pathname) || ".audio";
  const filePath = path.join(directory, `${item.trackId}${extension}`);
  fs.mkdirSync(directory, { recursive: true });
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 100_000) {
    const temporary = `${filePath}.part`;
    await execFileAsync("curl", [
      "-fL", "--retry", "2", "--connect-timeout", "15",
      "-A", "Mozilla/5.0", "-e", item.referenceUrl,
      "-o", temporary, item.downloadUrl
    ], { maxBuffer: 1024 * 1024 });
    if (fs.statSync(temporary).size < 100_000) throw new Error(`Downloaded file is too small: ${item.trackId}`);
    fs.renameSync(temporary, filePath);
  }
  return { ...item, filePath, split: "test", audioStoragePolicy: "external-cache-only" };
}

async function main() {
  const candidatePath = path.resolve(process.env.MMFR_CCMIXTER_CANDIDATE_MANIFEST || path.join(CACHE_ROOT, "genre-training/detail-genre-ccmixter-candidate-manifest.json"));
  const outputPath = path.resolve(process.env.MMFR_CCMIXTER_DETAIL_MANIFEST_OUTPUT || path.join(CACHE_ROOT, "genre-training/detail-genre-ccmixter-source-manifest.json"));
  const audioRoot = path.resolve(process.env.MMFR_CCMIXTER_AUDIO_ROOT || path.join(CACHE_ROOT, "external-data/ccmixter-detail-v1"));
  const candidates = JSON.parse(fs.readFileSync(candidatePath, "utf8")).items;
  const items = [];
  const failures = [];
  for (let offset = 0; offset < candidates.length; offset += 3) {
    const batch = await Promise.all(candidates.slice(offset, offset + 3).map(async item => {
      try { return await download(item, audioRoot); } catch (error) {
        failures.push({ trackId: item.trackId, error: error.message });
        return null;
      }
    }));
    items.push(...batch.filter(Boolean));
  }
  const byDetail = {};
  for (const item of items) byDetail[item.detailTarget] = (byDetail[item.detailTarget] || 0) + 1;
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    candidates: candidates.length,
    downloadedAndValidated: items.length,
    failures,
    representedDetailLabels: Object.keys(byDetail).length,
    byDetail,
    totalBytes: items.reduce((sum, item) => sum + fs.statSync(item.filePath).size, 0),
    promotionPolicy: "Downloaded evaluation candidates only; not part of the production model until source-heldout ablation passes."
  };
  fs.writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 1, items }, null, 2)}\n`);
  fs.writeFileSync(path.join(ROOT, "genre-training/detail-genre-ccmixter-download-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.basename(process.argv[1]) === path.basename(fileURLToPath(import.meta.url))) await main();
