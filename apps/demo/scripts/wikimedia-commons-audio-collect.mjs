import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const REGISTRY_PATH = path.join(TRAINING_DIR, "cc-source-registry.json");
const COVERAGE_PATH = path.join(TRAINING_DIR, "cc-coverage-report.json");
const OUT_PATH = path.join(TRAINING_DIR, "wikimedia-commons-audio-candidates.json");
const REPORT_PATH = path.join(TRAINING_DIR, "wikimedia-commons-audio-collect-report.json");

const LIMIT_PER_GENRE = Math.max(1, Number(process.env.MMFR_WIKI_CC_LIMIT_PER_GENRE || 30));
const SEARCH_ROWS = Math.max(1, Math.min(50, Number(process.env.MMFR_WIKI_CC_SEARCH_ROWS || 20)));
const REQUEST_DELAY_MS = Math.max(0, Number(process.env.MMFR_WIKI_CC_REQUEST_DELAY_MS || 350));
const REQUEST_TIMEOUT_MS = Math.max(5000, Number(process.env.MMFR_WIKI_CC_REQUEST_TIMEOUT_MS || 30000));
const ONLY_MISSING = process.env.MMFR_WIKI_CC_ONLY_MISSING !== "0";
const TARGET_GENRES = new Set(
  String(process.env.MMFR_WIKI_CC_GENRES || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
);

const WIKIMEDIA_TERMS = {
  "アニメソング": ["anime song audio", "anime soundtrack audio", "japanese pop song audio", "vocaloid song audio"],
  "オペラ": ["opera aria audio", "soprano aria audio", "tenor aria audio", "opera vocal audio", "classical vocal audio"],
  "シティ・ポップ": ["city pop audio", "future funk audio", "japanese pop audio", "synth pop audio"],
  "トラップ": ["trap beat audio", "trap music audio", "hip hop trap audio", "808 beat audio"],
  "ソウルミュージック": ["soul music audio", "r&b soul audio", "funk soul audio", "gospel soul audio"]
};

const ACCEPT_LICENSE = /^(cc0|public domain|pd-|cc-by|cc-by-sa|cc-by-nc|cc-by-nc-sa|cc-by-nd|cc-by-nc-nd)/i;
const REJECT_TEXT = /\b(speech|spoken|interview|podcast|lecture|sample pack|sound effect|effect|ringtone|karaoke|cover|inleiding|introduction|introductie|talk|conversation)\b/i;
const AUDIO_MIME = /^audio\//i;
const REJECT_AUDIO_FILE = /\.(mid|midi)$/i;

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

async function getJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "MUSICtee Wikimedia CC candidate collector; contact local project owner" }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function plainMeta(extmetadata = {}, key) {
  const value = extmetadata[key]?.value ?? "";
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeLicense(shortName, licenseUrl) {
  const short = String(shortName || "").trim();
  if (/public domain/i.test(short)) return "Public Domain";
  if (/cc0/i.test(short)) return "CC0";
  const match = `${short} ${licenseUrl}`.match(/CC[- ]?BY(?:[- ]?NC)?(?:[- ]?SA)?(?:[- ]?ND)?/i);
  return match ? match[0].toUpperCase().replace(/\s+/g, "-").replace(/^CCBY/, "CC-BY") : short || "Creative Commons";
}

function filePage(title) {
  return `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`;
}

function scoreCandidate({ genre, query, title, meta, license, url }) {
  const text = `${title} ${query} ${plainMeta(meta, "ObjectName")} ${plainMeta(meta, "ImageDescription")} ${plainMeta(meta, "Artist")} ${plainMeta(meta, "Categories")}`;
  let score = 32;
  if (new RegExp(String(genre).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text)) score += 16;
  for (const token of String(query).toLowerCase().split(/\s+/).filter(Boolean)) {
    if (text.toLowerCase().includes(token)) score += 4;
  }
  if (ACCEPT_LICENSE.test(license)) score += 18;
  if (url) score += 12;
  if (/\b(opera|aria|soprano|tenor|song|music|audio|track|composition|performance|house|trap|soul|funk|jazz|pop)\b/i.test(text)) score += 12;
  if (REJECT_TEXT.test(text)) score -= 35;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function existingCandidates() {
  const payload = loadJson(OUT_PATH, { items: [] });
  const items = Array.isArray(payload) ? payload : payload.items || [];
  return items.filter(item => {
    const text = `${item.title || ""} ${item.description || ""} ${item.creator || ""}`;
    if (REJECT_TEXT.test(text)) return false;
    if (REJECT_AUDIO_FILE.test(item.title || "") || REJECT_AUDIO_FILE.test(item.candidateAudioUrl || "")) return false;
    return true;
  });
}

function targetRows() {
  const registry = loadJson(REGISTRY_PATH, { gapGenreSearchTerms: {} });
  const coverage = loadJson(COVERAGE_PATH, { missingPotential: [], genres: [] });
  const byGenre = new Map((coverage.genres || []).map(row => [row.genre, row.macroGenre]));
  const missing = new Set(ONLY_MISSING ? (coverage.missingPotential || []).map(row => row.genre).filter(Boolean) : Object.keys(WIKIMEDIA_TERMS));
  const genres = new Set([...Object.keys(WIKIMEDIA_TERMS), ...Object.keys(registry.gapGenreSearchTerms || {})]);
  return [...genres]
    .filter(genre => WIKIMEDIA_TERMS[genre])
    .filter(genre => !TARGET_GENRES.size || TARGET_GENRES.has(genre))
    .filter(genre => !ONLY_MISSING || missing.has(genre))
    .map(genre => ({ genre, macroGenre: byGenre.get(genre) || "", terms: WIKIMEDIA_TERMS[genre] }));
}

async function searchFiles(query) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrnamespace: "6",
    gsrlimit: String(SEARCH_ROWS),
    gsrsearch: query,
    prop: "imageinfo",
    iiprop: "url|mime|size|extmetadata"
  });
  const json = await getJson(`https://commons.wikimedia.org/w/api.php?${params}`);
  return Object.values(json.query?.pages || {});
}

