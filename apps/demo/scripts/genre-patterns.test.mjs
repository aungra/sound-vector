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
    "globalThis.__patternApi={genrePatternProfiles,musicGenreProfiles,resolveGenrePattern,resolveGenreVisualProfile};"
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
    assert.equal(typeof profile.primaryScale, "number", `${name} primaryScale`);
    assert.equal(typeof profile.variantScale, "number", `${name} variantScale`);
    assert.equal(typeof profile.variantOpacity, "number", `${name} variantOpacity`);
    assert.ok(Array.isArray(profile.variantFamilies) && profile.variantFamilies.length >= 3, `${name} variantFamilies`);
    profile.variantFamilies.forEach(family => assert.ok(knownFamilies.has(family), `${name} variant ${family}`));

    const resolved = resolveGenrePattern({ genreAnalysis: { top: [{ name, score: 99 }] } }, 12345, 2);
    assert.equal(resolved.id, profile.id);
    assert.equal(resolved.genreName, name);
    const visual = resolveGenreVisualProfile(resolved, { genreAnalysis: { top: [{ name, score: 99 }] } }, 12345);
    assert.ok(knownSilhouettes.has(visual.silhouette), `${name} resolved silhouette`);
    assert.ok(knownTextureRegions.has(visual.textureRegion), `${name} resolved textureRegion`);
  }
});
