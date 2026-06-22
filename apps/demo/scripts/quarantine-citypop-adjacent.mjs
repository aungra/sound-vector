import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
const VERIFIED_FALLBACK_PATH = path.join(TRAINING_DIR, "verified-dataset.json");
const REPORT_PATH = path.join(TRAINING_DIR, "citypop-adjacent-quarantine-report.json");

function readJson(target, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(target, "utf8"));
  } catch {
    return fallback;
  }
}

function verifiedPath() {
  const local = readJson(CACHE_PATHS_PATH, {});
  return path.resolve(process.env.MMFR_GENRE_VERIFIED_DATASET_PATH || local.verifiedDatasetPath || VERIFIED_FALLBACK_PATH);
}

function adjacentCityPop(item = {}) {
  if (item.genre !== "シティ・ポップ") return false;
  const text = [
    item.datasetName,
    item.trackId,
    item.canonicalArtist,
    item.canonicalTitle,
    item.trackName,
    item.labelEvidence,
    item.reviewStatus,
    item.reviewNote,
    item.referenceUrl,
    item.sourceUrl
  ].join(" ");
  if (/explicit city pop wording/i.test(text)) return false;
  return /retrofuture|future[-\s]?funk|synth[-\s]?pop|city-pop-adjacent|Kevin MacLeod/i.test(text);
}

function main() {
  const targetPath = verifiedPath();
  const payload = readJson(targetPath, { items: [] });
  const items = Array.isArray(payload) ? payload : payload.items || [];
  const changed = [];
  const nextItems = items.map(item => {
    if (!adjacentCityPop(item)) return item;
    if (item.sourceType === "cc-dataset-quarantined" && item.trainingRole === "macro-only") return item;
    const next = {
      ...item,
      sourceType: "cc-dataset-quarantined",
      trainingRole: "macro-only",
      labelEvidence: item.labelEvidence || "city-pop-adjacent future funk / synth-pop / retrofuture wording; not explicit city-pop",
      reviewStatus: "quarantined-citypop-adjacent-not-exact",
      reviewNote: [
        item.reviewNote,
        "Excluded from formal fine training because the metadata does not explicitly label this as city pop."
      ].filter(Boolean).join(" ")
    };
    changed.push({
      trackId: next.trackId,
      title: next.canonicalTitle || next.trackName || "",
      artist: next.canonicalArtist || next.artistName || "",
      previousSourceType: item.sourceType || "",
      nextSourceType: next.sourceType,
      previousTrainingRole: item.trainingRole || "",
      nextTrainingRole: next.trainingRole,
      referenceUrl: next.referenceUrl || ""
    });
    return next;
  });

  const nextPayload = Array.isArray(payload) ? nextItems : { ...payload, items: nextItems };
  if (changed.length) {
    fs.writeFileSync(targetPath, `${JSON.stringify(nextPayload, null, 2)}\n`);
  }
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    verifiedDatasetPath: targetPath,
    changedCount: changed.length,
    changed
  }, null, 2)}\n`);
  console.log(JSON.stringify({
    verifiedDatasetPath: path.relative(ROOT, targetPath),
    changedCount: changed.length,
    report: path.relative(ROOT, REPORT_PATH)
  }, null, 2));
}

main();
