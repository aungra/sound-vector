import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(SCRIPT_DIR, "..");
const REPO_DIR = path.resolve(DEMO_DIR, "../..");
const HTML_PATH = path.join(DEMO_DIR, "MUSIC MEMORY FITTING ROOM.html");
const DELAUNAY_VENDOR_PATH = path.join(DEMO_DIR, "vendor", "d3-delaunay.min.js");
const DEFAULT_MANIFEST_PATH = path.join(REPO_DIR, "genre-training", "track-boundary-v97-control-manifest.json");
const DEFAULT_REPORT_PATH = path.join(REPO_DIR, "genre-training", "track-boundary-v97-independent-evaluation.json");
const DEFAULT_CACHE_DIR = "/private/tmp/musictee-track-boundary-v97-evaluation-cache";
const DEFAULT_API_URL = "http://127.0.0.1:4195/api/audio-analyze";
const REVISION = "2026-08-23-track-boundary-reranker-v97";
const BOUNDARY_METHODS = [
  "spokenRapBlackMusicBoundary",
  "distributedDanceRockBoundary",
  "postPunkRockConsensus"
];

function parseArgs(argv) {
  const options = {
    apiUrl: DEFAULT_API_URL,
    cacheDir: DEFAULT_CACHE_DIR,
    manifestPath: DEFAULT_MANIFEST_PATH,
    reportPath: DEFAULT_REPORT_PATH,
    limit: 0,
    refresh: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--api") options.apiUrl = argv[++index];
    else if (value === "--cache-dir") options.cacheDir = argv[++index];
    else if (value === "--manifest") options.manifestPath = path.resolve(argv[++index]);
    else if (value === "--report") options.reportPath = path.resolve(argv[++index]);
    else if (value === "--limit") options.limit = Math.max(0, Number(argv[++index]) || 0);
    else if (value === "--refresh") options.refresh = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function stableControlId(row) {
  return sha256(`${row.datasetName || row.source || "unknown"}\0${row.trackId || row.filePath}`).slice(0, 20);
}

function appScriptSource({ disableV97Boundaries = false } = {}) {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  let source = scripts.at(-1);
  if (disableV97Boundaries) {
    for (const method of BOUNDARY_METHODS) {
      const variable = method === "postPunkRockConsensus"
        ? "postPunkRockConsensus"
        : method === "distributedDanceRockBoundary"
          ? "distributedDanceRock"
          : "spokenRapBlackMusic";
      const evidence = method === "postPunkRockConsensus"
        ? "postPunkRockConsensusEvidence"
        : method === "distributedDanceRockBoundary"
          ? "distributedDanceRockEvidence"
          : "spokenRapBlackMusicEvidence";
      const exact = `const ${variable} = ${evidence}(`;
      if (!source.includes(exact)) throw new Error(`Could not disable ${method}; source declaration changed.`);
      source = source.replace(exact, `const ${variable} = false && ${evidence}(`);
    }
  }
  return source.replace(
    /cleanupStoredSessions\(\);\s*(?:restoreLatestAcceptedSession\(\);\s*)?render\(\);\s*loadCalibratedGenreProfiles\(\);(?:\s*await loadSharedGenreFeedbackModel\(\);)?\s*$/,
    "globalThis.__evaluationApi={GENRE_INFERENCE_REVISION,inferMusicGenres};"
  );
}

function loadInferenceApi(options = {}) {
  const context = {
    console: { log() {}, info() {}, warn() {}, error: console.error },
    Date,
    Math,
    JSON,
    URL,
    atob: value => Buffer.from(String(value), "base64").toString("binary"),
    btoa: value => Buffer.from(String(value), "binary").toString("base64"),
    setTimeout,
    clearTimeout,
    Blob: function Blob() {},
    FileReader: function FileReader() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      querySelector: () => null,
      getElementById: () => ({ innerHTML: "", value: "", files: [] }),
      createElement: () => ({ click() {}, setAttribute() {}, style: {} })
    },
    window: {},
    navigator: {},
    location: { href: "http://127.0.0.1:4193/", hostname: "127.0.0.1", pathname: "/", protocol: "http:" }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(DELAUNAY_VENDOR_PATH, "utf8"), context);
  vm.runInContext(appScriptSource(options), context);
  if (!context.__evaluationApi?.inferMusicGenres) throw new Error("Production inference API could not be loaded.");
  return context.__evaluationApi;
}

function selectControls(manifestPath, limit = 0) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const controls = (manifest.items || [])
    .filter(row => row.split === "test"
      && row.evaluationOnly === true
      && row.trainingEligible === false
      && Number(row.durationSeconds || 0) >= 120
      && row.genre
      && row.filePath
      && fs.existsSync(row.filePath))
    .map(row => ({ ...row, controlId: stableControlId(row) }))
    .sort((a, b) => a.controlId.localeCompare(b.controlId));
  return limit > 0 ? controls.slice(0, limit) : controls;
}

