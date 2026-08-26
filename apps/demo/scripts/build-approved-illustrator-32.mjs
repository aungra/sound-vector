import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(SCRIPT_DIR, "..");
const ROOT_DIR = path.resolve(DEMO_DIR, "../..");
const HANDOFF_DIR = path.join(ROOT_DIR, "docs", "illustrator-handoff");
const EDITED_DIR = path.join(HANDOFF_DIR, "editable");
const APPROVED_DIR = path.join(HANDOFF_DIR, "approved");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(HANDOFF_DIR, "manifest.json"), "utf8"));
const MASTER_JS = path.join(DEMO_DIR, "artist-master-patterns.js");
const SCREENPRINT_FLOOR = 2;
const SCREENPRINT_DEFAULT_WIDTH = Math.sqrt(1 + SCREENPRINT_FLOOR ** 2);

function visibleStrokeDeclaration(body) {
  return /\bstroke\s*:\s*(?!none\b)[^;]+/i.test(body);
}

function cssStrokeSelectors(style) {
  const withStroke = new Set();
  const withWidth = new Set();
  for (const match of String(style).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(",").map(value => value.trim()).filter(value => value && !value.startsWith("@"));
    if (visibleStrokeDeclaration(match[2])) selectors.forEach(selector => withStroke.add(selector));
    if (/\bstroke-width\s*:/i.test(match[2])) selectors.forEach(selector => withWidth.add(selector));
  }
  return { withStroke, withWidth, missing: [...withStroke].filter(selector => !withWidth.has(selector)) };
}

function screenprintWidth(value) {
  const width = Number(value);
  if (!Number.isFinite(width) || width <= 0) return width;
  return Math.sqrt(width ** 2 + SCREENPRINT_FLOOR ** 2);
}

function widthNumber(value) {
  return Number(value.toFixed(2)).toString();
}

