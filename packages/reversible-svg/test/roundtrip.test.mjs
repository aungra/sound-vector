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
  const layer = encodePcmBytesToProtectedLayer(source, { sampleRate: 4000, duration: 0.00125 });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg">${layer}</svg>`;
  const decoded = decodePcmBytesFromProtectedLayer(svg);

  assert.deepEqual([...decoded], [...source]);
  assert.match(layer, new RegExp(`id="${PROTECTED_PCM_LAYER_ID}"`));
  assert.match(layer, /data-encoding="mulaw8-protected-seal-band-v1"/);
  assert.match(layer, /data-edit-policy="lock-do-not-edit"/);
  assert.match(layer, /stroke="#111"/);
  assert.doesNotMatch(layer, /data-byte=/);
  assert.doesNotMatch(layer, /data-index=/);
  assert.doesNotMatch(layer, /display="none"/);
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
