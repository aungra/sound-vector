import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const OUT_PATH = path.join(ROOT, "genre-training", "genre-dataset.json");
const REPORT_PATH = path.join(ROOT, "genre-training", "auto-collect-report.json");
const LOCAL_BIN = path.join(ROOT, ".tools", "bin");
const YT_DLP = process.env.YT_DLP_PATH || path.join(LOCAL_BIN, "yt-dlp-local");
const PER_GENRE = Math.max(1, Number(process.env.MMFR_GENRE_COLLECT_PER_GENRE || 1));
const SEARCH_LIMIT = Math.max(PER_GENRE + 2, Number(process.env.MMFR_GENRE_SEARCH_LIMIT || 6));
const CONCURRENCY = Math.max(1, Number(process.env.MMFR_GENRE_COLLECT_CONCURRENCY || 4));
const VALIDATE_ANALYSIS = process.env.MMFR_GENRE_COLLECT_VALIDATE === "1";
const AUDIO_ENDPOINT = process.env.MMFR_AUDIO_ENDPOINT || "http://127.0.0.1:4194/api/audio-analyze";

const genreQueries = [
  { genre: "アンビエント", queries: ["ambient music classic track", "ambient electronic representative track", "Brian Eno ambient track"] },
  { genre: "ドローン", queries: ["drone music representative track", "drone ambient classic track", "drone music track"] },
  { genre: "ノイズミュージック", queries: ["noise music track", "harsh noise music track", "Merzbow noise track", "experimental noise music"] },
  { genre: "電子音楽", queries: ["electronic music representative track", "electronic music classic track", "electronic music track"] },
  { genre: "テクノ", queries: ["techno classic track", "detroit techno representative track", "minimal techno track"] },
  { genre: "ハウス", queries: ["house music classic track", "house music representative track", "deep house track"] },
  { genre: "ディープ・ハウス", queries: ["deep house classic track", "deep house representative track", "deep house music track"] },
  { genre: "トランス", queries: ["trance classic track", "trance music representative track", "uplifting trance track"] },
  { genre: "ドラムンベース", queries: ["drum and bass classic track", "dnb representative track", "jungle drum and bass track"] },
  { genre: "ダブステップ", queries: ["dubstep classic track", "dubstep representative track", "dubstep music track"] },
  { genre: "チップチューン", queries: ["chiptune representative track", "8-bit chiptune classic track", "chiptune music track"] },
  { genre: "ヒップホップ", queries: ["hip hop classic track", "hip hop representative track", "old school hip hop track"] },
  { genre: "トラップ", queries: ["trap music representative track", "trap music classic track", "trap beat track"] },
  { genre: "レゲエ", queries: ["reggae classic track", "reggae representative track", "roots reggae track"] },
  { genre: "ダブ", queries: ["dub reggae classic track", "dub music representative track", "king tubby dub track"] },
  { genre: "ロック", queries: ["rock classic track", "rock representative track", "classic rock track"] },
  { genre: "パンク", queries: ["punk rock classic track", "punk representative track", "punk rock track"] },
  { genre: "ハードコア", queries: ["hardcore punk classic track", "hardcore representative track", "hardcore punk track"] },
  { genre: "メタル", queries: ["metal classic track", "heavy metal representative track", "heavy metal track"] },
  { genre: "ジャズ", queries: ["jazz classic track", "jazz representative track", "bebop jazz track"] },
  { genre: "ファンク", queries: ["funk classic track", "funk representative track", "funk music track"] },
  { genre: "ソウルミュージック", queries: ["soul music classic track", "soul representative track", "soul music track", "Aretha Franklin Respect", "Otis Redding Try a Little Tenderness", "Marvin Gaye soul track", "Sam Cooke soul track", "Al Green soul track"] },
  { genre: "ディスコ", queries: ["disco classic track", "disco representative track", "disco music track", "Bee Gees Stayin Alive", "Donna Summer I Feel Love", "Chic Le Freak", "Gloria Gaynor I Will Survive", "Earth Wind Fire September"] },
  { genre: "シティ・ポップ", queries: ["city pop classic track", "city pop representative track", "Japanese city pop track"] },
  { genre: "J-POP", queries: ["J-POP representative track", "JPOP classic track", "Japanese pop track"] },
  { genre: "アニメソング", queries: ["anime song representative track", "anisong classic track", "anime opening song"] },
  { genre: "クラシック音楽", queries: ["classical music representative piece", "classical music famous piece", "classical music performance"] },
  { genre: "オペラ", queries: ["opera representative aria", "opera famous aria", "opera aria performance"] },
  { genre: "フォーク", queries: ["folk music classic track", "folk representative track", "folk song"] },
  { genre: "ワールドミュージック", queries: ["world music representative track", "world music classic track", "traditional world music track", "Youssou N'Dour track", "Nusrat Fateh Ali Khan track", "Ali Farka Toure track", "Buena Vista Social Club track", "Tinariwen track"] }
];

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out.`));
    }, options.timeoutMs || 45000);
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
    request.write(payload);
    request.end();
  });
}

async function candidateAnalyzes(url) {
  if (!VALIDATE_ANALYSIS) return { ok: true };
  try {
    const response = await postJson(AUDIO_ENDPOINT, { action: "analyze-youtube", youtubeUrl: url });
    return response.ok
      ? { ok: true }
      : { ok: false, error: response.json?.error || "analysis failed" };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function normaliseYoutubeUrl(idOrUrl) {
  const text = String(idOrUrl || "").trim();
  if (!text) return "";
  if (/^https?:\/\//.test(text)) return text;
  return `https://www.youtube.com/watch?v=${text}`;
}

