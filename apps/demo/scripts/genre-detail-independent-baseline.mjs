import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateCentroidBaseline } from "./genre-detail-mtg-baseline.mjs";
import { effectiveTrainingUsage, TRAINING_USAGE } from "./genre-training-license-policy.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_CACHE = "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training";

function loadRows(cacheRoot, manifestName, features) {
  const items = JSON.parse(fs.readFileSync(path.join(cacheRoot, manifestName), "utf8")).items;
  return items.filter(item => item.singleTargetEligible &&
    effectiveTrainingUsage({ ...item, contentScope: "full-track" }).usage === TRAINING_USAGE.PRODUCTION
  ).map(item => ({ ...item, vector: features[`cc-dataset:${item.filePath}`] || null }));
}

export function crossSourceDirection(trainRows, testRows, options = {}) {
  const detailFilter = options.details ? new Set(options.details) : null;
  const include = item => !detailFilter || detailFilter.has(item.detailTarget);
  const rows = [
    ...trainRows.filter(item => item.split !== "test" && include(item)).map(item => ({ ...item, split: "train" })),
    // The source family itself is the holdout boundary. Using only its
    // provider-defined test split would discard valid unseen-source evidence.
    ...testRows.filter(include).map(item => ({ ...item, split: "test" }))
  ];
  return evaluateCentroidBaseline(rows, { minTrain: options.minTrain || 5, minTest: options.minTest || 5 });
}

function markdown(report) {
  const sections = Object.entries(report.directions).flatMap(([name, value]) => [
    `## ${name}`,
    "",
    `Top1 ${value.top1Accuracy}% / Top3 ${value.top3Accuracy}% / balanced Top1 ${value.balancedTop1Accuracy}%`,
    "",
    "| detail | train | test | Top1 | Top3 |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...value.byDetail.map(row => `| ${row.detail} | ${row.trainRows} | ${row.testRows} | ${row.top1Accuracy}% | ${row.top3Accuracy}% |`),
    ""
  ]);
  return [
    "# 詳細ジャンル独立ソースベースライン",
    "",
    `生成日時: ${report.generatedAt}`,
    "",
    "CC0 / Public Domain / CC-BY / CC-BY-SAのフル楽曲だけを使用しています。NC・ND・研究限定・ループ素材は含みません。",
    "この評価は対象分類が少ないため120分類全体の精度ではありません。",
    "",
    ...sections,
    "## FMA詳細ラベルablation",
    "",
    `FMA詳細ラベルなし -> ccMixter: Top1 ${report.ablations.withoutFmaExactDetails.top1Accuracy}% / Top3 ${report.ablations.withoutFmaExactDetails.top3Accuracy}% / balanced Top1 ${report.ablations.withoutFmaExactDetails.balancedTop1Accuracy}%`,
    `FMA詳細ラベルあり -> ccMixter: Top1 ${report.ablations.withFmaExactDetails.top1Accuracy}% / Top3 ${report.ablations.withFmaExactDetails.top3Accuracy}% / balanced Top1 ${report.ablations.withFmaExactDetails.balancedTop1Accuracy}%`,
    "",
    "## 昇格判定",
    "",
    "独立ソース精度の初期成立は確認できましたが、評価可能分類数が少ないため本番詳細分類器への昇格は保留です。",
    "次はHouse / Jazz / Disco / Deep Houseのproduction-safeな第2ソースtestを増やします。",
    ""
  ].join("\n");
}

function main() {
  const cacheRoot = path.resolve(process.env.MMFR_GENRE_CACHE_DIR || DEFAULT_CACHE);
  const features = JSON.parse(fs.readFileSync(path.join(cacheRoot, "essentia-mtg-jamendo-feature-cache.json"), "utf8"));
  const mtg = loadRows(cacheRoot, "detail-genre-mtg-source-manifest.json", features);
  const fma = loadRows(cacheRoot, "detail-genre-fma-source-manifest.json", features);
  const ccmixter = loadRows(cacheRoot, "detail-genre-ccmixter-source-manifest.json", features);
  const internetArchive = loadRows(cacheRoot, "detail-genre-internet-archive-source-manifest.json", features);
  const wikimediaCategory = loadRows(cacheRoot, "detail-genre-wikimedia-category-source-manifest.json", features);
  const fmaWithoutExactDetails = fma.filter(item => item.labelEvidenceType !== "exact-detail");
  const ccmixterWithoutFmaExactDetails = crossSourceDirection([...fmaWithoutExactDetails, ...mtg], ccmixter, { minTest: 2 });
  const comparableDetails = ccmixterWithoutFmaExactDetails.byDetail.map(item => item.detail);
  const ccmixterWithFmaExactDetails = crossSourceDirection([...fma, ...mtg], ccmixter, {
    minTest: 2,
    details: comparableDetails
  });
  const ccmixterExpanded = crossSourceDirection([...fma, ...mtg], ccmixter, { minTest: 2 });
  const directions = {
    "MTG-Jamendo -> FMA": crossSourceDirection(mtg, fma),
    "FMA -> MTG-Jamendo": crossSourceDirection(fma, mtg),
    "FMA + MTG-Jamendo -> ccMixter": ccmixterExpanded,
    "FMA + MTG-Jamendo + ccMixter -> IA netlabels": crossSourceDirection([...fma, ...mtg, ...ccmixter], internetArchive, { minTest: 5 }),
    "FMA + MTG-Jamendo + ccMixter -> Wikimedia category origins": crossSourceDirection([...fma, ...mtg, ...ccmixter], wikimediaCategory, { minTest: 5 }),
    "FMA + MTG-Jamendo + ccMixter -> Wikimedia category origins (exploratory min3)": crossSourceDirection(
      [...fma, ...mtg, ...ccmixter], wikimediaCategory, { minTest: 3 }
    )
  };
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    evaluationScope: "strict-source-heldout-production-safe",
    model: "standardized-nearest-centroid-baseline",
    licensePolicy: "CC0/Public Domain/CC-BY/CC-BY-SA full tracks only",
    directions,
    ablations: {
      comparisonDetails: comparableDetails,
      withoutFmaExactDetails: ccmixterWithoutFmaExactDetails,
      withFmaExactDetails: ccmixterWithFmaExactDetails
    },
    promotionEligible: false,
    promotionBlocker: "Only a small subset of detailed labels satisfies independent-source support thresholds; ccMixter, IA netlabels and reviewed Wikimedia origins remain evaluation-only. The Wikimedia min3 direction is exploratory and cannot satisfy promotion gates."
  };
  fs.writeFileSync(path.join(ROOT, "genre-training/detail-genre-independent-baseline.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(ROOT, "genre-training/DETAIL_GENRE_INDEPENDENT_BASELINE.md"), markdown(report));
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
