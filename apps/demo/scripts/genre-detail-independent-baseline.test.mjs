import assert from "node:assert/strict";
import test from "node:test";
import { crossSourceDirection } from "./genre-detail-independent-baseline.mjs";

test("cross-source baseline never trains on the held-out source", () => {
  const train = [0, 0.1, 10, 10.1].map((value, index) => ({
    split: index % 2 ? "validation" : "train",
    detailTarget: value < 5 ? "a" : "b",
    vector: [value]
  }));
  const heldout = [0.2, 10.2].map(value => ({ split: "test", detailTarget: value < 5 ? "a" : "b", vector: [value] }));
  const result = crossSourceDirection(train, heldout, { minTrain: 2, minTest: 1 });
  assert.equal(result.trainRows, 4);
  assert.equal(result.testRows, 2);
  assert.equal(result.top1Accuracy, 100);
});

test("cross-source baseline evaluates every row from the held-out source", () => {
  const train = [0, 0.1, 10, 10.1].map(value => ({
    split: "training",
    detailTarget: value < 5 ? "a" : "b",
    vector: [value]
  }));
  const heldout = [0.2, 0.3, 10.2, 10.3].map((value, index) => ({
    split: index % 2 ? "validation" : "training",
    detailTarget: value < 5 ? "a" : "b",
    vector: [value]
  }));
  const result = crossSourceDirection(train, heldout, { minTrain: 2, minTest: 2 });
  assert.equal(result.testRows, 4);
  assert.equal(result.top1Accuracy, 100);
});

test("cross-source baseline can hold an ablation to the same detail set", () => {
  const rows = [
    ...[0, 0.1].map(value => ({ split: "training", detailTarget: "a", vector: [value] })),
    ...[10, 10.1].map(value => ({ split: "training", detailTarget: "b", vector: [value] }))
  ];
  const heldout = [
    { split: "training", detailTarget: "a", vector: [0.2] },
    { split: "training", detailTarget: "b", vector: [10.2] }
  ];
  const result = crossSourceDirection(rows, heldout, { minTrain: 2, minTest: 1, details: ["a"] });
  assert.deepEqual(result.byDetail.map(item => item.detail), ["a"]);
  assert.equal(result.testRows, 1);
});
