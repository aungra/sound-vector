import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const HTML_PATH = path.join(ROOT, "apps", "demo", "MUSIC MEMORY FITTING ROOM.html");
const GENRE_HIERARCHY_PATH = path.join(ROOT, "apps", "demo", "genre-hierarchy.js");
const OUTPUT_PATH = path.resolve(process.argv[2] || path.join(ROOT, "output", "public", "sound-form", "index.html"));
const APPROVED_UI_REF = process.env.SOUND_FORM_APPROVED_UI_REF || "c6ce4a3";

function sha256(source) {
  return crypto.createHash("sha256").update(source).digest("hex");
}

function functionBlock(source, name) {
  const startPattern = new RegExp(`^    function ${name}\\b`, "m");
  const match = startPattern.exec(source);
  if (!match) throw new Error(`Missing function: ${name}`);
  const next = /^    function [A-Za-z_$][\w$]*\b/gm;
  next.lastIndex = match.index + match[0].length;
  const nextMatch = next.exec(source);
  return source.slice(match.index, nextMatch?.index ?? source.length);
}

function replaceFunction(target, source, name) {
  const previous = functionBlock(target, name);
  const replacement = functionBlock(source, name);
  if (previous === replacement) return target;
  return target.replace(previous, replacement);
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing merge anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Ambiguous merge anchor: ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function insertFunctionAfter(target, source, insertedName, anchorName) {
  if (new RegExp(`^    function ${insertedName}\\b`, "m").test(target)) return target;
  const anchor = functionBlock(target, anchorName);
  return target.replace(anchor, `${anchor}${functionBlock(source, insertedName)}`);
}

function blockBetweenFunctions(source, startName, endName) {
  const startPattern = new RegExp(`^    function ${startName}\\b`, "m");
  const endPattern = new RegExp(`^    function ${endName}\\b`, "m");
  const start = startPattern.exec(source);
  if (!start) throw new Error(`Missing block start function: ${startName}`);
  const remainder = source.slice(start.index + start[0].length);
  const end = endPattern.exec(remainder);
  if (!end) throw new Error(`Missing block end function: ${endName}`);
  return source.slice(start.index, start.index + start[0].length + end.index);
}

const approved = execFileSync("git", ["show", `${APPROVED_UI_REF}:apps/demo/MUSIC MEMORY FITTING ROOM.html`], {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024
});
const working = fs.readFileSync(HTML_PATH, "utf8");
const genreHierarchy = fs.readFileSync(GENRE_HIERARCHY_PATH, "utf8");
let merged = approved;

merged = replaceOnce(
  merged,
  '<script src="genre-hierarchy.js?v=hierarchy-120-v1"></script>',
  `<script data-sound-form-inline="genre-hierarchy-v2">\n${genreHierarchy}\n</script>`,
  "inline genre hierarchy"
);

merged = merged.replace(
  "可逆PCMと図形を配置",
  "主図形と軽量PCMプレビューを配置"
).replace(
  "あと数秒",
  "正式PCMは書き出し時に生成"
);

merged = insertFunctionAfter(merged, working, "pcmPreviewTextureGroupFromDetail", "pcmProtectedGeometryGroupFromDetail");
merged = replaceFunction(merged, working, "apiEndpointCandidates");
merged = replaceFunction(merged, working, "injectPcmGeometryIntoSvg");
merged = insertFunctionAfter(merged, working, "injectPcmPreviewTextureIntoSvg", "injectPcmGeometryIntoSvg");
merged = replaceFunction(merged, working, "makeReversibleAudioPatternShirt");

// Keep the approved Simple UI shell, while promoting the complete visual topology
// implementation as one dependency-ordered block.
merged = merged.replace(
  functionBlock(merged, "applyApprovedArtistMaster"),
  blockBetweenFunctions(working, "structuralDetailDialect", "generateSoundClothReversibleSvg")
);

const generationCall = "const generatedShirt = makeReversibleAudioPatternShirt(mood, tick);";
const deferredGenerationCall = "const generatedShirt = makeReversibleAudioPatternShirt(mood, tick, { deferProtectedPcm: true });";
const generationCallCount = merged.split(generationCall).length - 1;
if (generationCallCount !== 2) throw new Error(`Expected two UI generation calls, found ${generationCallCount}`);
merged = merged.replaceAll(generationCall, deferredGenerationCall);

merged = replaceOnce(
  merged,
  `      const art = previousHasPcm
        ? preserveProtectedPcmGeometry(shirt.art, rawArt)
        : injectPcmGeometryIntoSvg(rawArt, originalFeatures.detail || {});
      const adjustedProtectedPcm = String(art || "").match(protectedPattern)?.[0] || "";
      if (!adjustedProtectedPcm || !/<line\\b|<path\\b|<circle\\b/.test(adjustedProtectedPcm)) {
        throw new Error("保護PCMを維持できないため調整を中止しました。元音源から再生成してください。");
      }`,
  `      const deferProtectedPcm = shirt.protectedPcmDeferred === true;
      const art = previousHasPcm
        ? preserveProtectedPcmGeometry(shirt.art, rawArt)
        : deferProtectedPcm
          ? injectPcmPreviewTextureIntoSvg(rawArt, originalFeatures.detail || {})
          : injectPcmGeometryIntoSvg(rawArt, originalFeatures.detail || {});
      const adjustedProtectedPcm = String(art || "").match(protectedPattern)?.[0] || "";
      const adjustedPreviewPcm = String(art || "").match(/<g\\b[^>]*id=["']pcm_preview_texture["'][^>]*>[\\s\\S]*?<\\/g>/)?.[0] || "";
      if (deferProtectedPcm && !/<circle\\b/.test(adjustedPreviewPcm)) {
        throw new Error("保護PCMの軽量プレビューを維持できないため調整を中止しました。");
      }
      if (!deferProtectedPcm && (!adjustedProtectedPcm || !/<line\\b|<path\\b|<circle\\b/.test(adjustedProtectedPcm))) {
        throw new Error("保護PCMを維持できないため調整を中止しました。元音源から再生成してください。");
      }`,
  "genre adjustment protected PCM"
);

merged = replaceOnce(
  merged,
  `    function refreshReversibleSoundClothShirt(shirt) {
      if (!shirt || !isReversibleAudioShirt(shirt) || !shirt.audioFeatures) return shirt;`,
  `    function refreshReversibleSoundClothShirt(shirt) {
      if (!shirt || !isReversibleAudioShirt(shirt) || !shirt.audioFeatures) return shirt;
      const applyProtectedPcmForDisplay = svg => shirt.protectedPcmDeferred
        ? injectPcmPreviewTextureIntoSvg(svg, shirt.audioFeatures?.detail || {})
        : injectPcmGeometryIntoSvg(svg, shirt.audioFeatures?.detail || {});`,
  "refresh display PCM policy"
);

merged = merged.replace(
  ": injectPcmGeometryIntoSvg(regeneratedArt, shirt.audioFeatures?.detail || {});",
  ": applyProtectedPcmForDisplay(regeneratedArt);"
);
merged = merged.replace(
  "shirt.art = injectPcmGeometryIntoSvg(shirt.art, shirt.audioFeatures?.detail || {});",
  "shirt.art = applyProtectedPcmForDisplay(shirt.art);"
);
merged = merged.replace(
  "shirt.art = injectPcmGeometryIntoSvg(generateReversibleAudioPatternSvg(mood, tick, null), shirt.audioFeatures?.detail || {});",
  "shirt.art = applyProtectedPcmForDisplay(generateReversibleAudioPatternSvg(mood, tick, null));"
);

const requiredMarkers = [
  '<p class="simple-intro">SOUND FORMは',
  'class="simple-conversion"',
  "hasRichAnalysisParity",
  "reliableExternalRapPromotion?.applies",
  "pcm_preview_texture",
  "deferProtectedPcm: true",
  "genreCompositionProgramsByFamily",
  'data-sound-form-inline="genre-hierarchy-v2"',
  "audio-visual-dialect",
  "data-genre-composition",
  "song-topology-v1",
  'id="pcm_reversible_data"'
];
for (const marker of requiredMarkers) {
  if (!merged.includes(marker)) throw new Error(`Safe production marker missing: ${marker}`);
}
if (merged.includes("簡易解析の低信頼結果は表示せず")) {
  throw new Error("Refusing to build the deprecated interface copy");
}

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, merged);
process.stdout.write(`${OUTPUT_PATH}\n${sha256(merged)}\n`);
