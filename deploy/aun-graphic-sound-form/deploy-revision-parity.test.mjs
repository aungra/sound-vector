import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "../..");

test("production UI and analysis proxy require the same inference revision", () => {
  const html = fs.readFileSync(path.join(root, "apps/demo/MUSIC MEMORY FITTING ROOM.html"), "utf8");
  const php = fs.readFileSync(path.join(scriptDir, "api/audio-analyze.php"), "utf8");
  const uiRevision = html.match(/const GENRE_INFERENCE_REVISION = "([^"]+)"/)?.[1];
  const apiRevision = php.match(/const REQUIRED_CLIENT_INFERENCE_REVISION = '([^']+)'/)?.[1];
  assert.ok(uiRevision);
  assert.equal(apiRevision, uiRevision);
});

test("the UI deploy publishes both copies of the analysis proxy", () => {
  const deploy = fs.readFileSync(path.join(scriptDir, "deploy-sound-form-ui.mjs"), "utf8");
  assert.match(deploy, /www\/wp\/sound-form\/api\/audio-analyze\.php/);
  assert.match(deploy, /musictee-audio-service\/deploy\/aun-graphic-sound-form\/api\/audio-analyze\.php/);
  assert.match(deploy, /interfaceRevision !== apiRevision/);
});

test("the public proxy outlives the production feature pipeline", () => {
  const php = fs.readFileSync(path.join(scriptDir, "api/audio-analyze.php"), "utf8");
  assert.match(php, /set_time_limit\(900\)/);
  assert.match(php, /CURLOPT_TIMEOUT => 900/);
});
