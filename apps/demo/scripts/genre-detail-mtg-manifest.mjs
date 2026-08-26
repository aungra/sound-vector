import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const CACHE_PATHS = path.join(ROOT, "genre-training/cache-paths.local.json");

export const MTG_DETAIL_TAGS = Object.freeze({
  ambient: "ambient", darkambient: "dark-ambient", newage: "new-age",
  classical: "classical", symphonic: "symphonic", soundtrack: "film-score",
  orchestral: "symphonic", choir: "choral", blues: "blues", jazz: "jazz",
  jazzfusion: "jazz-fusion", soul: "soul", rnb: "r-and-b", folk: "folk",
  singersongwriter: "singer-songwriter", country: "country", electronic: "electronic",
  idm: "idm", industrial: "industrial", techno: "techno", house: "house",
  deephouse: "deep-house", trance: "trance", funk: "funk", disco: "disco",
  synthpop: "synthpop", drumnbass: "drum-and-bass", breakbeat: "breakbeat",
  dubstep: "dubstep", hiphop: "hip-hop", reggae: "reggae", dub: "dub",
  latin: "latin", bossanova: "bossa-nova", world: "world", punkrock: "punk",
  metal: "metal", heavymetal: "heavy-metal", hardrock: "hard-rock",
  poprock: "pop-rock", alternativerock: "alternative-rock"
});

function readLocalCachePaths() {
  if (!fs.existsSync(CACHE_PATHS)) return {};
  try { return JSON.parse(fs.readFileSync(CACHE_PATHS, "utf8")); } catch { return {}; }
}

