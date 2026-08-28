import assert from "node:assert/strict";
import test from "node:test";

import { sha256, validateRelease } from "./public-ui-guardian.mjs";

const approvedRelease = [
  '<p class="simple-intro">SOUND FORMは',
  'class="simple-conversion"',
  "hasRichAnalysisParity",
  "reliableExternalRapPromotion?.applies"
].join("\n");

test("guardian accepts a release with the production UI and rap boundary safeguards", () => {
  assert.equal(validateRelease(approvedRelease, sha256(approvedRelease)), sha256(approvedRelease));
});

test("guardian rejects a release that can overwrite reliable rap evidence with Rock", () => {
  const unsafeRelease = approvedRelease.replace("reliableExternalRapPromotion?.applies", "");
  assert.throws(
    () => validateRelease(unsafeRelease, sha256(unsafeRelease)),
    /approved simple interface safeguards/
  );
});
