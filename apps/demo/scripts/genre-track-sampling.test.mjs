import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTrackPredictionContract,
  planTrackSampleRanges,
  preserveRequestedPcmSketch,
  promoteReliableExternalTrackPrediction,
  reliableExternalTrackEvidence,
  reliableExternalRapTrackEvidence,
  summarizeTrackSegmentPredictions,
} from "./genre-track-sampling.mjs";

test("long tracks include the requested position and distributed coverage", () => {
  const ranges = planTrackSampleRanges({ durationSeconds: 600, requestedStartSeconds: 60 });
  assert.equal(ranges.length, 4);
  assert.equal(ranges[0].role, "requested");
  assert.equal(ranges[0].startSeconds, 60);
  assert.deepEqual(ranges.slice(1).map(item => item.role), ["track-20", "track-50", "track-80"]);
  assert.equal(ranges.reduce((sum, item) => sum + item.durationSeconds, 0), 120);
  assert.equal(new Set(ranges.map(item => item.startSeconds)).size, 4);
});

test("duplicate anchors are replaced deterministically", () => {
  const first = planTrackSampleRanges({ durationSeconds: 150, requestedStartSeconds: 60 });
  const second = planTrackSampleRanges({ durationSeconds: 150, requestedStartSeconds: 60 });
  assert.deepEqual(first, second);
  assert.equal(first.length, 4);
  assert.equal(new Set(first.map(item => item.startSeconds)).size, 4);
});

test("duplicate anchors stay near their intended track position", () => {
  const ranges = planTrackSampleRanges({ durationSeconds: 449, requestedStartSeconds: 60 });
  assert.equal(ranges[1].role, "coverage");
  assert.ok(ranges[1].startSeconds < 100);
  assert.ok(ranges[1].startSeconds < ranges[2].startSeconds);
});

test("short tracks are divided without exceeding their duration", () => {
  const ranges = planTrackSampleRanges({ durationSeconds: 80, requestedStartSeconds: 47 });
  assert.equal(ranges.length, 4);
  assert.equal(ranges[0].role, "requested");
  assert.equal(ranges.reduce((sum, item) => sum + item.durationSeconds, 0), 80);
  assert.ok(ranges.every(item => item.endSeconds <= 80));
});

test("track summary exposes median scores, variance, agreement and ranges", () => {
  const records = [
    [0, "ハウス", 80, "テクノ", 20],
    [30, "ハウス", 70, "テクノ", 30],
    [60, "テクノ", 60, "ハウス", 40],
    [90, "ハウス", 75, "テクノ", 25],
  ].map(([startSeconds, first, firstScore, second, secondScore]) => ({
    range: { startSeconds, endSeconds: startSeconds + 30 },
    prediction: {
      top: [{ label: first, score: firstScore }, { label: second, score: secondScore }],
      macro: [{ label: "electronic", score: 100 }],
    },
  }));
  const summary = summarizeTrackSegmentPredictions(records, 4);
  assert.equal(summary.leader, "ハウス");
  assert.equal(summary.voteShare, .75);
  assert.equal(summary.macroVoteShare, 1);
  assert.equal(summary.evidenceCoverage, 1);
  assert.equal(summary.segmentPredictions.length, 4);
  assert.ok(summary.top[0].variance > 0);
  assert.ok(summary.distributionChange > 0);
});

test("track contract preserves calibrated scores and exposes review evidence", () => {
  const contract = buildTrackPredictionContract({
    prediction: {
      top: [{ label: "ロック", score: 74 }, { label: "メタル", score: 21 }],
      confidence: 68,
      evidenceCoverage: 1,
      needsReview: false,
    },
    sampledRanges: [{ startSeconds: 0, endSeconds: 30 }],
    segmentSummary: {
      available: true,
      voteShare: .5,
      macroVoteShare: 1,
      evidenceCoverage: 1,
      segmentPredictions: [{ range: { startSeconds: 0, endSeconds: 30 } }],
    },
    fallbackModelVersion: "v96",
  });
  assert.equal(contract.prediction.top[0].score, 74);
  assert.equal(contract.prediction.classificationScope, "track");
  assert.equal(contract.prediction.modelVersion, "v96");
  assert.equal(contract.prediction.needsReview, true);
  assert.equal(contract.evidenceCoverage, 1);
});

