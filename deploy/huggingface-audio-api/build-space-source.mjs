#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../..");
const output = path.resolve(process.argv[2] || "/tmp/musictee-sound-form-space");
const forbiddenNames = new Set(["youtube-cookies.txt", ".env", ".env.local"]);
const copies = [
  ["apps/demo/scripts", "apps/demo/scripts"],
  ["apps/demo/MUSIC MEMORY FITTING ROOM.html", "apps/demo/MUSIC MEMORY FITTING ROOM.html"],
  ["genre-training", "genre-training"],
  ["deploy/huggingface-audio-api", "deploy/huggingface-audio-api"],
];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const [source, destination] of copies) {
  fs.cpSync(path.join(ROOT, source), path.join(output, destination), {
    recursive: true,
    filter: candidate => {
      if (candidate.includes(`${path.sep}__pycache__${path.sep}`)) return false;
      return !forbiddenNames.has(path.basename(candidate));
    },
  });
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
fs.rmSync(path.join(output, "deploy/huggingface-audio-api/.runtime-assets"), {
  recursive: true,
  force: true,
});

process.stdout.write(`${JSON.stringify({ ok: true, output })}\n`);
