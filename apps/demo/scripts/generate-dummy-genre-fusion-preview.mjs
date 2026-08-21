import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(SCRIPT_DIR, "..");
const HTML_PATH = path.join(DEMO_DIR, "MUSIC MEMORY FITTING ROOM.html");
const DELAUNAY_PATH = path.join(DEMO_DIR, "vendor", "d3-delaunay.min.js");
const ARTIST_MASTERS_PATH = path.join(DEMO_DIR, "artist-master-patterns.js");
const OUT_DIR = path.join(DEMO_DIR, "images");
const STEM = "genre-fusion-punk57-soul24-chiptune20";
const OUTPUT_SVG = path.join(OUT_DIR, `${STEM}.svg`);
const PREVIEW_SVG = path.join(OUT_DIR, `${STEM}-preview.svg`);
const PREVIEW_PNG = path.join(OUT_DIR, `${STEM}-preview.png`);

const rankedGenres = [
  { name: "パンク", score: 57 },
  { name: "ソウルミュージック", score: 24 },
  { name: "チップチューン", score: 20 }
];

function loadDemoApi() {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const appScript = scripts.at(-1).replace(
    /cleanupStoredSessions\(\);\s*(?:restoreLatestAcceptedSession\(\);\s*)?render\(\);\s*loadCalibratedGenreProfiles\(\);\s*$/,
    "globalThis.__previewApi={musicGenreProfiles,generateSoundClothReversibleSvg,pcmProtectedGeometryGroupFromDetail,textureFieldOptionsFromSvg,pcmSketchFromSamples};"
  );
  if (!appScript.includes("__previewApi")) throw new Error("Unable to isolate the demo SVG generator.");
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
      createElement: () => ({ click() {}, setAttribute() {}, style: {} }),
      querySelector: () => null
    },
    window: {},
    navigator: {},
    location: { href: "http://127.0.0.1:4193/", hostname: "127.0.0.1", pathname: "/", protocol: "http:" }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(DELAUNAY_PATH, "utf8"), context);
  vm.runInContext(fs.readFileSync(ARTIST_MASTERS_PATH, "utf8"), context);
  vm.runInContext(appScript, context);
  return context.__previewApi;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function weightedProfile(api) {
  const total = rankedGenres.reduce((sum, item) => sum + item.score, 0);
  const keys = ["energy", "bass", "brightness", "rhythm", "onset", "tempo", "chromaEntropy"];
  return Object.fromEntries(keys.map(key => [
    key,
    rankedGenres.reduce((sum, item) => sum + (Number(api.musicGenreProfiles[item.name]?.[key]) || 0) * item.score, 0) / total
  ]));
}

function syntheticSamples(profile, seconds = 4, sampleRate = 16000) {
  const samples = new Float32Array(seconds * sampleRate);
  const tempo = Math.max(70, Number(profile.tempo) || 148);
  for (let index = 0; index < samples.length; index += 1) {
    const t = index / sampleRate;
    const beatPhase = t * tempo / 60;
    const kick = Math.exp(-((beatPhase % 1) * 11)) * Math.sin(t * Math.PI * 2 * 58) * profile.bass;
    const scratch = Math.sin(t * Math.PI * 2 * (310 + Math.sin(t * 5.7) * 92)) * profile.energy * .22;
    const chipGate = Math.sin(t * Math.PI * 2 * 8) > .28 ? 1 : -.45;
    const chip = Math.sign(Math.sin(t * Math.PI * 2 * 740)) * chipGate * profile.brightness * .1;
    const soul = Math.sin(t * Math.PI * 2 * 196 + Math.sin(t * 3.2) * .8) * .12;
    samples[index] = Math.max(-1, Math.min(1, (kick * .48 + scratch + chip + soul) * .72));
  }
  return samples;
}

function timeSeries(profile, length = 96) {
  return {
    rms: Array.from({ length }, (_, i) => clamp01(profile.energy * (.56 + Math.sin(i * .27) * .18 + (i % 9 === 0 ? .22 : 0)))),
    bass: Array.from({ length }, (_, i) => clamp01(profile.bass * (.62 + Math.sin(i * .19 + .8) * .24))),
    centroid: Array.from({ length }, (_, i) => clamp01(profile.brightness * (.64 + Math.sin(i * .31) * .22))),
    onset: Array.from({ length }, (_, i) => clamp01(profile.onset * (i % 5 === 0 ? 1 : .22))),
    waveform: Array.from({ length: 192 }, (_, i) => Math.sin(i * .37) * .58 + Math.sign(Math.sin(i * .17)) * .18)
  };
}

