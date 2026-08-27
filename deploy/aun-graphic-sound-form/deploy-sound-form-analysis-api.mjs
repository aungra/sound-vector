import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readAndVerifyProductionRuntime } from "./analysis-runtime-integrity.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const configPath = process.argv.slice(2).find(value => !value.startsWith("--"))
  || path.join(os.homedir(), "Library", "Application Support", "MUSICTee", ".env.sftp");
const confirmed = process.argv.includes("--confirm-analysis-api");
const audioAnalyzePhp = path.join(SCRIPT_DIR, "api", "audio-analyze.php");
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const backupDir = path.join(os.tmpdir(), `sound-form-analysis-api-backup-${stamp}`);
const mappings = [
  {
    local: audioAnalyzePhp,
    remote: "/home/aungraphic02/musictee-audio-service/deploy/aun-graphic-sound-form/api/audio-analyze.php"
  },
  {
    local: audioAnalyzePhp,
    remote: "/home/aungraphic02/www/wp/sound-form/api/audio-analyze.php"
  }
];

function parseEnv(file) {
  const result = {};
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[match[1]] = value;
  }
  return result;
}

function quote(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const source = fs.readFileSync(audioAnalyzePhp, "utf8");
const requiredRevision = source.match(/const REQUIRED_CLIENT_INFERENCE_REVISION = '([^']+)'/)?.[1] || "";
const approvedRevision = process.env.MMFR_APPROVED_ANALYSIS_REVISION || "";
if (!confirmed || !requiredRevision || approvedRevision !== requiredRevision) {
  throw new Error(
    "Refusing analysis API deployment. Pass --confirm-analysis-api and set "
    + `MMFR_APPROVED_ANALYSIS_REVISION=${requiredRevision || "<required revision>"}.`
  );
}
if (source.includes("MUSIC MEMORY FITTING ROOM.html") || source.includes("genre-model.json")) {
  throw new Error("Refusing analysis API deployment: the proxy unexpectedly references UI or model artifacts");
}
const runtime = await readAndVerifyProductionRuntime();
process.stdout.write(`Verified analysis runtime: ${runtime.runtimeRevision} / ${runtime.modelCount} locked models\n`);

const config = parseEnv(configPath);
if (!config.AUN_SFTP_HOST || !config.AUN_SFTP_USER) throw new Error("SFTP host or user is missing");
fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });

const args = [
  "-P", config.AUN_SFTP_PORT || "22",
  "-o", "BatchMode=yes",
  "-o", "StrictHostKeyChecking=accept-new",
  "-b", "-"
];
if (config.AUN_SFTP_IDENTITY_FILE) args.push("-i", config.AUN_SFTP_IDENTITY_FILE);
args.push(`${config.AUN_SFTP_USER}@${config.AUN_SFTP_HOST}`);

const commands = [];
const verificationFiles = [];
mappings.forEach((mapping, index) => {
  const backup = path.join(backupDir, `${index}-audio-analyze.php`);
  const verification = path.join(backupDir, `${index}-audio-analyze.verify.php`);
  const temporary = `${mapping.remote}.tmp-${process.pid}`;
  verificationFiles.push(verification);
  commands.push(`get ${quote(mapping.remote)} ${quote(backup)}`);
  commands.push(`put ${quote(mapping.local)} ${quote(temporary)}`);
  commands.push(`rename ${quote(temporary)} ${quote(mapping.remote)}`);
  commands.push(`get ${quote(mapping.remote)} ${quote(verification)}`);
});
commands.push("quit", "");

const child = spawn("/usr/bin/sftp", args, { stdio: ["pipe", "pipe", "pipe"] });
let stderr = "";
child.stderr.on("data", chunk => { stderr += chunk; });
child.stdin.end(commands.join("\n"));
const code = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", resolve);
});
if (code !== 0) throw new Error(`SFTP failed (${code}): ${stderr.trim().slice(-1200)}`);

mappings.forEach((mapping, index) => {
  const expected = sha256(mapping.local);
  const actual = sha256(verificationFiles[index]);
  if (actual !== expected) throw new Error(`SHA mismatch for ${mapping.remote}`);
  process.stdout.write(`${mapping.remote} ${actual}\n`);
});
process.stdout.write(`Analysis API revision: ${requiredRevision}\n`);
process.stdout.write(`Local backups: ${backupDir}\n`);
