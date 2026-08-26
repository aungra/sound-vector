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
  const rows = [
    ...trainRows.filter(item => item.split !== "test").map(item => ({ ...item, split: "train" })),
    ...testRows.filter(item => item.split === "test").map(item => ({ ...item, split: "test" }))
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
    "## 昇格判定",
    "",
    "独立ソース精度の初期成立は確認できましたが、評価可能分類数が少ないため本番詳細分類器への昇格は保留です。",
    "次はElectronic / Blues / Jazz / Folkのproduction-safeな第2ソースtestを増やします。",
    ""
  ].join("\n");
}

function main() {
  const cacheRoot = path.resolve(process.env.MMFR_GENRE_CACHE_DIR || DEFAULT_CACHE);
  const features = JSON.parse(fs.readFileSync(path.join(cacheRoot, "essentia-mtg-jamendo-feature-cache.json"), "utf8"));
  const mtg = loadRows(cacheRoot, "detail-genre-mtg-source-manifest.json", features);
  const fma = loadRows(cacheRoot, "detail-genre-fma-source-manifest.json", features);
  const directions = {
    "MTG-Jamendo -> FMA": crossSourceDirection(mtg, fma),
    "FMA -> MTG-Jamendo": crossSourceDirection(fma, mtg)
  };
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    evaluationScope: "strict-source-heldout-production-safe",
    model: "standardized-nearest-centroid-baseline",
    licensePolicy: "CC0/Public Domain/CC-BY/CC-BY-SA full tracks only",
    directions,
    promotionEligible: false,
    promotionBlocker: "Only 2-3 detailed labels currently satisfy bidirectional support thresholds."
  };
  fs.writeFileSync(path.join(ROOT, "genre-training/detail-genre-independent-baseline.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(ROOT, "genre-training/DETAIL_GENRE_INDEPENDENT_BASELINE.md"), markdown(report));
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
