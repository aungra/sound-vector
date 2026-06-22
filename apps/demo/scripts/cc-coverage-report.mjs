import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const SEEDS_PATH = path.join(TRAINING_DIR, "source-seeds.json");
const VERIFIED_PATH = path.join(TRAINING_DIR, "verified-dataset.json");
const SOURCE_REGISTRY_PATH = path.join(TRAINING_DIR, "cc-source-registry.json");
const IA_CANDIDATES_PATH = path.join(TRAINING_DIR, "internet-archive-cc-candidates.json");
const WIKIMEDIA_CANDIDATES_PATH = path.join(TRAINING_DIR, "wikimedia-commons-audio-candidates.json");
const REPORT_PATH = path.join(TRAINING_DIR, "cc-coverage-report.json");
const DEFAULT_MANIFESTS = [
  path.join(TRAINING_DIR, "cc-source-manifest.json"),
  path.join(TRAINING_DIR, "mtg-jamendo-manifest.preview.json"),
  path.join(TRAINING_DIR, "internet-archive-cc-source-manifest.json"),
  path.join(TRAINING_DIR, "wikimedia-commons-cc-source-manifest.json")
];
const manifestPaths = (process.env.MMFR_CC_COVERAGE_MANIFESTS || DEFAULT_MANIFESTS.join(":"))
  .split(":")
  .map(value => value.trim())
  .filter(Boolean)
  .map(value => path.resolve(value));

const FINE_EXCLUDED = new Set(["電子音楽", "ワールドミュージック"]);
const FORMAL_SOURCE_TYPES = new Set(["cc-dataset", "local-audio"]);
const PRIORITY_GENRES = new Set(["シティ・ポップ", "J-POP", "ドローン", "クラシック音楽", "ダブ", "テクノ"]);
const DEFAULT_TARGET_TRACKS = Math.max(1, Number(process.env.MMFR_GOAL_DEFAULT_TRACKS || 50));
const PRIORITY_TARGET_TRACKS = Math.max(DEFAULT_TARGET_TRACKS, Number(process.env.MMFR_GOAL_PRIORITY_TRACKS || 100));

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function seedGenres() {
  const seeds = loadJson(SEEDS_PATH, {});
  const out = [];
  if (Array.isArray(seeds.genres)) {
    seeds.genres.forEach(item => {
      if (item.genre && item.macroGenre) out.push({ genre: item.genre, macroGenre: item.macroGenre });
    });
  }
  Object.entries(seeds.macroGenres || {}).forEach(([macroGenre, genres]) => {
    (genres || []).forEach(genre => {
      if (!out.some(item => item.genre === genre)) out.push({ genre, macroGenre });
    });
  });
  return out;
}

function manifestItems(pathname) {
  const payload = loadJson(pathname, null);
  if (!payload) return [];
  const items = Array.isArray(payload) ? payload : payload.items || [];
  return items.map(item => ({ ...item, manifestPath: pathname, manifestName: path.basename(pathname) }));
}

function verifiedItems() {
  const payload = loadJson(VERIFIED_PATH, { items: [] });
  return Array.isArray(payload) ? payload : payload.items || [];
}

function hasAudio(item = {}) {
  const filePath = item.filePath || item.localAudioPath || "";
  return Boolean(filePath && fs.existsSync(filePath));
}

function count(items, predicate = () => true) {
  return items.reduce((acc, item) => {
    if (!item.genre || !predicate(item)) return acc;
    acc[item.genre] = (acc[item.genre] || 0) + 1;
    return acc;
  }, {});
}

const seeds = seedGenres();
const manifests = manifestPaths.flatMap(manifestItems);
const verified = verifiedItems();
const manifestCandidateCounts = count(manifests);
const manifestAudioCounts = count(manifests, hasAudio);
const fmaMetadataPotentialCounts = count(verified, item => item.sourceType === "fma-metadata");
const internetArchiveCandidates = loadJson(IA_CANDIDATES_PATH, { items: [] });
const internetArchiveItems = Array.isArray(internetArchiveCandidates) ? internetArchiveCandidates : internetArchiveCandidates.items || [];
const internetArchiveCandidateCounts = count(internetArchiveItems, item => item.sourceType === "internet-archive-candidate" || item.candidateAudioUrl);
const wikimediaCandidates = loadJson(WIKIMEDIA_CANDIDATES_PATH, { items: [] });
const wikimediaItems = Array.isArray(wikimediaCandidates) ? wikimediaCandidates : wikimediaCandidates.items || [];
const wikimediaCandidateCounts = count(wikimediaItems, item => item.sourceType === "wikimedia-commons-candidate" || item.candidateAudioUrl);
const verifiedFormalCounts = count(verified, item => FORMAL_SOURCE_TYPES.has(item.sourceType));
const verifiedReferenceCounts = count(verified, item => item.sourceType !== "fma-metadata");
const sourceRegistry = loadJson(SOURCE_REGISTRY_PATH, { sources: [], gapGenreSearchTerms: {} });

function recommendedSourcesForGenre(genre) {
  return (sourceRegistry.sources || [])
    .filter(source => Array.isArray(source.recommendedFor) && source.recommendedFor.includes(genre))
    .map(source => ({
      id: source.id,
      name: source.name,
      kind: source.kind,
      status: source.status,
      referenceUrl: source.referenceUrl,
      nextAction: source.nextAction
    }));
}

