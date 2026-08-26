import assert from "node:assert/strict";
import test from "node:test";
import { buildCcmixterCandidates } from "./genre-detail-ccmixter-manifest.mjs";

function row(overrides = {}) {
  return {
    upload_id: 1, upload_name: "Track", user_name: "artist", file_page_url: "https://ccmixter.org/files/artist/1",
    license_url: "https://creativecommons.org/licenses/by/4.0/",
    upload_extra: { usertags: "blues,instrumental" },
    files: [{ download_url: "https://example.test/track.mp3", file_format_info: { "media-type": "audio", ps: "2:00" }, file_extra: {} }],
    ...overrides
  };
}

test("ccMixter candidates require production rights and a full mix", () => {
  assert.equal(buildCcmixterCandidates([row()]).length, 1);
  assert.equal(buildCcmixterCandidates([row({ license_url: "https://creativecommons.org/licenses/by-nc/4.0/" })]).length, 0);
  assert.equal(buildCcmixterCandidates([row({ files: [{ file_format_info: { "media-type": "audio", ps: "0:30" }, file_extra: {} }] })]).length, 0);
  assert.equal(buildCcmixterCandidates([row({ files: [{ file_format_info: { "media-type": "audio", ps: "2:00" }, file_extra: { type: "samples" } }] })]).length, 0);
});

test("specific tags replace their broad parent but unrelated multi-label rows are excluded", () => {
  const deep = buildCcmixterCandidates([row({ upload_extra: { usertags: "house,deep_house,instrumental" } })]);
  assert.equal(deep[0].detailTarget, "deep-house");
  assert.equal(buildCcmixterCandidates([row({ upload_extra: { usertags: "blues,jazz" } })]).length, 0);
});

test("a cappella uploads are not treated as full-track genre ground truth", () => {
  assert.equal(buildCcmixterCandidates([row({ upload_extra: { usertags: "reggae", ccud: "media,acappella" } })]).length, 0);
});
