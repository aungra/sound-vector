import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildMtgDetailManifest, directDetailLabels } from "./genre-detail-mtg-manifest.mjs";

const vocabulary = new Set(["dark-ambient", "idm", "deep-house", "jazz-fusion", "rock"]);

test("MTG direct tag mapping accepts exact labels and rejects semantic guesses", () => {
  assert.deepEqual(directDetailLabels(["genre---darkambient", "genre---idm"], vocabulary), ["dark-ambient", "idm"]);
  assert.deepEqual(directDetailLabels(["genre---rock"], vocabulary), ["rock"]);
  assert.deepEqual(directDetailLabels(["genre---experimental", "genre---indie"], vocabulary), []);
});

test("MTG detail manifest keeps multi-label rows out of single-target ground truth", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-detail-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "14"));
  fs.writeFileSync(path.join(root, "14/214.low.mp3"), "fixture");
  const genreText = [
    "TRACK_ID\tARTIST_ID\tALBUM_ID\tPATH\tDURATION\tTAGS",
    "track_0000214\tartist_1\talbum_1\t14/214.mp3\t30\tgenre---idm\tgenre---darkambient"
  ].join("\n");
  const metaText = [
    "TRACK_ID\tARTIST_ID\tALBUM_ID\tTRACK_NAME\tARTIST_NAME\tALBUM_NAME\tRELEASEDATE\tURL",
    "track_0000214\tartist_1\talbum_1\tTrack\tArtist\tAlbum\t2020\thttps://example.test/214"
  ].join("\n");
  const items = buildMtgDetailManifest({ genreText, metaText, audioRoot: root, vocabulary });
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].detailLabels, ["idm", "dark-ambient"]);
  assert.equal(items[0].detailTarget, "");
  assert.equal(items[0].singleTargetEligible, false);
});
