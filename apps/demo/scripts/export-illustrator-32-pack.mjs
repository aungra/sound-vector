import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEMO_DIR,
  attr,
  illustratorLayeredSvg,
  loadIllustratorApi,
  moodForGenre,
} from "./illustrator-handoff-lib.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../../..");
const OUT_DIR = path.join(ROOT_DIR, "docs", "illustrator-handoff");
const EDITABLE_DIR = path.join(OUT_DIR, "editable");
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");

function fileSlug(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[・/]/g, "-")
    .replace(/[^a-zA-Z0-9\u3040-\u30ff\u3400-\u9fff-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function rootTag(svg) {
  return String(svg).match(/<svg\b[^>]*>/)?.[0] || "";
}

const api = loadIllustratorApi();
const genres = Object.keys(api.genrePatternProfiles);
fs.mkdirSync(EDITABLE_DIR, { recursive: true });

const files = genres.map((genre, index) => {
  const mood = moodForGenre(api, genre, index);
  const base = api.generateSoundClothReversibleSvg(mood, 1800000000000 + index * 77777, {
    variantSeed: index * 101,
    iteration: `illustrator-handoff-${index + 1}`
  });
  const svg = illustratorLayeredSvg(base, genre);
  const root = rootTag(svg);
  if (/id=["']pcm_reversible_data["']/.test(svg)) throw new Error(`${genre}: Illustrator handoff must not include PCM particles.`);
  const number = String(index + 1).padStart(2, "0");
  const file = `${number}-${fileSlug(genre)}-illustrator.svg`;
  fs.writeFileSync(path.join(EDITABLE_DIR, file), `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`);
  return {
    number: index + 1,
    genre,
    file: `editable/${file}`,
    engine: attr(root, "data-engine"),
    patternFamily: attr(root, "data-pattern-family"),
    sourceLineage: attr(root, "data-source-lineage").split(",").filter(Boolean),
    formMode: attr(root, "data-form-mode"),
    pcmStatus: "production-injected"
  };
});

const manifest = {
  format: "sound-form-illustrator-handoff-v1",
  generatedAt: new Date().toISOString(),
  source: "TERRA 5.6 deterministic genre reference fixtures",
  viewBox: "0 0 1200 1200",
  restorationRule: "This Illustrator handoff intentionally contains no PCM body. Production SVG export injects visible pcm_reversible_data geometry from the actual audio. This manifest is validation metadata, never a PCM backup.",
  editableLayers: [
    "00_BACKGROUND",
    "10_PRIMARY_STRUCTURE",
    "20_GENRE_OBJECT",
    "30_GENRE_BLEND_*",
    "40_FAMILY_SCORE",
    "50_COUNCIL_COMPOSITION",
    "60_DISPLAY_GRAIN",
    "70_VISIBLE_PCM_WAVEFORM",
    "90_PROTECTED_PCM__PRODUCTION_ONLY"
  ],
  files
};
fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated ${files.length} Illustrator SVGs in ${path.relative(DEMO_DIR, OUT_DIR)}`);
