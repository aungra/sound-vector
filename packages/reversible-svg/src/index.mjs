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
  const textureShape = normaliseProtectedTextureShape(options.textureShape);
  const amplitude = Number.isFinite(options.amplitude) ? options.amplitude : 7.6;
  const sampleRate = Number.isFinite(options.sampleRate) ? options.sampleRate : 8000;
  const channels = Number.isFinite(options.channels) ? options.channels : 1;
  const duration = Number.isFinite(options.duration) ? options.duration : values.length / sampleRate;
  const particles = [];

  for (let index = 0; index < values.length; index += 1) {
    const byte = values[index];
    const point = protectedParticleFieldPoint(index, cx, cy, radiusX, radiusY, textureSeed, textureMode, textureRegion, values.length, textureShape);
    const offset = ((byte - 128) / 127) * amplitude;
    const px = point.x + point.nx * offset;
    const py = point.y + point.ny * offset;
    const r = protectedParticleRadius(index, textureSeed);
    particles.push(`<circle cx="${num(px)}" cy="${num(py)}" r="${num(r)}" fill="#000"/>`);
  }

  return `<g id="${PROTECTED_PCM_LAYER_ID}" data-layer="${PROTECTED_PCM_LAYER_ID}" data-schema="${REVERSIBLE_SVG_SCHEMA}" data-encoding="mulaw8-protected-particle-field-v1" data-sample-rate="${sampleRate}" data-channels="${channels}" data-duration="${num(duration)}" data-frame-count="${values.length}" data-cx="${num(cx)}" data-cy="${num(cy)}" data-radius-x="${num(radiusX)}" data-radius-y="${num(radiusY)}" data-texture-seed="${textureSeed}" data-texture-mode="${escapeAttr(textureMode)}" data-texture-region="${escapeAttr(textureRegion)}" data-protected-texture-shape="${escapeAttr(textureShape)}" data-amplitude="${num(amplitude)}" data-visual-role="locked-protected-particle-field" data-edit-policy="lock-do-not-edit">${particles.join("")}</g>`;
}

export function decodePcmBytesFromProtectedLayer(svgText) {
  const group = extractProtectedLayer(String(svgText || ""));
  if (!group) return new Uint8Array();
  const encoding = attrText(group, "data-encoding");
  const amplitude = geometryAmplitude(group);
  const matches = [...group.matchAll(/<line\b[^>]*>/g)];
  const particleMatches = [...group.matchAll(/<circle\b[^>]*>/g)];
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
  if (encoding === "mulaw8-protected-particle-field-v1") {
    const declaredFrameCount = attrNumber(group, "data-frame-count");
    if (!particleMatches.length || (Number.isFinite(declaredFrameCount) && particleMatches.length < declaredFrameCount)) return new Uint8Array();
    const cx = attrNumber(group, "data-cx") ?? 600;
    const cy = attrNumber(group, "data-cy") ?? 610;
    const radiusX = attrNumber(group, "data-radius-x") ?? 492;
    const radiusY = attrNumber(group, "data-radius-y") ?? 438;
    const textureSeed = normaliseSeed(attrText(group, "data-texture-seed") || 0);
    const textureMode = normaliseTextureMode(attrText(group, "data-texture-mode"));
    const textureRegion = normaliseTextureRegion(attrText(group, "data-texture-region") || "full");
    const textureShape = normaliseProtectedTextureShape(attrText(group, "data-protected-texture-shape") || "field");
    return Uint8Array.from(particleMatches.map((match, index) => {
      const tag = match[0];
      const px = attrNumber(tag, "cx");
      const py = attrNumber(tag, "cy");
      if (![px, py].every(Number.isFinite)) return 0;
      const point = protectedParticleFieldPoint(index, cx, cy, radiusX, radiusY, textureSeed, textureMode, textureRegion, declaredFrameCount || particleMatches.length, textureShape);
      const offset = (px - point.x) * point.nx + (py - point.y) * point.ny;
      return clampByte((offset / amplitude) * 127 + 128);
    }));
  }
  if (encoding && !["mulaw8-protected-texture-field-v1", "mulaw8-protected-texture-field-v2"].includes(encoding)) return new Uint8Array();
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
    const point = encoding === "mulaw8-protected-texture-field-v2"
      ? textureFieldPointV2(index, cx, cy, radiusX, radiusY, textureSeed, textureMode, textureRegion, declaredFrameCount || matches.length)
      : hasTextureProfile
      ? textureFieldPoint(index, cx, cy, radiusX, radiusY, textureSeed, textureMode, textureRegion)
      : legacyTextureFieldPoint(index, cx, cy, radiusX, radiusY);
    const mx = (x1 + x2) * 0.5;
    const my = (y1 + y2) * 0.5;
    const offset = (mx - point.x) * point.nx + (my - point.y) * point.ny;
    return clampByte((offset / amplitude) * 127 + 128);
  }));
}

