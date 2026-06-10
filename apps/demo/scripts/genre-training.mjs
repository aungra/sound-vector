import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(SCRIPT_DIR, "..");
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const HTML_PATH = path.join(DEMO_DIR, "MUSIC MEMORY FITTING ROOM.html");
const DATASET_PATH = path.join(ROOT, "genre-training", "genre-dataset.json");
const VERIFIED_DATASET_PATH = path.join(ROOT, "genre-training", "verified-dataset.json");
const EXAMPLE_DATASET_PATH = path.join(ROOT, "genre-training", "genre-dataset.example.json");
const RESULTS_PATH = path.join(ROOT, "genre-training", "results.json");
const PROFILES_PATH = path.join(ROOT, "genre-training", "generated-profiles.json");
const DEMO_PROFILES_PATH = path.join(DEMO_DIR, "genre-training", "generated-profiles.json");
const DEFAULT_ENDPOINT = process.env.MMFR_AUDIO_ENDPOINT || "http://127.0.0.1:4194/api/audio-analyze";

function loadDataset() {
  const verifiedPayload = fs.existsSync(VERIFIED_DATASET_PATH)
    ? JSON.parse(fs.readFileSync(VERIFIED_DATASET_PATH, "utf8"))
    : null;
  const verifiedItems = verifiedPayload && Array.isArray(verifiedPayload.items) ? verifiedPayload.items : [];
  const target = verifiedItems.length ? VERIFIED_DATASET_PATH : fs.existsSync(DATASET_PATH) ? DATASET_PATH : EXAMPLE_DATASET_PATH;
  const payload = JSON.parse(fs.readFileSync(target, "utf8"));
  const items = Array.isArray(payload) ? payload : payload.items || [];
  return {
    target,
    items: items
    .map((item, index) => ({
      index,
      genre: String(item.genre || "").trim(),
      macroGenre: String(item.macroGenre || "").trim(),
      youtubeUrl: String(item.youtubeUrl || item.url || "").trim(),
      memo: item.memo || "",
      sourceDataset: path.basename(target)
    }))
    .filter(item => item.genre && item.youtubeUrl)
  };
}

