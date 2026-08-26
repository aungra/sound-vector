import assert from "node:assert/strict";
import test from "node:test";
import { reviewedItems } from "./genre-detail-wikimedia-category-review.mjs";

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
