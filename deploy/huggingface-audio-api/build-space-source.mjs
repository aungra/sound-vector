#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../..");
const output = path.resolve(process.argv[2] || "/tmp/musictee-sound-form-space");
const forbiddenNames = new Set(["youtube-cookies.txt", ".env", ".env.local"]);
const workstationPathPattern = /^(?:\/Volumes\/|\/Users\/)/;
const runtimeScripts = [
  "audio-analysis-public-policy.mjs",
  "audio-analysis-server.mjs",
  "genre-ast-cache.py",
  "genre-embedding-infer.py",
  "genre-embedding-macro-specialists.py",
  "genre-embedding-runtime-policy.mjs",
  "genre-embedding-segment-input.mjs",
  "genre-japanese-vocal-evidence.py",
  "genre-musicfm-cache.py",
  "genre-musicfm-runtime-extract.py",
  "genre-panns-cache.py",
  "genre-track-sampling.mjs",
  "genre-training.mjs",
  "genre-unknown-consensus-policy.mjs",
  "genre-unknown65-runtime-extract.py",
  "genre-unknown80-v107-track-reranker-screen.py",
  "genre-yamnet-cache.py",
  "genre_librosa_contract.py",
  "genre_musicfm_runtime.py",
  "genre_runtime_contract.py",
  "genre_runtime_models.py",
  "genre_source_family.py",
  "genre_track_feature_contract.py",
  "genre_unknown65_runtime.py",
  "genre_unknown80_rhythm_reranker.py",
  "genre_unknown80_track_pair_reranker.py",
];
const copies = [
  ...runtimeScripts.map(name => [`apps/demo/scripts/${name}`, `apps/demo/scripts/${name}`]),
  ["genre-training/unknown65-production-model-manifest.json", "genre-training/unknown65-production-model-manifest.json"],
  ["genre-training/unknown80-v113-track-pair-model-manifest.json", "genre-training/unknown80-v113-track-pair-model-manifest.json"],
  ["genre-training/unknown80-v114-musicfm-model-manifest.json", "genre-training/unknown80-v114-musicfm-model-manifest.json"],
  ["deploy/huggingface-audio-api/app.py", "app.py"],
  ["deploy/huggingface-audio-api/prepare-runtime-assets.mjs", "deploy/huggingface-audio-api/prepare-runtime-assets.mjs"],
  ["deploy/huggingface-audio-api/verify-runtime-bundle.mjs", "deploy/huggingface-audio-api/verify-runtime-bundle.mjs"],
];

const deploymentManifestFields = new Set([
  "version",
  "schemaVersion",
  "modelPath",
  "modelSha256",
  "runtimeFeatureContractSha256",
  "promotionState",
]);

function portableJsonValue(value) {
  if (Array.isArray(value)) return value.map(portableJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    if (typeof entry === "string" && workstationPathPattern.test(entry)) return [];
    return [[key, portableJsonValue(entry)]];
  }));
}

function copyPortableSource(source, destination) {
  const sourcePath = path.join(ROOT, source);
  const destinationPath = path.join(output, destination);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  if (source.endsWith(".json")) {
    const sourcePayload = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
    const payload = source.includes("model-manifest")
      ? Object.fromEntries(Object.entries(sourcePayload).filter(([key]) => deploymentManifestFields.has(key)))
      : portableJsonValue(sourcePayload);
    fs.writeFileSync(destinationPath, `${JSON.stringify(payload)}\n`);
    return;
  }
  fs.cpSync(sourcePath, destinationPath, {
    recursive: true,
    filter: candidate => {
      if (candidate.includes(`${path.sep}__pycache__${path.sep}`)) return false;
      return !forbiddenNames.has(path.basename(candidate));
    },
  });
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const [source, destination] of copies) {
  copyPortableSource(source, destination);
}
fs.copyFileSync(
  path.join(SCRIPT_DIR, "SPACE-README.md"),
  path.join(output, "README.md"),
);
fs.copyFileSync(
  path.join(SCRIPT_DIR, "requirements.txt"),
  path.join(output, "requirements.txt"),
);
fs.copyFileSync(
  path.join(SCRIPT_DIR, "packages.txt"),
  path.join(output, "packages.txt"),
);
process.stdout.write(`${JSON.stringify({ ok: true, output })}\n`);
