import assert from "node:assert/strict";
import test from "node:test";
import { analysisDownloadUrl, selectDownloadCandidates } from "./genre-detail-wikimedia-category-download.mjs";

test("Commons WAV files use the official full-track MP3 transcode", () => {
  const url = analysisDownloadUrl({
    mime: "audio/wav",
    downloadUrl: "https://upload.wikimedia.org/wikipedia/commons/d/de/You_Are_Here.wav?source=original"
  });
  assert.equal(url, "https://upload.wikimedia.org/wikipedia/commons/transcoded/d/de/You_Are_Here.wav/You_Are_Here.wav.mp3");
});

test("Commons compressed audio keeps its original URL", () => {
  const original = "https://upload.wikimedia.org/wikipedia/commons/a/ab/example.mp3";
  assert.equal(analysisDownloadUrl({ mime: "audio/mpeg", downloadUrl: original }), original);
});

test("download detail filter isolates requested labels", () => {
  const rows = [{ detailTarget: "choral" }, { detailTarget: "opera" }, { detailTarget: "jazz" }];
  assert.deepEqual(selectDownloadCandidates(rows, "choral,opera"), rows.slice(0, 2));
  assert.deepEqual(selectDownloadCandidates(rows, ""), rows);
});

test("Commons FLAC files also use the official full-track MP3 transcode", () => {
  const url = analysisDownloadUrl({
    mime: "audio/flac",
    downloadUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Track.flac"
  });
  assert.equal(url, "https://upload.wikimedia.org/wikipedia/commons/transcoded/a/ab/Track.flac/Track.flac.mp3");
});
