import assert from "node:assert/strict";
import test from "node:test";
import { reviewedItems } from "./genre-detail-wikimedia-category-review.mjs";

const candidate = (trackId, detailTarget) => ({
  trackId, detailTarget, detailLabels: [detailTarget]
});

test("review allowlist keeps only audited Commons category tracks", () => {
  const rows = reviewedItems([
    { trackId: "106963080", detailTarget: "jazz", detailLabels: ["jazz"] },
    { trackId: "unreviewed", detailTarget: "jazz", detailLabels: ["jazz"] }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceFamily, "US Air Force recordings");
  assert.equal(rows[0].needsReview, false);
});

test("review assigns explicit house subgenre without adding a source", () => {
  const rows = reviewedItems([{ trackId: "40317481", detailTarget: "house", detailLabels: ["house"] }]);
  assert.equal(rows[0].detailTarget, "progressive-house");
  assert.deepEqual(rows[0].detailLabels, ["progressive-house"]);
  assert.equal(rows[0].sourceFamily, "Audiotool");
});

test("review groups chiptune catalogs by creator origin", () => {
  const rows = reviewedItems([
    { trackId: "64731654", detailTarget: "chiptune", detailLabels: ["chiptune"] },
    { trackId: "41302890", detailTarget: "chiptune", detailLabels: ["chiptune"] }
  ]);
  assert.deepEqual(rows.map(item => item.sourceFamily), [
    "Kevin MacLeod creator recordings",
    "Drozerix creator recordings"
  ]);
});

test("review keeps Audiotool drum and bass as one platform origin", () => {
  const rows = reviewedItems([{ trackId: "24418750", detailTarget: "drum-and-bass", detailLabels: ["drum-and-bass"] }]);
  assert.equal(rows[0].sourceFamily, "Audiotool");
  assert.equal(rows[0].detailTarget, "drum-and-bass");
});

test("review groups choral catalogs by recording ensemble", () => {
  const items = reviewedItems([
    candidate("62008861", "choral"),
    candidate("62008862", "choral"),
    candidate("2690354", "choral")
  ]);
  assert.equal(items[0].sourceFamily, "Ensemble Morales recordings");
  assert.equal(items[1].sourceFamily, "Ensemble Morales recordings");
  assert.equal(items[2].sourceFamily, "dwsChorale creator recordings");
});

test("review keeps independent opera performers as distinct origins", () => {
  const items = reviewedItems([
    candidate("15933691", "opera"),
    candidate("7659299", "opera")
  ]);
  assert.notEqual(items[0].sourceFamily, items[1].sourceFamily);
  assert.equal(items.every(item => item.detailTarget === "opera"), true);
});
