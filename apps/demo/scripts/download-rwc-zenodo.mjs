import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const RECORD_ID = process.env.MMFR_RWC_ZENODO_RECORD_ID || "18656623";
const FILE_KEY = process.env.MMFR_RWC_FILE_KEY || "RWC-G.zip";
const TOTAL_BYTES = Number(process.env.MMFR_RWC_TOTAL_BYTES || 3933055195);
const EXPECTED_MD5 = process.env.MMFR_RWC_EXPECTED_MD5 || "e78cddfb6fa639bcb6a61ad873f3cceb";
const RWC_DIR = process.env.MMFR_RWC_DOWNLOAD_DIR || "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data/rwc";
const ZIP_PATH = path.join(RWC_DIR, FILE_KEY);
const PART_DIR = path.join(RWC_DIR, `${FILE_KEY}.parts`);
const URL = `https://zenodo.org/api/records/${RECORD_ID}/files/${encodeURIComponent(FILE_KEY)}/content`;
const CHUNK_BYTES = Math.max(1024 * 1024, Number(process.env.MMFR_RWC_CHUNK_BYTES || 67108864));
const PARALLEL = Math.max(1, Number(process.env.MMFR_RWC_PARALLEL || 8));
const MAX_ATTEMPTS = Math.max(1, Number(process.env.MMFR_RWC_MAX_ATTEMPTS || 40));

function mkdirp(dirname) {
  fs.mkdirSync(dirname, { recursive: true });
}

function partPath(index) {
  return path.join(PART_DIR, `part-${String(index).padStart(4, "0")}`);
}

function fileSize(pathname) {
  try {
    return fs.statSync(pathname).size;
  } catch {
    return 0;
  }
}

function chunks() {
  const out = [];
  let index = 0;
  for (let start = 0; start < TOTAL_BYTES; start += CHUNK_BYTES) {
    const end = Math.min(TOTAL_BYTES - 1, start + CHUNK_BYTES - 1);
    out.push({ index, start, end, size: end - start + 1 });
    index += 1;
  }
  return out;
}

function requestRange(start, end, destination, append) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destination, { flags: append ? "a" : "w" });
    const args = [
      "-sS",
      "-L",
      "-f",
      "--retry", "10",
      "--retry-delay", "10",
      "--retry-all-errors",
      "-r", `${start}-${end}`,
      URL
    ];
    const child = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stdout.pipe(output);
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });
    child.on("error", error => {
      output.destroy();
      reject(error);
    });
    child.on("close", code => {
      output.end();
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `curl exited ${code}`));
    });
  });
}

async function downloadChunk(chunk) {
  const pathname = partPath(chunk.index);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const current = fileSize(pathname);
    if (current === chunk.size) return { ok: true, skipped: attempt === 1 };
    if (current > chunk.size) fs.truncateSync(pathname, 0);
    const resumeStart = chunk.start + fileSize(pathname);
    const append = fileSize(pathname) > 0;
    try {
      await requestRange(resumeStart, chunk.end, pathname, append);
    } catch {
      await new Promise(resolve => setTimeout(resolve, Math.min(15000, 1000 * attempt)));
    }
  }
  const current = fileSize(pathname);
  if (current === chunk.size) return { ok: true, skipped: false };
  return { ok: false, current, expected: chunk.size };
}

function progress(allChunks) {
  let bytes = 0;
  let done = 0;
  for (const chunk of allChunks) {
    const current = Math.min(fileSize(partPath(chunk.index)), chunk.size);
    bytes += current;
    if (current === chunk.size) done += 1;
  }
  return { bytes, done, total: allChunks.length, percent: bytes / TOTAL_BYTES * 100 };
}

async function runPool(items, worker, allChunks) {
  let cursor = 0;
  const failures = [];
  async function runOne() {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      const result = await worker(item);
      const p = progress(allChunks);
      process.stdout.write(`chunk ${String(item.index).padStart(4, "0")} ${result.ok ? "ok" : "failed"} | ${p.done}/${p.total} chunks | ${p.percent.toFixed(1)}%\n`);
      if (!result.ok) failures.push({ item, result });
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, runOne));
  return failures;
}

function md5(pathname) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const input = fs.createReadStream(pathname);
    input.on("data", chunk => hash.update(chunk));
    input.on("error", reject);
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

function combine(allChunks) {
  const fd = fs.openSync(ZIP_PATH, "w");
  try {
    for (const chunk of allChunks) {
      const pathname = partPath(chunk.index);
      if (fileSize(pathname) !== chunk.size) throw new Error(`Incomplete part ${chunk.index}`);
      const input = fs.openSync(pathname, "r");
      try {
        const buffer = Buffer.allocUnsafe(1024 * 1024);
        let bytesRead = 0;
        while ((bytesRead = fs.readSync(input, buffer, 0, buffer.length, null)) > 0) {
          fs.writeSync(fd, buffer, 0, bytesRead);
        }
      } finally {
        fs.closeSync(input);
      }
    }
  } finally {
    fs.closeSync(fd);
  }
}

mkdirp(RWC_DIR);
mkdirp(PART_DIR);

const allChunks = chunks();
const initial = progress(allChunks);
console.log(`${FILE_KEY} ranged download`);
console.log(`target=${ZIP_PATH}`);
console.log(`url=${URL}`);
console.log(`chunks=${allChunks.length} parallel=${PARALLEL} progress=${initial.percent.toFixed(1)}%`);

const pending = allChunks.filter(chunk => fileSize(partPath(chunk.index)) !== chunk.size);
const failures = await runPool(pending, downloadChunk, allChunks);
const after = progress(allChunks);
console.log(`downloaded=${after.bytes}/${TOTAL_BYTES} (${after.percent.toFixed(1)}%)`);

if (failures.length) {
  console.log(`Some chunks are still incomplete: ${failures.length}. Run again to resume.`);
  process.exitCode = 2;
} else {
  console.log("Combining chunks...");
  combine(allChunks);
  const actual = await md5(ZIP_PATH);
  console.log(`md5=${actual}`);
  if (EXPECTED_MD5 && actual !== EXPECTED_MD5) {
    console.error(`MD5 mismatch. expected=${EXPECTED_MD5}`);
    process.exitCode = 3;
  } else {
    console.log("MD5 OK.");
  }
}
