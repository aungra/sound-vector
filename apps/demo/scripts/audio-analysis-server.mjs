import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const PORT = Number(process.env.MMFR_AUDIO_PORT || 4194);
const HOST = process.env.MMFR_AUDIO_HOST || "127.0.0.1";
const MAX_BYTES = 80 * 1024 * 1024;
const ANALYSIS_WINDOW_SECONDS = Math.max(0, Number(process.env.MMFR_ANALYSIS_SECONDS || 120));
const ROOT_DIR = process.cwd();
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
const YT_DLP_SHARED_ARGS = [
  "--js-runtimes",
  `node:${process.execPath}`
];

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(data, null, 2));
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
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out.`));
    }, options.timeoutMs || 180000);
    child.stdout.on("data", chunk => stdout.push(chunk));
    child.stderr.on("data", chunk => stderr.push(chunk));
    child.on("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", code => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout);
      const err = Buffer.concat(stderr).toString("utf8");
      if (code === 0) resolve({ stdout: out, stderr: err });
      else reject(new Error(`${command} failed (${code}): ${err.trim()}`));
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
  const ytDlp = await commandExists("yt-dlp");
  const ffmpeg = await commandExists("ffmpeg");
  return { ytDlp, ffmpeg };
}

async function commandAvailable(command) {
  try {
    await run(command, ["--version"], { timeoutMs: 8000 });
    return true;
  } catch {
    return false;
  }
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
    pcmSketch: typeof raw.pcmSketch === "string" ? raw.pcmSketch : "",
    pcmSketchEncoding: raw.pcmSketchEncoding || "",
    pcmSketchSampleRate: Number(raw.pcmSketchSampleRate || 0),
    pcmSketchDuration: Number(raw.pcmSketchDuration || 0),
    pcmSketchFrameCount: Number(raw.pcmSketchFrameCount || 0)
  };
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
  const centroid = Math.round(centroidWeight ? centroidSum / centroidWeight : 1200);
  const bassRatio = spectralPowerSum ? bassSum / spectralPowerSum : 0;
  const temporalProfile = Array.from({ length: 16 }, (_, i) => {
    const index = Math.min(rmsFrames.length - 1, Math.round(i * (rmsFrames.length - 1) / 15));
    return clamp01((rmsFrames[index] || 0) / rmsMax);
  });
  const onsetMax = Math.max(...envelope, 1);
  const bassFrameMax = Math.max(...bassFrameRaw, 1);
  const chromaFrameMax = Math.max(...chromaFrameRows.flat(), 1);
  const bandFrameMax = Math.max(...bandFrameRows.flat(), 1);
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
    bandTimeline: bandFrameRows.map(row => row.map(value => value / bandFrameMax)),
    ...pcmSketch
  }, { energy, bass: clamp01(Math.sqrt(bassRatio) * 2.4), brightness: clamp01((centroid - 400) / 5200), onset, temporalProfile });

  return {
    source: "youtube-audio-analysis-server",
    tempo,
    energy,
    rms: energy,
    bass: clamp01(Math.sqrt(bassRatio) * 2.4),
    brightness: clamp01((centroid - 400) / 5200),
    spectralCentroid: centroid,
    rhythm: clamp01(onset * 1.4),
    onset,
    phase: clamp01(zcrSum / frames * 24) * Math.PI * 2,
    chroma: chroma.map(value => value / chromaMax),
    temporalProfile,
    detail
  };
}

async function analyzeYouTube(youtubeUrl, options = {}) {
  if (!youtubeUrl || !/^https?:\/\//.test(youtubeUrl)) throw new Error("YouTube URL is missing.");
  const requestedStart = Number(options.startSeconds);
  const startSeconds = Number.isFinite(requestedStart) && requestedStart >= 0
    ? Math.floor(requestedStart)
    : parseYouTubeStartSeconds(youtubeUrl);
  const tools = await resolveTools();
  const missing = [
    tools.ytDlp ? "" : "yt-dlp",
    tools.ffmpeg ? "" : "ffmpeg"
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Missing required command: ${missing.join(", ")}. Run "Install Audio Tools.command" first, then restart this server.`);
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mmfr-audio-"));
  const outputTemplate = path.join(tempDir, "source.%(ext)s");
  try {
    let youtubeMeta = {};
    try {
      const metaResult = await run(tools.ytDlp, [
        ...YT_DLP_SHARED_ARGS,
        "--no-playlist",
        "--dump-single-json",
        "--skip-download",
        youtubeUrl
      ], { timeoutMs: 45000 });
      const parsed = JSON.parse(metaResult.stdout.toString("utf8") || "{}");
      youtubeMeta = {
        title: parsed.title || "",
        uploader: parsed.uploader || parsed.channel || "",
        categories: Array.isArray(parsed.categories) ? parsed.categories.slice(0, 8) : [],
        tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 24) : []
      };
    } catch {}
    await run(tools.ytDlp, [
      ...YT_DLP_SHARED_ARGS,
      "--no-playlist",
      "--ffmpeg-location", path.dirname(tools.ffmpeg),
      "--max-filesize", "80M",
      "-f", "bestaudio/best",
      "-o", outputTemplate,
      youtubeUrl
    ], { timeoutMs: 240000 });
    const files = await fs.promises.readdir(tempDir);
    const sourceFile = files.find(file => file.startsWith("source."));
    if (!sourceFile) throw new Error("Downloaded audio file was not found.");
    const sourcePath = path.join(tempDir, sourceFile);
    const ffmpegArgs = [
      "-hide_banner",
      "-loglevel", "error"
    ];
    if (startSeconds > 0) ffmpegArgs.push("-ss", String(startSeconds));
    ffmpegArgs.push("-i", sourcePath);
    if (ANALYSIS_WINDOW_SECONDS > 0) ffmpegArgs.push("-t", String(ANALYSIS_WINDOW_SECONDS));
    ffmpegArgs.push(
      "-ac", "1",
      "-ar", "22050",
      "-f", "f32le",
      "pipe:1"
    );
    const { stdout } = await run(tools.ffmpeg, [
      ...ffmpegArgs
    ], { timeoutMs: 180000 });
    if (!stdout.length) throw new Error(`No audio was decoded from ${startSeconds}s. Try an earlier start time.`);
    const features = analyzeFloat32Pcm(stdout, 22050);
    return {
      ...features,
      sourceUrl: youtubeUrl,
      normalizedUrl: youtubeUrl,
      startSeconds,
      analysisWindowSeconds: ANALYSIS_WINDOW_SECONDS,
      youtubeMeta
    };
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

async function handleAnalyze(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || "{}");
    if (body.action !== "analyze-youtube") {
      sendJson(res, 400, { ok: false, error: "Unsupported action." });
      return;
    }
    const features = await analyzeYouTube(body.youtubeUrl, { startSeconds: body.startSeconds });
    sendJson(res, 200, { ok: true, source: "youtube-audio-analysis-server", features });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
}

const server = http.createServer(async (req, res) => {
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
      dependencies: {
        ytDlp: Boolean(tools.ytDlp),
        ffmpeg: Boolean(tools.ffmpeg)
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
      dependencies: {
        ytDlp: Boolean(tools.ytDlp),
        ffmpeg: Boolean(tools.ffmpeg),
        ytDlpPath: tools.ytDlp || "",
        ffmpegPath: tools.ffmpeg || "",
        localBin: LOCAL_BIN
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
      dependencies: {
        ytDlp: Boolean(tools.ytDlp),
        ffmpeg: Boolean(tools.ffmpeg)
      }
    });
    return;
  }
  if (req.method === "POST" && (req.url === "/api/audio-analyze" || req.url === "/")) {
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
});
