import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(SCRIPT_DIR, "..");
const HTML_PATH = path.join(DEMO_DIR, "MUSIC MEMORY FITTING ROOM.html");
const SAKURA_PROXY_PATH = path.resolve(DEMO_DIR, "../../deploy/aun-graphic-sound-form/api/audio-analyze.php");
const PUBLIC_SUPERVISOR_PATH = path.resolve(DEMO_DIR, "../../deploy/aun-graphic-sound-form/public-audio-supervisor.mjs");
const HUGGINGFACE_DOCKERFILE_PATH = path.resolve(DEMO_DIR, "../../deploy/huggingface-audio-api/Dockerfile");
const AUDIO_SERVER_PATH = path.join(SCRIPT_DIR, "audio-analysis-server.mjs");
const DELAUNAY_VENDOR_PATH = path.join(DEMO_DIR, "vendor", "d3-delaunay.min.js");
const JAPANESE_FONT_FILES = [
  "NotoSansJP-Regular.woff2",
  "NotoSansJP-Medium.woff2",
  "NotoSansJP-Bold.woff2"
];
const knownAerosolArchetypes = new Set([
  "bass-horizon",
  "blade-plume",
  "chamber-constellation",
  "crescent",
  "curtain-fall",
  "dense-core-trail",
  "diagonal-wash",
  "double-lobe",
  "fan-spray",
  "lattice-mist",
  "pixel-swarm",
  "ring-rupture",
  "scattered-islands",
  "split-cloud",
  "theatre-arch",
  "vertical-plume"
]);

export function loadPatternApi() {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const appScript = scripts.at(-1).replace(
    /cleanupStoredSessions\(\);\s*restoreLatestAcceptedSession\(\);\s*render\(\);\s*loadCalibratedGenreProfiles\(\);\s*$/,
    "globalThis.__patternApi={state,apiEndpointCandidates,genrePatternProfiles,musicGenreProfiles,terraGenreEngines,terraMotionProfiles,terraMotionProfileForEngine,terraMotionProfileForShirt,centralMotionPrograms,centralMotionProgramForProfile,genreMotionGesture,centralMotionAccent,centralMotionElementTransform,centralMotionPointOffset,terraLogoMeaningProfiles,terraLogoMarkProfile,resolveGenrePattern,resolveGenreBlend,resolveGenreVisualProfile,resolveTerraGenreEngine,resolveTerraDesignCouncil,generateSoundClothReversibleSvg,pcmProtectedDataGroupFromBytes,decodeProtectedPcmDataFromSvg,modelSol56MlpScores,blendModelSol56Mlp,patternMotionFrameForShirt,patternMotionTransformForPart,patternMotionTransformForElement,vectorPrimitivePathData,deformVisiblePathData,sampledEqualizerSignal,reconstructionMotionDetailFromSamples,bakePatternMotionFrame,sparseGenreEvidence,applySparseGenreEvidence,sparseGenreEvidenceText,normaliseFeatures,genreFeatureVector,genreRuleScore,funkBlackMacroPulseEvidence,macroGenreScore,inferMusicGenresWithRules,inferMusicGenresWithModel,highTempoRockFalsePositiveEvidence,highTempoRapBreakbeatEvidence,applyHighTempoRapBreakbeatCorrection,applyHighTempoRockCorrection,weakMidTempoHarmonicRockEvidence,applyWeakMidTempoHarmonicRockCorrection,electronicBreakdownFalsePositiveEvidence,applyElectronicBreakdownCorrection,operaticVocalEvidence,applyOperaticVocalCorrection,japaneseVocalGenreEvidence,applyJapaneseVocalGenreCorrection,promoteAudioGenreCandidate,applyReggaeDubBoundaryCorrection,modalChamberJazzEvidence,darkOrchestralClassicalEvidence,instrumentalElectronicEvidence,chiptuneTextureEvidence,midDominantRockBalladEvidence,bassLedAlternativeDanceRockEvidence,underrepresentedBoundaryTarget,applyCrossClassifierBoundaryCorrections,applyRawElectronicHipHouseCorrection,applyUnknownSourceGeneralizationCorrections,applyVocalDependentGenreCorrection,applyUnknownSourceConsensus,halfTempoHouseConsensusEvidence,sameMacroRapMajorityEvidence,applyLocalSegmentConsensus,calibratedGenreAnalysis,genreVisualWeight,genreDisplayText,inferMusicGenres,refreshReversibleSoundClothShirt};"
  );
  const context = {
    console,
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
  vm.runInContext(fs.readFileSync(DELAUNAY_VENDOR_PATH, "utf8"), context);
  vm.runInContext(appScript, context);
  return context.__patternApi;
}

test("self-hosts a deterministic Japanese fallback after Yu Gothic", () => {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  assert.match(html, /font-family: "Sound Form Japanese Fallback"/);
  assert.match(html, /"Yu Gothic"[\s\S]*"Sound Form Japanese Fallback"/);
  JAPANESE_FONT_FILES.forEach(file => {
    const fontPath = path.join(DEMO_DIR, "fonts", file);
    assert.ok(fs.statSync(fontPath).size > 500_000, `${file} is missing or incomplete`);
  });
});

test("browser normalization preserves server genre evidence", () => {
  const { normaliseFeatures } = loadPatternApi();
  const normalized = normaliseFeatures({
    id: "DXu4IvMESVY",
    tempo: 161,
    energy: .7523,
    bass: .8167,
    lowBandRatio: .6385,
    midBandRatio: .2435,
    highBandRatio: .1181,
    analysisWindowSeconds: 24,
    embeddingGenrePrediction: { ok: false, error: "fallback" },
    japaneseVocalEvidence: { available: false },
    youtubeMeta: { title: "test" }
  }, "https://youtu.be/DXu4IvMESVY?t=60");
  assert.equal(normalized.lowBandRatio, .6385);
  assert.equal(normalized.midBandRatio, .2435);
  assert.equal(normalized.highBandRatio, .1181);
  assert.equal(normalized.analysisWindowSeconds, 24);
  assert.equal(normalized.embeddingGenrePrediction.error, "fallback");
  assert.equal(normalized.japaneseVocalEvidence.available, false);
  assert.equal(normalized.youtubeMeta.title, "test");
});

test("public deployment reads a guarded API setting instead of visitor localhost", () => {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  assert.match(html, /const localHost = \/\^\(\?:localhost\|127/);
  assert.match(html, /const publicHost = \/\^\(\?:www\\\.\)\?aun-graphic\\\.jp\$\/i/);
  assert.match(html, /meta name="sound-form-api-endpoint" content="\/sound-form\/api\/audio-analyze\.php"/);
  assert.ok(html.includes('|| /\\.php$/.test(value)'));
  assert.match(html, /const configuredPublicEndpoint = environment\.configuredEndpoint/);
  assert.match(html, /document\.querySelector\?\.\('meta\[name="sound-form-api-endpoint"\]'/);
  assert.match(html, /defaults\.push\(configuredPublicEndpoint, "\/sound-form\/api\/audio-analyze\.php"\)/);
  assert.doesNotMatch(html, /aungraphic-musictee-audio-api\.hf\.space/);
  assert.doesNotMatch(html, /const defaultEndpoint = localHost \? "http:\/\/127\.0\.0\.1:4194\/api\/audio-analyze" : ""/);
});

test("public proxy prefers Sakura-local analysis and retains the Mac tunnel fallback", () => {
  const proxy = fs.readFileSync(SAKURA_PROXY_PATH, "utf8");
  assert.match(proxy, /LOCAL_UPSTREAM = 'http:\/\/127\.0\.0\.1:4196\/api\/audio-analyze'/);
  assert.match(proxy, /\$endpoints = \[LOCAL_UPSTREAM\]/);
  assert.match(proxy, /trycloudflare\\\.com\/api\/audio-analyze/);
  assert.match(proxy, /CURLOPT_PROTOCOLS => \$isLocal \? CURLPROTO_HTTP : CURLPROTO_HTTPS/);
  assert.match(proxy, /\$isLocal && \(\$status === 429 \|\| \$status >= 500\)/);
  assert.match(proxy, /proc_open\(/);
  assert.match(proxy, /'--max-old-space-size=128'/);
  assert.match(proxy, /'MMFR_EMBEDDING_GENRE_ENABLED' => '0'/);
  assert.match(proxy, /'MMFR_LOCAL_GENRE_MODEL_PATH' => LOCAL_MODEL/);
  assert.match(proxy, /\.config\/musictee\/youtube-cookies\.txt/);
  assert.match(proxy, /flock\(\$lock, LOCK_EX\)/);
  assert.match(proxy, /stopLocalWorker\(\$localWorker\)/);
  assert.match(proxy, /releaseLocalLock\(\$localLock\)/);
});

test("all public analysis runtimes use three 30-second genre sections", () => {
  const proxy = fs.readFileSync(SAKURA_PROXY_PATH, "utf8");
  const supervisor = fs.readFileSync(PUBLIC_SUPERVISOR_PATH, "utf8");
  const dockerfile = fs.readFileSync(HUGGINGFACE_DOCKERFILE_PATH, "utf8");
  const html = fs.readFileSync(HTML_PATH, "utf8");
  assert.match(proxy, /'MMFR_ANALYSIS_SECONDS' => '90'/);
  assert.match(supervisor, /MMFR_ANALYSIS_SECONDS: "90"/);
  assert.match(dockerfile, /MMFR_ANALYSIS_SECONDS=90/);
  assert.match(html, /通常 60〜150秒/);
  assert.doesNotMatch(`${proxy}\n${supervisor}\n${dockerfile}`, /MMFR_ANALYSIS_SECONDS(?:' => |: |\=)["']?45/);
});

test("YouTube range acquisition does not require an optional audio encoder", () => {
  const server = fs.readFileSync(AUDIO_SERVER_PATH, "utf8");
  assert.match(server, /"--download-sections", `\*\$\{startSeconds\}-\$\{sectionEnd\}`/);
  assert.doesNotMatch(server, /--force-keyframes-at-cuts/);
  assert.match(server, /analysisWindowSeconds: ANALYSIS_WINDOW_SECONDS/);
});

test("exhibition endpoint policy ignores stale saved URLs on managed hosts", () => {
  const { apiEndpointCandidates } = loadPatternApi();
  assert.deepEqual(Array.from(apiEndpointCandidates({
    hostname: "aun-graphic.jp", protocol: "https:", pathname: "/sound-form/",
    configuredEndpoint: "", savedEndpoint: "https://expired.trycloudflare.com/api/audio-analyze"
  })), ["/sound-form/api/audio-analyze.php", "https://expired.trycloudflare.com/api/audio-analyze"]);
  assert.deepEqual(Array.from(apiEndpointCandidates({
    hostname: "127.0.0.1", protocol: "http:", pathname: "/MUSIC%20MEMORY%20FITTING%20ROOM.html",
    configuredEndpoint: "", savedEndpoint: "https://expired.example/api/audio-analyze"
  })), ["http://127.0.0.1:4194/api/audio-analyze", "https://expired.example/api/audio-analyze"]);
});

test("browser normalization preserves a separate high-resolution rhythm timeline", () => {
  const { normaliseFeatures, genreFeatureVector } = loadPatternApi();
  const rhythmOnset = Array.from({ length: 512 }, (_, index) => index % 24 === 0 ? 1 : index % 12 === 0 ? .55 : .04);
  const normalized = normaliseFeatures({
    tempo: 120,
    energy: .72,
    bass: .58,
    onset: .48,
    rhythm: .68,
    detail: {
      onset: Array.from({ length: 64 }, (_, index) => index % 8 === 0 ? .7 : .08),
      rms: Array.from({ length: 64 }, () => .6),
      bass: Array.from({ length: 64 }, () => .55),
      zeroCrossing: Array.from({ length: 64 }, () => .12),
      rhythmOnset,
      rhythmRms: Array.from({ length: 512 }, () => .6),
      rhythmZeroCrossing: Array.from({ length: 512 }, (_, index) => index % 12 === 0 ? .3 : .1)
    }
  }, "upload-test.wav");
  assert.equal(normalized.detail.onset.length, 64);
  assert.equal(normalized.detail.rhythmOnset.length, 384);
  assert.ok(genreFeatureVector(normalized).onsetDensity > 0);
});

test("live DnB subdivision uses the detailed rhythm window and rejects irregular live hip-hop pulses", () => {
  const { genreFeatureVector } = loadPatternApi();
  const detailFor = rhythmOnset => ({
    pcmSketchDuration: 24,
    onset: Array.from({ length: 64 }, (_, index) => rhythmOnset[index * 6] || .01),
    rms: Array.from({ length: 64 }, () => .62),
    bass: Array.from({ length: 64 }, () => .58),
    zeroCrossing: Array.from({ length: 64 }, () => .1),
    rhythmOnset,
    rhythmRms: Array.from({ length: 384 }, () => .62),
    rhythmZeroCrossing: Array.from({ length: 384 }, () => .1)
  });
  const liquidPulse = Array.from({ length: 384 }, (_, index) => index % 20 === 0 ? .3 : index % 4 === 0 ? .1 : .01);
  const hiphopPulse = Array.from({ length: 384 }, (_, index) => index % 17 === 0 ? .3 : index % 11 === 0 ? .1 : .01);
  const base = { tempo: 96, analysisWindowSeconds: 120, energy: .9, bass: .75, rhythm: .68, onset: .48 };
  const liquidScore = genreFeatureVector({ ...base, detail: detailFor(liquidPulse) }).liveDnbSubdivisionScore;
  const hiphopScore = genreFeatureVector({ ...base, detail: detailFor(hiphopPulse) }).liveDnbSubdivisionScore;
  assert.ok(liquidScore >= .55);
  assert.ok(hiphopScore < .55);
  assert.ok(liquidScore > hiphopScore + .25);
});

test("genre pattern profiles cover all calibrated genre names", () => {
  const { genrePatternProfiles, musicGenreProfiles, terraGenreEngines, terraLogoMeaningProfiles, terraLogoMarkProfile, resolveGenrePattern, resolveGenreVisualProfile, resolveTerraGenreEngine } = loadPatternApi();
  const genreNames = Object.keys(musicGenreProfiles);
  const patternNames = Object.keys(genrePatternProfiles);
  const knownFamilies = new Set([
    "cloth-field",
    "pressure-map",
    "topographic-pressure",
    "memory-orbit",
    "spiral-core",
    "wave-strata",
    "spectral-barcode",
    "impact-fracture",
    "radial-score",
    "constellation-map",
    "signal-flag",
    "carrier-storm"
  ]);
  const knownSilhouettes = new Set(["block", "ring", "burst", "strata", "flag", "constellation", "spiral", "terrain"]);
  const knownTextureRegions = new Set(["full", "core", "diagonal", "bands", "orbit", "fracture", "border", "islands"]);
  const knownCollisionStyles = new Set(["quiet", "grid", "burst", "orbit", "strata", "dense-impact"]);
  const knownPatternFamilies = new Set(["air-score-space", "signal-grid-machine", "bass-rhythm-resonance", "impact-poster-gesture"]);
  const knownSourceLineages = new Set(["graphic-score", "spectrogram", "cymatics", "japanese-poster", "pattern-language"]);
  const knownProtectedTextureShapes = new Set([
    "field",
    "crescent",
    "vertical-pillars",
    "island-burns",
    "circuit-gates",
    "square-frame",
    "stair-canopy",
    "bass-bowl",
    "comet-hook",
    "broken-rails",
    "wobble-pillars",
    "pixel-mask",
    "tag-slab",
    "triangle-fan",
    "hat-ladder",
    "ribbons",
    "echo-columns",
    "blue-drop",
    "string-fan",
    "fretboard",
    "scratch-burst",
    "scratch-constellation",
    "chevron-stack",
    "blade-gate",
    "cymbal-dots",
    "voice-pools",
    "mirror-orbit",
    "window-blocks",
    "pop-ribbon",
    "spark-ring",
    "staff-rest",
    "stage-arch",
    "thread-columns",
    "petal-ring",
    "compass-diamond"
  ]);

  assert.ok(patternNames.length >= 32);
  assert.deepEqual(patternNames.sort(), genreNames.sort());
  assert.equal(new Set(patternNames.map(name => genrePatternProfiles[name].id)).size, patternNames.length);
  assert.equal(new Set(patternNames.map(name => genrePatternProfiles[name].protectedTextureShape)).size, patternNames.length);
  assert.deepEqual(Array.from(Object.keys(terraGenreEngines)).sort(), genreNames.sort());
  assert.equal(new Set(Object.values(terraGenreEngines).map(engine => engine.id)).size, genreNames.length);
  assert.equal(new Set(Object.values(terraGenreEngines).map(engine => engine.primitiveSet)).size, genreNames.length);
  assert.equal(new Set(Object.values(terraGenreEngines).map(engine => engine.compositionAlgorithm)).size, genreNames.length);
  assert.equal(new Set(Object.values(terraGenreEngines).map(engine => engine.grainAlgorithm)).size, genreNames.length);
  assert.equal(Object.keys(terraLogoMeaningProfiles).length, genreNames.length);

  for (const name of genreNames) {
    const profile = genrePatternProfiles[name];
    assert.match(profile.id, /^genre-[a-z0-9-]+$/);
    assert.equal(profile.label, name);
    assert.ok(knownFamilies.has(profile.baseFamily), `${name} baseFamily`);
    assert.ok(knownFamilies.has(profile.textureMode), `${name} textureMode`);
    assert.ok(knownSilhouettes.has(profile.silhouette), `${name} silhouette`);
    assert.ok(knownTextureRegions.has(profile.textureRegion), `${name} textureRegion`);
    assert.ok(knownCollisionStyles.has(profile.collisionStyle), `${name} collisionStyle`);
    assert.equal(typeof profile.primaryScale, "number", `${name} primaryScale`);
    assert.equal(typeof profile.variantScale, "number", `${name} variantScale`);
    assert.equal(typeof profile.variantOpacity, "number", `${name} variantOpacity`);
    assert.equal(typeof profile.lineCharacter, "string", `${name} lineCharacter`);
    assert.ok(profile.lineCharacter.length >= 4, `${name} lineCharacter text`);
    assert.match(profile.nameMotif, /^[a-z0-9-]+$/, `${name} nameMotif`);
    assert.ok(knownPatternFamilies.has(profile.patternFamily), `${name} patternFamily`);
    assert.equal(typeof profile.sourceLineage, "string", `${name} sourceLineage`);
    profile.sourceLineage.split(",").forEach(lineage => assert.ok(knownSourceLineages.has(lineage), `${name} sourceLineage ${lineage}`));
    assert.equal(typeof profile.visualThesis, "string", `${name} visualThesis`);
    assert.ok(profile.visualThesis.length >= 20, `${name} visualThesis text`);
    assert.equal(typeof profile.compositionRule, "string", `${name} compositionRule`);
    assert.ok(profile.compositionRule.includes("Protected PCM"), `${name} compositionRule mentions Protected PCM`);
    assert.ok(knownProtectedTextureShapes.has(profile.protectedTextureShape), `${name} protectedTextureShape`);
    assert.ok(Array.isArray(profile.requiredMotifs) && profile.requiredMotifs.length >= 3, `${name} requiredMotifs`);
    assert.ok(Array.isArray(profile.forbiddenForms) && profile.forbiddenForms.length >= 3, `${name} forbiddenForms`);
    profile.requiredMotifs.forEach(motif => assert.match(motif, /^[a-z0-9-]+$/, `${name} required motif ${motif}`));
    profile.forbiddenForms.forEach(form => assert.match(form, /^[a-z0-9-]+$/, `${name} forbidden form ${form}`));
    assert.ok(Array.isArray(profile.variantFamilies) && profile.variantFamilies.length >= 3, `${name} variantFamilies`);
    profile.variantFamilies.forEach(family => assert.ok(knownFamilies.has(family), `${name} variant ${family}`));

    const resolved = resolveGenrePattern({ genreAnalysis: { top: [{ name, score: 99 }] } }, 12345, 2);
    assert.equal(resolved.id, profile.id);
    assert.equal(resolved.genreName, name);
    const visual = resolveGenreVisualProfile(resolved, { genreAnalysis: { top: [{ name, score: 99 }] } }, 12345);
    assert.ok(knownSilhouettes.has(visual.silhouette), `${name} resolved silhouette`);
    assert.ok(knownTextureRegions.has(visual.textureRegion), `${name} resolved textureRegion`);
    assert.ok(knownCollisionStyles.has(visual.collisionStyle), `${name} resolved collisionStyle`);
    assert.equal(visual.lineCharacter, profile.lineCharacter);
    assert.equal(visual.nameMotif, profile.nameMotif);
    assert.equal(visual.patternFamily, profile.patternFamily);
    assert.equal(visual.sourceLineage, profile.sourceLineage);
    assert.equal(visual.protectedTextureShape, profile.protectedTextureShape);
    assert.deepEqual(visual.requiredMotifs, profile.requiredMotifs);
    assert.deepEqual(visual.forbiddenForms, profile.forbiddenForms);
    const engine = resolveTerraGenreEngine(resolved, visual);
    assert.match(engine.id, /^terra-[a-z0-9-]+-v\d+$/, `${name} engine id`);
    assert.equal(typeof engine.primitiveSet, "string", `${name} engine primitive set`);
    assert.equal(typeof engine.compositionAlgorithm, "string", `${name} engine composition`);
    assert.equal(typeof engine.grainAlgorithm, "string", `${name} engine grain`);
    const logo = terraLogoMarkProfile(engine);
    assert.match(logo.system, /^[a-z0-9-]+$/, `${name} logo system`);
    assert.ok(logo.symbol.length >= 8, `${name} logo symbol`);
    assert.ok(logo.reading.includes("・"), `${name} logo reading`);
  }
});

test("Terra combines the highest-ranked genre structures in deterministic score order", () => {
  const { resolveGenreBlend, generateSoundClothReversibleSvg } = loadPatternApi();
  const audio = {
    inferredGenre: "ダブ",
    genreAnalysis: { top: [
      { name: "ダブ", score: 96 },
      { name: "ディープ・ハウス", score: 73 },
      { name: "ダブステップ", score: 48 },
      { name: "レゲエ", score: 24 },
      { name: "テクノ", score: 13 }
    ] },
    energy: .64, rms: .64, bass: .72, onset: .48, rhythm: .66, brightness: .42, tempo: 112, centroid: 1900,
    chroma: Array.from({ length: 12 }, (_, index) => index % 4 === 0 ? .8 : .2),
    detail: { waveform: Array.from({ length: 128 }, (_, index) => Math.sin(index * .19) * .66) }
  };
  const blend = resolveGenreBlend(audio, 8128);
  assert.equal(blend.length, 4);
  assert.deepEqual(Array.from(blend, item => item.genreName), ["ダブ", "ディープ・ハウス", "ダブステップ", "レゲエ"]);
  assert.equal(blend[0].strength, 1);
  assert.ok(blend[0].weight > blend[1].weight && blend[1].weight > blend[2].weight && blend[2].weight > blend[3].weight);
  assert.ok(blend[1].strength > blend[2].strength && blend[2].strength > blend[3].strength);
  assert.ok(Math.abs(blend.reduce((sum, item) => sum + item.weight, 0) - 1) < 1e-9);

  const mood = { id: "genre-blend", label: "genre blend", audioFileName: "genre-blend.wav", audio };
  const first = generateSoundClothReversibleSvg(mood, 1800002000000);
  const second = generateSoundClothReversibleSvg(mood, 1800002000000);
  assert.equal(first, second);
  assert.match(first, /data-genre-blend="ダブ:96%:[\d.]+%\|ディープ・ハウス:73%:[\d.]+%\|ダブステップ:48%:[\d.]+%\|レゲエ:24%:[\d.]+%"/);
  assert.match(first, /data-genre-blend-count="4"/);
  assert.match(first, /id="terra_primary_structure"[^>]*data-genre="ダブ"[^>]*data-genre-rank="1"[^>]*data-genre-strength="1"/);
  assert.match(first, /id="terra_genre_blend_2"[^>]*data-genre="ディープ・ハウス"[^>]*data-genre-rank="2"/);
  assert.match(first, /id="terra_genre_blend_3"[^>]*data-genre="ダブステップ"[^>]*data-genre-rank="3"/);
  assert.match(first, /id="terra_genre_blend_4"[^>]*data-genre="レゲエ"[^>]*data-genre-rank="4"/);
  assert.match(first, /id="pcm_reversible_data"[^>]*data-edit-policy="lock-do-not-edit"/);
  assert.doesNotMatch(first, /data-byte=|data-index=|display="none"|stroke-opacity=|fill-opacity=/);
});

test("browser genre inference reads and blends the 5.6sol MLP model", () => {
  const { modelSol56MlpScores, blendModelSol56Mlp } = loadPatternApi();
  const model = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, "genre-training", "genre-model.json"), "utf8"));
  const raw = model.examples.find(example => Array.isArray(example.values))?.values || [];
  const mlpScores = modelSol56MlpScores(raw, model);
  const baseScores = { "テクノ": 1, "ハウス": .8, "ダブ": .5 };
  const blended = blendModelSol56Mlp(baseScores, raw, model);
  if (!model.sourcePolicy?.sol56MlpEnabled || !model.sol56Mlp?.enabled) {
    assert.equal(Object.keys(mlpScores).length, 0);
    assert.deepEqual(Object.entries(blended), Object.entries(baseScores));
    return;
  }
  assert.ok((model.sol56Mlp.members?.length || model.sol56Mlp.memberCount || 0) >= 1);
  assert.equal(Object.keys(mlpScores).length, model.sol56Mlp.labels.length);
  const probabilityTotal = Object.values(mlpScores).reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(probabilityTotal - 1) < 1e-9);
  assert.ok(Object.keys(blended).length >= model.sol56Mlp.labels.length);
  assert.ok(Object.values(blended).every(Number.isFinite));
});

