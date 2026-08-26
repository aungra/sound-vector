import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");

export const DETAIL_ALIASES = Object.freeze({
  city_pop: "city-pop",
  citypop: "city-pop",
  "city pop": "city-pop",
  anime_song: "anime-song",
  anisong: "anime-song",
  jpop: "j-pop",
  "j_pop": "j-pop",
  dnb: "drum-and-bass",
  drum_n_bass: "drum-and-bass",
  "drum & bass": "drum-and-bass",
  rnb: "r-and-b",
  "r&b": "r-and-b",
  hiphop: "hip-hop",
  "hip hop": "hip-hop",
  deep_house: "deep-house",
  dub_step: "dubstep",
  hardcore: "hardcore-punk",
  noise_music: "noise",
  "近現代クラシック": "contemporary-classical",
  "フュージョン": "jazz-fusion"
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function loadHierarchy(filePath = path.join(REPO_ROOT, "apps/demo/genre-hierarchy.js")) {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
  return context.SoundFormGenreHierarchy;
}

export function canonicalDetailId(value, detailIds, detailLabels = new Map()) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw.endsWith("_other") || raw.endsWith("-other")) return "";
  const normalized = DETAIL_ALIASES[raw] || detailLabels.get(raw) || raw.replaceAll("_", "-");
  return detailIds.has(normalized) ? normalized : "";
}

function explicitDetailTarget(row, detailIds, detailLabels, visualGenres) {
  const style = canonicalDetailId(row.styleTarget || row.styleHint, detailIds, detailLabels);
  if (style) return style;
  if (visualGenres.has(row.genre)) return "";
  return canonicalDetailId(row.genre, detailIds, detailLabels);
}

function percent(numerator, denominator) {
  return denominator ? Math.round(numerator / denominator * 10000) / 100 : null;
}

function stableRowKey(row) {
  return row.trackId
    ? `${row.datasetName || ""}:${row.trackId}`
    : row.sourceUrl || row.referenceUrl || row.youtubeUrl || "";
}

function indexSplitRows(rows) {
  const indexes = [new Map(), new Map(), new Map()];
  for (const row of rows) {
    const values = [stableRowKey(row), row.sourceUrl, row.referenceUrl];
    values.forEach((value, index) => {
      if (value) indexes[index].set(value, row);
    });
  }
  return indexes;
}

function splitMetadata(result, indexes) {
  const values = [stableRowKey(result), result.sourceUrl, result.referenceUrl];
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] && indexes[index].has(values[index])) return indexes[index].get(values[index]);
  }
  return {};
}

function predictionIds(result, detailIds) {
  const styleRows = Array.isArray(result.style) ? result.style : [];
  const raw = styleRows.length
    ? styleRows.map(item => item.style || item.id || item.genre || item.name)
    : [result.predictedStyle];
  return raw.map(value => canonicalDetailId(value, detailIds));
}

function highConfidence(result, detailIds) {
  if (result.needsReview === true) return false;
  const rows = Array.isArray(result.style) ? result.style : [];
  if (!canonicalDetailId(rows[0]?.style || rows[0]?.id || result.predictedStyle, detailIds)) return false;
  const first = Number(rows[0]?.score || 0);
  const second = Number(rows[1]?.score || 0);
  return first >= 70 && first - second >= 10;
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

export function evaluateDetailedGenres({ hierarchy, splitRows, resultRows, sourceGeneratedAt = "" }) {
  const details = hierarchy.DETAIL_GENRES.map(item => ({ ...item }));
  const detailById = new Map(details.map(item => [item.id, item]));
  const detailIds = new Set(detailById.keys());
  const detailLabels = new Map(details.map(item => [item.label.toLowerCase(), item.id]));
  const visualGenres = new Set(hierarchy.VISUAL_GENRES);
  const indexes = indexSplitRows(splitRows);
  const allExplicit = splitRows.map(row => ({
    ...row,
    detailTarget: explicitDetailTarget(row, detailIds, detailLabels, visualGenres)
  })).filter(row => row.detailTarget);
  const evaluation = resultRows.map(result => {
    const meta = splitMetadata(result, indexes);
    const target = explicitDetailTarget(result, detailIds, detailLabels, visualGenres);
    const predicted = predictionIds(result, detailIds);
    return {
      result,
      meta,
      target,
      predicted,
      top1: predicted[0] === target,
      top3: predicted.slice(0, 3).includes(target),
      highConfidence: highConfidence(result, detailIds)
    };
  }).filter(row => row.target);

  const represented = [...new Set(allExplicit.map(row => row.detailTarget))].sort();
  const evaluationRepresented = [...new Set(evaluation.map(row => row.target))].sort();
  const top1Correct = evaluation.filter(row => row.top1).length;
  const top3Correct = evaluation.filter(row => row.top3).length;
  const high = evaluation.filter(row => row.highConfidence);
  const unknown = evaluation.filter(row => !row.predicted[0]);
  const parentConsistent = evaluation.filter(row => {
    const predicted = detailById.get(row.predicted[0]);
    const expected = detailById.get(row.target);
    return predicted && expected && predicted.primaryVisualGenre === expected.primaryVisualGenre;
  }).length;

  const byDetail = details.map(detail => {
    const labeled = allExplicit.filter(row => row.detailTarget === detail.id);
    const tested = evaluation.filter(row => row.target === detail.id);
    return {
      id: detail.id,
      label: detail.label,
      system: detail.system,
      primaryVisualGenre: detail.primaryVisualGenre,
      explicitRows: labeled.length,
      testRows: tested.length,
      sourceCount: new Set(labeled.map(row => row.datasetName || row.sourceType).filter(Boolean)).size,
      top1Accuracy: percent(tested.filter(row => row.top1).length, tested.length),
      top3Accuracy: percent(tested.filter(row => row.top3).length, tested.length)
    };
  });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt,
    contract: {
      vocabularySize: details.length,
      groundTruth: "Explicit styleTarget/styleHint only; parent-only labels are excluded.",
      prediction: "Serialized model style candidates only; parent fallback is excluded.",
      split: "Existing serialized evaluation rows from genre-training/results.json."
    },
    readiness: {
      datasetRows: splitRows.length,
      explicitDetailRows: allExplicit.length,
      representedDetailLabels: represented.length,
      vocabularyCoveragePercent: percent(represented.length, details.length),
      missingDetailLabels: details.filter(item => !represented.includes(item.id)).map(item => item.id),
      representedLabels: represented
    },
    evaluation: {
      testRows: evaluation.length,
      representedDetailLabels: evaluationRepresented.length,
      top1Accuracy: percent(top1Correct, evaluation.length),
      top3Accuracy: percent(top3Correct, evaluation.length),
      highConfidenceRows: high.length,
      highConfidenceCoverage: percent(high.length, evaluation.length),
      highConfidenceTop1Accuracy: percent(high.filter(row => row.top1).length, high.length),
      unknownRows: unknown.length,
      unknownRate: percent(unknown.length, evaluation.length),
      parentVisualConsistency: percent(parentConsistent, evaluation.length),
      isFullVocabularyAccuracy: evaluationRepresented.length === details.length
    },
    sourceCounts: countBy(allExplicit, row => row.datasetName || row.sourceType),
    testSourceCounts: countBy(evaluation, row => row.meta.datasetName || row.result.sourceType),
    byDetail,
    caveats: [
      "This is not a 120-class accuracy claim unless all 120 labels are represented in an independent test split.",
      "The current test set reuses the existing model evaluation split and is not a sealed source-heldout detail benchmark.",
      "High-confidence metrics inherit calibration limitations from the serialized style scores."
    ]
  };
}

