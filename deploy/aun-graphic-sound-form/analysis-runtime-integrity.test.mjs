import assert from "node:assert/strict";
import test from "node:test";
import { verifyAnalysisRuntime } from "./analysis-runtime-integrity.mjs";

const lock = {
  runtimeRevision: "runtime-v1",
  embeddingModelVersion: "embedding-v2",
  embeddingFeatureContractSha256: "contract-sha",
  models: { reranker: "model-sha" }
};

const health = {
  ok: true,
  genreInferenceRuntime: {
    runtimeRevision: "runtime-v1",
    reranker: { promotion: { modelSha256: "model-sha" } }
  },
  dependencies: {
    embeddingGenreContract: {
      modelVersion: "embedding-v2",
      runtimeFeatureContractSha256: "contract-sha"
    }
  }
};

test("accepts the exact approved production analysis runtime", () => {
  assert.deepEqual(verifyAnalysisRuntime(health, lock), {
    runtimeRevision: "runtime-v1",
    embeddingModelVersion: "embedding-v2",
    modelCount: 1
  });
});

test("rejects an unapproved model hash without modifying the runtime", () => {
  const changed = structuredClone(health);
  changed.genreInferenceRuntime.reranker.promotion.modelSha256 = "different";
  assert.throws(() => verifyAnalysisRuntime(changed, lock), /differs from the approved lock/);
});
