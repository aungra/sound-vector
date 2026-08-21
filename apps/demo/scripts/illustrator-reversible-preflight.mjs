import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attr, byteHash, loadIllustratorApi, protectedGeometryHash, protectedGroup } from "./illustrator-handoff-lib.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_MANIFEST = path.join(ROOT_DIR, "docs", "illustrator-handoff", "manifest.json");
const args = process.argv.slice(2);
const structureOnly = args.includes("--structure-only");
const artworkOnly = args.includes("--artwork-only");
const files = args.filter(value => value !== "--structure-only" && value !== "--artwork-only");

if (!files.length) {
  console.error("使い方: npm run preflight:illustrator -- [--artwork-only | --structure-only] <SVGファイル> [...]");
  process.exit(2);
}

const api = loadIllustratorApi();
const manifest = fs.existsSync(DEFAULT_MANIFEST) ? JSON.parse(fs.readFileSync(DEFAULT_MANIFEST, "utf8")) : null;
const expected = new Map((manifest?.files || []).map(item => [path.resolve(ROOT_DIR, "docs", "illustrator-handoff", item.file), item]));
let failure = false;

for (const input of files) {
  const filename = path.resolve(process.cwd(), input);
  const svg = fs.readFileSync(filename, "utf8");
  const errors = [];
  const root = svg.match(/<svg\b[^>]*>/)?.[0] || "";
  const pcm = protectedGroup(svg);
  const pcmTag = pcm.match(/^<g\b[^>]*>/)?.[0] || "";
  if (attr(root, "viewBox") !== "0 0 1200 1200") errors.push("viewBox は 0 0 1200 1200 のままにしてください。");
  if (artworkOnly) {
    if (attr(root, "data-pcm-status") !== "production-injected") errors.push("軽量Illustrator版の data-pcm-status がありません。");
    if (pcm || /<circle\b[^>]*data-feature=["']?pcm/i.test(svg)) errors.push("軽量Illustrator版にPCM粒子を含めないでください。本番書き出し時に注入します。");
    if (!/id=["']90_PROTECTED_PCM__PRODUCTION_ONLY["']/.test(svg)) errors.push("本番PCM注入用レイヤーがありません。");
    if (!errors.length) console.log(`OK ${input} （軽量図案。PCMは本番注入）`);
    else {
      failure = true;
      console.error(`NG ${input}\n- ${errors.join("\n- ")}`);
    }
    continue;
  }
  if (!pcm) errors.push("pcm_reversible_data がありません。");
  if (attr(pcmTag, "data-layer") !== "pcm_reversible_data") errors.push("PCM保護グループの data-layer が変わっています。");
  if (attr(pcmTag, "data-edit-policy") !== "lock-do-not-edit") errors.push("PCM保護グループの編集ロック属性がありません。");
  if (/\btransform=/.test(pcm)) errors.push("PCM保護レイヤーには transform を付けられません。");
  if (/display=["']none|display\s*:\s*none|opacity=["']0(?:\.0*)?["']|opacity\s*:\s*0(?:\.0*)?/.test(pcm)) errors.push("PCM保護レイヤーを非表示または透明にはできません。");
  if (/data-(?:byte|index)=/.test(pcm)) errors.push("PCM値を data-byte / data-index に保存してはいけません。");
  const frameCount = Number(attr(pcmTag, "data-frame-count"));
  const circles = pcm.match(/<circle\b[^>]*>/g)?.length || 0;
  if (!frameCount || circles < frameCount) errors.push(`PCM粒子数が不足しています (${circles}/${frameCount})。`);
  const decoded = api.decodeProtectedPcmDataFromSvg(svg);
  if (!decoded?.pcmSketch) errors.push("PCM保護図形から音を復元できません。");
  const original = expected.get(filename);
  if (original && !structureOnly && decoded?.pcmSketch) {
    if (byteHash(decoded.pcmSketch) !== original.protectedPcm.decodedBytesSha256) errors.push("PCM復元バイト列が元ファイルと一致しません。90_PROTECTED_PCM__LOCKED を元に戻してください。");
    if (protectedGeometryHash(svg) !== original.protectedPcm.geometrySha256) errors.push("PCM保護図形の粒子座標・半径・順序が元ファイルと一致しません。90_PROTECTED_PCM__LOCKED を元に戻してください。");
  }
  if (errors.length) {
    failure = true;
    console.error(`NG ${input}\n- ${errors.join("\n- ")}`);
  } else {
    const suffix = original && !structureOnly ? "（復元データ一致）" : "（復元可能）";
    console.log(`OK ${input} ${suffix}`);
  }
}
process.exit(failure ? 1 : 0);
