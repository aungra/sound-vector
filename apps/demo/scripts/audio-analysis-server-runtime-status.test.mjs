import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("./audio-analysis-server.mjs", import.meta.url));

test("reports the promoted unknown65 stack as the active runtime revision", () => {
  const source = fs.readFileSync(serverPath, "utf8");
  const statusFunction = source.match(
    /function genreInferenceRuntimeStatus\(\) \{[\s\S]*?\n\}/,
  )?.[0] || "";

  assert.match(statusFunction, /const unknown65 = contract\?\.unknown65Reranker \|\| null/);
  assert.match(statusFunction, /const musicFm = contract\?\.musicFmReranker \|\| null/);
  assert.match(
    statusFunction,
    /const runtimeRevision = promotedVersion\(unknown65\)[\s\S]*?\|\| promotedVersion\(musicFm\)/,
  );
  assert.match(statusFunction, /unknown65Reranker: unknown65/);
  assert.match(statusFunction, /musicFmReranker: musicFm/);
});

test("keeps unknown65 stage diagnostics in public analysis results", () => {
  const source = fs.readFileSync(serverPath, "utf8");
  assert.match(source, /unknown65Reranker: parsed\.unknown65Reranker \|\| \{\}/);
});
