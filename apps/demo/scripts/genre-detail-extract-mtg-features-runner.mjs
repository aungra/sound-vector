import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PYTHON = "/Users/kahanishimoto/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const DEFAULT_MODULE_PATHS = [
  "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/python-audio-features",
  "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/python-essentia-tf"
];

const python = process.env.MMFR_EMBEDDING_PYTHON
  || (fs.existsSync(DEFAULT_PYTHON) ? DEFAULT_PYTHON : "python3");
const pythonPath = process.env.MMFR_EMBEDDING_PYTHONPATH || DEFAULT_MODULE_PATHS.join(path.delimiter);
const result = spawnSync(python, [path.join(SCRIPT_DIR, "genre-detail-extract-mtg-features.py")], {
  stdio: "inherit",
  env: { ...process.env, PYTHONPATH: pythonPath }
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
