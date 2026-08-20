import assert from "node:assert/strict";
import test from "node:test";

test("genre training module supports inference-only imports", async () => {
  process.env.MMFR_GENRE_TRAIN_SKIP_MAIN = "1";

  const trainingModule = await import("./genre-training.mjs");
  const hooks = trainingModule.__testHooks;

  assert.ok(hooks, "inference hooks should be exported");
  for (const name of ["loadAppGenreApi", "compactAudioFeatures", "classify", "vectorValues"]) {
    assert.equal(typeof hooks[name], "function", `${name} should be available to the audio server`);
  }

  const appApi = hooks.loadAppGenreApi();
  assert.equal(typeof appApi.genreFeatureVector, "function");
  assert.equal(typeof appApi.enrichFeaturesWithGenre, "function");
});
