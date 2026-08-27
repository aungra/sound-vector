#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const HOME = os.homedir();
const ROOT = process.env.MMFR_ROOT || path.join(HOME, "Documents", "MUSICTee");
const NODE = process.env.MMFR_NODE || path.join(HOME, ".local", "bin", "node");
const SERVER = path.join(ROOT, "apps", "demo", "scripts", "audio-analysis-server.mjs");
const SFTP_ENV = process.env.MMFR_SFTP_ENV
  || path.join(HOME, "Documents", "AUNgraphic_WEB", ".env.sftp");
const STATE_DIR = process.env.MMFR_STATE_DIR
  || path.join(HOME, "Library", "Application Support", "MUSICTee");
const CLOUDFLARED = process.env.MMFR_CLOUDFLARED
  || path.join(STATE_DIR, "cloudflared");
const REMOTE_API_DIR = process.env.MMFR_REMOTE_API_DIR
  || "/home/aungraphic02/www/wp/sound-form/api";
const PORT = Number(process.env.MMFR_PUBLIC_AUDIO_PORT || 4195);
const HEALTH_URL = `http://127.0.0.1:${PORT}/health`;
const TUNNEL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/g;
const UPSTREAM_REFRESH_MS = Number(process.env.MMFR_UPSTREAM_REFRESH_MS || 120000);
const TUNNEL_HEALTH_MS = Number(process.env.MMFR_TUNNEL_HEALTH_MS || 10000);
const TUNNEL_HEALTH_FAILURE_LIMIT = Number(process.env.MMFR_TUNNEL_HEALTH_FAILURE_LIMIT || 2);

let stopping = false;
let activeChildren = [];

function log(message) {
  process.stdout.write(`[${new Date().toISOString()}] ${message}\n`);
}

function parseEnvFile(filePath) {
  const parsed = {};
  const source = fs.readFileSync(filePath, "utf8");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[match[1]] = value;
  }
  return parsed;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function childExit(child) {
  return new Promise(resolve => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
    child.once("error", error => resolve({ error }));
  });
}

function terminate(child) {
  if (child && child.exitCode === null && !child.killed) child.kill("SIGTERM");
}

async function stopChildren() {
  const children = activeChildren;
  activeChildren = [];
  for (const child of children) terminate(child);
  await Promise.race([
    Promise.all(children.map(childExit)),
    delay(5000),
  ]);
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

async function waitForHealth(child, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (!stopping && Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`analysis server exited (${child.exitCode})`);
    try {
      const response = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2000) });
      if (response.ok && (await response.json()).ok) return;
    } catch {
      // The server may still be loading models.
    }
    await delay(1000);
  }
  throw new Error("analysis server health check timed out");
}

