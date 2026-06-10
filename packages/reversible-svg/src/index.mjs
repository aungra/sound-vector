export const REVERSIBLE_SVG_SCHEMA = "mmfr.reversible-svg.v1";
export const REVERSIBLE_METADATA_ID = "mmfr-reversible";
export const VISIBLE_PCM_LAYER_ID = "pcm_reversible_waveform";
export const PROTECTED_PCM_LAYER_ID = "pcm_reversible_data";

export const reversibleSvgLayerPolicies = [
  { id: REVERSIBLE_METADATA_ID, role: "metadata", editPolicy: "generated" },
  { id: VISIBLE_PCM_LAYER_ID, role: "editable-visual", editPolicy: "editable" },
  { id: PROTECTED_PCM_LAYER_ID, role: "protected-restoration", editPolicy: "lock-do-not-edit" }
];

export function encodePcmBytesToProtectedLayer(bytes, options = {}) {
  const values = normaliseBytes(bytes);
  const width = Number.isFinite(options.width) ? options.width : 1200;
  const height = Number.isFinite(options.height) ? options.height : 1200;
  const x0 = Number.isFinite(options.x) ? options.x : 108;
  const y0 = Number.isFinite(options.y) ? options.y : 108;
  const bandWidth = Number.isFinite(options.bandWidth) ? options.bandWidth : width - x0 * 2;
  const bandHeight = Number.isFinite(options.bandHeight) ? options.bandHeight : height - y0 * 2;
  const step = Number.isFinite(options.step) ? options.step : 5.2;
  const amplitude = Number.isFinite(options.amplitude) ? options.amplitude : 7.6;
  const sampleRate = Number.isFinite(options.sampleRate) ? options.sampleRate : 8000;
  const channels = Number.isFinite(options.channels) ? options.channels : 1;
  const duration = Number.isFinite(options.duration) ? options.duration : values.length / sampleRate;
  const lines = [];

  for (let index = 0; index < values.length; index += 1) {
    const byte = values[index];
    const point = sealBandPoint(index, x0, y0, bandWidth, bandHeight, step);
    const offset = ((byte - 128) / 127) * amplitude;
    const x2 = point.x + point.nx * offset;
    const y2 = point.y + point.ny * offset;
    lines.push(`<line x1="${num(point.x)}" y1="${num(point.y)}" x2="${num(x2)}" y2="${num(y2)}" stroke="#111" stroke-width=".32" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`);
  }

  return `<g id="${PROTECTED_PCM_LAYER_ID}" data-layer="${PROTECTED_PCM_LAYER_ID}" data-schema="${REVERSIBLE_SVG_SCHEMA}" data-encoding="mulaw8-protected-seal-band-v1" data-sample-rate="${sampleRate}" data-channels="${channels}" data-duration="${num(duration)}" data-x0="${num(x0)}" data-y0="${num(y0)}" data-width="${num(bandWidth)}" data-height="${num(bandHeight)}" data-step="${num(step)}" data-amplitude="${num(amplitude)}" data-visual-role="locked-micro-weave-seal-band" data-edit-policy="lock-do-not-edit">${lines.join("")}</g>`;
}

export function decodePcmBytesFromProtectedLayer(svgText) {
  const group = extractProtectedLayer(String(svgText || ""));
  if (!group) return new Uint8Array();
  const x0 = attrNumber(group, "data-x0") ?? 108;
  const y0 = attrNumber(group, "data-y0") ?? 108;
  const width = attrNumber(group, "data-width") ?? 984;
  const height = attrNumber(group, "data-height") ?? 984;
  const step = attrNumber(group, "data-step") ?? 5.2;
  const amplitude = geometryAmplitude(group);
  const matches = [...group.matchAll(/<line\b[^>]*>/g)];
  return Uint8Array.from(matches.map((match, index) => {
    const tag = match[0];
    const x2 = attrNumber(tag, "x2");
    const y2 = attrNumber(tag, "y2");
    if (!Number.isFinite(x2) || !Number.isFinite(y2)) return 0;
    const point = sealBandPoint(index, x0, y0, width, height, step);
    const offset = (x2 - point.x) * point.nx + (y2 - point.y) * point.ny;
    return clampByte((offset / amplitude) * 127 + 128);
  }));
}

export function inspectReversibleSvg(svgText) {
  const text = String(svgText || "");
  const protectedLayer = extractProtectedLayer(text);
  const sampleRate = attrNumber(protectedLayer, "data-sample-rate");
  const channels = attrNumber(protectedLayer, "data-channels");
  const duration = attrNumber(protectedLayer, "data-duration");

  return {
    schema: text.includes(REVERSIBLE_SVG_SCHEMA) ? REVERSIBLE_SVG_SCHEMA : null,
    hasMetadata: text.includes(`id="${REVERSIBLE_METADATA_ID}"`) || text.includes(`id='${REVERSIBLE_METADATA_ID}'`),
    hasVisiblePcmLayer: text.includes(`id="${VISIBLE_PCM_LAYER_ID}"`) || text.includes(`id='${VISIBLE_PCM_LAYER_ID}'`),
    hasProtectedPcmLayer: Boolean(protectedLayer),
    byteLength: decodePcmBytesFromProtectedLayer(text).length,
    sampleRate,
    channels,
    duration
  };
}

function extractProtectedLayer(svgText) {
  const match = svgText.match(new RegExp(`<g\\b[^>]*id=["']${PROTECTED_PCM_LAYER_ID}["'][^>]*>[\\s\\S]*?<\\/g>`));
  return match ? match[0] : "";
}

function normaliseBytes(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (Array.isArray(bytes)) return Uint8Array.from(bytes.map(clampByte));
  throw new TypeError("Expected Uint8Array or number[] PCM bytes.");
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

function attrNumber(text, name) {
  const match = String(text || "").match(new RegExp(`${name}=["']([^"']+)["']`));
  return match ? Number(match[1]) : null;
}

function geometryAmplitude(group) {
  const declared = attrNumber(group, "data-amplitude");
  if (Number.isFinite(declared) && declared > 0) return declared;
  const lines = [...String(group || "").matchAll(/<line\b[^>]*>/g)];
  const maxDelta = lines.reduce((max, match) => {
    const y1 = attrNumber(match[0], "y1");
    const y2 = attrNumber(match[0], "y2");
    return Number.isFinite(y1) && Number.isFinite(y2) ? Math.max(max, Math.abs(y1 - y2)) : max;
  }, 0);
  return maxDelta || 96;
}

function sealBandPoint(index, x0, y0, width, height, step) {
  const perimeter = Math.max(1, width * 2 + height * 2);
  const p = (index * step) % perimeter;
  if (p < width) return { x: x0 + p, y: y0, nx: 0, ny: 1 };
  if (p < width + height) return { x: x0 + width, y: y0 + (p - width), nx: -1, ny: 0 };
  if (p < width * 2 + height) return { x: x0 + width - (p - width - height), y: y0 + height, nx: 0, ny: -1 };
  return { x: x0, y: y0 + height - (p - width * 2 - height), nx: 1, ny: 0 };
}

function num(value) {
  return Number(value).toFixed(4).replace(/\.?0+$/, "");
}
