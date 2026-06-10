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
const FEATURE_CACHE_PATH = path.join(ROOT, "genre-training", "feature-cache.json");
const SPLITS_PATH = path.join(ROOT, "genre-training", "dataset-splits.json");
const MODEL_PATH = path.join(ROOT, "genre-training", "genre-model.json");
const DEMO_MODEL_PATH = path.join(DEMO_DIR, "genre-training", "genre-model.json");
const DEFAULT_ENDPOINT = process.env.MMFR_AUDIO_ENDPOINT || "http://127.0.0.1:4194/api/audio-analyze";
const MODEL_VERSION = "sound-vector-genre-model.v1";
const CACHE_ONLY = process.env.MMFR_GENRE_TRAIN_CACHE_ONLY === "1";
const RETRY_ERRORS_ONLY = process.env.MMFR_GENRE_TRAIN_RETRY_ERRORS_ONLY === "1";
const STOP_ON_RATE_LIMIT = process.env.MMFR_GENRE_TRAIN_STOP_ON_RATE_LIMIT !== "0";
const STOP_ON_COOKIE_REQUIRED = process.env.MMFR_GENRE_TRAIN_STOP_ON_COOKIE_REQUIRED !== "0";
const EXPECTED_MACRO_GENRES = ["ambient", "black_music", "classical", "electronic", "jazz", "pop", "rock", "world"];
const FINE_EXCLUDED = new Set(["電子音楽", "ワールドミュージック"]);
const VECTOR_KEYS = [
  "tempo", "energy", "bass", "lowBandRatio", "midBandRatio", "highBandRatio",
  "rhythm", "onset", "brightness", "zcr", "rmsContrast", "onsetContrast",
  "bassContrast", "centroidContrast", "chromaEntropy", "chromaMotion",
  "onsetDensity", "onsetRegularity", "rmsBuild", "chorusLift", "midDensity",
  "guitarBand", "vocalBand", "acousticness", "distortion", "breakbeatDensity",
  "squareWave"
];
const FEATURE_WEIGHTS = {
  tempo: 1.12,
  energy: .82,
  bass: .72,
  lowBandRatio: .9,
  midBandRatio: .92,
  highBandRatio: .78,
  rhythm: 1,
  onset: .94,
  brightness: .76,
  zcr: .78,
  rmsContrast: .74,
  onsetContrast: .7,
  bassContrast: .58,
  centroidContrast: .58,
  chromaEntropy: .82,
  chromaMotion: .78,
  onsetDensity: .92,
  onsetRegularity: .7,
  rmsBuild: .62,
  chorusLift: .72,
  midDensity: .72,
  guitarBand: .92,
  vocalBand: .74,
  acousticness: .92,
  distortion: 1,
  breakbeatDensity: 1.08,
  squareWave: .95
};
const MACRO_ALIASES = { black: "black_music", folk: "world" };

function canonicalMacro(value) {
  const key = String(value || "").trim();
  return MACRO_ALIASES[key] || key;
}

function trainingRoleForGenre(genre) {
  return FINE_EXCLUDED.has(genre) ? "macro-only" : "fine";
}

