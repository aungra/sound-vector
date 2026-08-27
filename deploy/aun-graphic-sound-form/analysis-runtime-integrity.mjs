import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function verifyAnalysisRuntime(health, lock) {
  if (health?.ok !== true) throw new Error("analysis health is not OK");
  const runtime = health.genreInferenceRuntime || {};
  const embedding = health.dependencies?.embeddingGenreContract || {};
  const mismatches = [];
  if (runtime.runtimeRevision !== lock.runtimeRevision) {
    mismatches.push(`runtimeRevision=${runtime.runtimeRevision || "missing"}`);
  }
  if (embedding.modelVersion !== lock.embeddingModelVersion) {
    mismatches.push(`embeddingModelVersion=${embedding.modelVersion || "missing"}`);
  }
  if (embedding.runtimeFeatureContractSha256 !== lock.embeddingFeatureContractSha256) {
    mismatches.push(`embeddingFeatureContract=${embedding.runtimeFeatureContractSha256 || "missing"}`);
  }
  for (const [name, expectedHash] of Object.entries(lock.models || {})) {
    const actualHash = runtime[name]?.promotion?.modelSha256 || "";
    if (actualHash !== expectedHash) mismatches.push(`${name}=${actualHash || "missing"}`);
  }
  if (mismatches.length) {
    throw new Error(`analysis runtime differs from the approved lock: ${mismatches.join(", ")}`);
  }
  return {
    runtimeRevision: runtime.runtimeRevision,
    embeddingModelVersion: embedding.modelVersion,
    modelCount: Object.keys(lock.models || {}).length
  };
}

export async function readAndVerifyProductionRuntime({ lockPath, upstreamPath } = {}) {
  const appSupport = path.join(os.homedir(), "Library", "Application Support", "MUSICTee");
  const resolvedLockPath = lockPath || path.join(path.dirname(fileURLToPath(import.meta.url)), "production-analysis-lock.json");
  const resolvedUpstreamPath = upstreamPath || path.join(appSupport, "upstream-url.txt");
  const lock = JSON.parse(fs.readFileSync(resolvedLockPath, "utf8"));
  const upstream = fs.readFileSync(resolvedUpstreamPath, "utf8").trim();
  const healthUrl = new URL("/health", upstream);
  const response = await fetch(healthUrl, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`analysis health returned HTTP ${response.status}`);
  return verifyAnalysisRuntime(await response.json(), lock);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await readAndVerifyProductionRuntime();
  process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
}
