import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { illustratorLayeredSvg, loadIllustratorApi, moodForGenre } from "./illustrator-handoff-lib.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../../..");
const HANDOFF_DIR = path.join(ROOT_DIR, "docs", "illustrator-handoff");
const EDITED_DIR = path.join(HANDOFF_DIR, "editable");
const OUT_DIR = path.join(HANDOFF_DIR, "comparison");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(HANDOFF_DIR, "manifest.json"), "utf8"));
const TILE = 280;

function count(svg, expression) {
  return [...String(svg).matchAll(expression)].length;
}

function structureStats(svg) {
  const widths = [...String(svg).matchAll(/stroke-width\s*[:=]\s*["']?([\d.]+)/g)].map(match => Number(match[1])).filter(Number.isFinite);
  return {
    paths: count(svg, /<path\b/g),
    circles: count(svg, /<circle\b/g),
    ellipses: count(svg, /<ellipse\b/g),
    lines: count(svg, /<line\b/g),
    polygons: count(svg, /<(?:polygon|polyline)\b/g),
    rects: count(svg, /<rect\b/g),
    groups: count(svg, /<g\b/g),
    transforms: count(svg, /\btransform=/g),
    maxStroke: widths.length ? Math.max(...widths) : 0,
    meanStroke: widths.length ? widths.reduce((sum, value) => sum + value, 0) / widths.length : 0
  };
}

async function renderMask(svg) {
  const { data, info } = await sharp(Buffer.from(svg))
    .resize(TILE, TILE, { fit: "contain", background: "#fff" })
    .flatten({ background: "#fff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(info.width * info.height);
  const cornerValues = [data[0], data[info.width - 1], data[(info.height - 1) * info.width], data[info.width * info.height - 1]];
  const background = cornerValues.sort((a, b) => a - b)[Math.floor(cornerValues.length / 2)];
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  let ink = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = y * info.width + x;
      if (Math.abs(data[index] - background) > 32) {
        mask[index] = 1;
        ink += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return {
    mask,
    inkRatio: ink / mask.length,
    bbox: ink ? [minX / info.width, minY / info.height, maxX / info.width, maxY / info.height] : [0, 0, 0, 0]
  };
}

function compareMasks(before, after) {
  let intersection = 0;
  let union = 0;
  let changed = 0;
  for (let index = 0; index < before.mask.length; index += 1) {
    const a = before.mask[index];
    const b = after.mask[index];
    if (a && b) intersection += 1;
    if (a || b) union += 1;
    if (a !== b) changed += 1;
  }
  return {
    silhouetteIou: union ? intersection / union : 1,
    changedRatio: changed / before.mask.length,
    inkDelta: after.inkRatio - before.inkRatio,
    bboxDelta: after.bbox.map((value, index) => value - before.bbox[index])
  };
}

function escapeXml(value) {
  return String(value).replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

const api = loadIllustratorApi();
const records = [];
const rendered = [];

for (const item of MANIFEST.files) {
  const index = item.number - 1;
  const mood = moodForGenre(api, item.genre, index);
  const beforeSvg = illustratorLayeredSvg(api.generateSoundClothReversibleSvg(mood, 1800000000000 + index * 77777, {
    variantSeed: index * 101,
    iteration: `illustrator-handoff-${index + 1}`
  }), item.genre);
  const editedPath = path.join(HANDOFF_DIR, item.file);
  const afterSvg = fs.readFileSync(editedPath, "utf8");
  const [beforeMask, afterMask, beforePng, afterPng] = await Promise.all([
    renderMask(beforeSvg),
    renderMask(afterSvg),
    sharp(Buffer.from(beforeSvg)).resize(TILE, TILE).flatten({ background: "#fff" }).png().toBuffer(),
    sharp(Buffer.from(afterSvg)).resize(TILE, TILE).flatten({ background: "#fff" }).png().toBuffer()
  ]);
  const beforeStructure = structureStats(beforeSvg);
  const afterStructure = structureStats(afterSvg);
  const comparison = compareMasks(beforeMask, afterMask);
  const primitiveDelta = ["paths", "circles", "ellipses", "lines", "polygons", "rects"].reduce((sum, key) => sum + Math.abs(afterStructure[key] - beforeStructure[key]), 0);
  const depthScore = Math.max(0,
    (afterStructure.paths - beforeStructure.paths) * 0.7 +
    (afterStructure.lines - beforeStructure.lines) * 0.5 +
    (afterStructure.transforms - beforeStructure.transforms) * 0.35
  );
  records.push({
    number: item.number,
    genre: item.genre,
    file: item.file,
    before: { ...beforeStructure, inkRatio: beforeMask.inkRatio, bbox: beforeMask.bbox },
    after: { ...afterStructure, inkRatio: afterMask.inkRatio, bbox: afterMask.bbox },
    comparison: { ...comparison, primitiveDelta, depthScore }
  });
  rendered.push({ beforePng, afterPng });
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const cardW = TILE * 2 + 44;
const cardH = TILE + 74;
const columns = 2;
const rows = Math.ceil(records.length / columns);
const width = 50 + columns * cardW + (columns - 1) * 30;
const height = 100 + rows * cardH + (rows - 1) * 24;
const cards = records.map((record, index) => {
  const x = 50 + (index % columns) * (cardW + 30);
  const y = 100 + Math.floor(index / columns) * (cardH + 24);
  const beforeData = rendered[index].beforePng.toString("base64");
  const afterData = rendered[index].afterPng.toString("base64");
  return `<g transform="translate(${x} ${y})"><rect width="${cardW}" height="${cardH}" fill="#fff" stroke="#000"/><image x="12" y="12" width="${TILE}" height="${TILE}" href="data:image/png;base64,${beforeData}"/><image x="${TILE + 32}" y="12" width="${TILE}" height="${TILE}" href="data:image/png;base64,${afterData}"/><text x="12" y="${TILE + 40}" class="genre">${String(record.number).padStart(2, "0")} ${escapeXml(record.genre)}</text><text x="12" y="${TILE + 62}" class="meta">BEFORE</text><text x="${TILE + 32}" y="${TILE + 62}" class="meta">AFTER / IoU ${record.comparison.silhouetteIou.toFixed(3)} / change ${record.comparison.changedRatio.toFixed(3)}</text></g>`;
}).join("");
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><style>.title{font:700 34px Arial,sans-serif}.genre{font:700 18px Arial,sans-serif}.meta{font:400 12px Arial,sans-serif}</style><rect width="100%" height="100%" fill="#fff"/><text x="50" y="52" class="title">32 ARTIST REVISIONS / BEFORE + AFTER</text><text x="50" y="80" class="meta">Geometry comparison excludes PCM. Left: deterministic Terra source. Right: Illustrator revision.</text>${cards}</svg>`;
fs.writeFileSync(path.join(OUT_DIR, "before-after-32.svg"), sheet);
await sharp(Buffer.from(sheet)).png({ compressionLevel: 9 }).toFile(path.join(OUT_DIR, "before-after-32.png"));
fs.writeFileSync(path.join(OUT_DIR, "revision-audit.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), records }, null, 2)}\n`);

const ranked = [...records].sort((a, b) => b.comparison.changedRatio - a.comparison.changedRatio);
const depth = [...records].filter(record => record.comparison.depthScore > 2).sort((a, b) => b.comparison.depthScore - a.comparison.depthScore);
const lines = [
  "# Illustrator 32 Revision Audit",
  "",
  "修正前の決定的Terra出力と、Illustrator修正版を同じ1200角・同じ二値条件で比較した結果です。PCMは比較対象外です。",
  "",
  "## 大きく変わったパターン",
  "",
  ...ranked.slice(0, 12).map(record => `- ${String(record.number).padStart(2, "0")} ${record.genre}: change ${record.comparison.changedRatio.toFixed(3)}, IoU ${record.comparison.silhouetteIou.toFixed(3)}, primitives Δ${record.comparison.primitiveDelta}`),
  "",
  "## 3D・奥行き線の追加が強い候補",
  "",
  ...(depth.length ? depth.slice(0, 12).map(record => `- ${String(record.number).padStart(2, "0")} ${record.genre}: depth score ${record.comparison.depthScore.toFixed(1)}, path ${record.before.paths}→${record.after.paths}, transform ${record.before.transforms}→${record.after.transforms}`) : ["- 構造差から強い3D候補は検出されませんでした。"]),
  "",
  "## 全件",
  "",
  "| No. | Genre | IoU | Change | Ink Δ | Primitive Δ |",
  "| ---: | --- | ---: | ---: | ---: | ---: |",
  ...records.map(record => `| ${String(record.number).padStart(2, "0")} | ${record.genre} | ${record.comparison.silhouetteIou.toFixed(3)} | ${record.comparison.changedRatio.toFixed(3)} | ${record.comparison.inkDelta.toFixed(3)} | ${record.comparison.primitiveDelta} |`),
  ""
];
fs.writeFileSync(path.join(OUT_DIR, "revision-audit.md"), lines.join("\n"));
console.log(`Audited ${records.length} Illustrator revisions in ${path.relative(ROOT_DIR, OUT_DIR)}`);
