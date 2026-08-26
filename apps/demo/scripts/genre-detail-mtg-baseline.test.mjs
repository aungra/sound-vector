import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCentroidBaseline } from "./genre-detail-mtg-baseline.mjs";

test("centroid baseline evaluates only sufficiently represented labels", () => {
  const rows = [
    ...[0, 0.1, 0.2].map(value => ({ split: "train", detailTarget: "a", vector: [value, value] })),
    ...[10, 10.1, 10.2].map(value => ({ split: "train", detailTarget: "b", vector: [value, value] })),
    { split: "train", detailTarget: "sparse", vector: [5, 5] },
    { split: "test", detailTarget: "a", vector: [0.05, 0.05] },
    { split: "test", detailTarget: "b", vector: [10.05, 10.05] },
    { split: "test", detailTarget: "sparse", vector: [5, 5] }
  ];
  const result = evaluateCentroidBaseline(rows, { minTrain: 3, minTest: 1 });
  assert.equal(result.eligibleDetailLabels, 2);
  assert.equal(result.top1Accuracy, 100);
  assert.equal(result.balancedTop1Accuracy, 100);
});
