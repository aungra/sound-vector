import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseEnv, sha256, validateRelease } from "./public-ui-guardian.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../..");
const HTML_PATH = path.join(ROOT, "apps", "demo", "MUSIC MEMORY FITTING ROOM.html");

test("accepts only the pinned simple UI release", () => {
  const source = fs.readFileSync(HTML_PATH);
  const hash = sha256(source);
  assert.equal(validateRelease(source, hash), hash);
  assert.throws(() => validateRelease(Buffer.from("<header class=\"interface-header\"></header>"), hash));
});

test("reads the existing SFTP environment format", () => {
  assert.deepEqual(parseEnv("AUN_SFTP_HOST=example.test\nAUN_SFTP_USER='deploy'\n"), {
    AUN_SFTP_HOST: "example.test",
    AUN_SFTP_USER: "deploy"
  });
});
