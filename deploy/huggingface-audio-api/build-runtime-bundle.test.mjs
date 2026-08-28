import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildRuntimeBundle } from "./build-runtime-bundle.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mmfr-runtime-bundle-"));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(path.join(source, "models", "example"), { recursive: true });
  fs.writeFileSync(path.join(source, "model.pkl"), "classifier");
  fs.writeFileSync(path.join(source, "models", "example", "weights.bin"), "weights");
  const specPath = path.join(root, "spec.json");
  fs.writeFileSync(specPath, JSON.stringify({
    schemaVersion: 1,
    bundleVersion: "fixture-v1",
    assets: [
      { id: "classifier", source: "model.pkl", destination: "classifiers/model.pkl", kind: "file" },
      { id: "model", source: "models/example", destination: "models/example", kind: "directory" },
    ],
  }));
  return { root, source, output, specPath };
}

test("runtime bundle contains only portable destinations and aggregate hashes", () => {
  const item = fixture();
  try {
    const manifest = buildRuntimeBundle({
      specPath: item.specPath,
      sourceRoot: item.source,
      outputRoot: item.output,
    });
    assert.equal(manifest.audioRetained, false);
    assert.equal(manifest.sourcePathsRetained, false);
    assert.equal(manifest.assets.length, 2);
    assert.equal(manifest.totalBytes, 17);
    assert.ok(manifest.assets.every(asset => !JSON.stringify(asset).includes(item.source)));
    assert.equal(fs.readFileSync(path.join(item.output, "classifiers", "model.pkl"), "utf8"), "classifier");
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test("runtime bundle refuses source audio", () => {
  const item = fixture();
  try {
    fs.writeFileSync(path.join(item.source, "models", "example", "training.wav"), "audio");
    assert.throws(() => buildRuntimeBundle({
      specPath: item.specPath,
      sourceRoot: item.source,
      outputRoot: item.output,
    }), /must not contain source audio/);
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});
