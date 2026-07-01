import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const OUT_JSON = path.join(TRAINING_DIR, "freesound-cc-candidates.json");
const OUT_TSV = path.join(TRAINING_DIR, "freesound-cc-review.tsv");
const OUT_MD = path.join(TRAINING_DIR, "freesound-cc-collect-report.md");

const API_TOKEN = process.env.FREESOUND_API_TOKEN || process.env.MMFR_FREESOUND_API_TOKEN || "";
const LIMIT_PER_QUERY = Math.max(1, Math.min(150, Number(process.env.MMFR_FREESOUND_LIMIT_PER_QUERY || 50)));
const MAX_DURATION = Math.max(1, Number(process.env.MMFR_FREESOUND_MAX_DURATION || 45));
const MIN_DURATION = Math.max(0, Number(process.env.MMFR_FREESOUND_MIN_DURATION || 2));
const LICENSE_FILTER = process.env.MMFR_FREESOUND_LICENSE_FILTER || 'license:("Creative Commons 0" OR "Attribution")';
const DRY_RUN = process.env.MMFR_FREESOUND_DRY_RUN === "1" || !API_TOKEN;

const QUERY_PLAN = [
  { genre: "テクノ", macroGenre: "electronic", role: "primary", query: "techno loop" },
  { genre: "テクノ", macroGenre: "electronic", role: "primary", query: "minimal techno loop" },
  { genre: "テクノ", macroGenre: "electronic", role: "primary", query: "acid techno loop" },
  { genre: "テクノ", macroGenre: "electronic", role: "primary", query: "warehouse techno loop" },
  { genre: "テクノ", macroGenre: "electronic", role: "primary", query: "909 techno loop" },
  { genre: "ハウス", macroGenre: "electronic", role: "same-macro-contrast", query: "house loop" },
  { genre: "トランス", macroGenre: "electronic", role: "same-macro-contrast", query: "trance loop" },
  { genre: "ドラムンベース", macroGenre: "electronic", role: "same-macro-contrast", query: "drum and bass loop" },
  { genre: "ダブステップ", macroGenre: "electronic", role: "same-macro-contrast", query: "dubstep loop" },
  { genre: "チップチューン", macroGenre: "electronic", role: "same-macro-contrast", query: "chiptune loop" }
];

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function quote(value) {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        Authorization: `Token ${API_TOKEN}`,
        "User-Agent": "MUSICTee genre research collector"
      }
    }, response => {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { data += chunk; });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Freesound API ${response.statusCode}: ${data.slice(0, 500)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(60000, () => req.destroy(new Error("Freesound API timeout")));
  });
}

function searchUrl(query) {
  const params = new URLSearchParams({
    query,
    filter: `${LICENSE_FILTER} duration:[${MIN_DURATION} TO ${MAX_DURATION}]`,
    fields: "id,name,username,license,duration,tags,description,url,previews,download,type,created",
    page_size: String(LIMIT_PER_QUERY),
    sort: "score"
  });
  return `https://freesound.org/apiv2/search/text/?${params.toString()}`;
}

function licenseSlug(license = "") {
  const text = String(license).toLowerCase();
  if (/zero|cc0/.test(text)) return "CC0";
  if (/attribution/.test(text) && !/noncommercial|non-commercial|sampling/.test(text)) return "CC-BY";
  if (/noncommercial|non-commercial/.test(text)) return "CC-BY-NC";
  return "Creative Commons";
}

function scoreCandidate(item, plan) {
  const haystack = [
    item.name,
    item.description,
    ...(item.tags || [])
  ].join(" ").toLowerCase();
  let score = 0;
  for (const word of plan.query.toLowerCase().split(/\s+/)) {
    if (word && haystack.includes(word)) score += 3;
  }
  if (haystack.includes("loop")) score += 4;
  if (plan.genre === "テクノ" && /techno|minimal|acid|909|warehouse|rave/.test(haystack)) score += 6;
  if (plan.genre === "ドラムンベース" && /drum.?and.?bass|dnb|jungle/.test(haystack)) score += 6;
  if (plan.genre === "チップチューン" && /chiptune|8bit|8-bit|chip/.test(haystack)) score += 6;
  if (/mix|set|live|podcast|full track|song/.test(haystack)) score -= 6;
  return score;
}

