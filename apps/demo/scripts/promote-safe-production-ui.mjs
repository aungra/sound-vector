import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const sourcePath = path.resolve(process.argv[2] || path.join(ROOT, "output", "public", "sound-form", "index.html"));
const releasePath = process.env.MMFR_UI_RELEASE_PATH
  || path.join(os.homedir(), "Library", "Application Support", "MUSICTee", "ui-release", "index.html");
const hashPath = process.env.MMFR_UI_RELEASE_HASH_PATH || `${releasePath}.sha256`;

const source = fs.readFileSync(sourcePath);
const text = source.toString("utf8");
const requiredMarkers = [
  '<p class="simple-intro">SOUND FORMは',
  'class="simple-conversion"',
  "hasRichAnalysisParity",
  "reliableExternalRapPromotion?.applies",
  "pcm_preview_texture",
  "deferProtectedPcm: true",
  "genreCompositionProgramsByFamily",
  "data-genre-composition",
  "song-topology-v1"
];
for (const marker of requiredMarkers) {
  if (!text.includes(marker)) throw new Error(`Refusing to promote UI without marker: ${marker}`);
}

const hash = crypto.createHash("sha256").update(source).digest("hex");
const releaseTemp = `${releasePath}.tmp-${process.pid}`;
const hashTemp = `${hashPath}.tmp-${process.pid}`;
fs.mkdirSync(path.dirname(releasePath), { recursive: true, mode: 0o700 });

try {
  fs.writeFileSync(releaseTemp, source, { mode: 0o600 });
  fs.writeFileSync(hashTemp, `${hash}  ${path.basename(releasePath)}\n`, { mode: 0o600 });
  fs.renameSync(releaseTemp, releasePath);
  fs.renameSync(hashTemp, hashPath);
} finally {
  for (const temporary of [releaseTemp, hashTemp]) {
    try { fs.unlinkSync(temporary); } catch {}
  }
}

process.stdout.write(`${releasePath}\n${hash}\n`);
