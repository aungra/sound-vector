import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const RESULTS_PATH = path.join(TRAINING_DIR, "results.json");
const VERIFIED_PATH = path.join(TRAINING_DIR, "verified-dataset.json");
const FORMAL_MANIFEST_PATH = path.join(TRAINING_DIR, "explicit-cc-formal-source-manifest.json");
const CITYPOP_CANDIDATES_PATH = path.join(TRAINING_DIR, "explicit-citypop-anime-candidates.json");
const OUT_JSON = path.join(TRAINING_DIR, "target-genre-error-audit.json");
const OUT_MD = path.join(TRAINING_DIR, "target-genre-error-audit.md");
const TARGETS = ["テクノ", "ドローン", "ダブ", "シティ・ポップ"];
const STYLE_TARGETS_BY_GENRE = {
  "シティ・ポップ": "city_pop",
  "テクノ": "techno",
  "ドローン": "drone",
  "ダブ": "dub"
};
const CITY_POP_STYLE_HINT = STYLE_TARGETS_BY_GENRE["シティ・ポップ"];

function readJson(target, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(target, "utf8"));
  } catch {
    return fallback;
  }
}

function sourceKey(item = {}) {
  return [
    item.sourceType || "",
    item.sourceUrl || item.filePath || item.previewUrl || item.youtubeUrl || "",
    item.genre || ""
  ].join("|");
}

function candidateKeys(item = {}) {
  return [
    item.trackId,
    item.sourceUrl,
    item.filePath,
    item.referenceUrl,
    item.originalAudioUrl,
    item.candidateAudioUrl
  ].map(value => String(value || "").trim()).filter(Boolean);
}

function mergeMeta(...rows) {
  return rows.reduce((acc, row = {}) => {
    for (const [key, value] of Object.entries(row || {})) {
      if ((acc[key] === undefined || acc[key] === "") && value !== undefined && value !== "") {
        acc[key] = value;
      }
    }
    return acc;
  }, {});
}

