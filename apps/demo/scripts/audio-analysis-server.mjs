import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  embeddingInferenceAttemptPlan,
  independentPairRerankerPolicy,
  pairwiseRerankerPolicy,
  runEmbeddingInferenceAttempts,
} from "./genre-embedding-runtime-policy.mjs";
import {
  buildTrackPredictionContract,
  planTrackSampleRanges,
  preserveRequestedPcmSketch,
  promoteReliableExternalTrackPrediction,
  summarizeTrackSegmentPredictions,
} from "./genre-track-sampling.mjs";
import { shouldRunUnknownSourceConsensus } from "./genre-unknown-consensus-policy.mjs";
import {
  classifyYouTubeFailure,
  createFixedWindowRateLimiter,
  isAllowedOrigin,
  normalizePublicYouTubeUrl,
  parseAllowedOrigins,
  requestClientAddress,
  YOUTUBE_RETRY_DELAYS_MS,
} from "./audio-analysis-public-policy.mjs";
import { embeddingSegmentArgs } from "./genre-embedding-segment-input.mjs";

const cliArgs = new Set(process.argv.slice(2));
const cliValue = name => {
  const prefix = `${name}=`;
  const entry = process.argv.slice(2).find(value => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : "";
};
const PORT = Number(cliValue("--port") || process.env.MMFR_AUDIO_PORT || 4194);
const HOST = process.env.MMFR_AUDIO_HOST || "127.0.0.1";
const PUBLIC_MODE = process.env.MMFR_PUBLIC_MODE === "1";
const MAX_BYTES = PUBLIC_MODE ? 32 * 1024 : 80 * 1024 * 1024;
const ANALYSIS_WINDOW_SECONDS = Math.max(0, Number(process.env.MMFR_ANALYSIS_SECONDS || 120));
const TRACK_SAMPLE_COUNT = 4;
const TRACK_SAMPLE_WINDOW_SECONDS = 30;
const PUBLIC_ALLOWED_ORIGINS = parseAllowedOrigins(process.env.MMFR_ALLOWED_ORIGINS);
const PUBLIC_MAX_CONCURRENT = Math.max(1, Number(process.env.MMFR_PUBLIC_MAX_CONCURRENT || 1));
const PUBLIC_RATE_LIMIT = Math.max(1, Number(process.env.MMFR_PUBLIC_RATE_LIMIT || 4));
const PUBLIC_RATE_WINDOW_MS = Math.max(1000, Number(process.env.MMFR_PUBLIC_RATE_WINDOW_MS || 10 * 60 * 1000));
const publicRateLimiter = createFixedWindowRateLimiter({
  limit: PUBLIC_RATE_LIMIT,
  windowMs: PUBLIC_RATE_WINDOW_MS,
});
let publicActiveRequests = 0;
const activeYouTubeAnalyses = new Map();
const YOUTUBE_DEADLINE_MS = Math.max(30000, Number(process.env.MMFR_YOUTUBE_DEADLINE_MS || 270000));
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../../..");
const DEMO_HTML_PATH = path.join(ROOT_DIR, "apps", "demo", "MUSIC MEMORY FITTING ROOM.html");
const GENRE_INFERENCE_REVISION = fs.existsSync(DEMO_HTML_PATH)
  ? fs.readFileSync(DEMO_HTML_PATH, "utf8").match(/const GENRE_INFERENCE_REVISION = "([^"]+)"/)?.[1] || "unknown"
  : "unknown";
const LOCAL_BIN = path.join(ROOT_DIR, ".tools", "bin");
const TOOL_PATHS = {
  "yt-dlp": [
    process.env.YT_DLP_PATH,
    path.join(LOCAL_BIN, "yt-dlp-local"),
    path.join(LOCAL_BIN, "yt-dlp"),
    "yt-dlp"
  ].filter(Boolean),
  ffmpeg: [
    process.env.FFMPEG_PATH,
    path.join(LOCAL_BIN, "ffmpeg"),
    "ffmpeg"
  ].filter(Boolean)
};
const DEFAULT_COOKIE_FILE = path.join(ROOT_DIR, "genre-training", "youtube-cookies.txt");
const COOKIE_BROWSERS = (process.env.MMFR_YTDLP_COOKIES_FROM_BROWSER
  || (process.platform === "darwin" ? "chrome,safari,firefox" : "chrome,firefox"))
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);
const COOKIE_FILE = process.env.MMFR_YTDLP_COOKIES_FILE || (fs.existsSync(DEFAULT_COOKIE_FILE) ? DEFAULT_COOKIE_FILE : "");
const YTDLP_SLEEP_REQUESTS = Math.max(0, Number(process.env.MMFR_YTDLP_SLEEP_REQUESTS || 1));
const YTDLP_SLEEP_INTERVAL = Math.max(0, Number(process.env.MMFR_YTDLP_SLEEP_INTERVAL || 1));
const YTDLP_MAX_SLEEP_INTERVAL = Math.max(YTDLP_SLEEP_INTERVAL, Number(process.env.MMFR_YTDLP_MAX_SLEEP_INTERVAL || 3));
const EMBEDDING_GENRE_SCRIPT = process.env.MMFR_EMBEDDING_GENRE_SCRIPT
  || path.join(SCRIPT_DIR, "genre-embedding-infer.py");
const JAPANESE_VOCAL_SCRIPT = process.env.MMFR_JAPANESE_VOCAL_SCRIPT
  || path.join(SCRIPT_DIR, "genre-japanese-vocal-evidence.py");
const EMBEDDING_GENRE_MODEL_PATH = process.env.MMFR_EMBEDDING_GENRE_MODEL_PATH
  || "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/embedding-genre-model.pkl";
const EMBEDDING_GENRE_FALLBACK_MODEL_PATH = process.env.MMFR_EMBEDDING_GENRE_FALLBACK_MODEL_PATH
  || "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/embedding-genre-model.pkl";
const EMBEDDING_GENRE_DISCOGS_HEAD_MODE = process.env.MMFR_EMBEDDING_DISCOGS_HEAD_MODE || "auto";
const EMBEDDING_GENRE_TEST_FAIL_PRIMARY = process.env.NODE_ENV === "test"
  && process.env.MMFR_EMBEDDING_TEST_FAIL_PRIMARY === "1";
const EMBEDDING_GENRE_PYTHON = process.env.MMFR_EMBEDDING_PYTHON
  || "/Users/kahanishimoto/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const EMBEDDING_GENRE_PYTHONPATH = process.env.MMFR_EMBEDDING_PYTHONPATH
  || [
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/python-audio-features",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/python-essentia-tf"
  ].join(":");
const JAPANESE_VOCAL_PYTHONPATH = process.env.MMFR_JAPANESE_VOCAL_PYTHONPATH
  || [
    EMBEDDING_GENRE_PYTHONPATH,
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/japanese-vocal-analysis/python"
  ].join(":");
const JAPANESE_VOCAL_MODEL_PATH = process.env.MMFR_JAPANESE_VOCAL_MODEL_PATH
  || "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/japanese-vocal-analysis/faster-whisper-large-v3-turbo";
const EMBEDDING_GENRE_ENABLED = process.env.MMFR_EMBEDDING_GENRE_ENABLED !== "0";
const EMBEDDING_GENRE_LIVE_ENABLED = cliArgs.has("--embedding-live")
  || process.env.MMFR_EMBEDDING_GENRE_LIVE_ENABLED === "1";
const EMBEDDING_GENRE_CONSENSUS_ENABLED = EMBEDDING_GENRE_LIVE_ENABLED
  && process.env.MMFR_EMBEDDING_GENRE_CONSENSUS_ENABLED !== "0";
// The legacy pairwise bundle regressed on the independent GTZAN outer source
// and contains pair heads that no longer pass the strict source-coverage gate.
// Keep it opt-in until a replacement improves every promotion evaluation.
const EMBEDDING_GENRE_PAIRWISE_RERANKER_POLICY = pairwiseRerankerPolicy(
  process.env.MMFR_ENABLE_UNKNOWN80_RHYTHM_RERANKER,
);
const EMBEDDING_GENRE_PAIRWISE_RERANKER_ENABLED =
  EMBEDDING_GENRE_PAIRWISE_RERANKER_POLICY.enabled;
const EMBEDDING_GENRE_INDEPENDENT_PAIR_RERANKER_POLICY =
  independentPairRerankerPolicy(
    process.env.MMFR_ENABLE_UNKNOWN80_INDEPENDENT_PAIR_RERANKER,
  );
const EMBEDDING_GENRE_INDEPENDENT_PAIR_RERANKER_ENABLED =
  EMBEDDING_GENRE_INDEPENDENT_PAIR_RERANKER_POLICY.enabled;
const LOCAL_SEGMENT_CONSENSUS_ENABLED = process.env.MMFR_LOCAL_SEGMENT_CONSENSUS_ENABLED !== "0";
const LOCAL_GENRE_MODEL_PATH = process.env.MMFR_LOCAL_GENRE_MODEL_PATH
  || path.resolve(SCRIPT_DIR, "../../../genre-training/genre-model.json");
let localGenreRuntimePromise = null;
let embeddingGenreContractCache = null;
let resolvedToolsPromise = null;

function ytDlpBaseArgs() {
  const args = [
    "--use-extractors", "youtube",
    "--socket-timeout", "30",
    "--retries", "2",
    "--fragment-retries", "2",
    "--extractor-retries", "2",
    "--retry-sleep", "http:linear=1:2:3",
    "--retry-sleep", "fragment:linear=1:2:3",
    "--js-runtimes",
    `node:${process.execPath}`,
    "--remote-components",
    "ejs:github"
  ];
  if (YTDLP_SLEEP_REQUESTS > 0) args.push("--sleep-requests", String(YTDLP_SLEEP_REQUESTS));
  if (YTDLP_SLEEP_INTERVAL > 0) args.push("--sleep-interval", String(YTDLP_SLEEP_INTERVAL));
  if (YTDLP_MAX_SLEEP_INTERVAL > 0) args.push("--max-sleep-interval", String(YTDLP_MAX_SLEEP_INTERVAL));
  return args;
}

function ytDlpCookieArgSets() {
  // Public videos should not depend on a signed-in browser session. Trying the
  // anonymous path first also avoids stale cookies triggering YouTube bot checks.
  const sets = [[]];
  if (COOKIE_FILE) sets.push(["--cookies", COOKIE_FILE]);
  // Browser cookie stores can trigger macOS privacy prompts. Use them only when
  // no exported cookie file has been configured.
  if (!COOKIE_FILE) {
    for (const browser of COOKIE_BROWSERS) sets.push(["--cookies-from-browser", browser]);
  }
  return sets;
}

function ytDlpSharedArgs(cookieArgs = []) {
  const args = [
    ...ytDlpBaseArgs(),
    ...cookieArgs
  ];
  return args;
}