function stableHash(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

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
        macroGenre: canonicalMacro(item.macroGenre || ""),
        trainingRole: item.trainingRole || trainingRoleForGenre(String(item.genre || "").trim()),
        youtubeUrl: String(item.youtubeUrl || item.url || "").trim(),
        memo: item.memo || "",
        canonicalArtist: item.canonicalArtist || "",
        canonicalTitle: item.canonicalTitle || "",
        channelName: item.channelName || "",
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
      response.on("data", chunk => { raw += chunk; });
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

function loadFeatureCache() {
  if (!fs.existsSync(FEATURE_CACHE_PATH)) return { version: MODEL_VERSION, endpoint: DEFAULT_ENDPOINT, items: {} };
  try {
    const payload = JSON.parse(fs.readFileSync(FEATURE_CACHE_PATH, "utf8"));
    return payload?.items ? payload : { version: MODEL_VERSION, endpoint: DEFAULT_ENDPOINT, items: {} };
  } catch {
    return { version: MODEL_VERSION, endpoint: DEFAULT_ENDPOINT, items: {} };
  }
}

function saveFeatureCache(cache) {
  fs.writeFileSync(FEATURE_CACHE_PATH, JSON.stringify({ ...cache, version: MODEL_VERSION, endpoint: DEFAULT_ENDPOINT, updatedAt: new Date().toISOString() }, null, 2));
}

function loadPreviousErrorUrls() {
  if (!fs.existsSync(RESULTS_PATH)) return new Set();
  try {
    const payload = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
    const errors = Array.isArray(payload?.errors) ? payload.errors : [];
    return new Set(errors.map(item => item.youtubeUrl).filter(Boolean));
  } catch {
    return new Set();
  }
}

function isRateLimitError(message) {
  return /YOUTUBE_RATE_LIMITED|rate-limited by YouTube|This content isn't available,\s*try again later|try again later\. The current session/i.test(String(message || ""));
}

function isCookieRequiredError(message) {
  return /YOUTUBE_COOKIE_REQUIRED|bot確認|Sign in to confirm you.?re not a bot|cookies-from-browser|cookies for the authentication/i.test(String(message || ""));
}

async function analyzeYoutube(item, cache, endpoint = DEFAULT_ENDPOINT) {
  const key = item.youtubeUrl;
  const cached = cache.items[key];
  if (cached?.features) return cached.features;
  if (CACHE_ONLY) throw new Error("not cached; skipped by MMFR_GENRE_TRAIN_CACHE_ONLY=1");
  const response = await postJson(endpoint, { action: "analyze-youtube", youtubeUrl: item.youtubeUrl });
  const payload = response.json;
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `Audio analysis failed: ${response.status}`);
  const features = payload.audioFeatures || payload.features || payload;
  cache.items[key] = {
    genre: item.genre,
    macroGenre: item.macroGenre,
    trainingRole: item.trainingRole,
    youtubeUrl: item.youtubeUrl,
    analyzedAt: new Date().toISOString(),
    features
  };
  return features;
}

