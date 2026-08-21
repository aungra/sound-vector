import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(SCRIPT_DIR, "..");
const ROOT_DIR = path.resolve(DEMO_DIR, "../..");
const HTML_PATH = path.join(DEMO_DIR, "MUSIC MEMORY FITTING ROOM.html");
const DELAUNAY_VENDOR_PATH = path.join(DEMO_DIR, "vendor", "d3-delaunay.min.js");
const OUT_DIR = path.join(DEMO_DIR, "images");
const OUT_SVG = path.join(OUT_DIR, "genre-svg-diversity-audit.svg");
const OUT_PNG = path.join(OUT_DIR, "genre-svg-diversity-audit.png");
const OUT_JSON = path.join(ROOT_DIR, "docs", "design-format", "genre-svg-diversity-audit.json");
const OUT_MD = path.join(ROOT_DIR, "docs", "design-format", "genre-svg-diversity-audit.md");

const fixtures = [
  { genre: "アンビエント", title: "Slow Air", tempo: 68, energy: .28, bass: .2, onset: .08, rhythm: .14, brightness: .58, shape: "ambient", blend: [["アンビエント", 92], ["ドローン", 46], ["クラシック音楽", 19]] },
  { genre: "テクノ", title: "Four Floor", tempo: 132, energy: .78, bass: .7, onset: .74, rhythm: .94, brightness: .52, shape: "techno", blend: [["テクノ", 91], ["ハウス", 58], ["ディスコ", 27]] },
  { genre: "ヒップホップ", title: "Pocket Beat", tempo: 94, energy: .66, bass: .84, onset: .52, rhythm: .58, brightness: .28, shape: "hiphop", blend: [["ヒップホップ", 89], ["トラップ", 54], ["ファンク", 24]] },
  { genre: "パンク", title: "Scratch Attack", tempo: 176, energy: .92, bass: .44, onset: .96, rhythm: .84, brightness: .74, shape: "punk", blend: [["パンク", 93], ["ハードコア", 57], ["ロック", 31]] },
  { genre: "クラシック音楽", title: "Quiet Score", tempo: 76, energy: .38, bass: .24, onset: .18, rhythm: .26, brightness: .46, shape: "classical", blend: [["クラシック音楽", 94], ["オペラ", 38], ["ジャズ", 17]] },
  { genre: "アニメソング", title: "Transformation", tempo: 164, energy: .86, bass: .38, onset: .82, rhythm: .78, brightness: .96, shape: "anime", blend: [["アニメソング", 95], ["J-POP", 61], ["チップチューン", 22]] }
];

const additionalFixtureSpecs = [
  ["ドローン", 54, .34, .66, .1, .12, .26, "ambient", "アンビエント"],
  ["ノイズミュージック", 148, .9, .34, .95, .84, .82, "punk", "パンク"],
  ["電子音楽", 118, .62, .4, .54, .72, .74, "techno", "テクノ"],
  ["ハウス", 124, .72, .66, .62, .86, .58, "techno", "ディスコ"],
  ["ディープ・ハウス", 116, .64, .9, .4, .74, .34, "hiphop", "ハウス"],
  ["トランス", 138, .76, .48, .68, .82, .88, "anime", "テクノ"],
  ["ドラムンベース", 174, .88, .58, .92, .96, .7, "punk", "テクノ"],
  ["ダブステップ", 142, .9, .94, .76, .68, .42, "hiphop", "ダブ"],
  ["チップチューン", 154, .58, .2, .76, .9, .96, "anime", "電子音楽"],
  ["トラップ", 144, .78, .9, .72, .74, .4, "hiphop", "ヒップホップ"],
  ["レゲエ", 76, .54, .7, .44, .64, .46, "hiphop", "ダブ"],
  ["ダブ", 72, .48, .84, .28, .42, .3, "ambient", "レゲエ"],
  ["ブルース", 78, .46, .5, .3, .36, .34, "classical", "ロック"],
  ["ロック", 132, .8, .6, .78, .8, .66, "punk", "メタル"],
  ["ハードコア", 188, .94, .66, .98, .9, .76, "punk", "メタル"],
  ["メタル", 126, .86, .74, .66, .72, .48, "punk", "ロック"],
  ["ジャズ", 108, .52, .3, .46, .58, .68, "classical", "ソウルミュージック"],
  ["ファンク", 112, .7, .58, .7, .76, .62, "hiphop", "ディスコ"],
  ["ソウルミュージック", 88, .58, .48, .34, .5, .54, "classical", "ファンク"],
  ["ディスコ", 126, .78, .56, .72, .9, .76, "techno", "ハウス"],
  ["シティ・ポップ", 104, .62, .36, .48, .72, .72, "anime", "J-POP"],
  ["J-POP", 136, .76, .42, .68, .82, .9, "anime", "シティ・ポップ"],
  ["オペラ", 82, .64, .44, .3, .34, .6, "classical", "クラシック音楽"],
  ["フォーク", 92, .42, .36, .28, .42, .4, "ambient", "ブルース"],
  ["ラテン", 122, .72, .62, .74, .82, .66, "techno", "ファンク"],
  ["ワールドミュージック", 102, .6, .52, .56, .68, .58, "classical", "ラテン"]
];
additionalFixtureSpecs.forEach(([genre, tempo, energy, bass, onset, rhythm, brightness, shape, secondary]) => {
  fixtures.push({
    genre,
    title: `${genre} Motion Probe`,
    tempo,
    energy,
    bass,
    onset,
    rhythm,
    brightness,
    shape,
    blend: [[genre, 93], [secondary, 47], ["アンビエント", 18]]
  });
});