function protectedParticleFieldPoint(index, cx, cy, radiusX, radiusY, seed = 0, mode = "texture-field", region = "full", frameCount = 1, shape = "field") {
  const point = textureFieldPointV2(index, cx, cy, radiusX, radiusY, seed, mode, region, frameCount);
  return protectedTextureShapePoint(index, point, cx, cy, radiusX, radiusY, seed, shape, frameCount);
}

function protectedParticleRadius(index, seed = 0) {
  return 0.62 + noise01(index, 43, seed) * 0.82;
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

function textureFieldPointV2(index, cx, cy, radiusX, radiusY, seed = 0, mode = "texture-field", region = "full", frameCount = 1) {
  const profile = textureFieldProfile(mode);
  const total = Math.max(1, Math.round(Number(frameCount) || 1));
  const aspect = Math.max(0.35, Math.min(2.4, radiusX / Math.max(1, radiusY)));
  const cols = Math.max(1, Math.ceil(Math.sqrt(total * aspect)));
  const rows = Math.max(1, Math.ceil(total / cols));
  const slot = (index + (seed % total)) % total;
  const col = slot % cols;
  const row = Math.floor(slot / cols);
  const jx = (noise01(index, 31, seed) - 0.5) * 0.44;
  const jy = (noise01(index, 32, seed) - 0.5) * 0.44;
  const u = ((col + 0.5 + jx) / cols) * 2 - 1;
  const v = ((row + 0.5 + jy) / rows) * 2 - 1;
  let x = cx + u * radiusX * 0.94 * profile.stretchX;
  let y = cy + v * radiusY * 0.9 * profile.stretchY;
  let angle = profile.angle + (noise01(index, 33, seed) - 0.5) * Math.max(0.08, profile.angleJitter);
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

function protectedTextureShapePoint(index, point, cx, cy, radiusX, radiusY, seed = 0, shape = "field", frameCount = 1) {
  const mode = normaliseProtectedTextureShape(shape);
  if (mode === "field") return point;
  const total = Math.max(1, Math.round(Number(frameCount) || 1));
  const t = ((index + 0.5) / total + noise01(index, 71, seed) * 0.004) % 1;
  const noise = salt => noise01(index, 72 + salt, seed);
  const signed = salt => noise(salt) * 2 - 1;
  const slot = (index + seed) % total;
  const cols = Math.max(1, Math.ceil(Math.sqrt(total * 1.15)));
  const row = Math.floor(slot / cols);
  const col = slot % cols;
  const u = ((col + 0.5 + signed(1) * 0.28) / cols) * 2 - 1;
  const rows = Math.max(1, Math.ceil(total / cols));
  const v = ((row + 0.5 + signed(2) * 0.28) / rows) * 2 - 1;
  let x = point.x;
  let y = point.y;
  let angle = Math.atan2(point.ty, point.tx);
  const set = (px, py, a) => {
    x = cx + px * radiusX;
    y = cy + py * radiusY;
    angle = Number.isFinite(a) ? a : angle;
  };
  if (mode === "crescent") {
    const a = Math.PI * (0.12 + t * 0.78);
    const r = 0.42 + noise(3) * 0.18;
    set(Math.cos(a) * r - 0.14, Math.sin(a) * r * 0.58 - 0.08, a + Math.PI / 2);
  } else if (mode === "vertical-pillars" || mode === "wobble-pillars") {
    const lanes = mode === "wobble-pillars" ? 5 : 3;
    const lane = (index + seed) % lanes - (lanes - 1) / 2;
    const wave = mode === "wobble-pillars" ? Math.sin(t * Math.PI * 8 + lane) * 0.07 : 0;
    set(lane * 0.16 + wave + signed(3) * 0.018, v * 0.84, Math.PI / 2);
  } else if (mode === "circuit-gates" || mode === "square-frame") {
    const side = Math.floor(t * 4);
    const p = (t * 4) % 1 * 2 - 1;
    const inset = mode === "square-frame" ? 0.46 : 0.54;
    if (side === 0) set(p * inset, -0.38 + signed(3) * 0.018, 0);
    else if (side === 1) set(inset + signed(3) * 0.018, p * 0.38, Math.PI / 2);
    else if (side === 2) set(-p * inset, 0.38 + signed(3) * 0.018, 0);
    else set(-inset + signed(3) * 0.018, -p * 0.38, Math.PI / 2);
  } else if (mode === "stair-canopy" || mode === "broken-rails" || mode === "chevron-stack") {
    const bands = mode === "chevron-stack" ? 9 : 7;
    const b = (index + seed) % bands;
    const p = (Math.floor(index / bands) % Math.max(1, Math.ceil(total / bands))) / Math.max(1, Math.ceil(total / bands) - 1) * 2 - 1;
    const slope = mode === "stair-canopy" ? -0.18 : mode === "broken-rails" ? 0.28 * (b % 2 ? 1 : -1) : Math.abs(p) * 0.34;
    set(p * 0.7, -0.42 + b / Math.max(1, bands - 1) * 0.84 + slope * 0.22 + signed(3) * 0.018, mode === "chevron-stack" ? (p < 0 ? 0.74 : -0.74) : 0);
  } else if (mode === "bass-bowl" || mode === "blue-drop") {
    const a = mode === "blue-drop" ? Math.PI * (0.18 + t * 1.34) : Math.PI * (1.08 + t * 0.84);
    const r = mode === "blue-drop" ? 0.32 + noise(3) * 0.22 : 0.38 + noise(3) * 0.16;
    set(Math.cos(a) * r, Math.sin(a) * r * 0.5 + (mode === "blue-drop" ? 0.04 : 0.2), a + Math.PI / 2);
  } else if (mode === "pixel-mask" || mode === "window-blocks") {
    const cells = mode === "pixel-mask" ? 9 : 6;
    const px = ((index + seed) % cells) - (cells - 1) / 2;
    const py = (Math.floor((index + seed) / cells) % cells) - (cells - 1) / 2;
    if (mode === "pixel-mask" && Math.abs(px) < 1.2 && Math.abs(py) < 1.2) set((px + 2.2) / cells, py / cells, 0);
    else set(px * 0.13 + signed(3) * 0.012, py * 0.11 + signed(4) * 0.012, 0);
  } else if (mode === "triangle-fan" || mode === "pop-ribbon" || mode === "scratch-burst" || mode === "string-fan") {
    const span = mode === "triangle-fan" ? Math.PI * 0.9 : Math.PI * 1.9;
    const start = mode === "triangle-fan" ? Math.PI * 0.96 : Math.PI * 0.08;
    const a = start + t * span + signed(3) * 0.04;
    const r = 0.16 + noise(4) * (mode === "scratch-burst" ? 0.72 : 0.58);
    const yScale = mode === "pop-ribbon" ? 0.44 : 0.72;
    set(Math.cos(a) * r, Math.sin(a) * r * yScale, a);
  } else if (mode === "ribbons" || mode === "echo-columns" || mode === "thread-columns") {
    const lanes = mode === "echo-columns" ? 5 : mode === "thread-columns" ? 9 : 3;
    const lane = (index + seed) % lanes - (lanes - 1) / 2;
    const wave = Math.sin(t * Math.PI * (mode === "thread-columns" ? 6 : 3) + lane) * (mode === "ribbons" ? 0.16 : 0.04);
    set(lane * (mode === "ribbons" ? 0.2 : 0.11) + wave, v * 0.76, Math.PI / 2);
  } else if (mode === "blade-gate") {
    const lane = (index + seed) % 4 - 1.5;
    set(lane * 0.18 + signed(3) * 0.012, v * 0.82, Math.PI / 2 + lane * 0.08);
  } else if (mode === "cymbal-dots" || mode === "voice-pools" || mode === "island-burns") {
    const centers = mode === "voice-pools"
      ? [{ x: -0.26, y: 0 }, { x: 0.26, y: 0.04 }]
      : mode === "island-burns"
      ? [{ x: -0.32, y: -0.25 }, { x: 0.3, y: -0.2 }, { x: -0.24, y: 0.26 }, { x: 0.28, y: 0.24 }]
      : [{ x: -0.4, y: -0.18 }, { x: -0.1, y: 0.18 }, { x: 0.3, y: -0.05 }, { x: 0.48, y: 0.24 }];
    const c = centers[index % centers.length];
    set(c.x + signed(3) * 0.13, c.y + signed(4) * 0.11, Math.PI * noise(5));
  } else if (mode === "mirror-orbit" || mode === "spark-ring" || mode === "petal-ring") {
    const petals = mode === "petal-ring" ? 10 : mode === "spark-ring" ? 12 : 14;
    const lane = (index + seed) % petals;
    const a = lane / petals * Math.PI * 2 + signed(3) * 0.045;
    const r = mode === "spark-ring" && lane % 2 ? 0.7 : 0.47 + noise(4) * 0.2;
    set(Math.cos(a) * r, Math.sin(a) * r * 0.76, a);
  } else if (mode === "staff-rest") {
    const b = (index + seed) % 5;
    set(u * 0.72, -0.28 + b * 0.14 + signed(3) * 0.012, 0);
  } else if (mode === "stage-arch") {
    const a = Math.PI * (0.08 + t * 0.84);
    const r = 0.28 + (index % 7) * 0.055 + noise(3) * 0.018;
    set(Math.cos(a) * r, Math.sin(a) * r * 0.86 + 0.18, a + Math.PI / 2);
  } else if (mode === "compass-diamond") {
    const side = Math.floor(t * 4);
    const p = (t * 4) % 1;
    const pts = [[0, -0.68], [0.58, 0], [0, 0.68], [-0.58, 0], [0, -0.68]];
    const a0 = pts[side];
    const a1 = pts[side + 1];
    set(a0[0] + (a1[0] - a0[0]) * p + signed(3) * 0.018, a0[1] + (a1[1] - a0[1]) * p + signed(4) * 0.018, Math.atan2(a1[1] - a0[1], a1[0] - a0[0]));
  } else if (mode === "tag-slab") {
    set(u * 0.62, v * 0.16 + Math.sin(u * Math.PI) * 0.06, -0.08);
  } else if (mode === "comet-hook") {
    const a = Math.PI * (0.65 + t * 0.9);
    const r = 0.28 + t * 0.42;
    set(Math.cos(a) * r + 0.18, Math.sin(a) * r * 0.7 - 0.08, a + Math.PI / 2);
  }
  const tx = Math.cos(angle);
  const ty = Math.sin(angle);
  return { x, y, tx, ty, nx: -ty, ny: tx };
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

function normaliseProtectedTextureShape(value) {
  const shape = String(value || "field").replace(/[^a-z0-9_-]/gi, "").slice(0, 48);
  return [
    "field", "crescent", "vertical-pillars", "island-burns", "circuit-gates", "square-frame",
    "stair-canopy", "bass-bowl", "comet-hook", "broken-rails", "wobble-pillars", "pixel-mask",
    "tag-slab", "triangle-fan", "ribbons", "echo-columns", "blue-drop", "string-fan",
    "scratch-burst", "chevron-stack", "blade-gate", "cymbal-dots", "voice-pools",
    "mirror-orbit", "window-blocks", "pop-ribbon", "spark-ring", "staff-rest",
    "stage-arch", "thread-columns", "petal-ring", "compass-diamond"
  ].includes(shape) ? shape : "field";
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