async function analyzeControl(control, options) {
  const cachePath = path.join(options.cacheDir, `${control.controlId}.json`);
  if (!options.refresh && fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    if (cached.analysisContract?.embeddingGenreLive !== true
      || cached.analysisContract?.embeddingGenreConsensus !== true) {
      throw new Error(`Degraded cache rejected for ${control.controlId}; rerun with --refresh.`);
    }
    return cached;
  }
  const response = await fetch(options.apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://127.0.0.1:4193"
    },
    body: JSON.stringify({
      action: "analyze-local-file",
      filePath: control.filePath,
      startSeconds: 0,
      sourceType: "cc-dataset",
      clientInferenceRevision: REVISION
    }),
    signal: AbortSignal.timeout(12 * 60 * 1000)
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok || !payload.features) {
    throw new Error(`Analysis failed for ${control.controlId}: ${payload.error || response.status}`);
  }
  const cached = {
    revision: REVISION,
    controlId: control.controlId,
    expectedGenre: control.genre,
    sourceFamily: control.datasetName || control.source || "unknown",
    analysisContract: options.analysisContract,
    features: payload.features
  };
  fs.mkdirSync(options.cacheDir, { recursive: true });
  fs.writeFileSync(cachePath, `${JSON.stringify(cached)}\n`);
  return cached;
}

async function requireProductionAnalysisContract(options) {
  const healthUrl = new URL(options.apiUrl);
  healthUrl.pathname = "/health";
  healthUrl.search = "";
  const response = await fetch(healthUrl, { signal: AbortSignal.timeout(10_000) });
  const health = await response.json();
  const dependencies = health.dependencies || {};
  const contract = {
    revision: health.genreInferenceRevision || "",
    embeddingGenreLive: dependencies.embeddingGenreLive === true,
    embeddingGenreConsensus: dependencies.embeddingGenreConsensus === true,
    localSegmentConsensus: dependencies.localSegmentConsensus === true,
    japaneseVocalEvidence: dependencies.japaneseVocalEvidence === true,
    classificationScope: dependencies.classificationScope || "",
    trackSampleCount: Number(dependencies.trackSampleCount || 0),
    trackSampleWindowSeconds: Number(dependencies.trackSampleWindowSeconds || 0)
  };
  const valid = response.ok
    && health.ok === true
    && contract.revision === REVISION
    && contract.embeddingGenreLive
    && contract.embeddingGenreConsensus
    && contract.localSegmentConsensus
    && contract.japaneseVocalEvidence
    && contract.classificationScope === "track"
    && contract.trackSampleCount === 4
    && contract.trackSampleWindowSeconds === 30;
  if (!valid) throw new Error(`Production analysis contract unavailable: ${JSON.stringify(contract)}`);
  return contract;
}

function topNames(analysis) {
  return (analysis?.top || []).slice(0, 3).map(item => item.name || item.label || "").filter(Boolean);
}

function activatedBoundaries(analysis) {
  const corrections = analysis?.boundaryCorrection || {};
  return BOUNDARY_METHODS.filter(method => Object.hasOwn(corrections, method));
}