function loadAppGenreApi() {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const appScript = scripts.at(-1).replace(
    /cleanupStoredSessions\(\);\s*render\(\);\s*loadCalibratedGenreProfiles\(\);\s*$/,
    "globalThis.__genreApi={enrichFeaturesWithGenre,genreFeatureVector,musicGenreProfiles};"
  );
  const context = {
    console,
    Date,
    Math,
    JSON,
    setTimeout,
    clearTimeout,
    URL,
    Blob: function Blob() {},
    FileReader: function FileReader() {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    document: {
      getElementById: () => ({ innerHTML: "", value: "", files: [] }),
      createElement: () => ({ click() {}, setAttribute() {}, style: {} })
    },
    window: {},
    navigator: {},
    location: { href: "http://127.0.0.1:4193/", protocol: "http:" }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(appScript, context);
  return context.__genreApi;
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
      response.on("data", chunk => {
        raw += chunk;
      });
      response.on("end", () => {
        let json = {};
        try {
          json = raw ? JSON.parse(raw) : {};
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${error.message}`));
          return;
        }
        resolve({ status: response.statusCode || 0, ok: response.statusCode >= 200 && response.statusCode < 300, json });
      });
    });
    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

async function analyzeYoutube(youtubeUrl, endpoint = DEFAULT_ENDPOINT) {
  const response = await postJson(endpoint, { action: "analyze-youtube", youtubeUrl });
  const payload = response.json;
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Audio analysis failed: ${response.status}`);
  }
  return payload.audioFeatures || payload.features || payload;
}

const VECTOR_KEYS = ["tempo", "energy", "bass", "rhythm", "onset", "brightness", "zcr", "rmsContrast", "onsetContrast", "bassContrast", "centroidContrast", "chromaEntropy"];
const MACRO_ALIASES = {
  black: "black_music",
  folk: "world"
};

function canonicalMacro(value) {
  const key = String(value || "").trim();
  return MACRO_ALIASES[key] || key;
}

function vectorStats(vectors) {
  const out = {};
  const spread = {};
  VECTOR_KEYS.forEach(key => {
    const values = vectors.map(vector => Number(vector[key])).filter(Number.isFinite);
    if (!values.length) return;
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / values.length;
    out[key] = Math.round(avg * 1000) / 1000;
    spread[key] = Math.round(Math.sqrt(variance) * 1000) / 1000;
  });
  out._spread = spread;
  out._count = vectors.length;
  out._examples = vectors.slice(0, 12).map(vector => {
    const example = {};
    VECTOR_KEYS.forEach(key => {
      if (Number.isFinite(Number(vector[key]))) example[key] = Math.round(Number(vector[key]) * 1000) / 1000;
    });
    return example;
  });
  return out;
}

function topNames(analysis) {
  return (analysis?.top || []).map(item => item.name);
}

function topMacro(analysis) {
  return analysis?.macro?.[0]?.macro || analysis?.top?.[0]?.macro || "";
}

async function main() {
  const loaded = loadDataset();
  const dataset = loaded.items;
  if (!dataset.length) {
    console.log("No training URLs found. Copy genre-training/genre-dataset.example.json to genre-training/genre-dataset.json and fill youtubeUrl values.");
    return;
  }

  const api = loadAppGenreApi();
  const results = [];
  const vectorsByGenre = new Map();

  for (const item of dataset) {
    process.stdout.write(`[${item.index + 1}/${dataset.length}] ${item.genre} ... `);
    try {
      const features = await analyzeYoutube(item.youtubeUrl);
      const enriched = api.enrichFeaturesWithGenre(features);
      const vector = api.genreFeatureVector(enriched);
      const names = topNames(enriched.genreAnalysis);
      const predictedMacro = topMacro(enriched.genreAnalysis);
      const exact = names[0] === item.genre;
      const top3 = names.slice(0, 3).includes(item.genre);
      const macroExact = item.macroGenre ? canonicalMacro(predictedMacro) === canonicalMacro(item.macroGenre) : null;
      const row = {
        genre: item.genre,
        macroGenre: item.macroGenre,
        youtubeUrl: item.youtubeUrl,
        memo: item.memo,
        sourceDataset: item.sourceDataset,
        predicted: names[0] || "",
        predictedMacro,
        macroExact,
        top3,
        exact,
        method: enriched.genreAnalysis?.method || "",
        top: enriched.genreAnalysis?.top || [],
        features: {
          tempo: enriched.tempo,
          energy: enriched.energy,
          bass: enriched.bass,
          rhythm: enriched.rhythm,
          onset: enriched.onset,
          brightness: enriched.brightness,
          centroid: enriched.centroid ?? enriched.spectralCentroid
        },
        vector
      };
      results.push(row);
      if (!vectorsByGenre.has(item.genre)) vectorsByGenre.set(item.genre, []);
      vectorsByGenre.get(item.genre).push(vector);
      console.log(`${row.predicted}${exact ? " exact" : top3 ? " top3" : " miss"}`);
    } catch (error) {
      results.push({ genre: item.genre, youtubeUrl: item.youtubeUrl, memo: item.memo, error: error.message });
      console.log(`error: ${error.message}`);
    }
  }

  const valid = results.filter(row => !row.error);
  const exactCount = valid.filter(row => row.exact).length;
  const top3Count = valid.filter(row => row.top3).length;
  const macroValid = valid.filter(row => row.macroExact !== null);
  const macroExactCount = macroValid.filter(row => row.macroExact).length;
  const profiles = { ...api.musicGenreProfiles };
  for (const [genre, vectors] of vectorsByGenre.entries()) {
    if (vectors.length) profiles[genre] = vectorStats(vectors);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    sourceDataset: path.basename(loaded.target),
    endpoint: DEFAULT_ENDPOINT,
    total: valid.length,
    errors: results.filter(row => row.error).length,
    macroTop1Accuracy: macroValid.length ? Math.round((macroExactCount / macroValid.length) * 1000) / 10 : 0,
    exactAccuracy: valid.length ? Math.round((exactCount / valid.length) * 1000) / 10 : 0,
    top3Accuracy: valid.length ? Math.round((top3Count / valid.length) * 1000) / 10 : 0
  };

  fs.writeFileSync(RESULTS_PATH, JSON.stringify({ summary, results }, null, 2));
  const profilePayload = JSON.stringify({ ...summary, profileMode: "mean-plus-spread", profiles }, null, 2);
  fs.writeFileSync(PROFILES_PATH, profilePayload);
  fs.mkdirSync(path.dirname(DEMO_PROFILES_PATH), { recursive: true });
  fs.writeFileSync(DEMO_PROFILES_PATH, profilePayload);
  console.log(`\nMacro Top1: ${summary.macroTop1Accuracy}% / Exact: ${summary.exactAccuracy}% / Top3: ${summary.top3Accuracy}%`);
  console.log(`Wrote ${path.relative(ROOT, RESULTS_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, PROFILES_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, DEMO_PROFILES_PATH)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
