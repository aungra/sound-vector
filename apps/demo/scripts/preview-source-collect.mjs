import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const SEEDS_PATH = path.join(TRAINING_DIR, "source-seeds.json");
const CANDIDATES_PATH = path.join(TRAINING_DIR, "preview-source-candidates.json");
const VERIFIED_PATH = path.join(TRAINING_DIR, "verified-dataset.json");
const OUT_PATH = path.join(TRAINING_DIR, "genre-dataset.json");
const REPORT_PATH = path.join(TRAINING_DIR, "preview-collect-report.json");

const PER_GENRE = Math.max(1, Number(process.env.MMFR_PREVIEW_COLLECT_PER_GENRE || process.env.MMFR_GENRE_COLLECT_PER_GENRE || 20));
const CANDIDATE_TARGET = Math.max(PER_GENRE, Number(process.env.MMFR_PREVIEW_CANDIDATES_PER_GENRE || process.env.MMFR_GENRE_CANDIDATES_PER_GENRE || 80));
const SEARCH_LIMIT = Math.max(1, Math.min(200, Number(process.env.MMFR_PREVIEW_SEARCH_LIMIT || 200)));
const VALIDATE_ANALYSIS = process.env.MMFR_PREVIEW_COLLECT_VALIDATE !== "0";
const PROMOTE_VERIFIED = process.env.MMFR_PREVIEW_COLLECT_PROMOTE === "1";
const AUDIO_ENDPOINT = process.env.MMFR_AUDIO_ENDPOINT || "http://127.0.0.1:4194/api/audio-analyze";
const COUNTRIES = (process.env.MMFR_PREVIEW_COUNTRIES || "JP,US")
  .split(",")
  .map(value => value.trim().toUpperCase())
  .filter(Boolean);
const REQUEST_DELAY_MS = Math.max(0, Number(process.env.MMFR_PREVIEW_REQUEST_DELAY_MS || 750));