async function collect() {
  const candidates = [];
  const seen = new Set();
  const errors = [];

  if (!API_TOKEN) {
    errors.push("FREESOUND_API_TOKEN is missing. Dry-run wrote query plan only.");
  }

  for (const plan of QUERY_PLAN) {
    if (DRY_RUN) {
      candidates.push({
        source: "Freesound",
        sourceType: "freesound-query-plan",
        query: plan.query,
        genre: plan.genre,
        macroGenre: plan.macroGenre,
        role: plan.role,
        reviewStatus: "needs-api-token",
        rejectReason: "dry-run-no-api-token"
      });
      continue;
    }
    try {
      const payload = await requestJson(searchUrl(plan.query));
      for (const item of payload.results || []) {
        const id = String(item.id || "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const license = licenseSlug(item.license);
        candidates.push({
          source: "Freesound",
          sourceType: "freesound-api",
          freesoundId: id,
          genre: plan.genre,
          macroGenre: plan.macroGenre,
          role: plan.role,
          query: plan.query,
          name: item.name || "",
          username: item.username || "",
          duration: item.duration || null,
          license,
          licenseUrl: item.license || "",
          referenceUrl: item.url || `https://freesound.org/s/${id}/`,
          downloadUrl: item.download || "",
          previewUrl: item.previews?.["preview-hq-mp3"] || item.previews?.["preview-lq-mp3"] || "",
          tags: item.tags || [],
          description: item.description || "",
          score: scoreCandidate(item, plan),
          reviewStatus: license === "CC-BY-NC" ? "needs-license-review" : "needs-review"
        });
      }
    } catch (error) {
      errors.push(`${plan.query}: ${error.message}`);
    }
  }

  candidates.sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.genre).localeCompare(String(b.genre), "ja"));
  ensureDir(OUT_JSON);
  fs.writeFileSync(OUT_JSON, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: "Freesound API",
    dryRun: DRY_RUN,
    licenseFilter: LICENSE_FILTER,
    minDuration: MIN_DURATION,
    maxDuration: MAX_DURATION,
    queryPlan: QUERY_PLAN,
    errors,
    items: candidates
  }, null, 2));

  const headers = [
    "reviewStatus",
    "genre",
    "macroGenre",
    "role",
    "score",
    "freesoundId",
    "name",
    "username",
    "duration",
    "license",
    "licenseUrl",
    "referenceUrl",
    "downloadUrl",
    "previewUrl",
    "query",
    "tags"
  ];
  const tsv = [
    headers.map(quote).join("\t"),
    ...candidates.map(item => headers.map(header => quote(Array.isArray(item[header]) ? item[header].join(",") : item[header])).join("\t"))
  ].join("\n");
  fs.writeFileSync(OUT_TSV, `${tsv}\n`);

  const byGenre = candidates.reduce((acc, item) => {
    acc[item.genre] = (acc[item.genre] || 0) + 1;
    return acc;
  }, {});
  const md = [
    "# Freesound CC Collect Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Dry run: ${DRY_RUN ? "yes" : "no"}`,
    `Candidates: ${candidates.length}`,
    "",
    "## By Genre",
    "",
    "| genre | candidates |",
    "| --- | ---: |",
    ...Object.entries(byGenre).sort((a, b) => b[1] - a[1]).map(([genre, count]) => `| ${genre} | ${count} |`),
    "",
    "## Errors",
    "",
    ...(errors.length ? errors.map(error => `- ${error}`) : ["_none_"]),
    "",
    "## Next",
    "",
    "- Review `genre-training/freesound-cc-review.tsv`.",
    "- Set `reviewStatus` to `approved` for usable CC0/CC-BY candidates.",
    "- Download approved audio outside the repo.",
    "- Convert the reviewed TSV into a CC manifest and import features only."
  ].join("\n");
  fs.writeFileSync(OUT_MD, `${md}\n`);

  console.log(JSON.stringify({
    dryRun: DRY_RUN,
    candidates: candidates.length,
    byGenre,
    errors,
    json: path.relative(ROOT, OUT_JSON),
    tsv: path.relative(ROOT, OUT_TSV),
    markdown: path.relative(ROOT, OUT_MD)
  }, null, 2));
}

collect().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
