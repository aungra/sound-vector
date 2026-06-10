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
  const textureSeed = normaliseSeed(options.textureSeed ?? 0);
  const textureMode = normaliseTextureMode(options.textureMode);
  const textureRegion = normaliseTextureRegion(options.textureRegion);
  const amplitude = Number.isFinite(options.amplitude) ? options.amplitude : 7.6;
  const sampleRate = Number.isFinite(options.sampleRate) ? options.sampleRate : 8000;
  const channels = Number.isFinite(options.channels) ? options.channels : 1;
  const duration = Number.isFinite(options.duration) ? options.duration : values.length / sampleRate;
  const lines = [];

  for (let index = 0; index < values.length; index += 1) {
    const byte = values[index];
    const point = textureFieldPoint(index, cx, cy, radiusX, radiusY, textureSeed, textureMode, textureRegion);
    const offset = ((byte - 128) / 127) * amplitude;
    const length = 2.4 + ((index * 17) % 11) * 0.18;
    const mx = point.x + point.nx * offset;
    const my = point.y + point.ny * offset;
    const x1 = mx - point.tx * length * 0.5;
    const y1 = my - point.ty * length * 0.5;
    const x2 = mx + point.tx * length * 0.5;
    const y2 = my + point.ty * length * 0.5;
    lines.push(`<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="#000" stroke-width=".28" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`);
  }

  return `<g id="${PROTECTED_PCM_LAYER_ID}" data-layer="${PROTECTED_PCM_LAYER_ID}" data-schema="${REVERSIBLE_SVG_SCHEMA}" data-encoding="mulaw8-protected-texture-field-v1" data-sample-rate="${sampleRate}" data-channels="${channels}" data-duration="${num(duration)}" data-frame-count="${values.length}" data-cx="${num(cx)}" data-cy="${num(cy)}" data-radius-x="${num(radiusX)}" data-radius-y="${num(radiusY)}" data-texture-seed="${textureSeed}" data-texture-mode="${escapeAttr(textureMode)}" data-texture-region="${escapeAttr(textureRegion)}" data-amplitude="${num(amplitude)}" data-visual-role="locked-protected-texture-field" data-edit-policy="lock-do-not-edit">${lines.join("")}</g>`;
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
  const hasTextureProfile = attrText(group, "data-texture-seed") !== "" || attrText(group, "data-texture-mode") !== "";
  const textureSeed = normaliseSeed(attrText(group, "data-texture-seed") || 0);
  const textureMode = normaliseTextureMode(attrText(group, "data-texture-mode"));
  const textureRegion = normaliseTextureRegion(attrText(group, "data-texture-region") || "full");
  return Uint8Array.from(matches.map((match, index) => {
    const tag = match[0];
    const x1 = attrNumber(tag, "x1");
    const y1 = attrNumber(tag, "y1");
    const x2 = attrNumber(tag, "x2");
    const y2 = attrNumber(tag, "y2");
    if (![x1, y1, x2, y2].every(Number.isFinite)) return 0;
    const point = hasTextureProfile
      ? textureFieldPoint(index, cx, cy, radiusX, radiusY, textureSeed, textureMode, textureRegion)
      : legacyTextureFieldPoint(index, cx, cy, radiusX, radiusY);
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

function textureFieldPoint(index, cx, cy, radiusX, radiusY, seed = 0, mode = "texture-field", region = "full") {
  const profile = textureFieldProfile(mode);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const jitter = noise01(index, 0, seed) - 0.5;
  const band = noise01(index, 1, seed);
  const radial = Math.pow(noise01(index, 2, seed), profile.radialPower);
  let angle = index * golden + seed * 0.00013 + jitter * profile.angleJitter;
  let unit = Math.sqrt(radial);
  if (profile.spiral) angle += unit * profile.spiral;
  let x;
  let y;
  if (profile.rectangular) {
    const u = noise01(index, 3, seed) - 0.5;
    const v = (profile.banded ? (Math.round(band * profile.bands) / profile.bands + (noise01(index, 4, seed) - 0.5) * 0.045) : noise01(index, 4, seed)) - 0.5;
    x = cx + u * radiusX * 1.86 * profile.stretchX;
    y = cy + v * radiusY * 1.72 * profile.stretchY;
    angle = profile.angle + (noise01(index, 5, seed) - 0.5) * profile.angleJitter;
  } else {
    const wobble = 1 + Math.sin(index * 0.031 + seed * 0.0007) * 0.045 + (noise01(index, 6, seed) - 0.5) * profile.scatter;
    x = cx + Math.cos(angle) * radiusX * unit * wobble * profile.stretchX;
    y = cy + Math.sin(angle) * radiusY * unit * (1 + Math.cos(index * 0.027 + seed * 0.0003) * 0.04) * profile.stretchY;
    angle += profile.angle;
  }
  const regionPoint = textureRegionPoint(index, x, y, cx, cy, radiusX, radiusY, seed, region);
  x = regionPoint.x;
  y = regionPoint.y;
  if (Number.isFinite(regionPoint.angle)) angle = regionPoint.angle;
  const txAngle = profile.radialStroke ? angle : angle + Math.PI / 2;
  const tx = Math.cos(txAngle);
  const ty = Math.sin(txAngle);
  const nx = -ty;
  const ny = tx;
  return { x, y, nx, ny, tx, ty };
}

function textureRegionPoint(index, x, y, cx, cy, radiusX, radiusY, seed = 0, region = "full") {
  const mode = normaliseTextureRegion(region);
  if (mode === "full") return { x, y };
  const noise = salt => noise01(index, 20 + salt, seed);
  const dx = x - cx;
  const dy = y - cy;
  const angle = Math.atan2(dy / Math.max(1, radiusY), dx / Math.max(1, radiusX));
  if (mode === "core") return { x: cx + dx * 0.54, y: cy + dy * 0.5 };
  if (mode === "orbit") {
    const ring = 0.46 + noise(1) * 0.4;
    const a = angle + (noise(2) - 0.5) * 0.35;
    return { x: cx + Math.cos(a) * radiusX * ring, y: cy + Math.sin(a) * radiusY * ring * 0.82, angle: a };
  }
  if (mode === "border") {
    const ring = 0.76 + noise(1) * 0.2;
    const a = angle + (noise(2) - 0.5) * 0.18;
    return { x: cx + Math.cos(a) * radiusX * ring, y: cy + Math.sin(a) * radiusY * ring, angle: a };
  }
  if (mode === "diagonal") {
    const diagonalY = cy + (x - cx) * 0.42;
    return { x: cx + dx * 0.92, y: diagonalY + (y - diagonalY) * 0.32, angle: 0.42 };
  }
  if (mode === "bands") {
    const band = Math.round((noise(1) * 2 - 1) * 5) / 5;
    return { x, y: cy + band * radiusY * 0.74 + (noise(2) - 0.5) * 24, angle: 0 };
  }
  if (mode === "fracture") {
    const rays = 11;
    const a = Math.round((angle / (Math.PI * 2)) * rays) / rays * Math.PI * 2 + (noise(1) - 0.5) * 0.38;
    const r = Math.pow(noise(2), 0.58) * 0.92;
    return { x: cx + Math.cos(a) * radiusX * r, y: cy + Math.sin(a) * radiusY * r, angle: a };
  }
  if (mode === "islands") {
    const centers = [
      { x: -0.38, y: -0.24 }, { x: 0.32, y: -0.18 }, { x: -0.16, y: 0.34 }, { x: 0.24, y: 0.3 }
    ];
    const center = centers[index % centers.length];
    return {
      x: cx + center.x * radiusX + (noise(1) - 0.5) * radiusX * 0.42,
      y: cy + center.y * radiusY + (noise(2) - 0.5) * radiusY * 0.36
    };
  }
  return { x, y };
}

function legacyTextureFieldPoint(index, cx, cy, radiusX, radiusY) {
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

function textureFieldProfile(mode) {
  const profiles = {
    "spectral-barcode": { rectangular: true, banded: true, bands: 10, angle: Math.PI / 2, angleJitter: 0.08, radialPower: 1, stretchX: 1.02, stretchY: 0.72, scatter: 0.02 },
    "wave-strata": { rectangular: true, banded: true, bands: 14, angle: 0.06, angleJitter: 0.12, radialPower: 1, stretchX: 0.98, stretchY: 0.66, scatter: 0.02 },
    "signal-flag": { rectangular: true, banded: true, bands: 9, angle: 0.16, angleJitter: 0.18, radialPower: 1, stretchX: 0.92, stretchY: 0.7, scatter: 0.02 },
    "radial-score": { radialStroke: true, spiral: 0.25, angle: 0, angleJitter: 0.16, radialPower: 0.82, stretchX: 0.92, stretchY: 0.84, scatter: 0.08 },
    "spiral-core": { spiral: 5.8, angle: 0, angleJitter: 0.18, radialPower: 0.92, stretchX: 0.82, stretchY: 0.68, scatter: 0.1 },
    "memory-orbit": { spiral: 1.5, angle: 0, angleJitter: 0.15, radialPower: 0.7, stretchX: 0.9, stretchY: 0.72, scatter: 0.08 },
    "constellation-map": { spiral: 0.7, angle: 0, angleJitter: 0.48, radialPower: 0.55, stretchX: 0.88, stretchY: 0.78, scatter: 0.18 },
    "carrier-storm": { radialStroke: true, spiral: 2.7, angle: 0.35, angleJitter: 0.9, radialPower: 0.62, stretchX: 1, stretchY: 0.82, scatter: 0.2 },
    "impact-fracture": { radialStroke: true, spiral: 0.9, angle: -0.35, angleJitter: 1.25, radialPower: 0.64, stretchX: 0.95, stretchY: 0.82, scatter: 0.22 },
    "pressure-map": { spiral: 0.45, angle: 0, angleJitter: 0.1, radialPower: 0.46, stretchX: 0.78, stretchY: 0.62, scatter: 0.06 },
    "topographic-pressure": { spiral: 0.3, angle: 0, angleJitter: 0.08, radialPower: 0.42, stretchX: 0.86, stretchY: 0.68, scatter: 0.05 }
  };
  return profiles[mode] || { spiral: 0.4, angle: 0, angleJitter: 0.28, radialPower: 0.86, stretchX: 1, stretchY: 1, scatter: 0.12 };
}

function normaliseTextureMode(value) {
  return String(value || "texture-field").replace(/[^a-z0-9_-]/gi, "").slice(0, 48) || "texture-field";
}

function normaliseTextureRegion(value) {
  const region = String(value || "full").replace(/[^a-z0-9_-]/gi, "").slice(0, 32);
  return ["full", "core", "diagonal", "bands", "orbit", "fracture", "border", "islands"].includes(region) ? region : "full";
}

function normaliseSeed(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.abs(Math.round(numeric)) % 2147483647;
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 2147483647;
}

function noise01(index, salt, seed) {
  const value = Math.sin((index + 1) * 12.9898 + (salt + 1) * 78.233 + seed * 0.000143) * 43758.5453123;
  return value - Math.floor(value);
}

function escapeAttr(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[char]);
}

function num(value) {
  return Number(value).toFixed(4).replace(/\.?0+$/, "");
}