async function runYtDlp(command, args, options = {}) {
  const strategies = ytDlpCookieArgSets();
  let lastError = null;
  for (let strategyIndex = 0; strategyIndex < strategies.length; strategyIndex += 1) {
    const cookieArgs = strategies[strategyIndex];
    const strategy = cookieArgs.length ? "cookie" : "anonymous";
    for (let attempt = 0; attempt <= YOUTUBE_RETRY_DELAYS_MS.length; attempt += 1) {
      options.onAttempt?.({ strategy, attempt });
      try {
        const result = await run(command, [...ytDlpSharedArgs(cookieArgs), ...args], options);
        return { ...result, strategy, retryCount: attempt };
      } catch (error) {
        lastError = error;
        const failure = classifyYouTubeFailure(error);
        if (failure.retryable && attempt < YOUTUBE_RETRY_DELAYS_MS.length) {
          await abortableDelay(YOUTUBE_RETRY_DELAYS_MS[attempt], options.signal);
          continue;
        }
        if (strategy === "anonymous" && failure.cookieEligible && strategyIndex + 1 < strategies.length) break;
        error.code = failure.code;
        throw error;
      }
    }
  }
  throw lastError || new Error("yt-dlp failed.");
}

function abortError(message = "解析を中止しました。") {
  const error = new Error(message);
  error.name = "AbortError";
  error.code = "ANALYSIS_CANCELLED";
  return error;
}

function abortableDelay(ms, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener("abort", cancelled);
      resolve();
    }
    function cancelled() {
      clearTimeout(timer);
      reject(abortError());
    }
    signal?.addEventListener("abort", cancelled, { once: true });
  });
}

function legacyYtDlpSharedArgs({ withCookies = true } = {}) {
  const args = [
    "--js-runtimes",
    `node:${process.execPath}`
  ];
  if (!withCookies) return args;
  if (COOKIE_FILE) args.push("--cookies", COOKIE_FILE);
  else if (COOKIE_BROWSERS[0]) args.push("--cookies-from-browser", COOKIE_BROWSERS[0]);
  return args;
}

function sendJson(res, status, data) {
  if (!res.headersSent) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8"
    });
  }
  res.end(JSON.stringify(data, null, 2));
}

function startJsonResponseHeartbeat(res) {
  const intervalMs = Math.max(0, Number(process.env.MMFR_RESPONSE_HEARTBEAT_MS || 0));
  if (!PUBLIC_MODE || intervalMs < 1000) return () => {};
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no"
  });
  const writeHeartbeat = () => {
    if (!res.destroyed && !res.writableEnded) res.write(`${" ".repeat(2048)}\n`);
  };
  writeHeartbeat();
  const timer = setInterval(writeHeartbeat, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

function applyCorsHeaders(req, res) {
  const origin = String(req.headers.origin || "");
  if (!PUBLIC_MODE) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (isAllowedOrigin(origin, PUBLIC_ALLOWED_ORIGINS)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
}

function publicRequestAllowed(req) {
  if (!PUBLIC_MODE) return true;
  if (req.method === "GET" && (req.url === "/" || req.url === "/health" || req.url === "/api/audio-analyze")) return true;
  return isAllowedOrigin(String(req.headers.origin || ""), PUBLIC_ALLOWED_ORIGINS);
}

function isYouTubeRateLimitError(message) {
  return /rate-limited by YouTube|This content isn't available,\s*try again later|try again later\. The current session/i.test(String(message || ""));
}

function isYouTubeCookieError(message) {
  return /Sign in to confirm you.?re not a bot|cookies-from-browser|cookies for the authentication|Operation not permitted: .*Cookies\.binarycookies|could not find firefox cookies database/i.test(String(message || ""));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", chunk => {
      total += chunk.length;
      if (total > MAX_BYTES) {
        reject(new Error("Request body is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { timeoutMs = 180000, signal, onSpawn, ...spawnOptions } = options;
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...spawnOptions });
    onSpawn?.(child);
    const stdout = [];
    const stderr = [];
    let settled = false;
    let cancelled = false;
    const finish = callback => value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      callback(value);
    };
    const cancel = () => {
      if (settled || cancelled) return;
      cancelled = true;
      clearTimeout(timer);
      child.kill("SIGTERM");
      setTimeout(() => { if (!settled) child.kill("SIGKILL"); }, 1500).unref?.();
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      const error = new Error(`${command} timed out.`);
      error.code = "TRANSIENT_NETWORK_ERROR";
      finish(reject)(error);
    }, timeoutMs);
    signal?.addEventListener("abort", cancel, { once: true });
    child.stdout.on("data", chunk => stdout.push(chunk));
    child.stderr.on("data", chunk => stderr.push(chunk));
    child.on("error", finish(reject));
    child.on("close", (code, signal) => {
      const out = Buffer.concat(stdout);
      const err = Buffer.concat(stderr).toString("utf8");
      if (cancelled) finish(reject)(abortError());
      else if (code === 0) finish(resolve)({ stdout: out, stderr: err });
      else finish(reject)(new Error(`${command} failed (${signal ? `signal ${signal}` : code}): ${err.trim()}`));
    });
  });
}

async function commandExists(command) {
  const candidates = TOOL_PATHS[command] || [command];
  const versionArgs = command === "ffmpeg" ? ["-version"] : ["--version"];
  for (const candidate of candidates) {
    try {
      await run(candidate, versionArgs, { timeoutMs: 8000 });
      return candidate;
    } catch {}
  }
  return "";
}

async function resolveTools() {
  if (!resolvedToolsPromise) {
    resolvedToolsPromise = Promise.all([commandExists("yt-dlp"), commandExists("ffmpeg")])
      .then(([ytDlp, ffmpeg]) => ({ ytDlp, ffmpeg }))
      .catch(error => {
        resolvedToolsPromise = null;
        throw error;
      });
  }
  return resolvedToolsPromise;
}

async function commandAvailable(command) {
  try {
    await run(command, ["--version"], { timeoutMs: 8000 });
    return true;
  } catch {
    return false;
  }
}

function embeddingGenreReady() {
  return EMBEDDING_GENRE_ENABLED
    && fs.existsSync(EMBEDDING_GENRE_SCRIPT)
    && fs.existsSync(EMBEDDING_GENRE_MODEL_PATH)
    && fs.existsSync(EMBEDDING_GENRE_PYTHON)
    && embeddingGenreContractStatus().ok;
}

function embeddingGenreContractStatus() {
  if (embeddingGenreContractCache) return embeddingGenreContractCache;
  if (!fs.existsSync(EMBEDDING_GENRE_SCRIPT) || !fs.existsSync(EMBEDDING_GENRE_MODEL_PATH)
    || !fs.existsSync(EMBEDDING_GENRE_PYTHON)) {
    embeddingGenreContractCache = { ok: false, reason: "model-or-runtime-missing" };
    return embeddingGenreContractCache;
  }
  const result = spawnSync(EMBEDDING_GENRE_PYTHON, [
    EMBEDDING_GENRE_SCRIPT,
    "--model-path", EMBEDDING_GENRE_MODEL_PATH,
    "--validate-model"
  ], {
    timeout: 90000,
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONPATH: EMBEDDING_GENRE_PYTHONPATH,
      MMFR_EMBEDDING_INFER_SOURCES: process.env.MMFR_EMBEDDING_INFER_SOURCES || "discogs,librosa"
    }
  });
  const lines = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean);
  let payload = null;
  for (let index = lines.length - 1; index >= 0 && !payload; index -= 1) {
    try { payload = JSON.parse(lines[index]); } catch {}
  }
  embeddingGenreContractCache = result.status === 0 && payload?.ok
    ? { ok: true, ...payload }
    : {
        ok: false,
        reason: "feature-contract-validation-failed",
        error: String(result.stderr || result.error?.message || "unknown").trim().slice(-500)
      };
  return embeddingGenreContractCache;
}

function japaneseVocalEvidenceReady() {
  return EMBEDDING_GENRE_ENABLED
    && fs.existsSync(JAPANESE_VOCAL_SCRIPT)
    && fs.existsSync(EMBEDDING_GENRE_PYTHON)
    && fs.existsSync(JAPANESE_VOCAL_MODEL_PATH);
}

function parseFinalJsonLine(stdout, context) {
  const text = stdout.toString("utf8").trim();
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {}
  }
  throw new Error(`${context} did not return a JSON result.`);
}

async function analyzeJapaneseVocalEvidenceForFile(filePath, options = {}) {
  if (!japaneseVocalEvidenceReady()) return { available: false, reason: "analyzer-not-configured" };
  try {
    const { stdout } = await run(EMBEDDING_GENRE_PYTHON, [
      JAPANESE_VOCAL_SCRIPT,
      "--audio", filePath,
      "--start-seconds", String(Math.max(0, Number(options.startSeconds || 0)))
    ], {
      timeoutMs: 600000,
      env: {
        ...process.env,
        PYTHONPATH: JAPANESE_VOCAL_PYTHONPATH,
        NUMBA_CACHE_DIR: process.env.NUMBA_CACHE_DIR || path.join(os.tmpdir(), "mmfr-numba-cache"),
        MMFR_FFMPEG_PATH: options.ffmpegPath || "",
        MMFR_JAPANESE_VOCAL_MODEL_PATH: JAPANESE_VOCAL_MODEL_PATH
      }
    });
    return parseFinalJsonLine(stdout, "Japanese vocal analysis") || { available: false, reason: "empty-response" };
  } catch (error) {
    return { available: false, reason: `analyzer-failed:${String(error?.message || error || "unknown")}` };
  }
}

