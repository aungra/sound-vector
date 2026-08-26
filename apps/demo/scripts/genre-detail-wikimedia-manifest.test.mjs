import assert from "node:assert/strict";
import test from "node:test";
import { buildWikimediaIndependentManifest } from "./genre-detail-wikimedia-manifest.mjs";

test("Wikimedia manifest requires reviewed id, local audio and production-safe rights", () => {
  const base = { trackId: "39113258", audioOk: true, filePath: "/audio.ogg", license: "CC-BY-SA", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0" };
  assert.equal(buildWikimediaIndependentManifest([base], () => true).length, 1);
  assert.equal(buildWikimediaIndependentManifest([{ ...base, license: "CC-BY-NC" }], () => true).length, 0);
  assert.equal(buildWikimediaIndependentManifest([{ ...base, trackId: "unreviewed" }], () => true).length, 0);
  assert.equal(buildWikimediaIndependentManifest([base], () => false).length, 0);
});

test("Wikimedia distribution does not replace original source provenance", () => {
  const rows = buildWikimediaIndependentManifest([{
    trackId: "48805253", audioOk: true, filePath: "/audio.ogg", license: "CC-BY-SA"
  }], () => true);
  assert.equal(rows[0].distributionSource, "Wikimedia Commons");
  assert.equal(rows[0].sourceFamily, "SoundCloud");
  assert.equal(rows[0].detailTarget, "drum-and-bass");
});
