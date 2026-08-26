import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalDetailId,
  evaluateDetailedGenres,
  loadHierarchy,
  markdownReport
} from "./genre-detail-evaluate.mjs";

const hierarchy = loadHierarchy();
const ids = new Set(hierarchy.DETAIL_GENRES.map(item => item.id));

test("canonicalDetailId normalizes explicit aliases and rejects family fallback", () => {
  assert.equal(canonicalDetailId("city_pop", ids), "city-pop");
  assert.equal(canonicalDetailId("anime_song", ids), "anime-song");
  assert.equal(canonicalDetailId("black_music_other", ids), "");
  assert.equal(canonicalDetailId("not-a-real-label", ids), "");
});

test("detail evaluation excludes parent-only labels and does not promote parent fallback", () => {
  const report = evaluateDetailedGenres({
    hierarchy,
    splitRows: [
      { genre: "J-POP", styleTarget: "city_pop", datasetName: "A", trackId: "1" },
      { genre: "ロック", styleTarget: "", datasetName: "A", trackId: "2" }
    ],
    resultRows: [
      {
        genre: "J-POP", styleTarget: "city_pop", predicted: "シティ・ポップ",
        predictedStyle: "pop_other", style: [{ style: "pop_other", score: 100 }],
        sourceType: "cc-dataset"
      },
      { genre: "ロック", predicted: "ロック", style: [], sourceType: "cc-dataset" }
    ]
  });
  assert.equal(report.readiness.explicitDetailRows, 1);
  assert.equal(report.evaluation.testRows, 1);
  assert.equal(report.evaluation.top1Accuracy, 0);
  assert.equal(report.evaluation.unknownRate, 100);
  assert.equal(report.evaluation.isFullVocabularyAccuracy, false);
});

test("detail evaluation measures serialized top candidates", () => {
  const report = evaluateDetailedGenres({
    hierarchy,
    splitRows: [{ genre: "ダブ", styleTarget: "dub", datasetName: "FMA", trackId: "1" }],
    resultRows: [{
      genre: "ダブ", styleTarget: "dub", needsReview: false,
      style: [
        { style: "funk", score: 91 },
        { style: "dub", score: 75 },
        { style: "black_music_other", score: 50 }
      ]
    }]
  });
  assert.equal(report.evaluation.top1Accuracy, 0);
  assert.equal(report.evaluation.top3Accuracy, 100);
  assert.match(markdownReport(report), /120分類全体の精度ではありません/);
});

test("explicit source subgenre labels count but 32 visual parent labels do not", () => {
  const report = evaluateDetailedGenres({
    hierarchy,
    splitRows: [
      { genre: "ボサノヴァ", datasetName: "RWC", trackId: "1" },
      { genre: "クラシック音楽", datasetName: "RWC", trackId: "2" }
    ],
    resultRows: []
  });
  assert.equal(report.readiness.explicitDetailRows, 1);
  assert.deepEqual(report.readiness.representedLabels, ["bossa-nova"]);
});
