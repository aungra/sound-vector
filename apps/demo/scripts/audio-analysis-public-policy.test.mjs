import test from "node:test";
import assert from "node:assert/strict";
import {
  createFixedWindowRateLimiter,
  classifyYouTubeFailure,
  isAllowedOrigin,
  normalizePublicYouTubeUrl,
  parseAllowedOrigins,
  requestClientAddress,
  validatePublicYouTubeUrl,
  YOUTUBE_RETRY_DELAYS_MS,
} from "./audio-analysis-public-policy.mjs";

test("public YouTube policy accepts supported HTTPS URLs", () => {
  const id = "JSHd5mm7qNI";
  for (const value of [
    `https://youtu.be/${id}?si=tracking&t=1m2s`,
    `https://www.youtube.com/watch?v=${id}&list=ignored`,
    `https://m.youtube.com/shorts/${id}?feature=share`,
    `https://www.youtube.com/live/${id}?t=62`,
    `https://www.youtube-nocookie.com/embed/${id}?start=62`,
  ]) {
    assert.equal(validatePublicYouTubeUrl(value), `https://www.youtube.com/watch?v=${id}`);
  }
  assert.deepEqual(normalizePublicYouTubeUrl(`https://youtu.be/${id}?t=1m2s`), {
    videoId: id,
    normalizedUrl: `https://www.youtube.com/watch?v=${id}`,
    startSeconds: 62,
  });
});

test("public YouTube policy rejects non-YouTube and credentialed URLs", () => {
  assert.throws(() => validatePublicYouTubeUrl("https://example.com/watch?v=abc"), /YouTube以外/);
  assert.throws(() => validatePublicYouTubeUrl("https://user:pass@youtube.com/watch?v=abc"), /HTTPS/);
  assert.throws(() => validatePublicYouTubeUrl("http://youtube.com/watch?v=abc"), /HTTPS/);
  assert.throws(() => validatePublicYouTubeUrl("https://www.youtube.com/playlist?list=PL123"), /動画ID/);
  assert.throws(() => validatePublicYouTubeUrl("https://evil.youtube.com/watch?v=JSHd5mm7qNI"), /YouTube以外/);
});

test("YouTube failure policy retries only transient transport failures", () => {
  assert.deepEqual([...YOUTUBE_RETRY_DELAYS_MS], [2000, 4000, 8000]);
  assert.deepEqual(classifyYouTubeFailure("Unable to download webpage: ENOTFOUND"), {
    code: "TRANSIENT_NETWORK_ERROR", retryable: true, cookieEligible: false,
  });
  assert.equal(classifyYouTubeFailure("Private video").code, "VIDEO_UNAVAILABLE");
  assert.equal(classifyYouTubeFailure("HTTP Error 429: Too Many Requests").code, "YOUTUBE_RATE_LIMITED");
  assert.equal(classifyYouTubeFailure("This content isn't available, try again later").code, "YOUTUBE_RATE_LIMITED");
  assert.deepEqual(classifyYouTubeFailure("Sign in to confirm you're not a bot"), {
    code: "YOUTUBE_COOKIE_REQUIRED", retryable: false, cookieEligible: true,
  });
});

test("origin policy is exact and uses production defaults", () => {
  const defaults = parseAllowedOrigins();
  assert.equal(isAllowedOrigin("https://aun-graphic.jp", defaults), true);
  assert.equal(isAllowedOrigin("https://evil.example", defaults), false);
  assert.equal(isAllowedOrigin("https://aun-graphic.jp.evil.example", defaults), false);
});

test("rate limiter resets at the next fixed window", () => {
  const limiter = createFixedWindowRateLimiter({ limit: 2, windowMs: 1000 });
  assert.equal(limiter.consume("client", 0).allowed, true);
  assert.equal(limiter.consume("client", 10).allowed, true);
  assert.equal(limiter.consume("client", 20).allowed, false);
  assert.equal(limiter.consume("client", 1000).allowed, true);
});

test("client address prefers the first proxy address", () => {
  assert.equal(requestClientAddress({ "x-forwarded-for": "203.0.113.4, 10.0.0.1" }, "127.0.0.1"), "203.0.113.4");
});
