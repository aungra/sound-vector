import assert from "node:assert/strict";
import test from "node:test";
import { classifyTrainingLicense, effectiveTrainingUsage, TRAINING_USAGE } from "./genre-training-license-policy.mjs";

test("training license policy separates production, research, ND and unknown material", () => {
  assert.equal(classifyTrainingLicense("CC-BY").usage, TRAINING_USAGE.PRODUCTION);
  assert.equal(classifyTrainingLicense("CC-BY-SA-4.0").usage, TRAINING_USAGE.PRODUCTION);
  assert.equal(classifyTrainingLicense("CC-BY-NC").usage, TRAINING_USAGE.RESEARCH);
  assert.equal(classifyTrainingLicense("CC-BY-NC-ND").usage, TRAINING_USAGE.EXCLUDED_ND);
  assert.equal(classifyTrainingLicense("research-use-copyright-cleared").usage, TRAINING_USAGE.RESEARCH);
  assert.equal(classifyTrainingLicense("Creative Commons").usage, TRAINING_USAGE.VERIFY);
});

test("permissively licensed loops remain support-only", () => {
  assert.equal(effectiveTrainingUsage({ license: "CC-BY", contentScope: "loop" }).usage, TRAINING_USAGE.SUPPORT);
  assert.equal(effectiveTrainingUsage({ license: "CC-BY", contentScope: "full-track" }).usage, TRAINING_USAGE.PRODUCTION);
});
