import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEMO_DIR = path.resolve(SCRIPT_DIR, "..");
const HTML_PATH = path.join(DEMO_DIR, "MUSIC MEMORY FITTING ROOM.html");
const DELAUNAY_VENDOR_PATH = path.join(DEMO_DIR, "vendor", "d3-delaunay.min.js");
const ARTIST_MASTERS_PATH = path.join(DEMO_DIR, "artist-master-patterns.js");

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function byteHash(base64) {
  return sha256(Buffer.from(String(base64 || ""), "base64"));
}

export function loadIllustratorApi({ artistMasters = false } = {}) {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const appScript = scripts.at(-1).replace(
    /cleanupStoredSessions\(\);\s*(?:restoreLatestAcceptedSession\(\);\s*)?render\(\);\s*loadCalibratedGenreProfiles\(\);\s*$/,
    "globalThis.__illustratorApi={musicGenreProfiles,genrePatternProfiles,generateSoundClothReversibleSvg,pcmProtectedGeometryGroupFromDetail,textureFieldOptionsFromSvg,decodeProtectedPcmDataFromSvg,pcmSketchFromSamples};"
  );
  if (!appScript.includes("__illustratorApi")) throw new Error("Unable to isolate the demo SVG generator.");
  const context = {
    console,
    Date,
    Math,
    JSON,
    URL,
    Buffer,
    setTimeout,
    clearTimeout,
    atob: value => Buffer.from(String(value), "base64").toString("binary"),
    btoa: value => Buffer.from(String(value), "binary").toString("base64"),
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
  if (artistMasters && fs.existsSync(ARTIST_MASTERS_PATH)) {
    vm.runInContext(fs.readFileSync(ARTIST_MASTERS_PATH, "utf8"), context);
  }
  vm.runInContext(appScript, context);
  return context.__illustratorApi;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function syntheticChroma(index, entropy = 0.6) {
  const phase = index * 0.71;
  return Array.from({ length: 12 }, (_, pc) => {
    const harmonic = Math.sin(phase + pc * 1.31) * 0.5 + 0.5;
    const cluster = pc === index % 12 || pc === (index + 7) % 12 ? 1 : 0;
    return clamp01(0.12 + harmonic * entropy * 0.42 + cluster * (1 - entropy) * 0.64);
  });
}

function syntheticSamples(profile, index, seconds = 4, sampleRate = 16000) {
  const samples = new Float32Array(seconds * sampleRate);
  const tempo = Number(profile.tempo || 96);
  const bass = clamp01(profile.bass);
  const energy = clamp01(profile.energy);
  const rhythm = clamp01(profile.rhythm);
  const onset = clamp01(profile.onset);
  const brightness = clamp01(profile.brightness);
  const baseHz = 45 + bass * 80 + (index % 5) * 7;
  const leadHz = 180 + brightness * 1400 + (index % 7) * 31;
  for (let i = 0; i < samples.length; i += 1) {
    const t = i / sampleRate;
    const beat = Math.pow(Math.max(0, Math.sin(t * tempo / 60 * Math.PI * 2)), 2 + onset * 5);
    const slow = Math.sin(t * Math.PI * 2 * (0.08 + rhythm * 0.8) + index);
    const bassTone = Math.sin(t * Math.PI * 2 * baseHz + slow * 0.7) * bass * 0.46;
    const leadTone = Math.sin(t * Math.PI * 2 * leadHz + Math.sin(t * 7.1) * 0.8) * brightness * 0.2;
    const midTone = Math.sin(t * Math.PI * 2 * (baseHz * 2.8 + index * 9)) * 0.16;
    samples[i] = Math.max(-1, Math.min(1, (bassTone + leadTone + midTone + beat * onset * 0.34 + slow * 0.08) * (0.38 + energy * 0.7)));
  }
  return samples;
}

function timelines(profile, index, length = 96) {
  const tempo = Number(profile.tempo || 96);
  const rhythm = clamp01(profile.rhythm);
  const onset = clamp01(profile.onset);
  const bass = clamp01(profile.bass);
  const brightness = clamp01(profile.brightness);
  const energy = clamp01(profile.energy);
  return {
    rms: Array.from({ length }, (_, i) => clamp01(energy * (0.56 + Math.sin(i * 0.16 + index) * 0.18 + Math.sin(i * tempo * 0.0017) * 0.15))),
    bass: Array.from({ length }, (_, i) => clamp01(bass * (0.62 + Math.sin(i * 0.12 + index * 0.37) * 0.26))),
    centroid: Array.from({ length }, (_, i) => clamp01(brightness * (0.58 + Math.sin(i * 0.19 + index * 0.63) * 0.26))),
    onset: Array.from({ length }, (_, i) => clamp01(onset * (i % Math.max(3, Math.round(12 - rhythm * 7)) === 0 ? 1 : 0.28))),
    waveform: Array.from({ length: 192 }, (_, i) => Math.sin(i * 0.15 + index) * energy * 0.7 + Math.sin(i * 0.041 * (1 + rhythm * 3)) * bass * 0.3)
  };
}

export function moodForGenre(api, genre, index) {
  const profile = api.musicGenreProfiles[genre];
  const samples = syntheticSamples(profile, index);
  const pcmSketch = api.pcmSketchFromSamples(samples, 16000, 8000, 4);
  const series = timelines(profile, index);
  return {
    id: `illustrator-genre-${index + 1}`,
    label: genre,
    audioFileName: `${genre}-illustrator-reference.wav`,
    variantSalt: 0,
    audio: {
      ...profile,
      centroid: Math.round(500 + clamp01(profile.brightness) * 5200),
      spectralCentroid: Math.round(500 + clamp01(profile.brightness) * 5200),
      chroma: syntheticChroma(index, profile.chromaEntropy),
      temporalProfile: series.rms.slice(0, 16),
      inferredGenre: genre,
      genreAnalysis: { top: [{ name: genre, score: 100 }] },
      detail: { ...pcmSketch, rms: series.rms, bass: series.bass, centroid: series.centroid, onset: series.onset, waveform: series.waveform }
    }
  };
}

export function injectProtectedGeometry(api, svg, detail, targetFrames = 24000) {
  const protectedGroup = api.pcmProtectedGeometryGroupFromDetail(detail, targetFrames, api.textureFieldOptionsFromSvg(svg));
  if (!protectedGroup) throw new Error("Protected PCM geometry was not generated.");
  return svg.replace(/<g\b[^>]*id=["']pcm_reversible_data["'][\s\S]*?<\/g>\s*/g, "").replace(/<\/svg>\s*$/, `${protectedGroup}</svg>`);
}

function groupRange(svg, startAt) {
  const token = /<\/?g\b[^>]*>/g;
  token.lastIndex = startAt;
  let depth = 0;
  let match;
  while ((match = token.exec(svg))) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return { start: startAt, end: token.lastIndex };
    } else {
      depth += 1;
    }
  }
  return null;
}

function wrapGroup(svg, id, layerId, label) {
  const match = new RegExp(`<g\\b[^>]*\\bid=["']${id}["'][^>]*>`).exec(svg);
  if (!match) return svg;
  const range = groupRange(svg, match.index);
  if (!range) throw new Error(`Unbalanced SVG group: ${id}`);
  const before = `<g id="${layerId}" inkscape:groupmode="layer" inkscape:label="${label}" data-illustrator-layer="${label}">`;
  return `${svg.slice(0, range.start)}${before}${svg.slice(range.start, range.end)}</g>${svg.slice(range.end)}`;
}

function wrapAllMatchingGroups(svg, expression, prefix, label) {
  const ranges = [];
  for (const match of svg.matchAll(expression)) {
    const range = groupRange(svg, match.index);
    if (range) ranges.push(range);
  }
  return ranges.reverse().reduce((result, range, index) => {
    const suffix = String(ranges.length - index).padStart(2, "0");
    const before = `<g id="${prefix}_${suffix}" inkscape:groupmode="layer" inkscape:label="${label} ${suffix}" data-illustrator-layer="${label}">`;
    return `${result.slice(0, range.start)}${before}${result.slice(range.start, range.end)}</g>${result.slice(range.end)}`;
  }, svg);
}

export function illustratorLayeredSvg(svg, genre, { productionPcm = false } = {}) {
  let result = String(svg).replace(
    /<svg\b/,
    `<svg xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" data-illustrator-handoff="v1" data-pcm-status="${productionPcm ? "included" : "production-injected"}"`
  );
  result = result.replace(/<rect width="1200" height="1200" fill="([^"]+)"\/>/, `<g id="00_BACKGROUND" inkscape:groupmode="layer" inkscape:label="00 BACKGROUND" data-illustrator-layer="00 BACKGROUND"><rect width="1200" height="1200" fill="$1"/></g>`);
  result = wrapGroup(result, "terra_primary_structure", "10_PRIMARY_STRUCTURE", "10 PRIMARY STRUCTURE");
  result = wrapGroup(result, "terra_genre_object", "20_GENRE_OBJECT", "20 GENRE OBJECT");
  result = wrapAllMatchingGroups(result, /<g\b[^>]*\bid=["']terra_genre_blend_\d+["'][^>]*>/g, "30_GENRE_BLEND", "30 GENRE BLEND");
  result = wrapGroup(result, "terra_family_structure", "40_FAMILY_SCORE", "40 FAMILY SCORE");
  result = wrapGroup(result, "terra_council_composition", "50_COUNCIL_COMPOSITION", "50 COUNCIL COMPOSITION");
  result = wrapGroup(result, "terra_grain_field", "60_DISPLAY_GRAIN", "60 DISPLAY GRAIN");
  result = wrapGroup(result, "pcm_reversible_waveform", "70_VISIBLE_PCM_WAVEFORM", "70 VISIBLE PCM WAVEFORM (EDITABLE)");
  if (productionPcm) {
    result = wrapGroup(result, "pcm_reversible_data", "90_PROTECTED_PCM__LOCKED", "90 PROTECTED PCM - LOCKED");
  } else {
    result = result.replace(
      /<g\b[^>]*id=["']pcm_reversible_data["'][^>]*><\/g>/,
      "<g id=\"90_PROTECTED_PCM__PRODUCTION_ONLY\" inkscape:groupmode=\"layer\" inkscape:label=\"90 PROTECTED PCM - PRODUCTION ONLY\" data-illustrator-layer=\"90 PROTECTED PCM - PRODUCTION ONLY\" data-edit-policy=\"production-injected\"></g>"
    );
  }
  const title = `<title>${genre} Illustrator handoff / ${productionPcm ? "reversible protected PCM included" : "production PCM injection ready"}</title>`;
  const desc = productionPcm
    ? `<desc>${genre} reference form. Edit the visible design layers only. Keep 90 PROTECTED PCM - LOCKED visible, untransformed, and locked. It is the only source used to restore audio.</desc>`
    : `<desc>${genre} Illustrator artwork handoff. This lightweight file intentionally contains no PCM particles. The production export injects pcm_reversible_data from the actual audio after the artwork is returned.</desc>`;
  return result.replace(/(<svg\b[^>]*>)/, `$1${title}${desc}`);
}

export function protectedGroup(svg) {
  return String(svg).match(/<g\b[^>]*id=["']pcm_reversible_data["'][^>]*>[\s\S]*?<\/g>/)?.[0] || "";
}

export function attr(tag, name) {
  const match = String(tag || "").match(new RegExp(`\\b${name}=["']([^"']*)["']`));
  return match?.[1] || "";
}

// Illustrator may reorder XML attributes while preserving the geometry. Hash the
// semantic protected data rather than its raw serialization.
export function protectedGeometryHash(svg) {
  const group = protectedGroup(svg);
  const groupTag = group.match(/^<g\b[^>]*>/)?.[0] || "";
  const groupAttrs = [
    "id", "data-layer", "data-edit-policy", "data-encoding", "data-sample-rate",
    "data-duration", "data-frame-count", "data-cx", "data-cy", "data-radius-x",
    "data-radius-y", "data-texture-seed", "data-texture-mode", "data-texture-region",
    "data-protected-texture-shape", "data-amplitude"
  ].map(name => [name, attr(groupTag, name)]);
  const circles = (group.match(/<circle\b[^>]*>/g) || []).map(tag => [
    attr(tag, "cx"), attr(tag, "cy"), attr(tag, "r"), attr(tag, "fill")
  ]);
  return sha256(JSON.stringify({ groupAttrs, circles }));
}
