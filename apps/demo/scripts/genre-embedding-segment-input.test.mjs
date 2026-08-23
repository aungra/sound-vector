import assert from "node:assert/strict";
import test from "node:test";

import { embeddingSegmentArgs } from "./genre-embedding-segment-input.mjs";


test("embedding segment arguments preserve planned track offsets", () => {
  assert.deepEqual(
    embeddingSegmentArgs(
      ["requested.wav", "middle.wav"],
      [{ startSeconds: 60 }, { startSeconds: 180.5 }],
    ),
    [
      "--segment-audio", "requested.wav", "--segment-offset", "60",
      "--segment-audio", "middle.wav", "--segment-offset", "180.5",
    ],
  );
});
