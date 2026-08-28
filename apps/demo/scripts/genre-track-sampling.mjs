const DEFAULT_WINDOW_SECONDS = 30;
const DEFAULT_SEGMENT_COUNT = 4;
const REVERSIBLE_PCM_FIELDS = [
  "pcmSketch",
  "pcmSketchEncoding",
  "pcmSketchSampleRate",
  "pcmSketchDuration",
  "pcmSketchFrameCount",
];

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function roundSeconds(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function median(values = []) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function itemLabel(item = {}) {
  return item.label || item.name || item.macro || "";
}

export function planTrackSampleRanges({
  durationSeconds,
  requestedStartSeconds = 0,
  windowSeconds = DEFAULT_WINDOW_SECONDS,
  count = DEFAULT_SEGMENT_COUNT,
} = {}) {
  const duration = Math.max(0, Number(durationSeconds) || 0);
  const segmentCount = Math.max(1, Math.floor(Number(count) || DEFAULT_SEGMENT_COUNT));
  if (!duration) return [];

  const requested = clamp(requestedStartSeconds, 0, Math.max(0, duration - 1));
  const segmentDuration = Math.min(
    Math.max(1, Number(windowSeconds) || DEFAULT_WINDOW_SECONDS),
    duration / segmentCount,
  );
  const maximumStart = Math.max(0, duration - segmentDuration);

  if (duration <= segmentDuration * segmentCount + 0.001) {
    const ranges = Array.from({ length: segmentCount }, (_, index) => ({
      role: "coverage",
      startSeconds: index * segmentDuration,
    }));
    const requestedIndex = Math.min(
      segmentCount - 1,
      Math.floor(requested / Math.max(segmentDuration, 0.001)),
    );
    ranges[requestedIndex].role = "requested";
    ranges.unshift(...ranges.splice(requestedIndex, 1));
    return ranges.map((range, index) => ({
      index,
      role: range.role,
      startSeconds: roundSeconds(range.startSeconds),
      endSeconds: roundSeconds(Math.min(duration, range.startSeconds + segmentDuration)),
      durationSeconds: roundSeconds(segmentDuration),
    }));
  }

  const proposals = [
    { role: "requested", startSeconds: clamp(requested, 0, maximumStart) },
    { role: "track-20", startSeconds: clamp(duration * 0.2 - segmentDuration / 2, 0, maximumStart) },
    { role: "track-50", startSeconds: clamp(duration * 0.5 - segmentDuration / 2, 0, maximumStart) },
    { role: "track-80", startSeconds: clamp(duration * 0.8 - segmentDuration / 2, 0, maximumStart) },
  ].slice(0, segmentCount);
  const gridCount = Math.max(segmentCount * 3, 7);
  const grid = Array.from({ length: gridCount }, (_, index) => (
    maximumStart * index / Math.max(1, gridCount - 1)
  ));
  const selected = [];
  const minimumGap = Math.min(segmentDuration * 0.6, maximumStart / Math.max(1, segmentCount - 1) * 0.7);

  for (const proposal of proposals) {
    let start = proposal.startSeconds;
    let role = proposal.role;
    if (selected.some(item => Math.abs(item.startSeconds - start) < minimumGap)) {
      const preferredStart = start;
      start = grid
        .filter(candidate => selected.every(item => Math.abs(item.startSeconds - candidate) >= minimumGap))
        .sort((a, b) => {
          const preferredDistance = Math.abs(a - preferredStart) - Math.abs(b - preferredStart);
          if (preferredDistance) return preferredDistance;
          const aDistance = Math.min(...selected.map(item => Math.abs(item.startSeconds - a)));
          const bDistance = Math.min(...selected.map(item => Math.abs(item.startSeconds - b)));
          return bDistance - aDistance || a - b;
        })[0];
      role = "coverage";
    }
    if (!Number.isFinite(start)) continue;
    selected.push({ role, startSeconds: start });
  }

  for (const startSeconds of grid) {
    if (selected.length >= segmentCount) break;
    if (selected.every(item => Math.abs(item.startSeconds - startSeconds) >= minimumGap)) {
      selected.push({ role: "coverage", startSeconds });
    }
  }

  return selected.slice(0, segmentCount).map((range, index) => ({
    index,
    role: range.role,
    startSeconds: roundSeconds(range.startSeconds),
    endSeconds: roundSeconds(Math.min(duration, range.startSeconds + segmentDuration)),
    durationSeconds: roundSeconds(segmentDuration),
  }));
}

export function summarizeTrackSegmentPredictions(records = [], expectedCount = DEFAULT_SEGMENT_COUNT) {
  const usable = records.filter(record => record?.prediction?.top?.length && !record.prediction.error);
  const coverage = Math.min(1, usable.length / Math.max(1, Number(expectedCount) || DEFAULT_SEGMENT_COUNT));
  if (!usable.length) {
    return {
      available: false,
      count: 0,
      evidenceCoverage: 0,
      segmentPredictions: [],
    };
  }

  const labels = [...new Set(usable.flatMap(record => record.prediction.top.map(itemLabel)).filter(Boolean))];
  const macros = [...new Set(usable.flatMap(record => (record.prediction.macro || []).map(itemLabel)).filter(Boolean))];
  const labelRows = usable.map(record => new Map(
    record.prediction.top.map(item => [itemLabel(item), Math.max(0, Number(item.score) || 0)]),
  ));
  const labelLeaders = usable.map(record => itemLabel(record.prediction.top[0]));
  const macroLeaders = usable.map(record => itemLabel(record.prediction.macro?.[0]));
  const voteCount = values => values.reduce((counts, value) => {
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
    return counts;
  }, new Map());
  const labelVotes = voteCount(labelLeaders);
  const macroVotes = voteCount(macroLeaders);

  const top = labels.map(label => {
    const scores = labelRows.map(row => row.get(label) || 0);
    const center = median(scores);
    const variance = scores.reduce((sum, score) => sum + (score - center) ** 2, 0) / scores.length;
    return {
      label,
      name: label,
      score: Math.round(center * 10) / 10,
      variance: Math.round(variance * 100) / 100,
      votes: labelVotes.get(label) || 0,
    };
  }).sort((a, b) => b.score - a.score || b.votes - a.votes || a.label.localeCompare(b.label)).slice(0, 5);

  const rankedLabelVotes = [...labelVotes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const rankedMacroVotes = [...macroVotes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const leader = rankedLabelVotes[0]?.[0] || top[0]?.label || "";
  const votes = Number(rankedLabelVotes[0]?.[1] || 0);
  const macroLeader = rankedMacroVotes[0]?.[0] || "";
  const macroVoteCount = Number(rankedMacroVotes[0]?.[1] || 0);
  const margins = usable.map(record => Math.max(
    0,
    (Number(record.prediction.top[0]?.score) || 0) - (Number(record.prediction.top[1]?.score) || 0),
  ));
  const chronological = [...usable].sort((a, b) => (
    Number(a.range?.startSeconds || 0) - Number(b.range?.startSeconds || 0)
  ));
  const changes = chronological.slice(1).map((record, index) => {
    const previous = new Map(chronological[index].prediction.top.map(item => [itemLabel(item), Number(item.score) || 0]));
    const current = new Map(record.prediction.top.map(item => [itemLabel(item), Number(item.score) || 0]));
    return labels.reduce((sum, label) => sum + Math.abs((current.get(label) || 0) - (previous.get(label) || 0)), 0) / 200;
  });
  const voteShare = votes / usable.length;
  const macroVoteShare = macroVoteCount / usable.length;
  const averageMargin = margins.reduce((sum, value) => sum + value, 0) / margins.length;
  const distributionChange = changes.length
    ? changes.reduce((sum, value) => sum + value, 0) / changes.length
    : 0;
  const reliable = coverage === 1 && voteShare >= 0.75 && macroVoteShare >= 0.75 && averageMargin >= 8;

  return {
    available: usable.length >= 2,
    count: usable.length,
    expectedCount,
    leader,
    leaders: labelLeaders,
    votes,
    voteShare: Math.round(voteShare * 1000) / 1000,
    unanimous: votes === usable.length,
    averageMargin: Math.round(averageMargin * 10) / 10,
    macroLeader,
    macroVotes: macroVoteCount,
    macroVoteShare: Math.round(macroVoteShare * 1000) / 1000,
    distributionChange: Math.round(distributionChange * 1000) / 1000,
    evidenceCoverage: Math.round(coverage * 1000) / 1000,
    reliable,
    top,
    segmentPredictions: usable.map(record => ({
      range: record.range || null,
      top: record.prediction.top.slice(0, 5),
      macro: (record.prediction.macro || []).slice(0, 4),
      confidence: Number(record.prediction.confidence || record.prediction.top[0]?.score || 0),
      needsReview: Boolean(record.prediction.needsReview),
    })),
  };
}

export function buildTrackPredictionContract({
  prediction,
  sampledRanges = [],
  segmentSummary = {},
  fallbackModelVersion = "",
} = {}) {
  if (!prediction) return null;
  const segmentConflict = Boolean(segmentSummary.available) && (
    Number(segmentSummary.voteShare || 0) < .75
    || Number(segmentSummary.macroVoteShare || 0) < .75
  );
  const predictionCoverage = Number(prediction.evidenceCoverage ?? 1);
  const segmentCoverage = Number(segmentSummary.evidenceCoverage ?? 0);
  const evidenceCoverage = Math.round(Math.min(predictionCoverage, segmentCoverage) * 1000) / 1000;
  const segmentAgreement = {
    available: Boolean(segmentSummary.available),
    leader: segmentSummary.leader || "",
    voteShare: Number(segmentSummary.voteShare || 0),
    macroLeader: segmentSummary.macroLeader || "",
    macroVoteShare: Number(segmentSummary.macroVoteShare || 0),
    averageMargin: Number(segmentSummary.averageMargin || 0),
    distributionChange: Number(segmentSummary.distributionChange || 0),
    reliable: Boolean(segmentSummary.reliable),
  };
  return {
    prediction: {
      ...prediction,
      classificationScope: "track",
      sampledRanges,
      segmentPredictions: segmentSummary.segmentPredictions || [],
      segmentAgreement,
      evidenceCoverage,
      modelVersion: prediction.modelVersion || fallbackModelVersion,
      needsReview: Boolean(prediction.needsReview || segmentConflict || evidenceCoverage < 1),
    },
    segmentAgreement,
    evidenceCoverage,
  };
}

export function reliableExternalTrackEvidence(prediction = {}, options = {}) {
  const external = prediction?.unknownSourceConsensus || {};
  const certainty = Number(external.selectiveCertainty || 0);
  const threshold = Number(external.selectiveRisk?.threshold);
  const stability = Number(external.segmentAnalysis?.stability || 0);
  const agreement = Number(external.segmentAnalysis?.agreement || 0);
  const margin = Number(external.margin || 0);
  const score = Number(external.top?.[0]?.score || 0);
  const minimumStability = Number(options.minimumStability ?? .9);
  const minimumAgreement = Number(options.minimumAgreement ?? .9);
  const minimumMargin = Number(options.minimumMargin ?? 20);
  const minimumScore = Number(options.minimumScore ?? 35);
  const applies = Boolean(
    external.top?.length
    && external.needsReview !== true
    && Number.isFinite(threshold)
    && certainty >= threshold
    && stability >= minimumStability
    && agreement >= minimumAgreement
    && margin >= minimumMargin
    && score >= minimumScore
  );
  return {
    applies,
    target: itemLabel(external.top?.[0]),
    certainty: roundSeconds(certainty),
    threshold: Number.isFinite(threshold) ? roundSeconds(threshold) : null,
    stability: roundSeconds(stability),
    agreement: roundSeconds(agreement),
    margin: roundSeconds(margin),
    score: roundSeconds(score),
  };
}

export function reliableExternalRapTrackEvidence(prediction = {}, options = {}) {
  const external = prediction?.unknownSourceConsensus || {};
  const vocal = options.vocalEvidence || {};
  const top = Array.isArray(external.top) ? external.top : [];
  const score = label => Number(top.find(item => itemLabel(item) === label)?.score || 0);
  const hiphopScore = score("ヒップホップ");
  const trapScore = score("トラップ");
  const rapScore = hiphopScore + trapScore;
  const segmentLabels = Array.isArray(external.segmentAnalysis?.topLabels)
    ? external.segmentAnalysis.topLabels
    : [];
  const rapSegmentCount = segmentLabels.filter(label => (
    label === "ヒップホップ" || label === "トラップ"
  )).length;
  const detectedLanguage = String(vocal.detectedLanguage || "").toLowerCase();
  const applies = Boolean(
    top.length
    && hiphopScore > 0 && trapScore > 0 && rapScore >= 35
    && Number(external.margin || 0) >= 8
    && Number(external.evidenceCoverage ?? 1) >= 1
    && Number(external.segmentAnalysis?.stability || 0) >= .65
    && segmentLabels.length >= 4 && rapSegmentCount >= 3
    && vocal.available === true
    && Number(vocal.sampleCount || 0) >= 8
    && Number(vocal.transcriptionReliability || 0) >= .8
    && detectedLanguage && detectedLanguage !== "ja"
    && Number(vocal.japaneseVocalLikelihood || 0) <= .1
    && Number(vocal.vocalPresence || 0) >= .8
    && Number(vocal.speechRapLikelihood || 0) >= .65
    && Number(vocal.melodicVocalLikelihood || 0) <= .45
    && Number(vocal.transcriptTokenRate || 0) >= 2
  );
  const preferBroadHipHop = applies
    && hiphopScore >= trapScore * .5
    && Number(vocal.speechRapLikelihood || 0) >= .72;
  return {
    applies,
    target: preferBroadHipHop ? "ヒップホップ" : itemLabel(top[0]),
    hiphopScore: roundSeconds(hiphopScore),
    trapScore: roundSeconds(trapScore),
    rapScore: roundSeconds(rapScore),
    rapSegmentCount,
    segmentCount: segmentLabels.length,
    stability: roundSeconds(external.segmentAnalysis?.stability || 0),
    detectedLanguage,
    speechRapLikelihood: roundSeconds(vocal.speechRapLikelihood || 0),
    melodicVocalLikelihood: roundSeconds(vocal.melodicVocalLikelihood || 0),
    transcriptTokenRate: roundSeconds(vocal.transcriptTokenRate || 0),
  };
}

function promoteExternalRapTrackPrediction(prediction, evidence) {
  const external = prediction.unknownSourceConsensus;
  const top = (external.top || []).map(item => ({ ...item }));
  if (evidence.target === "ヒップホップ" && itemLabel(top[0]) === "トラップ") {
    const hiphopIndex = top.findIndex(item => itemLabel(item) === "ヒップホップ");
    if (hiphopIndex >= 0) {
      const firstScore = Number(top[0].score || 0);
      top[0].score = Number(top[hiphopIndex].score || 0);
      top[hiphopIndex].score = firstScore;
      top.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    }
  }
  const macro = (external.macro || prediction.macro || []).map(item => ({ ...item }));
  const blackIndex = macro.findIndex(item => itemLabel(item) === "black_music");
  if (blackIndex > 0) {
    const firstScore = Number(macro[0].score || 0);
    macro[0].score = Number(macro[blackIndex].score || 0);
    macro[blackIndex].score = firstScore;
    macro.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  }
  return {
    ...prediction,
    source: external.source || prediction.source,
    method: `${external.method || "unknown-source-consensus"}+speech-rap-track-gate`,
    top,
    macro,
    inferredGenre: evidence.target,
    confidence: Number(top[0]?.score || external.confidence || 0),
    needsReview: true,
    modelVersion: external.modelVersion || prediction.modelVersion,
    evidenceCoverage: Number(external.evidenceCoverage ?? prediction.evidenceCoverage ?? 0),
    trackLocalPrediction: {
      source: prediction.source || "",
      method: prediction.method || "",
      top: (prediction.top || []).slice(0, 5),
      macro: (prediction.macro || []).slice(0, 4),
      inferredGenre: prediction.inferredGenre || itemLabel(prediction.top?.[0]),
      confidence: Number(prediction.confidence || 0),
      needsReview: Boolean(prediction.needsReview),
    },
    reliableExternalRapPromotion: evidence,
  };
}

export function promoteReliableExternalTrackPrediction(prediction = {}, options = {}) {
  const evidence = reliableExternalTrackEvidence(prediction, options);
  if (!evidence.applies) {
    const rapEvidence = reliableExternalRapTrackEvidence(prediction, options);
    return rapEvidence.applies
      ? promoteExternalRapTrackPrediction(prediction, rapEvidence)
      : prediction;
  }
  const external = prediction.unknownSourceConsensus;
  const localAudit = {
    source: prediction.source || "",
    method: prediction.method || "",
    top: (prediction.top || []).slice(0, 5),
    macro: (prediction.macro || []).slice(0, 4),
    inferredGenre: prediction.inferredGenre || itemLabel(prediction.top?.[0]),
    confidence: Number(prediction.confidence || 0),
    needsReview: Boolean(prediction.needsReview),
  };
  return {
    ...prediction,
    source: external.source || prediction.source,
    method: `${external.method || "unknown-source-consensus"}+reliable-track-gate`,
    top: external.top,
    macro: external.macro || prediction.macro,
    popStyle: external.popStyle || prediction.popStyle || [],
    inferredGenre: external.inferredGenre || itemLabel(external.top[0]),
    confidence: Number(external.confidence || external.top[0]?.score || 0),
    needsReview: false,
    modelVersion: external.modelVersion || prediction.modelVersion,
    evidenceCoverage: Number(external.evidenceCoverage ?? prediction.evidenceCoverage ?? 0),
    trackLocalPrediction: localAudit,
    reliableExternalPromotion: evidence,
  };
}

export function preserveRequestedPcmSketch(trackFeatures = {}, requestedFeatures = {}) {
  const requestedDetail = requestedFeatures?.detail || requestedFeatures || {};
  const protectedPcm = Object.fromEntries(
    REVERSIBLE_PCM_FIELDS
      .filter(field => Object.hasOwn(requestedDetail, field))
      .map(field => [field, requestedDetail[field]]),
  );
  return {
    ...trackFeatures,
    detail: {
      ...(trackFeatures?.detail || {}),
      ...protectedPcm,
    },
  };
}
