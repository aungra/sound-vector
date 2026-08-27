import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../..");
const cliArgs = process.argv.slice(2);
const htmlOnly = cliArgs.includes("--html-only");
const configPath = cliArgs.find(value => !value.startsWith("--"))
  || path.join(os.homedir(), "Library", "Application Support", "MUSICTee", ".env.sftp");

const allMappings = [
  {
    local: path.join(SCRIPT_DIR, ".htaccess"),
    remote: "/home/aungraphic02/www/wp/sound-form/.htaccess"
  },
  {
    local: path.join(SCRIPT_DIR, "api", "genre-feedback.php"),
    remote: "/home/aungraphic02/www/wp/sound-form/api/genre-feedback.php"
  },
  {
    local: path.join(SCRIPT_DIR, "api", "genre-feedback.php"),
    remote: "/home/aungraphic02/musictee-audio-service/deploy/aun-graphic-sound-form/api/genre-feedback.php"
  },
  {
    local: path.join(SCRIPT_DIR, "api", "audio-analyze.php"),
    remote: "/home/aungraphic02/www/wp/sound-form/api/audio-analyze.php"
  },
  {
    local: path.join(SCRIPT_DIR, "api", "audio-analyze.php"),
    remote: "/home/aungraphic02/musictee-audio-service/deploy/aun-graphic-sound-form/api/audio-analyze.php"
  },
  {
    local: path.join(SCRIPT_DIR, "genre-feedback-holdout.json"),
    remote: "/home/aungraphic02/musictee-audio-service/deploy/aun-graphic-sound-form/genre-feedback-holdout.json"
  },
  {
    local: path.join(SCRIPT_DIR, "model-attribution.txt"),
    remote: "/home/aungraphic02/www/wp/sound-form/model-attribution.txt"
  },
  {
    local: path.join(SCRIPT_DIR, "model-attribution.txt"),
    remote: "/home/aungraphic02/musictee-audio-service/deploy/aun-graphic-sound-form/model-attribution.txt"
  }
];
const mappings = htmlOnly ? allMappings.slice(0, 2) : allMappings;

function parseEnv(file) {
  const result = {};
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
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

for (const mapping of mappings) {
  if (!fs.existsSync(mapping.local)) throw new Error(`Missing deploy input: ${mapping.local}`);
}

const config = parseEnv(configPath);
const args = ["-P", config.AUN_SFTP_PORT || "22", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-b", "-"];
if (config.AUN_SFTP_IDENTITY_FILE) args.push("-i", config.AUN_SFTP_IDENTITY_FILE);
args.push(`${config.AUN_SFTP_USER}@${config.AUN_SFTP_HOST}`);

const commands = [
  '-mkdir "/home/aungraphic02/musictee-audio-service/deploy"',
  '-mkdir "/home/aungraphic02/musictee-audio-service/deploy/aun-graphic-sound-form"',
  '-mkdir "/home/aungraphic02/musictee-audio-service/deploy/aun-graphic-sound-form/api"'
];
const downloads = [];
mappings.forEach((mapping, index) => {
  const temporary = `${mapping.remote}.tmp-${process.pid}`;
  const download = path.join(os.tmpdir(), `mmfr-community-deploy-${process.pid}-${index}.verify`);
  downloads.push(download);
  commands.push(`put ${quote(mapping.local)} ${quote(temporary)}`);
  commands.push(`rename ${quote(temporary)} ${quote(mapping.remote)}`);
  commands.push(`get ${quote(mapping.remote)} ${quote(download)}`);
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
if (code !== 0) throw new Error(`SFTP failed (${code}): ${stderr.trim().slice(-800)}`);

mappings.forEach((mapping, index) => {
  const expected = sha256(mapping.local);
  const actual = sha256(downloads[index]);
  if (actual !== expected) throw new Error(`SHA mismatch for ${mapping.remote}`);
  process.stdout.write(`${mapping.remote} ${actual}\n`);
});
