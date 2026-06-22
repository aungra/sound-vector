import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
const OUT_PATH = path.join(TRAINING_DIR, "openverse-pop-cc-candidates.json");
const DEFAULT_QUERIES = [
  { query: "vocaloid", genre: "アニメソング", macroGenre: "pop", confidence: "medium" },
  { query: "japanese pop music", genre: "J-POP", macroGenre: "pop", confidence: "low" },
  { query: "anime music song", genre: "アニメソング", macroGenre: "pop", confidence: "low" },
  { query: "city pop music", genre: "シティ・ポップ", macroGenre: "pop", confidence: "low" }
];
const PAGE_SIZE = Math.max(1, Math.min(20, Number(process.env.MMFR_OPENVERSE_PAGE_SIZE || 20)));
const MAX_PER_QUERY = Math.max(1, Number(process.env.MMFR_OPENVERSE_MAX_PER_QUERY || 80));
const AUDIO_DIR = path.resolve(process.env.MMFR_OPENVERSE_AUDIO_DIR || path.join(loadCachePaths().externalDataDir || path.join(ROOT, ".external-data"), "openverse-pop"));

function loadCachePaths() {
  if (!fs.existsSync(CACHE_PATHS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATHS_PATH, "utf8"));
  } catch {
    return {};
  }
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "MUSICTee genre collector" } }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        resolve(getJson(new URL(response.headers.location, url).toString()));
        return;
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Openverse JSON parse failed: ${error.message}`));
        }
      });
    }).on("error", reject);
  });
}

function safeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "track";
}

function licenseCode(value) {
  const code = String(value || "").toUpperCase().replace(/^CC-/, "");
  if (code === "CC0" || code === "PDM") return "CC0";
  return code ? `CC-${code}` : "";
}

function rejectReason(row = {}) {
  const text = [row.title, row.creator, row.foreign_landing_url, row.source].join(" ").toLowerCase();
  if (row.mature) return "mature";
  if (row.category && row.category !== "music") return `category:${row.category}`;
  if (!/^https?:\/\//.test(row.url || "")) return "missing-download-url";
  if (/field recording|ambience|ambient - rain|counter|market|screaming|shouting|sound effect|sfx|voice sample|spoken|speech|podcast/.test(text)) return "likely-not-song";
  if (/city pop/.test(text) && /commons\.wikimedia|ll-q652|speaker:/.test(text)) return "wikimedia-spoken-word";
  if (!/jamendo|ccmixter|freemusicarchive|archive|freesound/.test(String(row.source || "").toLowerCase())) return "unsupported-source";
  return "";
}

async function main() {
  const queries = process.env.MMFR_OPENVERSE_QUERIES
    ? process.env.MMFR_OPENVERSE_QUERIES.split(",").map(query => ({ query: query.trim(), genre: "J-POP", macroGenre: "pop", confidence: "low" })).filter(item => item.query)
    : DEFAULT_QUERIES;
  const seen = new Set();
  const candidates = [];
  const rejected = [];
  for (const item of queries) {
    let page = 1;
    let acceptedForQuery = 0;
    while (acceptedForQuery < MAX_PER_QUERY) {
      const url = new URL("https://api.openverse.engineering/v1/audio/");
      url.searchParams.set("q", item.query);
      url.searchParams.set("page_size", String(Math.min(PAGE_SIZE, MAX_PER_QUERY - acceptedForQuery)));
      url.searchParams.set("page", String(page));
      const payload = await getJson(url.toString());
      const rows = Array.isArray(payload.results) ? payload.results : [];
      if (!rows.length) break;
      for (const row of rows) {
        const key = row.id || row.foreign_landing_url || row.url;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const reason = rejectReason(row);
        const normalized = {
          source: "Openverse",
          sourceType: "cc-dataset",
          datasetName: `Openverse/${row.source || "unknown"}`,
          openverseId: row.id,
          query: item.query,
          genre: item.genre,
          macroGenre: item.macroGenre,
          confidence: item.confidence,
          trainingRole: "fine",
          downloadUrl: row.url,
          referenceUrl: row.foreign_landing_url,
          license: licenseCode(row.license),
          licenseUrl: row.license_url || "",
          canonicalArtist: row.creator || "",
          canonicalTitle: row.title || "",
          durationMs: row.duration || null,
          sourceName: row.source || "",
          suggestedFileName: `${safeName(item.genre)}/${safeName(row.source || "source")}-${safeName(row.id || row.title)}.mp3`
        };
        if (reason) {
          rejected.push({ ...normalized, rejectReason: reason });
          continue;
        }
        candidates.push(normalized);
        acceptedForQuery += 1;
        if (acceptedForQuery >= MAX_PER_QUERY) break;
      }
      page += 1;
      if (page > Number(payload.page_count || page)) break;
    }
  }
  fs.mkdirSync(TRAINING_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify({
    description: "Openverse CC audio candidates for J-POP / City Pop / Anime Song review. Do not import until downloaded and manually checked.",
    generatedAt: new Date().toISOString(),
    audioDir: AUDIO_DIR,
    candidates,
    rejected: rejected.slice(0, 500)
  }, null, 2));
  const byGenre = candidates.reduce((acc, row) => {
    acc[row.genre] = (acc[row.genre] || 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({ output: path.relative(ROOT, OUT_PATH), candidates: candidates.length, rejected: rejected.length, byGenre, audioDir: AUDIO_DIR }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
