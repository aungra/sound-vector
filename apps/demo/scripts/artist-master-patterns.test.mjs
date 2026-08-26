import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  injectProtectedGeometry,
  loadIllustratorApi,
  moodForGenre,
  protectedGeometryHash
} from "./illustrator-handoff-lib.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../../..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "docs/illustrator-handoff/approved-manifest.json"), "utf8"));
const strokeAudit = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "docs/illustrator-handoff/screenprint-stroke-audit.json"), "utf8"));
const masterSource = fs.readFileSync(path.join(ROOT_DIR, "apps/demo/artist-master-patterns.js"), "utf8");

test("approved Illustrator masters are structural, monochrome, and complete", () => {
  assert.equal(manifest.files.length, 32);
  assert.doesNotMatch(masterSource, /id=["'](?:terra_grain_field|pcm_reversible_data|90_PROTECTED_PCM__PRODUCTION_ONLY)["']/);
  assert.doesNotMatch(masterSource, /(?:opacity|stroke-opacity|fill-opacity|filter|linearGradient|radialGradient)\s*=/i);
  const colors = [...masterSource.matchAll(/(?:fill|stroke)=["']([^"']+)["']/g)].map(match => match[1]);
  assert.ok(colors.every(color => ["#000", "#fff", "none"].includes(color)), "artist masters must remain black, white, or none");
  assert.doesNotMatch(masterSource, /<style\b|\bclass=["']/, "runtime masters must use inline SVG presentation attributes");
});

test("all approved patterns meet the screenprint stroke floor", () => {
  assert.equal(strokeAudit.records.length, 32);
  for (const record of strokeAudit.records) {
    assert.equal(record.after.belowTwoCount, 0, `${record.genre} still contains a sub-2px stroke`);
    if (record.after.minWidth !== null) assert.ok(record.after.minWidth >= 2, `${record.genre} minimum stroke is ${record.after.minWidth}px`);
  }
});

test("all 32 live patterns use the approved Top1 structure and restore production PCM", () => {
  const api = loadIllustratorApi({ artistMasters: true });
  for (const [index, item] of manifest.files.entries()) {
    const mood = moodForGenre(api, item.genre, index);
    const generated = api.generateSoundClothReversibleSvg(mood, 1800010000000 + index, { variantSeed: index * 31 });
    assert.match(generated, new RegExp(`data-artist-master-genre=["']${item.genre}["']`));
    assert.match(generated, /data-artist-master-style=["']inline-presentation-v1["']/);
    assert.match(generated, /data-visual-role=["']approved-artist-master["']/);
    assert.match(generated, /id=["']terra_grain_field["']/);
    assert.match(generated, /id=["']pcm_reversible_data["'][^>]*><\/g>/);

    const production = injectProtectedGeometry(api, generated, mood.audio.detail, 256);
    const decoded = api.decodeProtectedPcmDataFromSvg(production);
    const encodedFrameCount = Number(production.match(/id=["']pcm_reversible_data["'][^>]*data-frame-count=["'](\d+)["']/)?.[1]);
    assert.equal(decoded?.pcmSketchSource, "svg-protected-geometry");
    assert.equal(decoded?.pcmSketchFrameCount, encodedFrameCount);
    assert.ok(encodedFrameCount >= 256);
    assert.ok(decoded?.pcmSketch?.length > 0);
  }
});

test("artist master replacement does not alter protected PCM geometry or ranked genre blends", () => {
  const originalApi = loadIllustratorApi();
  const approvedApi = loadIllustratorApi({ artistMasters: true });
  const originalMood = moodForGenre(originalApi, "ジャズ", 20);
  const approvedMood = moodForGenre(approvedApi, "ジャズ", 20);
  const blend = [
    { name: "ジャズ", score: 70 },
    { name: "ソウルミュージック", score: 20 },
    { name: "ファンク", score: 10 }
  ];
  originalMood.audio.genreAnalysis.top = blend;
  approvedMood.audio.genreAnalysis.top = blend;
  const tick = 1800011000000;
  const settings = { variantSeed: 77 };
  const original = originalApi.generateSoundClothReversibleSvg(originalMood, tick, settings);
  const approved = approvedApi.generateSoundClothReversibleSvg(approvedMood, tick, settings);
  assert.equal((approved.match(/id=["']terra_genre_blend_\d+["']/g) || []).length, 2);
  assert.match(approved, /data-genre-fusion=["']structural-splice-v2["']/);
  assert.match(approved, /data-fusion-anchor-source=["']artist-master-nodes["']/);
  assert.doesNotMatch(approved, /data-blend-scale=|data-fusion-opacity=/);

  const retainedLayerIds = Array.from(original.matchAll(/<g\b[^>]*\bid=["'](terra_(?:grain_field|genre_object|family_structure|council_composition))["']/g), match => match[1]);
  for (const id of retainedLayerIds) assert.match(approved, new RegExp(`id=["']${id}["']`), `${id} was dropped by artist-master replacement`);
  assert.doesNotMatch(approved, /<style\b|\bclass=["']/, "generated SVG must not depend on embedded artist-master CSS");

  const originalProduction = injectProtectedGeometry(originalApi, original, originalMood.audio.detail, 512);
  const approvedProduction = injectProtectedGeometry(approvedApi, approved, approvedMood.audio.detail, 512);
  assert.equal(protectedGeometryHash(approvedProduction), protectedGeometryHash(originalProduction));
});