const ITUNES_GENRE_MACRO_HINTS = [
  [/j-?pop|kayokyoku|anime/i, "pop"],
  [/rock|alternative|punk|metal/i, "rock"],
  [/dance|electronic|house|techno|trance|dubstep/i, "electronic"],
  [/r&b|soul|hip.?hop|rap|reggae|funk|disco/i, "black_music"],
  [/classical|opera/i, "classical"],
  [/jazz/i, "jazz"],
  [/world|folk|latin|african|indian|enka/i, "world"],
  [/ambient|new age|meditation/i, "ambient"]
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

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

function sourceKey(item = {}) {
  const type = item.sourceType || (item.previewUrl ? "itunes-preview" : "youtube");
  const value = item.sourceUrl || item.previewUrl || item.youtubeUrl || item.url || "";
  return value ? `${type}:${value}` : "";
}

function existingVerifiedItems() {
  const payloads = [loadJson(VERIFIED_PATH, null)].filter(Boolean);
  const byKey = new Map();
  for (const payload of payloads) {
    const items = Array.isArray(payload) ? payload : payload.items || [];
    for (const item of items) {
      const valid = item.audioOk === true || Boolean(item.features || item.audioFeatures) || item.sourceType === "itunes-preview";
      if (!valid) continue;
      const key = sourceKey(item);
      if (key && !byKey.has(key)) byKey.set(key, item);
    }
  }
  return [...byKey.values()];
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

function macroHintFromPrimaryGenre(primaryGenreName) {
  const text = String(primaryGenreName || "");
  for (const [pattern, macro] of ITUNES_GENRE_MACRO_HINTS) {
    if (pattern.test(text)) return macro;
  }
  return "";
}

function buildQueries(entry) {
  const queries = [];
  for (const track of entry.tracks) {
    queries.push({
      kind: "canonical-track",
      canonicalArtist: track.artist,
      canonicalTitle: track.title,
      query: `${track.artist} ${track.title}`
    });
  }
  for (const term of entry.searchTerms) {
    queries.push({
      kind: "genre-search",
      canonicalArtist: "",
      canonicalTitle: "",
      query: term.replace(/\bofficial audio\b|\btopic\b|\bofficial video\b/gi, "").trim() || term
    });
  }
  return [...new Map(queries.map(item => [item.query.toLowerCase(), item])).values()];
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === "https:" ? https : http;
    const request = transport.get(target, response => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { raw += chunk; });
      response.on("end", () => {
        try {
          const json = raw ? JSON.parse(raw) : {};
          resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode || 0, json });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.setTimeout(30000, () => request.destroy(new Error("iTunes search timed out")));
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
    request.setTimeout(90000, () => request.destroy(new Error("preview analysis timed out")));
    request.write(payload);
    request.end();
  });
}

async function searchItunes(query, country) {
  const params = new URLSearchParams({
    term: query,
    country,
    media: "music",
    entity: "song",
    limit: String(SEARCH_LIMIT),
    explicit: "Yes",
    lang: country === "JP" ? "ja_jp" : "en_us"
  });
  const response = await getJson(`https://itunes.apple.com/search?${params}`);
  if (!response.ok) throw new Error(`iTunes Search API failed: ${response.status}`);
  return Array.isArray(response.json?.results) ? response.json.results : [];
}

function scorePreviewCandidate(entry, queryInfo, item, country) {
  const canonical = `${queryInfo.canonicalArtist} ${queryInfo.canonicalTitle}`.trim();
  const titleLine = `${item.artistName || ""} ${item.trackName || ""} ${item.collectionName || ""}`;
  const titleMatch = canonical ? tokenOverlap(canonical, titleLine) : 0;
  const genreText = `${item.primaryGenreName || ""} ${entry.genre}`;
  const genreMatch = tokenOverlap(entry.genre, genreText);
  const macroHint = macroHintFromPrimaryGenre(item.primaryGenreName);
  let score = queryInfo.kind === "canonical-track" ? 52 : 34;
  score += titleMatch * 36;
  score += genreMatch * 10;
  if (macroHint && macroHint === entry.macroGenre) score += 12;
  if (country === "JP" && /J-POP|アニメ|シティ|フォーク|ワールド/.test(entry.genre)) score += 6;
  if (item.previewUrl) score += 8;
  if (!item.previewUrl) score -= 100;
  if (String(item.wrapperType) !== "track" || String(item.kind) !== "song") score -= 30;
  const rejectReason = !item.previewUrl ? "missing-preview-url" : score < 52 ? "low-match-score" : "";
  return { matchScore: Math.max(0, Math.min(100, Math.round(score))), rejectReason };
}

async function candidateAnalyzes(row) {
  if (!VALIDATE_ANALYSIS) return { ok: false, skipped: true, error: "validation-disabled" };
  try {
    const response = await postJson(AUDIO_ENDPOINT, {
      action: "analyze-preview-url",
      previewUrl: row.previewUrl,
      previewMeta: {
        artistName: row.artistName,
        trackName: row.trackName,
        collectionName: row.collectionName,
        primaryGenreName: row.primaryGenreName,
        referenceUrl: row.referenceUrl
      }
    });
    return response.ok
      ? { ok: true, features: response.json?.features || response.json?.audioFeatures || null }
      : { ok: false, error: response.json?.error || "analysis failed" };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function collectForGenre(entry, usedKeys, targetCount) {
  const selected = [];
  const verified = [];
  const raw = [];
  const seen = new Set();

  for (const queryInfo of buildQueries(entry)) {
    for (const country of COUNTRIES) {
      let results = [];
      try {
        results = await searchItunes(queryInfo.query, country);
      } catch (error) {
        raw.push({ query: queryInfo.query, country, error: error.message });
        continue;
      }
      raw.push({ query: queryInfo.query, country, count: results.length, titles: results.slice(0, 4).map(item => `${item.artistName} - ${item.trackName}`) });
      for (const item of results) {
        if (!item.previewUrl || seen.has(item.previewUrl)) continue;
        seen.add(item.previewUrl);
        const score = scorePreviewCandidate(entry, queryInfo, item, country);
        const row = {
          source: "itunes-search",
          sourceType: "itunes-preview",
          query: queryInfo.query,
          queryKind: queryInfo.kind,
          country,
          previewUrl: item.previewUrl || "",
          sourceUrl: item.previewUrl || "",
          referenceUrl: item.trackViewUrl || "",
          trackViewUrl: item.trackViewUrl || "",
          artistName: item.artistName || "",
          trackName: item.trackName || "",
          collectionName: item.collectionName || "",
          primaryGenreName: item.primaryGenreName || "",
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
        const key = sourceKey(row);
        if (!row.rejectReason && !usedKeys.has(key) && verified.length < targetCount) {
          const validation = await candidateAnalyzes(row);
          if (validation.ok) {
            row.audioOk = true;
            row.verifiedAt = new Date().toISOString();
            usedKeys.add(key);
            verified.push({
              ...row,
              features: validation.features,
              memo: `Verified iTunes preview source: ${row.query}`,
              audioStoragePolicy: "not-stored; features-only"
            });
            process.stdout.write("+");
          } else if (validation.skipped) {
            process.stdout.write("?");
          } else {
            row.rejectReason = `audio-validation-failed: ${validation.error}`;
            process.stdout.write(".");
          }
        }
        if (selected.filter(candidate => !candidate.rejectReason).length >= CANDIDATE_TARGET && verified.length >= targetCount) {
          return { selected, verified, raw };
        }
      }
      if (REQUEST_DELAY_MS) await sleep(REQUEST_DELAY_MS);
    }
  }

  selected.sort((a, b) => b.matchScore - a.matchScore || a.trackName.localeCompare(b.trackName));
  return { selected: selected.slice(0, CANDIDATE_TARGET), verified, raw };
}

function summarizeByGenre(items, seeds) {
  return seeds.map(seed => {
    const list = items.filter(item => item.genre === seed.genre);
    return {
      genre: seed.genre,
      macroGenre: seed.macroGenre,
      count: list.length,
      target: PER_GENRE,
      needed: Math.max(0, PER_GENRE - list.length)
    };
  });
}

async function main() {
  fs.mkdirSync(TRAINING_DIR, { recursive: true });
  const seeds = loadSeeds();
  const existing = existingVerifiedItems();
  const usedKeys = new Set(existing.map(sourceKey).filter(Boolean));
  const allCandidates = [];
  const allVerified = [...existing];
  const report = [];

  for (const entry of seeds) {
    const existingCount = allVerified.filter(item => item.genre === entry.genre && item.sourceType === "itunes-preview").length;
    if (existingCount >= PER_GENRE) {
      report.push({ genre: entry.genre, macroGenre: entry.macroGenre, candidateCount: 0, verifiedCount: 0, existingCount, target: PER_GENRE, skipped: true, raw: [] });
      continue;
    }
    const needed = PER_GENRE - existingCount;
    process.stdout.write(`${entry.genre} ... `);
    const result = await collectForGenre(entry, usedKeys, needed);
    allCandidates.push(...result.selected);
    allVerified.push(...result.verified);
    report.push({
      genre: entry.genre,
      macroGenre: entry.macroGenre,
      candidateCount: result.selected.length,
      verifiedCount: result.verified.length,
      existingCount,
      target: PER_GENRE,
      raw: result.raw
    });
    console.log(` candidates:${result.selected.length} verified:${existingCount + result.verified.length}/${PER_GENRE}`);
  }

  allCandidates.sort((a, b) => String(a.macroGenre || "").localeCompare(String(b.macroGenre || "")) || String(a.genre || "").localeCompare(String(b.genre || "")) || (Number(b.matchScore) || 0) - (Number(a.matchScore) || 0));
  allVerified.sort((a, b) => String(a.macroGenre || "").localeCompare(String(b.macroGenre || "")) || String(a.genre || "").localeCompare(String(b.genre || "")) || sourceKey(a).localeCompare(sourceKey(b)));

  const collectedAt = new Date().toISOString();
  fs.writeFileSync(CANDIDATES_PATH, JSON.stringify({
    description: "iTunes Search API preview candidates for genre calibration. Preview audio is analyzed transiently and not stored.",
    collectedAt,
    source: "iTunesPreview",
    countries: COUNTRIES,
    perGenre: PER_GENRE,
    candidateTarget: CANDIDATE_TARGET,
    audioStoragePolicy: "do-not-store-preview-audio; persist features only",
    items: allCandidates,
    summary: summarizeByGenre(allCandidates.filter(item => !item.rejectReason), seeds)
  }, null, 2));

  fs.writeFileSync(VERIFIED_PATH, JSON.stringify({
    description: "Verified genre training items. iTunes preview items persist features only; preview audio is not stored.",
    collectedAt,
    endpoint: AUDIO_ENDPOINT,
    perGenre: PER_GENRE,
    sourcePolicy: "mixed; prefer iTunesPreview over YouTube for new collection",
    audioStoragePolicy: "features-only",
    items: allVerified,
    missing: summarizeByGenre(allVerified, seeds).filter(row => row.needed > 0)
  }, null, 2));

  fs.writeFileSync(REPORT_PATH, JSON.stringify({
    collectedAt,
    source: "iTunesPreview",
    countries: COUNTRIES,
    perGenre: PER_GENRE,
    candidateTarget: CANDIDATE_TARGET,
    validateAnalysis: VALIDATE_ANALYSIS,
    report
  }, null, 2));

  if (PROMOTE_VERIFIED) {
    fs.writeFileSync(OUT_PATH, JSON.stringify({
      description: "Promoted verified URLs/features for genre calibration. Generated from verified-dataset.json.",
      collectedAt,
      sourceDataset: "verified-dataset.json",
      audioStoragePolicy: "features-only for iTunes preview items",
      items: allVerified.map(item => ({
        genre: item.genre,
        macroGenre: item.macroGenre,
        sourceType: item.sourceType || (item.previewUrl ? "itunes-preview" : "youtube"),
        sourceUrl: item.sourceUrl || item.previewUrl || item.youtubeUrl,
        previewUrl: item.previewUrl,
        youtubeUrl: item.youtubeUrl,
        referenceUrl: item.referenceUrl || item.trackViewUrl || item.youtubeUrl,
        memo: item.memo,
        source: item.source,
        query: item.query,
        canonicalArtist: item.canonicalArtist || item.artistName,
        canonicalTitle: item.canonicalTitle || item.trackName,
        artistName: item.artistName,
        trackName: item.trackName,
        collectionName: item.collectionName,
        primaryGenreName: item.primaryGenreName,
        features: item.features || item.audioFeatures || null
      }))
    }, null, 2));
  }

  console.log(`Wrote ${path.relative(ROOT, CANDIDATES_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, VERIFIED_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, REPORT_PATH)}`);
  if (PROMOTE_VERIFIED) console.log(`Wrote ${path.relative(ROOT, OUT_PATH)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