test("reliable external track prediction is promoted without losing the local audit", () => {
  const prediction = {
    source: "local",
    method: "local-head",
    top: [{ label: "チップチューン", score: 100 }],
    macro: [{ label: "electronic", score: 100 }],
    inferredGenre: "チップチューン",
    confidence: 100,
    needsReview: false,
    unknownSourceConsensus: {
      source: "embedding",
      method: "source-heldout-model",
      top: [{ label: "ロック", score: 59.8 }, { label: "J-POP", score: 14.6 }],
      macro: [{ label: "rock", score: 78 }],
      inferredGenre: "ロック",
      confidence: 70,
      needsReview: false,
      selectiveCertainty: .5568,
      selectiveRisk: { threshold: .0661, estimatedAccuracy: 70.2 },
      margin: 45.2,
      segmentAnalysis: { stability: .9769, agreement: 1 },
      modelVersion: "source-heldout-v1",
      evidenceCoverage: 1,
    },
  };
  const evidence = reliableExternalTrackEvidence(prediction);
  const promoted = promoteReliableExternalTrackPrediction(prediction);
  assert.equal(evidence.applies, true);
  assert.equal(promoted.top[0].label, "ロック");
  assert.equal(promoted.trackLocalPrediction.top[0].label, "チップチューン");
  assert.equal(promoted.reliableExternalPromotion.applies, true);
  assert.equal(promoted.modelVersion, "source-heldout-v1");
});

test("external promotion rejects uncertain or unstable candidates", () => {
  const base = {
    top: [{ label: "ファンク", score: 80 }],
    unknownSourceConsensus: {
      top: [{ label: "ロック", score: 60 }],
      needsReview: false,
      selectiveCertainty: .5,
      selectiveRisk: { threshold: .1 },
      margin: 30,
      segmentAnalysis: { stability: .95, agreement: 1 },
    },
  };
  for (const externalPatch of [
    { needsReview: true },
    { margin: 19.9 },
    { segmentAnalysis: { stability: .89, agreement: 1 } },
    { segmentAnalysis: { stability: .95, agreement: .89 } },
    { selectiveRisk: {} },
  ]) {
    const prediction = {
      ...base,
      unknownSourceConsensus: { ...base.unknownSourceConsensus, ...externalPatch },
    };
    assert.equal(reliableExternalTrackEvidence(prediction).applies, false);
    assert.equal(promoteReliableExternalTrackPrediction(prediction), prediction);
  }
});

test("dense non-Japanese rap consensus overrides a conflicted local rock head", () => {
  const prediction = {
    source: "local", method: "local-head",
    top: [{ label: "ロック", score: 100 }, { label: "パンク", score: 69 }],
    macro: [{ label: "rock", score: 100 }, { label: "black_music", score: 15 }],
    inferredGenre: "ロック", confidence: 100, needsReview: true,
    unknownSourceConsensus: {
      source: "embedding", method: "source-heldout-model",
      top: [
        { label: "トラップ", score: 27.7 },
        { label: "ヒップホップ", score: 16.4 },
        { label: "ダブステップ", score: 14.5 },
      ],
      macro: [
        { label: "electronic", score: 83 },
        { label: "black_music", score: 11 },
      ],
      margin: 11.3, evidenceCoverage: 1,
      segmentAnalysis: {
        topLabels: ["トラップ", "トラップ", "テクノ", "トラップ"],
        stability: .767,
      },
      modelVersion: "unknown65-exhibition-safe-v1",
    },
  };
  const vocalEvidence = {
    available: true, sampleCount: 15, transcriptionReliability: 1,
    detectedLanguage: "en", japaneseVocalLikelihood: 0,
    vocalPresence: 1, speechRapLikelihood: .7729,
    melodicVocalLikelihood: .2945, transcriptTokenRate: 4.0547,
  };
  const evidence = reliableExternalRapTrackEvidence(prediction, { vocalEvidence });
  const promoted = promoteReliableExternalTrackPrediction(prediction, { vocalEvidence });
  assert.equal(evidence.applies, true);
  assert.equal(evidence.target, "ヒップホップ");
  assert.equal(promoted.top[0].label, "ヒップホップ");
  assert.equal(promoted.macro[0].label, "black_music");
  assert.equal(promoted.trackLocalPrediction.top[0].label, "ロック");
  assert.equal(promoted.reliableExternalRapPromotion.rapSegmentCount, 3);
  assert.equal(promoted.needsReview, true);
});

