import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(SCRIPT_DIR, "..");
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const LOCAL_CACHE_PATHS_PATH = path.join(ROOT, "genre-training", "cache-paths.local.json");
function loadLocalCachePaths() {
  if (!fs.existsSync(LOCAL_CACHE_PATHS_PATH)) return {};
  try {
    const payload = JSON.parse(fs.readFileSync(LOCAL_CACHE_PATHS_PATH, "utf8"));
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return {};
  }
}
const LOCAL_CACHE_PATHS = loadLocalCachePaths();
const HTML_PATH = path.join(DEMO_DIR, "MUSIC MEMORY FITTING ROOM.html");
const DATASET_PATH = path.join(ROOT, "genre-training", "genre-dataset.json");
const VERIFIED_DATASET_PATH = path.resolve(process.env.MMFR_GENRE_VERIFIED_DATASET_PATH || LOCAL_CACHE_PATHS.verifiedDatasetPath || path.join(ROOT, "genre-training", "verified-dataset.json"));
const EXAMPLE_DATASET_PATH = path.join(ROOT, "genre-training", "genre-dataset.example.json");
const RESULTS_PATH = path.join(ROOT, "genre-training", "results.json");
const PROFILES_PATH = path.join(ROOT, "genre-training", "generated-profiles.json");
const DEMO_PROFILES_PATH = path.join(DEMO_DIR, "genre-training", "generated-profiles.json");
const FEATURE_CACHE_PATH = path.resolve(process.env.MMFR_GENRE_FEATURE_CACHE_PATH || LOCAL_CACHE_PATHS.featureCachePath || path.join(ROOT, "genre-training", "feature-cache.json"));
const SPLITS_PATH = path.join(ROOT, "genre-training", "dataset-splits.json");
const MODEL_PATH = path.join(ROOT, "genre-training", "genre-model.json");
const DEMO_MODEL_PATH = path.join(DEMO_DIR, "genre-training", "genre-model.json");
const GENRE_THEORY_PATH = path.join(ROOT, "genre-training", "genre-theory-profiles.json");
const DEFAULT_ENDPOINT = process.env.MMFR_AUDIO_ENDPOINT || "http://127.0.0.1:4194/api/audio-analyze";
const MODEL_VERSION = "sound-vector-genre-model.v1";
const CACHE_ONLY = process.env.MMFR_GENRE_TRAIN_CACHE_ONLY === "1";
const RETRY_ERRORS_ONLY = process.env.MMFR_GENRE_TRAIN_RETRY_ERRORS_ONLY === "1";
const STOP_ON_RATE_LIMIT = process.env.MMFR_GENRE_TRAIN_STOP_ON_RATE_LIMIT !== "0";
const STOP_ON_COOKIE_REQUIRED = process.env.MMFR_GENRE_TRAIN_STOP_ON_COOKIE_REQUIRED !== "0";
const QUIET = process.env.MMFR_GENRE_TRAIN_QUIET === "1";
const ENABLE_FMA_METADATA = process.env.MMFR_ENABLE_FMA_METADATA === "1";
const ENABLE_ITUNES_PREVIEW = process.env.MMFR_ENABLE_ITUNES_PREVIEW === "1";
const STRICT_CC_ONLY = process.env.MMFR_GENRE_STRICT_CC_ONLY === "1";
const ENABLE_MACRO_HEURISTICS = process.env.MMFR_ENABLE_MACRO_HEURISTICS === "1";
const ENABLE_VALIDATION_CALIBRATION = process.env.MMFR_ENABLE_VALIDATION_CALIBRATION === "1";
const ENABLE_STRICT_TWO_STAGE = process.env.MMFR_STRICT_TWO_STAGE === "1";
const ENABLE_SOFT_TWO_STAGE = process.env.MMFR_SOFT_TWO_STAGE !== "0";
const ENABLE_EXTENDED_GENRE_FEATURES = process.env.MMFR_EXTENDED_GENRE_FEATURES === "1";
const ENABLE_ADVANCED_GENRE_FEATURES = process.env.MMFR_ADVANCED_GENRE_FEATURES === "1";
const ENABLE_BALANCED_KNN = process.env.MMFR_BALANCED_KNN === "1";
const ENABLE_DISTRIBUTION_CLASSIFIER = process.env.MMFR_DISTRIBUTION_CLASSIFIER !== "0";
const ENABLE_SEPARABILITY_WEIGHTS = process.env.MMFR_SEPARABILITY_WEIGHTS !== "0";
const ENABLE_GENRE_THEORY_PRIORS = process.env.MMFR_ENABLE_GENRE_THEORY_PRIORS !== "0";
const ENABLE_THEORY_GENRE_FEATURES = process.env.MMFR_ENABLE_THEORY_GENRE_FEATURES === "1";
const ENABLE_VALIDATION_RERANKER = process.env.MMFR_ENABLE_VALIDATION_RERANKER === "1";
const ENABLE_FUNK_STYLE_TARGET = process.env.MMFR_ENABLE_FUNK_STYLE_TARGET === "1";
const EVALUATION_SPLITS = new Set(
  String(process.env.MMFR_GENRE_EVALUATION_SPLITS || "test")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
);
const VALIDATION_RERANKER_MIN_SUCCESS = Math.max(1, Number(process.env.MMFR_VALIDATION_RERANKER_MIN_SUCCESS || 2));
const VALIDATION_RERANKER_MIN_TOTAL = Math.max(1, Number(process.env.MMFR_VALIDATION_RERANKER_MIN_TOTAL || 3));
const VALIDATION_RERANKER_MIN_PRECISION = Math.max(0, Math.min(1, Number(process.env.MMFR_VALIDATION_RERANKER_MIN_PRECISION || .5)));
const VALIDATION_RERANKER_MAX_HARM_RATE = Math.max(0, Math.min(1, Number(process.env.MMFR_VALIDATION_RERANKER_MAX_HARM_RATE || .34)));
const GENRE_THEORY_WEIGHT = Math.max(0, Math.min(.35, Number(process.env.MMFR_GENRE_THEORY_WEIGHT || .05)));
const GENRE_THEORY_MACRO_WEIGHT = Math.max(0, Math.min(.2, Number(process.env.MMFR_GENRE_THEORY_MACRO_WEIGHT || GENRE_THEORY_WEIGHT * .7)));
const FMA_AUDIO_WEIGHT = Math.max(.1, Math.min(1, Number(process.env.MMFR_FMA_AUDIO_WEIGHT || .82)));
const STYLE_FINE_BOOST_TOP = Math.max(0, Math.min(1.2, Number(process.env.MMFR_STYLE_FINE_BOOST_TOP || .42)));
const STYLE_FINE_BOOST_SECOND = Math.max(0, Math.min(1, Number(process.env.MMFR_STYLE_FINE_BOOST_SECOND || .27)));
const STYLE_FINE_BOOST_THIRD = Math.max(0, Math.min(.8, Number(process.env.MMFR_STYLE_FINE_BOOST_THIRD || .15)));
const MIN_FORMAL_TEST_PER_GENRE = Math.max(1, Number(process.env.MMFR_MIN_FORMAL_TEST_PER_GENRE || 10));
const FORMAL_SOURCE_TYPES = new Set(["cc-dataset", "local-audio"]);
const EXPECTED_MACRO_GENRES = ["ambient", "black_music", "classical", "electronic", "jazz", "pop", "rock", "world"];
const FINE_EXCLUDED = new Set(["電子音楽", "ワールドミュージック"]);
const PRIORITY_GENRE_TARGETS = {
  "シティ・ポップ": 100,
  "J-POP": 100,
  "ドローン": 100,
  "クラシック音楽": 100,
  "ダブ": 100,
  "テクノ": 100
};
const DEFAULT_GENRE_TARGET = 50;
const CITY_POP_STYLE_HINT = "city_pop";
const CITY_POP_STYLE_LABEL = "シティ・ポップ";
const STYLE_CLASSIFIERS = {
  pop: {
    other: "pop_other",
    targets: {
      [CITY_POP_STYLE_HINT]: { label: CITY_POP_STYLE_LABEL, source: "styleHint", boostFineGenre: "" }
    },
    weightMultipliers: {
      tempo: 1.08,
      bass: 1.18,
      rhythm: 1.16,
      brightness: 1.14,
      chromaEntropy: 1.18,
      chromaMotion: 1.12,
      rmsContrast: 1.08,
      chorusLift: .92,
      vocalBand: .94,
      distortion: .82,
      guitarBand: .84
    }
  },
  electronic: {
    other: "electronic_other",
    targets: {
      techno: { label: "テクノ", source: "genre", genre: "テクノ", boostFineGenre: "テクノ" }
    },
    weightMultipliers: {
      tempo: 1.26,
      rhythm: 1.22,
      onset: 1.12,
      onsetRegularity: 1.26,
      tempoStability: 1.24,
      beatGridStrength: 1.26,
      fourOnFloor: 1.32,
      kickGrid: 1.28,
      pulseClarity: 1.14,
      bassContrast: 1.14,
      centroidContrast: 1.08,
      breakbeatDensity: .88,
      breakbeatIrregularity: .82,
      squareWave: .96,
      acousticness: .74,
      guitarBand: .72
    }
  },
  ambient: {
    other: "ambient_other",
    targets: {
      drone: { label: "ドローン", source: "genre", genre: "ドローン", boostFineGenre: "ドローン" }
    },
    weightMultipliers: {
      tempo: .74,
      energy: 1.2,
      rhythm: 1.22,
      onset: 1.18,
      onsetDensity: 1.28,
      brightness: 1.1,
      centroidContrast: 1.22,
      bass: 1.12,
      lowBandRatio: 1.14,
      acousticness: 1.12,
      zcr: 1.08,
      sustainRatio: 1.46,
      transientScarcity: 1.48,
      reverbTail: 1.22,
      tempoStability: .72,
      beatGridStrength: .68,
      pulseClarity: .7,
      bandFlux: .76,
      percussiveRatio: .74,
      fourOnFloor: .56,
      kickGrid: .58
    }
  },
  black_music: {
    other: "black_music_other",
    targets: {
      dub: { label: "ダブ", source: "genre", genre: "ダブ", boostFineGenre: "ダブ" },
      ...(ENABLE_FUNK_STYLE_TARGET ? {
        funk: { label: "ファンク", source: "genre", genre: "ファンク", boostFineGenre: "ファンク" }
      } : {})
    },
    weightMultipliers: {
      bass: 1.24,
      lowBandRatio: 1.24,
      highBandRatio: 1.18,
      brightness: 1.12,
      onset: 1.08,
      onsetRegularity: 1.16,
      bassContrast: 1.16,
      rhythm: 1.1,
      offbeatEmphasis: 1.28,
      reverbTail: 1.34,
      syncopation: 1.16,
      lowMidBalance: 1.12,
      spectralRolloff: .82,
      tempoStability: .92,
      vocalBand: .86,
      breakbeatDensity: .82,
      squareWave: .86,
      fourOnFloor: .76,
      kickGrid: .88
    }
  }
};
const BASE_VECTOR_KEYS = [
  "tempo", "energy", "bass", "lowBandRatio", "midBandRatio", "highBandRatio",
  "rhythm", "onset", "brightness", "zcr", "rmsContrast", "onsetContrast",
  "bassContrast", "centroidContrast", "chromaEntropy", "chromaMotion",
  "onsetDensity", "onsetRegularity", "rmsBuild", "chorusLift", "midDensity",
  "guitarBand", "vocalBand", "acousticness", "distortion", "breakbeatDensity",
  "squareWave"
];
const THEORY_VECTOR_KEYS = [
  "fourOnFloor", "kickGrid", "offbeatEmphasis", "breakbeatIrregularity",
  "sustainRatio", "transientScarcity", "reverbTail", "structureRecurrence",
  "vocalBandStability"
];
const ADVANCED_VECTOR_KEYS = [
  "mfcc1", "mfcc2", "mfcc3", "spectralRolloff", "tempoStability",
  "beatGridStrength", "syncopation", "vocalPresence"
];
const EXTENDED_VECTOR_KEYS = [
  "spectralSpread", "bandFlux", "harmonicRatio", "percussiveRatio",
  "lowMidBalance", "highNoiseRatio", "pulseClarity"
];
const VECTOR_KEYS = ENABLE_EXTENDED_GENRE_FEATURES
  ? BASE_VECTOR_KEYS.concat(ENABLE_THEORY_GENRE_FEATURES ? THEORY_VECTOR_KEYS : [], ENABLE_ADVANCED_GENRE_FEATURES ? ADVANCED_VECTOR_KEYS : [], EXTENDED_VECTOR_KEYS)
  : BASE_VECTOR_KEYS.concat(ENABLE_THEORY_GENRE_FEATURES ? THEORY_VECTOR_KEYS : [], ENABLE_ADVANCED_GENRE_FEATURES ? ADVANCED_VECTOR_KEYS : []);
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
  squareWave: .95,
  fourOnFloor: .32,
  kickGrid: .3,
  offbeatEmphasis: .24,
  breakbeatIrregularity: .3,
  sustainRatio: .24,
  transientScarcity: .24,
  reverbTail: .22,
  structureRecurrence: .24,
  vocalBandStability: .26,
  mfcc1: .34,
  mfcc2: .32,
  mfcc3: .28,
  spectralRolloff: .42,
  tempoStability: .48,
  beatGridStrength: .52,
  syncopation: .42,
  vocalPresence: .5,
  spectralSpread: .82,
  bandFlux: .9,
  harmonicRatio: .9,
  percussiveRatio: 1,
  lowMidBalance: .78,
  highNoiseRatio: .88,
  pulseClarity: .88
};
const MACRO_FEATURE_MULTIPLIERS = {
  ambient: {
    onsetDensity: 1.28,
    onsetRegularity: .82,
    acousticness: 1.16,
    centroidContrast: 1.12,
    zcr: 1.18,
    energy: .9,
    harmonicRatio: 1.18,
    percussiveRatio: .78,
    pulseClarity: .78,
    bandFlux: .82,
    tempoStability: .78,
    beatGridStrength: .72,
    spectralRolloff: .86,
    vocalPresence: .84,
    sustainRatio: 1.24,
    transientScarcity: 1.28,
    reverbTail: 1.08,
    fourOnFloor: .64,
    kickGrid: .66
  },
  electronic: {
    tempo: 1.18,
    rhythm: 1.16,
    onsetRegularity: 1.22,
    breakbeatDensity: 1.18,
    squareWave: 1.14,
    bassContrast: 1.08,
    percussiveRatio: 1.18,
    pulseClarity: 1.16,
    bandFlux: 1.12,
    tempoStability: 1.18,
    beatGridStrength: 1.24,
    syncopation: 1.1,
    spectralRolloff: 1.08,
    mfcc2: 1.06,
    fourOnFloor: 1.24,
    kickGrid: 1.2,
    offbeatEmphasis: 1.08,
    breakbeatIrregularity: 1.16,
    transientScarcity: .78
  },
  black_music: {
    bass: 1.18,
    lowBandRatio: 1.18,
    onsetRegularity: 1.12,
    vocalBand: 1.08,
    highBandRatio: 1.1,
    bassContrast: 1.12,
    lowMidBalance: 1.12,
    pulseClarity: 1.06,
    beatGridStrength: 1.08,
    syncopation: 1.18,
    vocalPresence: 1.12,
    spectralRolloff: .92,
    offbeatEmphasis: 1.16,
    reverbTail: 1.14,
    fourOnFloor: .86,
    kickGrid: .94
  },
  rock: {
    distortion: 1.34,
    guitarBand: 1.3,
    midDensity: 1.18,
    onsetDensity: 1.1,
    highBandRatio: 1.08,
    highNoiseRatio: 1.18,
    percussiveRatio: 1.1,
    spectralRolloff: 1.16,
    mfcc1: 1.08,
    mfcc2: 1.12,
    vocalPresence: .96
  },
  pop: {
    vocalBand: 1.28,
    chorusLift: 1.24,
    rmsBuild: 1.18,
    brightness: 1.12,
    chromaMotion: 1.08,
    harmonicRatio: 1.08,
    vocalPresence: 1.32,
    tempoStability: 1.06,
    spectralRolloff: 1.04
    ,
    structureRecurrence: 1.18,
    vocalBandStability: 1.22
  },
  jazz: {
    chromaEntropy: 1.3,
    chromaMotion: 1.2,
    acousticness: 1.24,
    onsetRegularity: 1.08,
    midBandRatio: 1.1,
    harmonicRatio: 1.22,
    spectralSpread: 1.06,
    syncopation: 1.2,
    vocalPresence: .96,
    mfcc3: 1.1
  },
  classical: {
    acousticness: 1.34,
    rmsContrast: 1.24,
    onsetDensity: .9,
    chromaEntropy: 1.14,
    highBandRatio: 1.08,
    harmonicRatio: 1.2,
    percussiveRatio: .86,
    beatGridStrength: .72,
    syncopation: .82,
    spectralRolloff: 1.02,
    vocalPresence: 1.1,
    sustainRatio: 1.12,
    transientScarcity: 1.08,
    kickGrid: .72
  },
  world: {
    acousticness: 1.24,
    chromaEntropy: 1.18,
    chromaMotion: 1.16,
    onsetRegularity: 1.12,
    midBandRatio: 1.08,
    harmonicRatio: 1.14,
    spectralSpread: 1.1,
    syncopation: 1.16,
    beatGridStrength: 1.08,
    vocalPresence: .98,
    mfcc3: 1.08
  }
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
        styleHint: String(item.styleHint || "").trim(),
        styleConfidence: Number(item.styleConfidence || item.cityPopStyleScore || 0) || null,
        styleEvidence: String(item.styleEvidence || "").trim(),
        trainingRole: item.trainingRole || trainingRoleForGenre(String(item.genre || "").trim()),
        youtubeUrl: String(item.youtubeUrl || item.url || "").trim(),
        previewUrl: String(item.previewUrl || "").trim(),
        filePath: String(item.filePath || item.localAudioPath || "").trim(),
        sourceUrl: String(item.sourceUrl || item.previewUrl || item.youtubeUrl || item.url || item.filePath || item.localAudioPath || "").trim(),
        referenceUrl: String(item.referenceUrl || item.trackViewUrl || item.youtubeUrl || item.url || "").trim(),
        sourceType: String(item.sourceType || (item.previewUrl ? "itunes-preview" : item.filePath || item.localAudioPath ? "cc-dataset" : "youtube")).trim(),
        source: item.source || "",
        memo: item.memo || "",
        license: item.license || "",
        licenseUrl: item.licenseUrl || "",
        datasetName: item.datasetName || item.sourceDataset || "",
        trackId: item.trackId || "",
        canonicalArtist: item.canonicalArtist || "",
        canonicalTitle: item.canonicalTitle || "",
        channelName: item.channelName || "",
        artistName: item.artistName || "",
        trackName: item.trackName || "",
        collectionName: item.collectionName || "",
        primaryGenreName: item.primaryGenreName || "",
        embeddedFeatures: item.features || item.audioFeatures || null,
        sourceDataset: path.basename(target)
      }))
      .filter(item => item.genre && item.sourceUrl)
  };
}

