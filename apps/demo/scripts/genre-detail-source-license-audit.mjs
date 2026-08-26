import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { canonicalDetailId } from "./genre-detail-evaluate.mjs";
import { effectiveTrainingUsage, TRAINING_USAGE } from "./genre-training-license-policy.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_CACHE = "/Volumes/20251005_12TBskyhawk/MUSICTee-cache";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hierarchy() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(ROOT, "apps/demo/genre-hierarchy.js"), "utf8"), context);
  return context.SoundFormGenreHierarchy;
}

function increment(object, key, amount = 1) {
  object[key] = (object[key] || 0) + amount;
}

function sourceSummary(items) {
  const usage = {};
  const licenses = {};
  const details = {};
  for (const item of items) {
    const decision = effectiveTrainingUsage(item);
    increment(usage, decision.usage);
    increment(licenses, item.license || "unspecified");
    for (const detail of item.detailLabels || (item.detailTarget ? [item.detailTarget] : [])) increment(details, detail);
  }
  return { rows: items.length, usage, licenses, representedDetailLabels: Object.keys(details).length, byDetail: details };
}

function sourceFamily(item) {
  const name = String(item.sourceFamily || item.datasetName || item.source || "unknown");
  if (/FMA/i.test(name)) return "FMA";
  if (/MTG|Jamendo/i.test(name)) return "MTG-Jamendo";
  if (/RWC/i.test(name)) return "RWC";
  if (/WaivOps/i.test(name)) return "WaivOps";
  return name;
}

function detailSourceCoverage(items, vocabulary) {
  const coverage = Object.fromEntries(vocabulary.map(id => [id, {
    productionSources: new Set(), supportSources: new Set(), researchSources: new Set(), productionRowsBySource: new Map()
  }]));
  for (const item of items) {
    const decision = effectiveTrainingUsage(item);
    const family = sourceFamily(item);
    for (const detail of item.detailLabels || []) {
      if (!coverage[detail]) continue;
      if (decision.usage === TRAINING_USAGE.PRODUCTION) {
        coverage[detail].productionSources.add(family);
        coverage[detail].productionRowsBySource.set(family, (coverage[detail].productionRowsBySource.get(family) || 0) + 1);
      }
      else if (decision.usage === TRAINING_USAGE.SUPPORT) coverage[detail].supportSources.add(family);
      else if (decision.usage === TRAINING_USAGE.RESEARCH) coverage[detail].researchSources.add(family);
    }
  }
  return Object.fromEntries(Object.entries(coverage).map(([detail, value]) => [detail, {
    productionSources: [...value.productionSources].sort(),
    supportSources: [...value.supportSources].sort(),
    researchSources: [...value.researchSources].sort(),
    productionSourceCount: value.productionSources.size,
    productionRowsBySource: Object.fromEntries([...value.productionRowsBySource.entries()].sort()),
    productionSourcesWithAtLeast2Tracks: [...value.productionRowsBySource].filter(([, count]) => count >= 2).map(([source]) => source).sort(),
    productionSourcesWithAtLeast5Tracks: [...value.productionRowsBySource].filter(([, count]) => count >= 5).map(([source]) => source).sort()
  }]));
}

function existingExplicitRows(h) {
  const data = readJson(path.join(ROOT, "genre-training/dataset-splits.json")).items;
  const ids = new Set(h.DETAIL_GENRES.map(item => item.id));
  const labels = new Map(h.DETAIL_GENRES.map(item => [item.label.toLowerCase(), item.id]));
  const visuals = new Set(h.VISUAL_GENRES);
  return data.map(item => {
    let detailTarget = canonicalDetailId(item.styleTarget || item.styleHint, ids, labels);
    if (!detailTarget && !visuals.has(item.genre)) detailTarget = canonicalDetailId(item.genre, ids, labels);
    return detailTarget ? { ...item, detailTarget, detailLabels: [detailTarget], contentScope: "full-track" } : null;
  }).filter(Boolean);
}

function waivOpsRows(cacheRoot) {
  const sources = [
    {
      detailTarget: "house",
      root: path.join(cacheRoot, "external-data/waivops-edm-house-13769544/WaivOps-EDM-HSE-main"),
      doi: "https://doi.org/10.5281/zenodo.13769544"
    },
    {
      detailTarget: "techno",
      root: path.join(cacheRoot, "external-data/waivops-edm-tech-17584890/WaivOps-EDM-TECH-main"),
      doi: "https://doi.org/10.5281/zenodo.17584890"
    }
  ];
  return sources.flatMap(source => {
    const examples = path.join(source.root, "examples");
    if (!fs.existsSync(examples)) return [];
    return fs.readdirSync(examples).filter(name => name.endsWith(".mp3")).map(name => ({
      datasetName: "WaivOps",
      detailTarget: source.detailTarget,
      detailLabels: [source.detailTarget],
      license: "CC-BY-4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      referenceUrl: source.doi,
      filePath: path.join(examples, name),
      contentScope: "loop"
    }));
  });
}

