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

test("the pinned deploy release is the simple interface", () => {
  const html = fs.readFileSync(path.join(ROOT, "apps/demo/MUSIC MEMORY FITTING ROOM.html"), "utf8");
  const deploy = fs.readFileSync(path.join(SCRIPT_DIR, "deploy-sound-form-ui.mjs"), "utf8");
  const actualHash = crypto.createHash("sha256").update(html).digest("hex");
  const approvedHash = deploy.match(/APPROVED_INTERFACE_SHA256 = "([a-f0-9]+)"/)?.[1];
  assert.equal(approvedHash, actualHash);
  assert.match(html, /<p class="simple-intro">SOUND FORMは/);
  assert.match(html, /class="simple-conversion"/);
  assert.match(deploy, /www\/wp\/sound-form\/api\/audio-analyze\.php/);
  assert.match(deploy, /musictee-audio-service\/deploy\/aun-graphic-sound-form\/api\/audio-analyze\.php/);
  assert.match(deploy, /interfaceRevision !== apiRevision/);
  assert.match(deploy, /approved simple SOUND FORM release/);
});