const rows = seeds.map(seed => {
  const priority = PRIORITY_GENRES.has(seed.genre);
  const target = priority ? PRIORITY_TARGET_TRACKS : DEFAULT_TARGET_TRACKS;
  const formalRows = verifiedFormalCounts[seed.genre] || 0;
  const manifestAudioRows = manifestAudioCounts[seed.genre] || 0;
  const candidateRows = manifestCandidateCounts[seed.genre] || 0;
  const fmaPotentialRows = fmaMetadataPotentialCounts[seed.genre] || 0;
  const iaPotentialRows = internetArchiveCandidateCounts[seed.genre] || 0;
  const wikimediaPotentialRows = wikimediaCandidateCounts[seed.genre] || 0;
  const datasetPotentialRows = Math.max(formalRows, manifestAudioRows, candidateRows);
  const totalPotential = datasetPotentialRows + fmaPotentialRows + iaPotentialRows + wikimediaPotentialRows;
  return {
    genre: seed.genre,
    macroGenre: seed.macroGenre,
    fineEvaluable: !FINE_EXCLUDED.has(seed.genre),
    priority,
    target,
    verifiedFormalRows: formalRows,
    verifiedReferenceRows: verifiedReferenceCounts[seed.genre] || 0,
    manifestAudioRows,
    manifestCandidateRows: candidateRows,
    fmaMetadataPotentialRows: fmaPotentialRows,
    internetArchiveCandidateRows: iaPotentialRows,
    wikimediaCandidateRows: wikimediaPotentialRows,
    totalPotentialRows: totalPotential,
    recommendedSources: recommendedSourcesForGenre(seed.genre),
    searchTerms: sourceRegistry.gapGenreSearchTerms?.[seed.genre] || [],
    missingFormalRows: Math.max(0, target - formalRows),
    missingPotentialRows: Math.max(0, target - totalPotential),
    hasEnoughPotential: totalPotential >= target,
    hasEnoughImportedFormal: formalRows >= target
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  manifestPaths: manifestPaths.filter(fs.existsSync).map(pathname => path.relative(ROOT, pathname)),
  sourceRegistry: fs.existsSync(SOURCE_REGISTRY_PATH) ? path.relative(ROOT, SOURCE_REGISTRY_PATH) : "",
  summary: {
    seedGenres: rows.length,
    fineEvaluableGenres: rows.filter(row => row.fineEvaluable).length,
    enoughPotentialGenres: rows.filter(row => row.fineEvaluable && row.hasEnoughPotential).length,
    enoughImportedFormalGenres: rows.filter(row => row.fineEvaluable && row.hasEnoughImportedFormal).length,
    manifestCandidates: manifests.length,
    manifestAudioRows: manifests.filter(hasAudio).length,
    fmaMetadataPotentialRows: verified.filter(item => item.sourceType === "fma-metadata").length,
    internetArchiveCandidateRows: internetArchiveItems.length,
    wikimediaCandidateRows: wikimediaItems.length,
    verifiedFormalRows: verified.filter(item => FORMAL_SOURCE_TYPES.has(item.sourceType)).length
  },
  missingPotential: rows
    .filter(row => row.fineEvaluable && row.missingPotentialRows > 0)
    .sort((a, b) => Number(b.priority) - Number(a.priority) || b.missingPotentialRows - a.missingPotentialRows || a.genre.localeCompare(b.genre, "ja")),
  missingFormalImport: rows
    .filter(row => row.fineEvaluable && row.missingFormalRows > 0)
    .sort((a, b) => Number(b.priority) - Number(a.priority) || b.missingFormalRows - a.missingFormalRows || a.genre.localeCompare(b.genre, "ja")),
  genres: rows
};

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  summary: report.summary,
  missingPotential: report.missingPotential.slice(0, 12).map(row => ({
    genre: row.genre,
    missingPotentialRows: row.missingPotentialRows,
    manifestCandidateRows: row.manifestCandidateRows,
    fmaMetadataPotentialRows: row.fmaMetadataPotentialRows,
    internetArchiveCandidateRows: row.internetArchiveCandidateRows,
    wikimediaCandidateRows: row.wikimediaCandidateRows,
    verifiedFormalRows: row.verifiedFormalRows,
    recommendedSources: row.recommendedSources.map(source => source.id),
    searchTerms: row.searchTerms
  })),
  missingFormalImport: report.missingFormalImport.slice(0, 12).map(row => ({
    genre: row.genre,
    missingFormalRows: row.missingFormalRows,
    manifestCandidateRows: row.manifestCandidateRows,
    fmaMetadataPotentialRows: row.fmaMetadataPotentialRows,
    internetArchiveCandidateRows: row.internetArchiveCandidateRows,
    wikimediaCandidateRows: row.wikimediaCandidateRows,
    manifestAudioRows: row.manifestAudioRows,
    recommendedSources: row.recommendedSources.map(source => source.id)
  }))
}, null, 2));
console.log(`Wrote ${path.relative(ROOT, REPORT_PATH)}`);