async function analyzeEmbeddingGenreForFile(filePath, japaneseVocalEvidence = {}, segmentAudioPaths = [], sampledRanges = []) {
  if (!embeddingGenreReady() || !EMBEDDING_GENRE_LIVE_ENABLED) return null;
  const contract = embeddingGenreContractStatus();
  const attempts = embeddingInferenceAttemptPlan({
    contract,
    primaryModelPath: EMBEDDING_GENRE_MODEL_PATH,
    fallbackModelPath: EMBEDDING_GENRE_FALLBACK_MODEL_PATH,
    headMode: EMBEDDING_GENRE_DISCOGS_HEAD_MODE,
  });
  const result = await runEmbeddingInferenceAttempts(attempts, async attempt => {
    if (EMBEDDING_GENRE_TEST_FAIL_PRIMARY && attempt.role === "primary") {
      throw new Error("simulated primary failure for API integration test");
    }
    const segmentArgs = embeddingSegmentArgs(segmentAudioPaths, sampledRanges);
    const { stdout } = await run(EMBEDDING_GENRE_PYTHON, [
      EMBEDDING_GENRE_SCRIPT,
      "--model-path", attempt.modelPath,
      "--audio", filePath,
      ...segmentArgs,
      "--japanese-vocal-evidence", JSON.stringify(japaneseVocalEvidence || {})
    ], {
      timeoutMs: 240000,
      env: {
        ...process.env,
        PYTHONPATH: EMBEDDING_GENRE_PYTHONPATH,
        // Loading all TensorFlow genre heads together has caused native
        // crashes on Apple Silicon. Discogs + librosa has compatible fitted
        // members and keeps the MTG head opt-in for controlled benchmarks.
        MMFR_EMBEDDING_INFER_SOURCES: process.env.MMFR_EMBEDDING_INFER_SOURCES || "discogs,librosa",
        MMFR_ESSENTIA_DISCOGS_HEAD: attempt.discogsHead ? "1" : "0",
        MMFR_ENABLE_UNKNOWN80_RHYTHM_RERANKER:
          EMBEDDING_GENRE_PAIRWISE_RERANKER_ENABLED ? "1" : "0",
        MMFR_ENABLE_UNKNOWN80_INDEPENDENT_PAIR_RERANKER:
          EMBEDDING_GENRE_INDEPENDENT_PAIR_RERANKER_ENABLED ? "1" : "0"
      }
    });
    const parsed = parseFinalJsonLine(stdout, "Embedding genre inference");
    if (!parsed?.ok) throw new Error(parsed?.error || "Embedding genre inference returned ok:false");
    return parsed;
  });
  if (result.ok) {
    const parsed = result.value;
    return {
      source: parsed.source || "embedding-genre-model",
      method: parsed.method || "",
      macro: Array.isArray(parsed.macro) ? parsed.macro : [],
      top: Array.isArray(parsed.top) ? parsed.top : [],
      inferredGenre: parsed.inferredGenre || parsed.top?.[0]?.label || "",
      confidence: Number(parsed.confidence || 0),
      rawConfidence: Number(parsed.rawConfidence || 0),
      margin: Number(parsed.margin || 0),
      selectiveCertainty: Number(parsed.selectiveCertainty || 0),
      selectiveRisk: parsed.selectiveRisk || {},
      needsReview: Boolean(parsed.needsReview),
      modelVersion: parsed.modelVersion || "",
      evidenceCoverage: Number(parsed.evidenceCoverage || 0),
      runtimeFeatureContractSha256: parsed.runtimeFeatureContractSha256 || "",
      supportedFineLabels: Array.isArray(parsed.supportedFineLabels) ? parsed.supportedFineLabels : [],
      unsupportedFineLabels: Array.isArray(parsed.unsupportedFineLabels) ? parsed.unsupportedFineLabels : [],
      inferenceSources: Array.isArray(parsed.inferenceSources) ? parsed.inferenceSources : [],
      degradedSources: Array.isArray(parsed.degradedSources) ? parsed.degradedSources : [],
      segmentAnalysis: parsed.segmentAnalysis || {},
      japaneseVocalEvidence: parsed.japaneseVocalEvidence || {},
      popStyle: Array.isArray(parsed.popStyle) ? parsed.popStyle : [],
      inferenceAttempt: result.attempt.role,
      fallbackReason: result.fallbackReason
    };
  }
  return {
    source: "embedding-genre-model",
    ok: false,
    error: result.errors.join(" | ").slice(-1000) || "Embedding genre inference failed."
  };
}

async function loadProductionLocalGenreRuntime() {
  if (localGenreRuntimePromise) return localGenreRuntimePromise;
  localGenreRuntimePromise = (async () => {
    if (!fs.existsSync(LOCAL_GENRE_MODEL_PATH)) return null;
    process.env.MMFR_GENRE_TRAIN_SKIP_MAIN = "1";
    const trainingModule = await import("./genre-training.mjs");
    const hooks = trainingModule.__testHooks;
    const api = hooks.loadAppGenreApi();
    const model = JSON.parse(fs.readFileSync(LOCAL_GENRE_MODEL_PATH, "utf8"));
    return { hooks, api, model };
  })().catch(() => null);
  return localGenreRuntimePromise;
}

async function analyzeProductionLocalGenre(features = {}, fallbackReason = "") {
  const runtime = await loadProductionLocalGenreRuntime();
  if (!runtime) return null;
  try {
    const compact = runtime.hooks.compactAudioFeatures(features);
    const vector = runtime.api.genreFeatureVector(compact);
    const prediction = runtime.hooks.classify(runtime.hooks.vectorValues(vector), runtime.model);
    return {
      source: "shared-production-local-classifier",
      method: "shared-production-local-classifier",
      modelPath: LOCAL_GENRE_MODEL_PATH,
      fallbackReason,
      macro: prediction.macroRanked.slice(0, 4).map(item => ({ label: item.label, score: item.score })),
      top: prediction.fineRanked.slice(0, 5).map(item => ({ label: item.label, name: item.label, score: item.score })),
      popStyle: (prediction.styleRankedByFamily?.pop || []).slice(0, 4).map(item => ({
        style: item.label,
        label: item.displayName || item.label,
        score: item.score,
        support: Number(item.support || 0),
        calibrated: Boolean(item.calibrated),
        needsReview: Boolean(item.needsReview)
      })),
      blackMusicFine: (prediction.blackMusicFineRanked || []).slice(0, 6).map(item => ({
        style: item.label,
        label: item.displayName || item.label,
        score: item.score,
        support: Number(item.support || 0),
        calibrated: Boolean(item.calibrated),
        needsReview: Boolean(item.needsReview)
      })),
      hierarchyGate: prediction.hierarchyGate || {},
      inferredGenre: prediction.fineRanked[0]?.label || "",
      confidence: Number(prediction.confidence || 0),
      needsReview: Boolean(prediction.needsReview),
      supportedFineLabels: runtime.model.fineGenres || [],
      unsupportedFineLabels: runtime.model.missingFineGenres || []
    };
  } catch (error) {
    return {
      source: "shared-production-local-classifier",
      ok: false,
      error: String(error?.message || error || "Local genre inference failed.")
    };
  }
}

function splitFloat32PcmWindows(buffer, sampleRate = 22050, count = 3) {
  const totalSamples = Math.floor((buffer?.length || 0) / 4);
  if (totalSamples < sampleRate * Math.max(12, count * 4)) return [];
  return Array.from({ length: count }, (_, index) => {
    const startSample = Math.floor(totalSamples * index / count);
    const endSample = Math.floor(totalSamples * (index + 1) / count);
    return buffer.subarray(startSample * 4, endSample * 4);
  });
}

async function analyzeProductionLocalGenreSegments(buffer, sampleRate = 22050, ranges = []) {
  if (!LOCAL_SEGMENT_CONSENSUS_ENABLED) return { available: false, count: 0, disabled: true };
  const expectedCount = ranges.length || 3;
  const windows = splitFloat32PcmWindows(buffer, sampleRate, expectedCount);
  if (windows.length < expectedCount) return { available: false, count: windows.length };
  const records = [];
  for (let index = 0; index < windows.length; index += 1) {
    const window = windows[index];
    const features = analyzeFloat32Pcm(window, sampleRate);
    records.push({
      range: ranges[index] || { index },
      prediction: await analyzeProductionLocalGenre(features, "segment-consensus"),
    });
  }
  return summarizeTrackSegmentPredictions(records, expectedCount);
}

async function applyBrowserGenreCalibration(prediction = {}, features = {}, japaneseVocalEvidence = {}) {
  if (!prediction?.top?.length) return prediction;
  const runtime = await loadProductionLocalGenreRuntime();
  if (!runtime?.api?.enrichFeaturesWithGenre) return prediction;
  try {
    const enriched = runtime.api.enrichFeaturesWithGenre({
      ...features,
      japaneseVocalEvidence,
      embeddingGenrePrediction: prediction
    });
    const analysis = enriched?.genreAnalysis;
    if (!analysis?.top?.length) return prediction;
    return {
      ...prediction,
      source: analysis.source || prediction.source,
      method: analysis.method || prediction.method,
      uncalibratedTop: prediction.top,
      macro: (analysis.macro || []).map(item => ({
        label: item.label || item.macro || "",
        macro: item.macro || item.label || "",
        score: Number(item.score) || 0
      })),
      top: analysis.top.map(item => ({
        label: item.label || item.name || "",
        name: item.name || item.label || "",
        score: Number(item.score) || 0
      })),
      popStyle: (analysis.style || []).filter(item => item.family === "pop").map(item => ({
        style: item.style || "",
        label: item.label || item.name || item.style || "",
        score: Number(item.score) || 0,
        support: Number(item.support || 0),
        calibrated: Boolean(item.calibrated),
        needsReview: Boolean(item.needsReview)
      })),
      inferredGenre: analysis.inferredGenre || analysis.top[0]?.name || analysis.top[0]?.label || "",
      confidence: Number(analysis.confidence || analysis.top[0]?.score || 0),
      // Browser-side hierarchy calibration may improve ordering, but it must
      // never erase a source-heldout selective-risk rejection.
      needsReview: Boolean(prediction.needsReview || analysis.needsReview),
      japaneseVocalCorrection: analysis.japaneseVocalCorrection || {},
      operaVocalRescue: analysis.operaVocalRescue || prediction.operaVocalRescue || {},
      vocalGenreGuard: analysis.vocalGenreGuard || prediction.vocalGenreGuard || {},
      boundaryCorrection: analysis.boundaryCorrection || {}
    };
  } catch {
    return prediction;
  }
}

function applyVocalDependentGenreGuards(prediction = {}, vocalEvidence = {}) {
  if (!prediction?.top?.length || !vocalEvidence?.available) return prediction;
  const vocalPresence = clamp01(vocalEvidence.vocalPresence);
  if (vocalPresence >= .18) return prediction;
  const guardedLabels = new Map([
    ["オペラ", { threshold: .18, floor: .16 }],
    ["アカペラ", { threshold: .18, floor: .1 }]
  ]);
  let applied = false;
  const top = prediction.top.map(item => {
    const label = item.label || item.name || "";
    const guard = guardedLabels.get(label);
    if (!guard || vocalPresence >= guard.threshold) return item;
    applied = true;
    const factor = guard.floor + (1 - guard.floor) * vocalPresence / guard.threshold;
    return { ...item, score: Math.round((Number(item.score) || 0) * factor * 10) / 10 };
  }).sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  if (!applied) return prediction;
  const previousTop = prediction.top[0]?.label || prediction.top[0]?.name || "";
  const inferredGenre = top[0]?.label || top[0]?.name || prediction.inferredGenre || "";
  return {
    ...prediction,
    top,
    inferredGenre,
    confidence: Number(top[0]?.score || prediction.confidence || 0),
    needsReview: Boolean(prediction.needsReview || previousTop !== inferredGenre),
    vocalGenreGuard: {
      applied: true,
      vocalPresence: Math.round(vocalPresence * 1000) / 1000,
      guardedLabels: [...guardedLabels.keys()]
    }
  };
}

function operaticVocalEvidence(features = {}, vocalEvidence = {}) {
  if (!vocalEvidence?.available) return 0;
  const vocalPresence = clamp01(vocalEvidence.vocalPresence);
  const onset = clamp01(features.onset);
  const rhythm = clamp01(features.rhythm);
  const energy = clamp01(features.energy ?? features.rms);
  const lowBand = clamp01(features.lowBandRatio);
  const midBand = clamp01(features.midBandRatio);
  const highBand = clamp01(features.highBandRatio);
  const brightness = clamp01(features.brightness);
  const sustainRatio = clamp01(features.sustainRatio);
  const reverbTail = clamp01(features.reverbTail);
  const acousticness = clamp01(features.acousticness);
  const structureRecurrence = clamp01(features.structureRecurrence);
  if (
    vocalPresence < .85 || onset > .34 || rhythm > .48 || energy < .38
    || lowBand > .12 || midBand < .72 || highBand > .03
    || sustainRatio < .72 || reverbTail < .78 || acousticness < .48
    || structureRecurrence > .63
  ) return 0;
  const sustainSupport = clamp01((.42 - onset) / .32);
  const rhythmSupport = clamp01((.55 - rhythm) / .4);
  const midSupport = clamp01((midBand - .58) / .28);
  const lowSupport = clamp01((.18 - lowBand) / .18);
  const energySupport = clamp01((energy - .45) / .35);
  const brightnessSupport = clamp01(1 - Math.abs(brightness - .42) / .42);
  return clamp01(
    vocalPresence * .32
    + sustainSupport * .12
    + rhythmSupport * .1
    + midSupport * .16
    + lowSupport * .08
    + energySupport * .12
    + brightnessSupport * .1
  );
}

