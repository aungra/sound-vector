import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TRAINING_DIR = path.join(ROOT, "genre-training");
const AUDIO_EXTENSIONS = new Set([".wav", ".aif", ".aiff", ".flac", ".mp3", ".m4a", ".ogg"]);

const AUDIO_ROOT = path.resolve(process.argv[2] || process.env.MMFR_RWC_AUDIO_ROOT || "");
const OUTPUT_PATH = path.resolve(
  process.env.MMFR_RWC_MANIFEST_OUTPUT || path.join(TRAINING_DIR, "rwc-genre-cc-source-manifest.json")
);
const DATASET_NAME = "RWC Music Database: Music Genre Database";
const LICENSE = "research-use-copyright-cleared";
const LICENSE_URL = "https://staff.aist.go.jp/m.goto/RWC-MDB/";
const REFERENCE_URL = "https://staff.aist.go.jp/m.goto/RWC-MDB/rwc-mdb-g.html";

const TRACKS = [
  ["001", "ポップ", "pop", "Popular", "Wasting Time"],
  ["002", "ポップ", "pop", "Popular", "Forget about It"],
  ["003", "ポップ", "pop", "Popular", "In Your Arms"],
  ["004", "バラード", "pop", "Ballade", "Hold On"],
  ["005", "バラード", "pop", "Ballade", "Taking Your Heart"],
  ["006", "バラード", "pop", "Ballade", "Let's Take Some Time ... To Think It Over"],
  ["007", "ロック", "rock", "Rock", "Everyday Lovin'"],
  ["008", "ロック", "rock", "Rock", "Living in a World of Destruction"],
  ["009", "ロック", "rock", "Rock", "Waiting for Your Love"],
  ["010", "メタル", "rock", "Heavy Metal", "Lost in My Dreams"],
  ["011", "メタル", "rock", "Heavy Metal", "21st Century"],
  ["012", "メタル", "rock", "Heavy Metal", "Woman"],
  ["013", "ヒップホップ", "black_music", "Rap / Hip-Hop", "Guess Again"],
  ["014", "ヒップホップ", "black_music", "Rap / Hip-Hop", "Tuesday Morning"],
  ["015", "ヒップホップ", "black_music", "Rap / Hip-Hop", "Rocket in My Pocket"],
  ["016", "ハウス", "electronic", "House", "Life Gage"],
  ["017", "ハウス", "electronic", "House", "Tonight's the Night for Love"],
  ["018", "ハウス", "electronic", "House", "Anything for Your Love"],
  ["019", "テクノ", "electronic", "Techno", "Asia 2"],
  ["020", "テクノ", "electronic", "Techno", "Keep Running"],
  ["021", "テクノ", "electronic", "Techno", "Stf"],
  ["022", "ファンク", "black_music", "Funk", "Get on up and Dance"],
  ["023", "ファンク", "black_music", "Funk", "Feeling the Hate"],
  ["024", "ファンク", "black_music", "Funk", "Trustin' in Your Groove"],
  ["025", "ソウルミュージック", "black_music", "Soul / R&B", "It's Time to Fly"],
  ["026", "ソウルミュージック", "black_music", "Soul / R&B", "Secret Dreams"],
  ["027", "ソウルミュージック", "black_music", "Soul / R&B", "Suddenly"],
  ["028", "ビッグバンド", "jazz", "Big Band", "Wind Up"],
  ["029", "ビッグバンド", "jazz", "Big Band", "Bubble"],
  ["030", "ビッグバンド", "jazz", "Big Band", "Kitchen"],
  ["031", "ジャズ", "jazz", "Modern Jazz", "Azure"],
  ["032", "ジャズ", "jazz", "Modern Jazz", "Chuggin'"],
  ["033", "ジャズ", "jazz", "Modern Jazz", "The Ramp"],
  ["034", "フュージョン", "jazz", "Fusion", "Tea Break"],
  ["035", "フュージョン", "jazz", "Fusion", "Gypsy Eyes"],
  ["036", "フュージョン", "jazz", "Fusion", "Wind Flower"],
  ["037", "ボサノヴァ", "world", "Bossa Nova", "Musica Nova"],
  ["038", "ボサノヴァ", "world", "Bossa Nova", "Misty Rouge"],
  ["039", "ボサノヴァ", "world", "Bossa Nova", "Jullia"],
  ["040", "サンバ", "world", "Samba", "Lovely Women"],
  ["041", "サンバ", "world", "Samba", "Dance to the Samba"],
  ["042", "サンバ", "world", "Samba", "Sway So Gentle"],
  ["043", "レゲエ", "black_music", "Reggae", "Moon Struck"],
  ["044", "レゲエ", "black_music", "Reggae", "Eric's Reggae"],
  ["045", "レゲエ", "black_music", "Reggae", "Where Are You?"],
  ["046", "タンゴ", "world", "Tango", "Tango Noir"],
  ["047", "タンゴ", "world", "Tango", "Kittenish Tango"],
  ["048", "タンゴ", "world", "Tango", "Tango in Twilight"],
  ["049", "バロック", "classical", "Baroque", "Water Music: Alla Hornpipe"],
  ["050", "クラシック", "classical", "Classic", "Egmont Overture"],
  ["051", "ロマン派", "classical", "Romantic", "Die Meistersinger von Nurnberg"],
  ["052", "近現代クラシック", "classical", "Modern", "Alborada del Gracioso"],
  ["053", "近現代クラシック", "classical", "Modern", "Jupiter"],
  ["054", "マーチ", "classical", "March", "The Stars and Stripes Forever"],
  ["055", "マーチ", "classical", "March", "Radetzky March"],
  ["056", "マーチ", "classical", "March", "Pomp and Circumstance"],
  ["057", "バロック", "classical", "Baroque", "Toccata and Fugue in D minor"],
  ["058", "バロック", "classical", "Baroque", "Two-Part Inventions"],
  ["059", "クラシック", "classical", "Classic", "Rondo in D major"],
  ["060", "クラシック", "classical", "Classic", "String Quartet no.77"],
  ["061", "ロマン派", "classical", "Romantic", "String Quartet no.1"],
  ["062", "ロマン派", "classical", "Romantic", "Etude in Gb major"],
  ["063", "近現代クラシック", "classical", "Modern", "Clair de Lune"],
  ["064", "ブルース", "black_music", "Blues", "Blue Print"],
  ["065", "ブルース", "black_music", "Blues", "Got'em Both"],
  ["066", "ブルース", "black_music", "Blues", "Dear John's Letter"],
  ["067", "フォーク", "world", "Folk", "Dream Angel"],
  ["068", "フォーク", "world", "Folk", "Grassy Dance"],
  ["069", "フォーク", "world", "Folk", "What Should I Tell Them?"],
  ["070", "カントリー", "world", "Country", "Bjc Fiddle Rag"],
  ["071", "カントリー", "world", "Country", "Desperate Little Man"],
  ["072", "カントリー", "world", "Country", "I Don't Love Nobody"],
  ["073", "ゴスペル", "black_music", "Gospel", "Not Enough Words"],
  ["074", "ゴスペル", "black_music", "Gospel", "With My Jalopy"],
  ["075", "ゴスペル", "black_music", "Gospel", "My Faith"],
  ["076", "アフリカ音楽", "world", "African", "Havini Tishi Tishi"],
  ["077", "アフリカ音楽", "world", "African", "Kasheki"],
  ["078", "アフリカ音楽", "world", "African", "Mwanambuzi"],
  ["079", "インド音楽", "world", "Indian", "Raga Charukesi - Alap"],
  ["080", "インド音楽", "world", "Indian", "Raga Charukesi - Vilambit Teentaal"],
  ["081", "インド音楽", "world", "Indian", "Raga Charukesi - Drut Teentaal"],
  ["082", "フラメンコ", "world", "Flamenco", "Sevillanas"],
  ["083", "フラメンコ", "world", "Flamenco", "Tangos"],
  ["084", "フラメンコ", "world", "Flamenco", "Rumba"],
  ["085", "シャンソン", "world", "Chanson", "Rue Saint-Vincent"],
  ["086", "シャンソン", "world", "Chanson", "Le Temps Des Cerises"],
  ["087", "シャンソン", "world", "Chanson", "Je Te Veux"],
  ["088", "カンツォーネ", "world", "Canzone", "Santa Lucia"],
  ["089", "カンツォーネ", "world", "Canzone", "O Sole Mio"],
  ["090", "カンツォーネ", "world", "Canzone", "Turna A Surriento"],
  ["091", "演歌", "world", "Traditional-style Japanese popular music Enka", "Tairyo Bune"],
  ["092", "演歌", "world", "Traditional-style Japanese popular music Enka", "Kita no Komoriuta"],
  ["093", "演歌", "world", "Traditional-style Japanese popular music Enka", "Ai Hitohira"],
  ["094", "民謡", "world", "Japanese folk music Min'you", "Sado Okesa"],
  ["095", "民謡", "world", "Japanese folk music Min'you", "Nambu Ushioiuta"],
  ["096", "民謡", "world", "Japanese folk music Min'you", "Soran Bushi"],
  ["097", "雅楽", "world", "Ancient Japanese court music Gagaku", "Hyojo Etenraku"],
  ["098", "雅楽", "world", "Ancient Japanese court music Gagaku", "Taishikicho Gakkaen"],
  ["099", "雅楽", "world", "Ancient Japanese court music Gagaku", "Taishikicho Chogeishi"],
  ["100", "アカペラ", "pop", "A Cappella", "Precious Love"]
];