function parseFixedTsv(text) {
  const lines = text.replace(/\r/g, "").trim().split("\n");
  const headers = lines.shift().split("\t");
  return lines.map(line => {
    const cells = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
}

export function directDetailLabels(tags, vocabulary) {
  return [...new Set(tags.map(tag => {
    const normalized = String(tag).trim().toLowerCase().replace(/^genre---/, "");
    return MTG_DETAIL_TAGS[normalized] || "";
  }).filter(id => id && vocabulary.has(id)))];
}

function loadHierarchyIds() {
  const context = vm.createContext({});
  const source = fs.readFileSync(path.join(ROOT, "apps/demo/genre-hierarchy.js"), "utf8");
  vm.runInContext(source, context);
  return new Set(context.SoundFormGenreHierarchy.DETAIL_GENRES.map(item => item.id));
}

function loadSplitIds(mtgRoot) {
  const base = path.join(mtgRoot, "mtg-jamendo-dataset-tools/data/splits/split-0");
  const result = new Map();
  for (const [name, fileName] of [["train", "autotagging_genre-train.tsv"], ["validation", "autotagging_genre-validation.tsv"], ["test", "autotagging_genre-test.tsv"]]) {
    const filePath = path.join(base, fileName);
    if (!fs.existsSync(filePath)) continue;
    for (const line of fs.readFileSync(filePath, "utf8").replace(/\r/g, "").split("\n").slice(1)) {
      const trackId = line.split("\t")[0];
      if (trackId) result.set(trackId, name);
    }
  }
  return result;
}

function countsBy(items, key) {
  const counts = {};
  for (const item of items) {
    const values = Array.isArray(item[key]) ? item[key] : [item[key]];
    for (const value of values.filter(Boolean)) counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

export function buildMtgDetailManifest({ genreText, metaText, audioRoot, licenseText = "", splitIds = new Map(), vocabulary }) {
  const meta = new Map(parseFixedTsv(metaText).map(row => [row.TRACK_ID, row]));
  const licenses = new Map();
  if (licenseText) {
    const lines = licenseText.replace(/\r/g, "").split("\n");
    for (let index = 0; index < lines.length - 2; index += 1) {
      const audioPath = lines[index].trim();
      if (!/\.mp3$/i.test(audioPath)) continue;
      const evidence = lines[index + 2].trim();
      const licenseUrl = evidence.match(/https?:\/\/\S+/)?.[0] || "";
      const license = /by-nc-sa/i.test(licenseUrl) ? "CC-BY-NC-SA"
        : /by-nc-nd/i.test(licenseUrl) ? "CC-BY-NC-ND"
          : /by-nc/i.test(licenseUrl) ? "CC-BY-NC"
            : /by-sa/i.test(licenseUrl) ? "CC-BY-SA"
              : /\/by\//i.test(licenseUrl) ? "CC-BY" : "Creative Commons";
      licenses.set(audioPath, { license, licenseUrl });
      index += 2;
    }
  }
  const lines = genreText.replace(/\r/g, "").trim().split("\n").slice(1);
  const items = [];
  for (const line of lines) {
    const cells = line.split("\t");
    if (cells.length < 6) continue;
    const [trackId, , , relativePath, duration] = cells;
    const detailLabels = directDetailLabels(cells.slice(5), vocabulary);
    if (!detailLabels.length) continue;
    const filePath = path.join(audioRoot, relativePath.replace(/\.mp3$/i, ".low.mp3"));
    if (!fs.existsSync(filePath)) continue;
    const info = meta.get(trackId) || {};
    const license = licenses.get(relativePath) || {};
    items.push({
      datasetName: "MTG-Jamendo autotagging genre",
      trackId,
      split: splitIds.get(trackId) || "unassigned",
      detailLabels,
      detailTarget: detailLabels.length === 1 ? detailLabels[0] : "",
      singleTargetEligible: detailLabels.length === 1,
      filePath,
      referenceUrl: info.URL || "",
      license: license.license || "Creative Commons",
      licenseUrl: license.licenseUrl || "",
      canonicalArtist: info.ARTIST_NAME || "",
      canonicalTitle: info.TRACK_NAME || "",
      duration: Number(duration) || 0,
      labelEvidence: cells.slice(5).filter(tag => MTG_DETAIL_TAGS[tag.replace(/^genre---/, "")]).join(","),
      audioStoragePolicy: "external-cache-only"
    });
  }
  return items;
}

function main() {
  const cache = readLocalCachePaths();
  const externalData = path.resolve(process.env.MMFR_EXTERNAL_DATA_DIR || cache.externalDataDir || path.join(ROOT, ".external-data"));
  const mtgRoot = path.join(externalData, "mtg-jamendo");
  const genrePath = path.join(mtgRoot, "data/autotagging_genre.tsv");
  const metaPath = path.join(mtgRoot, "data/raw.meta.tsv");
  const audioRoot = path.join(mtgRoot, "raw_30s/audio-low");
  const licensePath = path.join(mtgRoot, "audio_licenses.txt");
  const outputPath = path.resolve(process.env.MMFR_MTG_DETAIL_MANIFEST_OUTPUT || path.join(externalData, "../genre-training/detail-genre-mtg-source-manifest.json"));
  for (const required of [genrePath, metaPath, audioRoot, licensePath]) {
    if (!fs.existsSync(required)) throw new Error(`Required MTG-Jamendo asset is missing: ${required}`);
  }
  const vocabulary = loadHierarchyIds();
  const items = buildMtgDetailManifest({
    genreText: fs.readFileSync(genrePath, "utf8"),
    metaText: fs.readFileSync(metaPath, "utf8"),
    audioRoot,
    licenseText: fs.readFileSync(licensePath, "utf8"),
    splitIds: loadSplitIds(mtgRoot),
    vocabulary
  });
  const single = items.filter(item => item.singleTargetEligible);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dataset: "MTG-Jamendo autotagging genre",
    fullManifestPath: outputPath,
    audioStoragePolicy: "external-cache-only",
    totalAudioCandidates: items.length,
    representedDetailLabels: Object.keys(countsBy(items, "detailLabels")).length,
    singleTargetCandidates: single.length,
    singleTargetDetailLabels: Object.keys(countsBy(single, "detailTarget")).length,
    byDetail: countsBy(items, "detailLabels"),
    singleTargetByDetail: countsBy(single, "detailTarget"),
    bySplit: countsBy(items, "split"),
    byLicense: countsBy(items, "license"),
    promotionPolicy: "Candidate only. Promote after source-heldout ablation; multi-label rows are not single-target ground truth."
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 1, items }, null, 2)}\n`);
  fs.writeFileSync(path.join(ROOT, "genre-training/detail-genre-mtg-source-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
