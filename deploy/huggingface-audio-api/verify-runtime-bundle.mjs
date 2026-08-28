#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || process.env.MMFR_RUNTIME_ASSET_ROOT || "/app/runtime-assets");
const manifestPath = path.join(root, "runtime-assets.manifest.json");
const requiredAssets = new Set([
  "embedding-classifier",
  "unknown65-reranker",
  "track-pair-reranker",
  "musicfm-reranker",
  "discogs-effnet",
  "japanese-vocal-language-model",
  "panns",
  "yamnet",
  "ast-audioset",
  "musicfm",
]);

function hashFile(filePath) {
  const hash = crypto.createHash("sha256");
  const descriptor = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(4 * 1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

if (!fs.existsSync(manifestPath)) throw new Error("Runtime asset manifest is missing.");
const manifestText = fs.readFileSync(manifestPath, "utf8");
if (/\/Volumes\/|\/Users\//.test(manifestText)) throw new Error("Runtime manifest contains a workstation path.");
const manifest = JSON.parse(manifestText);
if (manifest.schemaVersion !== 1 || manifest.audioRetained !== false || manifest.sourcePathsRetained !== false) {
  throw new Error("Runtime asset manifest does not satisfy the production privacy contract.");
}
for (const asset of manifest.assets || []) {
  requiredAssets.delete(asset.id);
  const destination = path.resolve(root, asset.destination);
  if (!destination.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe asset destination: ${asset.id}`);
  for (const entry of asset.files || []) {
    const filePath = asset.kind === "file"
      ? destination
      : path.resolve(destination, entry.path);
    if (!filePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(filePath)) {
      throw new Error(`Runtime asset file is missing: ${asset.id}/${entry.path}`);
    }
    const stat = fs.statSync(filePath);
    if (stat.size !== entry.bytes || hashFile(filePath) !== entry.sha256) {
      throw new Error(`Runtime asset checksum mismatch: ${asset.id}/${entry.path}`);
    }
  }
}
if (requiredAssets.size) throw new Error(`Required runtime assets are missing: ${[...requiredAssets].join(", ")}`);
process.stdout.write(JSON.stringify({
  ok: true,
  bundleVersion: manifest.bundleVersion,
  assets: manifest.assets.length,
  totalBytes: manifest.totalBytes,
  audioRetained: manifest.audioRetained,
}) + "\n");
