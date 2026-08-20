import path from "node:path";

export function embeddingInferenceAttemptPlan({
  contract = {},
  primaryModelPath = "",
  fallbackModelPath = "",
  headMode = "auto",
} = {}) {
  const primary = path.resolve(String(primaryModelPath || ""));
  const fallback = path.resolve(String(fallbackModelPath || primaryModelPath || ""));
  const headRequired = Boolean(contract.discogsTagHeadRequired);
  const headEnabled = headMode === "on" || (headMode === "auto" && headRequired);
  const attempts = [{
    modelPath: primary,
    discogsHead: headEnabled,
    role: "primary",
  }];
  if (headEnabled && fallback && fallback !== primary) {
    attempts.push({
      modelPath: fallback,
      discogsHead: false,
      role: "stable-fallback",
    });
  }
  return attempts;
}

export async function runEmbeddingInferenceAttempts(attempts, execute) {
  const errors = [];
  for (const attempt of attempts) {
    try {
      const value = await execute(attempt);
      return {
        ok: true,
        value,
        attempt,
        fallbackReason: attempt.role === "stable-fallback" ? errors.join(" | ").slice(-500) : "",
      };
    } catch (error) {
      errors.push(`${attempt.role}:${String(error?.message || error || "inference failed")}`);
    }
  }
  return { ok: false, errors };
}
