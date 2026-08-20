import assert from "node:assert/strict";
import test from "node:test";

import { shouldRunUnknownSourceConsensus } from "./genre-unknown-consensus-policy.mjs";

const confidentBlues = {
  top: [{ label: "ブルース", score: 100 }, { label: "ファンク", score: 32.5 }],
  macro: [{ label: "black_music", score: 100 }, { label: "rock", score: 23.2 }],
  needsReview: false,
  segmentConsensus: {
    available: true,
    leader: "ブルース",
    voteShare: 1,
    macroVoteShare: 1
  }
};

const melodicEnglishVocal = {
  detectedLanguage: "en",
  vocalPresence: 1,
  melodicVocalLikelihood: .83,
  speechRapLikelihood: .02
};

const bassLedGroove = {
  tempo: 76,
  energy: .43,
  bass: .78,
  lowBandRatio: .6,
  midBandRatio: .38,
  highBandRatio: .014,
  rhythm: .24,
  onset: .17
};

test("confident melodic Blues/Rock conflicts request independent consensus", () => {
  assert.equal(shouldRunUnknownSourceConsensus(confidentBlues, melodicEnglishVocal, bassLedGroove), true);
});

test("ordinary confident Blues does not pay the independent inference cost", () => {
  const bluesWithoutRockSupport = {
    ...confidentBlues,
    macro: [{ label: "black_music", score: 100 }, { label: "rock", score: 8 }]
  };
  assert.equal(shouldRunUnknownSourceConsensus(bluesWithoutRockSupport, melodicEnglishVocal, bassLedGroove), false);
  assert.equal(shouldRunUnknownSourceConsensus(confidentBlues, {
    ...melodicEnglishVocal,
    melodicVocalLikelihood: .45
  }, bassLedGroove), false);
});

test("existing low-margin and segment-conflict triggers remain active", () => {
  assert.equal(shouldRunUnknownSourceConsensus({
    top: [{ label: "ハウス", score: 54 }, { label: "テクノ", score: 45 }],
    macro: [{ label: "electronic", score: 100 }]
  }), true);
  assert.equal(shouldRunUnknownSourceConsensus({
    top: [{ label: "ロック", score: 90 }, { label: "メタル", score: 40 }],
    macro: [{ label: "rock", score: 100 }],
    segmentConsensus: { available: true, leader: "メタル", voteShare: .67, macroVoteShare: 1 }
  }), true);
});
