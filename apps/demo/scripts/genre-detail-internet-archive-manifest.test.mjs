import assert from "node:assert/strict";
import test from "node:test";
import { buildInternetArchiveCandidates } from "./genre-detail-internet-archive-manifest.mjs";

function doc(overrides = {}) {
  return {
    identifier: "release-1", creator: "Artist", subject: ["House"],
    licenseurl: "https://creativecommons.org/licenses/by/4.0/", collection: ["netlabels", "label-one"],
    ...overrides
  };
}

function metadata(files = [{ name: "track.mp3", title: "Track", format: "VBR MP3", length: "2:00" }]) {
  return new Map([["release-1", { files }]]);
}

test("IA candidates require an origin netlabel, production license and 90-second audio", () => {
  assert.equal(buildInternetArchiveCandidates([doc()], metadata()).length, 1);
  assert.equal(buildInternetArchiveCandidates([doc({ collection: ["netlabels"] })], metadata()).length, 0);
  assert.equal(buildInternetArchiveCandidates([doc({ licenseurl: "https://creativecommons.org/licenses/by-nc/4.0/" })], metadata()).length, 0);
  assert.equal(buildInternetArchiveCandidates([doc()], metadata([{ name: "short.mp3", format: "VBR MP3", length: "0:30" }])).length, 0);
  const conflict = new Map([["release-1", {
    metadata: { description: "Licensed under https://creativecommons.org/licenses/by-nc-sa/3.0/" },
    files: [{ name: "track.mp3", format: "VBR MP3", length: "2:00" }]
  }]]);
  assert.equal(buildInternetArchiveCandidates([doc()], conflict).length, 0);
});

test("multi-genre releases are excluded and specific labels replace parents", () => {
  assert.equal(buildInternetArchiveCandidates([doc({ subject: ["House", "Jazz"] })], metadata()).length, 0);
  const deep = buildInternetArchiveCandidates([doc({ subject: ["House", "Deep House"] })], metadata());
  assert.equal(deep[0].detailTarget, "deep-house");
});

test("a search hit must resolve to the detail that was queried", () => {
  assert.equal(buildInternetArchiveCandidates([doc({ queriedDetail: "jazz" })], metadata()).length, 0);
  assert.equal(buildInternetArchiveCandidates([doc({ queriedDetail: "house" })], metadata()).length, 1);
});

test("duplicate encodings are grouped and at most five tracks are retained per release", () => {
  const files = [
    { name: "a.ogg", original: "a.flac", format: "Ogg Vorbis", length: "2:00" },
    { name: "a.mp3", original: "a.flac", format: "VBR MP3", length: "2:00" },
    { name: "b.mp3", format: "VBR MP3", length: "2:00" },
    { name: "c.mp3", format: "VBR MP3", length: "2:00" },
    { name: "d.mp3", format: "VBR MP3", length: "2:00" },
    { name: "e.mp3", format: "VBR MP3", length: "2:00" },
    { name: "f.mp3", format: "VBR MP3", length: "2:00" }
  ];
  const items = buildInternetArchiveCandidates([doc()], metadata(files));
  assert.equal(items.length, 5);
  assert.equal(items[0].downloadUrl.endsWith("a.mp3"), true);
});
