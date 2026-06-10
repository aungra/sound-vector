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
  const cx = Number.isFinite(options.cx) ? options.cx : width / 2;
  const cy = Number.isFinite(options.cy) ? options.cy : height / 2 + 10;
  const radiusX = Number.isFinite(options.radiusX) ? options.radiusX : width * 0.41;
  const radiusY = Number.isFinite(options.radiusY) ? options.radiusY : height * 0.365;
  const amplitude = Number.isFinite(options.amplitude) ? options.amplitude : 7.6;
  const sampleRate = Number.isFinite(options.sampleRate) ? options.sampleRate : 8000;
  const channels = Number.isFinite(options.channels) ? options.channels : 1;
  const duration = Number.isFinite(options.duration) ? options.duration : values.length / sampleRate;
  const lines = [];

  for (let index = 0; index < values.length; index += 1) {
    const byte = values[index];
    const point = textureFieldPoint(index, cx, cy, radiusX, radiusY);
    const offset = ((byte - 128) / 127) * amplitude;
    const length = 2.4 + ((index * 17) % 11) * 0.18;
    const mx = point.x + point.nx * offset;
    const my = point.y + point.ny * offset;
    const x1 = mx - point.tx * length * 0.5;
    const y1 = my - point.ty * length * 0.5;
    const x2 = mx + point.tx * length * 0.5;
    const y2 = my + point.ty * length * 0.5;
    lines.push(`<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="#111" stroke-width=".28" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`);
  }

  return `<g id="${PROTECTED_PCM_LAYER_ID}" data-layer="${PROTECTED_PCM_LAYER_ID}" data-schema="${REVERSIBLE_SVG_SCHEMA}" data-encoding="mulaw8-protected-texture-field-v1" data-sample-rate="${sampleRate}" data-channels="${channels}" data-duration="${num(duration)}" data-frame-count="${values.length}" data-cx="${num(cx)}" data-cy="${num(cy)}" data-radius-x="${num(radiusX)}" data-radius-y="${num(radiusY)}" data-amplitude="${num(amplitude)}" data-visual-role="locked-protected-texture-field" data-edit-policy="lock-do-not-edit">${lines.join("")}</g>`;
}

export function decodePcmBytesFromProtectedLayer(svgText) {
  const group = extractProtectedLayer(String(svgText || ""));
  if (!group) return new Uint8Array();
  const encoding = attrText(group, "data-encoding");
  const amplitude = geometryAmplitude(group);
  const matches = [...group.matchAll(/<line\b[^>]*>/g)];
  if (encoding === "mulaw8-protected-seal-band-v1") {
    const x0 = attrNumber(group, "data-x0") ?? 108;
    const y0 = attrNumber(group, "data-y0") ?? 108;
    const width = attrNumber(group, "data-width") ?? 984;
    const height = attrNumber(group, "data-height") ?? 984;
    const step = attrNumber(group, "data-step") ?? 5.2;
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
  if (encoding && encoding !== "mulaw8-protected-texture-field-v1") return new Uint8Array();
  const declaredFrameCount = attrNumber(group, "data-frame-count");
  if (!matches.length || (Number.isFinite(declaredFrameCount) && matches.length < declaredFrameCount)) return new Uint8Array();
  const cx = attrNumber(group, "data-cx") ?? 600;
  const cy = attrNumber(group, "data-cy") ?? 610;
  const radiusX = attrNumber(group, "data-radius-x") ?? 492;
  const radiusY = attrNumber(group, "data-radius-y") ?? 438;
  return Uint8Array.from(matches.map((match, index) => {
    const tag = match[0];
    const x1 = attrNumber(tag, "x1");
    const y1 = attrNumber(tag, "y1");
    const x2 = attrNumber(tag, "x2");
    const y2 = attrNumber(tag, "y2");
    if (![x1, y1, x2, y2].every(Number.isFinite)) return 0;
    const point = textureFieldPoint(index, cx, cy, radiusX, radiusY);
    const mx = (x1 + x2) * 0.5;
    const my = (y1 + y2) * 0.5;
    const offset = (mx - point.x) * point.nx + (my - point.y) * point.ny;
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

function attrText(text, name) {
  const match = String(text || "").match(new RegExp(`${name}=["']([^"']+)["']`));
  return match ? match[1] : "";
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

function textureFieldPoint(index, cx, cy, radiusX, radiusY) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const angle = (index * golden + Math.sin(index * 12.9898) * 0.11) % (Math.PI * 2);
  const scatter = (Math.sin(index * 78.233) * 43758.5453) % 1;
  const unit = Math.sqrt(Math.abs(scatter));
  const wobble = 1 + Math.sin(index * 0.031) * 0.045;
  const x = cx + Math.cos(angle) * radiusX * unit * wobble;
  const y = cy + Math.sin(angle) * radiusY * unit * (1 + Math.cos(index * 0.027) * 0.04);
  const tx = Math.cos(angle + Math.PI / 2);
  const ty = Math.sin(angle + Math.PI / 2);
  const nx = Math.cos(angle);
  const ny = Math.sin(angle);
  return { x, y, nx, ny, tx, ty };
}

function num(value) {
  return Number(value).toFixed(4).replace(/\.?0+$/, "");
}
