import assert from "node:assert/strict";
import test from "node:test";
import { detailSourceCoverage } from "./genre-detail-source-license-audit.mjs";

test("source coverage does not count the same source track twice", () => {
  const common = {
    sourceFamily: "FMA",
    detailLabels: ["drone"],
    license: "CC-BY",
    contentScope: "full-track"
  };
  const coverage = detailSourceCoverage([
    { ...common, filePath: "/audio/one.mp3" },
    { ...common, filePath: "/audio/one.mp3" },
    { ...common, filePath: "/audio/two.mp3" }
  ], ["drone"]);
  assert.equal(coverage.drone.productionSourceCount, 1);
  assert.deepEqual(coverage.drone.productionRowsBySource, { FMA: 2 });
});