function countBy(items, getter) {
  const out = {};
  items.forEach(item => {
    const key = getter(item) || "(empty)";
    out[key] = (out[key] || 0) + 1;
  });
  return Object.entries(out)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function compactRow(row = {}, meta = {}) {
  return {
    genre: row.genre,
    predicted: row.predicted,
    styleHint: row.styleHint,
    predictedStyleName: row.predictedStyleName,
    macroGenre: row.macroGenre,
    predictedMacro: row.predictedMacro,
    exact: Boolean(row.exact),
    top3: Boolean(row.top3),
    macroExact: Boolean(row.macroExact),
    needsReview: Boolean(row.needsReview),
    confidence: row.confidence,
    top: (row.top || []).slice(0, 5),
    style: (row.style || []).slice(0, 4),
    macro: (row.macro || []).slice(0, 4),
    sourceType: row.sourceType || meta.sourceType,
    datasetName: meta.datasetName || "",
    sourceUrl: row.sourceUrl || meta.sourceUrl || meta.filePath || "",
    referenceUrl: row.referenceUrl || meta.referenceUrl || "",
    trackId: meta.trackId || "",
    canonicalArtist: meta.canonicalArtist || meta.artistName || "",
    canonicalTitle: meta.canonicalTitle || meta.trackName || "",
    labelEvidence: meta.labelEvidence || "",
    labelConfidence: meta.labelConfidence || meta.confidence || "",
    reviewStatus: meta.reviewStatus || "",
    reviewNote: meta.reviewNote || ""
  };
}

const results = readJson(RESULTS_PATH, {});
const verified = readJson(VERIFIED_PATH, {});
const formalManifest = readJson(FORMAL_MANIFEST_PATH, { items: [] });
const cityPopCandidates = readJson(CITYPOP_CANDIDATES_PATH, { items: [] });
const resultRows = Array.isArray(results.results) ? results.results : [];
const verifiedItems = Array.isArray(verified.items) ? verified.items : [];
const verifiedByKey = new Map();
verifiedItems.forEach(item => {
  verifiedByKey.set(sourceKey(item), item);
  verifiedByKey.set([item.sourceType || "", item.sourceUrl || item.filePath || "", item.genre || ""].join("|"), item);
});
const sourceMetaByKey = new Map();
[
  ...(Array.isArray(formalManifest) ? formalManifest : formalManifest.items || []),
  ...(Array.isArray(cityPopCandidates) ? cityPopCandidates : cityPopCandidates.items || [])
].forEach(item => {
  candidateKeys(item).forEach(key => sourceMetaByKey.set(key, item));
});

function metaFor(row = {}, fallback = {}) {
  const sourceMeta = candidateKeys({ ...fallback, ...row })
    .map(key => sourceMetaByKey.get(key))
    .find(Boolean) || {};
  return mergeMeta(fallback, sourceMeta);
}

const targetSet = new Set(TARGETS);
const audit = {
  generatedAt: new Date().toISOString(),
  targets: TARGETS,
  sourceResults: path.relative(ROOT, RESULTS_PATH),
  sourceVerified: path.relative(ROOT, VERIFIED_PATH),
  summary: {},
  cityPopLabelQuality: {},
  recommendations: []
};

for (const genre of TARGETS) {
  const isCityPop = genre === "シティ・ポップ";
  const styleHint = STYLE_TARGETS_BY_GENRE[genre] || "";
  const rows = isCityPop
    ? resultRows.filter(row => row.styleTarget === styleHint || row.styleHint === styleHint)
    : resultRows.filter(row => row.genre === genre);
  const styleRows = styleHint
    ? resultRows.filter(row => row.styleTarget === styleHint || row.styleHint === styleHint || (!isCityPop && row.genre === genre))
    : [];
  const falseNegatives = isCityPop
    ? rows.filter(row => !row.styleExact)
    : rows.filter(row => !row.exact);
  const falsePositives = isCityPop
    ? resultRows.filter(row => row.styleTarget !== styleHint && row.styleHint !== styleHint && row.predictedStyle === styleHint)
    : resultRows.filter(row => row.genre !== genre && row.predicted === genre);
  const styleFalseNegatives = styleHint ? styleRows.filter(row => !row.styleExact) : [];
  const styleFalsePositives = styleHint
    ? resultRows.filter(row => row.styleTarget !== styleHint && row.styleHint !== styleHint && row.predictedStyle === styleHint)
    : [];
  const enrichedFalseNegatives = falseNegatives.map(row => compactRow(row, metaFor(row, verifiedByKey.get(sourceKey(row)) || {})));
  const enrichedFalsePositives = falsePositives.map(row => compactRow(row, metaFor(row, verifiedByKey.get(sourceKey(row)) || {})));
  audit.summary[genre] = {
    styleHint,
    total: rows.length,
    exact: isCityPop ? rows.filter(row => row.styleExact).length : rows.filter(row => row.exact).length,
    top3: isCityPop ? rows.filter(row => row.styleTop3).length : rows.filter(row => row.top3).length,
    macroExact: rows.filter(row => row.macroExact).length,
    needsReview: rows.filter(row => row.needsReview).length,
    fineTop1Accuracy: rows.length ? Math.round((isCityPop ? rows.filter(row => row.styleExact).length : rows.filter(row => row.exact).length) / rows.length * 1000) / 10 : null,
    fineTop3Accuracy: rows.length ? Math.round((isCityPop ? rows.filter(row => row.styleTop3).length : rows.filter(row => row.top3).length) / rows.length * 1000) / 10 : null,
    macroTop1Accuracy: rows.length ? Math.round(rows.filter(row => row.macroExact).length / rows.length * 1000) / 10 : null,
    styleTotal: styleRows.length,
    styleTop1Accuracy: styleRows.length ? Math.round(styleRows.filter(row => row.styleExact).length / styleRows.length * 1000) / 10 : null,
    styleTop3Accuracy: styleRows.length ? Math.round(styleRows.filter(row => row.styleTop3).length / styleRows.length * 1000) / 10 : null,
    mostCommonWrongPredictions: countBy(falseNegatives, row => isCityPop ? row.predictedStyleName || row.predictedStyle : row.predicted).slice(0, 12),
    falsePositiveSources: countBy(falsePositives, row => isCityPop ? row.genre : row.genre).slice(0, 12),
    styleWrongPredictions: countBy(styleFalseNegatives, row => row.predictedStyleName || row.predictedStyle).slice(0, 12),
    styleFalsePositiveSources: countBy(styleFalsePositives, row => row.genre).slice(0, 12),
    falseNegatives: enrichedFalseNegatives,
    falsePositives: enrichedFalsePositives.slice(0, 60)
  };
}

const cityRows = verifiedItems.filter(item => item.styleHint === CITY_POP_STYLE_HINT);
const formalCityRows = cityRows.filter(item => ["cc-dataset", "local-audio"].includes(item.sourceType) && item.trainingRole !== "macro-only");
audit.cityPopLabelQuality = {
  verifiedRows: cityRows.length,
  formalRows: formalCityRows.length,
  bySourceType: countBy(cityRows, item => item.sourceType),
  formalEvidence: formalCityRows.map(item => compactRow({ genre: item.genre, styleHint: item.styleHint }, metaFor(item, item))),
  adjacentFormalRows: formalCityRows
    .map(item => metaFor(item, item))
    .filter(item => /adjacent|future funk|retrofuture|synth[- ]?pop|AOR|Kevin MacLeod/i.test(`${item.labelEvidence || ""} ${item.reviewNote || ""} ${item.canonicalArtist || ""} ${item.canonicalTitle || ""}`))
    .map(item => compactRow({ genre: item.genre }, item))
};

if (audit.summary["テクノ"]?.mostCommonWrongPredictions?.some(item => item.label === "J-POP")) {
  audit.recommendations.push("テクノはJ-POP/ハウスへの混同が残る。four-on-floor/kick gridを直接入れる前に、テクノtest誤判定だけで分離度検定する。");
}
if (audit.summary["ドローン"]?.fineTop1Accuracy === 0) {
  audit.recommendations.push("ドローンは現在Top1が0。ambient/classical/blues系との混同を個別に見て、sustain/transient特徴量の局所適用を検討する。");
}
if (Number(audit.summary["ドローン"]?.styleTop1Accuracy || 0) < 50) {
  audit.recommendations.push("ドローンはstyle補助でsustain/transient scarcityをさらに強める。genre本体へ直接入れるよりambient内補助分類で先に分離度を上げる。");
}
if (audit.summary["ダブ"]?.mostCommonWrongPredictions?.some(item => ["ヒップホップ", "ダブステップ"].includes(item.label))) {
  audit.recommendations.push("ダブはヒップホップ/ダブステップと混同。低域だけでなくreverbTail/offbeat/highBand暗さの複合条件をダブ候補内に限定して使う。");
}
if (audit.cityPopLabelQuality.formalRows) {
  audit.recommendations.push("シティ・ポップはgenre正解ではなくcity_pop styleHintとして評価する。RWC由来の代理情報なので、J-POP正解を壊さない補助判定として扱う。");
}

function mdTable(rows, columns) {
  if (!rows.length) return "_none_";
  const header = `| ${columns.join(" | ")} |`;
  const sep = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map(row => `| ${columns.map(col => String(row[col] ?? "").replace(/\|/g, "/").slice(0, 140)).join(" | ")} |`);
  return [header, sep, ...body].join("\n");
}

const md = [
  "# Target Genre Error Audit",
  "",
  `Generated: ${audit.generatedAt}`,
  "",
  "## Summary",
  "",
  mdTable(TARGETS.map(genre => ({
    genre,
    total: audit.summary[genre].total,
    top1: audit.summary[genre].fineTop1Accuracy,
    top3: audit.summary[genre].fineTop3Accuracy,
    styleTop1: audit.summary[genre].styleTop1Accuracy,
    styleTop3: audit.summary[genre].styleTop3Accuracy,
    macro: audit.summary[genre].macroTop1Accuracy,
    needsReview: audit.summary[genre].needsReview
  })), ["genre", "total", "top1", "top3", "styleTop1", "styleTop3", "macro", "needsReview"]),
  "",
  "## Wrong Prediction Patterns",
  "",
  ...TARGETS.flatMap(genre => [
    `### ${genre}`,
    "",
    mdTable(audit.summary[genre].mostCommonWrongPredictions, ["label", "count"]),
    "",
    "Style-layer wrong predictions:",
    "",
    mdTable(audit.summary[genre].styleWrongPredictions, ["label", "count"]),
    "",
    "False positives from:",
    "",
    mdTable(audit.summary[genre].falsePositiveSources, ["label", "count"]),
    ""
  ]),
  "## City Pop Label Quality",
  "",
  `Verified rows: ${audit.cityPopLabelQuality.verifiedRows}`,
  "",
  `Formal rows: ${audit.cityPopLabelQuality.formalRows}`,
  "",
  "Formal evidence:",
  "",
  mdTable(audit.cityPopLabelQuality.formalEvidence.map(row => ({
    sourceType: row.sourceType,
    datasetName: row.datasetName,
    title: `${row.canonicalArtist} - ${row.canonicalTitle}`,
    evidence: row.labelEvidence,
    review: row.reviewStatus
  })), ["sourceType", "datasetName", "title", "evidence", "review"]),
  "",
  "Adjacent formal rows:",
  "",
  mdTable(audit.cityPopLabelQuality.adjacentFormalRows.map(row => ({
    title: `${row.canonicalArtist} - ${row.canonicalTitle}`,
    evidence: row.labelEvidence,
    referenceUrl: row.referenceUrl
  })), ["title", "evidence", "referenceUrl"]),
  "",
  "## Recommendations",
  "",
  ...audit.recommendations.map(item => `- ${item}`),
  ""
].join("\n");

fs.writeFileSync(OUT_JSON, JSON.stringify(audit, null, 2));
fs.writeFileSync(OUT_MD, md);
console.log(JSON.stringify({
  wrote: [path.relative(ROOT, OUT_JSON), path.relative(ROOT, OUT_MD)],
  targets: audit.summary,
  cityPopLabelQuality: audit.cityPopLabelQuality,
  recommendations: audit.recommendations
}, null, 2));
