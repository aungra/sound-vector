import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../..");

test("production UI and analysis proxy require the same inference revision", () => {
  const html = fs.readFileSync(path.join(ROOT, "apps/demo/MUSIC MEMORY FITTING ROOM.html"), "utf8");
  const php = fs.readFileSync(path.join(SCRIPT_DIR, "api/audio-analyze.php"), "utf8");
  const uiRevision = html.match(/const GENRE_INFERENCE_REVISION = "([^"]+)"/)?.[1];
  const apiRevision = php.match(/const REQUIRED_CLIENT_INFERENCE_REVISION = '([^']+)'/)?.[1];
  assert.ok(uiRevision);
  assert.equal(apiRevision, uiRevision);
});

test("the pinned UI deploy release cannot publish analysis files", () => {
  const html = fs.readFileSync(path.join(ROOT, "apps/demo/MUSIC MEMORY FITTING ROOM.html"), "utf8");
  const deploy = fs.readFileSync(path.join(SCRIPT_DIR, "deploy-sound-form-ui.mjs"), "utf8");
  const actualHash = crypto.createHash("sha256").update(html).digest("hex");
  const approvedHash = deploy.match(/APPROVED_INTERFACE_SHA256 = "([a-f0-9]+)"/)?.[1];
  assert.equal(approvedHash, actualHash);
  assert.match(html, /<p class="simple-intro">SOUND FORMは/);
  assert.match(html, /class="simple-conversion"/);
  assert.match(deploy, /approved simple SOUND FORM release/);
  assert.doesNotMatch(deploy, /audio-analyze\.php/);
  assert.doesNotMatch(deploy, /REQUIRED_CLIENT_INFERENCE_REVISION/);
  assert.doesNotMatch(deploy, /genre-model\.json/);
});

test("analysis API deployment is explicit and cannot publish UI or model files", () => {
  const deploy = fs.readFileSync(path.join(SCRIPT_DIR, "deploy-sound-form-analysis-api.mjs"), "utf8");
  assert.match(deploy, /--confirm-analysis-api/);
  assert.match(deploy, /MMFR_APPROVED_ANALYSIS_REVISION/);
  assert.match(deploy, /readAndVerifyProductionRuntime/);
  assert.match(deploy, /www\/wp\/sound-form\/api\/audio-analyze\.php/);
  assert.match(deploy, /musictee-audio-service\/deploy\/aun-graphic-sound-form\/api\/audio-analyze\.php/);
  assert.doesNotMatch(deploy, /remote: .*index\.html/);
  assert.doesNotMatch(deploy, /remote: .*genre-model\.json/);
});
