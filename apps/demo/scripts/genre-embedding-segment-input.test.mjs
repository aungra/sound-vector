import assert from "node:assert/strict";
import test from "node:test";

import { embeddingSegmentArgs } from "./genre-embedding-segment-input.mjs";

test("planned audio ranges become deterministic embedding CLI arguments", () => {
  assert.deepEqual(
    embeddingSegmentArgs(
      ["/tmp/range-a.wav", "/tmp/range-b.wav"],
      [{ startSeconds: 12.5 }, { startSeconds: 98 }],
    ),
    [
      "--segment-audio", "/tmp/range-a.wav", "--segment-offset", "12.5",
      "--segment-audio", "/tmp/range-b.wav", "--segment-offset", "98",
    ],
  );
});

test("missing range metadata uses a stable zero offset", () => {
  assert.deepEqual(
    embeddingSegmentArgs(["/tmp/range.wav"], []),
    ["--segment-audio", "/tmp/range.wav", "--segment-offset", "0"],
  );
});
