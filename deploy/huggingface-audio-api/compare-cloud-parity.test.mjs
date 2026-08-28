import assert from "node:assert/strict";
import test from "node:test";

import { compareCloudParity } from "./compare-cloud-parity.mjs";

function payload(score = 66) {
  return {
    ok: true,
    features: {
      classificationScope: "track",
      sampledRanges: [{}, {}, {}, {}],
      japaneseVocalEvidence: { available: true },
      embeddingGenrePrediction: {
        top: [
          { label: "ヒップホップ", score },
          { label: "トラップ", score: 20 },
          { label: "ファンク", score: 10 },
        ],
        unknownSourceConsensus: { top: [{ label: "ヒップホップ", score: 40 }] },
      },
    },
  };
}

test("shadow comparison promotes only four rich, probability-equivalent fixtures", async () => {
  let call = 0;
  const report = await compareCloudParity({
    macEndpoint: "https://mac.example/api/audio-analyze",
    cloudEndpoint: "https://cloud.example/api/audio-analyze",
    fixtures: Array.from({ length: 4 }, (_, index) => ({
      id: `fixture-${index}`,
      youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk",
      expectedLabel: "ヒップホップ",
    })),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => payload(call++ % 2 ? 65.5 : 66) }),
  });
  assert.equal(report.passes, true);
  assert.equal(report.passedCount, 4);
  assert.equal(report.audioRetained, false);
});

test("shadow comparison rejects a reordered cloud Top3", async () => {
  let call = 0;
  const fetchImpl = async () => {
    const body = payload();
    if (call++ % 2) body.features.embeddingGenrePrediction.top.reverse();
    return { ok: true, status: 200, json: async () => body };
  };
  const report = await compareCloudParity({
    macEndpoint: "https://mac.example/api/audio-analyze",
    cloudEndpoint: "https://cloud.example/api/audio-analyze",
    fixtures: Array.from({ length: 4 }, (_, index) => ({
      id: `fixture-${index}`,
      youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    })),
    fetchImpl,
  });
  assert.equal(report.passes, false);
  assert.equal(report.passedCount, 0);
});
