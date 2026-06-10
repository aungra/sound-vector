import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const SEEDS_PATH = path.join(TRAINING_DIR, "source-seeds.json");
const CANDIDATES_PATH = path.join(TRAINING_DIR, "source-candidates.json");
const VERIFIED_PATH = path.join(TRAINING_DIR, "verified-dataset.json");
const OUT_PATH = path.join(TRAINING_DIR, "genre-dataset.json");
const REPORT_PATH = path.join(TRAINING_DIR, "auto-collect-report.json");
const LOCAL_BIN = path.join(ROOT, ".tools", "bin");
const YT_DLP = process.env.YT_DLP_PATH || path.join(LOCAL_BIN, "yt-dlp-local");
const DEFAULT_COOKIE_FILE = path.join(TRAINING_DIR, "youtube-cookies.txt");

const PER_GENRE = Math.max(1, Number(process.env.MMFR_GENRE_COLLECT_PER_GENRE || 20));
const CANDIDATE_TARGET = Math.max(PER_GENRE, Number(process.env.MMFR_GENRE_CANDIDATES_PER_GENRE || 40));
const SEARCH_LIMIT = Math.max(8, Number(process.env.MMFR_GENRE_SEARCH_LIMIT || 8));
const CONCURRENCY = Math.max(1, Number(process.env.MMFR_GENRE_COLLECT_CONCURRENCY || 3));
const VALIDATE_ANALYSIS = process.env.MMFR_GENRE_COLLECT_VALIDATE === "1";
const PROMOTE_VERIFIED = process.env.MMFR_GENRE_COLLECT_PROMOTE === "1";
const AUDIO_ENDPOINT = process.env.MMFR_AUDIO_ENDPOINT || "http://127.0.0.1:4194/api/audio-analyze";
const VALIDATE_TIMEOUT_MS = Math.max(5000, Number(process.env.MMFR_GENRE_VALIDATE_TIMEOUT_MS || 45000));
const COOKIE_BROWSERS = (process.env.MMFR_YTDLP_COOKIES_FROM_BROWSER
  || (process.platform === "darwin" ? "chrome,safari,firefox" : "chrome,firefox"))
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);
const COOKIE_FILE = process.env.MMFR_YTDLP_COOKIES_FILE || (fs.existsSync(DEFAULT_COOKIE_FILE) ? DEFAULT_COOKIE_FILE : "");

const REJECT_TITLE_PATTERN = /\b(reaction|review|tutorial|lesson|explained|documentary|interview|podcast|live stream|livestream|full album|album stream|hour mix|dj set|karaoke|instrumental remake|cover version|cover by|slowed|reverb|nightcore|8d audio)\b/i;
const POSITIVE_TITLE_PATTERN = /\b(official audio|official video|provided to youtube|topic|remastered|audio)\b/i;

function loadSeeds() {
  const payload = JSON.parse(fs.readFileSync(SEEDS_PATH, "utf8"));
  const genres = Array.isArray(payload.genres) ? payload.genres : [];
  return genres.map(entry => ({
    genre: String(entry.genre || "").trim(),
    macroGenre: String(entry.macroGenre || "").trim(),
    searchTerms: Array.isArray(entry.searchTerms) ? entry.searchTerms.map(String) : [],
    tracks: Array.isArray(entry.tracks) ? entry.tracks.map(track => ({
      artist: String(track.artist || "").trim(),
      title: String(track.title || "").trim()
    })).filter(track => track.artist && track.title) : []
  })).filter(entry => entry.genre && entry.macroGenre);
}

function ytDlpBaseArgs() {
  return [
    "--js-runtimes",
    `node:${process.execPath}`,
    "--remote-components",
    "ejs:github"
  ];
}

function ytDlpCookieArgSets() {
  const sets = [];
  if (COOKIE_FILE) sets.push(["--cookies", COOKIE_FILE]);
  for (const browser of COOKIE_BROWSERS) sets.push(["--cookies-from-browser", browser]);
  sets.push([]);
  return sets;
}

