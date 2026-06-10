import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(SCRIPT_DIR, "..");
const HTML_PATH = path.join(DEMO_DIR, "MUSIC MEMORY FITTING ROOM.html");
const OUT_DIR = path.join(DEMO_DIR, "images");
const OUT_SVG = path.join(OUT_DIR, "genre-patterns-30-preview.svg");
const OUT_PNG = path.join(OUT_DIR, "genre-patterns-30-preview.png");

function loadDemoApi() {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const appScript = scripts.at(-1).replace(
    /cleanupStoredSessions\(\);\s*render\(\);\s*loadCalibratedGenreProfiles\(\);\s*$/,
    "globalThis.__previewApi={musicGenreProfiles,genrePatternProfiles,generateSoundClothReversibleSvg,pcmProtectedGeometryGroupFromDetail,textureFieldOptionsFromSvg,normaliseAudioDetail,pcmSketchFromSamples};"
  );
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
  vm.runInContext(appScript, context);
  return context.__previewApi;
}

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;"
  }[char]));
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
  const count = seconds * sampleRate;
  const samples = new Float32Array(count);
  const tempo = Number(profile.tempo || 96);
  const bass = clamp01(profile.bass);
  const energy = clamp01(profile.energy);
  const rhythm = clamp01(profile.rhythm);
  const onset = clamp01(profile.onset);
  const brightness = clamp01(profile.brightness);
  const baseHz = 45 + bass * 80 + (index % 5) * 7;
  const leadHz = 180 + brightness * 1400 + (index % 7) * 31;
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    const beat = Math.pow(Math.max(0, Math.sin(t * tempo / 60 * Math.PI * 2)), 2 + onset * 5);
    const slow = Math.sin(t * Math.PI * 2 * (0.08 + rhythm * 0.8) + index);
    const bassTone = Math.sin(t * Math.PI * 2 * baseHz + slow * 0.7) * bass * 0.46;
    const leadTone = Math.sin(t * Math.PI * 2 * leadHz + Math.sin(t * 7.1) * 0.8) * brightness * 0.2;
    const midTone = Math.sin(t * Math.PI * 2 * (baseHz * 2.8 + index * 9)) * 0.16;
    const click = beat * onset * 0.34;
    samples[i] = Math.max(-1, Math.min(1, (bassTone + leadTone + midTone + click + slow * 0.08) * (0.38 + energy * 0.7)));
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

function moodForGenre(api, genre, index) {
  const profile = api.musicGenreProfiles[genre];
  const samples = syntheticSamples(profile, index);
  const pcmSketch = api.pcmSketchFromSamples(samples, 16000, 8000, 4);
  const series = timelines(profile, index);
  const audio = {
    ...profile,
    centroid: Math.round(500 + clamp01(profile.brightness) * 5200),
    spectralCentroid: Math.round(500 + clamp01(profile.brightness) * 5200),
    chroma: syntheticChroma(index, profile.chromaEntropy),
    temporalProfile: series.rms.slice(0, 16),
    inferredGenre: genre,
    genreAnalysis: { top: [{ name: genre, score: 99 }] },
    detail: {
      ...pcmSketch,
      rms: series.rms,
      bass: series.bass,
      centroid: series.centroid,
      onset: series.onset,
      waveform: series.waveform
    }
  };
  return {
    id: `genre-preview-${index}`,
    label: genre,
    audioFileName: `${genre}-preview.wav`,
    variantSalt: index % 5,
    audio
  };
}

function withPreviewProtectedTexture(api, svg, detail) {
  const textureOptions = api.textureFieldOptionsFromSvg(svg);
  const protectedGroup = api.pcmProtectedGeometryGroupFromDetail(detail, 1400, textureOptions);
  if (!protectedGroup) return svg;
  return svg.replace(/<g\b[^>]*id=["']pcm_reversible_data["'][\s\S]*?<\/g>/, protectedGroup);
}

function svgInner(svg) {
  return String(svg).replace(/^<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "");
}

const api = loadDemoApi();
const genres = Object.keys(api.genrePatternProfiles);
const cardW = 360;
const cardH = 476;
const artSize = 296;
const gap = 26;
const margin = 54;
const columns = 6;
const rows = Math.ceil(genres.length / columns);
const width = margin * 2 + columns * cardW + (columns - 1) * gap;
const height = margin * 2 + 130 + rows * cardH + (rows - 1) * gap;

const cards = genres.map((genre, index) => {
  const mood = moodForGenre(api, genre, index);
  const svg = withPreviewProtectedTexture(
    api,
    api.generateSoundClothReversibleSvg(mood, 1800000000000 + index * 77777, { variantSeed: index * 101, iteration: `genre-preview-${index + 1}` }),
    mood.audio.detail
  );
  const root = svg.match(/<svg\b[^>]*>/)?.[0] || "";
  const formMode = root.match(/data-form-mode="([^"]+)"/)?.[1] || "";
  const baseFamily = root.match(/data-base-family="([^"]+)"/)?.[1] || "";
  const variantFamily = root.match(/data-variant-family="([^"]+)"/)?.[1] || "";
  const lineCharacter = root.match(/data-line-character="([^"]+)"/)?.[1] || "";
  const nameMotif = root.match(/data-name-motif="([^"]+)"/)?.[1] || "";
  const x = margin + (index % columns) * (cardW + gap);
  const y = margin + 130 + Math.floor(index / columns) * (cardH + gap);
  const artX = x + (cardW - artSize) / 2;
  const artY = y + 28;
  return `<g class="card" transform="translate(${x} ${y})">
    <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="0" fill="#fff" stroke="#000"/>
    <svg x="${artX - x}" y="${artY - y}" width="${artSize}" height="${artSize}" viewBox="0 0 1200 1200">${svgInner(svg)}</svg>
    <text x="28" y="${artY - y + artSize + 42}" class="genre">${escapeXml(index + 1).padStart(2, "0")} ${escapeXml(genre)}</text>
    <text x="28" y="${artY - y + artSize + 70}" class="meta">${escapeXml(formMode)}</text>
    <text x="28" y="${artY - y + artSize + 96}" class="meta">${escapeXml(baseFamily)} + ${escapeXml(variantFamily)}</text>
    <text x="28" y="${artY - y + artSize + 120}" class="meta">${escapeXml(nameMotif)} / ${escapeXml(lineCharacter)}</text>
  </g>`;
}).join("\n");

const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="30 genre-specific sound form preview">
  <style>
    .title{font:500 58px Helvetica,Arial,sans-serif;letter-spacing:0;fill:#000}
    .subtitle{font:400 21px Helvetica,Arial,sans-serif;letter-spacing:0;fill:#000}
    .genre{font:600 23px Helvetica,Arial,sans-serif;letter-spacing:0;fill:#000}
    .meta{font:400 15px Helvetica,Arial,sans-serif;letter-spacing:0;fill:#000}
  </style>
  <rect width="100%" height="100%" fill="#fff"/>
  <text x="${margin}" y="${margin + 48}" class="title">30 GENRE SOUND FORMS</text>
  <text x="${margin}" y="${margin + 86}" class="subtitle">Top1 genre locks the main pattern; variant family and protected texture change inside the same genre idea.</text>
  <text x="${margin}" y="${margin + 116}" class="subtitle">Each preview includes a reduced-density visible pcm_reversible_data texture field for visual checking.</text>
  ${cards}
</svg>`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_SVG, sheet);
await sharp(Buffer.from(sheet)).png({ compressionLevel: 9 }).toFile(OUT_PNG);

console.log(path.relative(DEMO_DIR, OUT_SVG));
console.log(path.relative(DEMO_DIR, OUT_PNG));