function normalizeScreenprintStrokes(svg) {
  let result = String(svg)
    .replace(/(\bstroke-width\s*:\s*)(\d*\.?\d+)(px)?/gi, (_match, prefix, value, unit = "") => `${prefix}${widthNumber(screenprintWidth(value))}${unit}`)
    .replace(/(\bstroke-width\s*=\s*["'])(\d*\.?\d+)(["'])/gi, (_match, prefix, value, quote) => `${prefix}${widthNumber(screenprintWidth(value))}${quote}`);
  result = result.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_match, opening, style, closing) => {
    const { missing } = cssStrokeSelectors(style);
    if (!missing.length) return `${opening}${style}${closing}`;
    return `${opening}${style}\n${missing.join(", ")} { stroke-width: ${widthNumber(SCREENPRINT_DEFAULT_WIDTH)}px; }\n${closing}`;
  });
  result = result.replace(/<([\w:-]+)\b([^>]*)>/g, (tag, name, attributes) => {
    if (!/\bstroke=["'](?!none["'])[^"']+["']/i.test(attributes) || /\bstroke-width=/i.test(attributes)) return tag;
    const suffix = attributes.endsWith("/") ? "/" : "";
    const body = suffix ? attributes.slice(0, -1) : attributes;
    return `<${name}${body} stroke-width="${widthNumber(SCREENPRINT_DEFAULT_WIDTH)}"${suffix}>`;
  });
  return result;
}

function inlineSvgClassStyles(svg) {
  const classRules = new Map();
  const presentationProperties = new Set([
    "fill",
    "stroke",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "stroke-width"
  ]);
  for (const styleMatch of String(svg).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const rule of styleMatch[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const declarations = {};
      for (const declaration of rule[2].matchAll(/([\w-]+)\s*:\s*([^;{}]+)/g)) {
        const property = declaration[1].toLowerCase();
        if (presentationProperties.has(property)) declarations[property] = declaration[2].trim();
      }
      for (const selector of rule[1].split(",").map(value => value.trim())) {
        const className = selector.match(/^\.([\w-]+)$/)?.[1];
        if (!className) continue;
        classRules.set(className, { ...(classRules.get(className) || {}), ...declarations });
      }
    }
  }
  const withoutStyles = String(svg).replace(/<style\b[^>]*>[\s\S]*?<\/style>\s*/gi, "");
  return withoutStyles.replace(/<([\w:-]+)\b([^>]*)>/g, (tag, name, sourceAttributes) => {
    const classMatch = sourceAttributes.match(/\sclass=["']([^"']+)["']/);
    if (!classMatch) return tag;
    const declarations = {};
    classMatch[1].split(/\s+/).forEach(className => Object.assign(declarations, classRules.get(className) || {}));
    const suffix = sourceAttributes.endsWith("/") ? "/" : "";
    let attributes = (suffix ? sourceAttributes.slice(0, -1) : sourceAttributes)
      .replace(/\sclass=["'][^"']+["']/, "");
    for (const [property, value] of Object.entries(declarations)) {
      attributes = attributes.replace(new RegExp(`\\s${property}=["'][^"']*["']`, "gi"), "");
      attributes += ` ${property}="${escapeXml(value)}"`;
    }
    return `<${name}${attributes}${suffix}>`;
  });
}

function screenprintStrokeStats(svg) {
  const source = String(svg);
  const widths = [
    ...[...source.matchAll(/\bstroke-width\s*:\s*(\d*\.?\d+)/gi)].map(match => Number(match[1])),
    ...[...source.matchAll(/\bstroke-width\s*=\s*["'](\d*\.?\d+)["']/gi)].map(match => Number(match[1]))
  ].filter(value => Number.isFinite(value) && value > 0);
  let defaultCount = 0;
  for (const match of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) defaultCount += cssStrokeSelectors(match[1]).missing.length;
  defaultCount += [...source.matchAll(/<[\w:-]+\b[^>]*\bstroke=["'](?!none["'])[^"']+["'][^>]*>/gi)].filter(match => !/\bstroke-width=/i.test(match[0])).length;
  const effective = [...widths, ...Array(defaultCount).fill(1)];
  return {
    minWidth: effective.length ? Math.min(...effective) : null,
    maxWidth: effective.length ? Math.max(...effective) : null,
    explicitWidthCount: widths.length,
    defaultWidthCount: defaultCount,
    belowTwoCount: effective.filter(value => value < SCREENPRINT_FLOOR).length
  };
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

function removeGroups(svg, predicate) {
  const ranges = [];
  for (const match of svg.matchAll(/<g\b[^>]*>/g)) {
    if (!predicate(match[0])) continue;
    const range = groupRange(svg, match.index);
    if (range && !ranges.some(item => range.start >= item.start && range.end <= item.end)) ranges.push(range);
  }
  return ranges.sort((a, b) => b.start - a.start).reduce((text, range) => `${text.slice(0, range.start)}${text.slice(range.end)}`, svg);
}

function rootInner(svg) {
  return String(svg).replace(/^\s*<\?xml[^>]*>\s*/, "").replace(/^\s*<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "");
}

function setRootAttributes(svg, attributes) {
  return String(svg).replace(/<svg\b([^>]*)>/, (tag, sourceAttributes) => {
    let normalized = sourceAttributes;
    for (const name of Object.keys(attributes)) {
      const attribute = new RegExp(`\\s${name}=["'][^"']*["']`, "g");
      normalized = normalized.replace(attribute, "");
    }
    const additions = Object.entries(attributes).map(([name, value]) => ` ${name}="${escapeXml(value)}"`).join("");
    return `<svg${normalized}${additions}>`;
  });
}

function normalizeApprovedSvg(svg, item) {
  let result = inlineSvgClassStyles(normalizeScreenprintStrokes(setRootAttributes(svg, {
    "data-artist-master-revision": "illustrator-v2",
    "data-genre-pattern": item.genre,
    "data-engine": item.engine,
    "data-pcm-status": "production-injected",
    "data-screenprint-stroke-policy": "sqrt-w2-plus-4-v1",
    "data-screenprint-min-stroke": SCREENPRINT_FLOOR
  })));
  result = result.replace(/<g\b[^>]*id=["']pcm_reversible_data["'][\s\S]*?<\/g>\s*/g, "");
  result = result.replace(/<g\b[^>]*(?:id=["']90_PROTECTED_PCM__PRODUCTION_ONLY["']|inkscape:label=["']90 PROTECTED PCM - PRODUCTION ONLY["'])[^>]*>[\s\S]*?<\/g>\s*/g, "");
  return result.replace(/<\/svg>\s*$/, `<g id="90_PROTECTED_PCM__PRODUCTION_ONLY" inkscape:groupmode="layer" inkscape:label="90 PROTECTED PCM - PRODUCTION ONLY" data-edit-policy="production-injected"></g></svg>`);
}

function structuralMaster(svg, genre) {
  const styleScope = Buffer.from(String(genre), "utf8").toString("hex").slice(0, 20);
  let inner = rootInner(svg).replace(/<!--([\s\S]*?)-->/g, "");
  inner = inner.replace(/<(?:title|desc)\b[^>]*>[\s\S]*?<\/(?:title|desc)>/g, "");
  inner = removeGroups(inner, tag => /inkscape:label=["'](?:00 BACKGROUND|60 DISPLAY GRAIN|90 PROTECTED PCM - PRODUCTION ONLY)["']/.test(tag));
  inner = removeGroups(inner, tag => /id=["'](?:terra_grain_field|90_PROTECTED_PCM__PRODUCTION_ONLY|pcm_reversible_data)["']/.test(tag));
  inner = inner.replace(/<rect\b[^>]*(?:width=["']1200["'][^>]*height=["']1200["']|height=["']1200["'][^>]*width=["']1200["'])[^>]*\/?>/g, "");
  inner = inner
    .replace(/id=["']sound_form_surface["']/g, `id="artist_master_${genre}_surface"`)
    .replace(/id=["']terra_primary_structure["']/g, `id="artist_master_${genre}_primary"`)
    .replace(/id=["']terra_genre_object["']/g, `id="artist_master_${genre}_object"`)
    .replace(/\s+inkscape:[\w-]+=["'][^"']*["']/g, "");
  inner = inner
    .replace(/\.cls-([\w-]+)/g, `.artist_${styleScope}_cls-$1`)
    .replace(/class=["']([^"']+)["']/g, (_match, classes) => `class="${classes.split(/\s+/).map(name => name.startsWith("cls-") ? `artist_${styleScope}_${name}` : name).join(" ")}"`);
  if (/id=["'](?:terra_grain_field|90_PROTECTED_PCM__PRODUCTION_ONLY|pcm_reversible_data)["']|inkscape:label=["']90 PROTECTED PCM - PRODUCTION ONLY["']/.test(inner)) {
    throw new Error(`${genre}: dynamic or protected data leaked into the artist master.`);
  }
  return inner.trim();
}

function escapeXml(value) {
  return String(value).replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

fs.mkdirSync(APPROVED_DIR, { recursive: true });
const masters = {};
const approved = [];
const thumbnails = [];
const strokeAudit = [];

for (const item of MANIFEST.files) {
  const source = path.join(HANDOFF_DIR, item.file);
  const svg = fs.readFileSync(source, "utf8");
  const normalized = normalizeApprovedSvg(svg, item);
  const beforeStroke = screenprintStrokeStats(svg);
  const afterStroke = screenprintStrokeStats(normalized);
  if (afterStroke.minWidth !== null && afterStroke.minWidth < SCREENPRINT_FLOOR) {
    throw new Error(`${item.genre}: screenprint stroke normalization left a ${afterStroke.minWidth}px line.`);
  }
  const output = path.join(APPROVED_DIR, path.basename(item.file));
  fs.writeFileSync(output, normalized);
  masters[item.genre] = structuralMaster(normalized, item.genre);
  thumbnails.push(await sharp(Buffer.from(normalized)).resize(260, 260).flatten({ background: "#fff" }).png().toBuffer());
  approved.push({ ...item, source: item.file, file: `approved/${path.basename(item.file)}`, masterRevision: "illustrator-v2", screenprintStroke: afterStroke });
  strokeAudit.push({ number: item.number, genre: item.genre, file: item.file, before: beforeStroke, after: afterStroke });
}

const js = `/* Generated by build-approved-illustrator-32.mjs. Do not edit by hand. */\n` +
  `globalThis.__soundFormArtistMasters=${JSON.stringify(masters)};\n`;
fs.writeFileSync(MASTER_JS, js);
fs.writeFileSync(path.join(HANDOFF_DIR, "approved-manifest.json"), `${JSON.stringify({
  format: "sound-form-approved-artist-masters-v2",
  generatedAt: new Date().toISOString(),
  masterPolicy: "Illustrator structure + live audio grain + ranked secondary genre elements + production PCM",
  files: approved
}, null, 2)}\n`);
fs.writeFileSync(path.join(HANDOFF_DIR, "screenprint-stroke-audit.json"), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  policy: "newWidth = sqrt(oldWidth^2 + 4); unspecified SVG 1px strokes become 2.24px",
  sourcePolicy: "editable originals are unchanged; approved and runtime masters are normalized",
  records: strokeAudit
}, null, 2)}\n`);
const strokeAuditMarkdown = [
  "# Screenprint Stroke Audit",
  "",
  "`editable/` 原本は変更せず、承認SVGと実行時マスターだけを `newWidth = sqrt(oldWidth^2 + 4)` で補正した結果です。線幅未指定のSVG既定1px線は2.24pxとして扱います。",
  "",
  "| No. | Genre | Before min | After min | Before <2px | After <2px |",
  "| ---: | --- | ---: | ---: | ---: | ---: |",
  ...strokeAudit.map(record => `| ${String(record.number).padStart(2, "0")} | ${record.genre} | ${record.before.minWidth?.toFixed(2) ?? "-"} | ${record.after.minWidth?.toFixed(2) ?? "-"} | ${record.before.belowTwoCount} | ${record.after.belowTwoCount} |`),
  ""
].join("\n");
fs.writeFileSync(path.join(HANDOFF_DIR, "screenprint-stroke-audit.md"), strokeAuditMarkdown);

const columns = 4;
const cardW = 300;
const cardH = 326;
const gap = 20;
const margin = 42;
const rows = Math.ceil(approved.length / columns);
const width = margin * 2 + columns * cardW + (columns - 1) * gap;
const height = 100 + rows * cardH + (rows - 1) * gap + margin;
const cards = approved.map((item, index) => {
  const x = margin + (index % columns) * (cardW + gap);
  const y = 100 + Math.floor(index / columns) * (cardH + gap);
  return `<g transform="translate(${x} ${y})"><rect width="${cardW}" height="${cardH}" fill="#fff" stroke="#000"/><image x="20" y="16" width="260" height="260" href="data:image/png;base64,${thumbnails[index].toString("base64")}"/><text x="20" y="304" class="label">${String(item.number).padStart(2, "0")} ${escapeXml(item.genre)}</text></g>`;
}).join("");
const preview = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><style>.title{font:700 34px Arial,sans-serif}.sub{font:400 14px Arial,sans-serif}.label{font:700 17px Arial,sans-serif}</style><rect width="100%" height="100%" fill="#fff"/><text x="${margin}" y="48" class="title">32 APPROVED ARTIST MASTERS / V2</text><text x="${margin}" y="76" class="sub">Illustrator revision promoted as the Top1 structure. PCM is injected only in production.</text>${cards}</svg>`;
fs.writeFileSync(path.join(HANDOFF_DIR, "approved-32-preview.svg"), preview);
await sharp(Buffer.from(preview)).png({ compressionLevel: 9 }).toFile(path.join(HANDOFF_DIR, "approved-32-preview.png"));
console.log(`Built ${approved.length} approved masters and ${path.relative(ROOT_DIR, MASTER_JS)}`);