function isInsideRepo(value) {
  const relative = path.relative(ROOT, path.resolve(value));
  return Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function inferTrackNumber(filePath, index) {
  const name = path.basename(filePath, path.extname(filePath));
  const normalized = name.replace(/[＿ー−–—]/g, "-");
  const patterns = [
    /RWC[-_\s]?MDB[-_\s]?G[-_\s]?2001[-_\s]?(?:No\.?)?[-_\s]?(\d{1,3})/i,
    /RWC[-_\s]?MDB[-_\s]?G[-_\s]?(\d{1,3})/i,
    /RWC[-_\s]?G[-_\s]?(\d{1,3})/i,
    /RM[-_\s]?G[-_\s]?(\d{1,3})/i,
    /(?:^|[-_\s])No\.?[-_\s]?(\d{1,3})(?:$|[-_\s])/i,
    /(?:^|[-_\s])(\d{1,3})(?:$|[-_\s])/
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return Number(match[1]);
  }
  return index + 1;
}

function usage() {
  console.error("Usage: npm --prefix apps/demo run rwc-genre-manifest -- /Volumes/DRIVE/RWC-MDB-G-2001");
  console.error("Audio must stay outside this repository. The manifest stores file paths only.");
}

if (!AUDIO_ROOT || !fs.existsSync(AUDIO_ROOT)) {
  usage();
  process.exitCode = 1;
} else if (isInsideRepo(AUDIO_ROOT)) {
  console.error(`Refusing repo-local RWC audio root: ${AUDIO_ROOT}`);
  process.exitCode = 1;
} else {
  const filesByNumber = new Map();
  for (const [index, filePath] of walk(AUDIO_ROOT).sort((a, b) => a.localeCompare(b, "ja")).entries()) {
    const trackNumber = String(inferTrackNumber(filePath, index)).padStart(3, "0");
    if (!filesByNumber.has(trackNumber)) filesByNumber.set(trackNumber, filePath);
  }

  const items = TRACKS.flatMap(([padded, genre, macroGenre, rwcSubcategory, title]) => {
    const filePath = filesByNumber.get(padded);
    if (!filePath) return [];
    return [{
      source: "RWC",
      sourceType: "local-audio",
      datasetName: DATASET_NAME,
      trackId: `RWC-MDB-G-2001-${padded}`,
      genre,
      macroGenre,
      trainingRole: "fine",
      filePath,
      sourceUrl: filePath,
      referenceUrl: REFERENCE_URL,
      license: LICENSE,
      licenseUrl: LICENSE_URL,
      canonicalArtist: `RWC Genre ${rwcSubcategory} No.${padded}`,
      canonicalTitle: title,
      rwcSubcategory,
      audioStoragePolicy: "external-local-audio; persist-features-only",
      notes: "User-acquired RWC audio. Do not copy or redistribute source audio. Labels follow the official RWC Music Genre subcategories."
    }];
  });

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
    description: "RWC Music Genre Database manifest. Source audio stays outside this repository; cc-import persists features only.",
    generatedAt: new Date().toISOString(),
    audioRoot: AUDIO_ROOT,
    datasetName: DATASET_NAME,
    audioStoragePolicy: "external-local-audio; persist-features-only",
    requiredFields: ["genre", "macroGenre", "filePath", "license", "licenseUrl", "referenceUrl"],
    labelPolicy: "Use official RWC-G subcategories as formal labels. Do not relabel these rows as city pop, anime song, or trap without external reviewed evidence.",
    items
  }, null, 2));

  const missing = TRACKS.map(([padded]) => padded).filter(padded => !filesByNumber.has(padded));
  const byGenre = items.reduce((acc, item) => {
    acc[item.genre] = (acc[item.genre] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    output: path.relative(ROOT, OUTPUT_PATH),
    audioRoot: AUDIO_ROOT,
    items: items.length,
    missing,
    byGenre,
    importCommand: [
      `MMFR_CC_MANIFEST_PATH=${path.relative(ROOT, OUTPUT_PATH)}`,
      "MMFR_CC_WEAK_ONLY=0",
      "MMFR_CC_LIMIT_PER_GENRE=120",
      "npm --prefix apps/demo run cc-import"
    ].join(" ")
  }, null, 2));
}
