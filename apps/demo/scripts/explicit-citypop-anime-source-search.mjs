import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const CACHE_PATHS_PATH = path.join(TRAINING_DIR, "cache-paths.local.json");
const VERIFIED_PATH = path.join(TRAINING_DIR, "verified-dataset.json");
const CANDIDATES_PATH = path.join(TRAINING_DIR, "explicit-citypop-anime-candidates.json");
const REVIEW_TSV_PATH = path.join(TRAINING_DIR, "explicit-citypop-anime-review.tsv");
const REVIEW_HTML_PATH = path.join(TRAINING_DIR, "explicit-citypop-anime-review.html");
const MANIFEST_PATH = path.join(TRAINING_DIR, "explicit-citypop-anime-source-manifest.json");

const RUN_WEB = process.env.MMFR_EXPLICIT_CITYPOP_ANIME_WEB !== "0";
const PRESERVE_PREVIOUS = process.env.MMFR_EXPLICIT_CITYPOP_ANIME_PRESERVE_PREVIOUS !== "0";
const DOWNLOAD_READY_ONLY = process.env.MMFR_EXPLICIT_CITYPOP_ANIME_READY_ONLY === "1";
const IA_ROWS = Math.max(5, Math.min(50, Number(process.env.MMFR_EXPLICIT_CITYPOP_ANIME_IA_ROWS || 20)));
const OPENVERSE_ROWS = Math.max(5, Math.min(50, Number(process.env.MMFR_EXPLICIT_CITYPOP_ANIME_OPENVERSE_ROWS || 20)));

const TARGETS = {
  "シティ・ポップ": {
    macroGenre: "pop",
    exact: [
      /\bcity[-\s]?pop\b/i,
      /シティ[・\s-]?ポップ/,
      /citypop/i
    ],
    adjacent: [
      /\bfuture[-\s]?funk\b/i,
      /\bjapanese[-\s]?boogie\b/i,
      /\baor\b/i,
      /\bretrofuture\b/i
    ],
    queries: [
      "\"city pop\" music",
      "\"citypop\" music",
      "\"シティポップ\"",
      "\"シティ・ポップ\""
    ]
  },
  "アニメソング": {
    macroGenre: "pop",
    exact: [
      /\banime[-\s]?song\b/i,
      /\banisong\b/i,
      /アニソン/,
      /\banime[-\s]?theme\b/i,
      /\banime[-\s]?soundtrack\b/i,
      /\banime[-\s]?ost\b/i
    ],
    adjacent: [
      /\bvocaloid\b/i,
      /\butau\b/i,
      /\bgame[-\s]?music\b/i,
      /\banime house\b/i
    ],
    queries: [
      "\"anime song\" music",
      "\"anisong\" music",
      "\"anime theme\" music",
      "\"anime soundtrack\" music",
      "\"アニソン\""
    ]
  }
};

const BAD_SIGNALS = /\b(ai generated|suno|udio|podcast|interview|lecture|spoken|pronunciation|karaoke|cover|reaction|tutorial|sample pack|loop pack|dj set|mixtape|continuous mix|music mix|sound effect|sfx|vinyl rip|album rip|cd rip|best collection|single collection)\b/i;
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".flac", ".m4a", ".ogg", ".oga", ".opus", ".aac", ".aif", ".aiff"]);

function loadJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function cachePaths() {
  const payload = loadJson(CACHE_PATHS_PATH, {});
  return payload && typeof payload === "object" ? payload : {};
}

function externalDataDir() {
  return path.resolve(process.env.MMFR_EXTERNAL_DATA_DIR || cachePaths().externalDataDir || path.join(ROOT, ".external-data"));
}

function parseCsvEach(text, onRow) {
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === "\"" && next === "\"") {
        cell += "\"";
        i += 1;
      } else if (ch === "\"") {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === "\"") {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      onRow(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    onRow(row);
  }
}

