import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");

const ROADMAP_PATH = path.join(TRAINING_DIR, "genre-reset-roadmap.json");
const CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
const SOURCE_SEEDS_PATH = path.join(TRAINING_DIR, "source-seeds.json");

const DEFAULT_FORMAL_TARGET = Number(process.env.MMFR_SPRINT_FORMAL_TARGET || 80);
const DEFAULT_CONTRAST_ROWS = Number(process.env.MMFR_SPRINT_CONTRAST_ROWS || 15);
const DEFAULT_HARD_NEGATIVE_ROWS = Number(process.env.MMFR_SPRINT_HARD_NEGATIVE_ROWS || 10);
const MIN_TEST_ROWS = 10;
const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, "");

const SLUGS = new Map([
  ["テクノ", "techno"],
  ["アニメソング", "anime-song"],
  ["J-POP", "j-pop"],
  ["シティ・ポップ", "city-pop"],
  ["ドローン", "drone"],
  ["ダブ", "dub"],
  ["ドラムンベース", "drum-and-bass"],
  ["ハウス", "house"],
  ["ディープ・ハウス", "deep-house"],
  ["トランス", "trance"],
  ["ダブステップ", "dubstep"],
  ["チップチューン", "chiptune"],
  ["ヒップホップ", "hiphop"],
  ["クラシック音楽", "classical-music"]
]);

const MACRO_CONTRASTS = {
  electronic: ["ハウス", "トランス", "ドラムンベース", "ダブステップ", "チップチューン"],
  pop: ["J-POP", "シティ・ポップ", "ロック", "ヒップホップ", "ディスコ"],
  ambient: ["アンビエント", "ノイズミュージック", "クラシック音楽", "チップチューン", "ダブ"],
  black_music: ["レゲエ", "ヒップホップ", "ファンク", "ソウルミュージック", "ダブステップ"],
  classical: ["オペラ", "バロック", "ロマン派", "近現代クラシック", "クラシック音楽"],
  rock: ["ロック", "メタル", "パンク", "ハードコア", "ブルース"],
  jazz: ["ジャズ", "フュージョン", "ビッグバンド", "ブルース", "ファンク"],
  world: ["ワールドミュージック", "ラテン", "フォーク", "サンバ", "タンゴ"]
};