function rwcRows() {
  const detailBySubcategory = {
    Rock: ["rock"], "Heavy Metal": ["heavy-metal"], "Rap / Hip-Hop": ["hip-hop"],
    House: ["house"], Techno: ["techno"], Funk: ["funk"], "Soul / R&B": ["soul", "r-and-b"],
    "Modern Jazz": ["jazz"], Fusion: ["jazz-fusion"], "Bossa Nova": ["bossa-nova"],
    Samba: ["samba"], Reggae: ["reggae"], Baroque: ["baroque"], Classic: ["classical"],
    Romantic: ["romantic"], Modern: ["contemporary-classical"], Blues: ["blues"], Folk: ["folk"],
    Country: ["country"], Gospel: ["gospel"]
  };
  const files = ["rwc-genre-cc-source-manifest.json", "rwc-popular-cc-source-manifest.json"];
  return files.flatMap(file => readJson(path.join(ROOT, "genre-training", file)).items.map(item => ({
    ...item,
    license: "CC-BY-NC-4.0",
    licenseUrl: "https://zenodo.org/records/18656623",
    contentScope: "full-track",
    detailLabels: detailBySubcategory[item.rwcSubcategory] || []
  })));
}

function markdown(report) {
  const rows = Object.entries(report.sources).map(([name, value]) =>
    `| ${name} | ${value.rows} | ${value.representedDetailLabels} | ${value.usage[TRAINING_USAGE.PRODUCTION] || 0} | ${value.usage[TRAINING_USAGE.SUPPORT] || 0} | ${value.usage[TRAINING_USAGE.RESEARCH] || 0} | ${value.usage[TRAINING_USAGE.EXCLUDED_ND] || 0} | ${value.usage[TRAINING_USAGE.VERIFY] || 0} |`
  );
  return [
    "# 詳細ジャンル学習ライセンス監査",
    "",
    `生成日時: ${report.generatedAt}`,
    "",
    "| source | rows | detail labels | production | support only | research only | ND excluded | verify |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows,
    "",
    "## 独立ソースcoverage",
    "",
    `- 本番利用可能なソースあり: ${report.productionCoverage.labelsWithOneSource}/120`,
    `- 本番利用可能な2ソース以上: ${report.productionCoverage.labelsWithTwoSources}/120`,
    `- 各ソース2曲以上で2ソース達成: ${report.productionCoverage.labelsWithTwoSourcesAtLeast2Tracks}/120`,
    `- 各ソース5曲以上で2ソース達成: ${report.productionCoverage.labelsWithTwoSourcesAtLeast5Tracks}/120`,
    `- 本番利用可能なソースなし: ${report.productionCoverage.labelsWithoutProductionSource}/120`,
    `- 2ソース達成: ${report.productionCoverage.twoSourceLabels.join(" / ") || "なし"}`,
    "",
    "## 採用規則",
    "",
    "- `CC0 / Public Domain / CC-BY / CC-BY-SA`: 本番学習候補。帰属とライセンス証拠をmanifestに保持する。",
    "- `CC-BY-NC / CC-BY-NC-SA / RWC`: 研究比較専用。本番モデルへ混入しない。",
    "- `CC-BY-ND / CC-BY-NC-ND`: 保守的に学習対象外。",
    "- ライセンスが `Creative Commons` としか分からない曲: 曲単位の確認まで保留。",
    "- ループ、stem、sound-event: 許諾があっても補助特徴専用。フル楽曲のジャンル正解にはしない。",
    "",
    "## 確認した一次情報",
    "",
    "- RWC Music Database 2026 release: CC BY-NC 4.0, research purposes. https://zenodo.org/records/18656623",
    "- MTG-Jamendo: per-track Creative Commons licenses in `audio_licenses.txt`. https://github.com/MTG/mtg-jamendo-dataset",
    "- WaivOps EDM-HSE: CC BY 4.0 and explicitly intended for machine learning. https://doi.org/10.5281/zenodo.13769544",
    "- WaivOps EDM-TECH: CC BY 4.0 and explicitly intended for model development. https://doi.org/10.5281/zenodo.17584890",
    "- Wikimedia Commons: item-level genre categories and imageinfo.extmetadata license fields. https://commons.wikimedia.org/w/api.php",
    "- ccMixter: item-level license, uploader tags and upload type. https://ccmixter.org/terms",
    "- Internet Archive netlabels: item-level licenseurl, subject, release description and original netlabel collection. https://archive.org/about/terms.php",
    "- Creative Commons license conditions. https://creativecommons.org/share-your-work/cclicenses/",
    "",
    "この分類はプロジェクトの保守的な運用規則であり、法律上の助言ではありません。",
    ""
  ].join("\n");
}

