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
    assert.match(fs.readFileSync(path.join(output, "README.md"), "utf8"), /sdk: gradio/);
    assert.ok(fs.existsSync(path.join(output, "deploy/huggingface-audio-api/app.py")));
    assert.ok(fs.existsSync(path.join(output, "apps/demo/scripts/audio-analysis-server.mjs")));
    assert.ok(!fs.existsSync(path.join(output, "runtime-assets")));
    assert.ok(!fs.existsSync(path.join(output, "genre-training/youtube-cookies.txt")));
    const forbidden = [];
    const visit = current => {
      const stat = fs.statSync(current);
      if (stat.isDirectory()) return fs.readdirSync(current).forEach(entry => visit(path.join(current, entry)));
      if (/\.(?:aac|aif|aiff|flac|m4a|mp3|ogg|opus|pkl|wav|webm)$/i.test(current)) forbidden.push(current);
    };
    visit(output);
    assert.deepEqual(forbidden, []);
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});
