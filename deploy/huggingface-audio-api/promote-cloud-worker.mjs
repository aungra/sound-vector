#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const WORKSTATION_PATH = /\/Volumes\/|\/Users\//;
const REMOTE_TARGETS = [
  "/home/aungraphic02/www/wp/sound-form/api/cloud-upstream-url.txt",
  "/home/aungraphic02/musictee-audio-service/deploy/aun-graphic-sound-form/api/cloud-upstream-url.txt",
];

function parseEnv(source) {
  const result = {};
  for (const raw of source.split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

function quote(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function validateCloudEndpoint(endpoint) {
  if (!/^https:\/\/[a-z0-9-]+\.hf\.space\/api\/audio-analyze$/.test(endpoint)) {
    throw new Error("Cloud endpoint must be an HTTPS Hugging Face Space analysis endpoint.");
  }
  return endpoint;
}

export function validateCloudHealth(health) {
  const serialized = JSON.stringify(health);
  if (WORKSTATION_PATH.test(serialized)) throw new Error("Cloud health leaks a workstation or HDD path.");
  const runtime = health?.genreInferenceRuntime || {};
  const dependencies = health?.dependencies || {};
  const promoted = item => item?.available === true && item?.promotion?.promoted === true;
  if (health?.ok !== true
    || dependencies.embeddingGenre !== true
    || dependencies.japaneseVocalEvidence !== true
    || dependencies.classificationScope !== "track"
    || Number(dependencies.trackSampleCount) !== 4
    || Number(dependencies.trackSampleWindowSeconds) !== 30
    || !promoted(runtime.unknown65Reranker)
    || !promoted(runtime.musicFmReranker)
    || !promoted(runtime.trackPairReranker)) {
    throw new Error("Cloud worker does not provide full production inference parity.");
  }
  return true;
}

export function validateParityReport(report) {
  if (report?.passes !== true || Number(report.fixtureCount) < 4
    || Number(report.passedCount) !== Number(report.fixtureCount)
    || report.audioRetained !== false) {
    throw new Error("Cloud shadow parity report has not passed the promotion gate.");
  }
  return true;
}

async function runSftp(commands, config) {
  const args = [
    "-P", config.AUN_SFTP_PORT || "22",
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-b", "-",
  ];
  if (config.AUN_SFTP_IDENTITY_FILE) args.push("-i", config.AUN_SFTP_IDENTITY_FILE);
  args.push(`${config.AUN_SFTP_USER}@${config.AUN_SFTP_HOST}`);
  const child = spawn("/usr/bin/sftp", args, { stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", chunk => { stderr += chunk; });
  child.stdin.end(`${commands.join("\n")}\nquit\n`);
  const status = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (status !== 0) throw new Error(`SFTP failed (${status}): ${stderr.trim().slice(-1000)}`);
}

function valueAfter(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const endpoint = validateCloudEndpoint(valueAfter("--endpoint"));
  const reportPath = valueAfter("--parity-report");
  if (!reportPath) throw new Error("--parity-report is required.");
  const report = JSON.parse(fs.readFileSync(path.resolve(reportPath), "utf8"));
  validateParityReport(report);
  const healthUrl = new URL(endpoint);
  healthUrl.pathname = "/health";
  const healthResponse = await fetch(healthUrl, { signal: AbortSignal.timeout(60000) });
  if (!healthResponse.ok) throw new Error(`Cloud health returned HTTP ${healthResponse.status}.`);
  validateCloudHealth(await healthResponse.json());
  if (!process.argv.includes("--promote")) {
    process.stdout.write(JSON.stringify({ ok: true, promoted: false, endpoint }) + "\n");
    process.exit(0);
  }
  const configPath = valueAfter("--sftp-env")
    || path.join(os.homedir(), "Library", "Application Support", "MUSICTee", ".env.sftp");
  const config = parseEnv(fs.readFileSync(configPath, "utf8"));
  if (!config.AUN_SFTP_HOST || !config.AUN_SFTP_USER) throw new Error("SFTP configuration is incomplete.");
  const local = path.join(os.tmpdir(), `mmfr-cloud-upstream-${process.pid}.txt`);
  fs.writeFileSync(local, `${endpoint}\n`, { mode: 0o600 });
  try {
    const commands = [];
    for (const remote of REMOTE_TARGETS) {
      const temporary = `${remote}.tmp-${process.pid}`;
      commands.push(`put ${quote(local)} ${quote(temporary)}`);
      commands.push(`rename ${quote(temporary)} ${quote(remote)}`);
    }
    await runSftp(commands, config);
  } finally {
    fs.rmSync(local, { force: true });
  }
  process.stdout.write(JSON.stringify({ ok: true, promoted: true, endpoint }) + "\n");
}