function candidateOk(item) {
  const title = String(item.title || "").toLowerCase();
  const duration = Number(item.duration || 0);
  if (!item.id && !item.webpage_url) return false;
  if (duration && (duration < 55 || duration > 1800)) return false;
  if (/\b(reaction|review|tutorial|lesson|explained|documentary|interview|podcast|live stream|hour mix|full album|album stream)\b/i.test(title)) return false;
  return true;
}

async function searchCandidates(query) {
  const target = `ytsearch${SEARCH_LIMIT}:${query}`;
  const { stdout } = await run(YT_DLP, [
    "--dump-json",
    "--no-playlist",
    "--skip-download",
    target
  ], { timeoutMs: 60000 });
  return stdout
    .split(/\n+/)
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function loadExistingItems() {
  if (!fs.existsSync(OUT_PATH)) return [];
  try {
    const payload = JSON.parse(fs.readFileSync(OUT_PATH, "utf8"));
    return Array.isArray(payload.items) ? payload.items : [];
  } catch {
    return [];
  }
}

async function collectForGenre(entry, usedUrls, targetCount = PER_GENRE) {
  const selected = [];
  const raw = [];
  for (const query of entry.queries) {
    let candidates = [];
    try {
      candidates = await searchCandidates(query);
    } catch (error) {
      raw.push({ query, error: error.message });
      continue;
    }
    raw.push({ query, count: candidates.length, titles: candidates.slice(0, 4).map(item => item.title) });
    for (const candidate of candidates) {
      if (!candidateOk(candidate)) continue;
      const url = normaliseYoutubeUrl(candidate.webpage_url || candidate.id);
      if (!url || usedUrls.has(url)) continue;
      const validation = await candidateAnalyzes(url);
      if (!validation.ok) {
        raw.push({ query, skippedUrl: url, validationError: validation.error });
        continue;
      }
      usedUrls.add(url);
      selected.push({
        genre: entry.genre,
        youtubeUrl: url,
        memo: `Auto-collected from YouTube search: ${query}`,
        title: candidate.title || "",
        duration: candidate.duration || 0,
        uploader: candidate.uploader || candidate.channel || ""
      });
      if (selected.length >= targetCount) return { selected, raw };
    }
  }
  return { selected, raw };
}

async function main() {
  const existingItems = loadExistingItems();
  const usedUrls = new Set(existingItems.map(item => item.youtubeUrl).filter(Boolean));
  const items = [...existingItems];
  const report = [];

  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, genreQueries.length) }, async () => {
    while (cursor < genreQueries.length) {
      const entry = genreQueries[cursor++];
      const existingCount = items.filter(item => item.genre === entry.genre).length;
      if (existingCount >= PER_GENRE) {
        report.push({ genre: entry.genre, selected: [], existing: existingCount, skipped: true, raw: [] });
        continue;
      }
      const needed = PER_GENRE - existingCount;
      process.stdout.write(`${entry.genre} ... `);
      const result = await collectForGenre(entry, usedUrls, needed);
      items.push(...result.selected);
      report.push({ genre: entry.genre, selected: result.selected, existing: existingCount, needed, raw: result.raw });
      console.log(`${existingCount + result.selected.length}`);
    }
  });
  await Promise.all(workers);

  report.sort((a, b) => genreQueries.findIndex(item => item.genre === a.genre) - genreQueries.findIndex(item => item.genre === b.genre));
  items.sort((a, b) => genreQueries.findIndex(item => item.genre === a.genre) - genreQueries.findIndex(item => item.genre === b.genre));
  const missing = genreQueries
    .map(entry => {
      const count = items.filter(item => item.genre === entry.genre).length;
      return { genre: entry.genre, count, needed: Math.max(0, PER_GENRE - count) };
    })
    .filter(row => row.needed > 0);
  if (missing.length) {
    console.log("\nShort genres:");
    missing.forEach(row => console.log(`- ${row.genre}: ${row.count}/${PER_GENRE}`));
  }

  const payload = {
    description: "Auto-collected representative YouTube URLs for genre calibration. Review before publication; collection uses YouTube search and should be treated as a calibration seed, not a canonical musicology dataset.",
    collectedAt: new Date().toISOString(),
    perGenre: PER_GENRE,
    items,
    missing
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  fs.writeFileSync(REPORT_PATH, JSON.stringify({ collectedAt: payload.collectedAt, perGenre: PER_GENRE, report }, null, 2));
  console.log(`\nCollected ${items.length} URLs.`);
  console.log(`Wrote ${path.relative(ROOT, OUT_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, REPORT_PATH)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
