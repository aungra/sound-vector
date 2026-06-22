import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
const CANDIDATES_PATH = path.join(TRAINING_DIR, "wikimedia-commons-audio-candidates.json");
const REVIEW_TSV_PATH = path.join(TRAINING_DIR, "wikimedia-commons-review-queue.tsv");
const MANIFEST_PATH = path.join(TRAINING_DIR, "wikimedia-commons-cc-source-manifest.json");
const REPORT_PATH = path.join(TRAINING_DIR, "wikimedia-commons-manifest-report.json");

const LIMIT_PER_GENRE = Math.max(1, Number(process.env.MMFR_WIKI_MANIFEST_LIMIT_PER_GENRE || 50));
const MIN_SCORE = Math.max(0, Math.min(100, Number(process.env.MMFR_WIKI_MANIFEST_MIN_SCORE || 50)));
const DOWNLOAD_AUDIO = process.env.MMFR_WIKI_DOWNLOAD_AUDIO === "1";
const ACCEPT_UNREVIEWED = process.env.MMFR_WIKI_ACCEPT_UNREVIEWED === "1";
const REQUEST_TIMEOUT_MS = Math.max(5000, Number(process.env.MMFR_WIKI_DOWNLOAD_TIMEOUT_MS || 120000));

const SUSPICIOUS = [
  [/speech|spoken|interview|podcast|lecture|talk|conversation|inleiding|introduction|introductie/i, "spoken-or-intro"],
  [/sound effect|effect|ringtone|sample pack|loop pack/i, "non-song-audio"],
  [/karaoke|cover|reaction|tutorial|lesson/i, "derivative-or-non-song"],
  [/\.(mid|midi)$/i, "midi-file"]
];
const LICENSE_BONUS = /^(CC0|CC-BY|CC-BY-SA|Public Domain)$/i;

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function slug(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "audio";
}

function cell(value) {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

function parseTsvLine(line) {
  const out = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const ch = line[index];
    const next = line[index + 1];
    if (quoted) {
      if (ch === "\"" && next === "\"") {
        value += "\"";
        index += 1;
      } else if (ch === "\"") {
        quoted = false;
      } else {
        value += ch;
      }
    } else if (ch === "\"") {
      quoted = true;
    } else if (ch === "\t") {
      out.push(value);
      value = "";
    } else {
      value += ch;
    }
  }
  out.push(value);
  return out;
}

function existingReviews() {
  if (!fs.existsSync(REVIEW_TSV_PATH)) return new Map();
  const lines = fs.readFileSync(REVIEW_TSV_PATH, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return new Map();
  const headers = parseTsvLine(lines[0]);
  const identifierIndex = headers.indexOf("identifier");
  const statusIndex = headers.indexOf("reviewStatus");
  const noteIndex = headers.indexOf("reviewNote");
  if (identifierIndex < 0 || statusIndex < 0) return new Map();
  const out = new Map();
  for (const line of lines.slice(1)) {
    const cells = parseTsvLine(line);
    const identifier = cells[identifierIndex];
    if (!identifier) continue;
    out.set(identifier, { reviewStatus: cells[statusIndex] || "", reviewNote: noteIndex >= 0 ? cells[noteIndex] || "" : "" });
  }
  return out;
}

function identifierFor(item) {
  return item.title || item.referenceUrl || item.candidateAudioUrl;
}

function riskFlags(item) {
  const text = `${item.title || ""} ${item.creator || ""} ${item.description || ""} ${item.candidateAudioUrl || ""}`;
  return SUSPICIOUS.filter(([pattern]) => pattern.test(text)).map(([, reason]) => reason);
}

function reviewPriority(item) {
  const flags = riskFlags(item);
  let score = Number(item.matchScore || 0);
  if (LICENSE_BONUS.test(String(item.license || ""))) score += 10;
  if (/opera|aria|soprano|tenor|city pop|synth pop|trap|soul|funk|r&b|japanese pop|song|music|performance/i.test(`${item.title} ${item.description}`)) score += 12;
  score -= flags.length * 35;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function accepted(item) {
  return /^(approved|accepted|ok)$/i.test(String(item.reviewStatus || "").trim()) || item.approved === true;
}

function externalDataDir() {
  const cachePaths = loadJson(CACHE_PATHS_PATH, {});
  return path.resolve(process.env.MMFR_EXTERNAL_DATA_DIR || cachePaths.externalDataDir || path.join(ROOT, ".external-data"), "wikimedia-commons");
}

function localAudioPath(item, baseDir) {
  const ext = path.extname(new URL(item.candidateAudioUrl).pathname) || ".audio";
  return path.join(baseDir, slug(item.genre), `${slug(identifierFor(item))}${ext}`);
}

async function download(url, outPath) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) return { skipped: true };
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "MUSICtee Wikimedia CC training downloader; contact local project owner" }
    });
    if (!response.ok || !response.body) throw new Error(`${response.status} ${response.statusText}`);
    await pipeline(response.body, fs.createWriteStream(outPath));
    return { skipped: false };
  } finally {
    clearTimeout(timeout);
  }
}