async function runYtDlp(args, options = {}) {
  const errors = [];
  for (const cookieArgs of ytDlpCookieArgSets()) {
    try {
      return await run(YT_DLP, [...ytDlpBaseArgs(), ...cookieArgs, ...args], options);
    } catch (error) {
      errors.push(`${cookieArgs.join(" ") || "no-cookies"}: ${error.message}`);
    }
  }
  throw new Error(errors.join("\n---\n"));
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out.`));
    }, options.timeoutMs || 60000);
    child.stdout.on("data", chunk => stdout.push(chunk));
    child.stderr.on("data", chunk => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", code => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code === 0) resolve({ stdout: out, stderr: err });
      else reject(new Error(`${command} failed (${code}): ${err.trim()}`));
    });
  });
}

function postJson(endpoint, body) {
  return new Promise((resolve, reject) => {
    const target = new URL(endpoint);
    const payload = JSON.stringify(body);
    const transport = target.protocol === "https:" ? https : http;
    const request = transport.request({
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    }, response => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { raw += chunk; });
      response.on("end", () => {
        try {
          const json = raw ? JSON.parse(raw) : {};
          resolve({ ok: response.statusCode >= 200 && response.statusCode < 300 && json.ok !== false, json });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.setTimeout(VALIDATE_TIMEOUT_MS, () => {
      request.destroy(new Error(`analysis validation timed out after ${VALIDATE_TIMEOUT_MS}ms`));
    });
    request.write(payload);
    request.end();
  });
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalizeText(value).split(/\s+/).filter(token => token.length > 1));
}

function tokenOverlap(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let hits = 0;
  for (const token of left) if (right.has(token)) hits += 1;
  return hits / Math.max(left.size, right.size);
}

function normaliseYoutubeUrl(idOrUrl) {
  const text = String(idOrUrl || "").trim();
  if (!text) return "";
  if (/^https?:\/\//.test(text)) return text;
  return `https://www.youtube.com/watch?v=${text}`;
}

function buildQueries(entry) {
  const queries = [];
  for (const track of entry.tracks) {
    queries.push({
      kind: "canonical-track",
      canonicalArtist: track.artist,
      canonicalTitle: track.title,
      query: `${track.artist} ${track.title} official audio`
    });
    queries.push({
      kind: "canonical-topic",
      canonicalArtist: track.artist,
      canonicalTitle: track.title,
      query: `${track.artist} ${track.title} topic`
    });
  }
  for (const term of entry.searchTerms) {
    queries.push({
      kind: "genre-search",
      canonicalArtist: "",
      canonicalTitle: "",
      query: term
    });
  }
  return [...new Map(queries.map(item => [item.query.toLowerCase(), item])).values()];
}

function scoreCandidate(entry, queryInfo, item) {
  const title = String(item.title || "");
  const channelName = String(item.uploader || item.channel || "");
  const duration = Number(item.duration || 0);
  const canonical = `${queryInfo.canonicalArtist} ${queryInfo.canonicalTitle}`;
  const channel = normalizeText(channelName);
  const titleText = normalizeText(title);
  const titleMatch = canonical.trim() ? tokenOverlap(canonical, title) : 0;
  const genreMatch = tokenOverlap(entry.genre, `${title} ${item.description || ""}`);
  let score = queryInfo.kind === "canonical-track" ? 48 : queryInfo.kind === "canonical-topic" ? 44 : 30;
  score += titleMatch * 32;
  score += genreMatch * 8;
  if (POSITIVE_TITLE_PATTERN.test(`${title} ${channelName}`)) score += 12;
  if (channel.includes("topic")) score += 10;
  if (channel.includes("official")) score += 8;
  if (duration >= 90 && duration <= 540) score += 8;
  if (duration > 900) score -= 18;
  if (REJECT_TITLE_PATTERN.test(titleText)) score -= 60;
  if (titleText.includes("live")) score -= 18;
  if (titleText.includes("cover")) score -= 22;
  if (titleText.includes("mix") && duration > 540) score -= 22;
  const rejectReason = rejectReasonForCandidate(item, score);
  return {
    matchScore: Math.max(0, Math.min(100, Math.round(score))),
    rejectReason
  };
}

