import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const supervisorPath = fileURLToPath(new URL("./public-audio-supervisor.mjs", import.meta.url));

test("replaces a tunnel that stays alive while its public health check fails", () => {
  const source = fs.readFileSync(supervisorPath, "utf8");
  assert.match(source, /MMFR_TUNNEL_HEALTH_MS \|\| 10000/);
  assert.match(source, /MMFR_TUNNEL_HEALTH_FAILURE_LIMIT \|\| 2/);
  assert.match(source, /const healthEndpoint = new URL\("\/health", endpoint\)\.toString\(\)/);
  assert.match(source, /if \(failures >= TUNNEL_HEALTH_FAILURE_LIMIT\) \{[\s\S]*?terminate\(tunnel\)/);
  assert.match(source, /void monitorTunnelHealth\(endpoint, tunnel\)/);
});

test("keeps the production embedding classifier enabled after a supervised restart", () => {
  const source = fs.readFileSync(supervisorPath, "utf8");
  assert.match(source, /MMFR_EMBEDDING_GENRE_ENABLED: "1"/);
  assert.match(source, /MMFR_EMBEDDING_GENRE_LIVE_ENABLED: "1"/);
  assert.doesNotMatch(source, /path\.join\(ROOT, "disabled", "embedding-model\.pkl"\)/);
});

test("enables only the independently gated unknown65 stack", () => {
  const source = fs.readFileSync(supervisorPath, "utf8");
  assert.match(source, /MMFR_ENABLE_UNKNOWN80_INDEPENDENT_PAIR_RERANKER: "0"/);
  assert.match(source, /MMFR_ENABLE_UNKNOWN80_MUSICFM_RERANKER: "1"/);
  assert.match(source, /MMFR_ENABLE_UNKNOWN65_RERANKER: "1"/);
  assert.match(source, /MMFR_MUSICFM_PYTHON: "\/usr\/bin\/python3"/);
  assert.match(source, /MMFR_UNKNOWN65_PYTHON: "\/Users\/kahanishimoto\/\.headroom-codex\/env\/bin\/python3"/);
});

test("overlaps vocal evidence with embedding while keeping specialists serial", () => {
  const source = fs.readFileSync(supervisorPath, "utf8");
  assert.match(source, /MMFR_PARALLEL_VOCAL_EMBEDDING: "1"/);
  assert.match(source, /MMFR_PARALLEL_SPECIALIST_EXTRACTION: "0"/);
  assert.match(source, /MMFR_ANALYSIS_RESULT_CACHE_MAX: "24"/);
  assert.match(source, /MMFR_ANALYSIS_RESULT_CACHE_TTL_MS: String\(6 \* 60 \* 60 \* 1000\)/);
});
