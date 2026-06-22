import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const DEFAULT_EXTERNAL_DIR = "/Volumes/20251005_12TBskyhawk/MUSICTee-cache";

const dryRun = process.argv.includes("--dry-run");
const copyOnly = process.argv.includes("--copy-only");
const positionalArgs = process.argv.slice(2).filter(arg => !arg.startsWith("--"));
const externalRoot = path.resolve(positionalArgs[0] || process.env.MMFR_GENRE_CACHE_EXTERNAL_DIR || DEFAULT_EXTERNAL_DIR);

const moves = [
  {
    name: "feature cache",
    from: path.join(TRAINING_DIR, "feature-cache.json"),
    to: path.join(externalRoot, "genre-training", "feature-cache.json")
  },
  {
    name: "verified dataset",
    from: path.join(TRAINING_DIR, "verified-dataset.json"),
    to: path.join(externalRoot, "genre-training", "verified-dataset.json")
  },
  {
    name: "external data",
    from: path.join(ROOT, ".external-data"),
    to: path.join(externalRoot, "external-data")
  }
];

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function sizeOf(target) {
  if (!fs.existsSync(target)) return 0;
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return stat.size;
  let total = 0;
  for (const entry of fs.readdirSync(target)) {
    total += sizeOf(path.join(target, entry));
  }
  return total;
}

function movePath(from, to) {
  if (!fs.existsSync(from) && fs.existsSync(to)) return "externalized";
  if (!fs.existsSync(from)) return "missing";
  if (fs.existsSync(to)) return "already-exists";
  if (dryRun) return "dry-run";
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (copyOnly) {
    fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: true });
    return "copied";
  }
  try {
    fs.renameSync(from, to);
    return "moved";
  } catch (error) {
    if (error?.code !== "EXDEV") throw error;
    fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: true });
    fs.rmSync(from, { recursive: true, force: true });
    return "copied-and-removed";
  }
}

const report = [];
for (const item of moves) {
  const beforeSize = sizeOf(item.from);
  const status = movePath(item.from, item.to);
  report.push({
    name: item.name,
    status,
    from: item.from,
    to: item.to,
    size: formatBytes(beforeSize || sizeOf(item.to))
  });
}

const config = {
  featureCachePath: moves[0].to,
  verifiedDatasetPath: moves[1].to,
  externalDataDir: moves[2].to,
  updatedAt: new Date().toISOString()
};

const configPath = path.join(TRAINING_DIR, "cache-paths.local.json");
if (!dryRun) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

console.log(JSON.stringify({ externalRoot, dryRun, copyOnly, configPath, report }, null, 2));
