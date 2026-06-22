import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const VERIFIED_PATH = path.join(TRAINING_DIR, "verified-dataset.json");

const payload = JSON.parse(fs.readFileSync(VERIFIED_PATH, "utf8"));
const items = Array.isArray(payload.items) ? payload.items : [];
const noisy = [];
const cleaned = items.filter(item => {
  const isFma = item.source === "FMA" || item.datasetName === "FMA";
  const isMtgJamendo = item.datasetName === "MTG-Jamendo";
  const isBadPopProxy = isFma && item.genre === "J-POP";
  const isBadMtgPopProxy = isMtgJamendo && item.genre === "J-POP";
  if (isBadPopProxy || isBadMtgPopProxy) noisy.push({
    trackId: item.trackId,
    title: item.canonicalTitle,
    artist: item.canonicalArtist,
    reason: isBadMtgPopProxy ? "mtg-jamendo-pop-is-not-jpop" : "fma-pop-is-not-jpop"
  });
  return !isBadPopProxy && !isBadMtgPopProxy;
});

payload.items = cleaned;
payload.cleanedAt = new Date().toISOString();
payload.cleaningPolicy = [
  ...(Array.isArray(payload.cleaningPolicy) ? payload.cleaningPolicy : []),
  "Removed FMA rows mapped from generic Pop to J-POP. FMA Pop is not reliable J-POP evidence.",
  "Removed MTG-Jamendo rows mapped from generic pop/electropop tags to J-POP. MTG generic pop is not reliable J-POP evidence."
];

fs.writeFileSync(VERIFIED_PATH, JSON.stringify(payload, null, 2));
fs.writeFileSync(path.join(TRAINING_DIR, "fma-label-cleanup-report.json"), JSON.stringify({
  cleanedAt: payload.cleanedAt,
  removed: noisy.length,
  removedRows: noisy.slice(0, 200)
}, null, 2));

console.log(JSON.stringify({
  verifiedPath: VERIFIED_PATH,
  before: items.length,
  after: cleaned.length,
  removed: noisy.length,
  report: path.join(TRAINING_DIR, "fma-label-cleanup-report.json")
}, null, 2));