test("weak logo marks use dedicated primary signs instead of generic shape branches", () => {
  const { generateSoundClothReversibleSvg } = loadPatternApi();
  const moodFor = genre => ({
    id: `logo-primary-${genre}`,
    label: genre,
    audioFileName: `${genre}.wav`,
    audio: {
      inferredGenre: genre,
      genreAnalysis: { top: [{ name: genre, score: 99 }] },
      energy: .58, rms: .58, bass: .46, onset: .5, rhythm: .62, brightness: .48, tempo: 118, centroid: 2800,
      chroma: Array.from({ length: 12 }, (_, index) => index % 3 === 0 ? .76 : .22),
      detail: {
        rms: Array.from({ length: 48 }, (_, index) => .52 + Math.sin(index * .17) * .14),
        bass: Array.from({ length: 48 }, (_, index) => .44 + Math.cos(index * .13) * .12),
        centroid: Array.from({ length: 48 }, (_, index) => .5 + Math.sin(index * .11) * .1),
        onset: Array.from({ length: 48 }, (_, index) => index % 6 === 0 ? .88 : .2),
        waveform: Array.from({ length: 96 }, (_, index) => Math.sin(index * .23) * .64)
      }
    }
  });
  const drone = generateSoundClothReversibleSvg(moodFor("ドローン"), 1800001100001);
  const techno = generateSoundClothReversibleSvg(moodFor("テクノ"), 1800001100002);
  const dnb = generateSoundClothReversibleSvg(moodFor("ドラムンベース"), 1800001100003);
  const folk = generateSoundClothReversibleSvg(moodFor("フォーク"), 1800001100004);
  assert.match(drone, /data-terra-kind="drone-low-anchor"/);
  assert.equal((drone.match(/data-terra-kind="drone-sustain-pillar-/g) || []).length, 3);
  assert.match(techno, /data-terra-kind="techno-beat-notch-3"/);
  assert.match(dnb, /data-terra-kind="dnb-rail-cell-1-5"/);
  assert.match(dnb, /data-terra-kind="dnb-break-wedge"/);
  assert.match(folk, /data-terra-kind="folk-knot"/);
  assert.equal((folk.match(/data-terra-kind="folk-warp-thread-/g) || []).length, 5);
});

test("demo protected PCM particle layer decodes from circle geometry", () => {
  const { pcmProtectedDataGroupFromBytes, decodeProtectedPcmDataFromSvg } = loadPatternApi();
  const source = Uint8Array.from([0, 64, 128, 192, 255]);
  const layer = pcmProtectedDataGroupFromBytes(source, 1, 5, { textureSeed: 12, textureMode: "memory-orbit", textureRegion: "orbit", textureShape: "spark-ring" });
  const decoded = decodeProtectedPcmDataFromSvg(`<svg>${layer}</svg>`);
  const decodedBytes = Buffer.from(decoded.pcmSketch, "base64");

  assert.match(layer, /data-encoding="mulaw8-protected-particle-field-v1"/);
  assert.match(layer, /data-protected-texture-shape="spark-ring"/);
  assert.match(layer, /<circle[^>]*fill="#fff"/);
  const radii = [...layer.matchAll(/\br="([\d.]+)"/g)].map(match => Number(match[1]));
  assert.ok(radii.every(radius => radius >= .16 && radius <= .5), "protected PCM particles stay visible without becoming the silhouette");
  assert.equal((layer.match(/<circle\b/g) || []).length, source.length);
  assert.deepEqual([...decodedBytes], [...source]);
  assert.doesNotMatch(layer, /data-byte=/);
  assert.doesNotMatch(layer, /data-index=/);
});

test("Terra suppresses unfinished peripheral cells without changing protected PCM semantics", () => {
  const { generateSoundClothReversibleSvg } = loadPatternApi();
  const mood = {
    id: "delaunay-geometry-fixture",
    label: "Delaunay geometry fixture",
    audioFileName: "delaunay.wav",
    audio: {
      inferredGenre: "ワールドミュージック",
      genreAnalysis: { top: [{ name: "ワールドミュージック", score: 99 }] },
      energy: .63, rms: .63, bass: .46, onset: .52, rhythm: .66, brightness: .51, tempo: 112, centroid: 2620,
      chroma: Array.from({ length: 12 }, (_, index) => index % 5 === 0 ? .82 : .2),
      detail: { waveform: Array.from({ length: 96 }, (_, index) => Math.sin(index * .24) * .6) }
    }
  };
  const svg = generateSoundClothReversibleSvg(mood, 1800001300000);
  assert.match(svg, /data-peripheral-geometry="suppressed-v1"/);
  assert.doesNotMatch(svg, /id="terra_geometric_field"|data-feature="terra-geometry"/);
  assert.match(svg, /id="pcm_reversible_data"[^>]*data-edit-policy="lock-do-not-edit"/);
  assert.doesNotMatch(svg, /data-byte=|data-index=|display="none"/);
});

test("static motion export bakes visible parts independently and preserves protected PCM", () => {
  const { bakePatternMotionFrame } = loadPatternApi();
  const protectedLayer = '<g id="pcm_reversible_data" data-encoding="mulaw8-protected-texture-field-v2"><path d="M1 1L2 2"/></g>';
  const source = `<svg>${protectedLayer}<g id="sound_form_surface" transform="rotate(3 600 600)"><g id="terra_family_structure"><path d="M0 0L1 1" data-feature="terra-family" data-terra-kind="family-line"/></g><g id="terra_primary_structure"><path d="M2 2L3 3" data-feature="terra-primary" data-terra-kind="primary-mark"/></g><g id="terra_council_composition"><path d="M4 4L5 5" data-feature="terra-council" data-terra-kind="council-mark"/></g><g id="terra_grain_field"><circle cx="6" cy="6" r="1"/></g></g></svg>`;
  const shirt = { id: "motion-test", audioFeatures: { energy: .7, bass: .62, onset: .5, brightness: .42, tempo: 124, chroma: [1, .4, .2, 0, 0, 0, 0, 0, 0, 0, 0, .3] } };
  const exported = bakePatternMotionFrame(source, shirt);

  assert.match(exported, /data-terra-kind="primary-mark"[^>]*d="M [^"]+"[^>]*transform="[^"]*rotate\(/);
  assert.match(exported, /data-terra-kind="family-line"[^>]*transform="[^"]*rotate\(/);
  assert.equal((exported.match(/data-motion-frame="static"/g) || []).length, 7);
  assert.ok(exported.includes(protectedLayer));
  assert.doesNotMatch(exported, /<animate\b|\banimation\s*=/);
});

test("pattern motion returns every visible part to its exact start transform", () => {
  const { patternMotionFrameForShirt, patternMotionTransformForPart, patternMotionTransformForElement } = loadPatternApi();
  const shirt = { audioFeatures: { energy: .71, bass: .63, onset: .57, brightness: .48, tempo: 128, chroma: [1, .5, .2, 0, 0, 0, 0, 0, 0, 0, 0, .3] } };
  const start = patternMotionFrameForShirt(shirt, 0);
  const end = patternMotionFrameForShirt(shirt, Math.PI * 2);
  const active = patternMotionFrameForShirt(shirt, 1.1);

  assert.equal(start.transform, end.transform);
  ["terra_family_structure", "terra_primary_structure", "terra_council_composition", "terra_grain_field"].forEach((partId, index) => {
    assert.equal(patternMotionTransformForPart(start, partId, index), patternMotionTransformForPart(end, partId, index));
    assert.equal(patternMotionTransformForElement(start, partId, index), patternMotionTransformForElement(end, partId, index));
  });
  assert.match(patternMotionTransformForPart(active, "terra_primary_structure"), /rotate\([^)]*\).*translate\(/);
  assert.match(patternMotionTransformForPart(active, "terra_grain_field"), /translate\([^)]*\).*scale\(/);
  assert.match(patternMotionTransformForElement(active, "terra_council_composition", 2), /rotate\(/);
  assert.equal(patternMotionTransformForPart(active, "pcm_reversible_data"), "");
});

test("strong audio attacks drive visible structures beyond the artboard while PCM stays still", () => {
  const { patternMotionFrameForShirt, patternMotionTransformForPart, patternMotionTransformForElement, bakePatternMotionFrame } = loadPatternApi();
  const shirt = {
    id: "motion-surge",
    audioFeatures: { energy: .95, bass: .95, onset: .95, brightness: .95, chroma: Array(12).fill(0) }
  };
  const frame = patternMotionFrameForShirt(shirt, Math.PI / 4, {
    blend: 1, energy: .95, bass: .95, onset: .95, brightness: .95, chroma: Array(12).fill(0)
  });
  assert.ok(frame.surge > 1, `expected strong surge, got ${frame.surge}`);
  assert.ok(frame.scaleY > 2, `expected artboard-breaking scale, got ${frame.scaleY}`);
  const primaryScale = Number(patternMotionTransformForPart(frame, "terra_primary_structure").match(/scale\(([\d.]+) /)?.[1] || 0);
  const blendScale = Number(patternMotionTransformForPart(frame, "terra_genre_blend_2").match(/scale\(([\d.]+) /)?.[1] || 0);
  assert.ok(primaryScale > 2, `expected primary to leave the artboard, got ${primaryScale}`);
  assert.ok(blendScale > 2, `expected blend to leave the artboard, got ${blendScale}`);
  assert.notEqual(patternMotionTransformForElement(frame, "terra_genre_blend_2", 2), "");
  assert.equal(patternMotionTransformForPart(frame, "pcm_reversible_data"), "");

  const valley = patternMotionFrameForShirt(shirt, Math.PI * .75, {
    blend: 1, energy: .95, bass: .95, onset: .95, brightness: .95, chroma: Array(12).fill(0)
  });
  const valleyScale = Number(patternMotionTransformForPart(valley, "terra_primary_structure").match(/scale\(([\d.]+) /)?.[1] || 0);
  assert.ok(valley.scaleY < .85, `expected visible contraction, got ${valley.scaleY}`);
  assert.ok(valleyScale < .85, `expected primary contraction, got ${valleyScale}`);
  assert.ok(primaryScale / valleyScale > 3, `expected a large scale range, got ${primaryScale}/${valleyScale}`);

  const protectedLayer = '<g id="pcm_reversible_data" data-encoding="mulaw8-protected-particle-field-v1"><circle cx="4" cy="4" r="1"/></g>';
  const source = `<svg>${protectedLayer}<g id="sound_form_surface"><g id="terra_genre_blend_2"><path d="M2 2L3 3" data-feature="terra-primary" data-terra-kind="blend-mark"/></g></g></svg>`;
  const exported = bakePatternMotionFrame(source, shirt);
  assert.match(exported, /id="terra_genre_blend_2"[^>]*data-motion-frame="static"/);
  assert.ok(exported.includes(protectedLayer));
});

test("central structures receive a genre-specific accent while protected PCM stays coordinate-static", () => {
  const { patternMotionFrameForShirt, patternMotionTransformForPart, centralMotionAccent, terraMotionProfileForEngine } = loadPatternApi();
  const frame = patternMotionFrameForShirt({
    audioFeatures: { energy: .88, bass: .74, onset: .82, brightness: .9, chroma: Array(12).fill(.3) }
  }, Math.PI / 4, {
    blend: 1, energy: .94, bass: .84, onset: .9, brightness: .92, chroma: Array(12).fill(.35)
  });
  const anime = terraMotionProfileForEngine("terra-anime-transformation-v1");
  const techno = terraMotionProfileForEngine("terra-techno-frame-v1");
  const animeAccent = centralMotionAccent(frame, anime, "terra_primary_structure");
  const objectAccent = centralMotionAccent(frame, anime, "terra_genre_object");
  const technoAccent = centralMotionAccent(frame, techno, "terra_primary_structure");

  assert.ok(animeAccent.scaleX > 1.1 || animeAccent.scaleY > 1.1, "central primary receives a visible accent");
  assert.notDeepEqual(animeAccent, objectAccent, "central object has an independent accent strength");
  assert.notDeepEqual(animeAccent, technoAccent, "genre-specific central movement remains distinct");
  assert.notEqual(patternMotionTransformForPart(frame, "terra_primary_structure", 0, anime), patternMotionTransformForPart(frame, "terra_primary_structure", 0, techno));
  assert.equal(patternMotionTransformForPart(frame, "pcm_reversible_data", 0, anime), "");
});

test("every Terra genre engine owns a distinct motion verb and primary gesture", () => {
  const { terraGenreEngines, terraMotionProfiles, terraMotionProfileForEngine, patternMotionFrameForShirt, patternMotionTransformForPart } = loadPatternApi();
  const engineIds = Object.values(terraGenreEngines).map(engine => engine.id);
  assert.equal(engineIds.length, 32);
  assert.equal(Object.keys(terraMotionProfiles).length, engineIds.length);
  assert.equal(new Set(engineIds.map(engineId => terraMotionProfileForEngine(engineId).verb)).size, engineIds.length);

  const transforms = engineIds.map(engineId => {
    const shirt = {
      art: `<svg data-engine="${engineId}"></svg>`,
      audioFeatures: { energy: .9, bass: .84, onset: .82, brightness: .68, chroma: Array(12).fill(.2) }
    };
    const frame = patternMotionFrameForShirt(shirt, Math.PI / 4, {
      blend: 1, energy: .96, bass: .94, onset: .92, brightness: .78, chroma: Array(12).fill(.2)
    });
    return patternMotionTransformForPart(frame, "terra_primary_structure", 0, terraMotionProfileForEngine(engineId));
  });
  assert.equal(new Set(transforms).size, engineIds.length);
  assert.equal(patternMotionTransformForPart(patternMotionFrameForShirt({ audioFeatures: {} }, 0), "pcm_reversible_data"), "");
});

test("32 central motion programs use distinct structural fields and never animate protected PCM", () => {
  const {
    terraGenreEngines,
    terraMotionProfileForEngine,
    centralMotionPrograms,
    centralMotionProgramForProfile,
    centralMotionAccent,
    centralMotionElementTransform,
    centralMotionPointOffset,
    patternMotionFrameForShirt,
    patternMotionTransformForPart,
    pcmProtectedDataGroupFromBytes,
    decodeProtectedPcmDataFromSvg,
    bakePatternMotionFrame
  } = loadPatternApi();
  const engineIds = Object.values(terraGenreEngines).map(engine => engine.id);
  assert.equal(Object.keys(centralMotionPrograms).length, 32);
  assert.equal(new Set(Object.values(centralMotionPrograms).map(program => program.mode)).size, 32);
  const frame = patternMotionFrameForShirt({
    audioFeatures: { energy: .86, bass: .76, onset: .84, brightness: .72, chroma: Array(12).fill(.25) }
  }, Math.PI / 3, {
    blend: 1, energy: .92, bass: .82, onset: .9, brightness: .86, chroma: Array(12).fill(.3)
  });
  const signatures = engineIds.map(engineId => {
    const profile = terraMotionProfileForEngine(engineId);
    const program = centralMotionProgramForProfile(profile);
    const group = centralMotionAccent(frame, profile, "terra_primary_structure", 0);
    const element = centralMotionElementTransform(frame, profile, "terra_primary_structure", 3, "engine-probe");
    const point = centralMotionPointOffset(frame, profile, "terra_primary_structure", 3, 2, "engine-probe");
    return `${program.mode}|${program.cycles}|${JSON.stringify(group)}|${element}|${JSON.stringify(point)}`;
  });
  assert.equal(new Set(signatures).size, 32);

  const protectedLayer = pcmProtectedDataGroupFromBytes(Uint8Array.from([14, 92, 188, 243]), { sampleRate: 8000, frameCount: 4, seed: 71 });
  const svg = `<svg data-engine="terra-anime-transformation-v1">${protectedLayer}<g id="sound_form_surface"><g id="terra_primary_structure" data-terra-engine="terra-anime-transformation-v1"><path d="M20 20 L80 20 L50 90 Z" data-feature="terra-primary" data-terra-kind="anime-transformation-charm" data-motion-engine="terra-anime-transformation-v1"/></g></g></svg>`;
  const baked = bakePatternMotionFrame(svg, { id: "central-motion-pcm-static", art: svg, audioFeatures: { energy: .82, bass: .62, onset: .88, brightness: .92, chroma: Array(12).fill(.3) } });
  assert.match(baked, /data-motion-engine="terra-anime-transformation-v1"/);
  assert.ok(baked.includes(protectedLayer));
  const decoded = decodeProtectedPcmDataFromSvg(baked);
  assert.ok(decoded?.pcmSketch);
  assert.equal(patternMotionTransformForPart(frame, "pcm_reversible_data", 0, terraMotionProfileForEngine("terra-anime-transformation-v1")), "");
});

test("playback equalizer samples the saved timeline instead of one global average", () => {
  const { sampledEqualizerSignal, patternMotionFrameForShirt } = loadPatternApi();
  const shirt = {
    audioFeatures: {
      energy: .4, bass: .3, onset: .2, brightness: .3, chroma: Array(12).fill(.1),
      detail: {
        rms: [0, 1], bass: [0, 1], onset: [0, .9], centroid: [.1, .8],
        chromaTimeline: [Array(12).fill(0), [1, ...Array(11).fill(0)]],
        bandTimeline: [Array(8).fill(0), Array(8).fill(1)]
      }
    }
  };
  const intro = sampledEqualizerSignal(shirt, 0);
  const climax = sampledEqualizerSignal(shirt, 1);

  assert.ok(climax.energy > intro.energy);
  assert.ok(climax.bass > intro.bass);
  assert.ok(climax.onset > intro.onset);
  assert.ok(climax.chroma[0] > intro.chroma[0]);
  assert.notEqual(patternMotionFrameForShirt(shirt, 1, intro).transform, patternMotionFrameForShirt(shirt, 1, climax).transform);
});

test("reconstructed PCM drives the animation force timeline without replacing its base gesture", () => {
  const { reconstructionMotionDetailFromSamples, patternMotionFrameForShirt } = loadPatternApi();
  const sampleRate = 8000;
  const samples = new Float32Array(sampleRate * 4);
  for (let index = sampleRate * 2; index < samples.length; index += 1) {
    const burst = index < sampleRate * 2 + 420 ? .95 : .46;
    samples[index] = Math.sin(index * Math.PI * 2 * 96 / sampleRate) * burst;
  }
  const detail = reconstructionMotionDetailFromSamples(samples, sampleRate, { tempo: 120 });
  assert.equal(detail.rms.length, 64);
  assert.equal(detail.bass.length, 64);
  assert.equal(detail.onset.length, 64);
  assert.ok(Math.max(...detail.rms.slice(36)) > Math.max(...detail.rms.slice(0, 24)) + .5);
  assert.ok(Math.max(...detail.onset.slice(30, 36)) > .5);
  const shirt = { audioFeatures: { energy: .48, bass: .36, onset: .28, brightness: .42, chroma: Array(12).fill(.2) } };
  const normal = patternMotionFrameForShirt(shirt, 1.25);
  const reactive = patternMotionFrameForShirt(shirt, 1.25, { blend: 1, energy: .94, bass: .9, onset: .96, brightness: .72, chroma: Array(12).fill(.2) });
  assert.equal(normal.phase, reactive.phase);
  assert.ok(reactive.surge > normal.surge);
});

test("visible vector paths deform at their own points and complete a closed loop", () => {
  const { patternMotionFrameForShirt, deformVisiblePathData } = loadPatternApi();
  const shirt = { audioFeatures: { energy: .72, bass: .66, onset: .74, brightness: .55, chroma: Array(12).fill(.3) } };
  const original = "M100 100 C150 60 220 160 280 100 L340 160";
  const start = deformVisiblePathData(original, patternMotionFrameForShirt(shirt, 0), "terra_primary_structure", 2);
  const end = deformVisiblePathData(original, patternMotionFrameForShirt(shirt, Math.PI * 2), "terra_primary_structure", 2);

  assert.notEqual(start, original);
  assert.equal(start, end);
  assert.match(start, /^M\s*[-\d.]+\s+[-\d.]+\s+C\s*[-\d.]+\s+[-\d.]+/);
  assert.equal(deformVisiblePathData("m10 10 l20 0", patternMotionFrameForShirt(shirt, 0), "terra_primary_structure", 0), "m10 10 l20 0");
});

test("rectangles, circles, and ellipses are converted to deformable visible paths", () => {
  const { vectorPrimitivePathData, patternMotionFrameForShirt, deformVisiblePathData, bakePatternMotionFrame } = loadPatternApi();
  const shirt = { id: "primitive-motion", audioFeatures: { energy: .7, bass: .7, onset: .8, brightness: .5, chroma: Array(12).fill(.2) } };
  const frame = patternMotionFrameForShirt(shirt, 0);
  const rectangle = vectorPrimitivePathData("rect", name => ({ x: "100", y: "200", width: "80", height: "40" })[name]);
  const circle = vectorPrimitivePathData("circle", name => ({ cx: "500", cy: "500", r: "24" })[name]);
  const ellipse = vectorPrimitivePathData("ellipse", name => ({ cx: "700", cy: "500", rx: "36", ry: "18" })[name]);

  assert.equal((rectangle.match(/ L/g) || []).length, 3);
  assert.match(circle, / C/);
  assert.match(ellipse, / C/);
  assert.notEqual(deformVisiblePathData(rectangle, frame, "terra_primary_structure", 1), rectangle);

  const exported = bakePatternMotionFrame(`<svg><g id="sound_form_surface"><g id="terra_primary_structure"><rect x="100" y="200" width="80" height="40" data-feature="terra-primary" data-terra-kind="moving-rect"/></g></g></svg>`, shirt);
  assert.match(exported, /<path[^>]*data-terra-kind="moving-rect"[^>]*d="M [^"]+"/);
  assert.doesNotMatch(exported, /<rect\b[^>]*moving-rect/);
});

test("semantic logo textures for trap, rock, and punk preserve PCM bytes", () => {
  const { pcmProtectedDataGroupFromBytes, decodeProtectedPcmDataFromSvg } = loadPatternApi();
  const source = Uint8Array.from([0, 19, 64, 111, 128, 173, 224, 255]);
  ["hat-ladder", "fretboard", "scratch-constellation"].forEach((textureShape, index) => {
    const layer = pcmProtectedDataGroupFromBytes(source, 1, source.length, {
      textureSeed: 410 + index,
      textureMode: "memory-orbit",
      textureRegion: "full",
      textureShape
    });
    const decoded = decodeProtectedPcmDataFromSvg(`<svg>${layer}</svg>`);
    assert.match(layer, new RegExp(`data-protected-texture-shape="${textureShape}"`));
    assert.deepEqual([...Buffer.from(decoded.pcmSketch, "base64")], [...source], `${textureShape} round-trip`);
  });
});

test("generated genre SVG uses Terra 5.6 inverted-print structure without SVG effects", () => {
  const { generateSoundClothReversibleSvg } = loadPatternApi();
  const mood = {
    id: "collision-fixture",
    label: "collision fixture",
    audioFileName: "collision-fixture.wav",
    variantSalt: 2,
    audio: {
      inferredGenre: "J-POP",
      genreAnalysis: { top: [{ name: "J-POP", score: 99 }] },
      energy: 0.72,
      rms: 0.72,
      bass: 0.46,
      onset: 0.58,
      rhythm: 0.68,
      brightness: 0.62,
      tempo: 128,
      centroid: 3650,
      chroma: Array.from({ length: 12 }, (_, index) => index % 3 === 0 ? 0.72 : 0.24),
      detail: {
        rms: Array.from({ length: 64 }, (_, index) => 0.5 + Math.sin(index * 0.2) * 0.2),
        bass: Array.from({ length: 64 }, (_, index) => 0.45 + Math.cos(index * 0.17) * 0.18),
        centroid: Array.from({ length: 64 }, (_, index) => 0.55 + Math.sin(index * 0.13) * 0.16),
        onset: Array.from({ length: 64 }, (_, index) => index % 8 === 0 ? 0.95 : 0.25),
        waveform: Array.from({ length: 192 }, (_, index) => Math.sin(index * 0.24) * 0.7)
      }
    }
  };
  const svg = generateSoundClothReversibleSvg(mood, 1800000001234, { variantSeed: 77, iteration: "collision-test" });
  assert.match(svg, /data-engine="terra-jpop-banner-v2"/);
  assert.match(svg, /data-engine-family="terra-5.6"/);
  assert.match(svg, /data-engine-primitive-set="folded-melody-banners"/);
  assert.match(svg, /data-engine-composition="rising-poster-fold"/);
  assert.match(svg, /data-engine-grain="pop-confetti"/);
  assert.match(svg, /data-visual-style="terra-inverted-print-v1"/);
  assert.match(svg, /<rect width="1200" height="1200" fill="#000"\/>/);
  assert.match(svg, /data-print-ink="white-opaque"/);
  assert.match(svg, /(fill|stroke)="#fff"/);
  assert.match(svg, /data-design-council="terra-council-v2"/);
  assert.match(svg, /data-council-passes="10"/);
  assert.match(svg, /data-council-winning-pass="(?:[1-9]|10)"/);
  assert.match(svg, /data-council-gestalt-score="\d+"/);
  assert.match(svg, /data-council-rhythm-score="\d+"/);
  assert.match(svg, /data-council-screenprint-score="\d+"/);
  assert.match(svg, /data-council-synthesis-score="\d+"/);
  assert.match(svg, /data-terra-family="gesture-poster"/);
  assert.match(svg, /data-terra-shape="pop-ribbon"/);
  assert.match(svg, /data-form-mode="genre-j-pop"/);
  assert.match(svg, /data-aerosol-archetype="/);
  assert.match(svg, /data-aerosol-topology="/);
  assert.match(svg, /data-exclusive-zone="/);
  assert.match(svg, /data-composition-category="/);
  assert.match(svg, /data-gesture-mode="/);
  assert.match(svg, /data-classifier-method="/);
  assert.match(svg, /data-macro-genre="/);
  assert.match(svg, /data-pattern-family="impact-poster-gesture"/);
  assert.match(svg, /data-source-lineage="japanese-poster,graphic-score,pattern-language"/);
  assert.match(svg, /data-visual-thesis="/);
  assert.match(svg, /data-composition-rule="/);
  assert.match(svg, /data-required-motifs="pop-ribbon,spark-outline,anime-like-jump"/);
  assert.match(svg, /data-forbidden-forms="heavy-black-slab,blade-gate,quiet-staff"/);
  assert.match(svg, /data-protected-texture-shape="pop-ribbon"/);
  assert.match(svg, /id="terra_primary_structure"/);
  assert.match(svg, /id="terra_grain_field"/);
  assert.match(svg, /id="terra_grain_field"[^>]*data-visual-role="supporting-atmosphere"[^>]*data-hierarchy="below-primary"/);
  assert.doesNotMatch(svg, /id="terra_family_structure"/);
  assert.doesNotMatch(svg, /id="terra_council_composition"/);
  const archetype = svg.match(/data-aerosol-archetype="([^"]+)"/)?.[1] || "";
  assert.ok(knownAerosolArchetypes.has(archetype), `unknown aerosol archetype ${archetype}`);
  assert.match(svg, /data-feature="terra-primary"/);
  assert.match(svg, /data-feature="terra-grain"/);
  assert.match(svg, /<circle\b/);
  assert.doesNotMatch(svg, /stroke-opacity=/);
  assert.doesNotMatch(svg, /fill-opacity=/);
  assert.doesNotMatch(svg, /filter=/);
  assert.doesNotMatch(svg, /blur/);
  assert.doesNotMatch(svg, /gradient/);
  assert.doesNotMatch(svg, /data-shape-turn=/);
  assert.doesNotMatch(svg, /data-shape-aspect/);
  assert.doesNotMatch(svg, /data-byte=/);
  assert.doesNotMatch(svg, /data-index=/);
});

test("Terra design council completes ten deterministic designer and judge passes", () => {
  const { genrePatternProfiles, resolveTerraDesignCouncil, resolveGenreVisualProfile } = loadPatternApi();
  const profile = genrePatternProfiles["クラシック音楽"];
  const audio = {
    inferredGenre: "クラシック音楽",
    energy: .38,
    rms: .38,
    bass: .22,
    onset: .18,
    rhythm: .32,
    brightness: .46,
    centroid: 2800
  };
  const visual = resolveGenreVisualProfile(profile, audio, 5831);
  const first = resolveTerraDesignCouncil(visual, audio, 5831);
  const second = resolveTerraDesignCouncil(visual, audio, 5831);

  assert.deepEqual(first, second);
  assert.equal(first.passCount, 10);
  assert.equal(first.rounds.length, 10);
  assert.deepEqual(Array.from(first.rounds, round => round.pass), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(Array.from(first.rounds, round => round.move), [
    "area-breath", "silhouette-declaration", "reserve-ink", "rhythm-articulation", "poster-tension",
    "interval-discipline", "grain-focus", "print-balance", "genre-thesis", "final-arbitration"
  ]);
  assert.ok(first.quietScore >= 70 && first.quietScore <= 100);
  assert.ok(first.posterScore >= 70 && first.posterScore <= 100);
  assert.ok(first.judgeScore >= 70 && first.judgeScore <= 100);
  assert.ok(first.gestaltScore >= 70 && first.gestaltScore <= 100);
  assert.ok(first.rhythmScore >= 70 && first.rhythmScore <= 100);
  assert.ok(first.screenprintScore >= 70 && first.screenprintScore <= 100);
  assert.ok(first.primaryScale >= .86 && first.primaryScale <= 1.18);
  assert.ok(first.grainDensity >= .66 && first.grainDensity <= 1.22);
  assert.deepEqual(Array.from(Object.keys(first.members)), ["gestaltDirector", "scoreRhythmDesigner", "screenprintDirector"]);
  assert.match(first.rounds[0].theory, /Gestalt figure-ground/);

  const partial = resolveTerraDesignCouncil(visual, audio, 5831, 4);
  assert.equal(partial.passCount, 4);
  assert.deepEqual(Array.from(partial.rounds, round => round.move), [
    "area-breath", "silhouette-declaration", "reserve-ink", "rhythm-articulation"
  ]);
});

test("electronic and techno keep open circuits and closed machine frames structurally distinct", () => {
  const { generateSoundClothReversibleSvg } = loadPatternApi();
  const createMood = genre => ({
    id: `signal-separation-${genre}`,
    label: genre,
    audioFileName: `${genre}.wav`,
    audio: {
      inferredGenre: genre,
      genreAnalysis: { top: [{ name: genre, score: 99 }] },
      energy: .6,
      rms: .6,
      bass: .42,
      onset: .46,
      rhythm: .72,
      brightness: .68,
      tempo: 126,
      centroid: 3900,
      chroma: Array.from({ length: 12 }, (_, index) => index % 4 === 0 ? .8 : .2),
      detail: {
        rms: Array.from({ length: 48 }, (_, index) => .52 + Math.sin(index * .2) * .12),
        bass: Array.from({ length: 48 }, (_, index) => .4 + Math.cos(index * .16) * .1),
        centroid: Array.from({ length: 48 }, (_, index) => .6 + Math.sin(index * .13) * .1),
        onset: Array.from({ length: 48 }, (_, index) => index % 8 === 0 ? .82 : .2),
        waveform: Array.from({ length: 96 }, (_, index) => Math.sin(index * .21) * .6)
      }
    }
  });
  const electronic = generateSoundClothReversibleSvg(createMood("電子音楽"), 1800000100004);
  const techno = generateSoundClothReversibleSvg(createMood("テクノ"), 1800000100005);

  assert.match(electronic, /data-terra-shape="circuit-gates"/);
  assert.equal((electronic.match(/data-terra-kind="circuit-gate"/g) || []).length, 4);
  assert.equal((electronic.match(/data-terra-kind="circuit-node"/g) || []).length, 4);
  assert.doesNotMatch(electronic, /data-terra-kind="machine-frame"/);
  assert.match(techno, /data-terra-shape="square-frame"/);
  assert.match(techno, /data-terra-kind="machine-frame"/);
  assert.match(techno, /data-terra-kind="machine-core"/);
  assert.doesNotMatch(techno, /data-terra-kind="circuit-gate"/);
});

test("rock and punk keep guitar tension and scratch-only structures distinct", () => {
  const { generateSoundClothReversibleSvg } = loadPatternApi();
  const createMood = genre => ({
    id: `gesture-separation-${genre}`,
    label: genre,
    audioFileName: `${genre}.wav`,
    audio: {
      inferredGenre: genre,
      genreAnalysis: { top: [{ name: genre, score: 99 }] },
      energy: .76,
      rms: .76,
      bass: .5,
      onset: .82,
      rhythm: .7,
      brightness: .52,
      tempo: 146,
      centroid: 3200,
      chroma: Array.from({ length: 12 }, (_, index) => index % 3 === 0 ? .78 : .2),
      detail: {
        rms: Array.from({ length: 48 }, (_, index) => .62 + Math.sin(index * .24) * .16),
        bass: Array.from({ length: 48 }, (_, index) => .48 + Math.cos(index * .18) * .12),
        centroid: Array.from({ length: 48 }, (_, index) => .5 + Math.sin(index * .15) * .12),
        onset: Array.from({ length: 48 }, (_, index) => index % 5 === 0 ? .94 : .22),
        waveform: Array.from({ length: 96 }, (_, index) => Math.sin(index * .28) * .7)
      }
    }
  });
  const rock = generateSoundClothReversibleSvg(createMood("ロック"), 1800000100017);
  const punk = generateSoundClothReversibleSvg(createMood("パンク"), 1800000100018);

  assert.match(rock, /data-engine="terra-rock-fretboard-v2"/);
  assert.match(rock, /data-terra-shape="fretboard"/);
  assert.match(rock, /data-terra-kind="fretboard-spine"/);
  assert.match(rock, /data-logo-symbol="fretboard, strings, and pick"/);
  assert.match(rock, /data-logo-system="instrument-sign"/);
  assert.equal((rock.match(/data-terra-kind="guitar-string"/g) || []).length, 7);
  assert.match(rock, /data-terra-kind="pick-anchor"/);
  assert.doesNotMatch(rock, /data-terra-kind="scratch-mark"/);
  assert.match(punk, /data-engine="terra-punk-scratch-v2"/);
  assert.match(punk, /data-terra-shape="scratch-constellation"/);
  assert.equal((punk.match(/data-terra-kind="punk-scratch-/g) || []).length, 17);
  assert.match(punk, /data-logo-reading="裂く・断つ・残す"/);
  assert.match(punk, /data-logo-system="scratch-constellation"/);
  assert.doesNotMatch(punk, /data-terra-kind="pick-anchor"/);
  assert.doesNotMatch(punk, /data-terra-kind="guitar-string"/);
});

test("anime songs use a hero star plus a black-only transformation charm effect", () => {
  const { generateSoundClothReversibleSvg } = loadPatternApi();
  const mood = {
    id: "anime-transformation",
    label: "アニメソング",
    audioFileName: "anime-song.wav",
    audio: {
      inferredGenre: "アニメソング",
      genreAnalysis: { top: [{ name: "アニメソング", score: 99 }] },
      energy: .86,
      rms: .86,
      bass: .4,
      onset: .78,
      rhythm: .82,
      brightness: .94,
      tempo: 168,
      centroid: 4900,
      chroma: Array.from({ length: 12 }, (_, index) => index % 3 === 0 ? .88 : .24),
      detail: {
        rms: Array.from({ length: 64 }, (_, index) => .7 + Math.sin(index * .23) * .16),
        bass: Array.from({ length: 64 }, (_, index) => .36 + Math.cos(index * .17) * .1),
        centroid: Array.from({ length: 64 }, (_, index) => .78 + Math.sin(index * .14) * .12),
        onset: Array.from({ length: 64 }, (_, index) => index % 5 === 0 ? .96 : .24),
        waveform: Array.from({ length: 128 }, (_, index) => Math.sin(index * .3) * .74)
      }
    }
  };
  const svg = generateSoundClothReversibleSvg(mood, 1800000100027);

  assert.match(svg, /data-terra-shape="spark-ring"/);
  assert.match(svg, /data-terra-kind="anime-core-star"/);
  assert.equal((svg.match(/data-terra-kind="anime-speed-ray"/g) || []).length, 18);
  assert.equal((svg.match(/data-terra-kind="anime-sparkle"/g) || []).length, 8);
  assert.match(svg, /data-object-motif="transformation-charm"/);
  assert.match(svg, /id="terra_genre_object"[^>]*data-terra-engine="terra-anime-transformation-v1"/);
  assert.match(svg, /data-terra-kind="anime-transformation-charm"/);
  assert.equal((svg.match(/data-terra-kind="anime-four-point-shine"/g) || []).length, 4);
  assert.equal((svg.match(/data-terra-kind="anime-comet-trail"/g) || []).length, 2);
  assert.doesNotMatch(svg, /data-terra-kind="radial-mark"/);
});

test("deep house and reggae keep sub-bass basins and offbeat ribbons distinct", () => {
  const { generateSoundClothReversibleSvg } = loadPatternApi();
  const createMood = genre => ({
    id: `bass-separation-${genre}`,
    label: genre,
    audioFileName: `${genre}.wav`,
    audio: {
      inferredGenre: genre,
      genreAnalysis: { top: [{ name: genre, score: 99 }] },
      energy: .64,
      rms: .64,
      bass: .82,
      onset: .36,
      rhythm: .68,
      brightness: .34,
      tempo: 116,
      centroid: 2150,
      chroma: Array.from({ length: 12 }, (_, index) => index % 4 === 0 ? .78 : .2),
      detail: {
        rms: Array.from({ length: 48 }, (_, index) => .54 + Math.sin(index * .18) * .12),
        bass: Array.from({ length: 48 }, (_, index) => .7 + Math.cos(index * .13) * .14),
        centroid: Array.from({ length: 48 }, (_, index) => .34 + Math.sin(index * .12) * .08),
        onset: Array.from({ length: 48 }, (_, index) => index % 8 === 0 ? .72 : .16),
        waveform: Array.from({ length: 96 }, (_, index) => Math.sin(index * .17) * .68)
      }
    }
  });
  const deepHouse = generateSoundClothReversibleSvg(createMood("ディープ・ハウス"), 1800000100007);
  const reggae = generateSoundClothReversibleSvg(createMood("レゲエ"), 1800000100014);

  assert.match(deepHouse, /data-terra-shape="bass-bowl"/);
  assert.match(deepHouse, /data-terra-kind="bass-basin"/);
  assert.equal((deepHouse.match(/data-terra-kind="bass-rim"/g) || []).length, 3);
  assert.doesNotMatch(deepHouse, /data-terra-kind="reggae-ribbon"/);
  assert.match(reggae, /data-terra-shape="ribbons"/);
  assert.equal((reggae.match(/data-terra-kind="reggae-ribbon"/g) || []).length, 6);
  assert.doesNotMatch(reggae, /data-terra-kind="bass-basin"/);
});

test("dub and dubstep keep delayed echo trails and wobble pressure walls distinct", () => {
  const { generateSoundClothReversibleSvg } = loadPatternApi();
  const createMood = genre => ({
    id: `dub-separation-${genre}`,
    label: genre,
    audioFileName: `${genre}.wav`,
    audio: {
      inferredGenre: genre,
      genreAnalysis: { top: [{ name: genre, score: 99 }] },
      energy: .7,
      rms: .7,
      bass: .86,
      onset: .46,
      rhythm: .62,
      brightness: .3,
      tempo: 138,
      centroid: 1900,
      chroma: Array.from({ length: 12 }, (_, index) => index % 5 === 0 ? .8 : .2),
      detail: {
        rms: Array.from({ length: 48 }, (_, index) => .58 + Math.sin(index * .17) * .16),
        bass: Array.from({ length: 48 }, (_, index) => .76 + Math.cos(index * .12) * .12),
        centroid: Array.from({ length: 48 }, (_, index) => .3 + Math.sin(index * .1) * .08),
        onset: Array.from({ length: 48 }, (_, index) => index % 7 === 0 ? .84 : .18),
        waveform: Array.from({ length: 96 }, (_, index) => Math.sin(index * .16) * .72)
      }
    }
  });
  const dub = generateSoundClothReversibleSvg(createMood("ダブ"), 1800000100015);
  const dubstep = generateSoundClothReversibleSvg(createMood("ダブステップ"), 1800000100010);

  assert.match(dub, /data-terra-shape="echo-columns"/);
  assert.equal((dub.match(/data-terra-kind="echo-trail"/g) || []).length, 7);
  assert.match(dub, /data-terra-kind="echo-ground"/);
  assert.doesNotMatch(dub, /data-terra-kind="vertical-body"/);
  assert.match(dubstep, /data-terra-shape="wobble-pillars"/);
  assert.equal((dubstep.match(/data-terra-kind="dubstep-wobble-ridge-/g) || []).length, 4);
  assert.match(dubstep, /data-terra-kind="dubstep-pressure-plinth"/);
  assert.doesNotMatch(dubstep, /data-terra-kind="echo-trail"/);
});

test("song-specific renderer is stable for the same audio fingerprint", () => {
  const { generateSoundClothReversibleSvg } = loadPatternApi();
  const baseMood = {
    id: "stable-song",
    label: "stable song",
    audioFileName: "stable-song.wav",
    variantSalt: 0,
    audio: {
      inferredGenre: "トランス",
      genreAnalysis: { top: [{ name: "トランス", score: 98 }] },
      energy: 0.64,
      rms: 0.64,
      bass: 0.42,
      onset: 0.5,
      rhythm: 0.72,
      brightness: 0.68,
      tempo: 136,
      centroid: 4200,
      chroma: Array.from({ length: 12 }, (_, index) => index % 4 === 0 ? 0.8 : 0.18),
      detail: {
        rms: Array.from({ length: 32 }, (_, index) => 0.5 + Math.sin(index * 0.2) * 0.16),
        bass: Array.from({ length: 32 }, (_, index) => 0.38 + Math.cos(index * 0.15) * 0.11),
        centroid: Array.from({ length: 32 }, (_, index) => 0.62 + Math.sin(index * 0.13) * 0.1),
        onset: Array.from({ length: 32 }, (_, index) => index % 6 === 0 ? 0.88 : 0.18),
        waveform: Array.from({ length: 96 }, (_, index) => Math.sin(index * 0.23) * 0.62)
      }
    }
  };
  const sameA = generateSoundClothReversibleSvg(baseMood, 1800000000000, { variantSeed: 1, iteration: "a" });
  const sameB = generateSoundClothReversibleSvg({ ...baseMood, variantSalt: 99 }, 1900000000000, { variantSeed: 999, iteration: "b" });
  const different = generateSoundClothReversibleSvg({
    ...baseMood,
    id: "different-song",
    audioFileName: "different-song.wav",
    audio: {
      ...baseMood.audio,
      tempo: 92,
      centroid: 1200,
      brightness: 0.22,
      bass: 0.78,
      inferredGenre: "ダブ",
      genreAnalysis: { top: [{ name: "ダブ", score: 98 }] },
      detail: {
        ...baseMood.audio.detail,
        waveform: Array.from({ length: 96 }, (_, index) => Math.sin(index * 0.09 + 1.4) * 0.74)
      }
    }
  }, 1800000000000, { variantSeed: 1, iteration: "a" });

  assert.equal(sameA, sameB);
  assert.notEqual(sameA, different);
});

test("Terra renderer assigns unique exclusive zones and engines across genres", () => {
  const { generateSoundClothReversibleSvg, musicGenreProfiles } = loadPatternApi();
  const zones = new Map();
  const gestures = new Map();
  const engines = new Map();
  Object.keys(musicGenreProfiles).forEach((genre, index) => {
    const svg = generateSoundClothReversibleSvg({
      id: `exclusive-${index}`,
      label: genre,
      audioFileName: `${genre}.wav`,
      variantSalt: 0,
      audio: {
        inferredGenre: genre,
        genreAnalysis: { method: "two-stage-local-classifier", top: [{ name: genre, score: 99 }] },
        energy: 0.54,
        rms: 0.54,
        bass: 0.48,
        onset: 0.42,
        rhythm: 0.58,
        brightness: 0.5,
        tempo: 112,
        centroid: 2600,
        chroma: Array.from({ length: 12 }, (_, pc) => pc === index % 12 ? 0.82 : 0.18),
        detail: {
          rms: Array.from({ length: 32 }, (_, i) => 0.48 + Math.sin(i * 0.2) * 0.12),
          bass: Array.from({ length: 32 }, (_, i) => 0.42 + Math.cos(i * 0.16) * 0.1),
          centroid: Array.from({ length: 32 }, (_, i) => 0.45 + Math.sin(i * 0.13) * 0.08),
          onset: Array.from({ length: 32 }, (_, i) => i % 7 === 0 ? 0.76 : 0.18),
          waveform: Array.from({ length: 96 }, (_, i) => Math.sin(i * 0.21) * 0.56)
        }
      }
    }, 1800000300000 + index * 103, { variantSeed: index * 23 });
    const zone = svg.match(/id="terra_grain_field"[^>]*data-exclusive-zone="([^"]+)"/)?.[1] || "";
    const category = svg.match(/id="terra_grain_field"[^>]*data-composition-category="([^"]+)"/)?.[1] || "";
    const gesture = svg.match(/id="terra_grain_field"[^>]*data-gesture-mode="([^"]+)"/)?.[1] || "";
    const engine = svg.match(/<svg\b[^>]*data-engine="([^"]+)"/)?.[1] || "";
    const particles = [...svg.matchAll(/<circle\b([^>]*)>/g)]
      .map(match => match[1])
      .filter(attrs => /data-feature="terra-grain"/.test(attrs));
    const bounds = particles.reduce((box, attrs) => {
      const cx = Number(attrs.match(/cx="([^"]+)"/)?.[1]);
      const cy = Number(attrs.match(/cy="([^"]+)"/)?.[1]);
      const r = Number(attrs.match(/r="([^"]+)"/)?.[1]);
      if (!Number.isFinite(cx + cy + r)) return box;
      return {
        minX: Math.min(box.minX, cx - r),
        minY: Math.min(box.minY, cy - r),
        maxX: Math.max(box.maxX, cx + r),
        maxY: Math.max(box.maxY, cy + r)
      };
    }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    assert.notEqual(zone, "", `${genre} exclusive zone`);
    assert.notEqual(category, "", `${genre} composition category`);
    assert.notEqual(gesture, "", `${genre} gesture mode`);
    assert.match(engine, /^terra-[a-z0-9-]+-v\d+$/, `${genre} engine`);
    assert.ok(!zones.has(zone), `${genre} shares zone ${zone} with ${zones.get(zone)}`);
    assert.ok(!gestures.has(gesture), `${genre} shares gesture ${gesture} with ${gestures.get(gesture)}`);
    assert.ok(!engines.has(engine), `${genre} shares engine ${engine} with ${engines.get(engine)}`);
    assert.ok(particles.length >= 200, `${genre} collapsed particle count ${particles.length}`);
    assert.ok(Math.max(width, height) >= 240, `${genre} weak footprint ${width}x${height}`);
    assert.ok(Math.min(width, height) >= 90, `${genre} over-compressed footprint ${width}x${height}`);
    zones.set(zone, genre);
    gestures.set(gesture, genre);
    engines.set(engine, genre);
  });
  assert.equal(zones.size, Object.keys(musicGenreProfiles).length);
  assert.equal(gestures.size, Object.keys(musicGenreProfiles).length);
  assert.equal(engines.size, Object.keys(musicGenreProfiles).length);
});

test("jazz and soul separate improvised cymbal phrases from diagonal vocal vessels", () => {
  const { generateSoundClothReversibleSvg } = loadPatternApi();
  const moodFor = genre => ({
    id: `jazz-soul-${genre}`,
    label: genre,
    audioFileName: `${genre}.wav`,
    audio: {
      inferredGenre: genre,
      genreAnalysis: { method: "two-stage-local-classifier", top: [{ name: genre, score: 99 }] },
      energy: .52,
      rms: .52,
      bass: .42,
      onset: .34,
      rhythm: .58,
      brightness: .48,
      tempo: 104,
      centroid: 2400,
      chroma: Array.from({ length: 12 }, (_, pc) => pc % 3 === 0 ? .8 : .2),
      detail: {
        rms: Array.from({ length: 32 }, (_, i) => .48 + Math.sin(i * .2) * .1),
        bass: Array.from({ length: 32 }, (_, i) => .42 + Math.cos(i * .16) * .1),
        centroid: Array.from({ length: 32 }, (_, i) => .48 + Math.sin(i * .13) * .08),
        onset: Array.from({ length: 32 }, (_, i) => i % 7 === 0 ? .72 : .18),
        waveform: Array.from({ length: 96 }, (_, i) => Math.sin(i * .21) * .54)
      }
    }
  });
  const jazz = generateSoundClothReversibleSvg(moodFor("ジャズ"), 1800000400000, { variantSeed: 7 });
  const soul = generateSoundClothReversibleSvg(moodFor("ソウルミュージック"), 1800000400000, { variantSeed: 7 });

  assert.match(jazz, /data-terra-kind="cymbal-open-rim"/);
  assert.match(jazz, /data-terra-kind="improv-dot-6"/);
  assert.doesNotMatch(jazz, /data-terra-kind="jazz-phrase-/);
  assert.doesNotMatch(jazz, /data-terra-kind="soul-vessel-/);
  assert.match(soul, /data-engine="terra-soul-vessels-v2"/);
  assert.match(soul, /data-terra-kind="soul-vessel-0"/);
  assert.match(soul, /data-terra-kind="soul-response-1"/);
  assert.doesNotMatch(soul, /data-terra-kind="voice-breath-/);
  assert.doesNotMatch(soul, /data-terra-kind="cymbal-open-rim"/);
  assert.doesNotMatch(jazz, /data-terra-kind="score-current"/);
  assert.doesNotMatch(soul, /data-terra-kind="score-current"/);
});

test("trap and latin separate one-sided hat rakes from a three-two clave oval", () => {
  const { generateSoundClothReversibleSvg } = loadPatternApi();
  const moodFor = genre => ({
    id: `trap-latin-${genre}`,
    label: genre,
    audioFileName: `${genre}.wav`,
    audio: {
      inferredGenre: genre,
      genreAnalysis: { method: "two-stage-local-classifier", top: [{ name: genre, score: 99 }] },
      energy: .64,
      rms: .64,
      bass: .72,
      onset: .56,
      rhythm: .7,
      brightness: .54,
      tempo: 116,
      centroid: 2800,
      chroma: Array.from({ length: 12 }, (_, pc) => pc % 4 === 0 ? .78 : .2),
      detail: {
        rms: Array.from({ length: 32 }, (_, i) => .5 + Math.sin(i * .19) * .12),
        bass: Array.from({ length: 32 }, (_, i) => .56 + Math.cos(i * .15) * .11),
        centroid: Array.from({ length: 32 }, (_, i) => .5 + Math.sin(i * .12) * .09),
        onset: Array.from({ length: 32 }, (_, i) => i % 5 === 0 ? .82 : .16),
        waveform: Array.from({ length: 96 }, (_, i) => Math.sin(i * .2) * .62)
      }
    }
  });
  const trap = generateSoundClothReversibleSvg(moodFor("トラップ"), 1800000500000, { variantSeed: 11 });
  const latin = generateSoundClothReversibleSvg(moodFor("ラテン"), 1800000500000, { variantSeed: 11 });

  assert.match(trap, /data-engine="terra-trap-hat-grid-v3"/);
  assert.match(trap, /data-terra-kind="trap-hat-cell-7"/);
  assert.match(trap, /data-terra-kind="trap-808-void"/);
  assert.match(trap, /data-logo-reading="刻む・落とす・空ける"/);
  assert.match(trap, /data-logo-system="rhythm-sequence"/);
  assert.doesNotMatch(trap, /data-terra-kind="clave-hit-/);
  assert.match(latin, /data-terra-kind="clave-hit-4"/);
  assert.match(latin, /data-terra-kind="clave-arc-4"/);
  assert.doesNotMatch(latin, /data-terra-kind="trap-hat-cell-/);
  assert.doesNotMatch(trap, /data-terra-kind="radial-mark"/);
  assert.doesNotMatch(latin, /data-terra-kind="radial-mark"/);
});

test("aerosol renderer varies particle archetypes across classifier genres", () => {
  const { generateSoundClothReversibleSvg } = loadPatternApi();
  const genres = ["アンビエント", "テクノ", "ダブ", "パンク", "ジャズ", "J-POP", "クラシック音楽", "ワールドミュージック"];
  const archetypes = genres.map((genre, index) => {
    const svg = generateSoundClothReversibleSvg({
      id: `archetype-${index}`,
      label: genre,
      audioFileName: `${genre}.wav`,
      variantSalt: index,
      audio: {
        inferredGenre: genre,
        genreAnalysis: {
          method: "two-stage-local-classifier",
          macro: [{ macro: "", score: 94 }],
          top: [{ name: genre, score: 96 }, { name: "電子音楽", score: 62 }]
        },
        energy: 0.42 + index * 0.05,
        rms: 0.42 + index * 0.05,
        bass: 0.35 + (index % 3) * 0.18,
        onset: 0.26 + (index % 4) * 0.13,
        rhythm: 0.36 + (index % 5) * 0.1,
        brightness: 0.22 + (index % 6) * 0.11,
        tempo: 84 + index * 9,
        centroid: 900 + index * 460,
        chroma: Array.from({ length: 12 }, (_, pc) => pc === index % 12 ? 0.88 : 0.22),
        detail: {
          rms: Array.from({ length: 32 }, (_, i) => 0.45 + Math.sin(i * 0.2 + index) * 0.16),
          bass: Array.from({ length: 32 }, (_, i) => 0.42 + Math.cos(i * 0.16 + index) * 0.14),
          centroid: Array.from({ length: 32 }, (_, i) => 0.38 + Math.sin(i * 0.11 + index) * 0.12),
          onset: Array.from({ length: 32 }, (_, i) => i % 8 === 0 ? 0.86 : 0.22),
          waveform: Array.from({ length: 96 }, (_, i) => Math.sin(i * 0.21 + index) * 0.62)
        }
      }
    }, 1800000100000 + index * 917, { variantSeed: index * 31 });
    return svg.match(/data-aerosol-archetype="([^"]+)"/)?.[1] || "";
  });
  assert.ok(new Set(archetypes).size >= 6, `too few archetypes: ${archetypes.join(", ")}`);
  archetypes.forEach(archetype => assert.ok(knownAerosolArchetypes.has(archetype), `unknown aerosol archetype ${archetype}`));
});

test("sparse genre evidence adds a reviewable anime style without forcing a Fine Top1", () => {
  const { applySparseGenreEvidence, sparseGenreEvidenceText } = loadPatternApi();
  const analysis = {
    source: "test",
    method: "test-model",
    needsReview: false,
    macro: [{ macro: "pop", label: "pop", score: 91 }],
    japaneseVocalEvidence: {
      available: true,
      japaneseVocalLikelihood: .88,
      vocalPresence: .72,
      popAudio: { hookScore: .82, brightnessScore: .7 }
    },
    style: [{ style: "city_pop", name: "シティ・ポップ", score: 76 }],
    top: [{ name: "J-POP", score: 93 }, { name: "シティ・ポップ", score: 78 }]
  };
  const enriched = applySparseGenreEvidence(analysis, { energy: .68, bass: .45, onset: .52, rhythm: .66, brightness: .7, highBandRatio: .34, tempo: 148 });
  assert.equal(enriched.top[0].name, "J-POP");
  assert.ok(enriched.style.some(item => item.name === "アニメソング" && item.zeroShotEvidence));
  assert.equal(enriched.inferredStyle, "シティ・ポップ");
  assert.equal(enriched.needsReview, true);
  assert.match(sparseGenreEvidenceText(enriched), /アニメソング傾向/);
});

test("sparse hardcore and trap guards reject generic rock and hip-hop", () => {
  const { sparseGenreEvidence } = loadPatternApi();
  const genericRock = sparseGenreEvidence({
    energy: .74, bass: .54, onset: .42, rhythm: .58, brightness: .4, tempo: 156,
    detail: { rms: [.4, .5, .45, .52], onset: [.2, .42, .3, .4], zeroCrossing: [.08, .1, .09], bandTimeline: [[.2, .2, .2, .25, .18, .15, .08, .06]] }
  }, { macro: [{ macro: "rock", score: 93 }], top: [{ name: "ロック", score: 94 }] });
  assert.equal(genericRock.some(item => item.name === "ハードコア"), false);

  const genericHipHop = sparseGenreEvidence({
    energy: .64, bass: .58, onset: .34, rhythm: .58, brightness: .28, tempo: 92,
    detail: { rms: [.42, .46, .45, .48], onset: [.18, .28, .24, .32], zeroCrossing: [.06, .07], bandTimeline: [[.35, .3, .24, .22, .16, .12, .03, .02]] }
  }, { macro: [{ macro: "black_music", score: 92 }], top: [{ name: "ヒップホップ", score: 96 }] });
  assert.equal(genericHipHop.some(item => item.name === "トラップ"), false);
});

test("harmonic rock evidence suppresses black-music false positives across mid and fast tempos", () => {
  const { highTempoRockFalsePositiveEvidence, applyHighTempoRockCorrection } = loadPatternApi();
  assert.equal(highTempoRockFalsePositiveEvidence({
    tempo: 161, energy: .7523, midBandRatio: .2435, onset: .4455,
    distortion: .2064, guitarBand: .0018, chromaEntropy: .9776,
    zcr: .1187, harmonicRatio: .7722, highBandPulse: .0015, fourOnFloor: .0115
  }), true);
  assert.equal(highTempoRockFalsePositiveEvidence({
    tempo: 150, energy: .78, midBandRatio: .22, onset: .62,
    distortion: .2, guitarBand: .002, chromaEntropy: .62,
    zcr: .27, harmonicRatio: .42, highBandPulse: .58, fourOnFloor: .08
  }), false);
  assert.equal(highTempoRockFalsePositiveEvidence({
    tempo: 129, energy: .8711, rhythm: .6775, midBandRatio: .2415, onset: .4839,
    distortion: .2489, guitarBand: .001, chromaEntropy: .9412,
    zcr: .1343, harmonicRatio: .7703, highBandPulse: .0006, fourOnFloor: 0
  }), true);
  assert.equal(highTempoRockFalsePositiveEvidence({
    tempo: 129, energy: 1, rhythm: .8597, midBandRatio: .4001, onset: .614,
    distortion: .2418, guitarBand: .0034, chromaEntropy: .91,
    zcr: .0716, harmonicRatio: .8098, highBandPulse: .0004, fourOnFloor: .2337,
    sustainRatio: .8683, structureRecurrence: .8322
  }), true);
  assert.equal(highTempoRockFalsePositiveEvidence({
    tempo: 129, energy: .9672, rhythm: .7783, midBandRatio: .3923, onset: .5559,
    distortion: .2316, guitarBand: .0014, chromaEntropy: .8924,
    zcr: .0611, harmonicRatio: .801, highBandPulse: .0002, fourOnFloor: .2124,
    sustainRatio: .8639, structureRecurrence: .7007
  }), true);
  assert.equal(highTempoRockFalsePositiveEvidence({
    tempo: 128, energy: .9, rhythm: .82, midBandRatio: .38, onset: .55,
    distortion: .24, guitarBand: .002, chromaEntropy: .94,
    zcr: .068, harmonicRatio: .8, highBandPulse: .01, fourOnFloor: .62,
    sustainRatio: .84, structureRecurrence: .86
  }), false);
  assert.equal(highTempoRockFalsePositiveEvidence({
    tempo: 96, energy: .84, rhythm: .72, midBandRatio: .37, onset: .46,
    distortion: .23, guitarBand: .002, chromaEntropy: .92,
    zcr: .066, harmonicRatio: .76, highBandPulse: .02, fourOnFloor: .12,
    sustainRatio: .82, structureRecurrence: .78
  }), false);
  const guitarDetail = {
    rms: Array.from({ length: 32 }, (_, i) => .58 + (i % 3) * .12),
    onset: Array.from({ length: 32 }, (_, i) => i % 4 === 0 ? .78 : .32),
    zeroCrossing: Array.from({ length: 32 }, () => .14),
    centroid: Array.from({ length: 32 }, (_, i) => 1000 + (i % 5) * 380),
    bandTimeline: Array.from({ length: 32 }, () => [.66, .62, .57, .28, .34, .32, .15, .1])
  };
  const corrected = applyHighTempoRockCorrection({
    source: "test", method: "local", needsReview: false,
    macro: [{ macro: "black_music", score: 90 }, { macro: "pop", score: 70 }],
    top: [{ name: "ヒップホップ", score: 90, rawScore: 90, acousticScore: 90 }, { name: "トラップ", score: 64, rawScore: 64, acousticScore: 64 }, { name: "J-POP", score: 70, rawScore: 70, acousticScore: 70 }]
  }, {
    tempo: 161, energy: .75, bass: .82, rhythm: .62, onset: .45, brightness: .46,
    lowBandRatio: .64, midBandRatio: .25, highBandRatio: .12, detail: guitarDetail
  });
  assert.equal(corrected.top[0].name, "ロック");
  assert.equal(corrected.macro[0].macro, "rock");
  assert.ok(corrected.top.find(item => item.name === "ヒップホップ").score < 90);
  assert.ok(corrected.top.find(item => item.name === "J-POP").score < 70);
  assert.ok(corrected.macro.find(item => item.macro === "pop").score < 70);
  assert.match(corrected.method, /harmonic-rock-guard/);

  const correctedDnb = applyHighTempoRockCorrection({
    source: "test", method: "local", needsReview: false,
    top: [{ name: "ドラムンベース", score: 111, rawScore: 111, acousticScore: 111 }, { name: "ダブ", score: 78, rawScore: 78, acousticScore: 78 }]
  }, {
    tempo: 161, energy: .75, bass: .82, rhythm: .62, onset: .45, brightness: .46,
    lowBandRatio: .64, midBandRatio: .25, highBandRatio: .12, detail: guitarDetail
  });
  assert.equal(correctedDnb.top[0].name, "ロック");
  assert.ok(correctedDnb.top.find(item => item.name === "ドラムンベース").score < 111);
});

test("embedding inference also applies the harmonic rock false-positive guard", () => {
  const { inferMusicGenres } = loadPatternApi();
  let sampleSeed = 36;
  const sampleRandom = () => ((sampleSeed = (sampleSeed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const inferred = inferMusicGenres({
    tempo: 161,
    energy: .7523,
    bass: .8167,
    onset: .4455,
    lowBandRatio: .6385,
    midBandRatio: .2435,
    zcr: .1187,
    chromaEntropy: .9776,
    harmonicRatio: .7722,
    highBandPulse: .0015,
    fourOnFloor: .0115,
    chroma: Array.from({ length: 12 }, () => .5),
    detail: {
      rms: Array.from({ length: 64 }, () => .6 + sampleRandom() * .2),
      bass: Array.from({ length: 64 }, () => sampleRandom()),
      onset: Array.from({ length: 64 }, () => sampleRandom() * .15),
      zeroCrossing: Array.from({ length: 64 }, () => .1187),
      centroid: Array.from({ length: 64 }, () => 885),
      bandTimeline: Array.from({ length: 32 }, () => [.64, .62, .6, .25, .24, .23, 0, 0])
    },
    embeddingGenrePrediction: {
      method: "test-embedding",
      confidence: 100,
      needsReview: false,
      macro: [{ label: "black_music", score: 100 }, { label: "rock", score: 26 }],
      popStyle: [{ style: "black_music_other", label: "black_music_other", score: 91 }],
      top: [{ name: "ヒップホップ", score: 100 }, { name: "ダブ", score: 58 }, { name: "ロック", score: 21 }]
    }
  });
  assert.equal(inferred.top[0].name, "ロック");
  assert.ok(inferred.top.find(item => item.name === "ヒップホップ").score < 100);
  assert.equal(inferred.inferredStyle, "");
  assert.equal(inferred.style.length, 0);
  assert.match(inferred.method, /harmonic-rock-guard/);
  assert.ok(inferred.confidence < 100);
  assert.equal(inferred.needsReview, true);
});

test("split low-confidence segments rescue mid-tempo post-punk without absorbing nearby grooves", () => {
  const { weakMidTempoHarmonicRockEvidence, applyWeakMidTempoHarmonicRockCorrection } = loadPatternApi();
  const vector = {
    tempo: 99, energy: .6424, bass: .4864,
    lowBandRatio: .3393, midBandRatio: .6218, highBandRatio: .0388,
    brightness: .2782, rhythm: .4778, onset: .3413,
    zcr: .0919, chromaEntropy: .9907, harmonicRatio: .8761,
    distortion: .1858, sustainRatio: .828, transientScarcity: .9603,
    structureRecurrence: .9455, fourOnFloor: .1018,
    breakbeatDensity: .1251, hiphopPunchScore: .4362, funkGrooveScore: .5486
  };
  const features = {
    embeddingGenrePrediction: {
      top: [{ name: "ラテン", score: 3 }, { name: "ボサノヴァ", score: 1.6 }, { name: "フォーク", score: .6 }],
      segmentConsensus: {
        count: 3, voteShare: .333,
        leaders: ["クラシック音楽", "ディスコ", "ダブ"]
      }
    }
  };
  assert.equal(weakMidTempoHarmonicRockEvidence(vector, features), true);

  const corrected = applyWeakMidTempoHarmonicRockCorrection({
    source: "test", method: "shared-production-local-classifier", needsReview: true,
    macro: [{ macro: "world", score: 2 }, { macro: "black_music", score: 2 }],
    top: [
      { name: "ラテン", macro: "world", score: 45, rawScore: 3, acousticScore: 3 },
      { name: "ディスコ", macro: "black_music", score: 12, rawScore: 2, acousticScore: 2 },
      { name: "ソウルミュージック", macro: "black_music", score: 11, rawScore: 1, acousticScore: 1 }
    ]
  }, features, vector);
  assert.equal(corrected.top[0].name, "ロック");
  assert.equal(corrected.needsReview, true);
  assert.ok(corrected.confidence <= 52);
  assert.match(corrected.method, /weakMidTempoHarmonicRock/);
  assert.equal(corrected.inferredStyle, "");

  assert.equal(weakMidTempoHarmonicRockEvidence({ ...vector, fourOnFloor: .62 }, features), false, "real disco keeps its four-on-floor evidence");
  assert.equal(weakMidTempoHarmonicRockEvidence({ ...vector, funkGrooveScore: .78 }, features), false, "strong funk groove is not rewritten");
  assert.equal(weakMidTempoHarmonicRockEvidence({ ...vector, hiphopPunchScore: .72, breakbeatDensity: .4 }, features), false, "hip-hop punch and breaks stay outside the rescue");
  assert.equal(weakMidTempoHarmonicRockEvidence({ ...vector, energy: .5, distortion: .1 }, features), false, "soft acoustic folk stays outside the rescue");
  assert.equal(weakMidTempoHarmonicRockEvidence(vector, {
    embeddingGenrePrediction: {
      top: [{ name: "ディスコ", score: 54 }],
      segmentConsensus: { count: 3, voteShare: .667, leaders: ["ディスコ", "ディスコ", "ファンク"] }
    }
  }), false, "a confident shared model is never overridden");
});

test("ninety-second split consensus rescues harmonic post-punk without absorbing Soul or dance grooves", () => {
  const { weakMidTempoHarmonicRockEvidence, applyWeakMidTempoHarmonicRockCorrection } = loadPatternApi();
  const vector = {
    tempo: 99, energy: .6502, bass: .3935,
    lowBandRatio: .2621, midBandRatio: .7085, highBandRatio: .0295,
    brightness: .2456, rhythm: .4503, onset: .3217,
    zcr: .1112, chromaEntropy: .9724, harmonicRatio: .8831,
    distortion: .1903, sustainRatio: .8238, transientScarcity: 1,
    structureRecurrence: .933, fourOnFloor: .1498,
    breakbeatDensity: .0623, hiphopPunchScore: .4057,
    funkGrooveScore: .4459, vocalPresence: .3717
  };
  const features = {
    analysisWindowSeconds: 90,
    japaneseVocalEvidence: { available: false, reason: "analyzer-not-configured" },
    embeddingGenrePrediction: {
      macro: [{ label: "black_music", score: 15.4 }, { label: "world", score: 8.4 }],
      top: [{ name: "ソウルミュージック", score: 22.3 }, { name: "ディスコ", score: 9.7 }],
      segmentConsensus: {
        count: 3, reliable: false, voteShare: .667, macroVoteShare: .667,
        averageMargin: 1.7,
        leaders: ["ソウルミュージック", "ラテン", "ソウルミュージック"]
      }
    }
  };
  assert.equal(weakMidTempoHarmonicRockEvidence(vector, features), true);

  const corrected = applyWeakMidTempoHarmonicRockCorrection({
    source: "test", method: "shared-production-local-classifier", needsReview: true,
    macro: [{ macro: "black_music", score: 15 }, { macro: "world", score: 8 }],
    top: [
      { name: "ソウルミュージック", macro: "black_music", score: 36, rawScore: 22, acousticScore: 22 },
      { name: "ディスコ", macro: "black_music", score: 16, rawScore: 10, acousticScore: 10 },
      { name: "ヒップホップ", macro: "black_music", score: 8, rawScore: 5, acousticScore: 5 }
    ]
  }, features, vector);
  assert.equal(corrected.top[0].name, "ロック");
  assert.equal(corrected.needsReview, true);
  assert.ok(corrected.confidence <= 52);

  assert.equal(weakMidTempoHarmonicRockEvidence(vector, {
    ...features,
    japaneseVocalEvidence: {
      available: true, sampleCount: 3, vocalPresence: .82,
      stemVocalPresence: .78, vocalEnergyRatio: .7
    }
  }), false, "measured lead-vocal Soul is not rewritten");
  assert.equal(weakMidTempoHarmonicRockEvidence(vector, {
    ...features,
    embeddingGenrePrediction: {
      ...features.embeddingGenrePrediction,
      macro: [{ label: "black_music", score: 48 }]
    }
  }), false, "strong learned Black-music macro remains authoritative");
  assert.equal(weakMidTempoHarmonicRockEvidence({ ...vector, fourOnFloor: .52 }, features), false, "four-on-floor Disco stays outside the rescue");
  assert.equal(weakMidTempoHarmonicRockEvidence({ ...vector, funkGrooveScore: .76 }, features), false, "strong Funk groove stays outside the rescue");
  assert.equal(weakMidTempoHarmonicRockEvidence({ ...vector, bass: .68, lowBandRatio: .55 }, features), false, "bass-led Hip-hop and Soul stay outside the rescue");
});

test("high-tempo rap breakbeats reject harmonic Rock and Funk rescues without absorbing DnB", () => {
  const { highTempoRapBreakbeatEvidence, highTempoRockFalsePositiveEvidence } = loadPatternApi();
  const rapBreakbeat = {
    tempo: 185, energy: .688, bass: .901, lowBandRatio: .72,
    midBandRatio: .236, highBandRatio: .044, brightness: .293,
    rhythm: .532, onset: .38, syncopation: .84,
    breakbeatDensity: .44, breakbeatIrregularity: .773,
    dnbBreakbeatScore: .897, hiphopPunchScore: .626,
    highBandPulse: .00004, fourOnFloor: .124, kickGrid: .162,
    guitarBand: .00016, distortion: .174, funkGrooveScore: .574,
    chromaEntropy: .924, zcr: .077, harmonicRatio: .787
  };
  assert.equal(highTempoRapBreakbeatEvidence(rapBreakbeat), true);
  assert.equal(highTempoRockFalsePositiveEvidence(rapBreakbeat), false);
  assert.equal(highTempoRapBreakbeatEvidence({
    ...rapBreakbeat, rhythm: .82, onset: .61, highBandRatio: .24,
    brightness: .62, highBandPulse: .31
  }), false);
  assert.equal(highTempoRapBreakbeatEvidence({
    ...rapBreakbeat, guitarBand: .026, distortion: .31, bass: .64, lowBandRatio: .48
  }), false);
});

test("genre confidence uses score share and model-rule agreement instead of forcing Top1 to 100", () => {
  const { calibratedGenreAnalysis } = loadPatternApi();
  const calibrated = calibratedGenreAnalysis({
    source: "test",
    method: "two-stage-local-classifier",
    confidence: 100,
    supportedGenreCount: 8,
    needsReview: false,
    top: [
      { name: "ヒップホップ", macro: "black_music", score: 100, scoreShare: 24 },
      { name: "ダブ", macro: "black_music", score: 92, scoreShare: 22 }
    ]
  }, {
    macro: [{ macro: "rock", score: 76 }]
  });
  assert.ok(calibrated.top[0].score < 60);
  assert.equal(calibrated.confidence, calibrated.top[0].score);
  assert.equal(calibrated.modelRuleMacroAgreement, false);
  assert.equal(calibrated.needsReview, true);
});

test("strong calibrated Fine agreement can clear a coarse macro disagreement", () => {
  const { calibratedGenreAnalysis } = loadPatternApi();
  const analysis = {
    source: "test",
    method: "shared-production-local-classifier",
    confidence: 100,
    needsReview: true,
    supportedGenreCount: 32,
    macro: [{ macro: "black_music", score: 100 }],
    blackMusicFine: [
      { label: "ファンク", score: 86.5, support: 92, calibrated: true, needsReview: false },
      { label: "ディスコ", score: 25.2, support: 90, calibrated: true, needsReview: false }
    ],
    top: [
      { name: "ファンク", macro: "black_music", score: 100, scoreShare: 62 },
      { name: "ディスコ", macro: "black_music", score: 25, scoreShare: 16 }
    ]
  };
  const independentRules = { macro: [{ macro: "pop", score: 78 }] };
  const calibrated = calibratedGenreAnalysis(analysis, independentRules);
  assert.equal(calibrated.top[0].name, "ファンク");
  assert.equal(calibrated.needsReview, false);
  assert.ok(calibrated.confidence >= 82);
  assert.equal(calibrated.specialistFineAgreement.label, "ファンク");

  const conflict = calibratedGenreAnalysis({
    ...analysis,
    blackMusicFine: [
      { label: "ディスコ", score: 90, support: 90, calibrated: true, needsReview: false },
      { label: "ファンク", score: 30, support: 92, calibrated: true, needsReview: false }
    ]
  }, independentRules);
  assert.equal(conflict.needsReview, true);
  assert.equal(conflict.specialistFineAgreement, null);
});

test("stable unknown-source segment agreement clears a stale macro-rule conflict", () => {
  const { calibratedGenreAnalysis } = loadPatternApi();
  const calibrated = calibratedGenreAnalysis({
    source: "test",
    method: "shared-production-local-classifier",
    confidence: 100,
    needsReview: true,
    unknownSourceConsensus: {
      reliable: true,
      agreement: true,
      conflict: false,
      segmentAgreement: 1,
      stability: .983,
      estimatedAccuracy: 70.2
    },
    segmentConsensus: { agreement: true, conflict: false },
    top: [
      { name: "ロック", macro: "rock", score: 100 },
      { name: "メタル", macro: "rock", score: 62 },
      { name: "ディスコ", macro: "black_music", score: 51 }
    ]
  }, {
    macro: [{ macro: "black_music", score: 95 }]
  });
  assert.equal(calibrated.top[0].name, "ロック");
  assert.equal(calibrated.needsReview, false);
  assert.ok(calibrated.confidence >= 70 && calibrated.confidence <= 84);
});

test("external unanimous segments can resolve a matching two-of-three local leader", () => {
  const { applyLocalSegmentConsensus } = loadPatternApi();
  const analysis = applyLocalSegmentConsensus({
    needsReview: false,
    top: [
      { name: "ロック", macro: "rock", score: 100 },
      { name: "メタル", macro: "rock", score: 62 }
    ]
  }, {
    macro: [{ macro: "black_music", score: 95 }]
  }, {
    embeddingGenrePrediction: {
      segmentConsensus: {
        available: true,
        count: 3,
        leader: "ロック",
        voteShare: .667,
        averageMargin: 49.9,
        macroLeader: "rock",
        macroVoteShare: .667,
        reliable: false,
        unanimous: false
      },
      unknownSourceConsensus: {
        top: [{ label: "ロック", score: 78.4 }],
        needsReview: false,
        selectiveCertainty: .769,
        margin: 73.1,
        selectiveRisk: { threshold: .0661 },
        segmentAnalysis: { agreement: 1, stability: .983 }
      }
    }
  });
  assert.equal(analysis.segmentConsensus.externalSegmentAgreement, true);
  assert.equal(analysis.segmentConsensus.conflict, false);
  assert.equal(analysis.needsReview, false);
});

test("two-of-three segment evidence rescues double-time rap without absorbing disco", () => {
  const { sameMacroRapMajorityEvidence, calibratedGenreAnalysis } = loadPatternApi();
  const context = {
    leaderName: "ディスコ",
    targetName: "ヒップホップ",
    leaderMacro: "black_music",
    targetMacro: "black_music",
    segments: {
      available: true,
      count: 3,
      voteShare: .667,
      averageMargin: 31.3,
      macroLeader: "black_music",
      macroVoteShare: .667
    },
    features: {
      japaneseVocalEvidence: {
        available: true,
        sampleCount: 16,
        transcriptionReliability: 1,
        detectedLanguage: "en",
        transcriptTokenRate: 2.04,
        melodicVocalLikelihood: .53
      }
    },
    vector: {
      tempo: 144,
      energy: .876,
      bass: .773,
      lowBandRatio: .597,
      highBandRatio: .087,
      rhythm: .706,
      onset: .504,
      fourOnFloor: .22,
      syncopation: .025,
      hiphopPunchScore: .462,
      structureRecurrence: .758,
      guitarBand: .0012
    }
  };
  assert.equal(sameMacroRapMajorityEvidence(context), true);
  assert.equal(sameMacroRapMajorityEvidence({
    ...context,
    vector: { ...context.vector, fourOnFloor: .72, syncopation: .64 }
  }), false);
  assert.equal(sameMacroRapMajorityEvidence({
    ...context,
    features: { japaneseVocalEvidence: { ...context.features.japaneseVocalEvidence, transcriptTokenRate: .7 } }
  }), false);

  const calibrated = calibratedGenreAnalysis({
    source: "test",
    method: "shared-production-local-classifier+sameMacroRapSegmentMajority",
    confidence: 88,
    needsReview: false,
    audioCorrectionApplied: true,
    segmentConsensus: {
      rescued: true,
      sameMacroRapMajority: true,
      conflict: false,
      voteShare: .667,
      averageMargin: 31.3
    },
    top: [
      { name: "ヒップホップ", macro: "black_music", score: 101 },
      { name: "ディスコ", macro: "black_music", score: 52 }
    ]
  }, { macro: [{ macro: "electronic", score: 91 }] });
  assert.equal(calibrated.top[0].name, "ヒップホップ");
  assert.equal(calibrated.needsReview, false);
  assert.ok(calibrated.confidence >= 68);
});

test("unanimous electronic segments resolve a half-tempo house alias without absorbing real trap", () => {
  const {
    halfTempoHouseConsensusEvidence,
    promoteAudioGenreCandidate,
    applyUnknownSourceConsensus,
    calibratedGenreAnalysis
  } = loadPatternApi();
  const vector = {
    tempo: 89,
    energy: .892,
    bass: .896,
    lowBandRatio: .715,
    highBandRatio: .045,
    rhythm: .963,
    onset: .688,
    brightness: .297,
    structureRecurrence: .801,
    harmonicRatio: .783,
    guitarBand: .0003,
    distortion: .228
  };
  const external = {
    top: [
      { label: "テクノ", score: 27.8 },
      { label: "ドラムンベース", score: 17.2 },
      { label: "ハウス", score: 5.8 }
    ],
    macro: [
      { label: "electronic", score: 53.1 },
      { label: "black_music", score: 44.6 }
    ],
    needsReview: false,
    margin: 10.6,
    selectiveCertainty: .2301,
    selectiveRisk: { threshold: .0771, accepted: true, estimatedAccuracy: 70 },
    segmentAnalysis: {
      agreement: 1,
      stability: .951,
      topLabels: ["テクノ", "テクノ", "テクノ"]
    },
    japaneseVocalEvidence: { popAudio: { tempo: 126.6 } }
  };
  const features = {
    japaneseVocalEvidence: {
      available: true,
      sampleCount: 1,
      vocalPresence: .02,
      stemVocalPresence: 0,
      speechRapLikelihood: .007,
      transcriptionReliability: .08,
      singleSpanHallucination: true
    },
    embeddingGenrePrediction: { unknownSourceConsensus: external }
  };
  const analysis = {
    source: "test",
    method: "embedding",
    confidence: 67,
    needsReview: true,
    segmentConsensus: { count: 3, conflict: true },
    macro: [{ macro: "black_music", score: 100 }],
    top: [
      { name: "ヒップホップ", macro: "black_music", score: 67 },
      { name: "トラップ", macro: "black_music", score: 66 }
    ]
  };
  const evidence = halfTempoHouseConsensusEvidence({ analysis, features, vector });
  assert.ok(evidence);
  assert.equal(evidence.externalTempo, 126.6);
  assert.equal(halfTempoHouseConsensusEvidence({
    analysis,
    features: {
      ...features,
      japaneseVocalEvidence: {
        ...features.japaneseVocalEvidence,
        sampleCount: 12,
        vocalPresence: .65,
        speechRapLikelihood: .7,
        singleSpanHallucination: false
      }
    },
    vector
  }), null);
  assert.equal(halfTempoHouseConsensusEvidence({
    analysis,
    features: {
      ...features,
      embeddingGenrePrediction: {
        unknownSourceConsensus: {
          ...external,
          top: external.top.map(item => item.label === "ハウス" ? { ...item, score: 2 } : item)
        }
      }
    },
    vector
  }), null);

  const promoted = promoteAudioGenreCandidate(analysis, {
    targetName: "ハウス",
    targetMacro: "electronic",
    suppressMacros: ["black_music"],
    factor: .34,
    method: "halfTempoHouseElectronicConsensus",
    needsReview: false,
    evidence
  });
  promoted.segmentConsensus = { ...promoted.segmentConsensus, conflict: false, electronicAliasResolved: true };
  const reconciled = applyUnknownSourceConsensus(promoted, {
    macro: [{ macro: "black_music", score: 78 }]
  }, features);
  const calibrated = calibratedGenreAnalysis(reconciled, {
    macro: [{ macro: "black_music", score: 78 }]
  });
  assert.equal(calibrated.top[0].name, "ハウス");
  assert.equal(calibrated.unknownSourceConsensus.electronicFamilyAgreement, true);
  assert.equal(calibrated.needsReview, false);
});

test("confidence calibration keeps inferred genre aligned with the displayed Top1", () => {
  const { calibratedGenreAnalysis } = loadPatternApi();
  const calibrated = calibratedGenreAnalysis({
    inferredGenre: "オペラ",
    method: "embedding+operatic-vocal-rescue",
    confidence: 86,
    needsReview: false,
    top: [
      { name: "クラシック音楽", macro: "classical", score: 86 },
      { name: "オペラ", macro: "classical", score: 85 }
    ]
  });
  assert.equal(calibrated.top[0].name, "クラシック音楽");
  assert.equal(calibrated.inferredGenre, "クラシック音楽");
});

test("genre display and visual blend never inflate secondary candidates", () => {
  const { genreDisplayText, genreVisualWeight } = loadPatternApi();
  const top = [
    { name: "J-POP", score: 76, rawScore: 100 },
    { name: "ダブ", score: 30, rawScore: 40 },
    { name: "ディスコ", score: 25, rawScore: 37 }
  ];
  assert.equal(genreDisplayText({ top }, 3), "J-POP 76% / ダブ 30% / ディスコ 25%");
  assert.equal(genreVisualWeight(top[1], 1, top), 30);
  assert.equal(genreVisualWeight(top[2], 2, top), 25);
});

test("instrumental classical evidence suppresses opera without affecting sung opera", () => {
  const { applyVocalDependentGenreCorrection } = loadPatternApi();
  const analysis = {
    method: "test-classifier",
    confidence: 100,
    needsReview: false,
    top: [
      { name: "クラシック音楽", score: 100, rawScore: 100, acousticScore: 100 },
      { name: "オペラ", score: 67.4, rawScore: 67.4, acousticScore: 67.4 }
    ]
  };
  const instrumental = applyVocalDependentGenreCorrection(analysis, {
    japaneseVocalEvidence: { available: true, vocalPresence: 0 }
  });
  assert.equal(instrumental.top[0].name, "クラシック音楽");
  assert.ok(instrumental.top[1].score < 12);
  assert.equal(instrumental.vocalGenreGuard.applied, true);

  const sung = applyVocalDependentGenreCorrection(analysis, {
    japaneseVocalEvidence: { available: true, vocalPresence: .72 }
  });
  assert.equal(sung.top[1].score, 67.4);
  assert.equal(sung.vocalGenreGuard, undefined);

  const serverGuarded = applyVocalDependentGenreCorrection({
    ...analysis,
    top: [analysis.top[0], { ...analysis.top[1], score: 10.8 }],
    vocalGenreGuard: { applied: true, vocalPresence: 0 }
  }, {
    japaneseVocalEvidence: { available: true, vocalPresence: 0 }
  });
  assert.equal(serverGuarded.top[1].score, 10.8);
});

test("sustained operatic solo rescues opera without promoting ordinary folk vocals", () => {
  const { operaticVocalEvidence, applyOperaticVocalCorrection } = loadPatternApi();
  const folkPrediction = {
    method: "test-classifier",
    confidence: 100,
    needsReview: false,
    macro: [{ macro: "world", score: 100 }],
    top: [
      { name: "フォーク", score: 100, rawScore: 100, acousticScore: 100, macro: "world" },
      { name: "ラテン", score: 19.1, rawScore: 19.1, acousticScore: 19.1, macro: "world" }
    ]
  };
  const operatic = {
    tempo: 185, energy: .782, rms: .782, rhythm: .35, onset: .25, brightness: .436,
    lowBandRatio: .031, midBandRatio: .864, highBandRatio: .105,
    sustainRatio: .88, reverbTail: .72, acousticness: .68, structureRecurrence: .32,
    japaneseVocalEvidence: { available: true, vocalPresence: 1 }
  };
  assert.ok(operaticVocalEvidence(operatic) >= .82);
  const rescued = applyOperaticVocalCorrection(folkPrediction, operatic);
  assert.equal(rescued.top[0].name, "オペラ");
  assert.ok(rescued.top.find(item => item.name === "フォーク").score < 40);
  assert.equal(rescued.macro[0].macro, "classical");

  const ordinaryFolk = {
    ...operatic,
    rhythm: .58,
    lowBandRatio: .24,
    midBandRatio: .56
  };
  assert.equal(operaticVocalEvidence(ordinaryFolk), 0);
  assert.equal(applyOperaticVocalCorrection(folkPrediction, ordinaryFolk).top[0].name, "フォーク");

  const quietRecital = {
    tempo: 108, energy: .4832, rms: .4832, rhythm: .2267, onset: .1619, brightness: .2959,
    lowBandRatio: .0684, midBandRatio: .887, highBandRatio: .0445,
    sustainRatio: .864, reverbTail: .6784, acousticness: .6406, structureRecurrence: .2268,
    japaneseVocalEvidence: { available: true, vocalPresence: 1 }
  };
  assert.ok(operaticVocalEvidence(quietRecital) >= .82);
  assert.equal(applyOperaticVocalCorrection(folkPrediction, quietRecital).top[0].name, "オペラ");
});

test("classic roots dub ignores sparse echoed vocal fragments without absorbing vocal bass music", () => {
  const { applyReggaeDubBoundaryCorrection } = loadPatternApi();
  const prediction = {
    source: "test",
    method: "shared-production-local-classifier",
    macro: [{ macro: "electronic", score: 100 }, { macro: "black_music", score: 11 }],
    top: [
      { name: "ダブステップ", macro: "electronic", score: 100, rawScore: 100, acousticScore: 100 },
      { name: "ドラムンベース", macro: "electronic", score: 67, rawScore: 67, acousticScore: 67 },
      { name: "ダブ", macro: "black_music", score: 13, rawScore: 13, acousticScore: 13 }
    ]
  };
  const rootsDub = {
    tempo: 92, energy: .473, bass: .4, rhythm: .2, onset: .143,
    sustainRatio: .918, reverbTail: .917,
    japaneseVocalEvidence: {
      available: true, vocalPresence: .458, stemVocalPresence: .026,
      vocalEnergyRatio: .091, detectedLanguage: "en", sampleCount: 6
    }
  };
  const rescued = applyReggaeDubBoundaryCorrection(prediction, rootsDub);
  assert.equal(rescued.top[0].name, "ダブ");
  assert.match(rescued.method, /reggaeDub/);

  const sustainedVocal = applyReggaeDubBoundaryCorrection(prediction, {
    ...rootsDub,
    japaneseVocalEvidence: {
      ...rootsDub.japaneseVocalEvidence,
      stemVocalPresence: .5,
      vocalEnergyRatio: .3
    }
  });
  assert.equal(sustainedVocal.top[0].name, "ダブステップ");

  const denseBassMusic = applyReggaeDubBoundaryCorrection(prediction, {
    ...rootsDub,
    rhythm: .62,
    onset: .55
  });
  assert.equal(denseBassMusic.top[0].name, "ダブステップ");

  const noDubCandidate = applyReggaeDubBoundaryCorrection({
    ...prediction,
    top: prediction.top.filter(item => item.name !== "ダブ")
  }, rootsDub);
  assert.equal(noDubCandidate.top[0].name, "ダブステップ");
});

test("Japanese vocal gate separates rhythmic rap from melodic J-POP without rewriting folk", () => {
  const { applyJapaneseVocalGenreCorrection } = loadPatternApi();
  const rockPrediction = {
    source: "test",
    method: "test-classifier",
    macro: [{ macro: "rock", score: 100 }, { macro: "black_music", score: 30 }, { macro: "pop", score: 22 }],
    top: [{ name: "ロック", macro: "rock", score: 100 }, { name: "パンク", macro: "rock", score: 55 }]
  };
  const rap = applyJapaneseVocalGenreCorrection(rockPrediction, {
    tempo: 117, energy: 1, bass: .68, lowBandRatio: .51, midBandRatio: .39, highBandRatio: .1,
    rhythm: 1, onset: .88, brightness: .43,
    japaneseVocalEvidence: { available: true, vocalPresence: 1, japaneseVocalLikelihood: .72 }
  });
  assert.equal(rap.top[0].name, "ヒップホップ");

  const melodic = applyJapaneseVocalGenreCorrection(rockPrediction, {
    tempo: 185, energy: .99, bass: .27, lowBandRatio: .16, midBandRatio: .74, highBandRatio: .1,
    rhythm: .51, onset: .36, brightness: .42,
    japaneseVocalEvidence: { available: true, vocalPresence: 1, japaneseVocalLikelihood: .98 }
  });
  assert.equal(melodic.top[0].name, "J-POP");
  assert.equal(melodic.inferredStyle, "アニメソング");

  const folkPrediction = {
    source: "test",
    method: "test-classifier",
    macro: [{ macro: "world", score: 100 }, { macro: "classical", score: 38 }],
    top: [{ name: "フォーク", macro: "world", score: 100 }]
  };
  const folk = applyJapaneseVocalGenreCorrection(folkPrediction, {
    tempo: 92, energy: .48, bass: .28, rhythm: .35, onset: .24, brightness: .32,
    japaneseVocalEvidence: { available: true, vocalPresence: .9, japaneseVocalLikelihood: .94 }
  });
  assert.equal(folk.top[0].name, "フォーク");
  assert.equal(folk.japaneseVocalCorrection, undefined);
});

test("cross-classifier classical rescue requires theory and audio agreement", () => {
  const { applyCrossClassifierBoundaryCorrections, darkOrchestralClassicalEvidence } = loadPatternApi();
  const classical = applyCrossClassifierBoundaryCorrections({
    source: "test",
    method: "shared-production-local-classifier",
    macro: [{ macro: "black_music", score: 100 }],
    top: [{ name: "ブルース", macro: "black_music", score: 100 }, { name: "ソウルミュージック", macro: "black_music", score: 52 }]
  }, {
    macro: [{ macro: "ambient", score: 82 }, { macro: "classical", score: 68 }],
    top: [{ name: "ダブ", score: 96 }, { name: "ブルース", score: 94 }]
  }, {
    tempo: 158, energy: .54, bass: .72, lowBandRatio: .58, midBandRatio: .41, highBandRatio: .01,
    rhythm: .3, onset: .22, brightness: .08,
    japaneseVocalEvidence: { available: true, vocalPresence: .06 },
    detail: {
      rms: Array.from({ length: 64 }, (_, index) => .44 + Math.sin(index * .12) * .04),
      onset: Array.from({ length: 64 }, (_, index) => index % 11 === 0 ? .24 : .03),
      bass: Array.from({ length: 64 }, () => .7),
      zeroCrossing: Array.from({ length: 64 }, () => .025),
      centroid: Array.from({ length: 64 }, () => .08),
      bandTimeline: Array.from({ length: 32 }, () => [.9, .76, .55, .12, .002, .001, 0, 0])
    }
  });
  assert.equal(classical.top[0].name, "クラシック音楽");

  const darkOrchestralVector = {
    tempo: 136, energy: .387, bass: .59, lowBandRatio: .429, midBandRatio: .557, highBandRatio: .014,
    rhythm: .109, onset: .078, brightness: .176, acousticness: .531, harmonicRatio: .873,
    percussiveRatio: .065, guitarBand: .0005, distortion: .116, sustainRatio: .862,
    reverbTail: .863, structureRecurrence: .41
  };
  const darkOrchestralContext = {
    leader: "ブルース", vocalAvailable: true, vocalSampleCount: 0,
    vocalPresence: .289, stemVocalPresence: .289, vocalEnergyRatio: .202,
    classicalModelScore: .239, classicalRuleScore: .69
  };
  assert.equal(darkOrchestralClassicalEvidence(darkOrchestralVector, darkOrchestralContext), true);
  assert.equal(darkOrchestralClassicalEvidence(darkOrchestralVector, {
    ...darkOrchestralContext,
    vocalSampleCount: 1,
    stemVocalPresence: .19,
    vocalEnergyRatio: .159,
    calibratedTranscriptionVocalPresence: .07,
    transcriptionReliability: .08,
    singleSpanHallucination: true
  }), true);
  assert.equal(darkOrchestralClassicalEvidence(darkOrchestralVector, {
    ...darkOrchestralContext,
    vocalSampleCount: 3,
    stemVocalPresence: .21,
    vocalEnergyRatio: .18,
    calibratedTranscriptionVocalPresence: .19,
    transcriptionReliability: .54
  }), true);
  assert.equal(darkOrchestralClassicalEvidence(darkOrchestralVector, {
    ...darkOrchestralContext,
    vocalSampleCount: 1,
    stemVocalPresence: .19,
    vocalEnergyRatio: .159,
    calibratedTranscriptionVocalPresence: .21,
    transcriptionReliability: .82
  }), false);
  assert.equal(darkOrchestralClassicalEvidence(darkOrchestralVector, {
    ...darkOrchestralContext,
    vocalSampleCount: 2,
    stemVocalPresence: .19,
    vocalEnergyRatio: .159,
    calibratedTranscriptionVocalPresence: .21,
    transcriptionReliability: .82
  }), false);
  assert.equal(darkOrchestralClassicalEvidence(darkOrchestralVector, {
    ...darkOrchestralContext,
    vocalSampleCount: 3,
    stemVocalPresence: .3,
    vocalEnergyRatio: .24,
    calibratedTranscriptionVocalPresence: .19,
    transcriptionReliability: .54
  }), false);
  assert.equal(darkOrchestralClassicalEvidence(darkOrchestralVector, { ...darkOrchestralContext, vocalSampleCount: 4, vocalPresence: .8 }), false);
  assert.equal(darkOrchestralClassicalEvidence(darkOrchestralVector, { ...darkOrchestralContext, classicalModelScore: .08 }), false);
  assert.equal(darkOrchestralClassicalEvidence({ ...darkOrchestralVector, rhythm: .4, percussiveRatio: .3 }, darkOrchestralContext), false);
});

test("unknown-source arbitration requires independent evidence before cross-macro overrides", () => {
  const {
    applyCrossClassifierBoundaryCorrections,
    applyUnknownSourceGeneralizationCorrections
  } = loadPatternApi();
  const fine = entries => entries.map(([label, score]) => ({ label, name: label, score }));
  const macro = entries => entries.map(([label, score]) => ({ label, macro: label, score }));

  const jpop = {
    source: "test", method: "japanese-pop-calibration",
    macro: macro([["pop", 100], ["rock", 70]]),
    top: fine([["J-POP", 82], ["ロック", 62], ["メタル", 24]])
  };
  const melodicJapanese = {
    tempo: 154, energy: .88, distortion: .24, brightness: .58, highNoiseRatio: .2,
    japaneseVocalEvidence: {
      available: true, detectedLanguage: "ja", vocalPresence: 1,
      japaneseVocalLikelihood: .99, melodicVocalLikelihood: .82, speechRapLikelihood: .04
    },
    embeddingGenrePrediction: {
      macro: macro([["rock", 100], ["pop", 8]]),
      top: fine([["ロック", 100], ["メタル", 32], ["J-POP", 10]])
    }
  };
  const rockRules = { macro: macro([["rock", 100]]), top: fine([["ロック", 100], ["メタル", 52]]) };
  const protectedJpop = applyUnknownSourceGeneralizationCorrections(jpop, rockRules, melodicJapanese);
  assert.equal(protectedJpop.top[0].name, "J-POP");

  const strongMetal = applyUnknownSourceGeneralizationCorrections(jpop, {
    macro: macro([["rock", 100]]), top: fine([["メタル", 100], ["ロック", 70]])
  }, {
    ...melodicJapanese,
    highBandRatio: .28,
    detail: {
      zeroCrossing: Array.from({ length: 64 }, () => .48),
      bandTimeline: Array.from({ length: 32 }, () => [.22, .25, .32, .48, .62, .74, .7, .58])
    },
    embeddingGenrePrediction: {
      ...melodicJapanese.embeddingGenrePrediction,
      top: fine([["ロック", 100], ["メタル", 72], ["J-POP", 8]])
    }
  });
  assert.equal(strongMetal.top[0].name, "メタル");

  const soul = {
    source: "test", method: "black-music-specialist",
    macro: macro([["black_music", 100], ["rock", 80]]),
    top: fine([["ソウルミュージック", 75], ["ロック", 70]])
  };
  const rockBiasedEmbedding = {
    macro: macro([["rock", 100], ["black_music", 42]]),
    top: fine([["ロック", 100], ["ソウルミュージック", 56]]),
    blackMusicFine: fine([["ソウルミュージック", 75], ["ファンク", 18]])
  };
  const protectedSoul = applyUnknownSourceGeneralizationCorrections(soul, rockRules, {
    tempo: 94, energy: .62, rhythm: .42, onset: .3, distortion: .16,
    japaneseVocalEvidence: { available: true, detectedLanguage: "en", vocalPresence: .95, melodicVocalLikelihood: .8 },
    embeddingGenrePrediction: rockBiasedEmbedding
  });
  assert.equal(protectedSoul.top[0].name, "ソウルミュージック");

  const weakSpecialistSoul = applyUnknownSourceGeneralizationCorrections(soul, rockRules, {
    tempo: 112, energy: .75, rhythm: .58, onset: .42, distortion: .24,
    japaneseVocalEvidence: { available: true, detectedLanguage: "en", vocalPresence: .7 },
    embeddingGenrePrediction: {
      ...rockBiasedEmbedding,
      blackMusicFine: fine([["ソウルミュージック", 48], ["ファンク", 32]])
    }
  });
  assert.equal(weakSpecialistSoul.top[0].name, "ロック");

  const japaneseRap = applyUnknownSourceGeneralizationCorrections({
    source: "test", method: "japanese-vocal-genre-gate",
    macro: macro([["black_music", 100], ["pop", 44]]),
    top: fine([["ヒップホップ", 82], ["J-POP", 52], ["ロック", 42]])
  }, {
    macro: macro([["black_music", 80], ["electronic", 79]]),
    top: fine([["ファンク", 100], ["ドラムンベース", 98], ["ヒップホップ", 94]])
  }, {
    tempo: 117, energy: 1, bass: .68, lowBandRatio: .51, midBandRatio: .39,
    highBandRatio: .1, rhythm: 1, onset: .88, structureRecurrence: .56,
    japaneseVocalEvidence: {
      available: true, detectedLanguage: "ja", vocalPresence: 1, stemVocalPresence: .81,
      japaneseVocalLikelihood: .77, melodicVocalLikelihood: .67, speechRapLikelihood: .07
    },
    embeddingGenrePrediction: {
      macro: macro([["rock", 100], ["pop", 22], ["black_music", 39]]),
      top: fine([["ロック", 100], ["ヒップホップ", 43], ["J-POP", 10]])
    }
  });
  assert.equal(japaneseRap.top[0].name, "ヒップホップ");

  const slowSoul = applyCrossClassifierBoundaryCorrections({
    source: "test", method: "embedding",
    macro: macro([["rock", 100], ["black_music", 65]]),
    top: fine([["ロック", 100], ["ソウルミュージック", 56], ["ファンク", 52]])
  }, {
    macro: macro([["black_music", 69]]),
    top: fine([["ダブ", 95], ["ソウルミュージック", 92], ["レゲエ", 91]])
  }, {
    tempo: 81, energy: .56, bass: .77, lowBandRatio: .59, midBandRatio: .2,
    highBandRatio: .2, rhythm: .4, onset: .28, structureRecurrence: .79,
    sustainRatio: .88, distortion: .17,
    japaneseVocalEvidence: {
      available: true, detectedLanguage: "en", vocalPresence: .93, stemVocalPresence: .93,
      melodicVocalLikelihood: .72, speechRapLikelihood: .06
    },
    embeddingGenrePrediction: {
      macro: macro([["rock", 100], ["black_music", 65]]),
      top: fine([["ロック", 100], ["ソウルミュージック", 56]]),
      blackMusicFine: fine([["ソウルミュージック", 75], ["ファンク", 38]])
    }
  });
  assert.equal(slowSoul.top[0].name, "ソウルミュージック");

  const rootsReggae = applyCrossClassifierBoundaryCorrections({
    source: "test", method: "embedding",
    macro: macro([["rock", 100], ["black_music", 61]]),
    top: fine([["ロック", 100], ["ブルース", 38], ["ダブ", 17]])
  }, {
    macro: macro([["black_music", 67], ["pop", 69]]),
    top: fine([["ソウルミュージック", 97], ["ブルース", 97], ["ダブ", 97], ["レゲエ", 91]])
  }, {
    tempo: 144, energy: .63, bass: .73, lowBandRatio: .56, midBandRatio: .39,
    highBandRatio: .05, rhythm: .4, onset: .28, structureRecurrence: .94,
    sustainRatio: .93, distortion: .17,
    japaneseVocalEvidence: { available: true, detectedLanguage: "en", vocalPresence: 1, stemVocalPresence: 1 },
    embeddingGenrePrediction: {
      macro: macro([["rock", 100], ["black_music", 61]]),
      top: fine([["ロック", 100], ["ブルース", 38], ["ダブ", 17]]),
      blackMusicFine: fine([["ブルース", 91], ["ディスコ", 17]])
    }
  });
  assert.equal(rootsReggae.top[0].name, "レゲエ");

  const rock = {
    source: "test", method: "embedding",
    macro: macro([["rock", 100], ["electronic", 56]]),
    top: fine([["ロック", 100], ["ダブステップ", 30], ["テクノ", 28]])
  };
  const bassElectronic = {
    tempo: 136, energy: .92, bass: .88, lowBandRatio: .7, rhythm: .7, onset: .52,
    reverbTail: .86, distortion: .28, structureRecurrence: .68, fourOnFloor: .2,
    guitarBand: .03,
    japaneseVocalEvidence: { available: true, vocalPresence: 0, stemVocalPresence: 0 },
    embeddingGenrePrediction: {
      macro: macro([["electronic", 82], ["rock", 70]]),
      top: fine([["ロック", 100], ["ダブステップ", 31], ["テクノ", 29]])
    }
  };
  const technoBoundary = applyCrossClassifierBoundaryCorrections(rock, {
    macro: macro([["electronic", 100]]), top: fine([["テクノ", 100], ["ダブステップ", 42]])
  }, bassElectronic);
  assert.notEqual(technoBoundary.top[0].name, "ダブステップ");

  const dubstepBoundary = applyCrossClassifierBoundaryCorrections(rock, {
    macro: macro([["electronic", 100]]), top: fine([["ダブステップ", 100], ["テクノ", 42]])
  }, bassElectronic);
  assert.ok(["ダブステップ", "トランス", "ドラムンベース"].includes(dubstepBoundary.top[0].name));
});

test("modal chamber jazz escapes ambient without rewriting sustained classical or ambient", () => {
  const { modalChamberJazzEvidence } = loadPatternApi();
  const modalJazz = {
    tempo: 144, energy: .3634, acousticness: .6501, midBandRatio: .903,
    rhythm: .127, onset: .0907, sustainRatio: .8392, reverbTail: .8978,
    structureRecurrence: .2857, distortion: .1517
  };
  assert.equal(modalChamberJazzEvidence(modalJazz, "アンビエント", 0), true);
  assert.equal(modalChamberJazzEvidence({ ...modalJazz, sustainRatio: .98 }, "アンビエント", 0), false);
  assert.equal(modalChamberJazzEvidence({ ...modalJazz, structureRecurrence: .66 }, "アンビエント", 0), false);
  assert.equal(modalChamberJazzEvidence(modalJazz, "クラシック音楽", 0), false);
});

test("instrumental electronic evidence rejects vocal funk and straight four-on-floor music", () => {
  const { instrumentalElectronicEvidence } = loadPatternApi();
  const electronic = {
    tempo: 144, energy: .9399, rhythm: .8884, onset: .6346,
    guitarBand: .0039, distortion: .2383, fourOnFloor: .1253,
    breakbeatIrregularity: .6631, sustainRatio: .8608, reverbTail: .8084,
    funkGrooveScore: .5047
  };
  const context = {
    leader: "ファンク", ruleLeader: "テクノ", electronicMacroScore: .78,
    vocalPresence: 0, stemVocalPresence: 0
  };
  assert.equal(instrumentalElectronicEvidence(electronic, context), true);
  assert.equal(instrumentalElectronicEvidence(electronic, { ...context, vocalPresence: 1, stemVocalPresence: 1 }), false);
  assert.equal(instrumentalElectronicEvidence({ ...electronic, fourOnFloor: .72 }, context), false);
  assert.equal(instrumentalElectronicEvidence({ ...electronic, breakbeatIrregularity: .3 }, context), false);
});

test("chiptune texture evidence rejects bass-heavy dubstep and generic bright ambience", () => {
  const { chiptuneTextureEvidence } = loadPatternApi();
  const chiptune = {
    tempo: 99, energy: .6152, bass: .3278, lowBandRatio: .2097,
    rhythm: .2157, onset: .1541, brightness: .8545, highBandRatio: .4702,
    squareWave: .432, zcr: .2092, harmonicRatio: .7809, highNoiseRatio: .3269,
    guitarBand: .0013, distortion: .2229, structureRecurrence: .5336
  };
  const context = {
    leader: "ダブステップ", hasChiptuneCandidate: true, electronicMacroScore: 1,
    vocalPresence: 0, stemVocalPresence: 0
  };
  assert.equal(chiptuneTextureEvidence(chiptune, context), true);
  assert.equal(chiptuneTextureEvidence({ ...chiptune, bass: .78, lowBandRatio: .62 }, context), false);
  assert.equal(chiptuneTextureEvidence({ ...chiptune, squareWave: .18, structureRecurrence: .2 }, context), false);
  assert.equal(chiptuneTextureEvidence(chiptune, { ...context, hasChiptuneCandidate: false }), false);
  assert.equal(chiptuneTextureEvidence(chiptune, { ...context, leader: "ロック", electronicMacroScore: .85 }), true);
});

test("weak chiptune consensus yields to mid-dominant harmonic rock without absorbing real chip audio", () => {
  const { midDominantRockBalladEvidence, calibratedGenreAnalysis } = loadPatternApi();
  const rockBallad = {
    tempo: 117, energy: .869, bass: .579, lowBandRatio: .42, midBandRatio: .555,
    highBandRatio: .026, brightness: .231, rhythm: .471, onset: .336,
    harmonicRatio: .857, distortion: .216, squareWave: .242,
    fourOnFloor: .127, kickGrid: .186, transientScarcity: 1,
    structureRecurrence: .75
  };
  const weakChipContext = {
    leader: "チップチューン", chiptuneScore: .013, modelElectronicMacroScore: .009,
    ruleRockMacroScore: .65, ruleElectronicMacroScore: .5,
    analysisWindowSeconds: 90,
    segmentConsensus: { count: 3, voteShare: .333, macroVoteShare: .333, leaders: ["クラシック音楽", "ドローン", "チップチューン"] }
  };
  assert.equal(midDominantRockBalladEvidence(rockBallad, weakChipContext), true);
  assert.equal(midDominantRockBalladEvidence({
    ...rockBallad, bass: .32, lowBandRatio: .2, midBandRatio: .28,
    highBandRatio: .47, brightness: .85, squareWave: .43
  }, weakChipContext), false);
  assert.equal(midDominantRockBalladEvidence(rockBallad, {
    ...weakChipContext, modelElectronicMacroScore: .82, segmentConsensus: { count: 3, voteShare: 1, macroVoteShare: 1 }
  }), false);

  const slowSungRock = {
    tempo: 76, energy: .7984, bass: .3754,
    lowBandRatio: .2474, midBandRatio: .7465, highBandRatio: .006,
    brightness: .1205, rhythm: .3322, onset: .2373,
    harmonicRatio: .8642, distortion: .2127, squareWave: .2387,
    fourOnFloor: .0632, kickGrid: .1486, transientScarcity: .958,
    structureRecurrence: .7487
  };
  const sungSplitContext = {
    leader: "ジャズ", analysisWindowSeconds: 120,
    modelRockMacroScore: .329, modelBlackMacroScore: 0,
    blackFineSoulScore: .562,
    vocalAvailable: true, detectedLanguage: "en",
    vocalPresence: 1, stemVocalPresence: 1,
    melodicVocalLikelihood: .82, speechRapLikelihood: .016,
    segmentConsensus: {
      count: 3, voteShare: .333, macroVoteShare: .333,
      leaders: ["クラシック音楽", "J-POP", "ロック"]
    }
  };
  assert.equal(midDominantRockBalladEvidence(slowSungRock, sungSplitContext), true);
  assert.equal(midDominantRockBalladEvidence(slowSungRock, {
    ...sungSplitContext, blackFineSoulScore: .82
  }), false, "strong Soul specialist evidence is retained");
  assert.equal(midDominantRockBalladEvidence(slowSungRock, {
    ...sungSplitContext, detectedLanguage: "it"
  }), false, "non-English classical and operatic singing is retained");
  assert.equal(midDominantRockBalladEvidence({ ...slowSungRock, fourOnFloor: .58 }, sungSplitContext), false, "slow Disco remains outside the rescue");
  assert.equal(midDominantRockBalladEvidence({ ...slowSungRock, energy: .55, distortion: .12 }, sungSplitContext), false, "soft acoustic ballads remain outside the rescue");

  const calibrated = calibratedGenreAnalysis({
    source: "test", method: "shared-production-local-classifier",
    confidence: 1.3, needsReview: true,
    macro: [{ macro: "electronic", score: 1 }],
    top: [
      { name: "チップチューン", macro: "electronic", score: 1.3, rawScore: 1.3, relativeScore: 1.3 },
      { name: "トランス", macro: "electronic", score: .4, rawScore: .4, relativeScore: .4 }
    ],
    segmentConsensus: { count: 3, voteShare: .333, conflict: true }
  }, {
    macro: [{ macro: "rock", score: 65 }],
    top: [{ name: "ロック", score: 70 }]
  });
  assert.ok(calibrated.confidence <= 52);
  assert.equal(calibrated.needsReview, true);
});

test("underrepresented boundary specialists keep ordinary disco and J-POP outside narrow rescues", () => {
  const { underrepresentedBoundaryTarget } = loadPatternApi();
  const ordinaryDisco = {
    tempo: 103, energy: .877, bass: .5918, lowBandRatio: .431, midBandRatio: .3889,
    highBandRatio: .18, rhythm: .7914, onset: .5653, brightness: .5548,
    sustainRatio: .8811, structureRecurrence: .7676, distortion: .2379
  };
  assert.equal(underrepresentedBoundaryTarget(ordinaryDisco, {
    leader: "ディスコ", labels: ["ロック"], ruleNames: ["ディスコ"],
    modelMacro: { black_music: 1, rock: .2 }, vocalPresence: 1, stemVocalPresence: 1
  }), null);

  const ordinaryJpop = {
    tempo: 132, energy: .82, bass: .48, rhythm: .68, onset: .46, brightness: .52,
    sustainRatio: .72, structureRecurrence: .7, reverbTail: .62
  };
  assert.equal(underrepresentedBoundaryTarget(ordinaryJpop, {
    leader: "J-POP", labels: ["J-POP"], ruleNames: ["J-POP"], rawRuleLeader: "J-POP",
    modelMacro: { pop: 1, world: .05, electronic: .12 },
    vocalPresence: 1, stemVocalPresence: 1, japaneseVocalLikelihood: .9
  }), null);

  const liquidDnb = {
    tempo: 86, energy: .9736, rhythm: .5662, onset: .4044,
    dnbBreakbeatScore: 1, structureRecurrence: .927
  };
  assert.equal(underrepresentedBoundaryTarget(liquidDnb, {
    leader: "ジャズ", modelMacro: { jazz: 1 }, vocalPresence: .25
  }).targetName, "ドラムンベース");

  const liveVocalDnb = {
    tempo: 96, energy: 1, bass: .7963, rhythm: .6731, onset: .4808,
    liveDnbSubdivisionScore: .755, fourOnFloor: .1612, guitarBand: .001,
    distortion: .2479, reverbTail: 1, structureRecurrence: .3758
  };
  const liveDnbContext = {
    leader: "ロック", ruleNames: ["ファンク", "ヒップホップ"],
    modelMacro: { rock: 1, electronic: .277, black_music: .16 },
    vocalPresence: 1, stemVocalPresence: .8173
  };
  assert.equal(underrepresentedBoundaryTarget(liveVocalDnb, liveDnbContext)?.targetName, "ドラムンベース");
  assert.equal(underrepresentedBoundaryTarget({ ...liveVocalDnb, liveDnbSubdivisionScore: .45 }, liveDnbContext), null);

  const enka = {
    tempo: 81, rhythm: .2631, onset: .1879, brightness: .269,
    sustainRatio: .926
  };
  assert.equal(underrepresentedBoundaryTarget(enka, {
    leader: "J-POP", rawRuleLeader: "フォーク", modelMacro: { pop: 1, world: .12 },
    vocalPresence: 1, stemVocalPresence: 1, japaneseVocalLikelihood: .75
  }).targetName, "フォーク");

  const boomBap = {
    tempo: 112, energy: .9622, bass: .7911, lowBandRatio: .6141,
    midBandRatio: .3092, highBandRatio: .0768, rhythm: .7333, onset: .5238,
    guitarBand: .0036, structureRecurrence: .6896, hiphopPunchScore: .5809
  };
  assert.equal(underrepresentedBoundaryTarget(boomBap, {
    leader: "ロック", labels: ["ロック", "ヒップホップ"],
    ruleNames: ["ハウス", "ヒップホップ", "ファンク"],
    modelMacro: { rock: 1, electronic: .13 },
    vocalPresence: 1, stemVocalPresence: .8619, japaneseVocalLikelihood: 0
  }), null);

  const rockFunk = {
    tempo: 123, energy: .561, bass: .6197, rhythm: .3243, onset: .2316,
    guitarBand: .0014, distortion: .1686, structureRecurrence: .3141
  };
  assert.equal(underrepresentedBoundaryTarget(rockFunk, {
    leader: "ブルース", labels: ["ブルース", "ロック", "メタル"],
    ruleNames: ["ブルース", "ソウルミュージック", "ダブ"],
    modelMacro: { black_music: 1, rock: .62 },
    vocalPresence: 1, stemVocalPresence: 1, vocalEnergyRatio: .5298
  }).targetName, "ファンク");

  const hornLedLatinJazz = {
    tempo: 81, bass: .21, lowBandRatio: .12, midBandRatio: .83, highBandRatio: .05,
    rhythm: .47, onset: .34, distortion: .21
  };
  assert.equal(underrepresentedBoundaryTarget(hornLedLatinJazz, {
    leader: "ロック", modelMacro: { jazz: .31 },
    vocalPresence: .79, stemVocalPresence: .12, vocalEnergyRatio: .13
  })?.targetName, "ジャズ");

  const guitarDrone = {
    tempo: 72, energy: 1, bass: .91, rhythm: .4, onset: .29,
    guitarBand: .0011, sustainRatio: .94, structureRecurrence: .22
  };
  assert.equal(underrepresentedBoundaryTarget(guitarDrone, {
    leader: "ロック", modelMacro: { ambient: .22 },
    vocalPresence: .11, stemVocalPresence: 0, vocalEnergyRatio: .03
  })?.targetName, "ドローン");
  assert.equal(underrepresentedBoundaryTarget(guitarDrone, {
    leader: "ロック", modelMacro: { ambient: .22 },
    vocalPresence: .9, stemVocalPresence: .6, vocalEnergyRatio: .5
  }), null);
});

test("black-music boundary specialists require independent fine and acoustic agreement", () => {
  const { underrepresentedBoundaryTarget } = loadPatternApi();
  const acidJazz = {
    tempo: 185, energy: .9313, bass: .9329, highBandRatio: .0041,
    rhythm: 1, onset: .7598, acousticness: .4605, harmonicRatio: .8079,
    distortion: .2148, structureRecurrence: .2287
  };
  assert.equal(underrepresentedBoundaryTarget(acidJazz, {
    leader: "ダブステップ", vocalPresence: 0, stemVocalPresence: 0
  })?.targetName, "ジャズ");
  assert.equal(underrepresentedBoundaryTarget(acidJazz, {
    leader: "ロック", vocalPresence: 0, stemVocalPresence: 0
  })?.targetName, "ジャズ");
  assert.equal(underrepresentedBoundaryTarget({ ...acidJazz, acousticness: .2 }, {
    leader: "ダブステップ", vocalPresence: 0, stemVocalPresence: 0
  }), null);

  const electroFunk = {
    tempo: 108, bass: .7, rhythm: .81, highBandPulse: .001,
    dnbBreakbeatScore: .33, fourOnFloor: .28, syncopation: .7, distortion: .24
  };
  const electroContext = {
    leader: "ダブステップ", ruleNames: ["ファンク"],
    blackMusicFine: [{ label: "ファンク", score: 100 }]
  };
  assert.equal(underrepresentedBoundaryTarget(electroFunk, electroContext)?.targetName, "ファンク");
  assert.equal(underrepresentedBoundaryTarget(electroFunk, {
    ...electroContext, blackMusicFine: [{ label: "ファンク", score: 54 }]
  }), null);
});

test("cross-source groove specialists resolve disco, house, DnB, and archival boundaries", () => {
  const { underrepresentedBoundaryTarget } = loadPatternApi();
  const fine = entries => entries.map(([label, score]) => ({ label, score }));

  const vocoderDisco = {
    tempo: 99, rhythm: 1, onset: .7405, onsetDensity: .7656,
    structureRecurrence: .6297, distortion: .2159
  };
  assert.equal(underrepresentedBoundaryTarget(vocoderDisco, {
    leader: "テクノ", labels: ["テクノ", "ディスコ"],
    modelMacro: { black_music: .884 }, blackMusicFine: fine([["ディスコ", 54]]),
    vocalPresence: 1, detectedLanguage: "en"
  })?.targetName, "ディスコ");
  assert.equal(underrepresentedBoundaryTarget({ ...vocoderDisco, onsetDensity: .18 }, {
    leader: "テクノ", labels: ["テクノ", "ディスコ"],
    modelMacro: { black_music: .884 }, blackMusicFine: fine([["ディスコ", 54]]),
    vocalPresence: 1, detectedLanguage: "en"
  }), null);

  const sampledHouse = {
    tempo: 129, bass: .9929, rhythm: 1, onset: 1, structureRecurrence: .7384
  };
  assert.equal(underrepresentedBoundaryTarget(sampledHouse, {
    leader: "テクノ", labels: ["テクノ", "ハウス"],
    modelMacro: { electronic: 1 }, blackMusicFine: fine([["ディスコ", 95]])
  })?.targetName, "ハウス");
  assert.equal(underrepresentedBoundaryTarget({ ...sampledHouse, structureRecurrence: .3 }, {
    leader: "テクノ", labels: ["テクノ", "ハウス"],
    modelMacro: { electronic: 1 }, blackMusicFine: fine([["ディスコ", 95]])
  }), null);

  const liquidDnb = {
    tempo: 89, energy: .7251, bass: 1, dnbBreakbeatScore: 1,
    breakbeatIrregularity: .7712, guitarBand: .0001, distortion: .1977
  };
  assert.equal(underrepresentedBoundaryTarget(liquidDnb, {
    leader: "ダブステップ", labels: ["ダブステップ", "ドラムンベース"],
    modelMacro: { electronic: 1 }
  })?.targetName, "ドラムンベース");
  assert.equal(underrepresentedBoundaryTarget({ ...liquidDnb, dnbBreakbeatScore: .3 }, {
    leader: "ダブステップ", labels: ["ダブステップ", "ドラムンベース"],
    modelMacro: { electronic: 1 }
  }), null);

  const soulSampleTrap = {
    tempo: 99, bass: .8982, lowBandRatio: .7169, rhythm: .3745, onset: .2675,
    dnbBreakbeatScore: .3538, structureRecurrence: .8327
  };
  assert.equal(underrepresentedBoundaryTarget(soulSampleTrap, {
    leader: "ドラムンベース", vocalPresence: .5867
  })?.targetName, "トラップ");
  assert.equal(underrepresentedBoundaryTarget(soulSampleTrap, {
    leader: "ドラムンベース", vocalPresence: .2
  }), null);

  const deltaBlues = {
    tempo: 72, acousticness: .607, distortion: .1777, structureRecurrence: .0919
  };
  assert.equal(underrepresentedBoundaryTarget(deltaBlues, {
    leader: "ラテン", rawRuleLeader: "ブルース",
    blackMusicFine: fine([["ブルース", 77]]), vocalPresence: 1, detectedLanguage: "en"
  })?.targetName, "ブルース");
});

test("vocoder funk and vocal disco require independent stem and skank evidence", () => {
  const { underrepresentedBoundaryTarget } = loadPatternApi();
  const fine = entries => entries.map(([label, score]) => ({ label, score }));
  const vocoderFunk = {
    tempo: 108, midBandRatio: .667, harmonicRatio: .877,
    rhythm: .527, onset: .376, fourOnFloor: .239,
    structureRecurrence: .79, distortion: .182
  };
  const vocoderContext = {
    leader: "ディスコ", labels: ["ディスコ", "ファンク"],
    modelMacro: { black_music: 1 }, blackMusicFine: fine([["ファンク", 8.3]]),
    vocalPresence: 1, stemVocalPresence: 0,
    vocalEnergyRatio: .072, sampleCount: 10, detectedLanguage: "en"
  };
  assert.equal(underrepresentedBoundaryTarget(vocoderFunk, vocoderContext)?.targetName, "ファンク");
  assert.equal(underrepresentedBoundaryTarget(vocoderFunk, {
    ...vocoderContext, stemVocalPresence: .4, vocalEnergyRatio: .3
  }), null);

  const vocalDisco = {
    tempo: 117, energy: .482, bass: .847,
    rhythm: .538, onset: .384, onsetDensity: .438,
    beatGridStrength: .613, syncopation: .737,
    offbeatEmphasis: .163, reggaeSkankScore: .49,
    structureRecurrence: .656, distortion: .153
  };
  const discoContext = {
    leader: "レゲエ", labels: ["レゲエ", "ディスコ"],
    modelMacro: { black_music: 1 }, blackMusicFine: fine([["ディスコ", 35.3]]),
    vocalPresence: 1, stemVocalPresence: .96,
    vocalEnergyRatio: .483, detectedLanguage: "en"
  };
  assert.equal(underrepresentedBoundaryTarget(vocalDisco, discoContext)?.targetName, "ディスコ");
  assert.equal(underrepresentedBoundaryTarget({
    ...vocalDisco, offbeatEmphasis: .34, reggaeSkankScore: .72
  }, discoContext), null);
});

test("neo-soul breakbeat rescue requires sung stem support beyond a hip-hop pocket", () => {
  const { underrepresentedBoundaryTarget } = loadPatternApi();
  const neoSoul = {
    tempo: 92, bass: .933, lowBandRatio: .751,
    rhythm: 1, onset: .947, syncopation: .97,
    breakbeatIrregularity: .812, harmonicRatio: .76,
    structureRecurrence: .737, distortion: .204
  };
  const context = {
    leader: "ヒップホップ", modelMacro: { black_music: 1 },
    blackMusicFine: [{ label: "ソウルミュージック", score: 17.4 }],
    vocalPresence: 1, stemVocalPresence: .294,
    vocalEnergyRatio: .203, detectedLanguage: "en"
  };
  assert.equal(underrepresentedBoundaryTarget(neoSoul, context)?.targetName, "ソウルミュージック");
  assert.equal(underrepresentedBoundaryTarget(neoSoul, {
    ...context, stemVocalPresence: .08, vocalEnergyRatio: .08
  }), null);
  assert.equal(underrepresentedBoundaryTarget(neoSoul, {
    ...context, blackMusicFine: [{ label: "ソウルミュージック", score: 10 }]
  }), null);
});

test("sustained metal lead texture separates a distorted solo from ordinary rock", () => {
  const { underrepresentedBoundaryTarget } = loadPatternApi();
  const sustainedMetal = {
    tempo: 92, energy: .594, highBandRatio: .294, brightness: .692,
    zcr: .165, squareWave: .381, highNoiseRatio: .268,
    harmonicRatio: .812, distortion: .188,
    rhythm: .246, onset: .176, percussiveRatio: .03,
    sustainRatio: .943, reverbTail: 1, structureRecurrence: .446
  };
  const context = {
    leader: "ロック", labels: ["ロック", "メタル"], modelMacro: { rock: 1 },
    vocalPresence: .014, stemVocalPresence: 0,
    vocalEnergyRatio: .063, sampleCount: 1
  };
  assert.equal(underrepresentedBoundaryTarget(sustainedMetal, context)?.targetName, "メタル");
  assert.equal(underrepresentedBoundaryTarget({
    ...sustainedMetal, highNoiseRatio: .14, squareWave: .22
  }, context), null);
  assert.equal(underrepresentedBoundaryTarget(sustainedMetal, {
    ...context, vocalPresence: .8, stemVocalPresence: .7, vocalEnergyRatio: .4
  }), null);
});

test("instrumental Afrobeat requires dense long-cycle polyrhythm beyond mainstream funk", () => {
  const { underrepresentedBoundaryTarget } = loadPatternApi();
  const afrobeat = {
    tempo: 117, energy: .769, bass: .771,
    lowBandRatio: .595, highBandRatio: .121,
    rhythm: .716, onset: .511, onsetDensity: .266,
    percussiveRatio: .159, beatGridStrength: .356,
    syncopation: .744, breakbeatIrregularity: .544,
    fourOnFloor: .236, structureRecurrence: .733,
    harmonicRatio: .784, distortion: .213
  };
  const context = {
    leader: "ファンク", modelMacro: { black_music: 1, world: .1 },
    vocalPresence: .032, stemVocalPresence: 0,
    vocalEnergyRatio: .077, sampleCount: 1
  };
  assert.equal(underrepresentedBoundaryTarget(afrobeat, context)?.targetName, "ワールドミュージック");
  assert.equal(underrepresentedBoundaryTarget({
    ...afrobeat,
    highBandRatio: .034, rhythm: .602, onset: .43, onsetDensity: .125,
    percussiveRatio: .09, beatGridStrength: .21,
    syncopation: .515, breakbeatIrregularity: .416
  }, { ...context, modelMacro: { black_music: 1, world: .184 } }), null);
  assert.equal(underrepresentedBoundaryTarget({
    ...afrobeat, structureRecurrence: .18
  }, { ...context, vocalPresence: 1, stemVocalPresence: 1, vocalEnergyRatio: .57 }), null);
});

test("half-time breakbeat consensus restores DnB and techno without moving close grooves", () => {
  const { underrepresentedBoundaryTarget } = loadPatternApi();
  const cases = [
    {
      method: "instrumentalTechnoRuleAgreement", target: "テクノ", negativeVector: { funkGrooveScore: .52 },
      vector: { tempo: 136, energy: .778, highBandRatio: .155, rhythm: .679, onset: .485, onsetDensity: .063, breakbeatIrregularity: .189, funkGrooveScore: .257, structureRecurrence: .642, distortion: .194 },
      context: { leader: "ファンク", rawRuleLeader: "テクノ", modelMacro: { electronic: .264 }, vocalPresence: 0, stemVocalPresence: 0 }
    },
    {
      method: "halfTimeDenseBreakbeatDnb", target: "ドラムンベース", negativeVector: { fourOnFloor: .48 },
      vector: { tempo: 117, energy: 1, bass: .871, rhythm: .945, onset: .675, onsetDensity: .391, percussiveRatio: .22, breakbeatCycle: .64, breakbeatIrregularity: .575, syncopation: .72, fourOnFloor: .186, guitarBand: .0004, distortion: .259 },
      context: { leader: "ロック", labels: ["ロック", "ダブステップ"], ruleNames: ["ファンク", "ディスコ", "ドラムンベース"] }
    },
    {
      method: "archivalHalfTimeJungle", target: "ドラムンベース", negativeVector: { syncopation: .4 },
      vector: { tempo: 99, energy: .474, bass: .744, lowBandRatio: .57, onsetDensity: .313, percussiveRatio: .164, dnbBreakbeatScore: .517, breakbeatCycle: .629, breakbeatIrregularity: .576, beatGridStrength: .587, syncopation: .763, fourOnFloor: .18, guitarBand: .0025, reverbTail: 1 },
      context: { leader: "アンビエント" }
    },
    {
      method: "reverberantLiveDnbCycle", target: "ドラムンベース", negativeVector: { dnbBreakbeatScore: .35 },
      vector: { tempo: 86, energy: .744, midBandRatio: .654, highBandRatio: .101, rhythm: .354, onset: .253, dnbBreakbeatScore: .602, liveDnbSubdivisionScore: .373, fourOnFloor: .258, guitarBand: .0037, distortion: .213, reverbTail: .941, structureRecurrence: .654 },
      context: { leader: "ロック" }
    }
  ];
  cases.forEach(({ method, target, vector, context, negativeVector }) => {
    const positive = underrepresentedBoundaryTarget(vector, context);
    assert.equal(positive?.targetName, target, method);
    assert.equal(positive?.method, method, method);
    assert.notEqual(underrepresentedBoundaryTarget({ ...vector, ...negativeVector }, context)?.method, method, `${method} close negative`);
  });
});

test("multilingual breakbeat pop and double-tempo roots dub require arrangement evidence", () => {
  const { underrepresentedBoundaryTarget } = loadPatternApi();
  const multilingualBreakbeat = {
    tempo: 96, energy: .419, bass: .668, lowBandRatio: .499, highBandRatio: .019,
    rhythm: .201, onset: .143, dnbBreakbeatScore: .444, liveDnbSubdivisionScore: .828,
    guitarBand: .0035, distortion: .119, reverbTail: .8
  };
  const multilingualContext = {
    leader: "ロック", detectedLanguage: "en", japaneseVocalLikelihood: 0,
    vocalPresence: 1, stemVocalPresence: .922, vocalEnergyRatio: .467, sampleCount: 8
  };
  assert.equal(underrepresentedBoundaryTarget(multilingualBreakbeat, multilingualContext)?.targetName, "電子音楽");
  assert.notEqual(underrepresentedBoundaryTarget({
    ...multilingualBreakbeat, liveDnbSubdivisionScore: .35
  }, multilingualContext)?.method, "multilingualVocalBreakbeatPop");

  const rootsDub = {
    tempo: 161, energy: .832, bass: .832, lowBandRatio: .653, highBandRatio: .081,
    rhythm: 1, onset: .727, onsetDensity: .234, percussiveRatio: .136,
    liveDnbSubdivisionScore: .277, breakbeatIrregularity: .664, syncopation: .691,
    reggaeSkankScore: .532, dubSpaceScore: .631, reverbTail: .739,
    structureRecurrence: .485, guitarBand: .0003, distortion: .234
  };
  const rootsContext = {
    leader: "テクノ", rawRuleLeader: "ドラムンベース",
    vocalPresence: 0, stemVocalPresence: 0, vocalEnergyRatio: .021, sampleCount: 0
  };
  assert.equal(underrepresentedBoundaryTarget(rootsDub, rootsContext)?.targetName, "ダブ");
  assert.notEqual(underrepresentedBoundaryTarget({
    ...rootsDub, highBandRatio: .2, percussiveRatio: .25, liveDnbSubdivisionScore: .7
  }, rootsContext)?.method, "instrumentalRootsDubDoubleTempo");
});

test("melodic half-time DnB recurrence rejects ordinary rock and four-on-floor pulse", () => {
  const { underrepresentedBoundaryTarget } = loadPatternApi();
  const melodicDnb = {
    tempo: 117, energy: .888, bass: .837, lowBandRatio: .658, highBandRatio: .154,
    rhythm: .486, onset: .347, onsetDensity: .109, breakbeatCycle: .498,
    liveDnbSubdivisionScore: .479, beatGridStrength: .354, syncopation: .496,
    fourOnFloor: .189, kickGrid: .177, guitarBand: .0019, distortion: .241,
    structureRecurrence: .83, reverbTail: .792
  };
  const context = {
    leader: "ロック", modelMacro: { electronic: .279 },
    vocalPresence: .124, stemVocalPresence: .124
  };
  assert.equal(underrepresentedBoundaryTarget(melodicDnb, context)?.targetName, "ドラムンベース");
  assert.notEqual(underrepresentedBoundaryTarget({ ...melodicDnb, guitarBand: .02 }, context)?.method, "melodicHalfTimeDnbRecurrence");
  assert.notEqual(underrepresentedBoundaryTarget({ ...melodicDnb, fourOnFloor: .55 }, context)?.method, "melodicHalfTimeDnbRecurrence");
});

test("ragga vocal half-time DnB requires electronic and black-music agreement", () => {
  const { underrepresentedBoundaryTarget } = loadPatternApi();
  const raggaDnb = {
    tempo: 117, energy: .971, bass: .829, lowBandRatio: .65,
    rhythm: .811, onset: .579, liveDnbSubdivisionScore: .61,
    fourOnFloor: .247, offbeatEmphasis: .251, guitarBand: .0002,
    distortion: .267, structureRecurrence: .849, reverbTail: .94
  };
  const context = {
    leader: "テクノ", modelMacro: { electronic: 1, black_music: .635 },
    detectedLanguage: "en", vocalPresence: 1, stemVocalPresence: .757,
    vocalEnergyRatio: .398, sampleCount: 7
  };
  assert.equal(underrepresentedBoundaryTarget(raggaDnb, context)?.targetName, "ドラムンベース");
  assert.notEqual(underrepresentedBoundaryTarget(raggaDnb, {
    ...context, modelMacro: { electronic: 1, black_music: .2 }
  })?.method, "raggaVocalHalfTimeDnb");
  assert.notEqual(underrepresentedBoundaryTarget(raggaDnb, {
    ...context, sampleCount: 2
  })?.method, "raggaVocalHalfTimeDnb");
  assert.notEqual(underrepresentedBoundaryTarget({ ...raggaDnb, fourOnFloor: .5 }, context)?.method, "raggaVocalHalfTimeDnb");
});

test("new boundary rescues preserve orchestral, operatic, and ordinary funk controls", () => {
  const { underrepresentedBoundaryTarget } = loadPatternApi();
  const classicalDance = {
    tempo: 112, energy: .2881, bass: .1369, midBandRatio: .9229,
    rhythm: .0523, onset: .0373, onsetDensity: .0156,
    structureRecurrence: .3463, distortion: .0905
  };
  assert.equal(underrepresentedBoundaryTarget(classicalDance, {
    leader: "クラシック音楽", labels: ["クラシック音楽", "ディスコ"],
    modelMacro: { classical: 1 }, vocalPresence: 0, stemVocalPresence: 0
  }), null);

  const operaChoir = {
    tempo: 129, energy: .2941, bass: .2899, midBandRatio: .8158,
    rhythm: .0511, onset: .0365, structureRecurrence: .5852, distortion: .0995
  };
  assert.equal(underrepresentedBoundaryTarget(operaChoir, {
    leader: "クラシック音楽", labels: ["クラシック音楽", "オペラ"],
    modelMacro: { classical: 1, black_music: .1, world: .14 },
    vocalPresence: 1, stemVocalPresence: 1, vocalEnergyRatio: .7441, detectedLanguage: "en"
  }), null);

  const ordinaryFunk = {
    tempo: 112, energy: .5851, bass: .6042, rhythm: .4145, onset: .2961,
    syncopation: .8049, structureRecurrence: .1828, distortion: .1778
  };
  assert.equal(underrepresentedBoundaryTarget(ordinaryFunk, {
    leader: "ファンク", rawRuleLeader: "シティ・ポップ", labels: ["ファンク"],
    modelMacro: { black_music: 1, world: .15 },
    blackMusicFine: [{ label: "ファンク", score: 80.1 }],
    vocalPresence: 1, stemVocalPresence: 1, detectedLanguage: "en"
  }), null);
});

test("v29 adversarial dance boundaries require hierarchy and rhythm agreement", () => {
  const { underrepresentedBoundaryTarget } = loadPatternApi();
  const fine = entries => entries.map(([label, score]) => ({ label, score }));
  const cases = [
    {
      target: "トラップ",
      vector: { tempo: 99, bass: .9739, lowBandRatio: .7913, rhythm: .7364, onset: .526, breakbeatIrregularity: .5088, hiphopPunchScore: .6967, structureRecurrence: .748 },
      context: { leader: "ヒップホップ", ruleNames: ["トラップ"], modelMacro: { black_music: 1 }, vocalPresence: 1 }
    },
    {
      target: "ディスコ",
      vector: { tempo: 123, rhythm: 1, onset: .7786, onsetDensity: .4375, syncopation: .93, fourOnFloor: .1134, structureRecurrence: .479, distortion: .2447 },
      context: { leader: "ファンク", labels: ["ファンク", "ディスコ"], modelMacro: { electronic: .281 }, vocalPresence: 1, detectedLanguage: "en" }
    },
    {
      target: "電子音楽",
      vector: { tempo: 112, energy: .4502, rhythm: .1704, onset: .1217, highBandRatio: .2024, structureRecurrence: .7947, guitarBand: .0011, reverbTail: 1 },
      context: { leader: "ファンク", modelMacro: { electronic: .911, pop: .267 }, vocalPresence: 1, detectedLanguage: "en" }
    },
    {
      target: "ハウス",
      vector: { tempo: 117, bass: .7473, rhythm: 1, onset: .9679, structureRecurrence: .6943 },
      context: { leader: "テクノ", rawRuleLeader: "ハウス", labels: ["テクノ", "ハウス"], modelMacro: { electronic: 1 }, blackMusicFine: fine([["ディスコ", 83.9]]), vocalPresence: .7933 }
    },
    {
      target: "ディスコ",
      vector: { tempo: 129, midBandRatio: .5973, rhythm: .3086, onset: .2204, structureRecurrence: .6487, distortion: .1742, guitarBand: .0099 },
      context: { leader: "ロック", rawRuleLeader: "クラシック音楽", blackMusicFine: fine([["ディスコ", 68]]), stemVocalPresence: 0, vocalEnergyRatio: .03 }
    },
    {
      target: "クラシック音楽",
      vector: { energy: .3528, rhythm: .0854, onset: .061, structureRecurrence: .7584, distortion: .1072, guitarBand: .0012 },
      context: { leader: "ブルース", modelMacro: { classical: .273 }, vocalPresence: .08, stemVocalPresence: 0 }
    },
    {
      target: "ダブステップ",
      vector: { tempo: 144, bass: .6567, rhythm: .6347, onset: .4533, onsetDensity: .3438, breakbeatIrregularity: .6116, syncopation: .825, structureRecurrence: .7429, guitarBand: .0001, distortion: .2017 },
      context: { leader: "ファンク", ruleNames: ["ダブステップ"], modelMacro: { electronic: .325 }, vocalPresence: .0597, stemVocalPresence: .0597 }
    },
    {
      target: "ジャズ",
      vector: { tempo: 117, energy: .6866, rhythm: .3661, onset: .2615, acousticness: .501, distortion: .1892, structureRecurrence: .271, guitarBand: .0039 },
      context: { leader: "ロック", rawRuleLeader: "ジャズ", vocalPresence: .0497, stemVocalPresence: .0497 }
    }
  ];
  cases.forEach(({ target, vector, context }) => {
    assert.equal(underrepresentedBoundaryTarget(vector, context)?.targetName, target);
  });
});

test("v29 vocal and roots specialists separate arrangement from language alone", () => {
  const { underrepresentedBoundaryTarget } = loadPatternApi();
  const fine = entries => entries.map(([label, score]) => ({ label, score }));
  const cases = [
    {
      target: "トラップ",
      vector: { tempo: 99, bass: 1, lowBandRatio: .8387, rhythm: 1, onset: .8728, breakbeatIrregularity: .537, hiphopPunchScore: .7981, structureRecurrence: .3545 },
      context: { leader: "ダブ", ruleNames: ["トラップ"], modelMacro: { black_music: 1 }, vocalPresence: 1 }
    },
    {
      target: "ジャズ",
      vector: { tempo: 161, midBandRatio: .5242, acousticness: .5309, rhythm: .2911, onset: .208, dnbBreakbeatScore: 1, breakbeatIrregularity: .7806, structureRecurrence: .4918, distortion: .1666 },
      context: { leader: "ロック", vocalPresence: 0, stemVocalPresence: 0 }
    },
    {
      target: "ヒップホップ",
      vector: { tempo: 108, bass: 1, lowBandRatio: .8468, rhythm: 1, onset: .8822, hiphopPunchScore: .8391, breakbeatIrregularity: .5964, structureRecurrence: .6184 },
      context: { leader: "ディスコ", labels: ["ディスコ", "ヒップホップ"], vocalPresence: 1, detectedLanguage: "en" }
    },
    {
      target: "ソウルミュージック",
      vector: { tempo: 89, bass: .9849, rhythm: .7902, onset: .5645, structureRecurrence: .3686, distortion: .1835 },
      context: { leader: "ロック", blackMusicFine: fine([["ソウルミュージック", 19.1]]), vocalPresence: 1, stemVocalPresence: .6203, vocalEnergyRatio: .3405, detectedLanguage: "en" }
    },
    {
      target: "ソウルミュージック",
      vector: { tempo: 86, energy: .8336, bass: .3767, midBandRatio: .5405, rhythm: .548, onset: .3915, syncopation: .7128, reverbTail: .985, guitarBand: .0088, distortion: .2376, structureRecurrence: .5929 },
      context: { leader: "ロック", blackMusicFine: fine([["ソウルミュージック", 62.2]]), vocalPresence: 1, stemVocalPresence: 1, detectedLanguage: "en" }
    },
    {
      target: "ロック",
      vector: { energy: .8818, midBandRatio: .6464, rhythm: .4611, onset: .3294, guitarBand: .0104, distortion: .25, structureRecurrence: .1898 },
      context: { leader: "ドローン", modelMacro: { rock: .341 }, vocalPresence: 1 }
    },
    {
      target: "ソウルミュージック",
      vector: { tempo: 117, bass: .7146, rhythm: .2267, onset: .1619, reverbTail: 1, guitarBand: .0037, distortion: .1968, structureRecurrence: .6309 },
      context: { leader: "ロック", ruleNames: ["ソウルミュージック"], vocalPresence: 1, stemVocalPresence: 1, vocalEnergyRatio: .7228, detectedLanguage: "en" }
    },
    {
      target: "フォーク",
      vector: { tempo: 129, energy: .6057, midBandRatio: .6222, highBandRatio: .0448, rhythm: .5082, onset: .363, acousticness: .5086, distortion: .1604, structureRecurrence: .2898 },
      context: { leader: "クラシック音楽", labels: ["クラシック音楽", "フォーク"], ruleNames: ["フォーク"], modelMacro: { world: 1 }, vocalPresence: 1, stemVocalPresence: 1, detectedLanguage: "en" }
    },
    {
      target: "レゲエ",
      vector: { tempo: 76, bass: .8038, lowBandRatio: .6262, rhythm: .3332, onset: .238, syncopation: 1, reggaeSkankScore: .592, reverbTail: .803, structureRecurrence: .3461 },
      context: { leader: "アンビエント", ruleNames: ["レゲエ"], modelMacro: { black_music: .648 }, vocalPresence: 1, detectedLanguage: "en" }
    },
    {
      target: "ダブ",
      vector: { tempo: 129, bass: 1, lowBandRatio: .8949, highBandRatio: .0139, rhythm: .9169, onset: .6549, fourOnFloor: .1724, offbeatEmphasis: .2485, reverbTail: .8585, dubSpaceScore: .793 },
      context: { leader: "ディープ・ハウス", modelMacro: { black_music: .249 }, vocalPresence: .0108, stemVocalPresence: 0 }
    }
  ];
  cases.forEach(({ target, vector, context }) => {
    assert.equal(underrepresentedBoundaryTarget(vector, context)?.targetName, target);
  });
});

test("bass-led alternative dance-rock escapes confident Blues without absorbing real Blues", () => {
  const { bassLedAlternativeDanceRockEvidence } = loadPatternApi();
  const vector = {
    tempo: 76, energy: .4322, bass: .7778,
    lowBandRatio: .6015, midBandRatio: .3847, highBandRatio: .0138,
    rhythm: .2366, onset: .169, syncopation: .8733,
    breakbeatCycle: .6703, fourOnFloor: .1643,
    harmonicRatio: .8149, distortion: .1206, sustainRatio: .9081,
    structureRecurrence: .2786
  };
  const context = {
    leader: "ブルース", rockMacro: .232, bluesFine: .872,
    ruleLeader: "アンビエント", detectedLanguage: "en",
    vocalPresence: 1, melodicVocalLikelihood: .8276, speechRapLikelihood: .021,
    externalTop: [
      { label: "ハウス", score: 30.8 }, { label: "ファンク", score: 14.3 },
      { label: "ディスコ", score: 8.9 }, { label: "ロック", score: 6.5 }
    ],
    externalSegmentAgreement: 1
  };
  assert.equal(bassLedAlternativeDanceRockEvidence(vector, context), true);
  assert.equal(bassLedAlternativeDanceRockEvidence(vector, {
    ...context,
    externalTop: [{ label: "ブルース", score: 31 }, ...context.externalTop]
  }), false);
  assert.equal(bassLedAlternativeDanceRockEvidence(vector, {
    ...context,
    externalTop: [{ label: "ハウス", score: 14 }, { label: "ファンク", score: 8 }, { label: "ロック", score: 6 }]
  }), false);
  assert.equal(bassLedAlternativeDanceRockEvidence(vector, { ...context, ruleLeader: "ブルース" }), false);
  assert.equal(bassLedAlternativeDanceRockEvidence({ ...vector, fourOnFloor: .58 }, context), false);
});

test("v29 adversarial controls do not turn close negative pairs into rescued genres", () => {
  const { underrepresentedBoundaryTarget } = loadPatternApi();
  const pFunk = { tempo: 108, energy: .7956, bass: .6927, rhythm: .7771, onset: .5551, syncopation: .6844, structureRecurrence: .4363, distortion: .2433 };
  assert.equal(underrepresentedBoundaryTarget(pFunk, {
    leader: "ファンク", labels: ["ファンク", "ディスコ"], modelMacro: { electronic: .235 },
    vocalPresence: 1, detectedLanguage: "en"
  }), null);

  const ambientIntro = { tempo: 117, energy: .4485, rhythm: .2295, onset: .1639, dnbBreakbeatScore: .3117, structureRecurrence: .8177 };
  assert.equal(underrepresentedBoundaryTarget(ambientIntro, {
    leader: "アンビエント", modelMacro: { ambient: 1, electronic: .292 }, vocalPresence: .6133
  }), null);

  const ordinaryFunk = { tempo: 117, energy: .7766, bass: .7419, rhythm: .6015, onset: .4297, structureRecurrence: .7106 };
  assert.equal(underrepresentedBoundaryTarget(ordinaryFunk, {
    leader: "ファンク", modelMacro: { black_music: 1, world: .184 },
    blackMusicFine: [{ label: "ファンク", score: 100 }], vocalPresence: .0877
  }), null);

  const classicalChoir = { tempo: 103, energy: .4823, bass: .2382, midBandRatio: .8441, rhythm: .178, onset: .1271, structureRecurrence: .6436 };
  assert.equal(underrepresentedBoundaryTarget(classicalChoir, {
    leader: "オペラ", labels: ["オペラ", "クラシック音楽"], modelMacro: { classical: 1 },
    vocalPresence: 1, stemVocalPresence: 1, vocalEnergyRatio: .6263, detectedLanguage: "en"
  }), null);
});

test("v31 boundary-domain specialists resolve live, half-time, and sparse arrangement failures", () => {
  const { underrepresentedBoundaryTarget } = loadPatternApi();
  const fine = entries => entries.map(([label, score]) => ({ label, score }));
  const cases = [
    {
      method: "halfTimeLiquidDnbDomain", target: "ドラムンベース",
      vector: { tempo: 88, energy: .96, bass: .86, rhythm: .46, onset: .34, dnbBreakbeatScore: 1, breakbeatIrregularity: .76, guitarBand: .001, fourOnFloor: .12 },
      context: { leader: "ロック" }
    },
    {
      method: "liveVocalLiquidDnbDomain", target: "ドラムンベース",
      vector: { tempo: 89, energy: .54, dnbBreakbeatScore: .96, breakbeatIrregularity: .71, guitarBand: .0005, fourOnFloor: .17, reverbTail: .97, structureRecurrence: .49 },
      context: { leader: "ロック", labels: ["ロック", "ドラムンベース"], modelMacro: { electronic: .63 }, vocalPresence: 1, stemVocalPresence: 1, detectedLanguage: "en" }
    },
    {
      method: "japaneseVocalLiquidDnbDomain", target: "ドラムンベース",
      vector: { tempo: 89, bass: .66, rhythm: .3, onset: .21, liveDnbSubdivisionScore: .65, dnbBreakbeatScore: .78, breakbeatIrregularity: .63, guitarBand: .0018, fourOnFloor: .2, structureRecurrence: .79, reverbTail: 1 },
      context: { leader: "ロック", modelMacro: { electronic: .35 }, vocalPresence: 1, stemVocalPresence: .97, japaneseVocalLikelihood: .32, detectedLanguage: "ja" }
    },
    {
      method: "liveFastDnbDomain", target: "ドラムンベース",
      vector: { tempo: 184, energy: .98, rhythm: .94, onset: .7, dnbBreakbeatScore: .68, breakbeatIrregularity: .62, guitarBand: .008 },
      context: { leader: "ロック", ruleNames: ["ドラムンベース"], modelMacro: { electronic: .7 } }
    },
    {
      method: "drumlessDnbBreakdown", target: "アンビエント",
      vector: { tempo: 86, rhythm: .4, onset: .28, liveDnbSubdivisionScore: .3, fourOnFloor: .3, structureRecurrence: .86, reverbTail: 1 },
      context: { leader: "ドラムンベース", modelMacro: { electronic: 1 } }
    },
    {
      method: "liveFunkLooseBackbeat", target: "ファンク",
      vector: { tempo: 129, rhythm: .5, onset: .36, fourOnFloor: .12, structureRecurrence: .3 },
      context: { leader: "ディスコ", blackMusicFine: fine([["ファンク", 68], ["ディスコ", 72]]), vocalPresence: 1 }
    },
    {
      method: "orchestralBoomBapPocket", target: "ヒップホップ",
      vector: { tempo: 90, bass: .96, rhythm: .42, onset: .3, breakbeatIrregularity: .78, hiphopPunchScore: .68, guitarBand: .0005, structureRecurrence: .4 },
      context: { leader: "ブルース", modelMacro: { black_music: 1 }, vocalPresence: 1 }
    },
    {
      method: "liveJazzFunkBreaks", target: "ジャズ",
      vector: { tempo: 129, acousticness: .56, guitarBand: .009, rhythm: .38, onset: .26, structureRecurrence: .25 },
      context: { leader: "ロック", ruleNames: ["ジャズ"], modelMacro: { jazz: .3, world: .8 }, vocalPresence: .08 }
    },
    {
      method: "instrumentalBreakcore", target: "電子音楽",
      vector: { energy: 1, rhythm: .92, onset: .68, guitarBand: .001, distortion: .27, fourOnFloor: .2 },
      context: { leader: "J-POP", modelMacro: { electronic: .4 }, japaneseVocalLikelihood: 0, vocalPresence: .1 }
    },
    {
      method: "classicDubstepHalfTime", target: "ダブステップ",
      vector: { tempo: 72, energy: .78, bass: .82, rhythm: .48, onset: .34, structureRecurrence: .8, reverbTail: .85, guitarBand: .001 },
      context: { leader: "ノイズミュージック", modelMacro: { electronic: .4 }, vocalPresence: .08 }
    },
    {
      method: "doubleTimeTrapPocket", target: "トラップ",
      vector: { tempo: 92, bass: .8, rhythm: .34, onset: .24, liveDnbSubdivisionScore: .72, structureRecurrence: .78, guitarBand: .0005 },
      context: { leader: "ファンク", modelMacro: { black_music: 1 }, vocalPresence: 1 }
    },
    {
      method: "schranzDoubleTimeGrid", target: "テクノ",
      vector: { tempo: 87, energy: .96, bass: .78, rhythm: .62, onset: .44, highBandRatio: .22, distortion: .29, structureRecurrence: .8, dnbBreakbeatScore: .55, guitarBand: .0005 },
      context: { leader: "ダブステップ", labels: ["ダブステップ", "テクノ"], modelMacro: { electronic: 1 } }
    },
    {
      method: "doubleKickMetalTexture", target: "メタル",
      vector: { tempo: 92, energy: .9, bass: .42, highBandRatio: .36, rhythm: .36, onset: .25, guitarBand: .009, structureRecurrence: .25, liveDnbSubdivisionScore: .65 },
      context: { leader: "ロック", modelMacro: { rock: 1 }, vocalPresence: 1 }
    },
    {
      method: "sparseLiveSoulBallad", target: "ソウルミュージック",
      vector: { tempo: 117, energy: .35, bass: .16, midBandRatio: .9, rhythm: .08, onset: .05, acousticness: .7, structureRecurrence: .3 },
      context: { leader: "クラシック音楽", ruleNames: ["ブルース"], blackMusicFine: fine([["ブルース", 96]]), vocalPresence: .6, detectedLanguage: "en" }
    },
    {
      method: "liveDiscoBandPulse", target: "ディスコ",
      vector: { tempo: 118, bass: .18, midBandRatio: .86, rhythm: .8, onset: .58, structureRecurrence: .42 },
      context: { leader: "ラテン", modelMacro: { black_music: .9 }, blackMusicFine: fine([["ディスコ", 72]]), vocalPresence: 1 }
    },
    {
      method: "minimalistClassicalOstinato", target: "クラシック音楽",
      vector: { tempo: 185, energy: .52, bass: .02, midBandRatio: .96, rhythm: .18, onset: .12, acousticness: .7, structureRecurrence: .84, reverbTail: .95 },
      context: { leader: "ドローン", modelMacro: { world: .2 }, vocalPresence: .08 }
    }
  ];
  cases.forEach(({ method, target, vector, context }) => {
    const result = underrepresentedBoundaryTarget(vector, context);
    assert.equal(result?.targetName, target, method);
    assert.equal(result?.method, method, method);
  });
});

test("v31 boundary-domain specialists reject close negatives missing independent evidence", () => {
  const { underrepresentedBoundaryTarget } = loadPatternApi();
  const fine = entries => entries.map(([label, score]) => ({ label, score }));
  const cases = [
    [{ tempo: 88, energy: .96, bass: .86, rhythm: .46, onset: .34, dnbBreakbeatScore: 1, breakbeatIrregularity: .76, guitarBand: .02, fourOnFloor: .12 }, { leader: "ロック" }],
    [{ tempo: 89, energy: .54, dnbBreakbeatScore: .96, breakbeatIrregularity: .71, guitarBand: .0005, fourOnFloor: .17, reverbTail: .97, structureRecurrence: .49 }, { leader: "ロック", labels: ["ロック", "ドラムンベース"], modelMacro: { electronic: .3 }, vocalPresence: 1, stemVocalPresence: 1, detectedLanguage: "en" }],
    [{ tempo: 89, bass: .66, rhythm: .3, onset: .21, liveDnbSubdivisionScore: .65, dnbBreakbeatScore: .78, breakbeatIrregularity: .63, guitarBand: .0018, fourOnFloor: .2, structureRecurrence: .79, reverbTail: 1 }, { leader: "ロック", modelMacro: { electronic: .35 }, vocalPresence: 1, stemVocalPresence: .97, japaneseVocalLikelihood: .08, detectedLanguage: "ja" }],
    [{ tempo: 184, energy: .98, rhythm: .94, onset: .7, dnbBreakbeatScore: .68, breakbeatIrregularity: .62, guitarBand: .008 }, { leader: "ロック", ruleNames: [], modelMacro: { electronic: .7 } }],
    [{ tempo: 86, rhythm: .4, onset: .28, liveDnbSubdivisionScore: .3, fourOnFloor: .3, structureRecurrence: .6, reverbTail: 1 }, { leader: "ドラムンベース", modelMacro: { electronic: 1 } }],
    [{ tempo: 129, rhythm: .5, onset: .36, fourOnFloor: .7, structureRecurrence: .3 }, { leader: "ディスコ", blackMusicFine: fine([["ファンク", 68], ["ディスコ", 72]]), vocalPresence: 1 }],
    [{ tempo: 90, bass: .96, rhythm: .42, onset: .3, breakbeatIrregularity: .78, hiphopPunchScore: .3, guitarBand: .0005, structureRecurrence: .4 }, { leader: "ブルース", modelMacro: { black_music: 1 }, vocalPresence: 1 }],
    [{ tempo: 129, acousticness: .56, guitarBand: .009, rhythm: .38, onset: .26, structureRecurrence: .25 }, { leader: "ロック", ruleNames: ["ジャズ"], modelMacro: { jazz: .3, world: .4 }, vocalPresence: .08 }],
    [{ energy: 1, rhythm: .92, onset: .68, guitarBand: .001, distortion: .27, fourOnFloor: .2 }, { leader: "J-POP", modelMacro: { electronic: .4 }, japaneseVocalLikelihood: .8, vocalPresence: .9 }],
    [{ tempo: 72, energy: .78, bass: .82, rhythm: .48, onset: .34, structureRecurrence: .4, reverbTail: .85, guitarBand: .001 }, { leader: "ノイズミュージック", modelMacro: { electronic: .4 }, vocalPresence: .08 }],
    [{ tempo: 92, bass: .8, rhythm: .34, onset: .24, liveDnbSubdivisionScore: .3, structureRecurrence: .78, guitarBand: .0005 }, { leader: "ファンク", modelMacro: { black_music: 1 }, vocalPresence: 1 }],
    [{ tempo: 87, energy: .96, bass: .78, rhythm: .62, onset: .44, highBandRatio: .22, distortion: .29, structureRecurrence: .8, dnbBreakbeatScore: .8, guitarBand: .0005 }, { leader: "ダブステップ", labels: ["ダブステップ", "テクノ"], modelMacro: { electronic: 1 } }],
    [{ tempo: 92, energy: .9, bass: .42, highBandRatio: .36, rhythm: .36, onset: .25, guitarBand: .002, structureRecurrence: .25, liveDnbSubdivisionScore: .65 }, { leader: "ロック", modelMacro: { rock: 1 }, vocalPresence: 1 }],
    [{ tempo: 117, energy: .35, bass: .16, midBandRatio: .9, rhythm: .08, onset: .05, acousticness: .3, structureRecurrence: .3 }, { leader: "クラシック音楽", ruleNames: ["ブルース"], blackMusicFine: fine([["ブルース", 96]]), vocalPresence: .6, detectedLanguage: "en" }],
    [{ tempo: 118, bass: .18, midBandRatio: .86, rhythm: .8, onset: .58, structureRecurrence: .42 }, { leader: "ラテン", modelMacro: { black_music: .4 }, blackMusicFine: fine([["ディスコ", 72]]), vocalPresence: 1 }],
    [{ tempo: 185, energy: .52, bass: .02, midBandRatio: .96, rhythm: .18, onset: .12, acousticness: .7, structureRecurrence: .5, reverbTail: .95 }, { leader: "ドローン", modelMacro: { world: .2 }, vocalPresence: .08 }]
  ];
  cases.forEach(([vector, context], index) => {
    assert.equal(underrepresentedBoundaryTarget(vector, context), null, `close negative ${index + 1}`);
  });
});

test("v33 cross-recording specialists resolve independent rhythm and timbre domains", () => {
  const { underrepresentedBoundaryTarget } = loadPatternApi();
  const fine = entries => entries.map(([label, score]) => ({ label, score }));
  const cases = [
    {
      method: "vocalLiquidDnbMidTempo", target: "ドラムンベース", negativeVector: { guitarBand: .01 },
      vector: { tempo: 129, energy: .979, bass: .798, rhythm: .613, onset: .438, liveDnbSubdivisionScore: .547, fourOnFloor: .184, guitarBand: .0006, distortion: .252, structureRecurrence: .685, reverbTail: .892 },
      context: { leader: "ロック", ruleNames: ["テクノ", "ダブステップ"], modelMacro: { electronic: .208 }, vocalPresence: 1, stemVocalPresence: .648, detectedLanguage: "en" }
    },
    {
      method: "subduedVocalDnbBreakbeat", target: "ドラムンベース", negativeVector: { breakbeatDensity: .12 },
      vector: { tempo: 86, energy: .616, bass: .552, rhythm: .258, onset: .184, breakbeatDensity: .311, dnbBreakbeatScore: .474, liveDnbSubdivisionScore: .451, breakbeatIrregularity: .317, fourOnFloor: .288, guitarBand: .0016, reverbTail: .855, structureRecurrence: .245 },
      context: { leader: "ロック", modelMacro: { electronic: .29 }, vocalPresence: 1, stemVocalPresence: .745 }
    },
    {
      method: "multilingualVocalDnbSubdivision", target: "ドラムンベース", negativeVector: { dnbBreakbeatScore: .45 },
      vector: { tempo: 89, energy: .611, bass: .665, rhythm: .297, onset: .212, breakbeatDensity: .374, dnbBreakbeatScore: .776, liveDnbSubdivisionScore: .649, breakbeatIrregularity: .628, fourOnFloor: .196, guitarBand: .0017, reverbTail: 1, structureRecurrence: .79 },
      context: { leader: "ロック", modelMacro: { electronic: .35 }, vocalPresence: 1, stemVocalPresence: .972, detectedLanguage: "ko" }
    },
    {
      method: "raggaAmenJungleDomain", target: "ドラムンベース", negativeVector: { fourOnFloor: .5 },
      vector: { tempo: 108, energy: .687, bass: .794, rhythm: .604, onset: .432, onsetDensity: .25, breakbeatIrregularity: .566, dnbBreakbeatScore: .493, syncopation: .782, fourOnFloor: .193, guitarBand: .0001 },
      context: { leader: "ダブステップ", labels: ["ダブステップ", "ドラムンベース"], ruleNames: ["ヒップホップ"], modelMacro: { electronic: 1 }, vocalPresence: .793 }
    },
    {
      method: "archivalJungleSubdivision", target: "ドラムンベース", negativeVector: { liveDnbSubdivisionScore: .4 },
      vector: { tempo: 108, energy: .514, rhythm: .305, onset: .218, onsetDensity: .234, breakbeatIrregularity: .608, liveDnbSubdivisionScore: .807, fourOnFloor: .116, structureRecurrence: .839, guitarBand: .0015 },
      context: { leader: "ダブステップ", labels: ["ダブステップ", "ドラムンベース"], modelMacro: { electronic: 1 }, vocalPresence: .909 }
    },
    {
      method: "liveBandDnbSyncopation", target: "ドラムンベース", negativeVector: { syncopation: .4 },
      vector: { tempo: 117, energy: .767, rhythm: .659, onset: .47, onsetDensity: .188, breakbeatIrregularity: .643, syncopation: .97, fourOnFloor: .133, dnbBreakbeatScore: .493, guitarBand: .0044, structureRecurrence: .669 },
      context: { leader: "ファンク", ruleNames: ["ドラムンベース"], modelMacro: { electronic: .179 }, vocalPresence: 1, detectedLanguage: "en" }
    },
    {
      method: "symphonicDnbTexture", target: "ドラムンベース", negativeVector: { guitarBand: .02 },
      vector: { tempo: 86, energy: .953, highBandRatio: .266, rhythm: .401, onset: .286, dnbBreakbeatScore: .534, guitarBand: .0014, acousticness: .561, distortion: .259, structureRecurrence: .808, reverbTail: .966 },
      context: { leader: "ロック", labels: ["ロック", "ダブステップ"], ruleNames: ["クラシック音楽"] }
    },
    {
      method: "rootsDubDoubleTimePulse", target: "ダブ", negativeVector: { structureRecurrence: .6 },
      vector: { tempo: 89, energy: 1, bass: .933, rhythm: .798, onset: .57, liveDnbSubdivisionScore: .82, fourOnFloor: .217, structureRecurrence: .912, reverbTail: .944, dubSpaceScore: .741, guitarBand: .0002 },
      context: { leader: "ファンク", labels: ["ファンク", "ダブ", "レゲエ"], ruleNames: ["ダブ"], modelMacro: { black_music: 1 }, vocalPresence: .439 }
    },
    {
      method: "rootsDubEchoPulse", target: "ダブ", negativeContext: { stemVocalPresence: .2, vocalEnergyRatio: .2, sampleCount: 2 },
      vector: { tempo: 129, energy: 1, bass: 1, lowBandRatio: .895, highBandRatio: .014, rhythm: .917, onset: .655, fourOnFloor: .172, offbeatEmphasis: .249, reverbTail: .859, dubSpaceScore: .793 },
      context: { leader: "ディープ・ハウス", modelMacro: { black_music: .249 }, vocalPresence: .28, stemVocalPresence: 0, vocalEnergyRatio: .019, sampleCount: 1 }
    },
    {
      method: "sparseDubSkankEcho", target: "ダブ", negativeVector: { reggaeSkankScore: .3 },
      vector: { tempo: 89, energy: .671, bass: .285, midBandRatio: .749, rhythm: .395, onset: .282, breakbeatIrregularity: .524, dnbBreakbeatScore: .769, reggaeSkankScore: .621, offbeatEmphasis: .217, guitarBand: .0037, structureRecurrence: .236 },
      context: { leader: "ロック", labels: ["ロック", "レゲエ"], ruleNames: ["ダブ"], modelMacro: { black_music: .585, electronic: .433 }, vocalPresence: .273 }
    },
    {
      method: "vocaloidDnbSubdivision", target: "ドラムンベース", negativeContext: { japaneseVocalLikelihood: .1 },
      vector: { tempo: 96, energy: .874, rhythm: .543, onset: .388, liveDnbSubdivisionScore: .834, fourOnFloor: .272, guitarBand: .0022, structureRecurrence: .832, reverbTail: 1 },
      context: { leader: "J-POP", vocalPresence: 1, stemVocalPresence: .867, japaneseVocalLikelihood: .996, detectedLanguage: "ja" }
    },
    {
      method: "brokenBeatElectronicDomain", target: "電子音楽", negativeVector: { fourOnFloor: .5 },
      vector: { tempo: 185, bass: 1, rhythm: 1, onset: .853, onsetDensity: .375, breakbeatIrregularity: .783, dnbBreakbeatScore: .922, syncopation: .813, fourOnFloor: .13, guitarBand: .0002 },
      context: { leader: "テクノ", ruleNames: ["ドラムンベース", "ファンク"], modelMacro: { electronic: 1 }, vocalPresence: 0 }
    },
    {
      method: "vocalNuJazzSyncopation", target: "ジャズ", negativeVector: { syncopation: .4 },
      vector: { tempo: 144, energy: .853, rhythm: .825, onset: .589, onsetDensity: .484, syncopation: .964, acousticness: .57, harmonicRatio: .863, highBandRatio: .014, distortion: .205 },
      context: { leader: "フォーク", ruleNames: ["ファンク"], modelMacro: { electronic: .427 }, vocalPresence: .415 }
    },
    {
      method: "footworkMachineGrid", target: "テクノ", negativeVector: { liveDnbSubdivisionScore: .7 },
      vector: { tempo: 81, energy: .971, bass: 1, rhythm: .738, onset: .527, breakbeatIrregularity: .674, dnbBreakbeatScore: .89, hiphopPunchScore: .664, dubSpaceScore: .791, liveDnbSubdivisionScore: .454, fourOnFloor: .152, structureRecurrence: .633, guitarBand: .0002 },
      context: { leader: "テクノ", labels: ["テクノ", "ドラムンベース"], ruleNames: ["トラップ"], modelMacro: { electronic: 1 } }
    },
    {
      method: "jukeVocalSamplePocket", target: "ヒップホップ", negativeContext: { stemVocalPresence: .8 },
      vector: { tempo: 81, energy: .939, bass: 1, rhythm: .727, onset: .519, dubSpaceScore: .817, structureRecurrence: .393, guitarBand: .0005 },
      context: { leader: "ファンク", labels: ["ファンク", "ヒップホップ"], ruleNames: ["ヒップホップ"], modelMacro: { black_music: 1 }, vocalPresence: 1, stemVocalPresence: .163 }
    },
    {
      method: "halftimeVocalLiquidDnb", target: "ドラムンベース", negativeContext: { modelMacro: { electronic: .1 } },
      vector: { tempo: 86, energy: .975, highBandRatio: .283, rhythm: .464, onset: .331, dnbBreakbeatScore: .531, liveDnbSubdivisionScore: .439, guitarBand: .0017, fourOnFloor: .176, structureRecurrence: .761, reverbTail: 1 },
      context: { leader: "ロック", modelMacro: { electronic: .316 }, vocalPresence: 1, stemVocalPresence: .714, detectedLanguage: "en" }
    },
    {
      method: "distortedLiveDnbBand", target: "ドラムンベース", negativeVector: { guitarBand: .02 },
      vector: { tempo: 86, energy: .701, highBandRatio: .222, rhythm: .364, onset: .26, dnbBreakbeatScore: .529, liveDnbSubdivisionScore: .516, guitarBand: .0057, harmonicRatio: .851, structureRecurrence: .746, reverbTail: .905 },
      context: { leader: "ファンク", modelMacro: { rock: .233 }, vocalPresence: .318 }
    },
    {
      method: "classic140DubstepPressure", target: "ダブステップ", negativeVector: { bass: .6 },
      vector: { tempo: 136, bass: 1, lowBandRatio: .929, rhythm: .587, onset: .419, onsetDensity: .266, dnbBreakbeatScore: .796, dubSpaceScore: .805, breakbeatIrregularity: .574, syncopation: .783, fourOnFloor: .178, guitarBand: .0001, structureRecurrence: .744 },
      context: { leader: "トランス", ruleNames: ["ダブ"], modelMacro: { electronic: 1 }, vocalPresence: .793, stemVocalPresence: .035, vocalEnergyRatio: .095 }
    },
    {
      method: "schranzLowEnergyMachineGrid", target: "テクノ", negativeVector: { structureRecurrence: .6 },
      vector: { tempo: 86, energy: .717, bass: .892, rhythm: .312, onset: .223, distortion: .248, fourOnFloor: .258, dnbBreakbeatScore: .496, dubSpaceScore: .72, structureRecurrence: .937, guitarBand: .001 },
      context: { leader: "ダブステップ", modelMacro: { electronic: 1 }, vocalPresence: 0 }
    },
    {
      method: "instrumentalBreakcoreDomain", target: "電子音楽", negativeVector: { guitarBand: .02 },
      vector: { tempo: 129, energy: .811, bass: .912, rhythm: .661, onset: .472, onsetDensity: .219, breakbeatIrregularity: .547, liveDnbSubdivisionScore: .618, syncopation: .745, fourOnFloor: .173, guitarBand: .0002 },
      context: { leader: "ファンク", ruleNames: ["テクノ", "ダブステップ"], modelMacro: { electronic: .28 }, vocalPresence: .08 }
    },
    {
      method: "sampledBreakcoreDomain", target: "電子音楽", negativeContext: { vocalPresence: .8 },
      vector: { tempo: 89, energy: 1, bass: .75, rhythm: .792, onset: .566, liveDnbSubdivisionScore: .789, fourOnFloor: .23, guitarBand: .0006, distortion: .26, structureRecurrence: .536 },
      context: { leader: "ロック", modelMacro: { electronic: .226 }, vocalPresence: .208 }
    },
    {
      method: "liveJazzFunkDenseBreaks", target: "ジャズ", negativeContext: { vocalPresence: .8 },
      vector: { tempo: 99, energy: .601, midBandRatio: .597, highBandRatio: .011, rhythm: .499, onset: .356, onsetDensity: .438, acousticness: .576, harmonicRatio: .881, breakbeatIrregularity: .657, syncopation: .86, fourOnFloor: .131, structureRecurrence: .881, guitarBand: .0028 },
      context: { leader: "レゲエ", modelMacro: { black_music: 1 }, vocalPresence: 0 }
    },
    {
      method: "orchestralBoomBapRap", target: "ヒップホップ", negativeVector: { acousticness: .3 },
      vector: { tempo: 89, energy: 1, bass: .518, midBandRatio: .606, rhythm: 1, onset: .857, dnbBreakbeatScore: .96, hiphopPunchScore: .672, acousticness: .616, harmonicRatio: .858, fourOnFloor: .077, guitarBand: .0015 },
      context: { leader: "テクノ", ruleNames: ["ファンク"], modelMacro: { electronic: 1 }, vocalPresence: 1, stemVocalPresence: .819, detectedLanguage: "en" }
    },
    {
      method: "synthLeadDoubleTimeTrap", target: "トラップ", negativeVector: { fourOnFloor: .5 },
      vector: { tempo: 117, energy: 1, midBandRatio: .702, rhythm: .648, onset: .463, liveDnbSubdivisionScore: .751, breakbeatIrregularity: .526, syncopation: .7, fourOnFloor: .131, guitarBand: .0004, reverbTail: .988 },
      context: { leader: "チップチューン", ruleNames: ["ハウス"], modelMacro: { electronic: 1 }, vocalPresence: 1, stemVocalPresence: .691, detectedLanguage: "en" }
    },
    {
      method: "doubleKickThrashTexture", target: "メタル", negativeVector: { harmonicRatio: .9 },
      vector: { tempo: 92, energy: .84, bass: .687, highBandRatio: .293, rhythm: .629, onset: .449, distortion: .242, harmonicRatio: .754, syncopation: 0, fourOnFloor: .283 },
      context: { leader: "ダブステップ", modelMacro: { electronic: 1, rock: .356 }, vocalPresence: 1, stemVocalPresence: .706, detectedLanguage: "en" }
    },
    {
      method: "sparseLiveSoulVocal", target: "ソウルミュージック", negativeContext: { vocalEnergyRatio: .4 },
      vector: { tempo: 99, energy: .522, bass: .368, midBandRatio: .678, rhythm: .195, onset: .14, onsetDensity: .234, acousticness: .579, harmonicRatio: .881, guitarBand: .0013, distortion: .139 },
      context: { leader: "クラシック音楽", modelMacro: { black_music: .273 }, blackMusicFine: fine([["ブルース", 85.5]]), vocalPresence: 1, stemVocalPresence: 1, vocalEnergyRatio: .818, detectedLanguage: "en" }
    }
  ];
  cases.forEach(({ method, target, vector, context, negativeVector = {}, negativeContext = {} }) => {
    const positive = underrepresentedBoundaryTarget(vector, context);
    assert.equal(positive?.targetName, target, method);
    assert.equal(positive?.method, method, method);
    const negative = underrepresentedBoundaryTarget({ ...vector, ...negativeVector }, { ...context, ...negativeContext });
    assert.notEqual(negative?.method, method, `${method} close negative`);
  });
});

test("disco and house specialists separate song recurrence from low-frequency club pulse", () => {
  const { underrepresentedBoundaryTarget } = loadPatternApi();
  const discoSong = {
    tempo: 117, rhythm: .89, onset: .64, harmonicRatio: .87,
    structureRecurrence: .91, highBandRatio: .065, distortion: .24
  };
  assert.equal(underrepresentedBoundaryTarget(discoSong, {
    leader: "テクノ", ruleNames: ["ファンク", "ハウス"], vocalPresence: 1
  })?.targetName, "ディスコ");

  const discoHouse = {
    tempo: 123, bass: 1, lowBandRatio: .89, rhythm: .93, onset: .66,
    reverbTail: 1, structureRecurrence: .66
  };
  assert.equal(underrepresentedBoundaryTarget(discoHouse, {
    leader: "ディスコ", ruleNames: ["テクノ", "ディープ・ハウス"]
  })?.targetName, "ハウス");
  assert.equal(underrepresentedBoundaryTarget({ ...discoHouse, bass: .55, lowBandRatio: .4 }, {
    leader: "ディスコ", ruleNames: ["テクノ", "ディープ・ハウス"]
  }), null);
});

test("language evidence cannot override strong non-pop groove specialists", () => {
  const { underrepresentedBoundaryTarget } = loadPatternApi();
  const japaneseFunk = {
    bass: .71, syncopation: .98, fourOnFloor: .13,
    structureRecurrence: .44, distortion: .24
  };
  const context = {
    leader: "J-POP", japaneseVocalLikelihood: .96,
    blackMusicFine: [{ label: "ファンク", score: 84 }]
  };
  const target = underrepresentedBoundaryTarget(japaneseFunk, context);
  assert.equal(target?.targetName, "ファンク");
  assert.equal(target?.clearPopStyle, true);
  assert.equal(underrepresentedBoundaryTarget({ ...japaneseFunk, fourOnFloor: .72 }, context), null);
});

test("syncopated non-four-on-floor funk strengthens the black-music macro", () => {
  const { funkBlackMacroPulseEvidence, macroGenreScore } = loadPatternApi();
  const cleanFunk = {
    tempo: 129, energy: .64, bass: .95, lowBandRatio: .77, midBandRatio: .21,
    highBandRatio: .02, rhythm: .85, onset: .61, brightness: .21, zcr: .086,
    chromaEntropy: .965, rmsContrast: .194, syncopation: .7, fourOnFloor: .1,
    highBandPulse: 0, breakbeatDensity: .17, structureRecurrence: .35, distortion: .17
  };
  assert.equal(funkBlackMacroPulseEvidence(cleanFunk), true);
  assert.ok(macroGenreScore(cleanFunk, "black") > macroGenreScore(cleanFunk, "electronic"));
  assert.equal(funkBlackMacroPulseEvidence({ ...cleanFunk, fourOnFloor: .78, structureRecurrence: .8 }), false);
  assert.equal(funkBlackMacroPulseEvidence({ ...cleanFunk, tempo: 174, highBandPulse: .45, breakbeatDensity: .7 }), false);
});

test("server Pop styles do not leak onto a non-Pop Top1", () => {
  const { inferMusicGenres } = loadPatternApi();
  const inferred = inferMusicGenres({
    tempo: 118, energy: .62, bass: .48, rhythm: .5, onset: .3,
    lowBandRatio: .32, midBandRatio: .38, highBandRatio: .3,
    embeddingGenrePrediction: {
      source: "shared-production-local-classifier",
      method: "shared-production-local-classifier",
      confidence: 72,
      needsReview: false,
      macro: [{ label: "rock", score: 100 }, { label: "pop", score: 65 }],
      top: [{ name: "ロック", score: 72 }, { name: "J-POP", score: 34 }],
      popStyle: [{ style: "city_pop", label: "シティ・ポップ", score: 88 }]
    }
  });
  assert.equal(inferred.top[0].name, "ロック");
  assert.equal(inferred.style.length, 0);
  assert.equal(inferred.inferredStyle, "");
});

test("electronic breakdown evidence rejects a low-pulse hip-hop saturation", () => {
  const { electronicBreakdownFalsePositiveEvidence, applyElectronicBreakdownCorrection } = loadPatternApi();
  const elektrobankVector = {
    tempo: 108, energy: .6534, bass: .3318, lowBandRatio: .2128, midBandRatio: .6482,
    highBandRatio: .139, rhythm: .2023, onset: .1445, brightness: .4937, zcr: .114,
    chromaEntropy: .9386, harmonicRatio: .8653, guitarBand: .0116, distortion: .1946,
    hiphopPunchScore: .3089, highBandPulse: .0008, squareWave: .2795,
    structureRecurrence: .4596, breakbeatCycle: .3355, rmsBuild: .4639
  };
  assert.equal(electronicBreakdownFalsePositiveEvidence(elektrobankVector), true);
  assert.equal(electronicBreakdownFalsePositiveEvidence({
    ...elektrobankVector,
    bass: .68, lowBandRatio: .58, rhythm: .62, onset: .48, hiphopPunchScore: .72
  }), false);

  const corrected = applyElectronicBreakdownCorrection({
    source: "test", method: "local", confidence: 100, needsReview: false,
    macro: [{ macro: "black_music", label: "black music", score: 100 }, { macro: "electronic", label: "electronic", score: 28 }],
    style: [{ style: "black_music_other", name: "black_music_other", score: 100 }],
    inferredStyle: "black_music_other",
    top: [
      { name: "ヒップホップ", score: 100, rawScore: 100, acousticScore: 100, macro: "black_music" },
      { name: "ファンク", score: 25, rawScore: 25, acousticScore: 25, macro: "black_music" }
    ]
  }, {}, elektrobankVector);
  assert.equal(corrected.top[0].name, "電子音楽");
  assert.ok(corrected.top[0].score < 100);
  assert.ok(corrected.top.find(item => item.name === "ヒップホップ").score <= 45);
  assert.equal(corrected.macro[0].macro, "electronic");
  assert.equal(corrected.inferredStyle, "");
  assert.equal(corrected.style.some(item => item.style === "black_music_other"), false);
  assert.match(corrected.method, /electronic-breakdown-guard/);
});

test("stored audio genres wait for the trained model before revision migration", () => {
  const { state, refreshReversibleSoundClothShirt } = loadPatternApi();
  state.genreModel = null;
  const shirt = {
    id: "stored-audio",
    engineId: "youtube_reversible",
    genreInferenceRevision: "older-revision",
    audioFeatures: { genreAnalysis: { top: [{ name: "ヒップホップ", score: 100 }] } },
    art: '<svg data-engine-family="terra-5.6" data-peripheral-geometry="suppressed-v1"></svg>'
  };
  refreshReversibleSoundClothShirt(shirt);
  assert.equal(shirt.genreInferenceRevision, "older-revision");
  assert.equal(shirt.audioFeatures.genreAnalysis.top[0].name, "ヒップホップ");
});

test("sparse candidates cannot displace a stronger learned Fine Top1", () => {
  const { applySparseGenreEvidence } = loadPatternApi();
  const highImpactDetail = {
    rms: Array.from({ length: 20 }, (_, i) => .52 + (i % 2) * .25),
    onset: Array.from({ length: 20 }, (_, i) => i % 2 ? .92 : .18),
    zeroCrossing: Array.from({ length: 20 }, () => .76),
    centroid: Array.from({ length: 20 }, (_, i) => 1800 + (i % 3) * 900),
    bandTimeline: Array.from({ length: 20 }, () => [.08, .08, .08, .14, .5, .45, .12, .1])
  };
  const analysis = { macro: [{ macro: "rock", score: 96 }], top: [{ name: "メタル", score: 97 }, { name: "ロック", score: 74 }] };
  const enriched = applySparseGenreEvidence(analysis, { energy: .92, bass: .52, onset: .76, rhythm: .82, brightness: .52, tempo: 182, detail: highImpactDetail });
  assert.equal(enriched.top[0].name, "メタル");
  const hardcore = enriched.top.find(item => item.name === "ハードコア");
  assert.ok(hardcore?.zeroShotEvidence);
  assert.ok(hardcore.score < enriched.top[0].score);
});

test("aerosol renderer varies topology without relying on transform-only differences", () => {
  const { generateSoundClothReversibleSvg } = loadPatternApi();
  const genres = ["テクノ", "ダブステップ", "チップチューン", "パンク", "メタル", "フォーク", "ラテン"];
  const topologies = genres.map((genre, index) => {
    const svg = generateSoundClothReversibleSvg({
      id: `topology-${index}`,
      label: genre,
      audioFileName: `${genre}.wav`,
      variantSalt: 1,
      audio: {
        inferredGenre: genre,
        genreAnalysis: { method: "two-stage-local-classifier", top: [{ name: genre, score: 98 }] },
        energy: 0.66,
        rms: 0.66,
        bass: 0.58,
        onset: 0.62,
        rhythm: 0.7,
        brightness: 0.48,
        tempo: 124,
        centroid: 2800,
        chroma: Array.from({ length: 12 }, (_, pc) => pc % 4 === 0 ? 0.8 : 0.2),
        detail: {
          rms: Array.from({ length: 32 }, (_, i) => 0.5 + Math.sin(i * 0.19) * 0.16),
          bass: Array.from({ length: 32 }, (_, i) => 0.5 + Math.cos(i * 0.15) * 0.14),
          centroid: Array.from({ length: 32 }, (_, i) => 0.5 + Math.sin(i * 0.12) * 0.12),
          onset: Array.from({ length: 32 }, (_, i) => i % 6 === 0 ? 0.9 : 0.2),
          waveform: Array.from({ length: 96 }, (_, i) => Math.sin(i * 0.23) * 0.64)
        }
      }
    }, 1800000200000 + index * 101, { variantSeed: index * 17 });
    assert.doesNotMatch(svg, /data-shape-turn=/);
    assert.doesNotMatch(svg, /data-shape-aspect/);
    return svg.match(/data-aerosol-topology="([^"]+)"/)?.[1] || "";
  });
  assert.ok(new Set(topologies).size >= genres.length - 1, `too few topologies: ${topologies.join(", ")}`);
});

test("each Terra genre emits its own primary renderer without shared family overlays", () => {
  const { generateSoundClothReversibleSvg, terraGenreEngines } = loadPatternApi();
  const primaryKinds = {
    "アンビエント": "ambient-breath-rib-0",
    "ドローン": "drone-sustain-pillar-0",
    "ノイズミュージック": "noise-burn-island-0",
    "電子音楽": "circuit-gate",
    "テクノ": "machine-frame",
    "ハウス": "house-canopy-roof",
    "ディープ・ハウス": "bass-basin",
    "トランス": "trance-open-portal-0",
    "ドラムンベース": "dnb-rail-cell-0-0",
    "ダブステップ": "dubstep-wobble-ridge-0",
    "チップチューン": "chiptune-pixel-cell",
    "ヒップホップ": "vinyl-deck-0",
    "トラップ": "trap-hat-cell-0",
    "レゲエ": "reggae-ribbon",
    "ダブ": "echo-trail",
    "ブルース": "blue-drop",
    "ロック": "fretboard-spine",
    "パンク": "punk-scratch-0",
    "ハードコア": "hardcore-wedge-0",
    "メタル": "metal-blade-0",
    "ジャズ": "cymbal-open-rim",
    "ファンク": "funk-backbeat-hit-0",
    "ソウルミュージック": "soul-vessel-0",
    "ディスコ": "disco-mirror-orbit",
    "シティ・ポップ": "city-window-cell",
    "J-POP": "jpop-banner-0",
    "アニメソング": "anime-core-star",
    "クラシック音楽": "classical-staff-line",
    "オペラ": "opera-proscenium",
    "フォーク": "folk-warp-thread-0",
    "ラテン": "clave-hit-0",
    "ワールドミュージック": "world-compass-route"
  };
  assert.equal(new Set(Object.values(primaryKinds)).size, Object.keys(primaryKinds).length);
  assert.deepEqual(Object.keys(primaryKinds).sort(), Object.keys(terraGenreEngines).sort());

  Object.entries(primaryKinds).forEach(([genre, kind], index) => {
    const svg = generateSoundClothReversibleSvg({
      id: `distinct-primary-${index}`,
      label: genre,
      audioFileName: `${genre}.wav`,
      audio: {
        inferredGenre: genre,
        genreAnalysis: { method: "distinct-primary-test", top: [{ name: genre, score: 99 }] },
        energy: .58, rms: .58, bass: .52, onset: .46, rhythm: .6, brightness: .5, tempo: 112, centroid: 2600,
        chroma: Array.from({ length: 12 }, (_, pc) => pc === index % 12 ? .88 : .2),
        detail: {
          rms: Array.from({ length: 32 }, (_, i) => .48 + Math.sin(i * .2 + index) * .12),
          bass: Array.from({ length: 32 }, (_, i) => .44 + Math.cos(i * .16 + index) * .12),
          centroid: Array.from({ length: 32 }, (_, i) => .5 + Math.sin(i * .11 + index) * .1),
          onset: Array.from({ length: 32 }, (_, i) => i % 6 === 0 ? .8 : .2),
          waveform: Array.from({ length: 96 }, (_, i) => Math.sin(i * .22 + index) * .6)
        }
      }
    }, 1800000600000 + index * 31, { variantSeed: index * 29 });
    assert.match(svg, new RegExp(`data-engine=\"${terraGenreEngines[genre].id}\"`));
    assert.match(svg, new RegExp(`data-terra-kind=\"${kind}`));
    assert.doesNotMatch(svg, /id="terra_family_structure"/);
    assert.doesNotMatch(svg, /id="terra_council_composition"/);
  });
});
