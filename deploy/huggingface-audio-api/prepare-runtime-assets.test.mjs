import assert from "node:assert/strict";
import test from "node:test";

import { validateBundleSha, validateBundleUrl } from "./prepare-runtime-assets.mjs";

test("runtime download accepts credential-free HTTPS and an exact SHA", () => {
  assert.equal(validateBundleUrl("https://models.example/runtime.tar.gz").protocol, "https:");
  assert.equal(validateBundleSha("a".repeat(64)), "a".repeat(64));
});

test("runtime download rejects credentials, HTTP and malformed hashes", () => {
  assert.throws(() => validateBundleUrl("http://models.example/runtime.tar.gz"), /credential-free HTTPS/);
  assert.throws(() => validateBundleUrl("https://user:secret@models.example/runtime.tar.gz"), /credential-free HTTPS/);
  assert.throws(() => validateBundleSha("abc"), /invalid/);
});
