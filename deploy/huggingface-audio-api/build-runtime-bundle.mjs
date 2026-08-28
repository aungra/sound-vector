#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FORBIDDEN_AUDIO_EXTENSIONS = new Set([
  ".aac", ".aif", ".aiff", ".flac", ".m4a", ".mp3", ".ogg", ".opus", ".wav", ".webm",
]);

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) continue;
    values[key.slice(2)] = argv[index + 1]?.startsWith("--") ? true : argv[++index] ?? true;
  }
  return values;
}

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

function listFiles(root) {
  const files = [];
  const visit = current => {
    const stat = fs.statSync(current);
    if (stat.isFile()) {
      files.push(current);
      return;
    }
    for (const entry of fs.readdirSync(current).sort()) visit(path.join(current, entry));
  };
  visit(root);
  return files;
}

function assertModelOnly(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (FORBIDDEN_AUDIO_EXTENSIONS.has(extension)) {
    throw new Error(`Runtime bundle must not contain source audio: ${path.basename(filePath)}`);
  }
}

function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

export function buildRuntimeBundle({ specPath, sourceRoot, outputRoot, copy = true }) {
  if (!sourceRoot) throw new Error("A model source root is required.");
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  if (spec.schemaVersion !== 1 || !Array.isArray(spec.assets) || !spec.assets.length) {
    throw new Error("Invalid runtime asset specification.");
  }
  const manifestAssets = [];
  const seenDestinations = new Set();
  for (const asset of spec.assets) {
    const source = path.resolve(sourceRoot, asset.source);
    const destination = path.normalize(asset.destination).replace(/^\.\.(?:[/\\]|$)/, "");
    if (!destination || path.isAbsolute(destination) || seenDestinations.has(destination)) {
      throw new Error(`Unsafe or duplicate runtime destination: ${asset.destination}`);
    }
    seenDestinations.add(destination);
    if (!fs.existsSync(source)) throw new Error(`Missing runtime asset: ${asset.id}`);
    const sourceStat = fs.statSync(source);
    if ((asset.kind === "file") !== sourceStat.isFile()
      || (asset.kind === "directory") !== sourceStat.isDirectory()) {
      throw new Error(`Runtime asset kind mismatch: ${asset.id}`);
    }
    const sourceFiles = listFiles(source);
    const entries = sourceFiles.map(filePath => {
      assertModelOnly(filePath);
      const relative = sourceStat.isFile() ? "" : path.relative(source, filePath).split(path.sep).join("/");
      const target = sourceStat.isFile()
        ? path.join(outputRoot, destination)
        : path.join(outputRoot, destination, relative);
      if (copy) copyFile(filePath, target);
      const stat = fs.statSync(filePath);
      return { path: relative || path.basename(destination), bytes: stat.size, sha256: hashFile(filePath) };
    });
    const aggregate = crypto.createHash("sha256");
    entries.forEach(entry => aggregate.update(`${entry.path}\0${entry.bytes}\0${entry.sha256}\n`));
    manifestAssets.push({
      id: asset.id,
      destination,
      kind: asset.kind,
      bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
      sha256: aggregate.digest("hex"),
      files: entries,
    });
  }
  const manifest = {
    schemaVersion: 1,
    bundleVersion: spec.bundleVersion,
    generatedAt: new Date().toISOString(),
    audioRetained: false,
    sourcePathsRetained: false,
    assets: manifestAssets,
    totalBytes: manifestAssets.reduce((sum, asset) => sum + asset.bytes, 0),
  };
  if (copy) {
    fs.mkdirSync(outputRoot, { recursive: true });
    fs.writeFileSync(path.join(outputRoot, "runtime-assets.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return manifest;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const specPath = path.resolve(args.spec || path.join(SCRIPT_DIR, "runtime-assets.spec.json"));
  const sourceRoot = args["source-root"] || process.env.MMFR_MODEL_SOURCE_ROOT;
  const outputRoot = path.resolve(args.output || path.join(SCRIPT_DIR, ".runtime-assets"));
  const copy = args["lock-only"] !== true;
  const manifest = buildRuntimeBundle({ specPath, sourceRoot, outputRoot, copy });
  const output = `${JSON.stringify(manifest, null, 2)}\n`;
  if (args.lock) fs.writeFileSync(path.resolve(args.lock), output);
  process.stdout.write(JSON.stringify({
    ok: true,
    bundleVersion: manifest.bundleVersion,
    assets: manifest.assets.length,
    totalBytes: manifest.totalBytes,
    audioRetained: manifest.audioRetained,
    copied: copy,
  }) + "\n");
}
