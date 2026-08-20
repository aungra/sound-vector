import test from "node:test";
import assert from "node:assert/strict";
import {
  createFixedWindowRateLimiter,
  isAllowedOrigin,
  parseAllowedOrigins,
  requestClientAddress,
  validatePublicYouTubeUrl,
} from "./audio-analysis-public-policy.mjs";

test("public YouTube policy accepts supported HTTPS URLs", () => {
  assert.match(validatePublicYouTubeUrl("https://youtu.be/abc123?t=60"), /^https:\/\/youtu\.be\//);
  assert.match(validatePublicYouTubeUrl("https://www.youtube.com/watch?v=abc123"), /^https:\/\/www\.youtube\.com\//);
});

test("public YouTube policy rejects non-YouTube and credentialed URLs", () => {
  assert.throws(() => validatePublicYouTubeUrl("https://example.com/watch?v=abc"), /YouTube以外/);
  assert.throws(() => validatePublicYouTubeUrl("https://user:pass@youtube.com/watch?v=abc"), /HTTPS/);
  assert.throws(() => validatePublicYouTubeUrl("http://youtube.com/watch?v=abc"), /HTTPS/);
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