function loadDemoApi() {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const appScript = scripts.at(-1).replace(
    /cleanupStoredSessions\(\);\s*restoreLatestAcceptedSession\(\);\s*render\(\);\s*loadCalibratedGenreProfiles\(\);\s*$/,
    "globalThis.__diversityApi={state,terraGenreEngines,terraMotionProfileForEngine,centralMotionProgramForProfile,centralMotionElementTransform,centralMotionPointOffset,makeReversibleAudioPatternShirt,bakePatternMotionFrame,decodeProtectedPcmDataFromSvg,pcmSketchFromSamples};"
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
  vm.runInContext(fs.readFileSync(DELAUNAY_VENDOR_PATH, "utf8"), context);
  vm.runInContext(appScript, context);
  return context.__diversityApi;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;"
  }[character]));
}

function proceduralSong(fixture, seconds = 5, sampleRate = 16000) {
  const samples = new Float32Array(seconds * sampleRate);
  const beatHz = fixture.tempo / 60;
  for (let index = 0; index < samples.length; index += 1) {
    const t = index / sampleRate;
    const phase = t * beatHz;
    const beat = Math.max(0, Math.sin(phase * Math.PI * 2));
    const kick = Math.exp(-((phase % 1) * 11)) * fixture.bass;
    const low = Math.sin(t * Math.PI * 2 * (42 + fixture.bass * 64)) * fixture.bass * .34;
    const lead = Math.sin(t * Math.PI * 2 * (180 + fixture.brightness * 1150) + Math.sin(t * 5.4) * .8) * fixture.brightness * .16;
    const noise = (Math.sin(index * 12.9898) * 43758.5453 % 1) * 2 - 1;
    let signal = low + lead;
    if (fixture.shape === "ambient") signal += Math.sin(t * .41) * .22 + Math.sin(t * 1.7) * .08;
    if (fixture.shape === "techno") signal += kick * .72 + (beat > .82 ? .24 : 0);
    if (fixture.shape === "hiphop") signal += kick * (phase % 2 < .13 ? .72 : .2) + Math.sin(t * 2.2) * .11;
    if (fixture.shape === "punk") signal += noise * .42 + Math.sign(Math.sin(t * Math.PI * 2 * 184)) * .18;
    if (fixture.shape === "classical") signal += Math.sin(t * Math.PI * 2 * 330) * .12 + Math.sin(t * Math.PI * 2 * 495) * .09;
    if (fixture.shape === "anime") signal += kick * .42 + Math.sin(t * Math.PI * 2 * 880) * .16 + (beat > .76 ? .2 : 0);
    samples[index] = Math.max(-1, Math.min(1, signal * (.38 + fixture.energy * .62)));
  }
  return samples;
}

function timeline(fixture, length = 96) {
  return {
    rms: Array.from({ length }, (_, index) => clamp01(fixture.energy * (.58 + Math.sin(index * .21) * .2))),
    bass: Array.from({ length }, (_, index) => clamp01(fixture.bass * (.6 + Math.cos(index * .15) * .22))),
    centroid: Array.from({ length }, (_, index) => clamp01(fixture.brightness * (.6 + Math.sin(index * .17) * .18))),
    onset: Array.from({ length }, (_, index) => clamp01(fixture.onset * (index % Math.max(3, Math.round(13 - fixture.rhythm * 8)) === 0 ? 1 : .16))),
    waveform: Array.from({ length: 192 }, (_, index) => Math.sin(index * (.1 + fixture.rhythm * .18)) * fixture.energy * .68)
  };
}

