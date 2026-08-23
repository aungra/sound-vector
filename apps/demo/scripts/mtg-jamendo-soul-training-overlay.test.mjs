import assert from "node:assert/strict";
import test from "node:test";

import { buildOverlay, parseTsv } from "./mtg-jamendo-soul-training-overlay.mjs";

const HEADER = '"genre"\t"macroGenre"\t"trackId"\t"sourcePath"\t"expectedFilePath"\t"audioExists"\t"license"\t"licenseUrl"\t"referenceUrl"\t"canonicalArtist"\t"canonicalTitle"\t"tags"';

test("explicit Soul and adjacent R&B tags remain distinct", () => {
  const rows = parseTsv([
    HEADER,
    '"ソウルミュージック"\t"black_music"\t"soul-1"\t"1.mp3"\t"/Volumes/test/1.mp3"\t"true"\t"CC-BY"\t"license"\t"reference"\t"Artist"\t"A ""Soul"" Song"\t"genre---soul"',
    '"ソウルミュージック"\t"black_music"\t"rnb-1"\t"2.mp3"\t"/Volumes/test/2.mp3"\t"true"\t"CC-BY-SA"\t"license"\t"reference"\t"Artist 2"\t"R&B Song"\t"genre---rnb"'
  ].join("\n"));
  const result = buildOverlay(rows, { audioExists: () => true });
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items.map(row => row.evidenceTier), ["adjacent-rnb", "exact-soul"]);
  assert.equal(result.items.find(row => row.trackId === "soul-1").canonicalTitle, 'A "Soul" Song');
  assert.ok(result.items.every(row => row.evaluationEligible === false));
  assert.ok(result.items.every(row => row.trainingEligible === true));
});

test("ambiguous tags, restricted licenses, and missing audio are rejected", () => {
  const base = {
    genre: "ソウルミュージック",
    macroGenre: "black_music",
    sourcePath: "track.mp3",
    expectedFilePath: "/Volumes/test/track.mp3",
    audioExists: "true",
    licenseUrl: "license",
    referenceUrl: "reference",
    canonicalArtist: "Artist",
    canonicalTitle: "Track"
  };
  const result = buildOverlay([
    { ...base, trackId: "generic", license: "CC-BY", tags: "soul" },
    { ...base, trackId: "nc", license: "CC-BY-NC", tags: "genre---soul" },
    { ...base, trackId: "missing", license: "CC-BY", tags: "genre---soul", audioExists: "false" }
  ], { audioExists: () => true });
  assert.equal(result.items.length, 0);
  assert.deepEqual(result.rejected, {
    "unsupported-tag": 1,
    "license-outside-production-policy": 1,
    "missing-audio": 1
  });
});

test("evidence tier scope can isolate explicit Soul from adjacent R&B", () => {
  const rows = parseTsv([
    HEADER,
    '"ソウルミュージック"\t"black_music"\t"soul-1"\t"1.mp3"\t"/Volumes/test/1.mp3"\t"true"\t"CC-BY"\t"license"\t"reference"\t"Artist"\t"Soul Song"\t"genre---soul"',
    '"ソウルミュージック"\t"black_music"\t"rnb-1"\t"2.mp3"\t"/Volumes/test/2.mp3"\t"true"\t"CC-BY"\t"license"\t"reference"\t"Artist 2"\t"R&B Song"\t"genre---rnb"'
  ].join("\n"));
  const result = buildOverlay(rows, {
    audioExists: () => true,
    evidenceTiers: new Set(["exact-soul"])
  });
  assert.deepEqual(result.items.map(row => row.trackId), ["soul-1"]);
});

test("source-heldout role marks rows as evaluation eligible", () => {
  const rows = parseTsv([
    HEADER,
    '"ソウルミュージック"\t"black_music"\t"soul-1"\t"1.mp3"\t"/Volumes/test/1.mp3"\t"true"\t"CC-BY"\t"license"\t"reference"\t"Artist"\t"Soul Song"\t"genre---soul"'
  ].join("\n"));
  const result = buildOverlay(rows, {
    audioExists: () => true,
    evaluationEligible: true
  });
  assert.equal(result.items[0].evaluationEligible, true);
  assert.equal(result.items[0].trainingEligible, true);
  assert.match(result.items[0].overlayPolicy, /source-heldout evaluation/);
});
