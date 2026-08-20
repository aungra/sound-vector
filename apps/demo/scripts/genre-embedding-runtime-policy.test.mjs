import assert from "node:assert/strict";
import test from "node:test";

import {
  embeddingInferenceAttemptPlan,
  runEmbeddingInferenceAttempts,
} from "./genre-embedding-runtime-policy.mjs";

test("v2.2 head contract gets a stable v2.1 fallback", () => {
  const attempts = embeddingInferenceAttemptPlan({
    contract: { discogsTagHeadRequired: true },
    primaryModelPath: "/tmp/candidate.pkl",
    fallbackModelPath: "/tmp/production.pkl",
  });
  assert.deepEqual(attempts.map((item) => [item.role, item.discogsHead]), [
    ["primary", true],
    ["stable-fallback", false],
  ]);
});

test("v2.1 contract remains a single headless attempt", () => {
  const attempts = embeddingInferenceAttemptPlan({
    contract: { discogsTagHeadRequired: false },
    primaryModelPath: "/tmp/production.pkl",
    fallbackModelPath: "/tmp/production.pkl",
  });
  assert.deepEqual(attempts.map((item) => [item.role, item.discogsHead]), [
    ["primary", false],
  ]);
});

test("primary failure returns the stable fallback and its reason", async () => {
  const attempts = embeddingInferenceAttemptPlan({
    contract: { discogsTagHeadRequired: true },
    primaryModelPath: "/tmp/candidate.pkl",
    fallbackModelPath: "/tmp/production.pkl",
  });
  const result = await runEmbeddingInferenceAttempts(attempts, async attempt => {
    if (attempt.role === "primary") throw new Error("simulated native head failure");
    return { inferredGenre: "テクノ" };
  });
  assert.equal(result.ok, true);
  assert.equal(result.attempt.role, "stable-fallback");
  assert.equal(result.value.inferredGenre, "テクノ");
  assert.match(result.fallbackReason, /simulated native head failure/);
});

test("all attempt failures are retained for API diagnostics", async () => {
  const attempts = embeddingInferenceAttemptPlan({
    contract: { discogsTagHeadRequired: true },
    primaryModelPath: "/tmp/candidate.pkl",
    fallbackModelPath: "/tmp/production.pkl",
  });
  const result = await runEmbeddingInferenceAttempts(attempts, async attempt => {
    throw new Error(`${attempt.role} failed`);
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
});
