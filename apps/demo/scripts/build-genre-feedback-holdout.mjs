import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const MODEL_PATH = path.join(ROOT, "genre-training", "genre-model.json");
const OUTPUT_PATH = path.join(ROOT, "deploy", "aun-graphic-sound-form", "genre-feedback-holdout.json");

const TARGETS = [
  "アンビエント", "ドローン", "ノイズミュージック", "電子音楽", "テクノ", "ハウス", "ディープ・ハウス", "トランス",
  "ドラムンベース", "ダブステップ", "チップチューン", "ヒップホップ", "トラップ", "レゲエ", "ダブ", "ブルース",
  "ロック", "パンク", "ハードコア", "メタル", "ジャズ", "ファンク", "ソウルミュージック", "ディスコ",
  "シティ・ポップ", "J-POP", "アニメソング", "クラシック音楽", "オペラ", "フォーク", "ラテン", "ワールドミュージック"
];

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const round4 = value => Math.round(clamp01(value) * 10000) / 10000;
const sha = value => crypto.createHash("sha256").update(String(value)).digest("hex");

function signatureFromExample(example, featureKeys) {
  const values = Object.fromEntries(featureKeys.map((key, index) => [key, Number(example.values?.[index]) || 0]));
  return [
    clamp01((values.tempo - 50) / 170),
    values.energy, values.bass,
    values.lowBandRatio, values.midBandRatio, values.highBandRatio,
    values.rhythm, values.onset, values.brightness,
    clamp01(values.zcr / .45), values.distortion,
    values.beatGridStrength,
    values.breakbeatDensity,
    clamp01(values.acousticness * .46 + (1 - values.distortion) * .34 + values.chromaEntropy * .2),
    clamp01(1 - values.onsetDensity * .72),
    clamp01(values.tempoStability * .58 + (1 - values.rmsContrast) * .42),
    values.syncopation,
    values.vocalPresence,
    clamp01(values.vocalPresence * (1 - values.onsetDensity * .45)),
    clamp01(values.vocalPresence * values.onsetDensity * .45)
  ].map(round4);
}

function targetExamples(target, examples) {
  if (target === "シティ・ポップ") {
    return examples.filter(example => example.genre === "J-POP" && example.styleHint === "city_pop");
  }
  return examples.filter(example => example.genre === target);
}

function expectedLabel(target) {
  return target === "シティ・ポップ" ? "J-POP" : target;
}

function selectDiverseExamples(examples, count = 3) {
  const ordered = [...examples].sort((left, right) => {
    const leftKey = sha(`${left.datasetName}:${left.trackId}:${left.genre}:${left.styleHint}`).slice(0, 16);
    const rightKey = sha(`${right.datasetName}:${right.trackId}:${right.genre}:${right.styleHint}`).slice(0, 16);
    return leftKey.localeCompare(rightKey);
  });
  const selected = [];
  const usedSources = new Set();
  for (const example of ordered) {
    const source = String(example.datasetName || example.sourceType || "unknown");
    if (usedSources.has(source)) continue;
    selected.push(example);
    usedSources.add(source);
    if (selected.length === count) return selected;
  }
  for (const example of ordered) {
    if (selected.includes(example)) continue;
    selected.push(example);
    if (selected.length === count) return selected;
  }
  return selected;
}

const model = JSON.parse(fs.readFileSync(MODEL_PATH, "utf8"));
const records = [];
for (const target of TARGETS) {
  const selected = selectDiverseExamples(targetExamples(target, model.examples || []));
  if (selected.length < 3) throw new Error(`${target}: fixed holdout requires three examples, found ${selected.length}`);
  selected.forEach(example => {
    const signature = signatureFromExample(example, model.featureKeys || []);
    const expected = expectedLabel(target);
    records.push({
      id: `holdout-${sha(`${expected}:${signature.join(",")}`).slice(0, 16)}`,
      expected,
      baselinePrediction: expected,
      baselineNeedsReview: false,
      signature
    });
  });
}

const payload = {
  version: "genre-feedback-holdout-v1",
  sourceModelVersion: model.version || "unknown",
  featureSignatureVersion: "adaptive-boundary-v1",
  policy: {
    recordsPerTarget: 3,
    targetCount: TARGETS.length,
    containsSourceMetadata: false,
    maximumTop1RegressionPoints: 1
  },
  records
};

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
process.stdout.write(`${OUTPUT_PATH}: ${records.length} anonymous records\n`);