function loadGenreTheory() {
  if (!ENABLE_GENRE_THEORY_PRIORS || !fs.existsSync(GENRE_THEORY_PATH)) {
    return { enabled: false, profiles: {}, sources: [] };
  }
  try {
    const payload = JSON.parse(fs.readFileSync(GENRE_THEORY_PATH, "utf8"));
    return {
      ...payload,
      enabled: true,
      profiles: payload?.profiles && typeof payload.profiles === "object" ? payload.profiles : {},
      sources: Array.isArray(payload?.sources) ? payload.sources : []
    };
  } catch (error) {
    console.warn(`Failed to load genre theory profiles: ${error.message}`);
    return { enabled: false, profiles: {}, sources: [], error: error.message };
  }
}

function loadAppGenreApi() {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const appScript = scripts.at(-1).replace(
    /cleanupStoredSessions\(\);\s*(?:restoreLatestAcceptedSession\(\);\s*)?render\(\);\s*loadCalibratedGenreProfiles\(\);\s*$/,
    "globalThis.__genreApi={state,enrichFeaturesWithGenre,genreFeatureVector,inferMusicGenres,musicGenreProfiles};"
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
  if (!context.__genreApi) {
    throw new Error("Could not load the shared genre API from the demo HTML.");
  }
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
  if (!fs.existsSync(FEATURE_CACHE_PATH)) return { version: MODEL_VERSION, endpoint: DEFAULT_ENDPOINT, items: {}, dirty: false };
  try {
    const payload = JSON.parse(fs.readFileSync(FEATURE_CACHE_PATH, "utf8"));
    return payload?.items ? { ...compactFeatureCache(payload), dirty: false } : { version: MODEL_VERSION, endpoint: DEFAULT_ENDPOINT, items: {}, dirty: false };
  } catch {
    return { version: MODEL_VERSION, endpoint: DEFAULT_ENDPOINT, items: {}, dirty: false };
  }
}

function saveFeatureCache(cache) {
  if (!cache.dirty && process.env.MMFR_FORCE_FEATURE_CACHE_SAVE !== "1") return;
  const compact = compactFeatureCache(cache);
  const payload = JSON.stringify({ ...compact, version: MODEL_VERSION, endpoint: DEFAULT_ENDPOINT, updatedAt: new Date().toISOString() }, null, 2);
  fs.mkdirSync(path.dirname(FEATURE_CACHE_PATH), { recursive: true });
  const tmpPath = `${FEATURE_CACHE_PATH}.tmp`;
  fs.writeFileSync(tmpPath, payload);
  fs.renameSync(tmpPath, FEATURE_CACHE_PATH);
  cache.dirty = false;
}

function compactSeries(values, length = 64) {
  if (!Array.isArray(values)) return [];
  if (values.length <= length) return values.map(value => Number(value) || 0);
  return Array.from({ length }, (_, index) => {
    const sourceIndex = Math.min(values.length - 1, Math.round(index * (values.length - 1) / Math.max(1, length - 1)));
    return Number(values[sourceIndex]) || 0;
  });
}

function compactMatrix(rows, rowCount = 24, colCount = 12) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const sampledRows = compactSeries(rows.map((_, index) => index), Math.min(rowCount, rows.length))
    .map(index => rows[Math.max(0, Math.min(rows.length - 1, Math.round(index)))]);
  return sampledRows.map(row => compactSeries(Array.isArray(row) ? row : [], colCount));
}

