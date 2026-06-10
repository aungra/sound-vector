import assert from "node:assert/strict";
import test from "node:test";
import {
  PROTECTED_PCM_LAYER_ID,
  decodePcmBytesFromProtectedLayer,
  encodePcmBytesToProtectedLayer,
  inspectReversibleSvg
} from "../src/index.mjs";

test("round trips PCM bytes through protected SVG geometry", () => {
  const source = Uint8Array.from([0, 12, 128, 240, 255]);
  const layer = encodePcmBytesToProtectedLayer(source, { sampleRate: 4000, duration: 0.00125, textureSeed: 42, textureMode: "spiral-core" });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg">${layer}</svg>`;
  const decoded = decodePcmBytesFromProtectedLayer(svg);

  assert.deepEqual([...decoded], [...source]);
  assert.match(layer, new RegExp(`id="${PROTECTED_PCM_LAYER_ID}"`));
  assert.match(layer, /data-encoding="mulaw8-protected-texture-field-v1"/);
  assert.match(layer, /data-edit-policy="lock-do-not-edit"/);
  assert.match(layer, /data-frame-count="5"/);
  assert.match(layer, /data-texture-seed="42"/);
  assert.match(layer, /data-texture-mode="spiral-core"/);
  assert.match(layer, /data-visual-role="locked-protected-texture-field"/);
  assert.match(layer, /stroke="#111"/);
  assert.match(layer, /<line\b/);
  assert.doesNotMatch(layer, /data-byte=/);
  assert.doesNotMatch(layer, /data-index=/);
  assert.doesNotMatch(layer, /display="none"/);
});

test("uses texture seed and mode to vary protected geometry without losing bytes", () => {
  const source = Uint8Array.from([4, 32, 64, 96, 128, 160, 224]);
  const a = encodePcmBytesToProtectedLayer(source, { textureSeed: "alpha", textureMode: "spectral-barcode" });
  const b = encodePcmBytesToProtectedLayer(source, { textureSeed: "beta", textureMode: "carrier-storm" });

  assert.notEqual(a, b);
  assert.deepEqual([...decodePcmBytesFromProtectedLayer(`<svg>${a}</svg>`)], [...source]);
  assert.deepEqual([...decodePcmBytesFromProtectedLayer(`<svg>${b}</svg>`)], [...source]);
});

test("rejects incomplete protected texture geometry", () => {
  const layer = encodePcmBytesToProtectedLayer([20, 80, 140], { sampleRate: 4000 });
  const brokenLayer = layer.replace(/<line\b[^>]*><\/line>|<line\b[^>]*\/>/, "");
  const decoded = decodePcmBytesFromProtectedLayer(`<svg>${brokenLayer}</svg>`);

  assert.equal(decoded.length, 0);
});

test("keeps legacy seal-band protected geometry readable", () => {
  const legacyLayer = [
    `<g id="${PROTECTED_PCM_LAYER_ID}" data-layer="${PROTECTED_PCM_LAYER_ID}" data-encoding="mulaw8-protected-seal-band-v1" data-x0="108" data-y0="108" data-width="984" data-height="984" data-step="5.2" data-amplitude="7.6">`,
    `<line x1="108" y1="108" x2="108" y2="100.34"/>`,
    `<line x1="113.2" y1="108" x2="113.2" y2="108"/>`,
    `<line x1="118.4" y1="108" x2="118.4" y2="115.6"/>`,
    `</g>`
  ].join("");
  const decoded = decodePcmBytesFromProtectedLayer(`<svg>${legacyLayer}</svg>`);

  assert.deepEqual([...decoded], [0, 128, 255]);
});

test("keeps seedless texture-field geometry readable", () => {
  const legacyLayer = [
    `<g id="${PROTECTED_PCM_LAYER_ID}" data-layer="${PROTECTED_PCM_LAYER_ID}" data-encoding="mulaw8-protected-texture-field-v1" data-frame-count="1" data-cx="600" data-cy="610" data-radius-x="492" data-radius-y="438" data-amplitude="7.6">`,
    `<line x1="592.40" y1="608.80" x2="592.40" y2="611.20"/>`,
    `</g>`
  ].join("");
  const decoded = decodePcmBytesFromProtectedLayer(`<svg>${legacyLayer}</svg>`);

  assert.deepEqual([...decoded], [1]);
});

test("inspects reversible SVG protected layer metadata", () => {
  const layer = encodePcmBytesToProtectedLayer([1, 2, 3], { sampleRate: 8000, channels: 1, duration: 0.5 });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><metadata id="mmfr-reversible"></metadata>${layer}</svg>`;
  const result = inspectReversibleSvg(svg);

  assert.equal(result.schema, "mmfr.reversible-svg.v1");
  assert.equal(result.hasMetadata, true);
  assert.equal(result.hasProtectedPcmLayer, true);
  assert.equal(result.byteLength, 3);
  assert.equal(result.sampleRate, 8000);
  assert.equal(result.channels, 1);
  assert.equal(result.duration, 0.5);
});