function main() {
  const cacheRoot = path.resolve(process.env.MMFR_CACHE_ROOT || DEFAULT_CACHE);
  const mtgPath = path.join(cacheRoot, "genre-training/detail-genre-mtg-source-manifest.json");
  const fmaPath = path.join(cacheRoot, "genre-training/detail-genre-fma-source-manifest.json");
  const wikimediaPath = path.join(cacheRoot, "genre-training/detail-genre-wikimedia-source-manifest.json");
  const ccmixterPath = path.join(cacheRoot, "genre-training/detail-genre-ccmixter-source-manifest.json");
  const internetArchivePath = path.join(cacheRoot, "genre-training/detail-genre-internet-archive-source-manifest.json");
  const h = hierarchy();
  const existing = existingExplicitRows(h);
  const mtg = readJson(mtgPath).items.map(item => ({ ...item, sourceFamily: "MTG-Jamendo", contentScope: "full-track" }));
  const fma = readJson(fmaPath).items.map(item => ({ ...item, sourceFamily: "FMA", contentScope: "full-track" }));
  const wikimedia = readJson(wikimediaPath).items.map(item => ({ ...item, contentScope: "full-track" }));
  const ccmixter = readJson(ccmixterPath).items.map(item => ({ ...item, sourceFamily: "ccMixter", contentScope: "full-track" }));
  const internetArchive = readJson(internetArchivePath).items.map(item => ({ ...item, contentScope: "full-track" }));
  const waivops = waivOpsRows(cacheRoot).map(item => ({ ...item, sourceFamily: "WaivOps" }));
  const rwc = rwcRows().map(item => ({ ...item, sourceFamily: "RWC" }));
  const sources = {
    "existing-explicit-formal": sourceSummary(existing),
    "MTG-Jamendo-candidates": sourceSummary(mtg),
    "FMA-independent-candidates": sourceSummary(fma),
    "Wikimedia-reviewed-origin-candidates": sourceSummary(wikimedia),
    "ccMixter-reviewed-candidates": sourceSummary(ccmixter),
    "Internet-Archive-reviewed-netlabel-candidates": sourceSummary(internetArchive),
    "WaivOps-rhythm-support": sourceSummary(waivops),
    "RWC-research-only": sourceSummary(rwc)
  };
  const detailIds = h.DETAIL_GENRES.map(item => item.id);
  const coverage = detailSourceCoverage([...existing, ...mtg, ...fma, ...wikimedia, ...ccmixter, ...internetArchive, ...waivops, ...rwc], detailIds);
  const twoSourceLabels = Object.entries(coverage).filter(([, item]) => item.productionSourceCount >= 2).map(([detail]) => detail);
  const oneSourceLabels = Object.entries(coverage).filter(([, item]) => item.productionSourceCount === 1).map(([detail]) => detail);
  const zeroSourceLabels = Object.entries(coverage).filter(([, item]) => item.productionSourceCount === 0).map(([detail]) => detail);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    policyVersion: "training-license-v1",
    sources,
    detailSourceCoverage: coverage,
    productionCoverage: {
      labelsWithOneSource: Object.values(coverage).filter(item => item.productionSourceCount >= 1).length,
      labelsWithTwoSources: Object.values(coverage).filter(item => item.productionSourceCount >= 2).length,
      labelsWithTwoSourcesAtLeast2Tracks: Object.values(coverage).filter(item => item.productionSourcesWithAtLeast2Tracks.length >= 2).length,
      labelsWithTwoSourcesAtLeast5Tracks: Object.values(coverage).filter(item => item.productionSourcesWithAtLeast5Tracks.length >= 2).length,
      labelsWithoutProductionSource: Object.values(coverage).filter(item => item.productionSourceCount === 0).length,
      twoSourceLabels,
      oneSourceLabels,
      zeroSourceLabels
    },
    safeguards: {
      productionAllow: ["CC0", "Public Domain", "CC-BY", "CC-BY-SA"],
      researchOnly: ["CC-BY-NC", "CC-BY-NC-SA", "RWC CC-BY-NC 4.0"],
      excluded: ["CC-BY-ND", "CC-BY-NC-ND"],
      verificationRequired: ["Creative Commons (unspecified)", "missing license"]
    }
  };
  fs.writeFileSync(path.join(ROOT, "genre-training/detail-genre-source-license-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(ROOT, "genre-training/DETAIL_GENRE_SOURCE_LICENSE_AUDIT.md"), markdown(report));
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