function svgInner(svg) {
  return String(svg).replace(/^<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "");
}

function withoutProtectedPcm(svg) {
  const source = String(svg);
  const start = source.search(/<g\b[^>]*\bid="pcm_reversible_data"[^>]*>/);
  if (start < 0) return source;
  const tokenPattern = /<\/g\s*>|<g\b[^>]*>/g;
  tokenPattern.lastIndex = start;
  let depth = 0;
  let token;
  while ((token = tokenPattern.exec(source))) {
    depth += token[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return `${source.slice(0, start)}${source.slice(tokenPattern.lastIndex)}`;
  }
  return source;
}

function metricDistance(left, right) {
  let absolute = 0;
  let leftInk = 0;
  let rightInk = 0;
  let sharedInk = 0;
  for (let index = 0; index < left.length; index += 1) {
    absolute += Math.abs(left[index] - right[index]);
    const a = left[index] > 38;
    const b = right[index] > 38;
    if (a) leftInk += 1;
    if (b) rightInk += 1;
    if (a && b) sharedInk += 1;
  }
  const averageDifference = absolute / Math.max(1, left.length) / 255;
  const union = leftInk + rightInk - sharedInk;
  const silhouetteDifference = union ? 1 - sharedInk / union : 0;
  return Number((averageDifference * .45 + silhouetteDifference * .55).toFixed(4));
}

async function rasterMetric(svg, label = "unknown") {
  let rendered;
  try {
    rendered = await sharp(Buffer.from(svg))
      .resize(180, 180, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    throw new Error(`${label}: SVG rasterization failed: ${error.message}`);
  }
  const pixels = new Uint8Array(rendered.data.length / 3);
  for (let index = 0; index < pixels.length; index += 1) pixels[index] = rendered.data[index * 3];
  return pixels;
}

function vectorDistance(left, right) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]);
  // Local vectors are expressed in the 1200-unit artboard but describe only a
  // primitive-sized region. Normalize against an 80-unit central field, not the
  // full canvas, so the threshold measures local choreography rather than zoom.
  return Number((total / Math.max(1, left.length) / 80).toFixed(4));
}

const api = loadDemoApi();
const centralMotionProbe = {
  audioFeatures: { energy: .86, bass: .74, onset: .82, brightness: .72, chroma: Array(12).fill(.28) }
};
const centralMotionPhases = [Math.PI / 6, Math.PI / 2, Math.PI * 5 / 6, Math.PI * 1.35];
const centralMotionFields = Object.values(api.terraGenreEngines).map(engine => {
  const profile = api.terraMotionProfileForEngine(engine.id);
  const values = centralMotionPhases.flatMap(phase => {
    const frame = {
      phase,
      force: 1.15,
      surge: .62,
      onset: .82,
      bass: .74,
      brightness: .72
    };
    return Array.from({ length: 4 }, (_, index) => {
      const offset = api.centralMotionPointOffset(frame, profile, "terra_primary_structure", index, index + 2, "audit-probe");
      const transform = api.centralMotionElementTransform(frame, profile, "terra_primary_structure", index, "audit-probe");
      const numerals = transform.match(/-?\d+(?:\.\d+)?/g)?.slice(0, 8).map(Number) || [];
      return [offset.x, offset.y, ...numerals];
    }).flat();
  });
  return { engineId: engine.id, mode: api.centralMotionProgramForProfile(profile).mode, values };
});
const centralMotionPairs = [];
for (let left = 0; left < centralMotionFields.length; left += 1) {
  for (let right = left + 1; right < centralMotionFields.length; right += 1) {
    centralMotionPairs.push({
      a: centralMotionFields[left].engineId,
      b: centralMotionFields[right].engineId,
      distance: vectorDistance(centralMotionFields[left].values, centralMotionFields[right].values)
    });
  }
}
centralMotionPairs.sort((a, b) => a.distance - b.distance);
const minimumStructuralMotionDistance = centralMotionPairs[0]?.distance || 0;
const records = [];
const motionPhases = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
const motionLabels = ["base", "lift", "surge", "return"];
for (const [index, fixture] of fixtures.entries()) {
  const samples = proceduralSong(fixture);
  const pcmSketch = api.pcmSketchFromSamples(samples, 16000, 8000, 5);
  const series = timeline(fixture);
  const mood = {
    id: `svg-diversity-${fixture.genre}`,
    label: `${fixture.genre} / ${fixture.title}`,
    audioFileName: `${fixture.title}.wav`,
    audio: {
      ...fixture,
      rms: fixture.energy,
      centroid: Math.round(500 + fixture.brightness * 5200),
      chroma: Array.from({ length: 12 }, (_, pc) => pc === index % 12 || pc === (index + 7) % 12 ? .84 : .18),
      inferredGenre: fixture.genre,
      genreAnalysis: {
        method: "procedural-audio-fixture",
        top: fixture.blend.map(([name, score]) => ({ name, score }))
      },
      detail: { ...pcmSketch, ...series }
    }
  };
  const shirt = api.makeReversibleAudioPatternShirt(mood, 1800003000000 + index * 127);
  const frames = [];
  for (const [phaseIndex, phase] of motionPhases.entries()) {
    api.state.patternMotion = { ...api.state.patternMotion, shirtId: shirt.id, phase, running: false, lastTimestamp: 0 };
    const svg = api.bakePatternMotionFrame(shirt.art, shirt);
    const decoded = api.decodeProtectedPcmDataFromSvg(svg);
    if (!decoded?.pcmSketch) throw new Error(`${fixture.genre}: Protected PCM could not be decoded at ${motionLabels[phaseIndex]}`);
    frames.push({ label: motionLabels[phaseIndex], phase, svg, preview: svgInner(withoutProtectedPcm(svg)), pixels: await rasterMetric(svg, `${fixture.genre}/${motionLabels[phaseIndex]}`), decodedFrames: Math.round(decoded.pcmSketchDuration * decoded.pcmSketchSampleRate) });
  }
  const root = frames[0].svg.match(/<svg\b[^>]*>/)?.[0] || "";
  records.push({
    ...fixture,
    frames,
    engine: root.match(/data-engine="([^"]+)"/)?.[1] || "",
    protectedFrameCount: Number(frames[0].svg.match(/id="pcm_reversible_data"[^>]*data-frame-count="(\d+)"/)?.[1] || 0)
  });
}