function compactAudioFeatures(features = {}) {
  const detail = features.detail && typeof features.detail === "object" ? features.detail : {};
  const compactDetail = {
    version: detail.version || "mmfr.training-detail.v1",
    frameCount: detail.frameCount,
    waveformFrameCount: Math.min(Number(detail.waveformFrameCount || detail.waveform?.length || 0), 64),
    chromaFrameCount: Math.min(Number(detail.chromaFrameCount || detail.chromaTimeline?.length || 0), 24),
    bandFrameCount: Math.min(Number(detail.bandFrameCount || detail.bandTimeline?.length || 0), 24),
    waveform: compactSeries(detail.waveform, 64),
    rms: compactSeries(detail.rms, 64),
    bass: compactSeries(detail.bass, 64),
    centroid: compactSeries(detail.centroid, 64),
    onset: compactSeries(detail.onset, 64),
    zeroCrossing: compactSeries(detail.zeroCrossing, 64),
    chromaTimeline: compactMatrix(detail.chromaTimeline, 24, 12),
    bandTimeline: compactMatrix(detail.bandTimeline, 24, 8),
    spectralRolloff: compactSeries(detail.spectralRolloff, 24),
    mfccTimeline: compactMatrix(detail.mfccTimeline, 24, 3)
  };
  return {
    source: features.source,
    tempo: features.tempo,
    energy: features.energy,
    rms: features.rms,
    bass: features.bass,
    brightness: features.brightness,
    lowBandRatio: features.lowBandRatio,
    midBandRatio: features.midBandRatio,
    highBandRatio: features.highBandRatio,
    tonalCentroid: features.tonalCentroid,
    spectralCentroid: features.spectralCentroid,
    centroid: features.centroid,
    rhythm: features.rhythm,
    onset: features.onset,
    phase: features.phase,
    chroma: compactSeries(features.chroma, 12),
    temporalProfile: compactSeries(features.temporalProfile, 16),
    detail: compactDetail,
    sourceType: features.sourceType,
    sourceUrl: features.sourceUrl,
    normalizedUrl: features.normalizedUrl,
    startSeconds: features.startSeconds,
    analysisWindowSeconds: features.analysisWindowSeconds,
    localMeta: features.localMeta
  };
}

function compactFeatureCache(cache = {}) {
  const items = {};
  for (const [key, value] of Object.entries(cache.items || {})) {
    if (!value?.features) {
      items[key] = value;
      continue;
    }
    items[key] = { ...value, features: compactAudioFeatures(value.features) };
  }
  return { ...cache, items };
}

function loadPreviousErrorUrls() {
  if (!fs.existsSync(RESULTS_PATH)) return new Set();
  try {
    const payload = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
    const errors = Array.isArray(payload?.errors) ? payload.errors : [];
    return new Set(errors.map(sourceKeyForItem).filter(Boolean));
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
  const key = sourceKeyForItem(item);
  const legacyKey = item.youtubeUrl || item.previewUrl || item.sourceUrl;
  const cached = cache.items[key] || cache.items[legacyKey];
  if (cached?.features) {
    if (!cache.items[key]) {
      cache.items[key] = { ...cached, sourceType: item.sourceType, sourceUrl: item.sourceUrl, referenceUrl: item.referenceUrl };
      cache.dirty = true;
    }
    return cached.features;
  }
  if (item.embeddedFeatures) {
    const features = compactAudioFeatures(item.embeddedFeatures);
    cache.items[key] = {
      genre: item.genre,
      macroGenre: item.macroGenre,
      styleHint: item.styleHint,
      styleConfidence: item.styleConfidence,
      trainingRole: item.trainingRole,
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      referenceUrl: item.referenceUrl,
      analyzedAt: item.verifiedAt || new Date().toISOString(),
      features
    };
    cache.dirty = true;
    return features;
  }
  if (CACHE_ONLY) throw new Error("not cached; skipped by MMFR_GENRE_TRAIN_CACHE_ONLY=1");
  const body = item.sourceType === "itunes-preview"
    ? {
        action: "analyze-preview-url",
        previewUrl: item.previewUrl || item.sourceUrl,
        previewMeta: {
          artistName: item.artistName || item.canonicalArtist,
          trackName: item.trackName || item.canonicalTitle,
          collectionName: item.collectionName,
          primaryGenreName: item.primaryGenreName,
          referenceUrl: item.referenceUrl
        }
      }
    : item.sourceType === "cc-dataset" || item.sourceType === "local-audio"
    ? {
        action: "analyze-local-file",
        filePath: item.filePath || item.sourceUrl,
        sourceType: item.sourceType,
        localMeta: {
          datasetName: item.datasetName,
          trackId: item.trackId,
          artistName: item.artistName || item.canonicalArtist,
          trackName: item.trackName || item.canonicalTitle,
          license: item.license,
          licenseUrl: item.licenseUrl,
          referenceUrl: item.referenceUrl
        }
      }
    : { action: "analyze-youtube", youtubeUrl: item.youtubeUrl || item.sourceUrl };
  const response = await postJson(endpoint, body);
  const payload = response.json;
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `Audio analysis failed: ${response.status}`);
  const features = compactAudioFeatures(payload.audioFeatures || payload.features || payload);
  cache.items[key] = {
    genre: item.genre,
    macroGenre: item.macroGenre,
    styleHint: item.styleHint,
    styleConfidence: item.styleConfidence,
    trainingRole: item.trainingRole,
    sourceType: item.sourceType,
    sourceUrl: item.sourceUrl,
    referenceUrl: item.referenceUrl,
    youtubeUrl: item.youtubeUrl,
    previewUrl: item.previewUrl,
    filePath: item.filePath,
    license: item.license,
    licenseUrl: item.licenseUrl,
    datasetName: item.datasetName,
    trackId: item.trackId,
    analyzedAt: new Date().toISOString(),
    features
  };
  cache.dirty = true;
  return features;
}

