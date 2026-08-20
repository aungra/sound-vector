const DEFAULT_ALLOWED_ORIGINS = [
  "https://aun-graphic.jp",
  "https://www.aun-graphic.jp",
];

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
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    throw new Error("有効なYouTube URLを入力してください。");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("HTTPSのYouTube URLのみ解析できます。");
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const isYouTube = host === "youtube.com"
    || host.endsWith(".youtube.com")
    || host === "youtu.be"
    || host === "youtube-nocookie.com"
    || host.endsWith(".youtube-nocookie.com");
  if (!isYouTube) throw new Error("YouTube以外のURLは解析できません。");
  return parsed.toString();
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
