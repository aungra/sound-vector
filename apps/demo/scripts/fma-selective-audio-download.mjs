import fs from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { spawnSync } from "node:child_process";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
const VERIFIED_PATH = path.join(TRAINING_DIR, "verified-dataset.json");
const ARCHIVE_SUBSET = String(process.env.MMFR_FMA_ARCHIVE_SUBSET || "medium").trim().toLowerCase();
if (!new Set(["small", "medium", "large"]).has(ARCHIVE_SUBSET)) throw new Error(`Unsupported FMA archive subset: ${ARCHIVE_SUBSET}`);
const MANIFEST_PATH = path.resolve(process.env.MMFR_FMA_SELECTIVE_MANIFEST_PATH || path.join(TRAINING_DIR, `fma-${ARCHIVE_SUBSET}-selective-cc-source-manifest.json`));
const REPORT_PATH = path.resolve(process.env.MMFR_FMA_SELECTIVE_REPORT_PATH || path.join(TRAINING_DIR, `fma-${ARCHIVE_SUBSET}-selective-download-report.json`));

const ARCHIVE_URL = process.env.MMFR_FMA_ARCHIVE_URL || `https://os.unil.cloud.switch.ch/fma/fma_${ARCHIVE_SUBSET}.zip`;
const DOWNLOAD_AUDIO = process.env.MMFR_FMA_SELECTIVE_DOWNLOAD === "1";
const LIMIT_PER_GENRE = Math.max(1, Number(process.env.MMFR_FMA_SELECTIVE_LIMIT_PER_GENRE || 30));
const MAX_PER_ARTIST = Math.max(1, Number(process.env.MMFR_FMA_SELECTIVE_MAX_PER_ARTIST || 3));
const DOWNLOAD_CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.MMFR_FMA_SELECTIVE_CONCURRENCY || 4)));
const LICENSE_SCOPE = String(process.env.MMFR_FMA_SELECTIVE_LICENSE_SCOPE || "production").trim().toLowerCase();
const PRODUCTION_LICENSES = new Set(["CC0", "CC-BY", "CC-BY-SA"]);
const REQUEST_TIMEOUT_MS = Math.max(10_000, Number(process.env.MMFR_FMA_SELECTIVE_TIMEOUT_MS || 180_000));
const TARGET_GENRES = new Set(
  String(process.env.MMFR_FMA_SELECTIVE_GENRES || "アンビエント,ドローン,ノイズミュージック,テクノ,ハウス,ディープ・ハウス,トランス,ドラムンベース,ダブステップ,チップチューン,ヒップホップ,トラップ,レゲエ,ダブ,ブルース,ファンク,ソウルミュージック,ディスコ,ロック,パンク,ハードコア,メタル,ジャズ,シティ・ポップ,J-POP,アニメソング,クラシック音楽,オペラ,フォーク,ラテン,ワールドミュージック")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
);
const TARGET_SUBSETS = new Set(
  String(process.env.MMFR_FMA_SOURCE_SUBSETS || (ARCHIVE_SUBSET === "large" ? "large" : ARCHIVE_SUBSET === "small" ? "small" : "small,medium"))
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
);

const MACRO_BY_FINE = {
  "アンビエント": "ambient",
  "ドローン": "ambient",
  "ノイズミュージック": "ambient",
  "テクノ": "electronic",
  "ハウス": "electronic",
  "ディープ・ハウス": "electronic",
  "トランス": "electronic",
  "ドラムンベース": "electronic",
  "ダブステップ": "electronic",
  "チップチューン": "electronic",
  "ヒップホップ": "black_music",
  "トラップ": "black_music",
  "レゲエ": "black_music",
  "ダブ": "black_music",
  "ブルース": "black_music",
  "ファンク": "black_music",
  "ソウルミュージック": "black_music",
  "ディスコ": "black_music",
  "ロック": "rock",
  "パンク": "rock",
  "ハードコア": "rock",
  "メタル": "rock",
  "ジャズ": "jazz",
  "シティ・ポップ": "pop",
  "J-POP": "pop",
  "アニメソング": "pop",
  "クラシック音楽": "classical",
  "オペラ": "classical",
  "フォーク": "world",
  "ラテン": "world",
  "ワールドミュージック": "world",
};

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function externalPaths() {
  const cache = loadJson(CACHE_PATHS_PATH, {});
  const externalDataDir = path.resolve(
    process.env.MMFR_EXTERNAL_DATA_DIR || cache.externalDataDir || path.join(ROOT, ".external-data")
  );
  const fmaDir = path.resolve(process.env.MMFR_FMA_DIR || path.join(externalDataDir, "fma"));
  return {
    tracksCsv: path.resolve(process.env.MMFR_FMA_TRACKS_CSV || path.join(fmaDir, "fma_metadata", "tracks.csv")),
    smallAudioRoot: path.resolve(process.env.MMFR_FMA_SMALL_AUDIO_ROOT || path.join(fmaDir, "fma_small")),
    outputAudioRoot: path.resolve(process.env.MMFR_FMA_SELECTIVE_AUDIO_ROOT || (
      ARCHIVE_SUBSET === "small" ? path.join(fmaDir, "fma_small") : path.join(fmaDir, `fma_${ARCHIVE_SUBSET}_selective`)
    ))
  };
}

