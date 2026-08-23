import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(SCRIPT_DIR, "fma-selective-audio-download.mjs");

test("FMA Soul-RnB top genre is retained as explicit Soul evidence", t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mmfr-fma-soul-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const tracksCsv = path.join(tmp, "tracks.csv");
  const smallRoot = path.join(tmp, "small");
  const outputRoot = path.join(tmp, "medium");
  const manifestPath = path.join(tmp, "manifest.json");
  const reportPath = path.join(tmp, "report.json");
  fs.mkdirSync(path.join(outputRoot, "999"), { recursive: true });
  fs.writeFileSync(path.join(outputRoot, "999", "999999.mp3"), "fixture");
  fs.writeFileSync(tracksCsv, [
    ",artist,set,track,track,track,track",
    ",name,subset,genre_top,license,tags,title",
    "track_id,,,,,,",
    "999999,Test Artist,medium,Soul-RnB,Attribution 4.0 International,,Test Soul",
    "999998,Tag Only,medium,Pop,Attribution 4.0 International,soul,Generic Soul Tag"
  ].join("\n"));

  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    env: {
      ...process.env,
      MMFR_FMA_ARCHIVE_SUBSET: "medium",
      MMFR_FMA_SOURCE_SUBSETS: "medium",
      MMFR_FMA_SELECTIVE_GENRES: "ソウルミュージック",
      MMFR_FMA_SELECTIVE_DOWNLOAD: "0",
      MMFR_FMA_TRACKS_CSV: tracksCsv,
      MMFR_FMA_SMALL_AUDIO_ROOT: smallRoot,
      MMFR_FMA_SELECTIVE_AUDIO_ROOT: outputRoot,
      MMFR_FMA_SELECTIVE_MANIFEST_PATH: manifestPath,
      MMFR_FMA_SELECTIVE_REPORT_PATH: reportPath
    },
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.items.length, 1);
  assert.equal(manifest.items[0].trackId, "999999");
  assert.equal(manifest.items[0].genre, "ソウルミュージック");
  assert.equal(manifest.items[0].labelEvidence, "FMA track.genre_top=Soul-RnB");
  assert.equal(manifest.items[0].license, "CC-BY");
});
