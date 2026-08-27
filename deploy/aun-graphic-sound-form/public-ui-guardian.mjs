import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const APP_SUPPORT = path.join(os.homedir(), "Library", "Application Support", "MUSICTee");
const RELEASE_PATH = process.env.MMFR_UI_RELEASE_PATH
  || path.join(APP_SUPPORT, "ui-release", "index.html");
const RELEASE_HASH_PATH = process.env.MMFR_UI_RELEASE_HASH_PATH || `${RELEASE_PATH}.sha256`;
const SFTP_CONFIG_PATH = process.env.MMFR_SFTP_ENV || path.join(APP_SUPPORT, ".env.sftp");
const SITE_URL = process.env.MMFR_UI_SITE_URL || "https://aun-graphic.jp/sound-form/";
const CHECK_INTERVAL_MS = Number(process.env.MMFR_UI_CHECK_INTERVAL_MS || 30000);
const MISMATCH_LIMIT = Math.max(1, Number(process.env.MMFR_UI_MISMATCH_LIMIT || 2));
const REMOTE_TARGETS = [
  "/home/aungraphic02/www/wp/sound-form/index.html",
  "/home/aungraphic02/musictee-audio-service/apps/demo/MUSIC MEMORY FITTING ROOM.html"
];

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function parseEnv(source) {
  const result = {};
  for (const raw of source.split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[match[1]] = value;
  }
  return result;
}

export function validateRelease(source, expectedHash) {
  const actualHash = sha256(source);
  if (actualHash !== expectedHash) {
    throw new Error(`release hash mismatch: expected ${expectedHash}, received ${actualHash}`);
  }
  if (!source.includes('<p class="simple-intro">SOUND FORMは')
    || !source.includes('class="simple-conversion"')
    || !source.includes("hasRichAnalysisParity")
    || source.includes("簡易解析の低信頼結果は表示せず")) {
    throw new Error("release does not contain the approved simple interface safeguards");
  }
  return actualHash;
}

function quote(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function log(message) {
  process.stdout.write(`[${new Date().toISOString()}] ${message}\n`);
}

async function runSftp(commands, config) {
  const args = [
    "-P", config.AUN_SFTP_PORT || "22",
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-b", "-"
  ];
  if (config.AUN_SFTP_IDENTITY_FILE) args.push("-i", config.AUN_SFTP_IDENTITY_FILE);
  args.push(`${config.AUN_SFTP_USER}@${config.AUN_SFTP_HOST}`);
  const child = spawn("/usr/bin/sftp", args, { stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", chunk => { stderr += chunk; });
  child.stdin.end(`${commands.join("\n")}\nquit\n`);
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (code !== 0) throw new Error(`SFTP failed (${code}): ${stderr.trim().slice(-1000)}`);
}

async function publicHash() {
  const url = new URL(SITE_URL);
  url.searchParams.set("ui-guardian", Date.now().toString());
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`public UI returned HTTP ${response.status}`);
  return sha256(Buffer.from(await response.arrayBuffer()));
}

async function restoreRelease(source, expectedHash) {
  const config = parseEnv(fs.readFileSync(SFTP_CONFIG_PATH, "utf8"));
  if (!config.AUN_SFTP_HOST || !config.AUN_SFTP_USER) throw new Error("SFTP host or user is missing");
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const backupDir = path.join(APP_SUPPORT, "backups", "public-ui-guardian", stamp);
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const commands = [];
  const verificationFiles = [];
  for (const [index, remote] of REMOTE_TARGETS.entries()) {
    const backup = path.join(backupDir, `${index}-previous.html`);
    const verification = path.join(backupDir, `${index}-verify.html`);
    const temporary = `${remote}.guardian-${process.pid}`;
    verificationFiles.push(verification);
    commands.push(`get ${quote(remote)} ${quote(backup)}`);
    commands.push(`put ${quote(RELEASE_PATH)} ${quote(temporary)}`);
    commands.push(`rename ${quote(temporary)} ${quote(remote)}`);
    commands.push(`get ${quote(remote)} ${quote(verification)}`);
  }
  await runSftp(commands, config);
  for (const verification of verificationFiles) {
    validateRelease(fs.readFileSync(verification), expectedHash);
  }
  log(`restored approved UI ${expectedHash}; previous copies saved in ${backupDir}`);
}

export async function checkOnce({ restore = true } = {}) {
  const source = fs.readFileSync(RELEASE_PATH);
  const expectedHash = fs.readFileSync(RELEASE_HASH_PATH, "utf8").trim().split(/\s+/)[0];
  validateRelease(source, expectedHash);
  const actualHash = await publicHash();
  if (actualHash === expectedHash) return { ok: true, expectedHash, actualHash };
  if (restore) await restoreRelease(source, expectedHash);
  return { ok: false, expectedHash, actualHash, restored: restore };
}

async function main() {
  const once = process.argv.includes("--once");
  let mismatches = 0;
  while (true) {
    try {
      const result = await checkOnce({ restore: once || mismatches + 1 >= MISMATCH_LIMIT });
      if (result.ok) {
        if (mismatches) log(`public UI returned to approved release ${result.expectedHash}`);
        mismatches = 0;
      } else if (result.restored) {
        mismatches = 0;
      } else {
        mismatches += 1;
        log(`public UI drift detected (${mismatches}/${MISMATCH_LIMIT}): ${result.actualHash}`);
      }
    } catch (error) {
      log(`check failed without changing production: ${error.message}`);
    }
    if (once) return;
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS));
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
