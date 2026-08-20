function score01(value) {
  const score = Number(value) || 0;
  return score > 1 ? score / 100 : score;
}

function itemLabel(item = {}) {
  return item.label || item.name || item.macro || "";
}

function macroScore(local = {}, target = "") {
  const row = (local.macro || []).find(item => itemLabel(item) === target);
  return score01(row?.score);
}

export function shouldRunUnknownSourceConsensus(local = {}, vocalEvidence = {}, features = {}) {
  if (!local?.top?.length) return true;
  const leader = itemLabel(local.top[0]);
  const margin = (Number(local.top[0]?.score) || 0) - (Number(local.top[1]?.score) || 0);
  const japanese = Number(vocalEvidence.japaneseVocalLikelihood || 0);
  const likelyRap = Number(features.rhythm || 0) >= .72 && Number(features.onset || 0) >= .62;
  const segments = local.segmentConsensus || {};
  const segmentConflict = segments.available && (
    segments.voteShare < 1
    || segments.leader !== leader
    || segments.macroVoteShare < 1
  );
  const melodicBluesRockConflict = leader === "ブルース"
    && macroScore(local, "rock") >= .18
    && String(vocalEvidence.detectedLanguage || "").toLowerCase() === "en"
    && score01(vocalEvidence.vocalPresence) >= .8
    && score01(vocalEvidence.melodicVocalLikelihood) >= .7
    && score01(vocalEvidence.speechRapLikelihood) < .08
    && Number(features.tempo || 0) >= 65 && Number(features.tempo || 0) <= 95
    && Number(features.energy || 0) >= .32 && Number(features.energy || 0) <= .65
    && Number(features.bass || 0) >= .65
    && Number(features.lowBandRatio || 0) >= .45
    && Number(features.midBandRatio || 0) >= .25
    && Number(features.highBandRatio || 0) < .08
    && Number(features.rhythm || 0) >= .12 && Number(features.rhythm || 0) <= .42
    && Number(features.onset || 0) >= .08 && Number(features.onset || 0) <= .3;
  return Boolean(
    local.needsReview
    || margin < 18
    || (local.hierarchyGate?.applied && margin < 30)
    || (japanese >= .35 && leader !== "J-POP" && !likelyRap)
    || segmentConflict
    || melodicBluesRockConflict
  );
}
