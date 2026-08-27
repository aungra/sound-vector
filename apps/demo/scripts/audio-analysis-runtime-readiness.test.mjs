import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(SCRIPT_DIR, "audio-analysis-server.mjs");
const REQUIRED_RUNTIME_FILES = [
  "genre-embedding-infer.py",
  "genre_runtime_contract.py",
  "genre_runtime_models.py",
  "genre_unknown80_rhythm_reranker.py",
  "genre-embedding-macro-specialists.py",
  "genre-embedding-32-benchmark.py",
  "genre_source_family.py",
];

test("the default embedding runtime is reproducible from tracked source files", () => {
  const server = fs.readFileSync(SERVER_PATH, "utf8");
  assert.match(
    server,
    /path\.join\(SCRIPT_DIR, "genre-embedding-infer\.py"\)/,
    "the server default inference entry point changed without updating the readiness contract",
  );
  for (const filename of REQUIRED_RUNTIME_FILES) {
    assert.equal(
      fs.existsSync(path.join(SCRIPT_DIR, filename)),
      true,
      `missing production genre runtime dependency: ${filename}`,
    );
  }
});

test("the runtime contract keeps model metadata out of inference", () => {
  const contract = fs.readFileSync(path.join(SCRIPT_DIR, "genre_runtime_contract.py"), "utf8");
  assert.match(contract, /"metadataUsed": False/);
  assert.match(contract, /"missingFeaturePolicy": "required-source-fails-inference"/);
});
