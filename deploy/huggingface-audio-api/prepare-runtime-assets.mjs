#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
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

export function planByteRanges(totalBytes, partCount) {
  const total = Math.max(0, Math.floor(Number(totalBytes) || 0));
  const count = Math.max(1, Math.min(total || 1, Math.floor(Number(partCount) || 1)));
  const base = Math.floor(total / count);
  const remainder = total % count;
  let start = 0;
  return Array.from({ length: count }, (_, index) => {
    const bytes = base + (index < remainder ? 1 : 0);
    const range = { index, start, end: start + bytes - 1, bytes };
    start += bytes;
    return range;
  });
}

async function downloadSequential(url, archive) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  if (!response.ok || !response.body) throw new Error(`Runtime bundle download failed with HTTP ${response.status}.`);
  const hash = crypto.createHash("sha256");
  const hashStream = new Transform({
    transform(chunk, encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), hashStream, fs.createWriteStream(archive, { mode: 0o600 }));
  return hash.digest("hex");
}

async function concatenateAndHash(parts, archive) {
  const output = fs.createWriteStream(archive, { mode: 0o600 });
  const hash = crypto.createHash("sha256");
  try {
    for (const part of parts) {
      for await (const chunk of fs.createReadStream(part)) {
        hash.update(chunk);
        if (!output.write(chunk)) await once(output, "drain");
      }
      fs.rmSync(part, { force: true });
    }
    output.end();
    await once(output, "close");
    return hash.digest("hex");
  } catch (error) {
    output.destroy();
    throw error;
  }
}

async function downloadParallel(url, archive, tempRoot, requestedParts) {
  const head = await fetch(url, {
    method: "HEAD",
    redirect: "follow",
    signal: AbortSignal.timeout(60 * 1000),
  });
  const totalBytes = Number(head.headers.get("content-length") || 0);
  const acceptsRanges = /bytes/i.test(head.headers.get("accept-ranges") || "");
  if (!head.ok || !acceptsRanges || totalBytes < 128 * 1024 * 1024 || requestedParts < 2) {
    return null;
  }
  const ranges = planByteRanges(totalBytes, requestedParts);
  const parts = ranges.map(range => path.join(tempRoot, `runtime-assets.part-${String(range.index).padStart(2, "0")}`));
  const controller = new AbortController();
  let completed = 0;
  try {
    await Promise.all(ranges.map(async range => {
      const response = await fetch(url, {
        headers: { Range: `bytes=${range.start}-${range.end}` },
        redirect: "follow",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30 * 60 * 1000)]),
      });
      const expectedContentRange = `bytes ${range.start}-${range.end}/`;
      if (response.status !== 206 || !response.body
        || !String(response.headers.get("content-range") || "").startsWith(expectedContentRange)) {
        throw new Error(`Runtime bundle range ${range.index} was not served as requested.`);
      }
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(parts[range.index], { mode: 0o600 }));
      completed += 1;
      process.stdout.write(`${JSON.stringify({
        ok: true,
        phase: "parallel-download",
        partsCompleted: completed,
        partsTotal: ranges.length,
        totalBytes,
      })}\n`);
    }));
    return await concatenateAndHash(parts, archive);
  } catch (error) {
    controller.abort();
    parts.forEach(part => fs.rmSync(part, { force: true }));
    fs.rmSync(archive, { force: true });
    process.stderr.write(`Parallel runtime download failed; retrying sequentially: ${String(error?.message || error)}\n`);
    return null;
  }
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
    const requestedParts = Math.max(1, Math.min(32, Number(process.env.RUNTIME_BUNDLE_PARALLEL_PARTS || 16)));
    const actualSha = await downloadParallel(url, archive, tempRoot, requestedParts)
      || await downloadSequential(url, archive);
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
