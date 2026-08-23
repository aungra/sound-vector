import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DEFAULT_INPUT = path.join(ROOT, "genre-training", "mtg-jamendo-required-audio.tsv");
const DEFAULT_OUTPUT = path.join(ROOT, "genre-training", "mtg-jamendo-soul-training-overlay-manifest.json");
const DEFAULT_REPORT = path.join(ROOT, "genre-training", "mtg-jamendo-soul-training-overlay-report.json");
const PRODUCTION_LICENSES = new Set(["CC0", "CC-BY", "CC-BY-SA"]);
const EVIDENCE_TIERS = new Map([
  ["genre---soul", "exact-soul"],
  ["genre---rnb", "adjacent-rnb"]
]);

function parseTsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "\t" && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

export function parseTsv(source) {
  const lines = String(source).split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = parseTsvLine(lines[0]);
  return lines.slice(1).map(line => Object.fromEntries(
    headers.map((header, index) => [header, parseTsvLine(line)[index] || ""])
  ));
}

export function buildOverlay(rows, {
  audioExists = fs.existsSync,
  evidenceTiers = new Set(EVIDENCE_TIERS.values()),
  evaluationEligible = false
} = {}) {
  const rejected = {};
  const reject = reason => { rejected[reason] = (rejected[reason] || 0) + 1; };
  const selected = new Map();
  for (const row of rows) {
    if (row.genre !== "ソウルミュージック") continue;
    const evidenceTier = EVIDENCE_TIERS.get(row.tags);
    if (!evidenceTier) {
      reject("unsupported-tag");
      continue;
    }
    if (!evidenceTiers.has(evidenceTier)) continue;
    if (!PRODUCTION_LICENSES.has(String(row.license || "").toUpperCase())) {
      reject("license-outside-production-policy");
      continue;
    }
    if (row.audioExists !== "true" || !audioExists(row.expectedFilePath)) {
      reject("missing-audio");
      continue;
    }
    const sourceUrl = path.resolve(row.expectedFilePath);
    const workId = `mtg-jamendo:${row.trackId}`;
    if (selected.has(workId)) {
      reject("duplicate-work");
      continue;
    }
    selected.set(workId, {
      genre: "ソウルミュージック",
      macroGenre: "black_music",
      datasetName: "MTG-Jamendo explicit Soul/R&B training overlay",
      sourceType: "cc-dataset",
      sourceUrl,
      filePath: sourceUrl,
      referenceUrl: row.referenceUrl,
      license: String(row.license || "").toUpperCase(),
      licenseUrl: row.licenseUrl,
      trackId: row.trackId,
      workId,
      canonicalArtist: row.canonicalArtist,
      canonicalTitle: row.canonicalTitle,
      providerTag: row.tags,
      labelEvidence: `MTG-Jamendo explicit catalog tag: ${row.tags}`,
      evidenceTier,
      trainingRole: "fine-training-overlay",
      evaluationEligible,
      trainingEligible: true,
      overlayPolicy: evaluationEligible
        ? "source-heldout evaluation; exclude from training whenever Jamendo is held out"
        : "training-only; exclude whenever Jamendo is held out"
    });
  }
  return {
    items: [...selected.values()].sort((left, right) => (
      left.evidenceTier.localeCompare(right.evidenceTier)
      || left.canonicalArtist.localeCompare(right.canonicalArtist)
      || left.trackId.localeCompare(right.trackId)
    )),
    rejected
  };
}

function countBy(items, key) {
  return Object.fromEntries([...new Set(items.map(item => item[key]))].sort().map(value => [
    value,
    items.filter(item => item[key] === value).length
  ]));
}

function main() {
  const input = path.resolve(process.env.MMFR_MTG_SOUL_OVERLAY_INPUT || DEFAULT_INPUT);
  const output = path.resolve(process.env.MMFR_MTG_SOUL_OVERLAY_OUTPUT || DEFAULT_OUTPUT);
  const reportPath = path.resolve(process.env.MMFR_MTG_SOUL_OVERLAY_REPORT || DEFAULT_REPORT);
  const scope = String(process.env.MMFR_MTG_SOUL_OVERLAY_SCOPE || "all").trim();
  const role = String(process.env.MMFR_MTG_SOUL_OVERLAY_ROLE || "training-only").trim();
  if (!["training-only", "source-heldout-evaluation"].includes(role)) {
    throw new Error(`Unsupported overlay role: ${role}`);
  }
  const evidenceTiers = scope === "all"
    ? new Set(EVIDENCE_TIERS.values())
    : new Set(scope.split(",").map(value => value.trim()).filter(Boolean));
  for (const value of evidenceTiers) {
    if (![...EVIDENCE_TIERS.values()].includes(value)) {
      throw new Error(`Unsupported evidence tier: ${value}`);
    }
  }
  const { items, rejected } = buildOverlay(
    parseTsv(fs.readFileSync(input, "utf8")), {
      evidenceTiers,
      evaluationEligible: role === "source-heldout-evaluation"
    }
  );
  const manifest = {
    schemaVersion: 1,
    datasetName: "MTG-Jamendo explicit Soul/R&B training overlay",
    evidenceScope: [...evidenceTiers].sort(),
    role,
    labelPolicy: {
      "exact-soul": "Eligible for the explicit Soul ablation.",
      "adjacent-rnb": "Kept separate and never silently treated as exact Soul evidence."
    },
    evaluationEligible: role === "source-heldout-evaluation",
    items
  };
  const report = {
    objective: "Separate explicit Soul tags from adjacent R&B tags before source-heldout training.",
    input: path.relative(ROOT, input),
    evidenceScope: [...evidenceTiers].sort(),
    role,
    rows: items.length,
    artists: new Set(items.map(item => item.canonicalArtist)).size,
    byEvidenceTier: countBy(items, "evidenceTier"),
    byLicense: countBy(items, "license"),
    rejected,
    allAudioExternal: items.every(item => item.filePath.startsWith("/Volumes/")),
    sourceHoldoutPolicy: role === "source-heldout-evaluation"
      ? "Score in the Jamendo outer fold; exclude all Jamendo rows from that fold's training."
      : "Exclude all overlay rows in the Jamendo outer fold."
  };
  fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ manifest: output, report: reportPath, ...report }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
