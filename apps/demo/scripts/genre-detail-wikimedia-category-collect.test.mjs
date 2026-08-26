import assert from "node:assert/strict";
import test from "node:test";
import { candidateFromPage, inferOriginFamily } from "./genre-detail-wikimedia-category-collect.mjs";

function page(overrides = {}) {
  const categories = overrides.categories || ["Audio files of jazz music", "CC-BY-SA-4.0"];
  return {
    pageid: 42,
    title: overrides.title || "File:Convergence - Airmen of Note.ogg",
    categories: categories.map(title => ({ title: `Category:${title}` })),
    imageinfo: [{
      duration: overrides.duration ?? 180,
      mime: overrides.mime || "application/ogg",
      url: "https://upload.wikimedia.org/audio.ogg",
      descriptionurl: "https://commons.wikimedia.org/wiki/File:Track.ogg",
      extmetadata: {
        Artist: { value: overrides.artist || "Airmen of Note - United States Air Force Band" },
        ObjectName: { value: overrides.objectName || "Convergence" },
        ImageDescription: { value: overrides.description || "A complete jazz performance." },
        Categories: { value: categories.join("|") },
        LicenseShortName: { value: overrides.license || "CC BY-SA 4.0" },
        LicenseUrl: { value: overrides.licenseUrl || "https://creativecommons.org/licenses/by-sa/4.0/" }
      }
    }]
  };
}

test("Commons category candidate requires long, production-safe full audio", () => {
  assert.equal(candidateFromPage("jazz", "Audio files of jazz music", page()).accepted, true);
  assert.equal(candidateFromPage("jazz", "Audio files of jazz music", page({ duration: 45 })).accepted, false);
  assert.equal(candidateFromPage("jazz", "Audio files of jazz music", page({ license: "CC BY-NC 4.0", licenseUrl: "https://creativecommons.org/licenses/by-nc/4.0/" })).accepted, false);
  assert.equal(candidateFromPage("jazz", "Audio files of jazz music", page({ mime: "audio/midi" })).accepted, false);
});

test("Commons category candidate excludes review flags and support audio", () => {
  assert.equal(candidateFromPage("jazz", "Audio files of jazz music", page({ categories: ["Audio files of jazz music", "License review needed (audio)"] })).accepted, false);
  assert.equal(candidateFromPage("jazz", "Audio files of jazz music", page({ title: "File:Jazz exercise.ogg" })).accepted, false);
  assert.equal(candidateFromPage("jazz", "Audio files of house music", page()).accepted, false);
});

test("USAF ensembles share one origin while separate agencies remain distinct", () => {
  assert.equal(inferOriginFamily(page(), page().imageinfo[0]), "US Air Force recordings");
  const coast = page({ title: "File:At the Jazz Band Ball - U.S. Coast Guard Band.ogg", artist: "United States Coast Guard Band" });
  assert.equal(inferOriginFamily(coast, coast.imageinfo[0]), "US Coast Guard Band");
});
