import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../..");
const configPath = process.argv[2]
  || path.join(os.homedir(), "Library", "Application Support", "MUSICTee", ".env.sftp");
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const backupDir = path.join(os.tmpdir(), `sound-form-ui-backup-${stamp}`);

const interfaceHtml = path.join(ROOT, "apps", "demo", "MUSIC MEMORY FITTING ROOM.html");
const copyEditorHtml = path.join(ROOT, "apps", "demo", "copy-editor.html");
const APPROVED_INTERFACE_SHA256 = "eea21276489629c5c06905143f44e83ec89523d79be65ac03bcf32759130e3c1";
const APPROVED_COPY_EDITOR_SHA256 = "f936539dedef7d75034b0972b8374e7dd24ffd0e7753fe77cc76be8da453d886";
const mappings = [
  {
    local: interfaceHtml,
    remote: "/home/aungraphic02/www/wp/sound-form/index.html"
  },
  {
    local: copyEditorHtml,
    remote: "/home/aungraphic02/www/wp/sound-form/copy-editor.html"
  },
  {
    local: interfaceHtml,
    remote: "/home/aungraphic02/musictee-audio-service/apps/demo/MUSIC MEMORY FITTING ROOM.html"
  },
  {
    local: copyEditorHtml,
    remote: "/home/aungraphic02/musictee-audio-service/apps/demo/copy-editor.html"
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

for (const mapping of mappings) {
  if (!fs.existsSync(mapping.local)) throw new Error(`Missing deploy input: ${mapping.local}`);
}

const interfaceSource = fs.readFileSync(interfaceHtml, "utf8");
if (sha256(interfaceHtml) !== APPROVED_INTERFACE_SHA256
  || !interfaceSource.includes('<p class="simple-intro">SOUND FORMは')
  || !interfaceSource.includes('class="simple-conversion"')
  || !interfaceSource.includes('reliableExternalRapPromotion?.applies')) {
  throw new Error("Refusing to deploy: the approved simple SOUND FORM interface was not found");
}

const copyEditorSource = fs.readFileSync(copyEditorHtml, "utf8");
if (sha256(copyEditorHtml) !== APPROVED_COPY_EDITOR_SHA256
  || !copyEditorSource.includes("SOUND FORM / Copy editor")
  || !copyEditorSource.includes('["H03", "紹介文"')) {
  throw new Error("Refusing to deploy: the SOUND FORM copy editor was not found");
}

const config = parseEnv(configPath);
if (!config.AUN_SFTP_HOST || !config.AUN_SFTP_USER) {
  throw new Error("SFTP host or user is missing");
}

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
  const basename = path.basename(mapping.remote).replaceAll(" ", "-");
  const backup = path.join(backupDir, `${index}-${basename}`);
  const verification = path.join(backupDir, `${index}-${basename}.verify`);
  const temporary = `${mapping.remote}.tmp-${process.pid}`;
  const remoteBackup = `${mapping.remote}.bak-${stamp}`;
  verificationFiles.push(verification);
  commands.push(`get ${quote(mapping.remote)} ${quote(backup)}`);
  commands.push(`put ${quote(backup)} ${quote(remoteBackup)}`);
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
process.stdout.write(`Local backups: ${backupDir}\n`);
process.stdout.write(`Remote backup suffix: .bak-${stamp}\n`);
