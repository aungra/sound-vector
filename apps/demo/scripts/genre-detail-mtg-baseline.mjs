import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");

function percent(numerator, denominator) {
  return denominator ? Math.round(numerator / denominator * 10000) / 100 : null;
}

function groupByLabel(rows) {
  const groups = {};
  for (const row of rows) (groups[row.detailTarget] ||= []).push(row);
  return groups;
}

export function evaluateCentroidBaseline(rows, { minTrain = 5, minTest = 2 } = {}) {
  const trainGroups = groupByLabel(rows.filter(row => row.split === "train" && row.vector));
  const testGroups = groupByLabel(rows.filter(row => row.split === "test" && row.vector));
  const labels = Object.keys(trainGroups).filter(label =>
    trainGroups[label].length >= minTrain && (testGroups[label]?.length || 0) >= minTest
  ).sort();
  const train = labels.flatMap(label => trainGroups[label]);
  const test = labels.flatMap(label => testGroups[label]);
  if (!train.length || !test.length) throw new Error("No classes satisfy the detail baseline support thresholds.");
  const dimensions = train[0].vector.length;
  const mean = Array(dimensions).fill(0);
  const deviation = Array(dimensions).fill(0);
  for (const row of train) for (let index = 0; index < dimensions; index += 1) mean[index] += row.vector[index] / train.length;
  for (const row of train) for (let index = 0; index < dimensions; index += 1) deviation[index] += (row.vector[index] - mean[index]) ** 2 / train.length;
  for (let index = 0; index < dimensions; index += 1) deviation[index] = Math.sqrt(deviation[index]) + 1e-8;
  const standardize = vector => vector.map((value, index) => (value - mean[index]) / deviation[index]);
  const centroids = {};
  for (const label of labels) {
    centroids[label] = Array(dimensions).fill(0);
    for (const row of trainGroups[label]) {
      const vector = standardize(row.vector);
      for (let index = 0; index < dimensions; index += 1) centroids[label][index] += vector[index] / trainGroups[label].length;
    }
  }
  const predictions = test.map(row => {
    const vector = standardize(row.vector);
    const top = labels.map(label => ({
      label,
      distance: centroids[label].reduce((sum, value, index) => sum + (vector[index] - value) ** 2, 0)
    })).sort((a, b) => a.distance - b.distance);
    return { target: row.detailTarget, top };
  });
  const byDetail = labels.map(label => {
    const selected = predictions.filter(row => row.target === label);
    return {
      detail: label,
      trainRows: trainGroups[label].length,
      testRows: selected.length,
      top1Accuracy: percent(selected.filter(row => row.top[0].label === label).length, selected.length),
      top3Accuracy: percent(selected.filter(row => row.top.slice(0, 3).some(item => item.label === label)).length, selected.length)
    };
  });
  return {
    eligibleDetailLabels: labels.length,
    trainRows: train.length,
    testRows: test.length,
    featureDimensions: dimensions,
    top1Accuracy: percent(predictions.filter(row => row.top[0].label === row.target).length, predictions.length),
    top3Accuracy: percent(predictions.filter(row => row.top.slice(0, 3).some(item => item.label === row.target)).length, predictions.length),
    balancedTop1Accuracy: Math.round(byDetail.reduce((sum, row) => sum + row.top1Accuracy, 0) / byDetail.length * 100) / 100,
    byDetail
  };
}

function markdown(report) {
  return [
    "# MTG-Jamendo 詳細ジャンル音響ベースライン",
    "",
    `生成日時: ${report.generatedAt}`,
    "",
    "## 結論",
    "",
    `公式splitと既存Essentia特徴を使った ${report.metrics.eligibleDetailLabels}分類・${report.metrics.testRows}件の同一ソース内ベースラインです。`,
    "未知ソース精度および120分類全体の精度ではありません。",
    "",
    "| 指標 | 値 |",
    "| --- | ---: |",
    `| Top1 | ${report.metrics.top1Accuracy}% |`,
    `| Top3 | ${report.metrics.top3Accuracy}% |`,
    `| Balanced Top1 | ${report.metrics.balancedTop1Accuracy}% |`,
    `| train | ${report.metrics.trainRows} |`,
    `| test | ${report.metrics.testRows} |`,
    "",
    "## 分類別",
    "",
    "| detail | train | test | Top1 | Top3 |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...report.metrics.byDetail.map(row => `| ${row.detail} | ${row.trainRows} | ${row.testRows} | ${row.top1Accuracy}% | ${row.top3Accuracy}% |`),
    "",
    "## 制約",
    "",
    "- MTG-Jamendo内の公式splitであり、source-heldoutではありません。",
    "- 単一の直接対応タグだけを正解とし、複数詳細タグを持つ曲は除外しています。",
    "- このセントロイド分類器はデータ健全性の基準であり、本番モデルではありません。",
    ""
  ].join("\n");
}

function main() {
  const cacheRoot = path.resolve(process.env.MMFR_GENRE_CACHE_DIR || "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training");
  const manifestPath = path.resolve(process.env.MMFR_MTG_DETAIL_MANIFEST || path.join(cacheRoot, "detail-genre-mtg-source-manifest.json"));
  const featurePath = path.resolve(process.env.MMFR_MTG_FEATURE_CACHE || path.join(cacheRoot, "essentia-mtg-jamendo-feature-cache.json"));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")).items;
  const features = JSON.parse(fs.readFileSync(featurePath, "utf8"));
  const rows = manifest.filter(item => item.singleTargetEligible).map(item => ({
    ...item,
    vector: features[`cc-dataset:${item.filePath}`] || null
  }));
  const metrics = evaluateCentroidBaseline(rows);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    evaluationScope: "source-internal",
    model: "standardized-nearest-centroid-baseline",
    groundTruth: "single direct MTG genre tag mapped to one detail vocabulary label",
    availableSingleTargetRows: rows.length,
    rowsWithCachedFeatures: rows.filter(row => row.vector).length,
    metrics,
    promotionEligible: false,
    promotionBlocker: "Requires at least one independent source for each evaluated detail label."
  };
  fs.writeFileSync(path.join(ROOT, "genre-training/detail-genre-mtg-baseline.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(ROOT, "genre-training/DETAIL_GENRE_MTG_BASELINE.md"), markdown(report));
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