function rejectReasonForCandidate(item, score) {
  const title = String(item.title || "").toLowerCase();
  const duration = Number(item.duration || 0);
  if (!item.id && !item.webpage_url) return "missing-youtube-id";
  if (duration && duration < 55) return "too-short";
  if (duration && duration > 1800) return "too-long";
  if (REJECT_TITLE_PATTERN.test(title)) return "excluded-title";
  if (score < 52) return "low-match-score";
  return "";
}

async function searchCandidates(query) {
  const target = `ytsearch${SEARCH_LIMIT}:${query}`;
  const { stdout } = await runYtDlp([
    "--dump-json",
    "--no-playlist",
    "--skip-download",
    target
  ], { timeoutMs: 70000 });
  return stdout
    .split(/\n+/)
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

async function candidateAnalyzes(url) {
  if (!VALIDATE_ANALYSIS) return { ok: false, skipped: true, error: "validation-disabled" };
  try {
    const response = await postJson(AUDIO_ENDPOINT, { action: "analyze-youtube", youtubeUrl: url });
    return response.ok
      ? { ok: true, features: response.json?.features || response.json?.audioFeatures || null }
      : { ok: false, error: response.json?.error || "analysis failed" };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function existingVerifiedUrls() {
  const payloads = [loadJson(VERIFIED_PATH, null), loadJson(OUT_PATH, null)].filter(Boolean);
  const urls = new Set();
  for (const payload of payloads) {
    const items = Array.isArray(payload) ? payload : payload.items || [];
    for (const item of items) if (item.youtubeUrl) urls.add(item.youtubeUrl);
  }
  return urls;
}

async function collectForGenre(entry, usedUrls) {
  const selected = [];
  const verified = [];
  const raw = [];
  const queryList = buildQueries(entry);
  const seenUrls = new Set();

  for (const queryInfo of queryList) {
    let candidates = [];
    try {
      candidates = await searchCandidates(queryInfo.query);
    } catch (error) {
      raw.push({ query: queryInfo.query, error: error.message });
      continue;
    }
    raw.push({ query: queryInfo.query, count: candidates.length, titles: candidates.slice(0, 4).map(item => item.title) });
    for (const item of candidates) {
      const url = normaliseYoutubeUrl(item.webpage_url || item.id);
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);
      const score = scoreCandidate(entry, queryInfo, item);
      const row = {
        source: "youtube-search",
        query: queryInfo.query,
        queryKind: queryInfo.kind,
        youtubeUrl: url,
        youtubeTitle: item.title || "",
        channelName: item.uploader || item.channel || "",
        duration: Number(item.duration || 0),
        canonicalArtist: queryInfo.canonicalArtist,
        canonicalTitle: queryInfo.canonicalTitle,
        genre: entry.genre,
        macroGenre: entry.macroGenre,
        matchScore: score.matchScore,
        audioOk: false,
        rejectReason: score.rejectReason,
        verifiedAt: ""
      };
      selected.push(row);
      if (!row.rejectReason && !usedUrls.has(url) && verified.length < PER_GENRE) {
        const validation = await candidateAnalyzes(url);
        if (validation.ok) {
          row.audioOk = true;
          row.verifiedAt = new Date().toISOString();
          usedUrls.add(url);
          verified.push({ ...row, memo: `Verified YouTube source: ${row.query}` });
          process.stdout.write("+");
        } else if (validation.skipped) {
          process.stdout.write("?");
        } else {
          row.rejectReason = `audio-validation-failed: ${validation.error}`;
          process.stdout.write(".");
        }
      }
      if (selected.filter(candidate => !candidate.rejectReason).length >= CANDIDATE_TARGET && verified.length >= PER_GENRE) {
        return { selected, verified, raw };
      }
    }
  }

  selected.sort((a, b) => b.matchScore - a.matchScore || a.youtubeTitle.localeCompare(b.youtubeTitle));
  return { selected: selected.slice(0, CANDIDATE_TARGET), verified, raw };
}

function summarizeByGenre(items, seeds) {
  return seeds.map(seed => {
    const list = items.filter(item => item.genre === seed.genre);
    return {
      genre: seed.genre,
      macroGenre: seed.macroGenre,
      count: list.length,
      needed: Math.max(0, PER_GENRE - list.length)
    };
  });
}

async function main() {
  fs.mkdirSync(TRAINING_DIR, { recursive: true });
  const seeds = loadSeeds();
  const usedUrls = existingVerifiedUrls();
  const allCandidates = [];
  const allVerified = [];
  const report = [];

  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, seeds.length) }, async () => {
    while (cursor < seeds.length) {
      const entry = seeds[cursor++];
      process.stdout.write(`${entry.genre} ... `);
      const result = await collectForGenre(entry, usedUrls);
      allCandidates.push(...result.selected);
      allVerified.push(...result.verified);
      report.push({
        genre: entry.genre,
        macroGenre: entry.macroGenre,
        candidateCount: result.selected.length,
        verifiedCount: result.verified.length,
        raw: result.raw
      });
      console.log(` candidates:${result.selected.length} verified:${result.verified.length}`);
    }
  });
  await Promise.all(workers);

  allCandidates.sort((a, b) => a.macroGenre.localeCompare(b.macroGenre) || a.genre.localeCompare(b.genre) || b.matchScore - a.matchScore);
  allVerified.sort((a, b) => a.macroGenre.localeCompare(b.macroGenre) || a.genre.localeCompare(b.genre) || b.matchScore - a.matchScore);

  const collectedAt = new Date().toISOString();
  const candidatePayload = {
    description: "YouTube-centered source candidates for genre calibration. Candidates are scored from canonical metadata, title/channel quality, duration, and reject rules.",
    collectedAt,
    perGenre: PER_GENRE,
    candidateTarget: CANDIDATE_TARGET,
    items: allCandidates,
    summary: summarizeByGenre(allCandidates.filter(item => !item.rejectReason), seeds)
  };
  const verifiedPayload = {
    description: "Verified YouTube URLs whose audio could be analyzed by the local audio server. Use this as the source for genre training.",
    collectedAt,
    endpoint: AUDIO_ENDPOINT,
    perGenre: PER_GENRE,
    items: allVerified,
    missing: summarizeByGenre(allVerified, seeds).filter(row => row.needed > 0)
  };

  fs.writeFileSync(CANDIDATES_PATH, JSON.stringify(candidatePayload, null, 2));
  fs.writeFileSync(VERIFIED_PATH, JSON.stringify(verifiedPayload, null, 2));
  fs.writeFileSync(REPORT_PATH, JSON.stringify({ collectedAt, perGenre: PER_GENRE, candidateTarget: CANDIDATE_TARGET, validateAnalysis: VALIDATE_ANALYSIS, report }, null, 2));

  if (PROMOTE_VERIFIED) {
    fs.writeFileSync(OUT_PATH, JSON.stringify({
      description: "Promoted verified YouTube URLs for genre calibration. Generated from verified-dataset.json.",
      collectedAt,
      sourceDataset: "verified-dataset.json",
      items: allVerified.map(item => ({
        genre: item.genre,
        macroGenre: item.macroGenre,
        youtubeUrl: item.youtubeUrl,
        memo: item.memo,
        source: item.source,
        query: item.query,
        youtubeTitle: item.youtubeTitle,
        channelName: item.channelName,
        canonicalArtist: item.canonicalArtist,
        canonicalTitle: item.canonicalTitle,
        matchScore: item.matchScore,
        audioOk: item.audioOk,
        verifiedAt: item.verifiedAt
      })),
      missing: verifiedPayload.missing
    }, null, 2));
  }

  console.log(`\nCandidates: ${allCandidates.length}`);
  console.log(`Verified: ${allVerified.length}${VALIDATE_ANALYSIS ? "" : " (validation disabled)"}`);
  console.log(`Wrote ${path.relative(ROOT, CANDIDATES_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, VERIFIED_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, REPORT_PATH)}`);
  if (PROMOTE_VERIFIED) console.log(`Wrote ${path.relative(ROOT, OUT_PATH)}`);
  if (!VALIDATE_ANALYSIS) console.log("Run with MMFR_GENRE_COLLECT_VALIDATE=1 after starting the audio server to create real verified data.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
