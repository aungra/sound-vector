const DEFAULT_ALLOWED_ORIGINS = [
  "https://aun-graphic.jp",
  "https://www.aun-graphic.jp",
];
export const YOUTUBE_RETRY_DELAYS_MS = Object.freeze([2000, 4000, 8000]);

export function parseAllowedOrigins(value = "") {
  const configured = String(value || "")
    .split(",")
    .map(item => item.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

export function isAllowedOrigin(origin, allowedOrigins) {
  if (!origin) return false;
  return allowedOrigins.has(String(origin).trim().replace(/\/$/, ""));
}

export function validatePublicYouTubeUrl(value) {
  return normalizePublicYouTubeUrl(value).normalizedUrl;
}

function policyError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseTimestamp(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  if (/^\d+$/.test(text)) return Number(text);
  const match = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!match) return 0;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

export function normalizePublicYouTubeUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    throw policyError("INVALID_YOUTUBE_URL", "有効なYouTube URLを入力してください。");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw policyError("INVALID_YOUTUBE_URL", "HTTPSのYouTube URLのみ解析できます。");
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
  const shortHosts = new Set(["youtu.be", "www.youtu.be"]);
  const noCookieHosts = new Set(["youtube-nocookie.com", "www.youtube-nocookie.com"]);
  if (!youtubeHosts.has(host) && !shortHosts.has(host) && !noCookieHosts.has(host)) {
    throw policyError("INVALID_YOUTUBE_URL", "YouTube以外のURLは解析できません。");
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  let videoId = "";
  if (shortHosts.has(host)) videoId = parts[0] || "";
  else if (parts[0] === "watch" || parsed.pathname === "/watch") videoId = parsed.searchParams.get("v") || "";
  else if (["shorts", "live", "embed"].includes(parts[0])) videoId = parts[1] || "";
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw policyError("INVALID_YOUTUBE_URL", "動画IDを含むYouTube URLを入力してください。プレイリストだけのURLは解析できません。");
  }

  const startSeconds = Math.max(0, Math.floor(parseTimestamp(
    parsed.searchParams.get("t") || parsed.searchParams.get("start") || ""
  )));
  return {
    videoId,
    normalizedUrl: `https://www.youtube.com/watch?v=${videoId}`,
    startSeconds,
  };
}

export function classifyYouTubeFailure(value) {
  const message = String(value?.message || value || "");
  if (value?.name === "AbortError" || /ANALYSIS_CANCELLED|aborted|SIG(?:TERM|KILL)/i.test(message)) {
    return { code: "ANALYSIS_CANCELLED", retryable: false, cookieEligible: false };
  }
  if (/rate[- ]limit|HTTP Error 429|Too Many Requests|This content isn't available,?\s*try again later|try again later\. The current session/i.test(message)) {
    return { code: "YOUTUBE_RATE_LIMITED", retryable: false, cookieEligible: true };
  }
  if (/Sign in to confirm you.?re not a bot|confirm your age|login required|cookies for the authentication/i.test(message)) {
    return { code: /age/i.test(message) ? "AGE_RESTRICTED" : "YOUTUBE_COOKIE_REQUIRED", retryable: false, cookieEligible: true };
  }
  if (/not available in your country|geo(?:graphical)? restriction|region[- ]blocked/i.test(message)) {
    return { code: "REGION_BLOCKED", retryable: false, cookieEligible: false };
  }
  if (/Private video|Video unavailable|has been removed|deleted video|HTTP Error 404|HTTP Error 403/i.test(message)) {
    return { code: "VIDEO_UNAVAILABLE", retryable: false, cookieEligible: false };
  }
  if (/timed? out|Temporary failure|Name or service not known|ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN|network is unreachable|SSL|TLS|certificate|Unable to download webpage/i.test(message)) {
    return { code: "TRANSIENT_NETWORK_ERROR", retryable: true, cookieEligible: false };
  }
  return { code: "AUDIO_ANALYSIS_FAILED", retryable: false, cookieEligible: false };
}

export function createFixedWindowRateLimiter({ limit = 4, windowMs = 10 * 60 * 1000 } = {}) {
  const entries = new Map();
  return {
    consume(key, now = Date.now()) {
      const id = String(key || "unknown");
      const previous = entries.get(id);
      const current = !previous || now - previous.startedAt >= windowMs
        ? { count: 0, startedAt: now }
        : previous;
      current.count += 1;
      entries.set(id, current);
      return {
        allowed: current.count <= limit,
        remaining: Math.max(0, limit - current.count),
        retryAfterSeconds: Math.max(1, Math.ceil((current.startedAt + windowMs - now) / 1000)),
      };
    },
  };
}

export function requestClientAddress(headers = {}, socketAddress = "") {
  const forwarded = String(headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(headers["x-real-ip"] || "").trim() || socketAddress || "unknown";
}