function parseTsv(text) {
  const rows = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (!rows.length) return [];
  const headers = rows[0].split("\t");
  return rows.slice(1).map(line => {
    const cells = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
}

function normalizeLicense(value) {
  const text = String(value || "").toUpperCase();
  if (/CC0|PUBLIC DOMAIN/.test(text)) return "CC0";
  if (/ATTRIBUTION/.test(text)) {
    const parts = ["CC-BY"];
    if (/NON.?COMMERCIAL/.test(text)) parts.push("NC");
    if (/SHARE.?ALIKE/.test(text)) parts.push("SA");
    if (/NO.?DERIV|NODERIV|NO DERIV/.test(text)) parts.push("ND");
    return parts.join("-");
  }
  if (/CC-BY-NC-SA/.test(text)) return "CC-BY-NC-SA";
  if (/CC-BY-NC-ND/.test(text)) return "CC-BY-NC-ND";
  if (/CC-BY-NC/.test(text)) return "CC-BY-NC";
  if (/CC-BY-SA/.test(text)) return "CC-BY-SA";
  if (/CC-BY-ND/.test(text)) return "CC-BY-ND";
  if (/CC-BY/.test(text)) return "CC-BY";
  return text.trim();
}

function licenseUrlFor(license) {
  const normalized = normalizeLicense(license);
  const map = {
    "CC0": "https://creativecommons.org/publicdomain/zero/1.0/",
    "CC-BY": "https://creativecommons.org/licenses/by/4.0/",
    "CC-BY-SA": "https://creativecommons.org/licenses/by-sa/4.0/",
    "CC-BY-NC": "https://creativecommons.org/licenses/by-nc/4.0/",
    "CC-BY-NC-SA": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    "CC-BY-ND": "https://creativecommons.org/licenses/by-nd/4.0/",
    "CC-BY-NC-ND": "https://creativecommons.org/licenses/by-nc-nd/4.0/"
  };
  return map[normalized] || "";
}

function ccLicenseFromUrl(value) {
  const text = String(value || "");
  if (/zero\/1\.0/.test(text)) return "CC0";
  const match = text.match(/licenses\/([^/]+)\//i);
  return match ? `CC-${match[1].toUpperCase()}` : "";
}

function textEvidence(genre, fields) {
  const exactFields = [
    fields.title,
    fields.album,
    fields.tags,
    fields.genre,
    fields.subject
  ];
  const exactText = exactFields.join(" ");
  const broaderText = [
    exactText,
    fields.artist,
    fields.description
  ].join(" ");
  const target = TARGETS[genre];
  if (BAD_SIGNALS.test(broaderText)) return null;
  if (exactFields.some(field => target.exact.some(pattern => pattern.test(String(field || ""))))) {
    return {
      confidence: "exact",
      labelEvidence: `${genre} explicit wording in title/album/tag/genre/subject`
    };
  }
  if (exactFields.some(field => target.adjacent.some(pattern => pattern.test(String(field || ""))))) {
    return {
      confidence: "adjacent",
      labelEvidence: `${genre} adjacent wording only; do not formal-promote without manual approval`
    };
  }
  return null;
}

function existingKeys() {
  const payload = loadJson(VERIFIED_PATH, { items: [] });
  const rows = Array.isArray(payload) ? payload : payload.items || [];
  return new Set(rows.flatMap(row => [
    row.sourceUrl,
    row.filePath,
    row.referenceUrl,
    row.trackId ? `fma:${row.trackId}` : "",
    row.trackId ? `mtg:${row.trackId}` : ""
  ].filter(Boolean)));
}

function addCandidate(candidates, item) {
  const key = item.candidateKey || [
    item.source,
    item.genre,
    item.trackId,
    item.referenceUrl,
    item.candidateAudioUrl,
    item.filePath
  ].filter(Boolean).join("|");
  if (!key) return;
  if (candidates._seen.has(key)) return;
  candidates._seen.add(key);
  candidates.push({
    reviewStatus: "",
    reviewNote: "",
    safetyFlags: safetyFlags(item).join(","),
    ...item,
    candidateKey: key
  });
}

function loadPreviousCandidates() {
  const payload = loadJson(CANDIDATES_PATH, { items: [] });
  const items = Array.isArray(payload) ? payload : payload.items || [];
  return items.filter(item => item && item.candidateKey);
}

function previousReviewByKey() {
  const rows = fs.existsSync(REVIEW_TSV_PATH) ? parseTsv(fs.readFileSync(REVIEW_TSV_PATH, "utf8")) : [];
  return new Map(rows.map(row => [
    [
      row.source,
      row.genre,
      row.trackId,
      row.referenceUrl,
      row.candidateAudioUrl,
      row.filePath
    ].filter(Boolean).join("|"),
    {
      reviewStatus: row.reviewStatus || "",
      reviewNote: row.reviewNote || ""
    }
  ]));
}

function safetyFlags(item = {}) {
  const text = [
    item.canonicalTitle,
    item.canonicalArtist,
    item.albumTitle,
    item.referenceUrl,
    item.candidateAudioUrl
  ].join(" ").toLowerCase();
  const flags = [];
  if (/vinyl rip|album rip|cd rip/.test(text)) flags.push("rip-upload");
  if (/best collection|single collection|golden best|premium best|cd box/.test(text)) flags.push("commercial-compilation");
  if (/\b(naruto|bleach|junjou romantica|macross|akina nakamori|tomoko aran|yu hayami|meiko nakahara|iyo matsumoto|mari?a takeuchi)\b/i.test(text)) flags.push("commercial-rights-risk");
  if (/music mix|dj set|mixtape/.test(text)) flags.push("mix-not-single-track");
  if (/ost|original soundtrack|opening single|soundtrack/.test(text) && item.source !== "FMA" && item.source !== "MTG-Jamendo") flags.push("soundtrack-rights-risk");
  if (String(item.license || "") === "Creative Commons") flags.push("license-url-unclear");
  return flags;
}

function collectFma(candidates, report) {
  const fmaDir = path.join(externalDataDir(), "fma");
  const tracksCsv = path.join(fmaDir, "fma_metadata", "tracks.csv");
  const configuredRoots = String(process.env.MMFR_FMA_AUDIO_ROOTS || "")
    .split(path.delimiter)
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => path.resolve(value));
  const audioRoots = [
    ...configuredRoots,
    path.join(fmaDir, "fma_small"),
    path.join(fmaDir, "fma_medium"),
    path.join(fmaDir, "fma_large"),
    path.join(fmaDir, "fma_full"),
    path.join(fmaDir, "fma_all")
  ].filter((value, index, list) => list.indexOf(value) === index);
  const existingAudioRoots = audioRoots.filter(root => fs.existsSync(root));
  if (!fs.existsSync(tracksCsv) || !existingAudioRoots.length) {
    report.local.fma = { status: "missing", tracksCsv, audioRoots };
    return;
  }
  const existing = existingKeys();
  const headerRows = [];
  let headers = [];
  const counts = {};
  const rejected = { noEvidence: 0, alreadyImported: 0, noAudio: 0, noLicense: 0 };
  parseCsvEach(fs.readFileSync(tracksCsv, "utf8"), values => {
    if (headerRows.length < 3) {
      headerRows.push(values);
      if (headerRows.length === 3) {
        const [top, mid, low] = headerRows;
        headers = top.map((value, index) => [value, mid[index], low[index]].filter(Boolean).join(".") || "track_id");
      }
      return;
    }
    if (!values.length || !values[0]) return;
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    for (const genre of Object.keys(TARGETS)) {
      const evidence = textEvidence(genre, {
        title: row["track.title"],
        album: row["album.title"],
        tags: [row["track.tags"], row["album.tags"], row["artist.tags"]].join(" "),
        genre: [row["track.genre_top"], row["track.genres"], row["track.genres_all"]].join(" "),
        subject: "",
        artist: row["artist.name"],
        description: ""
      });
      if (!evidence) {
        rejected.noEvidence += 1;
        continue;
      }
      const trackId = String(row.track_id || "").trim();
      const padded = trackId.padStart(6, "0");
      const filePath = existingAudioRoots
        .map(root => path.join(root, padded.slice(0, 3), `${padded}.mp3`))
        .find(candidatePath => fs.existsSync(candidatePath)) || "";
      const referenceUrl = row["track.information"] || `https://freemusicarchive.org/track/${trackId}`;
      if (existing.has(filePath) || existing.has(referenceUrl) || existing.has(`fma:${trackId}`)) {
        rejected.alreadyImported += 1;
        continue;
      }
      const audioExists = Boolean(filePath);
      if (!audioExists && DOWNLOAD_READY_ONLY) {
        rejected.noAudio += 1;
        continue;
      }
      const license = normalizeLicense(row["track.license"]);
      const licenseUrl = licenseUrlFor(license);
      if (!license || !licenseUrl) {
        rejected.noLicense += 1;
        continue;
      }
      counts[genre] = (counts[genre] || 0) + 1;
      addCandidate(candidates, {
        source: "FMA",
        sourceType: "cc-dataset",
        datasetName: "FMA",
        trackId,
        genre,
        macroGenre: TARGETS[genre].macroGenre,
        trainingRole: evidence.confidence === "exact" ? "fine" : "adjacent-review",
        confidence: evidence.confidence,
        formalEligible: evidence.confidence === "exact" && audioExists,
        filePath: audioExists ? filePath : "",
        sourceUrl: audioExists ? filePath : "",
        referenceUrl,
        candidateAudioUrl: audioExists ? `file://${filePath}` : "",
        license,
        licenseUrl,
        canonicalArtist: row["artist.name"] || "",
        canonicalTitle: row["track.title"] || "",
        albumTitle: row["album.title"] || "",
        labelEvidence: evidence.labelEvidence,
        audioExists,
        reviewHint: evidence.confidence === "exact" ? "review-audio-then-approve" : "adjacent-only"
      });
    }
  });
  report.local.fma = { status: "ok", audioRoots: existingAudioRoots, counts, rejected };
}

function mtgAudioPath(audioRoot, trackId) {
  const numeric = String(trackId || "").replace(/\D/g, "");
  return path.join(audioRoot, numeric.slice(-2), `${numeric}.low.mp3`);
}

function collectMtg(candidates, report) {
  const mtgDir = path.join(externalDataDir(), "mtg-jamendo");
  const metaTsv = path.join(mtgDir, "data", "raw.meta.tsv");
  const genreTsv = path.join(mtgDir, "data", "autotagging_genre.tsv");
  const audioRoot = path.join(mtgDir, "raw_30s", "audio-low");
  if (!fs.existsSync(metaTsv) || !fs.existsSync(audioRoot)) {
    report.local.mtgJamendo = { status: "missing", metaTsv, audioRoot };
    return;
  }
  const tagByTrack = new Map();
  if (fs.existsSync(genreTsv)) {
    for (const row of parseTsv(fs.readFileSync(genreTsv, "utf8"))) {
      tagByTrack.set(row.TRACK_ID, row.TAGS || "");
    }
  }
  const existing = existingKeys();
  const counts = {};
  const rejected = { noEvidence: 0, alreadyImported: 0, noAudio: 0 };
  for (const row of parseTsv(fs.readFileSync(metaTsv, "utf8"))) {
    for (const genre of Object.keys(TARGETS)) {
      const evidence = textEvidence(genre, {
        title: row.TRACK_NAME,
        album: row.ALBUM_NAME,
        tags: tagByTrack.get(row.TRACK_ID) || "",
        genre: "",
        subject: "",
        artist: row.ARTIST_NAME,
        description: ""
      });
      if (!evidence) {
        rejected.noEvidence += 1;
        continue;
      }
      const filePath = mtgAudioPath(audioRoot, row.TRACK_ID);
      const referenceUrl = row.URL || `https://www.jamendo.com/track/${String(row.TRACK_ID || "").replace(/\D/g, "")}`;
      if (existing.has(filePath) || existing.has(referenceUrl) || existing.has(`mtg:${row.TRACK_ID}`)) {
        rejected.alreadyImported += 1;
        continue;
      }
      const audioExists = fs.existsSync(filePath);
      if (!audioExists && DOWNLOAD_READY_ONLY) {
        rejected.noAudio += 1;
        continue;
      }
      counts[genre] = (counts[genre] || 0) + 1;
      addCandidate(candidates, {
        source: "MTG-Jamendo",
        sourceType: "cc-dataset",
        datasetName: "MTG-Jamendo",
        trackId: row.TRACK_ID,
        genre,
        macroGenre: TARGETS[genre].macroGenre,
        trainingRole: evidence.confidence === "exact" ? "fine" : "adjacent-review",
        confidence: evidence.confidence,
        formalEligible: evidence.confidence === "exact" && audioExists,
        filePath: audioExists ? filePath : "",
        sourceUrl: audioExists ? filePath : "",
        referenceUrl,
        candidateAudioUrl: audioExists ? `file://${filePath}` : "",
        license: "CC-BY-NC-SA",
        licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/3.0/",
        canonicalArtist: row.ARTIST_NAME || "",
        canonicalTitle: row.TRACK_NAME || "",
        albumTitle: row.ALBUM_NAME || "",
        labelEvidence: evidence.labelEvidence,
        audioExists,
        reviewHint: evidence.confidence === "exact" ? "review-audio-then-approve" : "adjacent-only"
      });
    }
  }
  report.local.mtgJamendo = { status: "ok", counts, rejected };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "MUSICTee explicit citypop/anime candidate collector" }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function archiveFileUrl(identifier, name) {
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${String(name).split("/").map(encodeURIComponent).join("/")}`;
}

async function collectInternetArchive(candidates, report) {
  const counts = {};
  const errors = [];
  for (const [genre, target] of Object.entries(TARGETS)) {
    for (const query of target.queries) {
      try {
        const params = new URLSearchParams();
        params.set("q", `mediatype:audio AND (${query}) AND (licenseurl:*creativecommons.org* OR licenseurl:*publicdomain*)`);
        params.set("fl[]", "identifier,title,creator,licenseurl,downloads,publicdate");
        params.set("rows", String(IA_ROWS));
        params.set("output", "json");
        params.set("sort[]", "downloads desc");
        const search = await fetchJson(`https://archive.org/advancedsearch.php?${params}`);
        const docs = Array.isArray(search?.response?.docs) ? search.response.docs : [];
        for (const doc of docs) {
          const identifier = String(doc.identifier || "");
          if (!identifier) continue;
          const metaPayload = await fetchJson(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
          const meta = metaPayload?.metadata || {};
          const files = Array.isArray(metaPayload?.files) ? metaPayload.files : [];
          const subject = Array.isArray(meta.subject) ? meta.subject.join(" ") : String(meta.subject || "");
          const evidence = textEvidence(genre, {
            title: meta.title || doc.title,
            album: "",
            tags: "",
            genre: "",
            subject,
            artist: Array.isArray(meta.creator) ? meta.creator.join(" ") : String(meta.creator || doc.creator || ""),
            description: meta.description || ""
          });
          if (!evidence) continue;
          const audioFile = files.find(file => AUDIO_EXTENSIONS.has(path.extname(String(file.name || "")).toLowerCase()));
          const licenseUrl = String(meta.licenseurl || doc.licenseurl || "");
          const license = ccLicenseFromUrl(licenseUrl) || "Creative Commons";
          if (!audioFile || !licenseUrl) continue;
          counts[genre] = (counts[genre] || 0) + 1;
          addCandidate(candidates, {
            source: "Internet Archive",
            sourceType: "cc-web-candidate",
            datasetName: "Internet Archive",
            trackId: identifier,
            genre,
            macroGenre: target.macroGenre,
            trainingRole: evidence.confidence === "exact" ? "fine" : "adjacent-review",
            confidence: evidence.confidence,
            formalEligible: false,
            filePath: "",
            sourceUrl: "",
            referenceUrl: `https://archive.org/details/${encodeURIComponent(identifier)}`,
            candidateAudioUrl: archiveFileUrl(identifier, audioFile.name),
            license,
            licenseUrl,
            canonicalArtist: Array.isArray(meta.creator) ? meta.creator.join(", ") : String(meta.creator || doc.creator || ""),
            canonicalTitle: String(meta.title || doc.title || ""),
            albumTitle: "",
            labelEvidence: evidence.labelEvidence,
            audioExists: false,
            reviewHint: "download-after-review"
          });
        }
      } catch (error) {
        errors.push({ genre, query, error: error.message });
      }
    }
  }
  report.web.internetArchive = { status: "ok", counts, errors };
}