function applyOperaticVocalRescue(prediction = {}, features = {}, vocalEvidence = {}) {
  if (!prediction?.top?.length || prediction.operaVocalRescue?.applied) return prediction;
  const evidence = operaticVocalEvidence(features, vocalEvidence);
  if (evidence < .82) return prediction;
  const maxScore = Math.max(...prediction.top.map(item => Number(item.score) || 0), 1);
  const worldLabels = new Set(["フォーク", "ラテン", "ワールドミュージック"]);
  const top = prediction.top.map(item => {
    const label = item.label || item.name || "";
    if (label === "オペラ") return { ...item, score: maxScore };
    if (label === "クラシック音楽") return item;
    const factor = worldLabels.has(label) ? .34 : .48;
    return { ...item, score: Math.round((Number(item.score) || 0) * factor * 10) / 10 };
  });
  if (!top.some(item => (item.label || item.name) === "オペラ")) {
    top.push({ label: "オペラ", name: "オペラ", score: maxScore });
  }
  top.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  const macro = [
    { label: "classical", score: 100 },
    ...(prediction.macro || [])
      .filter(item => (item.label || item.macro) !== "classical")
      .map(item => ({ ...item, score: Math.round((Number(item.score) || 0) * .42 * 10) / 10 }))
  ].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  return {
    ...prediction,
    top,
    macro,
    inferredGenre: "オペラ",
    confidence: Number(top[0]?.score || maxScore),
    needsReview: false,
    operaVocalRescue: {
      applied: true,
      evidence: Math.round(evidence * 1000) / 1000,
      vocalPresence: Math.round(clamp01(vocalEvidence.vocalPresence) * 1000) / 1000
    }
  };
}

async function resolveGenrePrediction(filePath, features, japaneseVocalEvidence = {}, segmentConsensus = {}, segmentAudioPaths = [], sampledRanges = []) {
  const localPrediction = await analyzeProductionLocalGenre(features, "");
  const local = localPrediction?.top?.length
    ? { ...localPrediction, segmentConsensus }
    : localPrediction;

  if (local?.top?.length && !local.error) {
    if (!EMBEDDING_GENRE_CONSENSUS_ENABLED || !shouldRunUnknownSourceConsensus(local, japaneseVocalEvidence, features)) {
      return local;
    }
    const external = await analyzeEmbeddingGenreForFile(
      filePath, japaneseVocalEvidence, segmentAudioPaths, sampledRanges
    );
    if (external?.top?.length && !external.error) {
      return {
        ...local,
        unknownSourceConsensus: external
      };
    }
    return local;
  }

  // Keep the embedding model as the full fallback when the production-local
  // runtime is unavailable. Browser-side calibration still runs exactly once.
  const external = await analyzeEmbeddingGenreForFile(
    filePath, japaneseVocalEvidence, segmentAudioPaths, sampledRanges
  );
  if (external?.top?.length && !external.error) return { ...external, segmentConsensus };
  return local || external;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function parseYouTubeTimeToSeconds(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  const compact = text.replace(/\s+/g, "").toLowerCase();
  if (/^\d+(?:\.\d+)?$/.test(compact)) return Math.max(0, Math.floor(Number(compact)));
  const unitMatch = compact.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s?)?$/);
  if (!unitMatch) return 0;
  const hours = Number(unitMatch[1] || 0);
  const minutes = Number(unitMatch[2] || 0);
  const seconds = Number(unitMatch[3] || 0);
  return Math.max(0, Math.floor(hours * 3600 + minutes * 60 + seconds));
}

function parseYouTubeStartSeconds(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  try {
    const url = new URL(text);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    return parseYouTubeTimeToSeconds(
      url.searchParams.get("t") ||
      url.searchParams.get("start") ||
      url.searchParams.get("time_continue") ||
      hashParams.get("t") ||
      hashParams.get("start") ||
      ""
    );
  } catch {
    const match = text.match(/[?#&](?:t|start|time_continue)=([^&#]+)/i);
    return parseYouTubeTimeToSeconds(match?.[1] || "");
  }
}

function resampleSeries(source, length = 64, fallback = 0) {
  const values = Array.isArray(source) ? source : [];
  return Array.from({ length }, (_, i) => {
    if (!values.length) return clamp01(fallback);
    const index = Math.min(values.length - 1, Math.round(i * (values.length - 1) / Math.max(1, length - 1)));
    return clamp01(values[index]);
  });
}

function clampSigned(value) {
  return Math.max(-1, Math.min(1, Number(value) || 0));
}

function resampleSignedSeries(source, length = 2048, fallback = 0) {
  const values = Array.isArray(source) ? source : [];
  return Array.from({ length }, (_, i) => {
    if (!values.length) return clampSigned(fallback);
    const index = Math.min(values.length - 1, Math.round(i * (values.length - 1) / Math.max(1, length - 1)));
    return Math.round(clampSigned(values[index]) * 1000) / 1000;
  });
}

function signedWaveformFromSamples(samples, length = 2048) {
  const total = samples?.length || 0;
  if (!total) return Array.from({ length }, () => 0);
  return Array.from({ length }, (_, i) => {
    const start = Math.floor(i * total / length);
    const end = Math.max(start + 1, Math.floor((i + 1) * total / length));
    let sum = 0;
    let peak = 0;
    for (let j = start; j < end; j++) {
      const value = clampSigned(samples[j] || 0);
      sum += value;
      if (Math.abs(value) > Math.abs(peak)) peak = value;
    }
    const avg = sum / Math.max(1, end - start);
    return Math.round(clampSigned(avg * .45 + peak * .55) * 1000) / 1000;
  });
}

function encodeMulaw8(value, mu = 255) {
  const sample = clampSigned(value);
  const sign = sample < 0 ? -1 : 1;
  const encoded = sign * Math.log1p(mu * Math.abs(sample)) / Math.log1p(mu);
  return Math.max(0, Math.min(255, Math.round(encoded * 127) + 128));
}

function pcmSketchFromSamples(samples, sampleRate = 22050, targetRate = 11025, maxDuration = 24) {
  const source = samples || [];
  const sourceDuration = source.length / Math.max(1, sampleRate);
  const duration = Math.max(0, Math.min(maxDuration, sourceDuration));
  const length = Math.max(1, Math.floor(duration * targetRate));
  let peak = 0;
  for (let i = 0; i < Math.min(source.length, Math.floor(duration * sampleRate)); i++) {
    peak = Math.max(peak, Math.abs(source[i] || 0));
  }
  const normalise = peak > 0 ? Math.min(2.8, .92 / peak) : 1;
  const bytes = Buffer.alloc(length);
  for (let i = 0; i < length; i++) {
    const sourcePosition = i * sampleRate / targetRate;
    const a = Math.min(source.length - 1, Math.floor(sourcePosition));
    const b = Math.min(source.length - 1, a + 1);
    const frac = sourcePosition - a;
    const value = ((source[a] || 0) * (1 - frac) + (source[b] || 0) * frac) * normalise;
    bytes[i] = encodeMulaw8(value);
  }
  return {
    pcmSketch: bytes.toString("base64"),
    pcmSketchEncoding: "mulaw8-base64",
    pcmSketchSampleRate: targetRate,
    pcmSketchDuration: Math.round(duration * 1000) / 1000,
    pcmSketchFrameCount: length
  };
}

function pcmSketchFeaturesFromFloat32Buffer(buffer, sampleRate = 22050) {
  const samples = new Float32Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 4));
  return {
    detail: pcmSketchFromSamples(samples, sampleRate, 11025, 24),
  };
}

function resampleMatrix(source, rows = 24, cols = 12) {
  const matrix = Array.isArray(source) ? source : [];
  return Array.from({ length: rows }, (_, row) => {
    const sourceRow = matrix.length
      ? matrix[Math.min(matrix.length - 1, Math.round(row * (matrix.length - 1) / Math.max(1, rows - 1)))]
      : [];
    return Array.from({ length: cols }, (_, col) => clamp01(sourceRow?.[col] ?? 0));
  });
}

function normaliseAudioDetail(raw = {}, fallback = {}) {
  const rhythmFrameCount = 384;
  return {
    version: "mmfr.audio-detail.v3",
    frameCount: 64,
    waveformFrameCount: 2048,
    chromaFrameCount: 24,
    bandFrameCount: 32,
    waveform: resampleSignedSeries(raw.waveform || raw.signedWaveform || raw.waveformSketch, 2048, 0),
    rms: resampleSeries(raw.rms || raw.rmsFrames || raw.energy || fallback.temporalProfile, 64, fallback.energy || 0),
    bass: resampleSeries(raw.bass || raw.bassFrames, 64, fallback.bass || 0),
    centroid: resampleSeries(raw.centroid || raw.centroidFrames || raw.brightnessFrames, 64, fallback.brightness || 0),
    onset: resampleSeries(raw.onset || raw.onsetFrames || raw.flux, 64, fallback.onset || 0),
    zeroCrossing: resampleSeries(raw.zeroCrossing || raw.zcr || raw.zeroCrossingFrames, 64, 0),
    chromaTimeline: resampleMatrix(raw.chromaTimeline || raw.chromaFrames, 24, 12),
    bandTimeline: resampleMatrix(raw.bandTimeline || raw.bands || raw.spectralBands, 32, 8),
    spectralRolloff: resampleSeries(raw.spectralRolloff || raw.spectralRolloffFrames, 32, 0),
    mfccTimeline: resampleMatrix(raw.mfccTimeline || raw.mfccFrames, 32, 3),
    rhythmFrameCount,
    rhythmOnset: resampleSeries(raw.rhythmOnset || raw.onset || raw.onsetFrames || raw.flux, rhythmFrameCount, fallback.onset || 0),
    rhythmRms: resampleSeries(raw.rhythmRms || raw.rms || raw.rmsFrames || raw.energy, rhythmFrameCount, fallback.energy || 0),
    rhythmZeroCrossing: resampleSeries(raw.rhythmZeroCrossing || raw.zeroCrossing || raw.zcr || raw.zeroCrossingFrames, rhythmFrameCount, 0),
    pcmSketch: typeof raw.pcmSketch === "string" ? raw.pcmSketch : "",
    pcmSketchEncoding: raw.pcmSketchEncoding || "",
    pcmSketchSampleRate: Number(raw.pcmSketchSampleRate || 0),
    pcmSketchDuration: Number(raw.pcmSketchDuration || 0),
    pcmSketchFrameCount: Number(raw.pcmSketchFrameCount || 0)
  };
}

function spectralRolloffFramesFromBands(rows = [], threshold = .85) {
  return rows.map(row => {
    const values = Array.isArray(row) ? row.map(value => Math.max(0, Number(value) || 0)) : [];
    const total = values.reduce((sum, value) => sum + value, 0);
    if (!total) return 0;
    let acc = 0;
    for (let i = 0; i < values.length; i++) {
      acc += values[i];
      if (acc / total >= threshold) return i / Math.max(1, values.length - 1);
    }
    return 1;
  });
}