export function markdownReport(report) {
  const measured = report.byDetail.filter(item => item.testRows > 0);
  const missingBySystem = {};
  for (const item of report.byDetail.filter(item => item.explicitRows === 0)) {
    (missingBySystem[item.system] ||= []).push(item.label);
  }
  const lines = [
    "# 120詳細ジャンル評価ベースライン",
    "",
    `生成日時: ${report.generatedAt}`,
    "",
    "## 結論",
    "",
    `明示ラベルは ${report.readiness.explicitDetailRows}件、${report.readiness.representedDetailLabels}/120分類（語彙coverage ${report.readiness.vocabularyCoveragePercent}%）です。`,
    `現時点で採点できるテストは ${report.evaluation.testRows}件・${report.evaluation.representedDetailLabels}分類だけなので、以下は120分類全体の精度ではありません。`,
    "",
    "## 実測値",
    "",
    "| 指標 | 値 |",
    "| --- | ---: |",
    `| 明示詳細ラベル Top1 | ${report.evaluation.top1Accuracy ?? "N/A"}% |`,
    `| 明示詳細ラベル Top3 | ${report.evaluation.top3Accuracy ?? "N/A"}% |`,
    `| 高信頼 Top1 | ${report.evaluation.highConfidenceTop1Accuracy ?? "N/A"}% |`,
    `| 高信頼 coverage | ${report.evaluation.highConfidenceCoverage ?? "N/A"}% |`,
    `| Unknown率 | ${report.evaluation.unknownRate ?? "N/A"}% |`,
    `| 親32構図との整合 | ${report.evaluation.parentVisualConsistency ?? "N/A"}% |`,
    "",
    "## 評価可能な分類",
    "",
    "| 詳細ジャンル | 全明示件数 | test | Top1 | Top3 | ソース数 |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...measured.map(item => `| ${item.label} | ${item.explicitRows} | ${item.testRows} | ${item.top1Accuracy}% | ${item.top3Accuracy}% | ${item.sourceCount} |`),
    "",
    "## 不足ラベル",
    "",
    ...Object.entries(missingBySystem).flatMap(([system, labels]) => [
      `### ${system} (${labels.length})`,
      "",
      labels.join(" / "),
      ""
    ]),
    "## 判定契約",
    "",
    "- 正解は `styleTarget` または `styleHint` に明記された詳細ラベルだけです。",
    "- 親32ジャンルしかない行は詳細分類の正解データに含めません。",
    "- 予測は保存済みモデルのstyle候補だけを使い、親ジャンルfallbackを正答扱いしません。",
    "- 120分類精度を名乗るには、全120分類を含む独立source-heldout testが必要です。",
    ""
  ];
  return lines.join("\n");
}

function main() {
  const hierarchy = loadHierarchy();
  const splitPath = path.join(REPO_ROOT, "genre-training/dataset-splits.json");
  const resultsPath = path.join(REPO_ROOT, "genre-training/results.json");
  const outputJson = path.join(REPO_ROOT, "genre-training/detail-genre-evaluation.json");
  const outputMarkdown = path.join(REPO_ROOT, "genre-training/DETAIL_GENRE_EVALUATION.md");
  const splits = readJson(splitPath).items || [];
  const serialized = readJson(resultsPath);
  const report = evaluateDetailedGenres({
    hierarchy,
    splitRows: splits,
    resultRows: serialized.results || [],
    sourceGeneratedAt: serialized.summary?.generatedAt || ""
  });
  fs.writeFileSync(outputJson, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(outputMarkdown, markdownReport(report));
  console.log(JSON.stringify({ readiness: report.readiness, evaluation: report.evaluation }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