function evaluateRecord(control, cached, baselineApi, currentApi) {
  const baseline = baselineApi.inferMusicGenres(cached.features);
  const current = currentApi.inferMusicGenres(cached.features);
  const baselineTop = topNames(baseline);
  const currentTop = topNames(current);
  const activations = activatedBoundaries(current);
  const expected = control.genre;
  return {
    controlId: control.controlId,
    expectedGenre: expected,
    sourceFamily: control.datasetName || control.source || "unknown",
    sampledRangeCount: Array.isArray(cached.features.sampledRanges) ? cached.features.sampledRanges.length : 0,
    analysisWindowSeconds: Number(cached.features.analysisWindowSeconds || 0),
    baselineTop,
    currentTop,
    baselineCorrect: baselineTop[0] === expected,
    currentCorrect: currentTop[0] === expected,
    changed: baselineTop[0] !== currentTop[0],
    rescued: baselineTop[0] !== expected && currentTop[0] === expected,
    regressed: baselineTop[0] === expected && currentTop[0] !== expected,
    boundaryMethods: activations,
    falseBoundaryMethods: activations.filter(() => currentTop[0] !== expected),
    needsReview: current?.needsReview === true
  };
}

function summarize(records) {
  const count = records.length;
  const boundaryStats = Object.fromEntries(BOUNDARY_METHODS.map(method => [method, {
    activations: 0,
    falseActivations: 0,
    rescues: 0,
    regressions: 0
  }]));
  for (const record of records) {
    for (const method of record.boundaryMethods) {
      const stats = boundaryStats[method];
      stats.activations += 1;
      if (record.falseBoundaryMethods.includes(method)) stats.falseActivations += 1;
      if (record.rescued) stats.rescues += 1;
      if (record.regressed) stats.regressions += 1;
    }
  }
  const correct = key => records.filter(record => record[key]).length;
  return {
    controls: count,
    fullTrackControls: records.filter(record => record.analysisWindowSeconds >= 100 && record.sampledRangeCount >= 4).length,
    baselineTop1: count ? correct("baselineCorrect") / count : 0,
    currentTop1: count ? correct("currentCorrect") / count : 0,
    changed: correct("changed"),
    rescues: correct("rescued"),
    regressions: correct("regressed"),
    boundaryStats,
    promotionGate: {
      noAggregateTop1Degradation: correct("currentCorrect") >= correct("baselineCorrect"),
      noUnrelatedFalseActivations: Object.values(boundaryStats).every(stats => stats.falseActivations === 0),
      passed: correct("currentCorrect") >= correct("baselineCorrect")
        && Object.values(boundaryStats).every(stats => stats.falseActivations === 0)
    }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.analysisContract = await requireProductionAnalysisContract(options);
  const controls = selectControls(options.manifestPath, options.limit);
  if (!controls.length) throw new Error("No eligible full-track controls were found.");
  const baselineApi = loadInferenceApi({ disableV97Boundaries: true });
  const currentApi = loadInferenceApi();
  const records = [];
  for (let index = 0; index < controls.length; index += 1) {
    const control = controls[index];
    process.stderr.write(`[${index + 1}/${controls.length}] ${control.genre} ${control.controlId}\n`);
    const cached = await analyzeControl(control, options);
    const record = evaluateRecord(control, cached, baselineApi, currentApi);
    records.push(record);
    process.stderr.write(`  ${record.baselineTop[0] || "(none)"} -> ${record.currentTop[0] || "(none)"}`
      + `${record.boundaryMethods.length ? ` [${record.boundaryMethods.join(",")}]` : ""}\n`);
  }
  const report = {
    version: "track-boundary-independent-evaluation-v1",
    generatedAt: new Date().toISOString(),
    inferenceRevision: currentApi.GENRE_INFERENCE_REVISION,
    baseline: "same production inference with v97's three boundary rerankers disabled",
    dataPolicy: "full-length, evaluation-only, training-ineligible CC tracks; no title, artist, URL or channel inference",
    analysisContract: options.analysisContract,
    manifest: path.basename(options.manifestPath),
    summary: summarize(records),
    records
  };
  fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
  fs.writeFileSync(options.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
}

await main();