async function collectOpenverse(candidates, report) {
  const counts = {};
  const errors = [];
  for (const [genre, target] of Object.entries(TARGETS)) {
    for (const query of target.queries) {
      try {
        const url = new URL("https://api.openverse.engineering/v1/audio/");
        url.searchParams.set("q", query.replaceAll("\"", ""));
        url.searchParams.set("page_size", String(OPENVERSE_ROWS));
        url.searchParams.set("page", "1");
        const payload = await fetchJson(url.toString());
        const rows = Array.isArray(payload.results) ? payload.results : [];
        for (const row of rows) {
          const evidence = textEvidence(genre, {
            title: row.title,
            album: "",
            tags: row.tags?.map(tag => tag.name || tag).join(" ") || "",
            genre: row.category || "",
            subject: "",
            artist: row.creator,
            description: [row.description, row.foreign_landing_url, row.source].join(" ")
          });
          if (!evidence) continue;
          const license = normalizeLicense(row.license);
          const licenseUrl = row.license_url || licenseUrlFor(license);
          if (!row.url || !licenseUrl) continue;
          counts[genre] = (counts[genre] || 0) + 1;
          addCandidate(candidates, {
            source: "Openverse",
            sourceType: "cc-web-candidate",
            datasetName: `Openverse/${row.source || "unknown"}`,
            trackId: row.id || row.foreign_landing_url || row.url,
            genre,
            macroGenre: target.macroGenre,
            trainingRole: evidence.confidence === "exact" ? "fine" : "adjacent-review",
            confidence: evidence.confidence,
            formalEligible: false,
            filePath: "",
            sourceUrl: "",
            referenceUrl: row.foreign_landing_url || "",
            candidateAudioUrl: row.url || "",
            license,
            licenseUrl,
            canonicalArtist: row.creator || "",
            canonicalTitle: row.title || "",
            albumTitle: "",
            labelEvidence: evidence.labelEvidence,
            audioExists: false,
            reviewHint: "download-after-review"
          });
        }
      } catch (error) {
        errors.push({ genre, query, error: error.message });
      }
    }
  }
  report.web.openverse = { status: "ok", counts, errors };
}

