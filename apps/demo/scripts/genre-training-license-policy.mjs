export const TRAINING_USAGE = Object.freeze({
  PRODUCTION: "production-training",
  RESEARCH: "research-only",
  SUPPORT: "production-support-only",
  EXCLUDED_ND: "excluded-no-derivatives",
  VERIFY: "verification-required"
});

export function classifyTrainingLicense(value) {
  const license = String(value || "").trim().toUpperCase().replaceAll("_", "-");
  if (!license || license === "CREATIVE COMMONS" || license === "CC") {
    return { usage: TRAINING_USAGE.VERIFY, reason: "The item-level license is not specific enough." };
  }
  if (license.includes("RESEARCH-USE")) {
    return { usage: TRAINING_USAGE.RESEARCH, reason: "The source terms limit use to research." };
  }
  if (license.includes("ND")) {
    return { usage: TRAINING_USAGE.EXCLUDED_ND, reason: "NoDerivatives material is excluded by the conservative training policy." };
  }
  if (license.includes("NC")) {
    return { usage: TRAINING_USAGE.RESEARCH, reason: "NonCommercial material is isolated from the production model." };
  }
  if (license === "CC0" || license.includes("PUBLIC DOMAIN") || license === "PDM") {
    return { usage: TRAINING_USAGE.PRODUCTION, reason: "Public-domain or CC0 material is production-training eligible." };
  }
  if (/^CC-BY(?:-SA)?(?:-|$)/.test(license) || license === "CC-BY" || license === "CC-BY-SA") {
    return { usage: TRAINING_USAGE.PRODUCTION, reason: "Attribution requirements must be retained in the source manifest." };
  }
  return { usage: TRAINING_USAGE.VERIFY, reason: "The license is not covered by the approved training policy." };
}

export function effectiveTrainingUsage(item) {
  const classified = classifyTrainingLicense(item?.license);
  if (classified.usage !== TRAINING_USAGE.PRODUCTION) return classified;
  if (item?.contentScope === "loop" || item?.contentScope === "stem" || item?.contentScope === "sound-event") {
    return {
      usage: TRAINING_USAGE.SUPPORT,
      reason: "The license permits training, but non-track audio is support data and cannot be primary genre ground truth."
    };
  }
  return classified;
}
