import assert from "node:assert/strict";
import test from "node:test";
import { createAnalysisResultCache } from "./audio-analysis-result-cache.mjs";

test("returns cached analysis until its TTL expires", () => {
  let currentTime = 1000;
  const cache = createAnalysisResultCache({ ttlMs: 5000, now: () => currentTime });
  const value = { top: [{ label: "ロック", score: 63 }] };
  cache.set("video:60", value);
  assert.equal(cache.get("video:60"), value);
  currentTime += 5001;
  assert.equal(cache.get("video:60"), null);
});

test("evicts the least recently used result at capacity", () => {
  let currentTime = 1000;
  const cache = createAnalysisResultCache({ maxEntries: 2, now: () => currentTime++ });
  cache.set("a", { id: "a" });
  cache.set("b", { id: "b" });
  assert.equal(cache.get("a").id, "a");
  cache.set("c", { id: "c" });
  assert.equal(cache.get("b"), null);
  assert.equal(cache.get("a").id, "a");
  assert.equal(cache.get("c").id, "c");
});