const pairs = [];
for (let phaseIndex = 0; phaseIndex < motionPhases.length; phaseIndex += 1) {
  for (let left = 0; left < records.length; left += 1) {
    for (let right = left + 1; right < records.length; right += 1) {
      pairs.push({
        phase: motionLabels[phaseIndex],
        a: records[left].genre,
        b: records[right].genre,
        distance: metricDistance(records[left].frames[phaseIndex].pixels, records[right].frames[phaseIndex].pixels)
      });
    }
  }
}
pairs.sort((a, b) => a.distance - b.distance);
const minimumDistance = pairs[0]?.distance || 0;
const motionDistances = records.map(record => ({
  genre: record.genre,
  distance: Math.max(...record.frames.slice(1).map(frame => metricDistance(record.frames[0].pixels, frame.pixels)))
}));
const minimumMotionDistance = Math.min(...motionDistances.map(item => item.distance));
const engines = new Set(records.map(record => record.engine));
const centralModes = new Set(centralMotionFields.map(field => field.mode));
const pass = minimumDistance >= .12
  && minimumMotionDistance >= .06
  && minimumStructuralMotionDistance >= .02
  && centralModes.size === 32
  && engines.size === records.length
  && records.every(record => record.protectedFrameCount > 1000 && record.frames.every(frame => frame.decodedFrames > 1000));