function tsvCell(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeReviewFiles(candidates, report) {
  const previousReviews = previousReviewByKey();
  const sorted = candidates
    .filter(item => item.source)
    .map(item => {
      const preserved = previousReviews.get(item.candidateKey);
      return preserved?.reviewStatus || preserved?.reviewNote
        ? { ...item, ...preserved }
        : item;
    })
    .sort((a, b) => {
      const formal = Number(Boolean(b.formalEligible)) - Number(Boolean(a.formalEligible));
      if (formal) return formal;
      const rank = value => (value === "exact" ? 0 : value === "adjacent" ? 1 : 2);
      const confidence = rank(a.confidence) - rank(b.confidence);
      if (confidence) return confidence;
      return String(a.genre).localeCompare(String(b.genre), "ja") || String(a.source).localeCompare(String(b.source));
    });

  const header = [
    "reviewStatus",
    "reviewNote",
    "genre",
    "confidence",
    "formalEligible",
    "source",
    "license",
    "title",
    "artist",
    "album",
    "labelEvidence",
    "safetyFlags",
    "audioExists",
    "filePath",
    "candidateAudioUrl",
    "referenceUrl",
    "trackId"
  ];
  const tsv = [
    header.join("\t"),
    ...sorted.map(item => header.map(key => tsvCell({
      title: item.canonicalTitle,
      artist: item.canonicalArtist,
      album: item.albumTitle
    }[key] ?? item[key])).join("\t"))
  ].join("\n");
  fs.writeFileSync(REVIEW_TSV_PATH, `${tsv}\n`);

  const htmlRows = sorted.map(item => `<tr>
    <td><code>${escapeHtml(item.reviewStatus || "")}</code></td>
    <td><strong>${escapeHtml(item.genre)}</strong><br>${escapeHtml(item.confidence)} / formal ${escapeHtml(item.formalEligible)}</td>
    <td>${escapeHtml(item.source)}<br>${escapeHtml(item.license)}</td>
    <td><strong>${escapeHtml(item.canonicalTitle)}</strong><br>${escapeHtml(item.canonicalArtist)}<br><span>${escapeHtml(item.albumTitle)}</span></td>
    <td>${escapeHtml(item.labelEvidence)}<br><span>${escapeHtml(item.safetyFlags || "")}</span></td>
    <td>${item.candidateAudioUrl ? `<a href="${escapeHtml(item.candidateAudioUrl)}">audio</a>` : ""}<br>${item.referenceUrl ? `<a href="${escapeHtml(item.referenceUrl)}">page</a>` : ""}</td>
  </tr>`).join("\n");
  fs.writeFileSync(REVIEW_HTML_PATH, `<!doctype html>
<meta charset="utf-8">
<title>Explicit City Pop / Anime Song Review</title>
<style>
body{font-family:Arial,sans-serif;margin:24px;background:#f7f7f4;color:#151515}
table{border-collapse:collapse;width:100%;font-size:13px}
td,th{border:1px solid #bbb;padding:8px;vertical-align:top}
th{background:#111;color:white}
span{color:#555}
</style>
<h1>Explicit City Pop / Anime Song Review</h1>
<p>Only mark <code>approved</code> when the visible metadata and listening review support the exact label. Adjacent candidates should remain unapproved unless manually justified.</p>
<table><thead><tr><th>Status</th><th>Genre</th><th>Source</th><th>Track</th><th>Evidence</th><th>Links</th></tr></thead><tbody>${htmlRows}</tbody></table>
`);

  const approved = sorted.filter(item => /^approved|accepted|ok$/i.test(String(item.reviewStatus || "")));
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({
    description: "Approved explicit city-pop/anime-song source manifest. Generated from review TSV; empty until reviewed.",
    generatedAt: new Date().toISOString(),
    reviewTsv: path.relative(ROOT, REVIEW_TSV_PATH),
    items: approved
  }, null, 2));

  fs.writeFileSync(CANDIDATES_PATH, JSON.stringify({
    description: "Explicit city-pop/anime-song candidates. Exact labels are separated from adjacent labels; review before formal import.",
    generatedAt: new Date().toISOString(),
    report,
    items: sorted
  }, null, 2));

  return sorted;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

async function main() {
  fs.mkdirSync(TRAINING_DIR, { recursive: true });
  const candidates = [];
  candidates._seen = new Set();
  const report = {
    generatedAt: new Date().toISOString(),
    policy: {
      exactOnlyFormal: true,
      cityPopAdjacentNotFormal: ["future funk", "japanese boogie", "AOR", "retrofuture"],
      animeAdjacentNotFormal: ["vocaloid", "utau", "game music", "anime house"]
    },
    local: {},
    web: {}
  };
  collectFma(candidates, report);
  collectMtg(candidates, report);
  if (RUN_WEB) {
    await collectInternetArchive(candidates, report);
    await collectOpenverse(candidates, report);
  }
  if (PRESERVE_PREVIOUS) {
    let restored = 0;
    for (const item of loadPreviousCandidates()) {
      const before = candidates.length;
      addCandidate(candidates, item);
      if (candidates.length > before) restored += 1;
    }
    report.previousCandidates = { status: "preserved", restored };
  }
  const sorted = writeReviewFiles(candidates, report);
  const byGenre = sorted.reduce((acc, item) => {
    const key = `${item.genre}/${item.confidence}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({
    candidates: sorted.length,
    byGenre,
    formalEligible: sorted.filter(item => item.formalEligible).length,
    output: path.relative(ROOT, CANDIDATES_PATH),
    reviewTsv: path.relative(ROOT, REVIEW_TSV_PATH),
    reviewHtml: path.relative(ROOT, REVIEW_HTML_PATH),
    manifest: path.relative(ROOT, MANIFEST_PATH)
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