async function collect() {
  const previous = existingCandidates();
  const byKey = new Map(previous.map(item => [`${item.genre}:${item.title}`, item]));
  const report = { generatedAt: new Date().toISOString(), source: "Wikimedia Commons API", limitPerGenre: LIMIT_PER_GENRE, genres: [], errors: [] };

  for (const row of targetRows()) {
    const accepted = [];
    const seen = new Set(previous.filter(item => item.genre === row.genre).map(item => item.title));
    for (const term of row.terms) {
      if (accepted.length >= LIMIT_PER_GENRE) break;
      let pages = [];
      try {
        pages = await searchFiles(term);
      } catch (error) {
        report.errors.push({ genre: row.genre, query: term, error: error.message });
        continue;
      }
      await sleep(REQUEST_DELAY_MS);
      for (const page of pages) {
        if (accepted.length >= LIMIT_PER_GENRE) break;
        const title = String(page.title || "");
        if (!title || seen.has(title)) continue;
        seen.add(title);
        const info = page.imageinfo?.[0] || {};
        const meta = info.extmetadata || {};
        const mime = String(info.mime || "");
        const licenseUrl = plainMeta(meta, "LicenseUrl");
        const license = normalizeLicense(plainMeta(meta, "LicenseShortName") || plainMeta(meta, "UsageTerms"), licenseUrl);
        const audioUrl = info.url || info.descriptionurl || "";
        if (!AUDIO_MIME.test(mime)) continue;
        if (REJECT_AUDIO_FILE.test(title) || REJECT_AUDIO_FILE.test(audioUrl)) continue;
        if (!ACCEPT_LICENSE.test(license) && !/creativecommons|publicdomain/i.test(licenseUrl)) continue;
        const matchScore = scoreCandidate({ genre: row.genre, query: term, title, meta, license, url: audioUrl });
        if (matchScore < 45) continue;
        const item = {
          sourceType: "wikimedia-commons-candidate",
          source: "Wikimedia Commons",
          genre: row.genre,
          macroGenre: row.macroGenre,
          query: term,
          title,
          creator: plainMeta(meta, "Artist") || plainMeta(meta, "Credit"),
          description: plainMeta(meta, "ImageDescription") || plainMeta(meta, "ObjectName"),
          license,
          licenseUrl,
          referenceUrl: info.descriptionurl || filePage(title),
          candidateAudioUrl: audioUrl,
          candidateAudioMime: mime,
          candidateAudioSize: Number(info.size || 0),
          matchScore,
          needsReview: true,
          reviewNote: "Candidate only. Verify Commons page, license, genre label, and audio quality before downloading outside the repo and importing as formal CC audio."
        };
        byKey.set(`${item.genre}:${item.title}`, item);
        accepted.push(item);
      }
    }
    report.genres.push({ genre: row.genre, macroGenre: row.macroGenre, accepted: accepted.length, terms: row.terms });
    console.log(`${row.genre}: ${accepted.length} Wikimedia Commons candidates`);
  }

  const items = [...byKey.values()].sort((a, b) => a.genre.localeCompare(b.genre, "ja") || b.matchScore - a.matchScore);
  fs.writeFileSync(OUT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    policy: "candidate-discovery-only; audio is not downloaded; manually verify before formal CC import",
    items
  }, null, 2));
  report.totalCandidates = items.length;
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Wrote ${path.relative(ROOT, OUT_PATH)} (${items.length} candidates)`);
}

collect().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
