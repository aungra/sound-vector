import assert from "node:assert/strict";
import test from "node:test";

import {
  validateCloudEndpoint,
  validateCloudHealth,
  validateParityReport,
} from "./promote-cloud-worker.mjs";

function health() {
  const promoted = { available: true, promotion: { promoted: true } };
  return {
    ok: true,
    genreInferenceRuntime: {
      unknown65Reranker: promoted,
      musicFmReranker: promoted,
      trackPairReranker: promoted,
    },
    dependencies: {
      embeddingGenre: true,
      japaneseVocalEvidence: true,
      classificationScope: "track",
      trackSampleCount: 4,
      trackSampleWindowSeconds: 30,
    },
  };
}

test("cloud promotion accepts only a full portable inference worker", () => {
  assert.equal(validateCloudEndpoint("https://aun-sound-form.hf.space/api/audio-analyze"), "https://aun-sound-form.hf.space/api/audio-analyze");
  assert.equal(validateCloudHealth(health()), true);
  assert.equal(validateParityReport({
    passes: true,
    fixtureCount: 4,
    passedCount: 4,
    audioRetained: false,
  }), true);
});

test("cloud promotion rejects workstation paths and incomplete parity", () => {
  const leaking = health();
  leaking.dependencies.embeddingGenreModel = "/Volumes/external/model.pkl";
  assert.throws(() => validateCloudHealth(leaking), /workstation or HDD path/);
  assert.throws(() => validateCloudEndpoint("https://example.com/api/audio-analyze"), /Hugging Face Space/);
  assert.throws(() => validateParityReport({ passes: true, fixtureCount: 3, passedCount: 3, audioRetained: false }), /promotion gate/);
});