test("rap gate rejects Japanese, melodic, and weak cross-segment evidence", () => {
  const base = {
    top: [{ label: "ロック", score: 90 }],
    unknownSourceConsensus: {
      top: [{ label: "トラップ", score: 28 }, { label: "ヒップホップ", score: 17 }],
      margin: 11, evidenceCoverage: 1,
      segmentAnalysis: {
        topLabels: ["トラップ", "トラップ", "テクノ", "トラップ"],
        stability: .8,
      },
    },
  };
  const vocal = {
    available: true, sampleCount: 12, transcriptionReliability: 1,
    detectedLanguage: "en", japaneseVocalLikelihood: 0,
    vocalPresence: 1, speechRapLikelihood: .8,
    melodicVocalLikelihood: .2, transcriptTokenRate: 3,
  };
  for (const [predictionPatch, vocalPatch] of [
    [{}, { detectedLanguage: "ja", japaneseVocalLikelihood: .9 }],
    [{}, { melodicVocalLikelihood: .7 }],
    [{ unknownSourceConsensus: { ...base.unknownSourceConsensus, segmentAnalysis: {
      topLabels: ["トラップ", "ロック", "テクノ", "パンク"], stability: .8,
    } } }, {}],
  ]) {
    const prediction = { ...base, ...predictionPatch };
    assert.equal(reliableExternalRapTrackEvidence(prediction, {
      vocalEvidence: { ...vocal, ...vocalPatch },
    }).applies, false);
  }
});

test("later ranges can change track classification without changing requested-window PCM", () => {
  const requestedPrediction = {
    top: [{ label: "ロック", score: 70 }, { label: "ドローン", score: 20 }],
    macro: [{ label: "guitar_pop", score: 80 }],
  };
  const record = (startSeconds, prediction) => ({
    range: { startSeconds, endSeconds: startSeconds + 30 },
    prediction,
  });
  const rockSummary = summarizeTrackSegmentPredictions([
    record(60, requestedPrediction),
    record(120, requestedPrediction),
    record(300, requestedPrediction),
    record(480, requestedPrediction),
  ], 4);
  const dronePrediction = {
    top: [{ label: "ドローン", score: 82 }, { label: "ロック", score: 9 }],
    macro: [{ label: "acoustic_structural", score: 88 }],
  };
  const changedSummary = summarizeTrackSegmentPredictions([
    record(60, requestedPrediction),
    record(120, dronePrediction),
    record(300, dronePrediction),
    record(480, dronePrediction),
  ], 4);
  assert.equal(rockSummary.leader, "ロック");
  assert.equal(changedSummary.leader, "ドローン");

  const requestedPcm = {
    detail: {
      pcmSketch: "AAECAwQFBgc=",
      pcmSketchEncoding: "mulaw8-base64",
      pcmSketchSampleRate: 11025,
      pcmSketchDuration: 24,
      pcmSketchFrameCount: 264600,
    },
  };
  const first = preserveRequestedPcmSketch({
    energy: .6,
    detail: { waveform: [0, .2], pcmSketch: "track-a" },
  }, requestedPcm);
  const second = preserveRequestedPcmSketch({
    energy: .2,
    detail: { waveform: [.8, -.5], pcmSketch: "track-b" },
  }, requestedPcm);
  assert.notEqual(first.energy, second.energy);
  assert.notDeepEqual(first.detail.waveform, second.detail.waveform);
  for (const field of [
    "pcmSketch",
    "pcmSketchEncoding",
    "pcmSketchSampleRate",
    "pcmSketchDuration",
    "pcmSketchFrameCount",
  ]) {
    assert.equal(first.detail[field], second.detail[field]);
  }
});
