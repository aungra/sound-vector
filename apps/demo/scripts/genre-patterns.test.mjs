import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(SCRIPT_DIR, "..");
const HTML_PATH = path.join(DEMO_DIR, "MUSIC MEMORY FITTING ROOM.html");

function loadPatternApi() {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const appScript = scripts.at(-1).replace(
    /cleanupStoredSessions\(\);\s*render\(\);\s*loadCalibratedGenreProfiles\(\);\s*$/,
    "globalThis.__patternApi={genrePatternProfiles,musicGenreProfiles,resolveGenrePattern,resolveGenreVisualProfile,generateSoundClothReversibleSvg};"
  );
  const context = {
    console,
    Date,
    Math,
    JSON,
    URL,
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

  assert.equal(patternNames.length, 30);
  assert.deepEqual(patternNames.sort(), genreNames.sort());
  assert.equal(new Set(patternNames.map(name => genrePatternProfiles[name].id)).size, 30);

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

test("generated genre SVG uses transform-aware collision pass", () => {
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
  assert.match(svg, /data-collision-pass="transform-aware-final-v1"/);
  assert.match(svg, /data-form-mode="genre-j-pop"/);
  assert.doesNotMatch(svg, /stroke-opacity=/);
  assert.doesNotMatch(svg, /fill-opacity=/);
  assert.doesNotMatch(svg, /data-byte=/);
  assert.doesNotMatch(svg, /data-index=/);
});
