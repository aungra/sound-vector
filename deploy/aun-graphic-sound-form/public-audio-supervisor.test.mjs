import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const supervisorPath = fileURLToPath(new URL("./public-audio-supervisor.mjs", import.meta.url));

test("replaces a tunnel that stays alive while its public health check fails", () => {
  const source = fs.readFileSync(supervisorPath, "utf8");
  assert.match(source, /MMFR_TUNNEL_HEALTH_MS \|\| 10000/);
  assert.match(source, /MMFR_TUNNEL_HEALTH_FAILURE_LIMIT \|\| 2/);
  assert.match(source, /MMFR_TUNNEL_BUSY_FAILURE_LIMIT \|\| 20/);
  assert.match(source, /const healthEndpoint = new URL\("\/health", endpoint\)\.toString\(\)/);
  assert.match(source, /analysisServerBusy[\s\S]*?const failureLimit = analysisServerBusy \? TUNNEL_BUSY_FAILURE_LIMIT : TUNNEL_HEALTH_FAILURE_LIMIT/);
  assert.match(source, /if \(failures >= failureLimit\) \{[\s\S]*?terminate\(tunnel\)/);
  assert.match(source, /void monitorTunnelHealth\(endpoint, tunnel, server\)/);
});

test("keeps the production embedding classifier enabled after a supervised restart", () => {
  const source = fs.readFileSync(supervisorPath, "utf8");
  assert.match(source, /MMFR_EMBEDDING_GENRE_ENABLED: "1"/);
  assert.match(source, /MMFR_EMBEDDING_GENRE_LIVE_ENABLED: "1"/);
  assert.doesNotMatch(source, /path\.join\(ROOT, "disabled", "embedding-model\.pkl"\)/);
});