const cardWidth = 238;
const cardHeight = 220;
const gap = 18;
const margin = 48;
const sheetWidth = margin * 2 + 128 + cardWidth * motionPhases.length + gap * (motionPhases.length - 1);
const sheetHeight = margin * 2 + 126 + cardHeight * records.length + gap * (records.length - 1);
const phaseHeaders = motionLabels.map((label, index) => `<text x="${margin + 128 + index * (cardWidth + gap) + 16}" y="${margin + 106}" class="phase">${label}</text>`).join("");
const cards = records.map((record, row) => {
  const y = margin + 126 + row * (cardHeight + gap);
  const label = `<text x="${margin}" y="${y + 38}" class="title">${escapeXml(String(row + 1).padStart(2, "0"))}</text><text x="${margin}" y="${y + 64}" class="label">${escapeXml(record.genre)}</text><text x="${margin}" y="${y + 89}" class="meta">${escapeXml(record.blend.map(([name, score]) => `${name} ${score}%`).join(" / "))}</text>`;
  const frames = record.frames.map((frame, column) => {
    const x = margin + 128 + column * (cardWidth + gap);
    return `<g transform="translate(${x} ${y})"><rect width="${cardWidth}" height="${cardHeight}" fill="#fff" stroke="#000"/><svg x="14" y="12" width="210" height="196" viewBox="0 0 1200 1200" overflow="hidden">${frame.preview}</svg></g>`;
  }).join("");
  return `<g>${label}${frames}</g>`;
}).join("");
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}" viewBox="0 0 ${sheetWidth} ${sheetHeight}"><style>.heading{font:600 38px Helvetica,Arial,sans-serif;fill:#000}.sub{font:400 16px Helvetica,Arial,sans-serif;fill:#000}.phase{font:600 15px Helvetica,Arial,sans-serif;fill:#000}.title{font:600 18px Helvetica,Arial,sans-serif;fill:#000}.label{font:600 14px Helvetica,Arial,sans-serif;fill:#000}.meta{font:400 10px Helvetica,Arial,sans-serif;fill:#000}</style><rect width="100%" height="100%" fill="#fff"/><text x="${margin}" y="${margin + 34}" class="heading">FULL OUTPUT / 32 GENRE BLEND + MOTION AUDIT</text><text x="${margin}" y="${margin + 68}" class="sub">visual ${minimumDistance.toFixed(3)} / frame motion ${minimumMotionDistance.toFixed(3)} / structural motion ${minimumStructuralMotionDistance.toFixed(3)} / visible protected PCM decoded in every frame</text>${phaseHeaders}${cards}</svg>`;

const report = {
  generatedAt: new Date().toISOString(),
  threshold: .12,
  minimumDistance,
  pass,
  minimumMotionDistance,
  structuralMotionThreshold: .02,
  minimumStructuralMotionDistance,
  centralMotionPrograms: centralMotionFields.map(({ engineId, mode }) => ({ engineId, mode })),
  closestCentralMotionPairs: centralMotionPairs.slice(0, 10),
  fixtures: records.map(({ frames, ...record }) => ({ ...record, frames: frames.map(({ svg, preview, pixels, ...frame }) => frame) })),
  motionDistances,
  closestPairs: pairs.slice(0, 10)
};
const reportMarkdown = `# Genre SVG Diversity Audit

6種類の手続き的な音響フィクスチャを、各ジャンルの特徴量とPCM時系列を持つ短いテスト曲として生成した。各曲はTop1からTop3までのジャンル成分を持ち、アプリの makeReversibleAudioPatternShirt() 出力へ4つのモーション位相を焼き込み、実出力として比較した。

- Cross-genre minimum raster distance: ${minimumDistance.toFixed(3)}
- Cross-genre threshold: 0.120
- Minimum motion change: ${minimumMotionDistance.toFixed(3)}
- Motion threshold: 0.060
- Minimum structural motion distance: ${minimumStructuralMotionDistance.toFixed(3)}
- Structural motion threshold: 0.020
- Central motion programs: ${centralModes.size}/32 unique
- Unique engines: ${engines.size}/${records.length}
- Protected PCM decode: ${records.every(record => record.frames.every(frame => frame.decodedFrames > 1000)) ? "PASS" : "REVIEW"}
- Result: ${pass ? "PASS" : "REVIEW"}

## Closest Pairs

| Phase | A | B | Visual distance |
| --- | --- | --- | ---: |
${pairs.slice(0, 10).map(pair => `| ${pair.phase} | ${pair.a} | ${pair.b} | ${pair.distance.toFixed(3)} |`).join("\n")}

## Closest Central Motion Fields

| A | B | Local motion distance |
| --- | --- | ---: |
${centralMotionPairs.slice(0, 10).map(pair => `| ${pair.a} | ${pair.b} | ${pair.distance.toFixed(3)} |`).join("\n")}
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_SVG, sheet);
await sharp(Buffer.from(sheet), { limitInputPixels: false }).png({ compressionLevel: 9 }).toFile(OUT_PNG);
fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(OUT_MD, reportMarkdown);
console.log(path.relative(ROOT_DIR, OUT_JSON));
console.log(path.relative(ROOT_DIR, OUT_MD));
console.log(path.relative(DEMO_DIR, OUT_PNG));
console.log(`minimumDistance=${minimumDistance.toFixed(3)} minimumMotionDistance=${minimumMotionDistance.toFixed(3)} minimumStructuralMotionDistance=${minimumStructuralMotionDistance.toFixed(3)} ${pass ? "PASS" : "REVIEW"}`);
if (!pass) process.exitCode = 1;