function candidates() {
  const payload = loadJson(CANDIDATES_PATH, { items: [] });
  const items = Array.isArray(payload) ? payload : payload.items || [];
  const reviews = existingReviews();
  return items
    .filter(item => item.candidateAudioUrl && item.genre && item.macroGenre && Number(item.matchScore || 0) >= MIN_SCORE)
    .map(item => {
      const review = reviews.get(identifierFor(item)) || {};
      return { ...item, reviewStatus: review.reviewStatus || item.reviewStatus || "", reviewNote: review.reviewNote || item.reviewNote || "" };
    })
    .sort((a, b) => a.genre.localeCompare(b.genre, "ja") || reviewPriority(b) - reviewPriority(a));
}

function writeReviewQueue(items) {
  const headers = [
    "reviewStatus",
    "reviewNote",
    "genre",
    "macroGenre",
    "matchScore",
    "reviewPriority",
    "riskFlags",
    "title",
    "creator",
    "license",
    "licenseUrl",
    "referenceUrl",
    "candidateAudioUrl",
    "identifier"
  ];
  const rows = items.map(item => headers.map(key => {
    if (key === "reviewPriority") return cell(reviewPriority(item));
    if (key === "riskFlags") return cell(riskFlags(item).join("|"));
    if (key === "identifier") return cell(identifierFor(item));
    return cell(item[key] || "");
  }).join("\t"));
  fs.writeFileSync(REVIEW_TSV_PATH, `${headers.map(cell).join("\t")}\n${rows.join("\n")}\n`);
}

async function main() {
  const items = candidates();
  writeReviewQueue(items);
  const baseDir = externalDataDir();
  const counts = {};
  const selected = [];
  const rejected = [];
  for (const item of items) {
    const flags = riskFlags(item);
    if (flags.length && !accepted(item)) {
      rejected.push({ ...item, rejectReason: flags.join("|") });
      continue;
    }
    if (!ACCEPT_UNREVIEWED && !accepted(item)) {
      rejected.push({ ...item, rejectReason: "not-reviewed" });
      continue;
    }
    counts[item.genre] = counts[item.genre] || 0;
    if (counts[item.genre] >= LIMIT_PER_GENRE) {
      rejected.push({ ...item, rejectReason: "genre-limit-reached" });
      continue;
    }
    const filePath = localAudioPath(item, baseDir);
    if (DOWNLOAD_AUDIO) {
      process.stdout.write(`${item.genre} ${identifierFor(item)} ... `);
      try {
        const result = await download(item.candidateAudioUrl, filePath);
        console.log(result.skipped ? "exists" : "downloaded");
      } catch (error) {
        rejected.push({ ...item, rejectReason: `download-failed:${error.message}` });
        console.log(`error: ${error.message}`);
        continue;
      }
    }
    selected.push({
      source: "Wikimedia Commons",
      sourceType: "cc-dataset",
      datasetName: "Wikimedia Commons Audio",
      trackId: identifierFor(item),
      genre: item.genre,
      macroGenre: item.macroGenre,
      filePath,
      license: item.license,
      licenseUrl: item.licenseUrl || item.referenceUrl,
      referenceUrl: item.referenceUrl,
      canonicalArtist: item.creator,
      canonicalTitle: item.title,
      originalAudioUrl: item.candidateAudioUrl,
      audioStoragePolicy: "external-local-audio; persist-features-only",
      reviewStatus: accepted(item) ? "approved" : "unreviewed-accepted-by-env"
    });
    counts[item.genre] += 1;
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({
    description: "Wikimedia Commons CC/Public Domain audio manifest. Audio files must live outside the repo; review candidates before formal import.",
    generatedAt: new Date().toISOString(),
    sourceCandidates: path.relative(ROOT, CANDIDATES_PATH),
    reviewQueue: path.relative(ROOT, REVIEW_TSV_PATH),
    audioRoot: baseDir,
    downloadAudio: DOWNLOAD_AUDIO,
    acceptUnreviewed: ACCEPT_UNREVIEWED,
    items: selected
  }, null, 2));
  fs.writeFileSync(REPORT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    candidates: items.length,
    selected: selected.length,
    rejected: rejected.length,
    selectedByGenre: selected.reduce((acc, item) => {
      acc[item.genre] = (acc[item.genre] || 0) + 1;
      return acc;
    }, {}),
    rejectedByReason: rejected.reduce((acc, item) => {
      acc[item.rejectReason] = (acc[item.rejectReason] || 0) + 1;
      return acc;
    }, {}),
    rejected: rejected.slice(0, 200)
  }, null, 2));
  console.log(`Wrote ${path.relative(ROOT, REVIEW_TSV_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, MANIFEST_PATH)} (${selected.length} manifest rows)`);
  console.log(`Wrote ${path.relative(ROOT, REPORT_PATH)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
