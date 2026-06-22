import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const REGISTRY_PATH = path.join(TRAINING_DIR, "cc-source-registry.json");
const COVERAGE_PATH = path.join(TRAINING_DIR, "cc-coverage-report.json");
const OUT_PATH = path.join(TRAINING_DIR, "internet-archive-cc-candidates.json");

const LIMIT_PER_GENRE = Math.max(1, Number(process.env.MMFR_IA_CC_LIMIT_PER_GENRE || 20));
const SEARCH_ROWS = Math.max(LIMIT_PER_GENRE, Math.min(100, Number(process.env.MMFR_IA_CC_SEARCH_ROWS || 50)));
const REQUEST_DELAY_MS = Math.max(0, Number(process.env.MMFR_IA_CC_REQUEST_DELAY_MS || 500));
const REQUEST_TIMEOUT_MS = Math.max(5000, Number(process.env.MMFR_IA_CC_REQUEST_TIMEOUT_MS || 30000));
const ONLY_MISSING = process.env.MMFR_IA_CC_ONLY_MISSING !== "0";
const TARGET_GENRES = new Set(
  String(process.env.MMFR_IA_CC_GENRES || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
);

const AUDIO_FORMATS = [
  /\.mp3$/i,
  /\.flac$/i,
  /\.ogg$/i,
  /\.oga$/i,
  /\.opus$/i,
  /\.wav$/i,
  /\.m4a$/i,
  /\.aac$/i
];

const REJECT_TITLE = /\b(live|cover|reaction|tutorial|lesson|karaoke|instrumental remake|mix|dj set|podcast|interview|audiobook)\b/i;
const CC_LICENSE = /creativecommons\.org\/licenses\/|creativecommons\.org\/publicdomain\/zero|creativecommons\.org\/publicdomain\/mark/i;

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

function ccLicenseUrl(value) {
  const text = Array.isArray(value) ? value.join(" ") : String(value || "");
  const match = text.match(/https?:\/\/creativecommons\.org\/(?:licenses|publicdomain)\/[^\s"'<>]+/i);
  return match ? match[0].replace(/[),.;]+$/, "") : "";
}

function licenseTitle(url) {
  const text = String(url || "").toLowerCase();
  if (text.includes("/zero/")) return "CC0";
  const match = text.match(/licenses\/([^/]+)\/([0-9.]+)/);
  return match ? `CC-${match[1].toUpperCase()}` : "Creative Commons";
}

function itemUrl(identifier) {
  return `https://archive.org/details/${encodeURIComponent(identifier)}`;
}

function fileUrl(identifier, name) {
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${String(name).split("/").map(encodeURIComponent).join("/")}`;
}

function isAudioFile(file = {}) {
  const name = String(file.name || "");
  if (!AUDIO_FORMATS.some(pattern => pattern.test(name))) return false;
  if (/thumb|sample|spectrogram|metadata|cover|image/i.test(name)) return false;
  const format = String(file.format || "");
  if (/metadata|thumbnail|image|text|xml/i.test(format)) return false;
  return true;
}

function scoreCandidate({ genre, query, doc, meta, audioFile, licenseUrl }) {
  const title = String(meta.title || doc.title || "");
  const creator = Array.isArray(meta.creator) ? meta.creator.join(" ") : String(meta.creator || doc.creator || "");
  const subject = Array.isArray(meta.subject) ? meta.subject.join(" ") : String(meta.subject || "");
  const description = String(meta.description || "");
  const joined = `${title} ${creator} ${subject} ${description}`;
  let score = 28;
  score += tokenOverlap(genre, joined) * 24;
  score += tokenOverlap(query, joined) * 28;
  if (CC_LICENSE.test(licenseUrl)) score += 18;
  if (audioFile?.name) score += 10;
  if (/\b(original|audio|music|album|single|track|song)\b/i.test(joined)) score += 4;
  if (REJECT_TITLE.test(joined)) score -= 20;
  if (/\bcover\b/i.test(joined) && !/\bcreative commons\b/i.test(joined)) score -= 18;
  if (/\bremix\b/i.test(joined)) score -= 6;
  return Math.max(0, Math.min(100, Math.round(score)));
}

async function getJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "MUSICtee genre candidate collector; contact local project owner" }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function advancedSearch(query) {
  const params = new URLSearchParams();
  params.set("q", `mediatype:audio AND (${query}) AND (licenseurl:*creativecommons.org* OR licenseurl:*publicdomain*)`);
  params.set("fl[]", "identifier,title,creator,licenseurl,downloads,publicdate");
  params.set("rows", String(SEARCH_ROWS));
  params.set("page", "1");
  params.set("output", "json");
  params.set("sort[]", "downloads desc");
  const json = await getJson(`https://archive.org/advancedsearch.php?${params}`);
  return Array.isArray(json?.response?.docs) ? json.response.docs : [];
}

async function metadata(identifier) {
  return getJson(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
}

function candidateRowsFromRegistry() {
  const registry = loadJson(REGISTRY_PATH, { gapGenreSearchTerms: {} });
  const coverage = loadJson(COVERAGE_PATH, { missingPotential: [], genres: [] });
  const byGenre = new Map();

  const missing = new Set(
    ONLY_MISSING
      ? (coverage.missingPotential || []).map(row => row.genre).filter(Boolean)
      : Object.keys(registry.gapGenreSearchTerms || {})
  );

  for (const row of coverage.genres || []) {
    if (!row.genre || !row.macroGenre) continue;
    byGenre.set(row.genre, row.macroGenre);
  }

  return Object.entries(registry.gapGenreSearchTerms || {})
    .filter(([genre]) => (!TARGET_GENRES.size || TARGET_GENRES.has(genre)) && (!ONLY_MISSING || missing.has(genre)))
    .map(([genre, terms]) => ({
      genre,
      macroGenre: byGenre.get(genre) || "",
      terms: Array.isArray(terms) ? terms : []
    }))
    .filter(row => row.terms.length);
}

function existingCandidates() {
  const payload = loadJson(OUT_PATH, { items: [] });
  return Array.isArray(payload) ? payload : payload.items || [];
}

async function collect() {
  const previous = existingCandidates();
  const byKey = new Map(previous.map(item => [`${item.genre}:${item.identifier}`, item]));
  const rows = candidateRowsFromRegistry();
  const report = {
    generatedAt: new Date().toISOString(),
    source: "Internet Archive Advanced Search + metadata API",
    limitPerGenre: LIMIT_PER_GENRE,
    onlyMissing: ONLY_MISSING,
    genres: [],
    errors: []
  };

  for (const row of rows) {
    const acceptedForGenre = [];
    const seenIdentifiers = new Set(previous.filter(item => item.genre === row.genre).map(item => item.identifier));
    for (const term of row.terms) {
      if (acceptedForGenre.length >= LIMIT_PER_GENRE) break;
      let docs = [];
      try {
        docs = await advancedSearch(term);
      } catch (error) {
        report.errors.push({ genre: row.genre, query: term, error: error.message });
        continue;
      }
      await sleep(REQUEST_DELAY_MS);

      for (const doc of docs) {
        if (acceptedForGenre.length >= LIMIT_PER_GENRE) break;
        const identifier = String(doc.identifier || "");
        if (!identifier || seenIdentifiers.has(identifier)) continue;
        seenIdentifiers.add(identifier);

        let metaPayload = null;
        try {
          metaPayload = await metadata(identifier);
        } catch (error) {
          report.errors.push({ genre: row.genre, query: term, identifier, error: error.message });
          continue;
        }
        await sleep(REQUEST_DELAY_MS);

        const meta = metaPayload?.metadata || {};
        const licenseUrl = ccLicenseUrl(meta.licenseurl || doc.licenseurl || meta.license || "");
        const files = Array.isArray(metaPayload?.files) ? metaPayload.files.filter(isAudioFile) : [];
        const audioFile = files
          .map(file => ({
            name: file.name,
            format: file.format || "",
            size: Number(file.size || 0),
            url: fileUrl(identifier, file.name)
          }))
          .sort((a, b) => {
            const rank = name => (/\.flac$/i.test(name) ? 0 : /\.wav$/i.test(name) ? 1 : /\.mp3$/i.test(name) ? 2 : 3);
            return rank(a.name) - rank(b.name) || b.size - a.size;
          })[0];

        if (!licenseUrl || !audioFile) continue;
        const matchScore = scoreCandidate({ genre: row.genre, query: term, doc, meta, audioFile, licenseUrl });
        if (matchScore < 45) continue;

        const item = {
          sourceType: "internet-archive-candidate",
          source: "Internet Archive",
          genre: row.genre,
          macroGenre: row.macroGenre,
          query: term,
          identifier,
          title: String(meta.title || doc.title || ""),
          creator: Array.isArray(meta.creator) ? meta.creator.join(", ") : String(meta.creator || doc.creator || ""),
          subject: Array.isArray(meta.subject) ? meta.subject : String(meta.subject || "").split(";").map(value => value.trim()).filter(Boolean),
          license: licenseTitle(licenseUrl),
          licenseUrl,
          referenceUrl: itemUrl(identifier),
          candidateAudioUrl: audioFile.url,
          candidateAudioName: audioFile.name,
          candidateAudioFormat: audioFile.format,
          candidateAudioSize: audioFile.size,
          matchScore,
          needsReview: true,
          reviewNote: "Candidate only. Verify license, genre label, and audio quality before downloading outside the repo and importing as formal CC audio."
        };
        byKey.set(`${item.genre}:${item.identifier}`, item);
        acceptedForGenre.push(item);
      }
    }

    report.genres.push({
      genre: row.genre,
      macroGenre: row.macroGenre,
      terms: row.terms,
      accepted: acceptedForGenre.length
    });
    console.log(`${row.genre}: ${acceptedForGenre.length} Internet Archive candidates`);
  }

  const items = [...byKey.values()].sort((a, b) => a.genre.localeCompare(b.genre, "ja") || b.matchScore - a.matchScore);
  const payload = {
    generatedAt: new Date().toISOString(),
    policy: "candidate-discovery-only; audio is not downloaded; manually verify before formal CC import",
    items
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  report.totalCandidates = items.length;
  fs.writeFileSync(path.join(TRAINING_DIR, "internet-archive-cc-collect-report.json"), JSON.stringify(report, null, 2));
  console.log(`Wrote ${path.relative(ROOT, OUT_PATH)} (${items.length} candidates)`);
}

collect().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
