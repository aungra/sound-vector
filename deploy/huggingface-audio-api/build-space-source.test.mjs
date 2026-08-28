import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("Gradio Space source contains the portable worker without runtime models", () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "mmfr-space-source-"));
  try {
    const result = spawnSync(
      process.execPath,
      [new URL("./build-space-source.mjs", import.meta.url).pathname, output],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const readme = fs.readFileSync(path.join(output, "README.md"), "utf8");
    assert.match(readme, /sdk: gradio/);
    assert.match(readme, /python_version: "3\.12"/);
    assert.match(
      fs.readFileSync(path.join(output, "requirements.txt"), "utf8"),
      /essentia-tensorflow==2\.1b6\.dev1389/,
    );
    assert.ok(fs.existsSync(path.join(output, "deploy/huggingface-audio-api/app.py")));
    assert.ok(fs.existsSync(path.join(output, "apps/demo/scripts/audio-analysis-server.mjs")));
    assert.ok(fs.existsSync(path.join(output, "apps/demo/scripts/genre_unknown65_runtime.py")));
    assert.ok(!fs.existsSync(path.join(output, "apps/demo/scripts/audio-analysis-public-policy.test.mjs")));
    assert.ok(!fs.existsSync(path.join(output, "apps/demo/MUSIC MEMORY FITTING ROOM.html")));
    assert.ok(!fs.existsSync(path.join(output, "genre-training/dataset-splits.json")));
    assert.ok(!fs.existsSync(path.join(output, "genre-training/genre-model.json")));
    assert.ok(!fs.existsSync(path.join(output, "genre-training/genre-theory-profiles.json")));
    assert.ok(fs.existsSync(path.join(output, "genre-training/unknown65-production-model-manifest.json")));
    assert.ok(!fs.existsSync(path.join(output, "runtime-assets")));
    assert.ok(!fs.existsSync(path.join(output, "genre-training/results.json")));
    assert.ok(!fs.existsSync(path.join(output, "genre-training/youtube-cookies.txt")));
    const forbidden = [];
    const workstationReferences = [];
    let fileCount = 0;
    const visit = current => {
      const stat = fs.statSync(current);
      if (stat.isDirectory()) return fs.readdirSync(current).forEach(entry => visit(path.join(current, entry)));
      fileCount += 1;
      if (/\.(?:aac|aif|aiff|flac|m4a|mp3|ogg|opus|pkl|wav|webm)$/i.test(current)) forbidden.push(current);
      const contents = fs.readFileSync(current, "utf8");
      if (/\/Volumes\/|\/Users\//.test(contents)) workstationReferences.push(current);
    };
    visit(output);
    assert.equal(fileCount, 35);
    assert.deepEqual(forbidden, []);
    assert.deepEqual(workstationReferences, []);
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});