function spawnAnalysisServer() {
  const env = {
    ...process.env,
    PATH: `${path.join(ROOT, ".tools", "bin")}:${path.dirname(NODE)}:/usr/bin:/bin:/usr/sbin:/sbin`,
    MMFR_AUDIO_HOST: "127.0.0.1",
    MMFR_AUDIO_PORT: String(PORT),
    MMFR_PUBLIC_MODE: "1",
    MMFR_ALLOWED_ORIGINS: "https://aun-graphic.jp,https://www.aun-graphic.jp",
    MMFR_PUBLIC_MAX_CONCURRENT: "1",
    // Sakura serializes public requests, so this guards abuse without treating
    // ordinary exhibition retests as one shared four-request visitor.
    MMFR_PUBLIC_RATE_LIMIT: "24",
    MMFR_PUBLIC_RATE_WINDOW_MS: "600000",
    // Three 30-second sections give the genre consensus enough musical context.
    MMFR_ANALYSIS_SECONDS: "90",
    // Keep the proxy connection alive while rich inference is still running.
    MMFR_RESPONSE_HEARTBEAT_MS: "10000",
    MMFR_EMBEDDING_GENRE_ENABLED: "1",
    MMFR_EMBEDDING_GENRE_LIVE_ENABLED: "1",
    MMFR_ENABLE_UNKNOWN80_INDEPENDENT_PAIR_RERANKER: "0",
    MMFR_ENABLE_UNKNOWN80_MUSICFM_RERANKER: "1",
    MMFR_ENABLE_UNKNOWN65_RERANKER: "1",
    MMFR_MUSICFM_PYTHON: "/usr/bin/python3",
    MMFR_UNKNOWN65_PYTHON: "/Users/kahanishimoto/.headroom-codex/env/bin/python3",
    MMFR_LOCAL_GENRE_MODEL_PATH: path.join(ROOT, "genre-training", "genre-model.json"),
  };
  const child = spawn(NODE, [SERVER], {
    cwd: STATE_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  log(`analysis server started (pid ${child.pid})`);
  return child;
}

function spawnTunnel() {
  const child = spawn(CLOUDFLARED, [
    "tunnel",
    "--no-autoupdate",
    "--url",
    `http://127.0.0.1:${PORT}`,
  ], {
    cwd: STATE_DIR,
    env: { ...process.env, PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  log(`Cloudflare tunnel started (pid ${child.pid})`);
  return child;
}

function waitForTunnelUrl(child, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => finish(new Error("Cloudflare tunnel URL timed out")), timeoutMs);
    const onData = chunk => {
      const text = chunk.toString();
      process.stderr.write(text);
      buffer = `${buffer}${text}`.slice(-20000);
      const matches = buffer.match(TUNNEL_PATTERN);
      if (matches?.length) finish(null, matches[matches.length - 1]);
    };
    const onExit = (code, signal) => finish(new Error(`Cloudflare tunnel exited (${code ?? signal})`));
    const finish = (error, url) => {
      clearTimeout(timer);
      child.stdout.off("data", onData);
      child.stderr.off("data", onData);
      child.off("exit", onExit);
      if (error) {
        reject(error);
      } else {
        child.stdout.pipe(process.stdout);
        child.stderr.pipe(process.stderr);
        resolve(url);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", onExit);
  });
}

function quoteSftp(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

async function uploadUpstream(endpoint) {
  const config = parseEnvFile(SFTP_ENV);
  const host = config.AUN_SFTP_HOST;
  const user = config.AUN_SFTP_USER;
  const port = config.AUN_SFTP_PORT || "22";
  const identity = config.AUN_SFTP_IDENTITY_FILE || "";
  if (!host || !user) throw new Error("SFTP host or user is missing");

  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  const localFile = path.join(STATE_DIR, "upstream-url.txt");
  const remoteFile = `${REMOTE_API_DIR}/upstream-url.txt`;
  const remoteTemp = `${remoteFile}.tmp-${process.pid}`;
  fs.writeFileSync(localFile, `${endpoint}\n`, { mode: 0o600 });

  const args = [
    "-P", String(port),
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-b", "-",
  ];
  if (identity) args.push("-i", identity);
  args.push(`${user}@${host}`);
  const child = spawn("/usr/bin/sftp", args, { stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", chunk => { stderr += chunk.toString(); });
  child.stdin.end([
    `put ${quoteSftp(localFile)} ${quoteSftp(remoteTemp)}`,
    `rename ${quoteSftp(remoteTemp)} ${quoteSftp(remoteFile)}`,
    "quit",
    "",
  ].join("\n"));
  const result = await childExit(child);
  if (result.error || result.code !== 0) {
    throw result.error || new Error(`SFTP sync failed (${result.code}): ${stderr.trim().slice(-500)}`);
  }
}

async function syncWithRetry(endpoint, tunnel) {
  let attempt = 0;
  while (!stopping && tunnel.exitCode === null) {
    try {
      await uploadUpstream(endpoint);
      log(`public upstream synchronized: ${endpoint}`);
      return;
    } catch (error) {
      attempt += 1;
      const waitMs = Math.min(60000, 2000 * (2 ** Math.min(attempt - 1, 5)));
      log(`upstream sync failed; retrying in ${waitMs / 1000}s: ${error.message}`);
      await delay(waitMs);
    }
  }
  throw new Error("tunnel stopped before upstream synchronization");
}

async function keepUpstreamFresh(endpoint, tunnel) {
  while (!stopping && tunnel.exitCode === null) {
    await delay(UPSTREAM_REFRESH_MS);
    if (stopping || tunnel.exitCode !== null) return;
    try {
      await uploadUpstream(endpoint);
      log("public upstream heartbeat synchronized");
    } catch (error) {
      log(`public upstream heartbeat failed: ${error.message}`);
    }
  }
}

async function monitorTunnelHealth(endpoint, tunnel) {
  const healthEndpoint = new URL("/health", endpoint).toString();
  let failures = 0;
  while (!stopping && tunnel.exitCode === null) {
    await delay(TUNNEL_HEALTH_MS);
    if (stopping || tunnel.exitCode !== null) return;
    try {
      const response = await fetch(healthEndpoint, { signal: AbortSignal.timeout(4000) });
      const payload = response.ok ? await response.json().catch(() => ({})) : {};
      if (!response.ok || payload.ok !== true) throw new Error(`HTTP ${response.status}`);
      failures = 0;
    } catch (error) {
      failures += 1;
      log(`public tunnel health failed (${failures}/${TUNNEL_HEALTH_FAILURE_LIMIT}): ${error.message}`);
      if (failures >= TUNNEL_HEALTH_FAILURE_LIMIT) {
        log("public tunnel is stale; requesting automatic replacement");
        terminate(tunnel);
        return;
      }
    }
  }
}

async function runGeneration() {
  const server = spawnAnalysisServer();
  activeChildren = [server];
  await waitForHealth(server);
  log("analysis server is healthy");

  const tunnel = spawnTunnel();
  activeChildren.push(tunnel);
  const baseUrl = await Promise.race([
    waitForTunnelUrl(tunnel),
    childExit(server).then(exit => {
      throw new Error(`analysis server exited (${exit.code ?? exit.signal ?? exit.error?.message})`);
    }),
  ]);
  const endpoint = `${baseUrl}/api/audio-analyze`;
  await syncWithRetry(endpoint, tunnel);
  void keepUpstreamFresh(endpoint, tunnel);
  void monitorTunnelHealth(endpoint, tunnel);

  const result = await Promise.race([
    childExit(server).then(exit => ({ name: "analysis server", exit })),
    childExit(tunnel).then(exit => ({ name: "Cloudflare tunnel", exit })),
  ]);
  throw new Error(`${result.name} stopped (${result.exit.code ?? result.exit.signal ?? result.exit.error?.message})`);
}

async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  for (const requiredPath of [NODE, SERVER, CLOUDFLARED, SFTP_ENV]) {
    if (!fs.existsSync(requiredPath)) throw new Error(`required path is missing: ${requiredPath}`);
  }
  let failures = 0;
  while (!stopping) {
    try {
      await runGeneration();
      failures = 0;
    } catch (error) {
      if (!stopping) log(error.message);
      failures += 1;
    } finally {
      await stopChildren();
    }
    if (!stopping) {
      const waitMs = Math.min(60000, 2000 * (2 ** Math.min(failures - 1, 5)));
      log(`restarting public audio services in ${waitMs / 1000}s`);
      await delay(waitMs);
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    log(`${signal} received; stopping`);
    void stopChildren();
  });
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