function replaceProtectedPcm(api, svg, detail, targetFrames = 2400) {
  const group = api.pcmProtectedGeometryGroupFromDetail(detail, targetFrames, api.textureFieldOptionsFromSvg(svg));
  if (!group) return svg;
  return svg.replace(/<g\b[^>]*id=["']pcm_reversible_data["'][\s\S]*?<\/g>/, group);
}

function xmlText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;"
  })[char]);
}

const api = loadDemoApi();
const profile = weightedProfile(api);
const samples = syntheticSamples(profile);
const pcmSketch = api.pcmSketchFromSamples(samples, 16000, 8000, 4);
const series = timeSeries(profile);
const audio = {
  ...profile,
  inferredGenre: "パンク",
  centroid: Math.round(500 + profile.brightness * 5200),
  spectralCentroid: Math.round(500 + profile.brightness * 5200),
  chroma: Array.from({ length: 12 }, (_, i) => clamp01(.16 + Math.sin(i * 1.17 + .4) * .17 + (i === 2 || i === 7 ? .48 : 0))),
  temporalProfile: series.rms.slice(0, 16),
  genreAnalysis: { top: rankedGenres },
  detail: { ...pcmSketch, ...series }
};
const mood = {
  id: "dummy-fusion-punk57-soul24-chiptune20",
  label: "パンク57 / ソウル24 / チップチューン20",
  audioFileName: "dummy-fusion-preview.wav",
  variantSalt: 0,
  audio
};

const generated = api.generateSoundClothReversibleSvg(mood, 1800000000000, {
  variantSeed: 572420,
  iteration: "dummy-fusion-preview"
});
const output = replaceProtectedPcm(api, generated, audio.detail, 2400)
  .replace(/<svg\b/, '<svg data-preview-fixture="punk57-soul24-chiptune20"');

const root = output.match(/<svg\b[^>]*>/)?.[0] || "";
const engine = root.match(/data-engine="([^"]+)"/)?.[1] || "";
const blend = root.match(/data-genre-blend="([^"]+)"/)?.[1] || "";
const soulSites = output.match(/id="terra_genre_blend_2"[^>]*data-fusion-site-count="(\d+)"/)?.[1] || "0";
const chipSites = output.match(/id="terra_genre_blend_3"[^>]*data-fusion-site-count="(\d+)"/)?.[1] || "0";
const inner = output.replace(/^<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "");

const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1800" viewBox="0 0 1600 1800" role="img" aria-label="パンク57%、ソウルミュージック24%、チップチューン20%のジャンル融合プレビュー">
  <style>
    .title{font:600 54px "Yu Gothic","YuGothic",sans-serif;fill:#fff;letter-spacing:0}
    .lead{font:500 27px "Yu Gothic","YuGothic",sans-serif;fill:#fff;letter-spacing:0}
    .meta{font:400 20px "Yu Gothic","YuGothic",sans-serif;fill:#fff;letter-spacing:0}
    .small{font:400 17px "Yu Gothic","YuGothic",sans-serif;fill:#fff;letter-spacing:0}
  </style>
  <rect width="1600" height="1800" fill="#000"/>
  <text x="120" y="100" class="title">DUMMY GENRE FUSION</text>
  <text x="120" y="154" class="lead">パンク 57% / ソウルミュージック 24% / チップチューン 20%</text>
  <svg x="200" y="220" width="1200" height="1200" viewBox="0 0 1200 1200">${inner}</svg>
  <line x1="120" y1="1480" x2="1480" y2="1480" stroke="#fff" stroke-width="1"/>
  <text x="120" y="1532" class="lead">structural-splice-v2</text>
  <text x="120" y="1574" class="meta">Top1: パンクのIllustrator承認主形を維持</text>
  <text x="120" y="1612" class="meta">Top2: ソウルの counterpoint-splice / ${xmlText(soulSites)} sites</text>
  <text x="120" y="1650" class="meta">Top3: チップチューンの orthogonal-splice / ${xmlText(chipSites)} sites</text>
  <text x="120" y="1698" class="small">比率は独立図形の大小ではなく、主形ノード間を書き換える融合箇所数へ反映。</text>
  <text x="120" y="1732" class="small">Engine: ${xmlText(engine)} / Blend: ${xmlText(blend)}</text>
  <text x="120" y="1764" class="small">Preview PCM: visible, locked, 2,400 geometry points. No PCM in metadata.</text>
</svg>`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_SVG, output);
fs.writeFileSync(PREVIEW_SVG, preview);
await sharp(Buffer.from(preview)).png({ compressionLevel: 9 }).toFile(PREVIEW_PNG);

console.log(path.relative(DEMO_DIR, OUTPUT_SVG));
console.log(path.relative(DEMO_DIR, PREVIEW_SVG));
console.log(path.relative(DEMO_DIR, PREVIEW_PNG));