function mfccLikeFramesFromBands(rows = []) {
  return rows.map(row => {
    const values = Array.from({ length: 8 }, (_, i) => Math.log(1e-4 + Math.max(0, Number(row?.[i]) || 0)));
    return [1, 2, 3].map(coeff => {
      const total = values.reduce((sum, value, index) => sum + value * Math.cos(Math.PI * coeff * (index + .5) / values.length), 0);
      return clamp01(total / values.length * .18 + .5);
    });
  });
}

function goertzelPower(samples, start, size, sampleRate, frequency) {
  const omega = 2 * Math.PI * frequency / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let q0 = 0;
  let q1 = 0;
  let q2 = 0;
  for (let i = 0; i < size; i++) {
    const sample = samples[start + i] || 0;
    q0 = coeff * q1 - q2 + sample;
    q2 = q1;
    q1 = q0;
  }
  return q1 * q1 + q2 * q2 - coeff * q1 * q2;
}

function estimateTempo(envelope, fps) {
  if (envelope.length < 8) return 96;
  const mean = envelope.reduce((sum, value) => sum + value, 0) / envelope.length;
  const signal = envelope.map(value => Math.max(0, value - mean * .65));
  const minLag = Math.max(1, Math.floor(fps * 60 / 220));
  const maxLag = Math.max(minLag + 1, Math.ceil(fps * 60 / 45));
  const folded = new Map();
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0;
    let normA = 0;
    let normB = 0;
    for (let i = lag; i < signal.length; i++) {
      score += signal[i] * signal[i - lag];
      normA += signal[i] * signal[i];
      normB += signal[i - lag] * signal[i - lag];
    }
    const normalisedScore = score / (Math.sqrt(normA * normB) || 1);
    const bpm = 60 * fps / lag;
    [0.5, 1, 2, 4].forEach(multiplier => {
      const foldedBpm = bpm * multiplier;
      if (foldedBpm < 70 || foldedBpm > 190) return;
      const key = Math.round(foldedBpm);
      const weight = multiplier === 1 ? 1 : multiplier === 2 ? .98 : .9;
      folded.set(key, Math.max(folded.get(key) || 0, normalisedScore * weight));
    });
  }
  return [...folded.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 96;
}

function analyzeFloat32Pcm(buffer, sampleRate = 22050) {
  const samples = new Float32Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 4));
  const frameSize = 2048;
  const hop = 1024;
  const frameTotal = Math.max(1, Math.floor((samples.length - frameSize) / hop));
  const frameStep = Math.max(1, Math.floor(frameTotal / 360));
  const spectralStep = Math.max(1, Math.floor(frameTotal / 72));
  const chroma = Array.from({ length: 12 }, () => 0);
  const bandFrequencies = [55, 110, 220, 440, 880, 1760, 3520, 7040];
  const pitchFrequencies = [];
  for (let octave = 2; octave <= 7; octave++) {
    for (let pc = 0; pc < 12; pc++) {
      const midi = 12 * (octave + 1) + pc;
      pitchFrequencies.push({ pc, freq: 440 * Math.pow(2, (midi - 69) / 12) });
    }
  }

  let rmsSum = 0;
  let zcrSum = 0;
  let bassSum = 0;
  let lowBandSum = 0;
  let midBandSum = 0;
  let highBandSum = 0;
  let bandPowerSum = 0;
  let bandCentroidSum = 0;
  let bandCentroidWeight = 0;
  let spectralPowerSum = 0;
  let centroidSum = 0;
  let centroidWeight = 0;
  let prevEnergy = 0;
  let onsetSum = 0;
  const envelope = [];
  const rmsFrames = [];
  const zcrFrames = [];
  const bassFrameRaw = [];
  const centroidFrameRaw = [];
  const chromaFrameRows = [];
  const bandFrameRows = [];

  for (let frame = 0; frame < frameTotal; frame++) {
    const start = frame * hop;
    let energy = 0;
    let crossings = 0;
    let prev = samples[start] || 0;
    for (let i = 0; i < frameSize; i++) {
      const sample = samples[start + i] || 0;
      energy += sample * sample;
      if ((sample >= 0 && prev < 0) || (sample < 0 && prev >= 0)) crossings++;
      prev = sample;
    }
    const rms = Math.sqrt(energy / frameSize);
    rmsSum += rms;
    rmsFrames.push(rms);
    const zcr = crossings / frameSize;
    zcrSum += zcr;
    zcrFrames.push(zcr);
    const flux = Math.max(0, rms - prevEnergy);
    onsetSum += flux;
    envelope.push(flux);
    prevEnergy = rms;
  }

  for (let frame = 0; frame < frameTotal; frame += spectralStep) {
    const start = frame * hop;
    const bassPower = [55, 82, 110, 164, 220].reduce((sum, freq) => sum + goertzelPower(samples, start, frameSize, sampleRate, freq), 0);
    const frameChroma = Array.from({ length: 12 }, () => 0);
    const frameBands = bandFrequencies.map(freq => freq < sampleRate / 2 ? goertzelPower(samples, start, frameSize, sampleRate, freq) : 0);
    frameBands.forEach((power, index) => {
      const freq = bandFrequencies[index];
      const weightedPower = power * Math.pow(Math.max(1, freq) / 220, 1.15);
      bandPowerSum += weightedPower;
      bandCentroidSum += freq * weightedPower;
      bandCentroidWeight += weightedPower;
      if (freq <= 220) lowBandSum += weightedPower;
      else if (freq <= 1760) midBandSum += weightedPower;
      else highBandSum += weightedPower;
    });
    let frameCentroidSum = 0;
    let frameCentroidWeight = 0;
    bassSum += bassPower;
    bassFrameRaw.push(bassPower);
    bandFrameRows.push(frameBands);
    pitchFrequencies.forEach(item => {
      if (item.freq < sampleRate / 2) {
        const power = goertzelPower(samples, start, frameSize, sampleRate, item.freq);
        spectralPowerSum += power;
        chroma[item.pc] += power;
        frameChroma[item.pc] += power;
        centroidSum += item.freq * power;
        centroidWeight += power;
        frameCentroidSum += item.freq * power;
        frameCentroidWeight += power;
      }
    });
    chromaFrameRows.push(frameChroma);
    centroidFrameRaw.push(frameCentroidWeight ? frameCentroidSum / frameCentroidWeight : 1200);
  }

  const frames = Math.max(1, frameTotal);
  const spectralFrames = Math.max(1, Math.ceil(frameTotal / spectralStep));
  const chromaMax = Math.max(...chroma, 1);
  const rmsMax = Math.max(...rmsFrames, 1);
  const averageRms = rmsSum / frames;
  const energy = clamp01(Math.sqrt(averageRms) * 1.8);
  const onset = clamp01((onsetSum / frames) * 28);
  const tempo = estimateTempo(envelope, sampleRate / hop);
  const tonalCentroid = centroidWeight ? centroidSum / centroidWeight : 1200;
  const bandCentroid = bandCentroidWeight ? bandCentroidSum / bandCentroidWeight : tonalCentroid;
  const centroid = Math.round(bandCentroid);
  const bassRatio = bandPowerSum ? lowBandSum / bandPowerSum : 0;
  const midBandRatio = bandPowerSum ? midBandSum / bandPowerSum : 0;
  const highBandRatio = bandPowerSum ? highBandSum / bandPowerSum : 0;
  const bass = clamp01(Math.pow(bassRatio, .82) * 1.18);
  const brightness = clamp01(Math.max(
    (centroid - 180) / 3600,
    Math.pow(highBandRatio, .45) * 1.2
  ));
  const temporalProfile = Array.from({ length: 16 }, (_, i) => {
    const index = Math.min(rmsFrames.length - 1, Math.round(i * (rmsFrames.length - 1) / 15));
    return clamp01((rmsFrames[index] || 0) / rmsMax);
  });
  const onsetMax = Math.max(...envelope, 1);
  const bassFrameMax = Math.max(...bassFrameRaw, 1);
  const chromaFrameMax = Math.max(...chromaFrameRows.flat(), 1);
  const bandFrameMax = Math.max(...bandFrameRows.flat(), 1);
  const normalisedBandRows = bandFrameRows.map(row => row.map(value => value / bandFrameMax));
  const zcrMax = Math.max(...zcrFrames, 1);
  const pcmSketch = pcmSketchFromSamples(samples, sampleRate, 11025, 24);
  const detail = normaliseAudioDetail({
    waveform: signedWaveformFromSamples(samples, 2048),
    rms: rmsFrames.map(value => value / rmsMax),
    onset: envelope.map(value => value / onsetMax),
    zeroCrossing: zcrFrames.map(value => value / zcrMax),
    bass: bassFrameRaw.map(value => value / bassFrameMax),
    centroid: centroidFrameRaw.map(value => clamp01((value - 400) / 5200)),
    chromaTimeline: chromaFrameRows.map(row => row.map(value => value / chromaFrameMax)),
    bandTimeline: normalisedBandRows,
    spectralRolloff: spectralRolloffFramesFromBands(normalisedBandRows),
    mfccTimeline: mfccLikeFramesFromBands(normalisedBandRows),
    rhythmOnset: envelope.map(value => value / onsetMax),
    rhythmRms: rmsFrames.map(value => value / rmsMax),
    rhythmZeroCrossing: zcrFrames.map(value => value / zcrMax),
    ...pcmSketch
  }, { energy, bass, brightness, onset, temporalProfile });

  return {
    source: "youtube-audio-analysis-server",
    tempo,
    energy,
    rms: energy,
    bass,
    brightness,
    lowBandRatio: clamp01(bassRatio),
    midBandRatio: clamp01(midBandRatio),
    highBandRatio: clamp01(highBandRatio),
    tonalCentroid: Math.round(tonalCentroid),
    spectralCentroid: centroid,
    rhythm: clamp01(onset * 1.4),
    onset,
    phase: clamp01(zcrSum / frames * 24) * Math.PI * 2,
    chroma: chroma.map(value => value / chromaMax),
    temporalProfile,
    detail
  };
}

function analysisLog(requestId, event, detail = {}) {
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    requestId: requestId || "untracked",
    event,
    ...detail,
  }));
}

