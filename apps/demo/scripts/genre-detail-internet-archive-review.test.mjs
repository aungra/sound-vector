import assert from "node:assert/strict";
import test from "node:test";
import { reviewedItems } from "./genre-detail-internet-archive-review.mjs";

function item(workGroup, detailTarget, file) {
  return { workGroup, detailTarget, downloadUrl: `https://archive.org/download/${workGroup}/${file}` };
}

test("review allowlist keeps only manually accepted releases and labels", () => {
  assert.equal(reviewedItems([item("alg033", "soul", "01_why.mp3")]).length, 1);
  assert.equal(reviewedItems([item("alg033", "jazz", "01_why.mp3")]).length, 0);
  assert.equal(reviewedItems([item("unknown", "soul", "track.mp3")]).length, 0);
});

test("review allowlist excludes chillout remixes at file level", () => {
  assert.equal(reviewedItems([item("tou245", "trance", "tou245a.mp3")]).length, 1);
  assert.equal(reviewedItems([item("tou245", "trance", "tou245b.mp3")]).length, 0);
  assert.equal(reviewedItems([item("tou251", "trance", "tou251c.mp3")]).length, 0);
});

test("review accepts exact post-punk releases and rejects unreviewed mixtures", () => {
  const rows = reviewedItems([
    item("laconia001_kontraband", "post-punk", "a.mp3"),
    item("opal-carolina-ep", "post-punk", "b.mp3")
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].detailTarget, "post-punk");
});

test("review keeps only the non-mixed deep-house release", () => {
  const rows = reviewedItems([
    item("muzique001", "deep-house", "a.mp3"),
    item("tek07", "deep-house", "b.mp3")
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].workGroup, "muzique001");
});