function readJson(pathname, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function slug(value) {
  return SLUGS.get(value) || String(value || "genre")
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "genre";
}

function pct(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1).replace(/\.0$/, "")}%` : "n/a";
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function knownGenres() {
  const seeds = readJson(SOURCE_SEEDS_PATH, {});
  const out = new Set();
  if (Array.isArray(seeds.genres)) {
    for (const item of seeds.genres) if (item.genre) out.add(item.genre);
  }
  for (const genres of Object.values(seeds.macroGenres || {})) {
    for (const genre of genres || []) out.add(genre);
  }
  return out;
}

function commonPredictionLabels(row) {
  return (row.commonPredictions || row.mostCommonPredictions || [])
    .map(item => item.label)
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function chooseTarget(roadmap, requestedGenre) {
  const rows = roadmap.rows || roadmap.priorityRows || [];
  if (requestedGenre) {
    const found = rows.find(row => row.genre === requestedGenre);
    if (!found) throw new Error(`Genre not found in roadmap: ${requestedGenre}`);
    return found;
  }
  return rows.find(row => row.genre === "テクノ")
    || rows.find(row => row.bucket === "data-gap")
    || rows[0];
}

function sprintFor(row, allKnownGenres, externalDataDir) {
  const macroContrast = MACRO_CONTRASTS[row.macroGenre] || [];
  const wrongPredictions = commonPredictionLabels(row);
  const sameMacroContrasts = unique(macroContrast.filter(genre => genre !== row.genre && allKnownGenres.has(genre))).slice(0, 5);
  const hardNegatives = unique(wrongPredictions.filter(genre => genre !== row.genre && !sameMacroContrasts.includes(genre) && allKnownGenres.has(genre))).slice(0, 3);
  const formalFineRows = Number(row.formalFineRows || 0);
  const missingToStableTarget = Math.max(0, DEFAULT_FORMAL_TARGET - formalFineRows);
  const minimumRows = Math.max(Number(row.missingFormalFine || 0), Math.max(0, 50 - formalFineRows));
  const targetRows = Math.max(minimumRows, missingToStableTarget);
  const sprintRows = Math.min(Math.max(targetRows, minimumRows), 80);
  const sprintSlug = `${slug(row.genre)}-${TODAY}`;
  const audioRoot = path.join(externalDataDir, "acquisition-sprints", sprintSlug);
  const manifestPath = path.join(TRAINING_DIR, `${slug(row.genre)}-acquisition-sprint-manifest.json`);
  const planPath = path.join(TRAINING_DIR, `${slug(row.genre)}-acquisition-sprint.json`);
  const mdPath = path.join(TRAINING_DIR, `${slug(row.genre)}-acquisition-sprint.md`);
  const datasetName = `explicit-${slug(row.genre)}-sprint-${TODAY}`;

  const rowsToCollect = [
    {
      genre: row.genre,
      role: "primary",
      rows: sprintRows,
      reason: "Exact formal fine rows for the target label. Use only tracks whose source explicitly labels this genre/style."
    },
    ...sameMacroContrasts.map(genre => ({
      genre,
      role: "same-macro-contrast",
      rows: DEFAULT_CONTRAST_ROWS,
      reason: `Close contrast inside ${row.macroGenre}; prevents the target from absorbing neighboring electronic/pop/acoustic styles.`
    })),
    ...hardNegatives.map(genre => ({
      genre,
      role: "hard-negative",
      rows: DEFAULT_HARD_NEGATIVE_ROWS,
      reason: "Frequent wrong prediction for the target; add clean examples so the classifier learns the boundary."
    }))
  ];

  const commands = [
    `MMFR_CC_DATASET_NAME=${shellQuote(datasetName)} MMFR_CC_LICENSE=${shellQuote("REPLACE_WITH_LICENSE")} MMFR_CC_LICENSE_URL=${shellQuote("REPLACE_WITH_SOURCE_LICENSE_URL")} MMFR_CC_REFERENCE_URL=${shellQuote("REPLACE_WITH_DATASET_OR_COLLECTION_URL")} MMFR_CC_MANIFEST_OUTPUT=${shellQuote(manifestPath)} npm --prefix apps/demo run cc-manifest:from-folder -- ${shellQuote(audioRoot)}`,
    `MMFR_CC_MANIFEST_PATH=${shellQuote(manifestPath)} MMFR_CC_WEAK_ONLY=0 npm --prefix apps/demo run cc-import`,
    "npm --prefix apps/demo run genre-train:formal-cached",
    "npm --prefix apps/demo run genre-goal-report",
    "npm --prefix apps/demo run genre-reset-roadmap",
    `npm --prefix apps/demo run genre-acquisition-sprint -- ${shellQuote(row.genre)}`
  ];

  return {
    generatedAt: new Date().toISOString(),
    objective: "Move from open-ended global tuning to one data-quality sprint with explicit formal audio and contrast rows.",
    target: {
      genre: row.genre,
      macroGenre: row.macroGenre || "",
      bucket: row.bucket,
      formalFineRows,
      testRows: Number(row.testRows || 0),
      fineTop1Accuracy: row.fineTop1Accuracy ?? null,
      fineTop3Accuracy: row.fineTop3Accuracy ?? null,
      styleTop1Accuracy: row.styleTop1Accuracy ?? null,
      commonPredictions: row.commonPredictions || []
    },
    scoreGate: {
      minimumFormalFineRowsAfterImport: DEFAULT_FORMAL_TARGET,
      minimumTestRows: MIN_TEST_ROWS,
      passToNextStage: "Only tune weights after formal rows and test coverage are stable. If Top3 remains low, audit source labels/features before reranking.",
      failFastRules: [
        "Do not promote broad macro labels as exact fine labels.",
        "Do not mix AI-training-prohibited commercial stock music into formal training.",
        "Do not copy source audio into this repository.",
        "If a source uses mixed licenses, generate separate manifests or edit per-track license fields before import."
      ]
    },
    externalAudioRoot: audioRoot,
    expectedFolderLayout: rowsToCollect.map(item => ({
      folder: path.join(audioRoot, item.genre),
      genre: item.genre,
      role: item.role,
      targetRows: item.rows
    })),
    rowsToCollect,
    manifestPath: path.relative(ROOT, manifestPath),
    planPath: path.relative(ROOT, planPath),
    markdownPath: path.relative(ROOT, mdPath),
    commands,
    reviewChecklist: [
      "Folder names must match source-seeds genre labels exactly.",
      "Each accepted track must have explicit genre/style labeling from the dataset, collection page, or metadata.",
      "Prefer full-length or stable 30s+ public research/CC files; avoid previews with unclear licensing.",
      "Reject live sets, DJ mixes, covers, and broad electronic-only labels for exact techno/pop substyle targets.",
      "After import, inspect target confusion before changing model weights."
    ]
  };
}

function renderMarkdown(plan) {
  const lines = [];
  lines.push(`# Acquisition Sprint: ${plan.target.genre}`);
  lines.push("");
  lines.push(`Generated: ${plan.generatedAt}`);
  lines.push("");
  lines.push("## Why This Sprint");
  lines.push("");
  lines.push("このスプリントは、全ジャンル一括の重み調整を止め、1つの失敗タイプだけを潰すためのものです。対象ジャンルの明示ラベル音源と、近いジャンルの対照音源を追加してから、再学習は1回だけ行います。");
  lines.push("");
  lines.push("## Current Target State");
  lines.push("");
  lines.push("| field | value |");
  lines.push("| --- | ---: |");
  lines.push(`| Genre | ${plan.target.genre} |`);
  lines.push(`| Macro | ${plan.target.macroGenre || "n/a"} |`);
  lines.push(`| Bucket | ${plan.target.bucket || "n/a"} |`);
  lines.push(`| Formal fine rows | ${plan.target.formalFineRows} |`);
  lines.push(`| Test rows | ${plan.target.testRows} |`);
  lines.push(`| Fine Top1 | ${pct(plan.target.fineTop1Accuracy)} |`);
  lines.push(`| Fine Top3 | ${pct(plan.target.fineTop3Accuracy)} |`);
  lines.push(`| Style Top1 | ${pct(plan.target.styleTop1Accuracy)} |`);
  lines.push("");
  lines.push("## Collect");
  lines.push("");
  lines.push("| genre | role | target rows | reason |");
  lines.push("| --- | --- | ---: | --- |");
  for (const item of plan.rowsToCollect) {
    lines.push(`| ${item.genre} | ${item.role} | ${item.rows} | ${item.reason} |`);
  }
  lines.push("");
  lines.push("## External Folder Layout");
  lines.push("");
  lines.push(`Audio root: \`${plan.externalAudioRoot}\``);
  lines.push("");
  for (const item of plan.expectedFolderLayout) {
    lines.push(`- \`${item.folder}\` : ${item.targetRows} tracks`);
  }
  lines.push("");
  lines.push("## Commands");
  lines.push("");
  lines.push("外付けドライブへ音源を置いたあと、以下を順番に実行します:");
  lines.push("");
  lines.push("```bash");
  for (const command of plan.commands) lines.push(command);
  lines.push("```");
  lines.push("");
  lines.push("## Score Gate");
  lines.push("");
  lines.push(`- Minimum formal fine rows after import: ${plan.scoreGate.minimumFormalFineRowsAfterImport}`);
  lines.push(`- Minimum test rows: ${plan.scoreGate.minimumTestRows}`);
  lines.push(`- Next step: ${plan.scoreGate.passToNextStage}`);
  lines.push("");
  lines.push("## Review Checklist");
  lines.push("");
  for (const item of plan.reviewChecklist) lines.push(`- ${item}`);
  lines.push("");
  lines.push("## Fail Fast Rules");
  lines.push("");
  for (const item of plan.scoreGate.failFastRules) lines.push(`- ${item}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

const roadmap = readJson(ROADMAP_PATH);
const externalDataDir = readJson(CACHE_PATHS_PATH).externalDataDir
  || "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/external-data";
const requestedGenre = process.argv.slice(2).join(" ").trim();
const target = chooseTarget(roadmap, requestedGenre);
const plan = sprintFor(target, knownGenres(), externalDataDir);

fs.writeFileSync(path.join(ROOT, plan.planPath), JSON.stringify(plan, null, 2));
fs.writeFileSync(path.join(ROOT, plan.markdownPath), renderMarkdown(plan));

console.log(`Wrote ${plan.planPath}`);
console.log(`Wrote ${plan.markdownPath}`);
console.log(`Audio root: ${plan.externalAudioRoot}`);