function vectorValues(vector) {
  return VECTOR_KEYS.map(key => Number(vector[key]) || 0);
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

function makeSplits(rows) {
  const groups = new Map();
  rows.forEach(row => {
    const key = row.trainingRole === "macro-only" ? `macro:${row.macroGenre}:${row.genre}` : `fine:${row.genre}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  const assignments = {};
  for (const [key, list] of groups.entries()) {
    const sorted = [...list].sort((a, b) => stableHash(`${key}|${a.canonicalArtist}|${a.youtubeUrl}`) - stableHash(`${key}|${b.canonicalArtist}|${b.youtubeUrl}`));
    const n = sorted.length;
    const trainMax = Math.max(1, Math.floor(n * .7));
    const validationMax = Math.max(trainMax + 1, Math.floor(n * .85));
    sorted.forEach((row, index) => {
      assignments[row.youtubeUrl] = index < trainMax ? "train" : index < validationMax ? "validation" : "test";
    });
  }
  return assignments;
}

function mean(values) {
  const list = values.map(Number).filter(Number.isFinite);
  return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0;
}

function buildStandardizer(rows) {
  const meanByKey = {};
  const stdByKey = {};
  VECTOR_KEYS.forEach((key, index) => {
    const values = rows.map(row => row.values[index]).filter(Number.isFinite);
    const avg = mean(values);
    const variance = values.length ? values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / values.length : 0;
    meanByKey[key] = Math.round(avg * 100000) / 100000;
    stdByKey[key] = Math.round(Math.max(.0001, Math.sqrt(variance)) * 100000) / 100000;
  });
  return { keys: VECTOR_KEYS, mean: meanByKey, std: stdByKey };
}

function standardise(values, standardizer) {
  return values.map((value, index) => {
    const key = VECTOR_KEYS[index];
    return ((Number(value) || 0) - (Number(standardizer.mean[key]) || 0)) / Math.max(.0001, Number(standardizer.std[key]) || 1);
  });
}

function distance(a, b, weights) {
  let total = 0;
  let weightTotal = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const key = VECTOR_KEYS[i];
    const weight = Number(weights[key]) || 1;
    total += Math.pow((a[i] || 0) - (b[i] || 0), 2) * weight;
    weightTotal += weight;
  }
  return Math.sqrt(total / Math.max(.0001, weightTotal));
}

function averageVectors(items) {
  if (!items.length) return VECTOR_KEYS.map(() => 0);
  return VECTOR_KEYS.map((_, index) => mean(items.map(item => item.z[index])));
}

function buildCentroids(examples) {
  const macroGroups = new Map();
  const fineGroups = new Map();
  const fineByMacroGroups = new Map();
  examples.forEach(example => {
    const macro = canonicalMacro(example.macroGenre);
    if (!macroGroups.has(macro)) macroGroups.set(macro, []);
    macroGroups.get(macro).push(example);
    if (example.trainingRole !== "macro-only") {
      if (!fineGroups.has(example.genre)) fineGroups.set(example.genre, []);
      fineGroups.get(example.genre).push(example);
      if (!fineByMacroGroups.has(macro)) fineByMacroGroups.set(macro, new Map());
      const byGenre = fineByMacroGroups.get(macro);
      if (!byGenre.has(example.genre)) byGenre.set(example.genre, []);
      byGenre.get(example.genre).push(example);
    }
  });
  const fineByMacro = {};
  for (const [macro, groupMap] of fineByMacroGroups.entries()) {
    fineByMacro[macro] = Object.fromEntries([...groupMap.entries()].map(([genre, items]) => [genre, averageVectors(items)]));
  }
  return {
    macro: Object.fromEntries([...macroGroups.entries()].map(([macro, items]) => [macro, averageVectors(items)])),
    fine: Object.fromEntries([...fineGroups.entries()].map(([genre, items]) => [genre, averageVectors(items)])),
    fineByMacro
  };
}

function scoreKnn(examples, target, labelGetter, weights, k = 11) {
  const scores = {};
  examples
    .map(example => ({ label: labelGetter(example), distance: distance(target, example.z, weights) }))
    .filter(row => row.label)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k)
    .forEach((row, index) => {
      const weight = (1 / Math.pow(row.distance + .18, 2)) * (1 - index / Math.max(1, k * 1.4));
      scores[row.label] = (scores[row.label] || 0) + weight;
    });
  return scores;
}

function scoreCentroids(centroids, target, weights) {
  const scores = {};
  Object.entries(centroids || {}).forEach(([label, centroid]) => {
    scores[label] = 1 / Math.pow(distance(target, centroid, weights) + .2, 2);
  });
  return scores;
}

function mergeScores(a, b, aWeight = .66, bWeight = .34) {
  const out = {};
  new Set(Object.keys(a || {}).concat(Object.keys(b || {}))).forEach(key => {
    out[key] = (a?.[key] || 0) * aWeight + (b?.[key] || 0) * bWeight;
  });
  return out;
}

function rankScores(scores) {
  const max = Math.max(...Object.values(scores).map(Number), .0001);
  return Object.entries(scores)
    .map(([label, score]) => ({ label, score: Math.round((score / max) * 1000) / 10 }))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

function classify(values, model) {
  const target = standardise(values, model.standardizer);
  const examples = model.examples.map(example => ({ ...example, z: standardise(example.values, model.standardizer) }));
  const macroScores = mergeScores(
    scoreKnn(examples, target, item => canonicalMacro(item.macroGenre), model.featureWeights, model.knnK),
    scoreCentroids(model.centroids.macro, target, model.featureWeights)
  );
  const macroRanked = rankScores(macroScores);
  const macro = macroRanked[0]?.label || "";
  const scopedFineExamples = examples.filter(item => item.trainingRole !== "macro-only" && canonicalMacro(item.macroGenre) === macro);
  const fineExamples = scopedFineExamples.length >= 3 ? scopedFineExamples : examples.filter(item => item.trainingRole !== "macro-only");
  const fineScores = mergeScores(
    scoreKnn(fineExamples, target, item => item.genre, model.featureWeights, model.knnK),
    scoreCentroids(model.centroids.fineByMacro[macro] || model.centroids.fine, target, model.featureWeights),
    .68,
    .32
  );
  const fineRanked = rankScores(fineScores);
  const confidence = fineRanked[0]?.score || 0;
  const margin = confidence - (fineRanked[1]?.score || 0);
  return { macroRanked, fineRanked, confidence, needsReview: confidence < 58 || margin < 8 };
}

function buildModel(rows) {
  const trainRows = rows.filter(row => row.split === "train");
  const standardizer = buildStandardizer(trainRows);
  const examples = trainRows.map(row => ({ ...row, z: standardise(row.values, standardizer) }));
  const centroids = buildCentroids(examples);
  const macroGenres = [...new Set(rows.map(row => canonicalMacro(row.macroGenre)))].sort();
  return {
    version: MODEL_VERSION,
    generatedAt: new Date().toISOString(),
    sourceDataset: "verified-dataset.json",
    featureKeys: VECTOR_KEYS,
    featureWeights: FEATURE_WEIGHTS,
    standardizer,
    knnK: 11,
    expectedMacroGenres: EXPECTED_MACRO_GENRES,
    macroGenres,
    missingMacroGenres: EXPECTED_MACRO_GENRES.filter(macro => !macroGenres.includes(macro)),
    fineGenres: [...new Set(rows.filter(row => row.trainingRole !== "macro-only").map(row => row.genre))].sort(),
    fineExcludedGenres: [...FINE_EXCLUDED],
    centroids,
    examples: trainRows.map(row => ({
      genre: row.genre,
      macroGenre: canonicalMacro(row.macroGenre),
      trainingRole: row.trainingRole,
      split: row.split,
      youtubeUrl: row.youtubeUrl,
      canonicalArtist: row.canonicalArtist,
      canonicalTitle: row.canonicalTitle,
      values: row.values
    }))
  };
}

function evaluate(rows, model) {
  const results = rows
    .filter(row => row.split === "test")
    .map(row => {
      const predicted = classify(row.values, model);
      const topFine = predicted.fineRanked.map(item => item.label);
      const topMacro = predicted.macroRanked.map(item => item.label);
      const fineEvaluable = row.trainingRole !== "macro-only";
      return {
        genre: row.genre,
        macroGenre: canonicalMacro(row.macroGenre),
        trainingRole: row.trainingRole,
        split: row.split,
        youtubeUrl: row.youtubeUrl,
        predicted: topFine[0] || "",
        predictedMacro: topMacro[0] || "",
        exact: fineEvaluable ? topFine[0] === row.genre : null,
        top3: fineEvaluable ? topFine.slice(0, 3).includes(row.genre) : null,
        macroExact: topMacro[0] === canonicalMacro(row.macroGenre),
        needsReview: predicted.needsReview,
        confidence: predicted.confidence,
        top: predicted.fineRanked.slice(0, 5).map(item => ({ name: item.label, score: Math.round(item.score) })),
        macro: predicted.macroRanked.slice(0, 4).map(item => ({ macro: item.label, score: Math.round(item.score) }))
      };
    });
  const fine = results.filter(row => row.exact !== null);
  const macro = results.filter(row => row.macroExact !== null);
  const dubPredictions = results.filter(row => row.predicted === "ダブ").length;
  return {
    summary: {
      generatedAt: new Date().toISOString(),
      sourceDataset: "verified-dataset.json",
      endpoint: DEFAULT_ENDPOINT,
      evaluationSplit: "test",
      total: results.length,
      fineTotal: fine.length,
      macroTop1Accuracy: macro.length ? Math.round(macro.filter(row => row.macroExact).length / macro.length * 1000) / 10 : 0,
      fineTop1Accuracy: fine.length ? Math.round(fine.filter(row => row.exact).length / fine.length * 1000) / 10 : 0,
      fineTop3Accuracy: fine.length ? Math.round(fine.filter(row => row.top3).length / fine.length * 1000) / 10 : 0,
      needsReviewRate: results.length ? Math.round(results.filter(row => row.needsReview).length / results.length * 1000) / 10 : 0,
      dubPredictionRate: results.length ? Math.round(dubPredictions / results.length * 1000) / 10 : 0
      ,
      missingMacroGenres: model.missingMacroGenres || []
    },
    results
  };
}

async function main() {
  const loaded = loadDataset();
  const dataset = loaded.items;
  if (!dataset.length) {
    console.log("No training URLs found. Copy genre-training/genre-dataset.example.json to genre-training/genre-dataset.json and fill youtubeUrl values.");
    return;
  }

  const api = loadAppGenreApi();
  const cache = loadFeatureCache();
  const retryUrls = RETRY_ERRORS_ONLY ? loadPreviousErrorUrls() : new Set();
  if (RETRY_ERRORS_ONLY) {
    console.log(`Retrying previous error URLs only: ${retryUrls.size} target(s). Cached rows are still used to rebuild the model.`);
  }
  const analyzedRows = [];
  const vectorsByGenre = new Map();

  for (const item of dataset) {
    process.stdout.write(`[${item.index + 1}/${dataset.length}] ${item.genre} ... `);
    try {
      if (RETRY_ERRORS_ONLY && !retryUrls.has(item.youtubeUrl) && !cache.items[item.youtubeUrl]?.features) {
        throw new Error("not targeted by MMFR_GENRE_TRAIN_RETRY_ERRORS_ONLY=1 and not cached");
      }
      const features = await analyzeYoutube(item, cache);
      const enriched = api.enrichFeaturesWithGenre(features);
      const vector = api.genreFeatureVector(enriched);
      const values = vectorValues(vector);
      const row = { ...item, vector, values };
      analyzedRows.push(row);
      if (!vectorsByGenre.has(item.genre)) vectorsByGenre.set(item.genre, []);
      vectorsByGenre.get(item.genre).push(vector);
      console.log(cache.items[item.youtubeUrl]?.analyzedAt ? "ok" : "cached");
    } catch (error) {
      analyzedRows.push({ ...item, error: error.message });
      console.log(`error: ${error.message}`);
      if (STOP_ON_RATE_LIMIT && isRateLimitError(error.message)) {
        console.log("Stopping early because YouTube reported a temporary rate limit. Retry later or replace genre-training/youtube-cookies.txt.");
        break;
      }
      if (STOP_ON_COOKIE_REQUIRED && isCookieRequiredError(error.message)) {
        console.log("Stopping early because YouTube still requires valid cookies. Replace genre-training/youtube-cookies.txt, then retry.");
        break;
      }
    }
    if (analyzedRows.length % 20 === 0) saveFeatureCache(cache);
  }
  saveFeatureCache(cache);

  const validRows = analyzedRows.filter(row => !row.error);
  const splitAssignments = makeSplits(validRows);
  const rows = validRows.map(row => ({ ...row, split: splitAssignments[row.youtubeUrl] || "train" }));
  const model = buildModel(rows);
  const evaluation = evaluate(rows, model);

  const profiles = { ...api.musicGenreProfiles };
  for (const [genre, vectors] of vectorsByGenre.entries()) {
    if (vectors.length) profiles[genre] = vectorStats(vectors);
  }

  const splitPayload = {
    generatedAt: new Date().toISOString(),
    seed: "fnv1a:url+genre",
    ratios: { train: .7, validation: .15, test: .15 },
    items: rows.map(row => ({
      genre: row.genre,
      macroGenre: canonicalMacro(row.macroGenre),
      trainingRole: row.trainingRole,
      youtubeUrl: row.youtubeUrl,
      split: row.split
    }))
  };

  fs.writeFileSync(SPLITS_PATH, JSON.stringify(splitPayload, null, 2));
  fs.writeFileSync(MODEL_PATH, JSON.stringify(model, null, 2));
  fs.mkdirSync(path.dirname(DEMO_MODEL_PATH), { recursive: true });
  fs.writeFileSync(DEMO_MODEL_PATH, JSON.stringify(model, null, 2));
  fs.writeFileSync(RESULTS_PATH, JSON.stringify({ summary: evaluation.summary, results: evaluation.results, errors: analyzedRows.filter(row => row.error) }, null, 2));

  const profilePayload = JSON.stringify({ ...evaluation.summary, profileMode: "mean-plus-spread-fallback", profiles }, null, 2);
  fs.writeFileSync(PROFILES_PATH, profilePayload);
  fs.mkdirSync(path.dirname(DEMO_PROFILES_PATH), { recursive: true });
  fs.writeFileSync(DEMO_PROFILES_PATH, profilePayload);

  console.log(`\nMacro Top1: ${evaluation.summary.macroTop1Accuracy}% / Fine Top1: ${evaluation.summary.fineTop1Accuracy}% / Fine Top3: ${evaluation.summary.fineTop3Accuracy}%`);
  console.log(`Needs review: ${evaluation.summary.needsReviewRate}% / Dub predictions: ${evaluation.summary.dubPredictionRate}%`);
  console.log(`Wrote ${path.relative(ROOT, FEATURE_CACHE_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, SPLITS_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, MODEL_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, RESULTS_PATH)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