function sourceKeyForItem(item = {}) {
  const type = item.sourceType || (item.previewUrl ? "itunes-preview" : "youtube");
  const value = item.sourceUrl || item.previewUrl || item.youtubeUrl || item.url || "";
  return value ? `${type}:${value}` : "";
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
  const assignments = {};
  const artistKeyForSplit = row => {
    const artist = String(row.canonicalArtist || row.artistName || row.channelName || "").trim().toLowerCase();
    return artist || `track:${sourceKeyForItem(row)}`;
  };
  rows.forEach(row => {
    if (row.sourceType === "fma-metadata") return;
    const stylePart = row.styleHint ? `:style:${row.styleHint}` : "";
    const key = row.trainingRole === "macro-only" ? `macro:${row.macroGenre}:${row.genre}` : `fine:${row.genre}${stylePart}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  rows
    .filter(row => row.sourceType === "fma-metadata")
    .forEach(row => {
      assignments[sourceKeyForItem(row)] = "train";
    });
  for (const [key, list] of groups.entries()) {
    const artistGroups = new Map();
    list.forEach(row => {
      const artistKey = artistKeyForSplit(row);
      if (!artistGroups.has(artistKey)) artistGroups.set(artistKey, []);
      artistGroups.get(artistKey).push(row);
    });
    const sortedGroups = [...artistGroups.entries()]
      .map(([artistKey, artistRows]) => ({
        artistKey,
        rows: artistRows.sort((a, b) => stableHash(`${key}|${sourceKeyForItem(a)}`) - stableHash(`${key}|${sourceKeyForItem(b)}`))
      }))
      .sort((a, b) => stableHash(`${key}|${a.artistKey}`) - stableHash(`${key}|${b.artistKey}`));
    if (sortedGroups.length === 1) {
      sortedGroups[0].rows.forEach(row => {
        assignments[sourceKeyForItem(row)] = "train";
      });
      continue;
    }
    if (sortedGroups.length === 2) {
      const bySize = [...sortedGroups].sort((a, b) => a.rows.length - b.rows.length || stableHash(`${key}|${a.artistKey}`) - stableHash(`${key}|${b.artistKey}`));
      bySize[0].rows.forEach(row => {
        assignments[sourceKeyForItem(row)] = "test";
      });
      bySize[1].rows.forEach(row => {
        assignments[sourceKeyForItem(row)] = "train";
      });
      continue;
    }
    const n = list.length;
    const testCount = n >= 50 ? Math.max(MIN_FORMAL_TEST_PER_GENRE, Math.floor(n * .15)) : Math.max(1, n - Math.floor(n * .85));
    const validationCount = n >= 50 ? Math.max(5, Math.floor(n * .15)) : Math.max(1, Math.floor(n * .15));
    const trainMax = Math.max(1, n - validationCount - testCount);
    const targets = {
      train: trainMax,
      validation: validationCount,
      test: testCount
    };
    const counts = { train: 0, validation: 0, test: 0 };
    const splitOrder = ["test", "validation", "train"];
    const tiePriority = { test: 0, validation: 1, train: 2 };
    sortedGroups.forEach(group => {
      const split = splitOrder
        .filter(name => targets[name] > 0)
        .sort((a, b) => {
          const aRatio = counts[a] / Math.max(1, targets[a]);
          const bRatio = counts[b] / Math.max(1, targets[b]);
          return aRatio - bRatio || tiePriority[a] - tiePriority[b];
        })[0] || "train";
      group.rows.forEach(row => {
        assignments[sourceKeyForItem(row)] = split;
      });
      counts[split] += group.rows.length;
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

function sampleWeightForRow(row = {}) {
  if (row.sourceType === "fma-metadata") return ENABLE_FMA_METADATA ? .16 : 0;
  if (row.sourceType === "cc-dataset" && row.datasetName === "FMA") return FMA_AUDIO_WEIGHT;
  return 1;
}

function isTrainingSourceEnabled(row = {}) {
  if (row.sourceType === "fma-metadata") return ENABLE_FMA_METADATA;
  if (row.sourceType === "itunes-preview") return ENABLE_ITUNES_PREVIEW;
  if (STRICT_CC_ONLY) return FORMAL_SOURCE_TYPES.has(row.sourceType);
  return true;
}

function isFormalSource(row = {}) {
  return FORMAL_SOURCE_TYPES.has(row.sourceType);
}

function rawFeatureObject(values = []) {
  return Object.fromEntries(VECTOR_KEYS.map((key, index) => [key, Number(values[index]) || 0]));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function rangeSupport(value, spec = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const hasMin = Number.isFinite(Number(spec.min));
  const hasMax = Number.isFinite(Number(spec.max));
  if (hasMin && number < Number(spec.min)) {
    const tolerance = Math.max(.08, Number(spec.tolerance) || Math.abs(Number(spec.min)) * .22 || .2);
    return clamp01(1 - (Number(spec.min) - number) / tolerance);
  }
  if (hasMax && number > Number(spec.max)) {
    const tolerance = Math.max(.08, Number(spec.tolerance) || Math.abs(Number(spec.max)) * .22 || .2);
    return clamp01(1 - (number - Number(spec.max)) / tolerance);
  }
  if (Number.isFinite(Number(spec.value))) {
    const tolerance = Math.max(.08, Number(spec.tolerance) || .24);
    return clamp01(1 - Math.abs(number - Number(spec.value)) / tolerance);
  }
  if (hasMin || hasMax) return 1;
  return null;
}

function tempoSupport(tempo, spec = {}) {
  const value = Number(tempo);
  if (!Number.isFinite(value) || value <= 0) return null;
  const candidates = [value];
  if (spec.allowHalfTime) candidates.push(value * 2);
  if (spec.allowDoubleTime) candidates.push(value / 2);
  if (spec.allowHalfTime || spec.allowDoubleTime) {
    candidates.push(value * 2, value / 2);
  }
  return Math.max(...candidates.map(candidate => rangeSupport(candidate, spec)).filter(score => score !== null), 0);
}

function scoreTheoryProfile(values = [], profile = {}) {
  const v = rawFeatureObject(values);
  let total = 0;
  let weightTotal = 0;
  if (profile.tempoBpm) {
    const score = tempoSupport(v.tempo, profile.tempoBpm);
    const weight = Number(profile.tempoBpm.weight) || 1;
    if (score !== null) {
      total += score * weight;
      weightTotal += weight;
    }
  }
  for (const [key, spec] of Object.entries(profile.features || {})) {
    if (!VECTOR_KEYS.includes(key)) continue;
    const score = rangeSupport(v[key], spec);
    const weight = Number(spec?.weight) || 1;
    if (score !== null) {
      total += score * weight;
      weightTotal += weight;
    }
  }
  return weightTotal ? total / weightTotal : 0;
}

function scoreGenreTheory(values = [], model = {}, allowedGenres = null) {
  if (!ENABLE_GENRE_THEORY_PRIORS || !model.genreTheory?.enabled || !GENRE_THEORY_WEIGHT) return {};
  const profiles = model.genreTheory.profiles || {};
  const allowed = allowedGenres ? new Set(allowedGenres) : null;
  return Object.fromEntries(Object.entries(profiles)
    .filter(([genre]) => !allowed || allowed.has(genre))
    .map(([genre, profile]) => [genre, scoreTheoryProfile(values, profile)])
    .filter(([, score]) => score > 0));
}

function blendTheoryScores(scores = {}, values = [], model = {}, allowedGenres = null) {
  if (!Object.keys(scores).length) return scores;
  const theoryScores = scoreGenreTheory(values, model, allowedGenres);
  if (!Object.keys(theoryScores).length) return scores;
  const maxScore = Math.max(...Object.values(scores).map(Number), .0001);
  const out = { ...scores };
  for (const [genre, theoryScore] of Object.entries(theoryScores)) {
    if (!(genre in out)) continue;
    out[genre] = (Number(out[genre]) || 0) + maxScore * GENRE_THEORY_WEIGHT * clamp01(theoryScore);
  }
  return out;
}

function scoreMacroTheory(values = [], model = {}) {
  if (!ENABLE_GENRE_THEORY_PRIORS || !model.genreTheory?.enabled || !GENRE_THEORY_MACRO_WEIGHT) return {};
  const out = {};
  Object.values(model.genreTheory.profiles || {}).forEach(profile => {
    const macro = canonicalMacro(profile?.macroGenre);
    if (!macro) return;
    const score = scoreTheoryProfile(values, profile);
    out[macro] = Math.max(Number(out[macro]) || 0, score);
  });
  return Object.fromEntries(Object.entries(out).filter(([, score]) => score > 0));
}

function blendMacroTheoryScores(scores = {}, values = [], model = {}) {
  if (!Object.keys(scores).length) return scores;
  const theoryScores = scoreMacroTheory(values, model);
  if (!Object.keys(theoryScores).length) return scores;
  const maxScore = Math.max(...Object.values(scores).map(Number), .0001);
  const out = { ...scores };
  for (const [macro, theoryScore] of Object.entries(theoryScores)) {
    if (!(macro in out)) continue;
    out[macro] = (Number(out[macro]) || 0) + maxScore * GENRE_THEORY_MACRO_WEIGHT * clamp01(theoryScore);
  }
  return out;
}

function scoreMacroHeuristics(values = []) {
  const v = rawFeatureObject(values);
  const scores = {};
  const add = (macro, value) => {
    scores[macro] = (scores[macro] || 0) + Math.max(0, value);
  };
  add("pop", v.vocalBand * 1.4 + v.chorusLift * 1.35 + v.rmsBuild * .8 + v.brightness * .55 + v.chromaMotion * .45 + v.vocalBandStability * .28 + v.structureRecurrence * .22);
  add("ambient", (1 - v.onsetDensity) * 1.25 + (1 - v.energy) * .75 + v.acousticness * 1.1 + v.centroidContrast * .45 + v.transientScarcity * .28 + v.sustainRatio * .25);
  add("classical", v.acousticness * 1.45 + v.rmsContrast * .9 + v.chromaEntropy * .75 + (1 - v.onsetDensity) * .7 + v.sustainRatio * .18);
  add("electronic", v.onsetRegularity * 1.05 + v.breakbeatDensity * 1 + v.squareWave * .85 + (1 - v.acousticness) * .55 + v.fourOnFloor * .3 + v.kickGrid * .26 + v.breakbeatIrregularity * .24);
  add("black_music", v.lowBandRatio * 1.2 + v.bass * .95 + (1 - v.highBandRatio) * .55 + v.onsetRegularity * .65 + v.vocalBand * .4 + v.offbeatEmphasis * .22 + v.reverbTail * .18);
  add("rock", v.distortion * 1.35 + v.guitarBand * 1.1 + v.midDensity * .85 + v.onsetDensity * .55);
  add("jazz", v.chromaEntropy * 1.1 + v.chromaMotion * .9 + v.acousticness * .8 + v.midBandRatio * .45);
  add("world", v.chromaMotion * .95 + v.chromaEntropy * .8 + v.acousticness * .75 + v.onsetRegularity * .5);
  return scores;
}

function averageVectors(items) {
  if (!items.length) return VECTOR_KEYS.map(() => 0);
  return VECTOR_KEYS.map((_, index) => {
    let total = 0;
    let weightTotal = 0;
    items.forEach(item => {
      const weight = sampleWeightForRow(item);
      total += (Number(item.z[index]) || 0) * weight;
      weightTotal += weight;
    });
    return total / Math.max(.0001, weightTotal);
  });
}

function distributionVector(items) {
  const meanVector = averageVectors(items);
  const stdVector = VECTOR_KEYS.map((_, index) => {
    let total = 0;
    let weightTotal = 0;
    items.forEach(item => {
      const weight = sampleWeightForRow(item);
      total += Math.pow((Number(item.z[index]) || 0) - meanVector[index], 2) * weight;
      weightTotal += weight;
    });
    return Math.max(.22, Math.sqrt(total / Math.max(.0001, weightTotal)));
  });
  return { mean: meanVector, std: stdVector, count: items.length };
}

function buildCentroids(examples) {
  const macroGroups = new Map();
  const fineGroups = new Map();
  const fineByMacroGroups = new Map();
  const styleByFamilyGroups = new Map();
  examples.forEach(example => {
    const macro = canonicalMacro(example.macroGenre);
    if (!macroGroups.has(macro)) macroGroups.set(macro, []);
    macroGroups.get(macro).push(example);
    const styleFamily = styleFamilyForRow(example);
    const styleLabel = styleLabelForRow(example);
    if (styleFamily && styleLabel) {
      if (!styleByFamilyGroups.has(styleFamily)) styleByFamilyGroups.set(styleFamily, new Map());
      const byStyle = styleByFamilyGroups.get(styleFamily);
      if (!byStyle.has(styleLabel)) byStyle.set(styleLabel, []);
      byStyle.get(styleLabel).push(example);
    }
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
  const styleByFamily = {};
  for (const [family, groupMap] of styleByFamilyGroups.entries()) {
    styleByFamily[family] = Object.fromEntries([...groupMap.entries()].map(([style, items]) => [style, averageVectors(items)]));
  }
  return {
    macro: Object.fromEntries([...macroGroups.entries()].map(([macro, items]) => [macro, averageVectors(items)])),
    fine: Object.fromEntries([...fineGroups.entries()].map(([genre, items]) => [genre, averageVectors(items)])),
    fineByMacro,
    styleByFamily,
    popStyle: styleByFamily.pop || {}
  };
}

function buildDistributions(examples) {
  const macroGroups = new Map();
  const fineGroups = new Map();
  const fineByMacroGroups = new Map();
  const styleByFamilyGroups = new Map();
  examples.forEach(example => {
    const macro = canonicalMacro(example.macroGenre);
    if (!macroGroups.has(macro)) macroGroups.set(macro, []);
    macroGroups.get(macro).push(example);
    const styleFamily = styleFamilyForRow(example);
    const styleLabel = styleLabelForRow(example);
    if (styleFamily && styleLabel) {
      if (!styleByFamilyGroups.has(styleFamily)) styleByFamilyGroups.set(styleFamily, new Map());
      const byStyle = styleByFamilyGroups.get(styleFamily);
      if (!byStyle.has(styleLabel)) byStyle.set(styleLabel, []);
      byStyle.get(styleLabel).push(example);
    }
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
    fineByMacro[macro] = Object.fromEntries([...groupMap.entries()].map(([genre, items]) => [genre, distributionVector(items)]));
  }
  const styleByFamily = {};
  for (const [family, groupMap] of styleByFamilyGroups.entries()) {
    styleByFamily[family] = Object.fromEntries([...groupMap.entries()].map(([style, items]) => [style, distributionVector(items)]));
  }
  return {
    macro: Object.fromEntries([...macroGroups.entries()].map(([macro, items]) => [macro, distributionVector(items)])),
    fine: Object.fromEntries([...fineGroups.entries()].map(([genre, items]) => [genre, distributionVector(items)])),
    fineByMacro,
    styleByFamily,
    popStyle: styleByFamily.pop || {}
  };
}

function buildSeparabilityFeatureWeights(examples, baseWeights = FEATURE_WEIGHTS) {
  const groups = new Map();
  examples
    .filter(example => example.trainingRole !== "macro-only")
    .forEach(example => {
      if (!groups.has(example.genre)) groups.set(example.genre, []);
      groups.get(example.genre).push(example);
    });
  if (groups.size < 3) return baseWeights;
  const ratios = VECTOR_KEYS.map((key, index) => {
    const globalValues = examples.map(example => Number(example.z[index]) || 0);
    const globalMean = mean(globalValues);
    let between = 0;
    let within = 0;
    let weightTotal = 0;
    for (const items of groups.values()) {
      const groupWeight = Math.sqrt(items.length);
      const values = items.map(item => Number(item.z[index]) || 0);
      const groupMean = mean(values);
      const groupVariance = values.length
        ? values.reduce((sum, value) => sum + Math.pow(value - groupMean, 2), 0) / values.length
        : 0;
      between += Math.pow(groupMean - globalMean, 2) * groupWeight;
      within += groupVariance * groupWeight;
      weightTotal += groupWeight;
    }
    return {
      key,
      ratio: (between / Math.max(.0001, weightTotal)) / Math.max(.08, within / Math.max(.0001, weightTotal))
    };
  });
  const sorted = ratios.map(item => item.ratio).filter(Number.isFinite).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 1;
  return Object.fromEntries(VECTOR_KEYS.map(key => {
    const ratio = ratios.find(item => item.key === key)?.ratio || median || 1;
    const multiplier = Math.max(.62, Math.min(1.42, Math.sqrt(ratio / Math.max(.0001, median || 1))));
    return [key, Math.round((Number(baseWeights[key] || 1) * multiplier) * 10000) / 10000];
  }));
}

function scoreKnn(examples, target, labelGetter, weights, k = 11, balanceLabels = ENABLE_BALANCED_KNN) {
  const scores = {};
  const labelCounts = balanceLabels ? examples.reduce((acc, example) => {
    const label = labelGetter(example);
    if (label) acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {}) : {};
  const counts = Object.values(labelCounts).filter(Boolean).sort((a, b) => a - b);
  const medianCount = counts.length ? counts[Math.floor(counts.length / 2)] : 1;
  examples
    .map(example => ({ ...example, label: labelGetter(example), distance: distance(target, example.z, weights) }))
    .filter(row => row.label)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k)
    .forEach((row, index) => {
      const labelBalance = balanceLabels
        ? Math.sqrt(Math.max(1, medianCount) / Math.max(1, labelCounts[row.label] || medianCount))
        : 1;
      const weight = (1 / Math.pow(row.distance + .18, 2)) * (1 - index / Math.max(1, k * 1.4)) * sampleWeightForRow(row) * labelBalance;
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

function scoreDistributions(distributions, target, weights) {
  const scores = {};
  Object.entries(distributions || {}).forEach(([label, stats]) => {
    const meanVector = Array.isArray(stats?.mean) ? stats.mean : [];
    const stdVector = Array.isArray(stats?.std) ? stats.std : [];
    let total = 0;
    let weightTotal = 0;
    for (let i = 0; i < Math.min(target.length, meanVector.length); i++) {
      const key = VECTOR_KEYS[i];
      const weight = Number(weights[key]) || 1;
      const std = Math.max(.18, Number(stdVector[i]) || 1);
      total += Math.pow(((target[i] || 0) - (meanVector[i] || 0)) / std, 2) * weight;
      weightTotal += weight;
    }
    const d = Math.sqrt(total / Math.max(.0001, weightTotal));
    const support = Math.min(1.18, Math.max(.82, Math.log1p(Number(stats?.count) || 1) / Math.log(24)));
    scores[label] = (1 / Math.pow(d + .34, 2)) * support;
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

function addWeightedScores(target, source, weight = 1) {
  Object.entries(source || {}).forEach(([key, value]) => {
    target[key] = (target[key] || 0) + (Number(value) || 0) * weight;
  });
  return target;
}

function weightsForMacro(macro, baseWeights = FEATURE_WEIGHTS) {
  const multipliers = MACRO_FEATURE_MULTIPLIERS[canonicalMacro(macro)] || {};
  return Object.fromEntries(VECTOR_KEYS.map(key => [
    key,
    Math.round((Number(baseWeights[key] || 1) * Number(multipliers[key] || 1)) * 10000) / 10000
  ]));
}

function styleFamilyForRow(row = {}) {
  const macro = canonicalMacro(row.macroGenre);
  return STYLE_CLASSIFIERS[macro] && row.trainingRole !== "macro-only" ? macro : "";
}

function styleTargetForRow(row = {}) {
  const family = styleFamilyForRow(row);
  if (!family) return "";
  const config = STYLE_CLASSIFIERS[family];
  for (const [styleHint, target] of Object.entries(config.targets || {})) {
    if (target.source === "styleHint" && row.styleHint === styleHint) return styleHint;
    if (target.source === "genre" && row.genre === target.genre) return styleHint;
  }
  return "";
}

function styleLabelForRow(row = {}) {
  const family = styleFamilyForRow(row);
  if (!family) return "";
  return styleTargetForRow(row) || STYLE_CLASSIFIERS[family].other;
}

function styleDisplayName(styleHint) {
  for (const config of Object.values(STYLE_CLASSIFIERS)) {
    if (config.targets?.[styleHint]) return config.targets[styleHint].label;
    if (config.other === styleHint) return styleHint;
  }
  return styleHint || "";
}

function fineGenreForStyle(styleHint) {
  for (const config of Object.values(STYLE_CLASSIFIERS)) {
    const target = config.targets?.[styleHint];
    if (target?.boostFineGenre) return target.boostFineGenre;
  }
  return "";
}

function weightsForStyleFamily(family, baseWeights = FEATURE_WEIGHTS) {
  const macroWeights = weightsForMacro(family, baseWeights);
  const multipliers = STYLE_CLASSIFIERS[family]?.weightMultipliers || {};
  return Object.fromEntries(VECTOR_KEYS.map(key => [
    key,
    Math.round((Number(macroWeights[key] || 1) * Number(multipliers[key] || 1)) * 10000) / 10000
  ]));
}

function rankScores(scores) {
  const max = Math.max(...Object.values(scores).map(Number), .0001);
  return Object.entries(scores)
    .map(([label, score]) => ({ label, score: Math.round((score / max) * 1000) / 10 }))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

function classifyStyleFamily(target, examples, model, family) {
  if (!STYLE_CLASSIFIERS[family]) return [];
  const familyExamples = examples.filter(example => styleFamilyForRow(example) === family);
  const labels = new Set(familyExamples.map(styleLabelForRow));
  const hasTarget = Object.keys(STYLE_CLASSIFIERS[family].targets || {}).some(styleHint => labels.has(styleHint));
  if (!hasTarget || familyExamples.length < 8) return [];
  const styleWeights = weightsForStyleFamily(family, model.featureWeights);
  const baseScores = mergeScores(
    scoreKnn(familyExamples, target, styleLabelForRow, styleWeights, model.knnK, true),
    scoreCentroids(model.centroids.styleByFamily?.[family] || {}, target, styleWeights),
    .86,
    .14
  );
  const distributionScoresForStyle = ENABLE_DISTRIBUTION_CLASSIFIER
    ? scoreDistributions(model.distributions?.styleByFamily?.[family] || {}, target, styleWeights)
    : {};
  const styleScores = Object.keys(distributionScoresForStyle).length
    ? mergeScores(baseScores, distributionScoresForStyle, .9, .1)
    : baseScores;
  return rankScores(styleScores).map(item => ({
    ...item,
    family,
    displayName: styleDisplayName(item.label)
  }));
}

function boostFineScoresWithStyle(scores, styleRanked = {}) {
  if (!styleRanked.length || !Object.keys(scores).length) return scores;
  const maxScore = Math.max(...Object.values(scores).map(Number), .0001);
  const out = { ...scores };
  styleRanked.slice(0, 3).forEach((style, index) => {
    const fineGenre = fineGenreForStyle(style.label);
    if (!fineGenre || !(fineGenre in out)) return;
    const confidence = clamp01((Number(style.score) || 0) / 100);
    const weight = index === 0 ? STYLE_FINE_BOOST_TOP : index === 1 ? STYLE_FINE_BOOST_SECOND : STYLE_FINE_BOOST_THIRD;
    out[fineGenre] = (Number(out[fineGenre]) || 0) + maxScore * confidence * weight;
  });
  return out;
}

function rankedScore(ranked = [], labelKey, label) {
  const item = ranked.find(row => row?.[labelKey] === label || row?.label === label);
  return clamp01((Number(item?.score) || 0) / 100);
}

function styleScoreFor(styleRankedByFamily = {}, family, styleHint) {
  return rankedScore(styleRankedByFamily[family] || [], "label", styleHint);
}

function applyFineFalsePositiveGuards(scores = {}, values = [], macroRanked = [], styleRankedByFamily = {}) {
  if (!Object.keys(scores).length) return scores;
  const v = rawFeatureObject(values);
  const out = { ...scores };
  const macro = {
    ambient: rankedScore(macroRanked, "label", "ambient"),
    black_music: rankedScore(macroRanked, "label", "black_music"),
    electronic: rankedScore(macroRanked, "label", "electronic")
  };
  const style = {
    drone: styleScoreFor(styleRankedByFamily, "ambient", "drone"),
    ambientOther: styleScoreFor(styleRankedByFamily, "ambient", STYLE_CLASSIFIERS.ambient.other),
    dub: styleScoreFor(styleRankedByFamily, "black_music", "dub"),
    blackOther: styleScoreFor(styleRankedByFamily, "black_music", STYLE_CLASSIFIERS.black_music.other),
    techno: styleScoreFor(styleRankedByFamily, "electronic", "techno"),
    electronicOther: styleScoreFor(styleRankedByFamily, "electronic", STYLE_CLASSIFIERS.electronic.other)
  };
  if ("テクノ" in out) {
    let multiplier = 1;
    if (macro.electronic < .72) multiplier *= .76;
    if (v.rhythm < .42 || v.onset < .16) multiplier *= .84;
    if ((v.tempo < 112 || v.tempo > 150) && style.techno < .52) multiplier *= .9;
    if (macro.black_music > .6 && v.bass > .62 && style.techno < .58) multiplier *= .84;
    if (style.electronicOther > style.techno + .16 && style.techno < .58) multiplier *= .82;
    out["テクノ"] *= multiplier;
  }
  if ("ダブ" in out) {
    let multiplier = 1;
    if (macro.black_music < .72) multiplier *= .76;
    if (macro.electronic > macro.black_music && style.dub < .56) multiplier *= .88;
    if ((v.bass < .72 || v.lowBandRatio < .55) && style.dub < .56) multiplier *= .9;
    if (v.brightness > .5 || v.highBandRatio > .34) multiplier *= .84;
    if (v.rhythm > .74 || v.onset > .62) multiplier *= .82;
    if (style.blackOther > style.dub + .16 && style.dub < .56) multiplier *= .84;
    out["ダブ"] *= multiplier;
  }
  if ("ドローン" in out) {
    let multiplier = 1;
    if (macro.ambient < .72) multiplier *= .76;
    if (v.energy > .84 || v.rhythm > .52 || v.onset > .38) multiplier *= .76;
    if ((v.rhythm > .44 || v.onset > .34) && style.drone < .56) multiplier *= .86;
    if (v.energy > .9 && style.drone < .5) multiplier *= .9;
    if (v.brightness > .56 || v.zcr > .2) multiplier *= .84;
    if (style.ambientOther > style.drone + .16 && style.drone < .54) multiplier *= .84;
    out["ドローン"] *= multiplier;
  }
  return out;
}

function classify(values, model) {
  const target = standardise(values, model.standardizer);
  const examples = model._standardisedExamples ||= model.examples.map(example => ({ ...example, z: standardise(example.values, model.standardizer) }));
  const baseMacroScores = mergeScores(
    scoreKnn(examples, target, item => canonicalMacro(item.macroGenre), model.featureWeights, model.knnK),
    scoreCentroids(model.centroids.macro, target, model.featureWeights)
  );
  const learnedMacroScores = ENABLE_DISTRIBUTION_CLASSIFIER ? mergeScores(
    baseMacroScores,
    scoreDistributions(model.distributions?.macro, target, model.featureWeights),
    .74,
    .26
  ) : baseMacroScores;
  const uncalibratedMacroScores = ENABLE_MACRO_HEURISTICS
    ? mergeScores(learnedMacroScores, scoreMacroHeuristics(values), .92, .08)
    : learnedMacroScores;
  const macroScores = applyMacroCalibration(blendMacroTheoryScores(uncalibratedMacroScores, values, model), model.calibration);
  const macroRanked = rankScores(macroScores);
  const macro = macroRanked[0]?.label || "";
  const allFineExamples = examples.filter(item => item.trainingRole !== "macro-only");
  const candidateMacros = ENABLE_STRICT_TWO_STAGE
    ? [macro].filter(Boolean)
    : ENABLE_SOFT_TWO_STAGE
      ? macroRanked
        .filter((item, index) => index === 0 || (index === 1 && item.score >= 82) || (index === 2 && item.score >= 74))
        .map(item => item.label)
        .filter(Boolean)
      : macroRanked
        .filter((item, index) => index < 3 && (index < 2 || item.score >= 72))
        .map(item => item.label)
        .filter(Boolean);
  const fineScores = {};
  candidateMacros.forEach((candidateMacro, index) => {
    const fineWeights = weightsForMacro(candidateMacro, model.featureWeights);
    const scopedFineExamples = allFineExamples.filter(item => canonicalMacro(item.macroGenre) === candidateMacro);
    const fineExamples = scopedFineExamples.length >= 3 ? scopedFineExamples : allFineExamples;
    const allowedGenres = [...new Set(fineExamples.map(item => item.genre).filter(Boolean))];
    const baseFineScores = mergeScores(
      scoreKnn(fineExamples, target, item => item.genre, fineWeights, model.knnK),
      scoreCentroids(model.centroids.fineByMacro[candidateMacro] || model.centroids.fine, target, fineWeights),
      .68,
      .32
    );
    const scopedScores = ENABLE_DISTRIBUTION_CLASSIFIER ? mergeScores(
      baseFineScores,
      scoreDistributions(model.distributions?.fineByMacro?.[candidateMacro] || model.distributions?.fine, target, fineWeights),
      .76,
      .24
    ) : baseFineScores;
    const styleRanked = classifyStyleFamily(target, examples, model, candidateMacro);
    const macroScore = (Number(macroRanked[index]?.score) || 0) / 100;
    const macroWeight = index === 0 ? 1 : Math.max(.14, Math.pow(macroScore, ENABLE_SOFT_TWO_STAGE ? 1.6 : 1));
    addWeightedScores(fineScores, boostFineScoresWithStyle(blendTheoryScores(scopedScores, values, model, allowedGenres), styleRanked), macroWeight);
  });
  if (!Object.keys(fineScores).length) {
    const fallbackFineScores = mergeScores(
      scoreKnn(allFineExamples, target, item => item.genre, model.featureWeights, model.knnK),
      scoreCentroids(model.centroids.fine, target, model.featureWeights),
      .68,
      .32
    );
    const fallbackScores = ENABLE_DISTRIBUTION_CLASSIFIER ? mergeScores(
      fallbackFineScores,
      scoreDistributions(model.distributions?.fine, target, model.featureWeights),
      .76,
      .24
    ) : fallbackFineScores;
    addWeightedScores(fineScores, blendTheoryScores(
      fallbackScores,
      values,
      model,
      [...new Set(allFineExamples.map(item => item.genre).filter(Boolean))]
    ));
  }
  const styleRankedByFamily = Object.fromEntries(Object.keys(STYLE_CLASSIFIERS).map(family => [
    family,
    classifyStyleFamily(target, examples, model, family)
  ]));
  const guardedFineScores = applyFineFalsePositiveGuards(fineScores, values, macroRanked, styleRankedByFamily);
  const calibratedFineScores = applyFineCalibration(guardedFineScores, model.calibration);
  const rerankedFineScores = applyValidationReranker(calibratedFineScores, model);
  const fineRanked = rankScores(rerankedFineScores);
  const styleRanked = styleRankedByFamily[macro] || Object.values(styleRankedByFamily).find(list => list.length) || [];
  const confidence = fineRanked[0]?.score || 0;
  const margin = confidence - (fineRanked[1]?.score || 0);
  return { macroRanked, fineRanked, styleRanked, styleRankedByFamily, confidence, needsReview: confidence < 58 || margin < 8 };
}

function applyFineCalibration(scores, calibration = {}) {
  if (!ENABLE_VALIDATION_CALIBRATION || !calibration?.fineBias) return scores;
  return Object.fromEntries(Object.entries(scores || {}).map(([label, score]) => [
    label,
    (Number(score) || 0) * (Number(calibration.fineBias[label]) || 1)
  ]));
}

function applyMacroCalibration(scores, calibration = {}) {
  if (!ENABLE_VALIDATION_CALIBRATION || !calibration?.macroBias) return scores;
  return Object.fromEntries(Object.entries(scores || {}).map(([label, score]) => [
    label,
    (Number(score) || 0) * (Number(calibration.macroBias[label]) || 1)
  ]));
}

function applyValidationReranker(scores = {}, model = {}) {
  if (!ENABLE_VALIDATION_RERANKER || !model.reranker?.rules?.length) return scores;
  const ranked = rankScores(scores);
  const current = ranked[0];
  if (!current) return scores;
  const out = { ...scores };
  const rules = model.reranker.ruleMap || new Map(model.reranker.rules.map(rule => [`${rule.candidate}|${rule.current}`, rule]));
  model.reranker.ruleMap = rules;
  ranked.slice(1, 4).forEach(candidate => {
    const rule = rules.get(`${candidate.label}|${current.label}`);
    if (!rule) return;
    const gap = Number(current.score || 0) - Number(candidate.score || 0);
    if (gap > Number(rule.maxGap || 28)) return;
    out[candidate.label] = (Number(out[candidate.label]) || 0) * Number(rule.boost || 1);
    out[current.label] = (Number(out[current.label]) || 0) * Number(rule.penalty || 1);
  });
  return out;
}

function buildValidationCalibration(rows, model) {
  const validationRows = rows.filter(row => row.split === "validation" && row.trainingRole !== "macro-only");
  const fineBias = {};
  const macroBias = {};
  const support = {};
  validationRows.forEach(row => {
    const previousCalibration = model.calibration;
    model.calibration = null;
    const predicted = classify(row.values, model);
    model.calibration = previousCalibration;
    const ranked = predicted.fineRanked.map(item => item.label);
    const macroRanked = predicted.macroRanked.map(item => item.label);
    const actualRank = ranked.indexOf(row.genre);
    const actualMacro = canonicalMacro(row.macroGenre);
    const predictedFine = ranked[0];
    const predictedMacro = macroRanked[0];
    const actualMacroRank = macroRanked.indexOf(actualMacro);
    support[row.genre] = (support[row.genre] || 0) + 1;
    if (actualRank === 0) {
      fineBias[row.genre] = (fineBias[row.genre] || 1) * 1.01;
    } else if (actualRank > 0 && actualRank < 5) {
      fineBias[row.genre] = (fineBias[row.genre] || 1) * (1.1 + Math.max(0, 4 - actualRank) * .035);
    } else {
      fineBias[row.genre] = (fineBias[row.genre] || 1) * 1.18;
    }
    if (predictedFine && predictedFine !== row.genre) {
      fineBias[predictedFine] = (fineBias[predictedFine] || 1) * .95;
    }
    if (actualMacroRank === 0) {
      macroBias[actualMacro] = (macroBias[actualMacro] || 1) * 1.01;
    } else if (actualMacroRank > 0 && actualMacroRank < 4) {
      macroBias[actualMacro] = (macroBias[actualMacro] || 1) * (1.12 + Math.max(0, 3 - actualMacroRank) * .04);
    } else {
      macroBias[actualMacro] = (macroBias[actualMacro] || 1) * 1.22;
    }
    if (predictedMacro && predictedMacro !== actualMacro) {
      macroBias[predictedMacro] = (macroBias[predictedMacro] || 1) * .94;
    }
  });
  const normalizedBias = Object.fromEntries(Object.entries(fineBias).map(([genre, value]) => [
    genre,
    Math.round(Math.max(.55, Math.min(1.85, Number(value) || 1)) * 1000) / 1000
  ]));
  const normalizedMacroBias = Object.fromEntries(Object.entries(macroBias).map(([macro, value]) => [
    macro,
    Math.round(Math.max(.58, Math.min(1.75, Number(value) || 1)) * 1000) / 1000
  ]));
  return {
    enabled: ENABLE_VALIDATION_CALIBRATION,
    method: "validation-confusion-aware-fine-and-macro-bias",
    validationRows: validationRows.length,
    support,
    fineBias: normalizedBias,
    macroBias: normalizedMacroBias,
    note: "Uses validation split only; test rows are not used for calibration."
  };
}

function buildValidationReranker(rows, model) {
  const validationRows = rows.filter(row => row.split === "validation" && row.trainingRole !== "macro-only");
  const pairs = new Map();
  const previousReranker = model.reranker;
  model.reranker = null;
  validationRows.forEach(row => {
    const predicted = classify(row.values, model);
    const ranked = predicted.fineRanked.slice(0, 4);
    const current = ranked[0]?.label || "";
    if (!current) return;
    ranked.slice(1).forEach((candidate, index) => {
      const key = `${candidate.label}|${current}`;
      if (!pairs.has(key)) {
        pairs.set(key, {
          candidate: candidate.label,
          current,
          total: 0,
          success: 0,
          harm: 0,
          rankSum: 0,
          gapSum: 0
        });
      }
      const item = pairs.get(key);
      item.total += 1;
      item.rankSum += index + 2;
      item.gapSum += Math.max(0, Number(ranked[0]?.score || 0) - Number(candidate.score || 0));
      if (row.genre === candidate.label) item.success += 1;
      if (row.genre === current) item.harm += 1;
    });
  });
  model.reranker = previousReranker;
  const rules = [...pairs.values()]
    .map(item => {
      const precision = item.success / Math.max(1, item.total);
      const harmRate = item.harm / Math.max(1, item.total);
      const meanGap = item.gapSum / Math.max(1, item.total);
      return {
        ...item,
        precision,
        harmRate,
        meanRank: item.rankSum / Math.max(1, item.total),
        meanGap
      };
    })
    .filter(item =>
      item.success >= VALIDATION_RERANKER_MIN_SUCCESS
      && item.total >= VALIDATION_RERANKER_MIN_TOTAL
      && item.precision >= VALIDATION_RERANKER_MIN_PRECISION
      && item.harmRate <= VALIDATION_RERANKER_MAX_HARM_RATE
    )
    .map(item => ({
      candidate: item.candidate,
      current: item.current,
      total: item.total,
      success: item.success,
      harm: item.harm,
      precision: Math.round(item.precision * 1000) / 1000,
      harmRate: Math.round(item.harmRate * 1000) / 1000,
      meanGap: Math.round(item.meanGap * 10) / 10,
      maxGap: Math.max(16, Math.min(34, Math.round(item.meanGap + 12))),
      boost: Math.round((1.08 + Math.min(.22, item.precision * .18)) * 1000) / 1000,
      penalty: Math.round((.98 - Math.min(.1, Math.max(0, item.harmRate) * .18)) * 1000) / 1000
    }))
    .sort((a, b) => b.success - a.success || b.precision - a.precision || a.candidate.localeCompare(b.candidate, "ja"));
  return {
    enabled: ENABLE_VALIDATION_RERANKER,
    method: "validation-top3-pairwise-reranker",
    validationRows: validationRows.length,
    thresholds: {
      minSuccess: VALIDATION_RERANKER_MIN_SUCCESS,
      minTotal: VALIDATION_RERANKER_MIN_TOTAL,
      minPrecision: VALIDATION_RERANKER_MIN_PRECISION,
      maxHarmRate: VALIDATION_RERANKER_MAX_HARM_RATE
    },
    ruleCount: rules.length,
    rules,
    note: "Uses validation split only; applies small Top3 pairwise boosts when validation showed a candidate should overtake the current Top1."
  };
}

function buildModel(rows) {
  const genreTheory = loadGenreTheory();
  const trainRows = rows.filter(row => row.split === "train");
  const activeTrainRows = trainRows.filter(row => sampleWeightForRow(row) > 0);
  const primaryTrainRows = activeTrainRows.filter(row => row.sourceType !== "fma-metadata");
  const standardizer = buildStandardizer(primaryTrainRows.length >= 30 ? primaryTrainRows : activeTrainRows);
  const examples = activeTrainRows.map(row => ({ ...row, z: standardise(row.values, standardizer) }));
  const centroids = buildCentroids(examples);
  const distributions = buildDistributions(examples);
  const featureWeights = ENABLE_SEPARABILITY_WEIGHTS
    ? buildSeparabilityFeatureWeights(examples, FEATURE_WEIGHTS)
    : FEATURE_WEIGHTS;
  const macroGenres = [...new Set(rows.map(row => canonicalMacro(row.macroGenre)))].sort();
  return {
    version: MODEL_VERSION,
    generatedAt: new Date().toISOString(),
    sourceDataset: "verified-dataset.json",
    featureKeys: VECTOR_KEYS,
    featureWeights,
    macroFeatureMultipliers: MACRO_FEATURE_MULTIPLIERS,
    sourcePolicy: {
      strictCcOnly: STRICT_CC_ONLY,
      formalSourceTypes: [...FORMAL_SOURCE_TYPES],
      fmaMetadataEnabled: ENABLE_FMA_METADATA,
      itunesPreviewEnabled: ENABLE_ITUNES_PREVIEW,
      macroHeuristicsEnabled: ENABLE_MACRO_HEURISTICS,
      validationCalibrationEnabled: ENABLE_VALIDATION_CALIBRATION,
      strictTwoStageEnabled: ENABLE_STRICT_TWO_STAGE,
      softTwoStageEnabled: ENABLE_SOFT_TWO_STAGE,
      balancedKnnEnabled: ENABLE_BALANCED_KNN,
      distributionClassifierEnabled: ENABLE_DISTRIBUTION_CLASSIFIER,
      separabilityWeightsEnabled: ENABLE_SEPARABILITY_WEIGHTS,
      genreTheoryPriorsEnabled: ENABLE_GENRE_THEORY_PRIORS && Boolean(genreTheory.enabled),
      theoryGenreFeaturesEnabled: ENABLE_THEORY_GENRE_FEATURES,
      validationRerankerEnabled: ENABLE_VALIDATION_RERANKER,
      evaluationSplits: [...EVALUATION_SPLITS],
      genreTheoryWeight: GENRE_THEORY_WEIGHT,
      genreTheoryMacroWeight: GENRE_THEORY_MACRO_WEIGHT,
      fmaAudioWeight: FMA_AUDIO_WEIGHT,
      extendedGenreFeaturesEnabled: ENABLE_EXTENDED_GENRE_FEATURES,
      advancedGenreFeaturesEnabled: ENABLE_ADVANCED_GENRE_FEATURES,
      styleFineBoostTop: STYLE_FINE_BOOST_TOP,
      styleFineBoostSecond: STYLE_FINE_BOOST_SECOND,
      styleFineBoostThird: STYLE_FINE_BOOST_THIRD,
      styleClassifierEnabled: true,
      styleClassifierFamilies: Object.fromEntries(Object.entries(STYLE_CLASSIFIERS).map(([family, config]) => [
        family,
        {
          other: config.other,
          weightMultipliers: config.weightMultipliers || {},
          targets: Object.fromEntries(Object.entries(config.targets || {}).map(([style, target]) => [style, {
            label: target.label,
            source: target.source,
            genre: target.genre || "",
            boostFineGenre: target.boostFineGenre || ""
          }]))
        }
      ])),
      popStyleClassifierEnabled: true,
      popStyleClassifierLabels: [CITY_POP_STYLE_HINT, STYLE_CLASSIFIERS.pop.other],
      note: "FMA metadata and iTunes previews are comparison-only unless explicitly enabled. Formal evaluation uses CC/local audio only."
    },
    standardizer,
    knnK: 11,
    expectedMacroGenres: EXPECTED_MACRO_GENRES,
    macroGenres,
    missingMacroGenres: EXPECTED_MACRO_GENRES.filter(macro => !macroGenres.includes(macro)),
    fineGenres: [...new Set(rows.filter(row => row.trainingRole !== "macro-only").map(row => row.genre))].sort(),
    fineExcludedGenres: [...FINE_EXCLUDED],
    centroids,
    distributions,
    genreTheory: genreTheory.enabled ? {
      version: genreTheory.version || "unknown",
      enabled: true,
      weight: GENRE_THEORY_WEIGHT,
      macroWeight: GENRE_THEORY_MACRO_WEIGHT,
      sources: genreTheory.sources || [],
      profiles: genreTheory.profiles || {}
    } : {
      enabled: false,
      weight: 0,
      profiles: {}
    },
    examples: activeTrainRows.map(row => ({
      genre: row.genre,
        macroGenre: canonicalMacro(row.macroGenre),
        styleHint: row.styleHint,
        styleConfidence: row.styleConfidence,
        trainingRole: row.trainingRole,
        split: row.split,
        sourceType: row.sourceType,
        sourceUrl: row.sourceUrl,
        referenceUrl: row.referenceUrl,
        youtubeUrl: row.youtubeUrl,
        previewUrl: row.previewUrl,
        filePath: row.filePath,
        license: row.license,
        licenseUrl: row.licenseUrl,
        datasetName: row.datasetName,
        trackId: row.trackId,
        canonicalArtist: row.canonicalArtist,
        canonicalTitle: row.canonicalTitle,
        values: row.values
    }))
  };
}

function evaluate(rows, model) {
  const results = rows
    .filter(row => EVALUATION_SPLITS.has(row.split))
    .map(row => {
      const predicted = classify(row.values, model);
      const topFine = predicted.fineRanked.map(item => item.label);
      const topMacro = predicted.macroRanked.map(item => item.label);
      const rowStyleFamily = styleFamilyForRow(row);
      const rowStyleTarget = styleTargetForRow(row);
      const rowStyleRanked = rowStyleFamily ? predicted.styleRankedByFamily?.[rowStyleFamily] || [] : [];
      const topStyle = rowStyleRanked.map(item => item.label);
      const fineEvaluable = row.trainingRole !== "macro-only";
      const styleEvaluable = Boolean(rowStyleTarget);
      return {
        genre: row.genre,
        macroGenre: canonicalMacro(row.macroGenre),
        styleHint: row.styleHint || "",
        styleFamily: rowStyleFamily,
        styleTarget: rowStyleTarget,
        trainingRole: row.trainingRole,
        split: row.split,
        sourceType: row.sourceType,
        sourceUrl: row.sourceUrl,
        referenceUrl: row.referenceUrl,
        youtubeUrl: row.youtubeUrl,
        previewUrl: row.previewUrl,
        predicted: topFine[0] || "",
        predictedMacro: topMacro[0] || "",
        predictedStyle: topStyle[0] || "",
        predictedStyleName: styleDisplayName(topStyle[0] || ""),
        exact: fineEvaluable ? topFine[0] === row.genre : null,
        top3: fineEvaluable ? topFine.slice(0, 3).includes(row.genre) : null,
        styleExact: styleEvaluable ? topStyle[0] === rowStyleTarget : null,
        styleTop3: styleEvaluable ? topStyle.slice(0, 3).includes(rowStyleTarget) : null,
        macroExact: topMacro[0] === canonicalMacro(row.macroGenre),
        needsReview: predicted.needsReview,
        confidence: predicted.confidence,
        top: predicted.fineRanked.slice(0, 5).map(item => ({ name: item.label, score: Math.round(item.score) })),
        macro: predicted.macroRanked.slice(0, 4).map(item => ({ macro: item.label, score: Math.round(item.score) })),
        style: rowStyleRanked.slice(0, 4).map(item => ({ style: item.label, name: item.displayName, family: item.family, score: Math.round(item.score) }))
      };
    });
  const topConfusions = (list, actualKey, predictedKey, exactKey) => Object.values(list.reduce((acc, row) => {
    const actual = row[actualKey];
    const predicted = row[predictedKey];
    if (!actual || !predicted || row[exactKey]) return acc;
    const key = `${actual} -> ${predicted}`;
    if (!acc[key]) acc[key] = { actual, predicted, count: 0, examples: [] };
    acc[key].count += 1;
    if (acc[key].examples.length < 5) {
      acc[key].examples.push({
        genre: row.genre,
        sourceType: row.sourceType,
        referenceUrl: row.referenceUrl || row.sourceUrl,
        confidence: row.confidence,
        top: row.top,
        macro: row.macro
      });
    }
    return acc;
  }, {})).sort((a, b) => b.count - a.count || a.actual.localeCompare(b.actual, "ja")).slice(0, 30);
  const confusionMatrix = (list, actualKey, predictedKey) => {
    const labels = [...new Set(list.flatMap(row => [row[actualKey], row[predictedKey]]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
    const rows = labels.map(actual => {
      const actualRows = list.filter(row => row[actualKey] === actual);
      const predictions = Object.fromEntries(labels.map(label => [label, 0]));
      actualRows.forEach(row => {
        if (row[predictedKey]) predictions[row[predictedKey]] = (predictions[row[predictedKey]] || 0) + 1;
      });
      return {
        actual,
        total: actualRows.length,
        correct: actualRows.filter(row => row[actualKey] === row[predictedKey]).length,
        predictions
      };
    }).filter(row => row.total > 0);
    return { labels, rows };
  };
  const summarize = (list, label) => {
    const fine = list.filter(row => row.exact !== null);
    const macro = list.filter(row => row.macroExact !== null);
    const style = list.filter(row => row.styleExact !== null);
    const dubPredictions = list.filter(row => row.predicted === "ダブ").length;
    return {
      evaluationMode: label,
      total: list.length,
      fineTotal: fine.length,
      styleTotal: style.length,
      macroTop1Accuracy: macro.length ? Math.round(macro.filter(row => row.macroExact).length / macro.length * 1000) / 10 : null,
      fineTop1Accuracy: fine.length ? Math.round(fine.filter(row => row.exact).length / fine.length * 1000) / 10 : null,
      fineTop3Accuracy: fine.length ? Math.round(fine.filter(row => row.top3).length / fine.length * 1000) / 10 : null,
      styleTop1Accuracy: style.length ? Math.round(style.filter(row => row.styleExact).length / style.length * 1000) / 10 : null,
      styleTop3Accuracy: style.length ? Math.round(style.filter(row => row.styleTop3).length / style.length * 1000) / 10 : null,
      needsReviewRate: list.length ? Math.round(list.filter(row => row.needsReview).length / list.length * 1000) / 10 : null,
      dubPredictionRate: list.length ? Math.round(dubPredictions / list.length * 1000) / 10 : null
    };
  };
  const referenceSummary = summarize(results, "reference-all-enabled-sources");
  const sourceSummaries = Object.fromEntries([...new Set(results.map(row => row.sourceType).filter(Boolean))]
    .sort()
    .map(sourceType => [sourceType, summarize(results.filter(row => row.sourceType === sourceType), `source:${sourceType}`)]));
  const formalResults = results.filter(isFormalSource);
  const formalByGenreCounts = formalResults.reduce((acc, row) => {
    acc[row.genre] = (acc[row.genre] || 0) + 1;
    return acc;
  }, {});
  const stableFormalGenres = new Set(Object.entries(formalByGenreCounts).filter(([, count]) => count >= MIN_FORMAL_TEST_PER_GENRE).map(([genre]) => genre));
  const stableFormalResults = formalResults.filter(row => stableFormalGenres.has(row.genre));
  const formalSummary = {
    ...summarize(stableFormalResults, "formal-cc-audio-stable-genres"),
    sourceTypes: [...FORMAL_SOURCE_TYPES],
    minTestPerGenre: MIN_FORMAL_TEST_PER_GENRE,
    stableGenreCount: stableFormalGenres.size,
    status: stableFormalGenres.size ? "available" : "insufficient-formal-cc-test-data",
    note: stableFormalGenres.size
      ? "Formal score uses only CC/local audio genres with enough test rows."
      : "Add Creative Commons/public research local audio via cc-source-manifest.json before treating scores as formal."
  };
  const sourceCounts = rows.reduce((acc, row) => {
    acc[row.sourceType] = (acc[row.sourceType] || 0) + 1;
    return acc;
  }, {});
  const genreCounts = rows.reduce((acc, row) => {
    if (row.trainingRole !== "macro-only") acc[row.genre] = (acc[row.genre] || 0) + 1;
    return acc;
  }, {});
  const targetGaps = Object.entries(genreCounts)
    .map(([genre, count]) => {
      const target = PRIORITY_GENRE_TARGETS[genre] || DEFAULT_GENRE_TARGET;
      return { genre, count, target, missing: Math.max(0, target - count), priority: Boolean(PRIORITY_GENRE_TARGETS[genre]) };
    })
    .filter(row => row.missing > 0)
    .sort((a, b) => Number(b.priority) - Number(a.priority) || b.missing - a.missing || a.genre.localeCompare(b.genre));
  const byGenre = [...new Set(results.map(row => row.genre))].sort().map(genre => {
    const list = results.filter(row => row.genre === genre);
    const fineRows = list.filter(row => row.exact !== null);
    const macroRows = list.filter(row => row.macroExact !== null);
    return {
      genre,
      macroGenre: canonicalMacro(list[0]?.macroGenre || ""),
      total: list.length,
      fineTotal: fineRows.length,
      macroTop1Accuracy: macroRows.length ? Math.round(macroRows.filter(row => row.macroExact).length / macroRows.length * 1000) / 10 : 0,
      fineTop1Accuracy: fineRows.length ? Math.round(fineRows.filter(row => row.exact).length / fineRows.length * 1000) / 10 : null,
      fineTop3Accuracy: fineRows.length ? Math.round(fineRows.filter(row => row.top3).length / fineRows.length * 1000) / 10 : null,
      needsReviewRate: list.length ? Math.round(list.filter(row => row.needsReview).length / list.length * 1000) / 10 : 0,
      mostCommonPredictions: Object.entries(list.reduce((acc, row) => {
        const key = row.predicted || row.predictedMacro || "unknown";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, count]) => ({ label, count }))
    };
  });
  const byStyle = [...new Set(results.map(row => row.styleTarget).filter(Boolean))].sort().map(styleHint => {
    const list = results.filter(row => row.styleTarget === styleHint);
    return {
      styleHint,
      displayName: styleDisplayName(styleHint),
      family: list[0]?.styleFamily || "",
      total: list.length,
      styleTop1Accuracy: list.length ? Math.round(list.filter(row => row.styleExact).length / list.length * 1000) / 10 : null,
      styleTop3Accuracy: list.length ? Math.round(list.filter(row => row.styleTop3).length / list.length * 1000) / 10 : null,
      mostCommonPredictions: Object.entries(list.reduce((acc, row) => {
        const key = row.predictedStyleName || row.predictedStyle || "unknown";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, count]) => ({ label, count }))
    };
  });
  const weakGenres = byGenre
    .filter(row => row.fineTotal && (row.fineTop1Accuracy < 55 || row.fineTop3Accuracy < 70))
    .sort((a, b) => (a.fineTop1Accuracy ?? 0) - (b.fineTop1Accuracy ?? 0) || (a.fineTop3Accuracy ?? 0) - (b.fineTop3Accuracy ?? 0));
  return {
    summary: {
      generatedAt: new Date().toISOString(),
      sourceDataset: "verified-dataset.json",
      endpoint: DEFAULT_ENDPOINT,
      evaluationSplit: [...EVALUATION_SPLITS].join(","),
      ...referenceSummary,
      formalSummary,
      sourceCounts,
      itunesPreviewEnabled: ENABLE_ITUNES_PREVIEW,
      strictCcOnly: STRICT_CC_ONLY,
      minFormalTestPerGenre: MIN_FORMAL_TEST_PER_GENRE,
      targetGaps: targetGaps.slice(0, 20),
      missingMacroGenres: model.missingMacroGenres || []
    },
    diagnostics: {
      sourceSummaries,
      topFineConfusions: topConfusions(results.filter(row => row.exact !== null), "genre", "predicted", "exact"),
      topMacroConfusions: topConfusions(results, "macroGenre", "predictedMacro", "macroExact"),
      fineConfusionMatrix: confusionMatrix(results.filter(row => row.exact !== null), "genre", "predicted"),
      macroConfusionMatrix: confusionMatrix(results, "macroGenre", "predictedMacro")
    },
    byGenre,
    byStyle,
    weakGenres,
    results
  };
}

async function main() {
  const loaded = loadDataset();
  const dataset = loaded.items.filter(isTrainingSourceEnabled);
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
    if (!QUIET) process.stdout.write(`[${item.index + 1}/${dataset.length}] ${item.genre} ... `);
    try {
      const sourceKey = sourceKeyForItem(item);
      if (RETRY_ERRORS_ONLY && !retryUrls.has(sourceKey) && !cache.items[sourceKey]?.features) {
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
      if (!QUIET) console.log(cache.items[item.youtubeUrl]?.analyzedAt ? "ok" : "cached");
    } catch (error) {
      analyzedRows.push({ ...item, error: error.message });
      if (!QUIET) console.log(`error: ${error.message}`);
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
  const rows = validRows.map(row => ({ ...row, split: splitAssignments[sourceKeyForItem(row)] || "train" }));
  const model = buildModel(rows);
  model.calibration = buildValidationCalibration(rows, model);
  model.reranker = buildValidationReranker(rows, model);
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
      styleHint: row.styleHint,
      styleFamily: styleFamilyForRow(row),
      styleTarget: styleTargetForRow(row),
      styleConfidence: row.styleConfidence,
      trainingRole: row.trainingRole,
      sourceType: row.sourceType,
      sourceUrl: row.sourceUrl,
      referenceUrl: row.referenceUrl,
        youtubeUrl: row.youtubeUrl,
        previewUrl: row.previewUrl,
        filePath: row.filePath,
        license: row.license,
        licenseUrl: row.licenseUrl,
        datasetName: row.datasetName,
        trackId: row.trackId,
        canonicalArtist: row.canonicalArtist,
        canonicalTitle: row.canonicalTitle,
        split: row.split
    }))
  };

  fs.writeFileSync(SPLITS_PATH, JSON.stringify(splitPayload, null, 2));
  fs.writeFileSync(MODEL_PATH, JSON.stringify(model, null, 2));
  fs.mkdirSync(path.dirname(DEMO_MODEL_PATH), { recursive: true });
  fs.writeFileSync(DEMO_MODEL_PATH, JSON.stringify(model, null, 2));
  fs.writeFileSync(RESULTS_PATH, JSON.stringify({
    summary: evaluation.summary,
    diagnostics: evaluation.diagnostics,
    byGenre: evaluation.byGenre,
    byStyle: evaluation.byStyle,
    weakGenres: evaluation.weakGenres,
    results: evaluation.results,
    errors: analyzedRows.filter(row => row.error)
  }, null, 2));

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

export const __testHooks = {
  loadAppGenreApi,
  compactAudioFeatures,
  classify,
  vectorValues
};

if (process.env.MMFR_GENRE_TRAIN_SKIP_MAIN !== "1") {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