function normalizeLicense(value) {
  const text = String(value || "").toUpperCase();
  if (/CC0|PUBLIC DOMAIN/.test(text)) return "CC0";
  if (!/ATTRIBUTION|CC[- ]?BY/.test(text)) return "";
  const parts = ["CC-BY"];
  if (/NON.?COMMERCIAL|\bNC\b/.test(text)) parts.push("NC");
  if (/SHARE.?ALIKE|\bSA\b/.test(text)) parts.push("SA");
  if (/NO.?DERIV|NODERIV|\bND\b/.test(text)) parts.push("ND");
  return parts.join("-");
}

function licenseUrlFor(license) {
  const suffix = {
    "CC0": "publicdomain/zero/1.0",
    "CC-BY": "licenses/by/4.0",
    "CC-BY-SA": "licenses/by-sa/4.0",
    "CC-BY-NC": "licenses/by-nc/4.0",
    "CC-BY-NC-SA": "licenses/by-nc-sa/4.0",
    "CC-BY-ND": "licenses/by-nd/4.0",
    "CC-BY-NC-ND": "licenses/by-nc-nd/4.0"
  }[license];
  return suffix ? `https://creativecommons.org/${suffix}/` : "";
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\[\]{}()"']/g, " ")
    .replace(/[_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function explicitEvidence(row) {
  const genreTop = normalizeText(row["track.genre_top"]);
  const tagText = normalizeText([
    row["track.tags"],
    row["album.tags"],
    row["artist.tags"]
  ].join(" "));
  const allText = normalizeText([
    tagText,
    row["track.title"],
    row["album.title"],
    row["artist.name"]
  ].join(" "));
  if (/\b(podcast|interview|lecture|audiobook|sample pack|loop pack|karaoke|dj set|continuous mix)\b/.test(allText)) {
    return null;
  }

  const matches = [];
  if (TARGET_GENRES.has("ディープ・ハウス") && /\bdeep house\b/.test(tagText)) {
    matches.push({ genre: "ディープ・ハウス", score: 99, evidence: "FMA explicit deep-house tag" });
  }
  if (TARGET_GENRES.has("ドラムンベース") && /\b(drum and bass|drum n bass|drum & bass|dnb|jungle|liquid funk|neurofunk)\b/.test(tagText)) {
    matches.push({ genre: "ドラムンベース", score: /drum and bass|drum n bass|drum & bass/.test(tagText) ? 99 : 94, evidence: "FMA explicit drum-and-bass tag" });
  }
  if (TARGET_GENRES.has("ダブステップ") && /\b(dubstep|brostep)\b/.test(tagText)) {
    matches.push({ genre: "ダブステップ", score: 99, evidence: "FMA explicit dubstep tag" });
  }
  if (TARGET_GENRES.has("チップチューン") && /\b(chiptune|chip music|chipmusic|8 bit|8-bit|bitpop)\b/.test(tagText)) {
    matches.push({ genre: "チップチューン", score: /chiptune|chipmusic/.test(tagText) ? 99 : 92, evidence: "FMA explicit chiptune/8-bit tag" });
  }
  if (TARGET_GENRES.has("トラップ") && /\b(trap music|trap hip hop|trap rap|southern trap)\b/.test(tagText)) {
    matches.push({ genre: "トラップ", score: 99, evidence: "FMA explicit trap-music tag" });
  }
  if (TARGET_GENRES.has("ダブ") && /\b(dub reggae|roots dub|digital dub|dub music)\b/.test(tagText)) {
    matches.push({ genre: "ダブ", score: 99, evidence: "FMA explicit dub-reggae tag" });
  }
  if (TARGET_GENRES.has("シティ・ポップ") && /\b(city pop|citypop)\b/.test(tagText)) {
    matches.push({ genre: "シティ・ポップ", score: 100, evidence: "FMA explicit city-pop tag" });
  }
  if (TARGET_GENRES.has("J-POP") && /\b(j-pop|jpop|japanese pop)\b/.test(tagText)) {
    matches.push({ genre: "J-POP", score: 100, evidence: "FMA explicit J-pop tag" });
  }
  if (TARGET_GENRES.has("アニメソング") && /\b(anime song|anisong|anime music)\b/.test(tagText)) {
    matches.push({ genre: "アニメソング", score: 100, evidence: "FMA explicit anime-song tag" });
  }
  if (TARGET_GENRES.has("オペラ") && /\b(opera|operatic)\b/.test(tagText)) {
    matches.push({ genre: "オペラ", score: 99, evidence: "FMA explicit opera tag" });
  }
  if (TARGET_GENRES.has("ジャズ") && (genreTop === "jazz" || /\b(jazz|bebop|hard bop|free jazz|jazz fusion)\b/.test(tagText))) {
    matches.push({ genre: "ジャズ", score: genreTop === "jazz" ? 100 : 90, evidence: genreTop === "jazz" ? "FMA track.genre_top=Jazz" : "FMA explicit jazz tag" });
  }
  if (TARGET_GENRES.has("アンビエント") && (genreTop === "ambient" || /\b(ambient music|atmospheric ambient|space ambient)\b/.test(tagText))) {
    const conflicting = /\b(drone|noise|industrial|dark ambient)\b/.test(tagText);
    if (!conflicting) matches.push({ genre: "アンビエント", score: genreTop === "ambient" ? 100 : 92, evidence: genreTop === "ambient" ? "FMA track.genre_top=Ambient" : "FMA explicit ambient tag" });
  }
  if (TARGET_GENRES.has("ドローン") && /\b(drone|drone ambient|drone music)\b/.test(tagText)) {
    matches.push({ genre: "ドローン", score: /drone ambient|drone music/.test(tagText) ? 98 : 92, evidence: "FMA explicit drone tag" });
  }
  if (TARGET_GENRES.has("ノイズミュージック") && /\b(harsh noise|noise music|power noise|dark noise|experimental noise|noise)\b/.test(tagText)) {
    const noiseRockOnly = /\bnoise rock\b/.test(tagText) && !/\b(harsh noise|noise music|power noise|experimental noise)\b/.test(tagText);
    if (!noiseRockOnly) matches.push({ genre: "ノイズミュージック", score: /harsh noise|noise music|power noise/.test(tagText) ? 98 : 90, evidence: "FMA explicit noise-music tag" });
  }
  if (TARGET_GENRES.has("ハードコア") && /\b(hardcore punk|punk hardcore|post hardcore|crust punk)\b/.test(tagText)) {
    matches.push({ genre: "ハードコア", score: /hardcore punk|punk hardcore/.test(tagText) ? 98 : 90, evidence: "FMA explicit hardcore-punk tag" });
  }
  if (TARGET_GENRES.has("パンク") && (genreTop === "punk" || /\b(punk rock|punkrock|street punk|garage punk|anarcho punk|pop punk)\b/.test(tagText))) {
    const hardcoreOnly = /\b(hardcore punk|punk hardcore|post hardcore|crust punk)\b/.test(tagText) && !/\b(punk rock|punkrock|street punk|garage punk|anarcho punk|pop punk)\b/.test(tagText);
    if (!hardcoreOnly) matches.push({ genre: "パンク", score: genreTop === "punk" ? 100 : 94, evidence: genreTop === "punk" ? "FMA track.genre_top=Punk" : "FMA explicit punk tag" });
  }
  if (TARGET_GENRES.has("ロック") && genreTop === "rock") {
    const subgenreConflict = /\b(punk|metal|hardcore|noise rock)\b/.test(tagText);
    if (!subgenreConflict) matches.push({ genre: "ロック", score: 100, evidence: "FMA track.genre_top=Rock" });
  }
  if (TARGET_GENRES.has("メタル") && /\b(heavy metal|death metal|black metal|thrash metal|doom metal|power metal|metalcore)\b/.test(tagText)) {
    matches.push({ genre: "メタル", score: 98, evidence: "FMA explicit metal-subgenre tag" });
  }
  if (TARGET_GENRES.has("テクノ") && /\b(techno|minimal techno|deep techno|hard techno|detroit techno)\b/.test(tagText)) {
    const conflict = /\b(dub techno|tech house)\b/.test(tagText);
    if (!conflict) matches.push({ genre: "テクノ", score: 96, evidence: "FMA explicit techno tag" });
  }
  if (TARGET_GENRES.has("ハウス") && /\b(house music|acid house|electro house|progressive house|garage house|tech house)\b/.test(tagText)) {
    const conflict = /\bdeep house\b/.test(tagText);
    if (!conflict) matches.push({ genre: "ハウス", score: 96, evidence: "FMA explicit house-subgenre tag" });
  }
  if (TARGET_GENRES.has("トランス") && /\b(trance|goa trance|psytrance|psy-trance|progressive trance)\b/.test(tagText)) {
    matches.push({ genre: "トランス", score: 97, evidence: "FMA explicit trance tag" });
  }
  if (TARGET_GENRES.has("ヒップホップ") && (genreTop === "hip-hop" || /\b(hip hop|hip-hop|boom bap|rap music|instrumental hip hop)\b/.test(tagText))) {
    const conflict = /\b(trap music|trap hip hop|trap rap|southern trap)\b/.test(tagText);
    if (!conflict) matches.push({ genre: "ヒップホップ", score: genreTop === "hip-hop" ? 97 : 94, evidence: genreTop === "hip-hop" ? "FMA track.genre_top=Hip-Hop" : "FMA explicit hip-hop tag" });
  }
  if (TARGET_GENRES.has("レゲエ") && /\b(reggae|roots reggae|dancehall|rocksteady|ska)\b/.test(tagText)) {
    const conflict = /\b(dub reggae|roots dub|digital dub|dub music)\b/.test(tagText);
    if (!conflict) matches.push({ genre: "レゲエ", score: 96, evidence: "FMA explicit reggae tag" });
  }
  if (TARGET_GENRES.has("ブルース") && (genreTop === "blues" || /\b(delta blues|country blues|electric blues|chicago blues|acoustic blues)\b/.test(tagText))) {
    matches.push({ genre: "ブルース", score: genreTop === "blues" ? 100 : 96, evidence: genreTop === "blues" ? "FMA track.genre_top=Blues" : "FMA explicit blues-subgenre tag" });
  }
  if (TARGET_GENRES.has("ファンク") && /\b(funk|p-funk|afro-funk|free funk|funk music)\b/.test(tagText)) {
    const conflict = /\b(liquid funk|neurofunk)\b/.test(tagText);
    if (!conflict) matches.push({ genre: "ファンク", score: 96, evidence: "FMA explicit funk tag" });
  }
  if (TARGET_GENRES.has("ソウルミュージック") && (genreTop === "soul-rnb" || /\b(soul music|neo soul|northern soul|southern soul|blue-eyed soul)\b/.test(tagText))) {
    matches.push({
      genre: "ソウルミュージック",
      score: genreTop === "soul-rnb" ? 100 : 97,
      evidence: genreTop === "soul-rnb" ? "FMA track.genre_top=Soul-RnB" : "FMA explicit soul-music tag"
    });
  }
  if (TARGET_GENRES.has("ディスコ") && /\b(disco|nu-disco|italo disco)\b/.test(tagText)) {
    matches.push({ genre: "ディスコ", score: 97, evidence: "FMA explicit disco tag" });
  }
  if (TARGET_GENRES.has("クラシック音楽") && genreTop === "classical") {
    const conflict = /\b(opera|operatic)\b/.test(tagText);
    if (!conflict) matches.push({ genre: "クラシック音楽", score: 100, evidence: "FMA track.genre_top=Classical" });
  }
  if (TARGET_GENRES.has("フォーク") && (genreTop === "folk" || /\b(traditional folk|contemporary folk|folk music|singer songwriter)\b/.test(tagText))) {
    matches.push({ genre: "フォーク", score: genreTop === "folk" ? 100 : 94, evidence: genreTop === "folk" ? "FMA track.genre_top=Folk" : "FMA explicit folk tag" });
  }
  if (TARGET_GENRES.has("ラテン") && /\b(latin music|salsa|samba|bossa nova|tango|cumbia|merengue)\b/.test(tagText)) {
    matches.push({ genre: "ラテン", score: 96, evidence: "FMA explicit Latin-style tag" });
  }
  if (TARGET_GENRES.has("ワールドミュージック") && (genreTop === "international" || /\b(world music|afrobeat|celtic|middle eastern|indian classical|flamenco|balkan)\b/.test(tagText))) {
    matches.push({ genre: "ワールドミュージック", score: genreTop === "international" ? 100 : 92, evidence: genreTop === "international" ? "FMA track.genre_top=International" : "FMA explicit world-music tag" });
  }
  return matches.sort((a, b) => b.score - a.score)[0] || null;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const ch of String(value || "")) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

class CsvObjectTransform extends Transform {
  constructor(onObject) {
    super();
    this.onObject = onObject;
    this.row = [];
    this.cell = "";
    this.quoted = false;
    this.pendingQuote = false;
    this.headerRows = [];
    this.headers = [];
  }

  emitRow() {
    this.row.push(this.cell);
    this.cell = "";
    if (this.headerRows.length < 3) {
      this.headerRows.push(this.row);
      if (this.headerRows.length === 3) {
        const [top, mid, low] = this.headerRows;
        this.headers = top.map((value, index) => [value, mid[index], low[index]].filter(Boolean).join(".") || "track_id");
      }
    } else if (this.row[0]) {
      this.onObject(Object.fromEntries(this.headers.map((header, index) => [header, this.row[index] || ""])));
    }
    this.row = [];
  }

  _transform(chunk, _encoding, callback) {
    const text = chunk.toString("utf8");
    for (let index = 0; index < text.length; index += 1) {
      const ch = text[index];
      if (this.pendingQuote) {
        this.pendingQuote = false;
        if (ch === '"') {
          this.cell += '"';
          this.quoted = true;
          continue;
        }
        this.quoted = false;
      }
      if (this.quoted) {
        if (ch === '"') {
          if (text[index + 1] === '"') {
            this.cell += '"';
            index += 1;
          } else if (index === text.length - 1) {
            this.pendingQuote = true;
          } else {
            this.quoted = false;
          }
        } else {
          this.cell += ch;
        }
      } else if (ch === '"') {
        this.quoted = true;
      } else if (ch === ",") {
        this.row.push(this.cell);
        this.cell = "";
      } else if (ch === "\n") {
        this.emitRow();
      } else if (ch !== "\r") {
        this.cell += ch;
      }
    }
    callback();
  }

  _flush(callback) {
    if (this.pendingQuote) {
      this.pendingQuote = false;
      this.quoted = false;
    }
    if (this.cell || this.row.length) this.emitRow();
    callback();
  }
}

async function collectCandidates(tracksCsv, smallAudioRoot, outputAudioRoot) {
  const verified = loadJson(VERIFIED_PATH, { items: [] });
  const verifiedItems = Array.isArray(verified) ? verified : verified.items || [];
  const used = new Set(verifiedItems.flatMap(item => [item.trackId ? `fma:${item.trackId}` : "", item.filePath].filter(Boolean)));
  const candidates = [];
  await pipeline(
    fs.createReadStream(tracksCsv),
    new CsvObjectTransform(row => {
      const subset = String(row["set.subset"] || "").trim().toLowerCase();
      if (!TARGET_SUBSETS.has(subset)) return;
      const evidence = explicitEvidence(row);
      if (!evidence) return;
      const trackId = String(row.track_id || "").trim();
      const padded = trackId.padStart(6, "0");
      const smallPath = path.join(smallAudioRoot, padded.slice(0, 3), `${padded}.mp3`);
      const filePath = ARCHIVE_SUBSET === "small"
        ? smallPath
        : path.join(outputAudioRoot, padded.slice(0, 3), `${padded}.mp3`);
      if (used.has(`fma:${trackId}`) || used.has(smallPath)) return;
      if (ARCHIVE_SUBSET !== "small" && fs.existsSync(smallPath)) return;
      if (ARCHIVE_SUBSET === "small" && !fs.existsSync(smallPath)) return;
      const license = normalizeLicense(row["track.license"]);
      const licenseUrl = licenseUrlFor(license);
      if (!license || !licenseUrl) return;
      const productionEligible = PRODUCTION_LICENSES.has(license);
      if (LICENSE_SCOPE === "production" && !productionEligible) return;
      candidates.push({
        trackId,
        padded,
        archivePath: `fma_${ARCHIVE_SUBSET}/${padded.slice(0, 3)}/${padded}.mp3`,
        genre: evidence.genre,
        macroGenre: MACRO_BY_FINE[evidence.genre],
        matchScore: evidence.score,
        labelEvidence: evidence.evidence,
        canonicalArtist: row["artist.name"] || "",
        canonicalTitle: row["track.title"] || "",
        albumTitle: row["album.title"] || "",
        filePath,
        license,
        licenseUrl,
        productionEligible,
        usageScope: productionEligible ? "production" : "research-only",
        referenceUrl: `https://freemusicarchive.org/track/${trackId}`,
        sourceSubset: subset,
        stableOrder: stableHash(`${evidence.genre}:${row["artist.id"]}:${trackId}`)
      });
    })
  );

  const selected = [];
  const genreCounts = {};
  const artistCounts = {};
  for (const row of candidates.sort((a, b) => b.matchScore - a.matchScore || a.stableOrder - b.stableOrder)) {
    const artistKey = `${row.genre}:${normalizeText(row.canonicalArtist) || row.trackId}`;
    if ((genreCounts[row.genre] || 0) >= LIMIT_PER_GENRE) continue;
    if ((artistCounts[artistKey] || 0) >= MAX_PER_ARTIST) continue;
    selected.push(row);
    genreCounts[row.genre] = (genreCounts[row.genre] || 0) + 1;
    artistCounts[artistKey] = (artistCounts[artistKey] || 0) + 1;
  }
  return { candidates, selected };
}

async function fetchRange(start, end) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(ARCHIVE_URL, {
      signal: controller.signal,
      headers: {
        Range: `bytes=${start}-${end}`,
        "User-Agent": "MUSICtee FMA selective CC dataset downloader"
      }
    });
    if (![200, 206].includes(response.status)) throw new Error(`range ${start}-${end}: ${response.status} ${response.statusText}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (response.status === 200 && buffer.length !== end - start + 1) {
      throw new Error("FMA server ignored Range; refusing to download the full archive");
    }
    return buffer;
  } finally {
    clearTimeout(timeout);
  }
}

async function archiveSize() {
  const response = await fetch(ARCHIVE_URL, { method: "HEAD", headers: { "User-Agent": "MUSICtee FMA selective CC dataset downloader" } });
  if (!response.ok) throw new Error(`archive HEAD: ${response.status} ${response.statusText}`);
  const size = Number(response.headers.get("content-length"));
  if (!Number.isFinite(size) || size <= 0) throw new Error("archive Content-Length is missing");
  if (!/bytes/i.test(response.headers.get("accept-ranges") || "")) throw new Error("archive does not advertise byte ranges");
  return size;
}

async function centralDirectoryIndex() {
  const size = await archiveSize();
  const tailStart = Math.max(0, size - 65_557);
  const tail = await fetchRange(tailStart, size - 1);
  let eocd = -1;
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (tail.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP end-of-central-directory record not found");
  let centralSize = tail.readUInt32LE(eocd + 12);
  let centralOffset = tail.readUInt32LE(eocd + 16);
  if (centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    const locatorOffset = eocd - 20;
    if (locatorOffset < 0 || tail.readUInt32LE(locatorOffset) !== 0x07064b50) {
      throw new Error("ZIP64 locator not found");
    }
    const zip64Offset = Number(tail.readBigUInt64LE(locatorOffset + 8));
    const zip64 = await fetchRange(zip64Offset, zip64Offset + 55);
    if (zip64.readUInt32LE(0) !== 0x06064b50) throw new Error("ZIP64 end-of-central-directory record not found");
    centralSize = Number(zip64.readBigUInt64LE(40));
    centralOffset = Number(zip64.readBigUInt64LE(48));
  }
  const central = await fetchRange(centralOffset, centralOffset + centralSize - 1);
  const entries = new Map();
  let offset = 0;
  while (offset + 46 <= central.length && central.readUInt32LE(offset) === 0x02014b50) {
    const method = central.readUInt16LE(offset + 10);
    let compressedSize = central.readUInt32LE(offset + 20);
    let uncompressedSize = central.readUInt32LE(offset + 24);
    const nameLength = central.readUInt16LE(offset + 28);
    const extraLength = central.readUInt16LE(offset + 30);
    const commentLength = central.readUInt16LE(offset + 32);
    let localOffset = central.readUInt32LE(offset + 42);
    const name = central.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      const extra = central.subarray(offset + 46 + nameLength, offset + 46 + nameLength + extraLength);
      let extraOffset = 0;
      while (extraOffset + 4 <= extra.length) {
        const fieldId = extra.readUInt16LE(extraOffset);
        const fieldLength = extra.readUInt16LE(extraOffset + 2);
        if (fieldId === 0x0001) {
          let valueOffset = extraOffset + 4;
          if (uncompressedSize === 0xffffffff) {
            uncompressedSize = Number(extra.readBigUInt64LE(valueOffset));
            valueOffset += 8;
          }
          if (compressedSize === 0xffffffff) {
            compressedSize = Number(extra.readBigUInt64LE(valueOffset));
            valueOffset += 8;
          }
          if (localOffset === 0xffffffff) localOffset = Number(extra.readBigUInt64LE(valueOffset));
          break;
        }
        extraOffset += 4 + fieldLength;
      }
    }
    entries.set(name, { name, method, compressedSize, uncompressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { size, entries };
}

async function downloadEntry(entry, outPath) {
  if (fs.existsSync(outPath) && fs.statSync(outPath).size === entry.uncompressedSize) return "exists";
  const localHeader = await fetchRange(entry.localOffset, entry.localOffset + 29);
  if (localHeader.readUInt32LE(0) !== 0x04034b50) throw new Error(`invalid local ZIP header: ${entry.name}`);
  const nameLength = localHeader.readUInt16LE(26);
  const extraLength = localHeader.readUInt16LE(28);
  const dataStart = entry.localOffset + 30 + nameLength + extraLength;
  const compressed = await fetchRange(dataStart, dataStart + entry.compressedSize - 1);
  let audio = null;
  if (entry.method === 0) audio = compressed;
  if (entry.method === 8) audio = inflateRawSync(compressed);
  if (entry.method === 12) {
    const result = spawnSync("/usr/bin/bzip2", ["-dc"], {
      input: compressed,
      maxBuffer: Math.max(entry.uncompressedSize * 2, 32 * 1024 * 1024)
    });
    if (result.status !== 0) throw new Error(`bzip2 failed for ${entry.name}: ${String(result.stderr || "").trim()}`);
    audio = result.stdout;
  }
  if (!audio) throw new Error(`unsupported ZIP compression method ${entry.method}: ${entry.name}`);
  if (audio.length !== entry.uncompressedSize) throw new Error(`size mismatch for ${entry.name}`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, audio);
  return "downloaded";
}

const { tracksCsv, smallAudioRoot, outputAudioRoot } = externalPaths();
if (!fs.existsSync(tracksCsv)) {
  console.error(`Missing FMA metadata: ${tracksCsv}`);
  process.exitCode = 1;
} else {
  const { candidates, selected } = await collectCandidates(tracksCsv, smallAudioRoot, outputAudioRoot);
  const downloaded = [];
  const rejected = [];
  let archive = null;
  if (DOWNLOAD_AUDIO && ARCHIVE_SUBSET !== "small" && selected.length) {
    archive = await centralDirectoryIndex();
    const downloadedByIndex = new Array(selected.length);
    let nextIndex = 0;
    let done = 0;
    async function worker() {
      while (true) {
        const index = nextIndex++;
        if (index >= selected.length) return;
        const row = selected[index];
        const entry = archive.entries.get(row.archivePath);
        if (!entry) {
          rejected.push({ ...row, rejectReason: "not-found-in-fma-medium-archive" });
        } else {
          try {
            const status = await downloadEntry(entry, row.filePath);
            downloadedByIndex[index] = { ...row, downloadStatus: status };
          } catch (error) {
            rejected.push({ ...row, rejectReason: `download-failed:${error.message}` });
          }
        }
        done += 1;
        if (done % 10 === 0 || done === selected.length) console.log(`FMA selective audio ${done}/${selected.length}`);
      }
    }
    await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, selected.length) }, () => worker()));
    downloaded.push(...downloadedByIndex.filter(Boolean));
  }

  const ready = DOWNLOAD_AUDIO && ARCHIVE_SUBSET !== "small"
    ? downloaded
    : selected.filter(row => fs.existsSync(row.filePath));
  const manifestItems = ready.map(row => ({
    source: "FMA",
    sourceType: "cc-dataset",
    datasetName: row.productionEligible ? `FMA ${ARCHIVE_SUBSET[0].toUpperCase()}${ARCHIVE_SUBSET.slice(1)} explicit-label production` : `FMA ${ARCHIVE_SUBSET[0].toUpperCase()}${ARCHIVE_SUBSET.slice(1)} explicit-label research-only`,
    trackId: row.trackId,
    genre: row.genre,
    macroGenre: row.macroGenre,
    trainingRole: "fine",
    filePath: row.filePath,
    sourceUrl: row.filePath,
    referenceUrl: row.referenceUrl,
    license: row.license,
    licenseUrl: row.licenseUrl,
    productionEligible: row.productionEligible,
    usageScope: row.usageScope,
    canonicalArtist: row.canonicalArtist,
    canonicalTitle: row.canonicalTitle,
    albumTitle: row.albumTitle,
    labelEvidence: row.labelEvidence,
    labelConfidence: "explicit-catalog-tag",
    reviewStatus: `fma-${ARCHIVE_SUBSET}-explicit-label-selective`,
    reviewNote: `Selected from FMA ${ARCHIVE_SUBSET} by exact genre evidence; artist-capped; audio stored externally and only features may enter the repository.`,
    audioStoragePolicy: "external-local-audio; persist-features-only"
  }));
  const countByGenre = rows => rows.reduce((acc, row) => {
    acc[row.genre] = (acc[row.genre] || 0) + 1;
    return acc;
  }, {});
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({
    description: `Selective FMA ${ARCHIVE_SUBSET} CC audio manifest. Production scope accepts CC0/CC-BY/CC-BY-SA only; audio remains external and repository persistence is features-only.`,
    generatedAt: new Date().toISOString(),
    archiveUrl: ARCHIVE_URL,
    tracksCsv,
    audioRoot: outputAudioRoot,
    archiveSubset: ARCHIVE_SUBSET,
    sourceSubsets: [...TARGET_SUBSETS],
    targetGenres: [...TARGET_GENRES],
    licenseScope: LICENSE_SCOPE,
    productionLicenses: [...PRODUCTION_LICENSES],
    limitPerGenre: LIMIT_PER_GENRE,
    maxPerArtist: MAX_PER_ARTIST,
    items: manifestItems
  }, null, 2));
  fs.writeFileSync(REPORT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    archiveUrl: ARCHIVE_URL,
    downloadAudio: DOWNLOAD_AUDIO,
    licenseScope: LICENSE_SCOPE,
    downloadConcurrency: DOWNLOAD_CONCURRENCY,
    archiveSize: archive?.size || null,
    archiveEntries: archive?.entries.size || null,
    candidateCount: candidates.length,
    selectedCount: selected.length,
    readyCount: manifestItems.length,
    rejectedCount: rejected.length,
    candidatesByGenre: countByGenre(candidates),
    selectedByGenre: countByGenre(selected),
    readyByGenre: countByGenre(manifestItems),
    selectedPreview: selected.slice(0, 200),
    rejected
  }, null, 2));
  console.log(`Wrote ${path.relative(ROOT, MANIFEST_PATH)} (${manifestItems.length} ready rows)`);
  console.log(`Wrote ${path.relative(ROOT, REPORT_PATH)}`);
}
