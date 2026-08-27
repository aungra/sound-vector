import assert from "node:assert/strict";
import test from "node:test";

import { vocalEvidenceAudioPath } from "./genre-vocal-segment-policy.mjs";

test("vocal evidence uses the requested planned range", () => {
  assert.equal(vocalEvidenceAudioPath(["a.wav", "b.wav", "c.wav"], 1, "track.wav"), "b.wav");
});

test("vocal evidence falls back deterministically", () => {
  assert.equal(vocalEvidenceAudioPath(["a.wav"], 9, "track.wav"), "a.wav");
  assert.equal(vocalEvidenceAudioPath([], 0, "track.wav"), "track.wav");
});
