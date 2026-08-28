#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function validateBundleUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Runtime bundle URL must be credential-free HTTPS.");
  }
  return url;
}

export function validateBundleSha(value) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("Runtime bundle SHA-256 is invalid.");
  return value;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const destination = path.resolve(process.env.MMFR_RUNTIME_ASSET_ROOT || "/app/runtime-assets");
  const manifest = path.join(destination, "runtime-assets.manifest.json");
  if (fs.existsSync(manifest)) {
    process.stdout.write(JSON.stringify({ ok: true, downloaded: false, destination }) + "\n");
    process.exit(0);
  }

  const url = validateBundleUrl(process.env.RUNTIME_BUNDLE_URL || "");
  const expectedSha = validateBundleSha(process.env.RUNTIME_BUNDLE_SHA256 || "");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mmfr-runtime-assets-"));
  const archive = path.join(tempRoot, "runtime-assets.tar.gz");
  const stage = path.join(tempRoot, "stage");
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error(`Runtime bundle download failed with HTTP ${response.status}.`);
    const hash = crypto.createHash("sha256");
    const hashStream = new Transform({
      transform(chunk, encoding, callback) {
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body), hashStream, fs.createWriteStream(archive, { mode: 0o600 }));
    const actualSha = hash.digest("hex");
    if (actualSha !== expectedSha) throw new Error(`Runtime bundle SHA mismatch: ${actualSha}`);
    fs.mkdirSync(stage, { recursive: true });
    const extracted = spawnSync("tar", ["-xzf", archive, "-C", stage], { encoding: "utf8" });
    if (extracted.status !== 0) throw new Error(`Runtime bundle extraction failed: ${String(extracted.stderr || "").slice(-500)}`);
    if (!fs.existsSync(path.join(stage, "runtime-assets.manifest.json"))) {
      throw new Error("Runtime bundle manifest is absent after extraction.");
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.rmSync(destination, { recursive: true, force: true });
    fs.renameSync(stage, destination);
    process.stdout.write(JSON.stringify({ ok: true, downloaded: true, destination, sha256: actualSha }) + "\n");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}
