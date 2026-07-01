import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(SCRIPT_DIR, "..");
const HTML_PATH = path.join(DEMO_DIR, "MUSIC MEMORY FITTING ROOM.html");
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

function loadPatternApi() {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const appScript = scripts.at(-1).replace(
    /cleanupStoredSessions\(\);\s*render\(\);\s*loadCalibratedGenreProfiles\(\);\s*$/,
    "globalThis.__patternApi={genrePatternProfiles,musicGenreProfiles,resolveGenrePattern,resolveGenreVisualProfile,generateSoundClothReversibleSvg,pcmProtectedDataGroupFromBytes,decodeProtectedPcmDataFromSvg};"
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
  vm.runInContext(appScript, context);
  return context.__patternApi;
}

test("genre pattern profiles cover all calibrated genre names", () => {
  const { genrePatternProfiles, musicGenreProfiles, resolveGenrePattern, resolveGenreVisualProfile } = loadPatternApi();
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

  assert.ok(patternNames.length >= 32);
  assert.deepEqual(patternNames.sort(), genreNames.sort());
  assert.equal(new Set(patternNames.map(name => genrePatternProfiles[name].id)).size, patternNames.length);

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
  }
});

test("demo protected PCM particle layer decodes from circle geometry", () => {
  const { pcmProtectedDataGroupFromBytes, decodeProtectedPcmDataFromSvg } = loadPatternApi();
  const source = Uint8Array.from([0, 64, 128, 192, 255]);
  const layer = pcmProtectedDataGroupFromBytes(source, 1, 5, { textureSeed: 12, textureMode: "memory-orbit", textureRegion: "orbit" });
  const decoded = decodeProtectedPcmDataFromSvg(`<svg>${layer}</svg>`);
  const decodedBytes = Buffer.from(decoded.pcmSketch, "base64");

  assert.match(layer, /data-encoding="mulaw8-protected-particle-field-v1"/);
  assert.equal((layer.match(/<circle\b/g) || []).length, source.length);
  assert.deepEqual([...decodedBytes], [...source]);
  assert.doesNotMatch(layer, /data-byte=/);
  assert.doesNotMatch(layer, /data-index=/);
});

test("generated genre SVG uses aerosol particle style without SVG effects", () => {
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
  assert.match(svg, /data-visual-style="aerosol-particle-field-v1"/);
  assert.match(svg, /data-form-mode="genre-j-pop"/);
  assert.match(svg, /data-aerosol-archetype="/);
  assert.match(svg, /data-aerosol-topology="/);
  assert.match(svg, /data-exclusive-zone="/);
  assert.match(svg, /data-composition-category="/);
  assert.match(svg, /data-gesture-mode="/);
  assert.match(svg, /data-classifier-method="/);
  assert.match(svg, /data-macro-genre="/);
  const archetype = svg.match(/data-aerosol-archetype="([^"]+)"/)?.[1] || "";
  assert.ok(knownAerosolArchetypes.has(archetype), `unknown aerosol archetype ${archetype}`);
  assert.match(svg, /id="aerosol_particle_field"/);
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

test("aerosol renderer assigns unique exclusive zones across genres", () => {
  const { generateSoundClothReversibleSvg, musicGenreProfiles } = loadPatternApi();
  const zones = new Map();
  const gestures = new Map();
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
    const zone = svg.match(/id="aerosol_particle_field"[^>]*data-exclusive-zone="([^"]+)"/)?.[1] || "";
    const category = svg.match(/id="aerosol_particle_field"[^>]*data-composition-category="([^"]+)"/)?.[1] || "";
    const gesture = svg.match(/id="aerosol_particle_field"[^>]*data-gesture-mode="([^"]+)"/)?.[1] || "";
    const particles = [...svg.matchAll(/<circle\b([^>]*)>/g)]
      .map(match => match[1])
      .filter(attrs => /data-feature="aerosol-particle"/.test(attrs));
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
    assert.ok(!zones.has(zone), `${genre} shares zone ${zone} with ${zones.get(zone)}`);
    assert.ok(!gestures.has(gesture), `${genre} shares gesture ${gesture} with ${gestures.get(gesture)}`);
    assert.ok(particles.length >= 500, `${genre} collapsed particle count ${particles.length}`);
    assert.ok(Math.max(width, height) >= 240, `${genre} weak footprint ${width}x${height}`);
    assert.ok(Math.min(width, height) >= 90, `${genre} over-compressed footprint ${width}x${height}`);
    zones.set(zone, genre);
    gestures.set(gesture, genre);
  });
  assert.equal(zones.size, Object.keys(musicGenreProfiles).length);
  assert.equal(gestures.size, Object.keys(musicGenreProfiles).length);
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
