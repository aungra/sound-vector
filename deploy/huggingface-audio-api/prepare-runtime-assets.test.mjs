import assert from "node:assert/strict";
import test from "node:test";

import { planByteRanges, validateBundleSha, validateBundleUrl } from "./prepare-runtime-assets.mjs";

test("runtime download accepts credential-free HTTPS and an exact SHA", () => {
  assert.equal(validateBundleUrl("https://models.example/runtime.tar.gz").protocol, "https:");
  assert.equal(validateBundleSha("a".repeat(64)), "a".repeat(64));
});

test("runtime download rejects credentials, HTTP and malformed hashes", () => {
  assert.throws(() => validateBundleUrl("http://models.example/runtime.tar.gz"), /credential-free HTTPS/);
  assert.throws(() => validateBundleUrl("https://user:secret@models.example/runtime.tar.gz"), /credential-free HTTPS/);
  assert.throws(() => validateBundleSha("abc"), /invalid/);
});

test("parallel runtime ranges cover every byte exactly once", () => {
  assert.deepEqual(planByteRanges(10, 4), [
    { index: 0, start: 0, end: 2, bytes: 3 },
    { index: 1, start: 3, end: 5, bytes: 3 },
    { index: 2, start: 6, end: 7, bytes: 2 },
    { index: 3, start: 8, end: 9, bytes: 2 },
  ]);
  const ranges = planByteRanges(3545528209, 16);
  assert.equal(ranges[0].start, 0);
  assert.equal(ranges.at(-1).end, 3545528208);
  assert.equal(ranges.reduce((sum, range) => sum + range.bytes, 0), 3545528209);
  ranges.slice(1).forEach((range, index) => assert.equal(range.start, ranges[index].end + 1));
});