async function analyzeYouTube(youtubeUrl, options = {}) {
  const normalized = normalizePublicYouTubeUrl(youtubeUrl);
  youtubeUrl = normalized.normalizedUrl;
  const requestedStart = Number(options.startSeconds);
  const startSeconds = Number.isFinite(requestedStart) && requestedStart >= 0
    ? Math.floor(requestedStart)
    : normalized.startSeconds;
  const requestId = String(options.requestId || "");
  const signal = options.signal;
  const startedAt = Date.now();
  const stageStarted = new Map();
  const startStage = stage => stageStarted.set(stage, Date.now());
  const finishStage = (stage, detail = {}) => analysisLog(requestId, "stage", {
    stage,
    durationMs: Date.now() - (stageStarted.get(stage) || startedAt),
    ...detail,
  });
  const tools = await resolveTools();
  const missing = [
    tools.ytDlp ? "" : "yt-dlp",
    tools.ffmpeg ? "" : "ffmpeg"
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Missing required command: ${missing.join(", ")}. Run "Install Audio Tools.command" first, then restart this server.`);
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mmfr-audio-"));
  try {
    startStage("metadata");
    const metaResult = await runYtDlp(tools.ytDlp, [
      "--no-playlist",
      "--dump-single-json",
      "--skip-download",
      youtubeUrl
    ], {
      timeoutMs: 50000,
      signal,
      onAttempt: ({ strategy, attempt }) => analysisLog(requestId, "youtube-attempt", { stage: "metadata", strategy, retryCount: attempt }),
    });
    const parsed = JSON.parse(metaResult.stdout.toString("utf8") || "{}");
    const durationSeconds = Number(parsed.duration);
    if (Number.isFinite(durationSeconds) && startSeconds >= durationSeconds) {
      const error = new Error("指定した開始位置が動画の長さを超えています。");
      error.code = "START_OUT_OF_RANGE";
      throw error;
    }
    const youtubeMeta = {
      title: parsed.title || "",
      uploader: parsed.uploader || parsed.channel || "",
      duration: Number.isFinite(durationSeconds) ? durationSeconds : null,
      categories: Array.isArray(parsed.categories) ? parsed.categories.slice(0, 8) : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 24) : []
    };
    finishStage("metadata", { strategy: metaResult.strategy, retryCount: metaResult.retryCount });

    const sampledRanges = planTrackSampleRanges({
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : startSeconds + Math.max(1, ANALYSIS_WINDOW_SECONDS),
      requestedStartSeconds: startSeconds,
      windowSeconds: TRACK_SAMPLE_WINDOW_SECONDS,
      count: TRACK_SAMPLE_COUNT,
    });
    if (!sampledRanges.length) {
      sampledRanges.push({
        index: 0,
        role: "requested",
        startSeconds,
        endSeconds: startSeconds + Math.max(1, ANALYSIS_WINDOW_SECONDS),
        durationSeconds: Math.max(1, ANALYSIS_WINDOW_SECONDS),
      });
    }

    startStage("download");
    let acquisitionMode = "range";
    let downloadResult;
    try {
      const sectionArgs = sampledRanges.flatMap(range => [
        "--download-sections", `*${range.startSeconds}-${range.endSeconds}`,
      ]);
      downloadResult = await runYtDlp(tools.ytDlp, [
        "--no-playlist",
        "--ffmpeg-location", path.dirname(tools.ffmpeg),
        ...sectionArgs,
        "--force-keyframes-at-cuts",
        "--max-filesize", "80M",
        "-f", "bestaudio/best",
        "-o", path.join(tempDir, "source-range-%(section_start)010.3f.%(ext)s"),
        youtubeUrl
      ], {
        timeoutMs: 180000,
        signal,
        onAttempt: ({ strategy, attempt }) => analysisLog(requestId, "youtube-attempt", { stage: "range-download", strategy, retryCount: attempt }),
      });
    } catch (error) {
      const failure = classifyYouTubeFailure(error);
      if (failure.code === "ANALYSIS_CANCELLED" || failure.code === "YOUTUBE_RATE_LIMITED"
        || failure.code === "VIDEO_UNAVAILABLE" || failure.code === "REGION_BLOCKED"
        || failure.code === "AGE_RESTRICTED" || failure.code === "YOUTUBE_COOKIE_REQUIRED") throw error;
      acquisitionMode = "full-fallback";
      analysisLog(requestId, "range-fallback", { code: failure.code });
      downloadResult = await runYtDlp(tools.ytDlp, [
        "--no-playlist",
        "--ffmpeg-location", path.dirname(tools.ffmpeg),
        "--max-filesize", "80M",
        "-f", "bestaudio/best",
        "-o", path.join(tempDir, "source-full.%(ext)s"),
        youtubeUrl
      ], {
        timeoutMs: 180000,
        signal,
        onAttempt: ({ strategy, attempt }) => analysisLog(requestId, "youtube-attempt", { stage: "full-download", strategy, retryCount: attempt }),
      });
    }
    let files = await fs.promises.readdir(tempDir);
    const availableRangeSourceFiles = files
      .filter(file => file.startsWith("source-range-") && !file.endsWith(".part"))
      .sort();
    const rangeSourceFiles = sampledRanges.map(range => {
      const expectedStart = Number(range.startSeconds || 0);
      return availableRangeSourceFiles.find(file => {
        const parsedStart = Number(file.match(/^source-range-([0-9]+(?:\.[0-9]+)?)\./)?.[1]);
        return Number.isFinite(parsedStart) && Math.abs(parsedStart - expectedStart) < .01;
      }) || "";
    });
    if (acquisitionMode === "range" && (
      rangeSourceFiles.length !== sampledRanges.length || rangeSourceFiles.some(file => !file)
    )) {
      acquisitionMode = "full-fallback";
      analysisLog(requestId, "range-fallback", {
        code: "INCOMPLETE_MULTI_RANGE",
        expected: sampledRanges.length,
        actual: rangeSourceFiles.length,
      });
      downloadResult = await runYtDlp(tools.ytDlp, [
        "--no-playlist",
        "--ffmpeg-location", path.dirname(tools.ffmpeg),
        "--max-filesize", "80M",
        "-f", "bestaudio/best",
        "-o", path.join(tempDir, "source-full.%(ext)s"),
        youtubeUrl
      ], {
        timeoutMs: 180000,
        signal,
        onAttempt: ({ strategy, attempt }) => analysisLog(requestId, "youtube-attempt", { stage: "full-download", strategy, retryCount: attempt }),
      });
      files = await fs.promises.readdir(tempDir);
    }
    const fullSourceFile = files.find(file => file.startsWith("source-full.") && !file.endsWith(".part"));
    if (acquisitionMode === "full-fallback" && !fullSourceFile) throw new Error("Downloaded audio file was not found.");
    finishStage("download", { acquisitionMode, strategy: downloadResult.strategy, retryCount: downloadResult.retryCount });

    startStage("decode");
    const segmentAudioPaths = [];
    for (let index = 0; index < sampledRanges.length; index += 1) {
      const range = sampledRanges[index];
      const sourcePath = acquisitionMode === "range"
        ? path.join(tempDir, rangeSourceFiles[index])
        : path.join(tempDir, fullSourceFile);
      const segmentAudioPath = path.join(tempDir, `analysis-segment-${String(index).padStart(2, "0")}.wav`);
      const sliceArgs = ["-hide_banner", "-loglevel", "error"];
      if (acquisitionMode === "full-fallback") sliceArgs.push("-ss", String(range.startSeconds));
      sliceArgs.push(
        "-i", sourcePath,
        "-t", String(range.durationSeconds),
        "-vn",
        "-ac", "1",
        "-ar", "22050",
        "-c:a", "pcm_s16le",
        segmentAudioPath,
      );
      await run(tools.ffmpeg, sliceArgs, { timeoutMs: 90000, signal });
      segmentAudioPaths.push(segmentAudioPath);
    }

    // Keep one deterministic analysis file so the expensive embedding and
    // vocal models still run once while the local head sees every track range.
    const analysisAudioPath = path.join(tempDir, "analysis-track.wav");
    const concatInputs = segmentAudioPaths.flatMap(segmentPath => ["-i", segmentPath]);
    const concatFilter = `${segmentAudioPaths.map((_, index) => `[${index}:a]`).join("")}concat=n=${segmentAudioPaths.length}:v=0:a=1[out]`;
    await run(tools.ffmpeg, [
      "-hide_banner",
      "-loglevel", "error",
      ...concatInputs,
      "-filter_complex", concatFilter,
      "-map", "[out]",
      "-ac", "1",
      "-ar", "22050",
      "-c:a", "pcm_s16le",
      analysisAudioPath,
    ], { timeoutMs: 90000, signal });

    const ffmpegArgs = [
      "-hide_banner",
      "-loglevel", "error",
      "-i", analysisAudioPath
    ];
    ffmpegArgs.push(
      "-ac", "1",
      "-ar", "22050",
      "-f", "f32le",
      "pipe:1"
    );
    const { stdout } = await run(tools.ffmpeg, [
      ...ffmpegArgs
    ], { timeoutMs: 90000, signal });
    if (!stdout.length) throw new Error(`No audio was decoded from ${startSeconds}s. Try an earlier start time.`);
    const requestedSegmentIndex = Math.max(0, sampledRanges.findIndex(range => range.role === "requested"));
    const { stdout: requestedPcmStdout } = await run(tools.ffmpeg, [
      "-hide_banner", "-loglevel", "error",
      "-i", segmentAudioPaths[requestedSegmentIndex],
      "-ac", "1", "-ar", "22050", "-f", "f32le", "pipe:1",
    ], { timeoutMs: 90000, signal });
    if (!requestedPcmStdout.length) throw new Error("No audio was decoded from the requested reversible-PCM range.");
    finishStage("decode", { bytes: stdout.length });
    startStage("features");
    const features = preserveRequestedPcmSketch(
      analyzeFloat32Pcm(stdout, 22050),
      pcmSketchFeaturesFromFloat32Buffer(requestedPcmStdout, 22050),
    );
    const segmentConsensus = await analyzeProductionLocalGenreSegments(stdout, 22050, sampledRanges);
    const japaneseVocalEvidence = await analyzeJapaneseVocalEvidenceForFile(analysisAudioPath, {
      startSeconds: 0,
      ffmpegPath: tools.ffmpeg
    });
    const rawGenrePrediction = await resolveGenrePrediction(
      analysisAudioPath,
      features,
      japaneseVocalEvidence,
      segmentConsensus,
      segmentAudioPaths,
      sampledRanges
    );
    const gatedGenrePrediction = promoteReliableExternalTrackPrediction(rawGenrePrediction);
    const trackContract = buildTrackPredictionContract({
      prediction: gatedGenrePrediction,
      sampledRanges,
      segmentSummary: segmentConsensus,
      fallbackModelVersion: GENRE_INFERENCE_REVISION,
    });
    const embeddingGenrePrediction = trackContract?.prediction || gatedGenrePrediction;
    const segmentAgreement = trackContract?.segmentAgreement || null;
    const evidenceCoverage = Number(trackContract?.evidenceCoverage || 0);
    finishStage("features");
    analysisLog(requestId, "complete", { totalMs: Date.now() - startedAt, acquisitionMode });
    const sampledAudioSeconds = sampledRanges.reduce((sum, range) => sum + Number(range.durationSeconds || 0), 0);
    return {
      ...features,
      sourceUrl: youtubeUrl,
      normalizedUrl: youtubeUrl,
      startSeconds,
      analysisWindowSeconds: sampledAudioSeconds,
      classificationScope: "track",
      sampledRanges,
      segmentPredictions: segmentConsensus.segmentPredictions || [],
      segmentAgreement,
      evidenceCoverage,
      confidence: Number(embeddingGenrePrediction?.confidence || embeddingGenrePrediction?.top?.[0]?.score || 0),
      needsReview: Boolean(embeddingGenrePrediction?.needsReview),
      modelVersion: embeddingGenrePrediction?.modelVersion || GENRE_INFERENCE_REVISION,
      acquisitionMode,
      youtubeMeta,
      japaneseVocalEvidence,
      embeddingGenrePrediction
    };
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
    analysisLog(requestId, "cleanup", { totalMs: Date.now() - startedAt });
  }
}

async function analyzePreviewUrl(previewUrl, options = {}) {
  if (!previewUrl || !/^https?:\/\//.test(previewUrl)) throw new Error("Preview URL is missing.");
  const tools = await resolveTools();
  if (!tools.ffmpeg) {
    throw new Error(`Missing required command: ffmpeg. Run "Install Audio Tools.command" first, then restart this server.`);
  }
  const duration = Math.max(1, Math.min(30, Number(options.durationSeconds || 30)));
  const { stdout } = await run(tools.ffmpeg, [
    "-hide_banner",
    "-loglevel", "error",
    "-i", previewUrl,
    "-t", String(duration),
    "-ac", "1",
    "-ar", "22050",
    "-f", "f32le",
    "pipe:1"
  ], { timeoutMs: 90000 });
  if (!stdout.length) throw new Error("No audio was decoded from preview URL.");
  return {
    ...analyzeFloat32Pcm(stdout, 22050),
    source: "itunes-preview-analysis-server",
    sourceType: "itunes-preview",
    sourceUrl: previewUrl,
    previewUrl,
    normalizedUrl: previewUrl,
    analysisWindowSeconds: duration,
    previewMeta: options.previewMeta || {}
  };
}

async function probeAudioDuration(filePath, ffmpegPath) {
  try {
    const result = await run(ffmpegPath, [
      "-hide_banner",
      "-i", filePath,
      "-t", "0",
      "-f", "null",
      "-",
    ], { timeoutMs: 30000 });
    const match = String(result.stderr || "").match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!match) return 0;
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  } catch {
    return 0;
  }
}

async function analyzeLocalFile(filePath, options = {}) {
  const targetPath = path.resolve(String(filePath || ""));
  if (!targetPath) throw new Error("Local audio file path is missing.");
  if (!fs.existsSync(targetPath)) throw new Error(`Local audio file was not found: ${targetPath}`);
  const tools = await resolveTools();
  if (!tools.ffmpeg) {
    throw new Error(`Missing required command: ffmpeg. Run "Install Audio Tools.command" first, then restart this server.`);
  }
  const startSeconds = Math.max(0, Math.floor(Number(options.startSeconds || 0)));
  const durationSeconds = await probeAudioDuration(targetPath, tools.ffmpeg);
  const sampledRanges = planTrackSampleRanges({
    durationSeconds: durationSeconds || startSeconds + Math.max(1, ANALYSIS_WINDOW_SECONDS),
    requestedStartSeconds: startSeconds,
    windowSeconds: TRACK_SAMPLE_WINDOW_SECONDS,
    count: TRACK_SAMPLE_COUNT,
  });
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mmfr-local-track-"));
  try {
    const segmentAudioPaths = [];
    for (let index = 0; index < sampledRanges.length; index += 1) {
      const range = sampledRanges[index];
      const segmentPath = path.join(tempDir, `segment-${String(index).padStart(2, "0")}.wav`);
      await run(tools.ffmpeg, [
        "-hide_banner", "-loglevel", "error",
        "-ss", String(range.startSeconds),
        "-i", targetPath,
        "-t", String(range.durationSeconds),
        "-ac", "1", "-ar", "22050", "-c:a", "pcm_s16le",
        segmentPath,
      ], { timeoutMs: 90000 });
      segmentAudioPaths.push(segmentPath);
    }
    const analysisAudioPath = path.join(tempDir, "analysis-track.wav");
    const concatFilter = `${segmentAudioPaths.map((_, index) => `[${index}:a]`).join("")}concat=n=${segmentAudioPaths.length}:v=0:a=1[out]`;
    await run(tools.ffmpeg, [
      "-hide_banner", "-loglevel", "error",
      ...segmentAudioPaths.flatMap(segmentPath => ["-i", segmentPath]),
      "-filter_complex", concatFilter,
      "-map", "[out]",
      "-ac", "1", "-ar", "22050", "-c:a", "pcm_s16le",
      analysisAudioPath,
    ], { timeoutMs: 90000 });
    const { stdout } = await run(tools.ffmpeg, [
      "-hide_banner", "-loglevel", "error",
      "-i", analysisAudioPath,
      "-ac", "1", "-ar", "22050", "-f", "f32le", "pipe:1",
    ], { timeoutMs: 180000 });
    if (!stdout.length) throw new Error(`No audio was decoded from local file: ${targetPath}`);
    const requestedSegmentIndex = Math.max(0, sampledRanges.findIndex(range => range.role === "requested"));
    const { stdout: requestedPcmStdout } = await run(tools.ffmpeg, [
      "-hide_banner", "-loglevel", "error",
      "-i", segmentAudioPaths[requestedSegmentIndex],
      "-ac", "1", "-ar", "22050", "-f", "f32le", "pipe:1",
    ], { timeoutMs: 90000 });
    if (!requestedPcmStdout.length) throw new Error("No audio was decoded from the requested reversible-PCM range.");
    const segmentConsensus = await analyzeProductionLocalGenreSegments(stdout, 22050, sampledRanges);
    const japaneseVocalEvidence = await analyzeJapaneseVocalEvidenceForFile(analysisAudioPath, {
      startSeconds: 0,
      ffmpegPath: tools.ffmpeg
    });
    const features = preserveRequestedPcmSketch(
      analyzeFloat32Pcm(stdout, 22050),
      pcmSketchFeaturesFromFloat32Buffer(requestedPcmStdout, 22050),
    );
    const rawGenrePrediction = await resolveGenrePrediction(
      analysisAudioPath,
      features,
      japaneseVocalEvidence,
      segmentConsensus,
      segmentAudioPaths,
      sampledRanges
    );
    const gatedGenrePrediction = promoteReliableExternalTrackPrediction(rawGenrePrediction);
    const trackContract = buildTrackPredictionContract({
      prediction: gatedGenrePrediction,
      sampledRanges,
      segmentSummary: segmentConsensus,
      fallbackModelVersion: GENRE_INFERENCE_REVISION,
    });
    const embeddingGenrePrediction = trackContract?.prediction || gatedGenrePrediction;
    const sampledAudioSeconds = sampledRanges.reduce((sum, range) => sum + Number(range.durationSeconds || 0), 0);
    return {
      ...features,
      source: "local-audio-analysis-server",
      sourceType: options.sourceType || "cc-dataset",
      sourceUrl: targetPath,
      normalizedUrl: targetPath,
      startSeconds,
      analysisWindowSeconds: sampledAudioSeconds,
      classificationScope: "track",
      sampledRanges,
      segmentPredictions: segmentConsensus.segmentPredictions || [],
      segmentAgreement: trackContract?.segmentAgreement || null,
      evidenceCoverage: Number(trackContract?.evidenceCoverage || 0),
      confidence: Number(embeddingGenrePrediction?.confidence || embeddingGenrePrediction?.top?.[0]?.score || 0),
      needsReview: Boolean(embeddingGenrePrediction?.needsReview),
      modelVersion: embeddingGenrePrediction?.modelVersion || GENRE_INFERENCE_REVISION,
      localMeta: options.localMeta || {},
      japaneseVocalEvidence,
      embeddingGenrePrediction
    };
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

function validRequestId(value) {
  const requestId = String(value || "").trim();
  return /^[A-Za-z0-9_-]{8,80}$/.test(requestId) ? requestId : "";
}

function errorPayload(error) {
  const message = String(error?.message || "");
  const classified = classifyYouTubeFailure(error);
  const code = error?.code || classified.code || "AUDIO_ANALYSIS_FAILED";
  const messages = {
    INVALID_YOUTUBE_URL: "有効なYouTube動画URLを入力してください。",
    VIDEO_UNAVAILABLE: "このYouTube動画は利用できないか、削除または非公開になっています。",
    REGION_BLOCKED: "このYouTube動画は地域制限のため取得できません。",
    AGE_RESTRICTED: "このYouTube動画は年齢制限のため取得できません。",
    START_OUT_OF_RANGE: "指定した開始位置が動画の長さを超えています。",
    YOUTUBE_RATE_LIMITED: "YouTube側で一時的に制限されています。時間を置いて再試行してください。",
    YOUTUBE_COOKIE_REQUIRED: "YouTube側のbot確認により音声を取得できません。解析用Cookieを更新してください。",
    TRANSIENT_NETWORK_ERROR: "YouTubeとの通信が一時的に失敗しました。少し待って再試行してください。",
    ANALYSIS_CANCELLED: "解析を中止しました。",
  };
  const status = code === "INVALID_YOUTUBE_URL" || code === "START_OUT_OF_RANGE" ? 400
    : code === "ANALYSIS_CANCELLED" ? 499
    : code === "YOUTUBE_RATE_LIMITED" ? 429
    : ["VIDEO_UNAVAILABLE", "REGION_BLOCKED", "AGE_RESTRICTED"].includes(code) ? 422
    : code === "YOUTUBE_COOKIE_REQUIRED" ? 503
    : 500;
  return {
    status,
    body: {
      ok: false,
      code,
      error: messages[code] || (PUBLIC_MODE ? "音声解析に失敗しました。" : message),
      detail: PUBLIC_MODE ? "" : message,
    },
  };
}

async function handleCancel(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || "{}");
    const requestId = validRequestId(body.requestId);
    if (body.action !== "cancel-youtube-analysis" || !requestId) {
      sendJson(res, 400, { ok: false, code: "INVALID_REQUEST", error: "中止リクエストが不正です。" });
      return;
    }
    const active = activeYouTubeAnalyses.get(requestId);
    if (active) active.controller.abort();
    analysisLog(requestId, "cancel-request", { active: Boolean(active) });
    sendJson(res, 200, { ok: true, cancelled: Boolean(active), requestId });
  } catch {
    sendJson(res, 400, { ok: false, code: "INVALID_REQUEST", error: "中止リクエストが不正です。" });
  }
}

async function handleAnalyze(req, res) {
  let requestId = "";
  let controller = null;
  let deadlineTimer = null;
  let stopResponseHeartbeat = () => {};
  let disconnected = false;
  let timedOut = false;
  try {
    const body = JSON.parse(await readBody(req) || "{}");
    if (PUBLIC_MODE && body.action !== "analyze-youtube") {
      sendJson(res, 403, { ok: false, code: "ACTION_NOT_ALLOWED", error: "公開APIではYouTube解析のみ利用できます。" });
      return;
    }
    if (body.action === "analyze-youtube") {
      requestId = validRequestId(body.requestId) || randomUUID();
      if (activeYouTubeAnalyses.has(requestId)) {
        sendJson(res, 409, { ok: false, code: "REQUEST_ALREADY_ACTIVE", error: "同じ解析リクエストが処理中です。" });
        return;
      }
      controller = new AbortController();
      activeYouTubeAnalyses.set(requestId, { controller, startedAt: Date.now() });
      const cancelOnDisconnect = () => {
        if (!res.writableEnded) {
          disconnected = true;
          controller.abort();
        }
      };
      req.once("aborted", cancelOnDisconnect);
      res.once("close", cancelOnDisconnect);
      deadlineTimer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, YOUTUBE_DEADLINE_MS);
      analysisLog(requestId, "start", { startSeconds: Number(body.startSeconds) || 0 });
      stopResponseHeartbeat = startJsonResponseHeartbeat(res);
      let features;
      try {
        features = await analyzeYouTube(body.youtubeUrl, {
          startSeconds: body.startSeconds,
          requestId,
          signal: controller.signal,
        });
      } catch (error) {
        if (timedOut) {
          error.code = "TRANSIENT_NETWORK_ERROR";
          error.message = "Analysis deadline exceeded.";
        }
        throw error;
      } finally {
        req.removeListener("aborted", cancelOnDisconnect);
        res.removeListener("close", cancelOnDisconnect);
      }
      if (!disconnected && !res.writableEnded) {
        sendJson(res, 200, { ok: true, requestId, source: "youtube-audio-analysis-server", features });
      }
      return;
    }
    if (body.action === "analyze-preview-url") {
      const features = await analyzePreviewUrl(body.previewUrl || body.sourceUrl, {
        durationSeconds: body.durationSeconds,
        previewMeta: body.previewMeta
      });
      sendJson(res, 200, { ok: true, source: "itunes-preview-analysis-server", features });
      return;
    }
    if (body.action === "analyze-local-file") {
      const features = await analyzeLocalFile(body.filePath || body.sourceUrl, {
        durationSeconds: body.durationSeconds,
        startSeconds: body.startSeconds,
        sourceType: body.sourceType,
        localMeta: body.localMeta
      });
      sendJson(res, 200, { ok: true, source: "local-audio-analysis-server", features });
      return;
    }
    {
      sendJson(res, 400, { ok: false, error: "Unsupported action." });
      return;
    }
  } catch (error) {
    const payload = errorPayload(error);
    analysisLog(requestId, "failed", { code: payload.body.code, disconnected, timedOut });
    if (!disconnected && !res.writableEnded) sendJson(res, payload.status, payload.body);
  } finally {
    stopResponseHeartbeat();
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (requestId && activeYouTubeAnalyses.get(requestId)?.controller === controller) {
      activeYouTubeAnalyses.delete(requestId);
    }
  }
}

const server = http.createServer(async (req, res) => {
  applyCorsHeaders(req, res);
  if (!publicRequestAllowed(req)) {
    sendJson(res, 403, { ok: false, code: "ORIGIN_NOT_ALLOWED", error: "このサイトからは解析APIを利用できません。" });
    return;
  }
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method === "GET" && req.url === "/") {
    const tools = await resolveTools();
    sendJson(res, 200, {
      ok: true,
      service: "MUSIC MEMORY FITTING ROOM audio analysis server",
      message: "Use POST /api/audio-analyze from the app, or open /health to check dependencies.",
      endpoint: `http://${HOST}:${PORT}/api/audio-analyze`,
      health: `http://${HOST}:${PORT}/health`,
      genreInferenceRevision: GENRE_INFERENCE_REVISION,
      dependencies: {
        ytDlp: Boolean(tools.ytDlp),
        ffmpeg: Boolean(tools.ffmpeg),
        cookieFile: Boolean(COOKIE_FILE),
        cookieBrowsers: COOKIE_BROWSERS,
        embeddingGenre: embeddingGenreReady(),
        embeddingGenreContract: embeddingGenreContractStatus(),
        embeddingGenreLive: EMBEDDING_GENRE_LIVE_ENABLED,
        embeddingGenreConsensus: EMBEDDING_GENRE_CONSENSUS_ENABLED,
        embeddingGenrePairwiseReranker: EMBEDDING_GENRE_PAIRWISE_RERANKER_ENABLED,
        embeddingGenrePairwiseRerankerMode: EMBEDDING_GENRE_PAIRWISE_RERANKER_POLICY.mode,
        embeddingGenreIndependentPairReranker: EMBEDDING_GENRE_INDEPENDENT_PAIR_RERANKER_ENABLED,
        embeddingGenreIndependentPairRerankerMode: EMBEDDING_GENRE_INDEPENDENT_PAIR_RERANKER_POLICY.mode,
        localSegmentConsensus: LOCAL_SEGMENT_CONSENSUS_ENABLED,
        classificationScope: "track",
        trackSampleCount: TRACK_SAMPLE_COUNT,
        trackSampleWindowSeconds: TRACK_SAMPLE_WINDOW_SECONDS,
        japaneseVocalEvidence: japaneseVocalEvidenceReady(),
        sharedLocalGenre: fs.existsSync(LOCAL_GENRE_MODEL_PATH)
      }
    });
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    const tools = await resolveTools();
    sendJson(res, 200, {
      ok: true,
      service: "MUSIC MEMORY FITTING ROOM audio analysis server",
      endpoint: `http://${HOST}:${PORT}/api/audio-analyze`,
      genreInferenceRevision: GENRE_INFERENCE_REVISION,
      dependencies: {
        ytDlp: Boolean(tools.ytDlp),
        ffmpeg: Boolean(tools.ffmpeg),
        ytDlpPath: tools.ytDlp || "",
        ffmpegPath: tools.ffmpeg || "",
        localBin: LOCAL_BIN,
        cookieFile: COOKIE_FILE ? "(configured)" : "",
        cookieBrowsers: COOKIE_BROWSERS,
        embeddingGenre: embeddingGenreReady(),
        embeddingGenreContract: embeddingGenreContractStatus(),
        embeddingGenreLive: EMBEDDING_GENRE_LIVE_ENABLED,
        embeddingGenreConsensus: EMBEDDING_GENRE_CONSENSUS_ENABLED,
        embeddingGenrePairwiseReranker: EMBEDDING_GENRE_PAIRWISE_RERANKER_ENABLED,
        embeddingGenrePairwiseRerankerMode: EMBEDDING_GENRE_PAIRWISE_RERANKER_POLICY.mode,
        embeddingGenreIndependentPairReranker: EMBEDDING_GENRE_INDEPENDENT_PAIR_RERANKER_ENABLED,
        embeddingGenreIndependentPairRerankerMode: EMBEDDING_GENRE_INDEPENDENT_PAIR_RERANKER_POLICY.mode,
        localSegmentConsensus: LOCAL_SEGMENT_CONSENSUS_ENABLED,
        classificationScope: "track",
        trackSampleCount: TRACK_SAMPLE_COUNT,
        trackSampleWindowSeconds: TRACK_SAMPLE_WINDOW_SECONDS,
        japaneseVocalEvidence: japaneseVocalEvidenceReady(),
        sharedLocalGenre: fs.existsSync(LOCAL_GENRE_MODEL_PATH),
        sharedLocalGenreModel: fs.existsSync(LOCAL_GENRE_MODEL_PATH) ? LOCAL_GENRE_MODEL_PATH : "",
        embeddingGenreModel: fs.existsSync(EMBEDDING_GENRE_MODEL_PATH) ? EMBEDDING_GENRE_MODEL_PATH : "",
        embeddingGenrePython: fs.existsSync(EMBEDDING_GENRE_PYTHON) ? EMBEDDING_GENRE_PYTHON : "",
        japaneseVocalModel: fs.existsSync(JAPANESE_VOCAL_MODEL_PATH) ? JAPANESE_VOCAL_MODEL_PATH : ""
      }
    });
    return;
  }
  if (req.method === "GET" && req.url === "/api/audio-analyze") {
    const tools = await resolveTools();
    sendJson(res, 200, {
      ok: true,
      service: "MUSIC MEMORY FITTING ROOM audio analysis server",
      message: "This endpoint is ready. The app sends YouTube URLs here with POST; opening it directly in a browser only shows this status.",
      method: "POST",
      endpoint: `http://${HOST}:${PORT}/api/audio-analyze`,
      health: `http://${HOST}:${PORT}/health`,
      genreInferenceRevision: GENRE_INFERENCE_REVISION,
      dependencies: {
        ytDlp: Boolean(tools.ytDlp),
        ffmpeg: Boolean(tools.ffmpeg),
        cookieFile: Boolean(COOKIE_FILE),
        cookieBrowsers: COOKIE_BROWSERS,
        embeddingGenre: embeddingGenreReady(),
        embeddingGenreContract: embeddingGenreContractStatus(),
        embeddingGenreLive: EMBEDDING_GENRE_LIVE_ENABLED,
        embeddingGenreConsensus: EMBEDDING_GENRE_CONSENSUS_ENABLED,
        embeddingGenrePairwiseReranker: EMBEDDING_GENRE_PAIRWISE_RERANKER_ENABLED,
        embeddingGenrePairwiseRerankerMode: EMBEDDING_GENRE_PAIRWISE_RERANKER_POLICY.mode,
        embeddingGenreIndependentPairReranker: EMBEDDING_GENRE_INDEPENDENT_PAIR_RERANKER_ENABLED,
        embeddingGenreIndependentPairRerankerMode: EMBEDDING_GENRE_INDEPENDENT_PAIR_RERANKER_POLICY.mode,
        localSegmentConsensus: LOCAL_SEGMENT_CONSENSUS_ENABLED,
        classificationScope: "track",
        trackSampleCount: TRACK_SAMPLE_COUNT,
        trackSampleWindowSeconds: TRACK_SAMPLE_WINDOW_SECONDS,
        sharedLocalGenre: fs.existsSync(LOCAL_GENRE_MODEL_PATH)
      }
    });
    return;
  }
  if (req.method === "POST" && req.url === "/api/audio-analyze/cancel") {
    await handleCancel(req, res);
    return;
  }
  if (req.method === "POST" && (req.url === "/api/audio-analyze" || req.url === "/")) {
    if (PUBLIC_MODE) {
      const client = requestClientAddress(req.headers, req.socket.remoteAddress);
      const rate = publicRateLimiter.consume(client);
      res.setHeader("X-RateLimit-Limit", String(PUBLIC_RATE_LIMIT));
      res.setHeader("X-RateLimit-Remaining", String(rate.remaining));
      if (!rate.allowed) {
        res.setHeader("Retry-After", String(rate.retryAfterSeconds));
        sendJson(res, 429, { ok: false, code: "RATE_LIMITED", error: "解析回数の上限に達しました。しばらく待ってから再試行してください。" });
        return;
      }
      if (publicActiveRequests >= PUBLIC_MAX_CONCURRENT) {
        res.setHeader("Retry-After", "20");
        sendJson(res, 503, { ok: false, code: "ANALYZER_BUSY", error: "解析サーバーは処理中です。少し待ってから再試行してください。" });
        return;
      }
      publicActiveRequests += 1;
      try {
        await handleAnalyze(req, res);
      } finally {
        publicActiveRequests -= 1;
      }
      return;
    }
    await handleAnalyze(req, res);
    return;
  }
  sendJson(res, 404, {
    ok: false,
    error: "Not found.",
    endpoint: `http://${HOST}:${PORT}/api/audio-analyze`,
    health: `http://${HOST}:${PORT}/health`
  });
});

server.listen(PORT, HOST, () => {
  console.log(`MUSIC MEMORY FITTING ROOM audio analysis server`);
  console.log(`Endpoint: http://${HOST}:${PORT}/api/audio-analyze`);
  console.log(`Health:   http://${HOST}:${PORT}/health`);
  console.log(`Genre:    ${GENRE_INFERENCE_REVISION}`);
});
