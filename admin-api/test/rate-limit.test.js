const { after, test } = require("node:test");
const assert = require("node:assert/strict");

const {
  cleanupRateLimitBuckets,
  clearLoginRateLimitBuckets,
  consumeRateLimit
} = require("../src/lib/rate-limit");

const originalNow = Date.now;

function mockNow(value) {
  Date.now = () => value;
}

test("consumeRateLimit creates and increments buckets inside the same window", () => {
  mockNow(1_000);
  const first = consumeRateLimit({ key: "login:1:test", windowMs: 10_000, max: 2 });
  const second = consumeRateLimit({ key: "login:1:test", windowMs: 10_000, max: 2 });
  const third = consumeRateLimit({ key: "login:1:test", windowMs: 10_000, max: 2 });

  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);
});

test("cleanupRateLimitBuckets removes expired buckets and allows a fresh window", () => {
  mockNow(5_000);
  consumeRateLimit({ key: "login:1:cleanup", windowMs: 1_000, max: 1 });

  mockNow(6_500);
  cleanupRateLimitBuckets();

  const fresh = consumeRateLimit({ key: "login:1:cleanup", windowMs: 1_000, max: 1 });
  assert.equal(fresh.allowed, true);
  assert.equal(fresh.remaining, 0);
});

test("clearLoginRateLimitBuckets removes username-specific login buckets", () => {
  mockNow(10_000);
  consumeRateLimit({ key: "login:1:admin", windowMs: 5_000, max: 1 });
  consumeRateLimit({ key: "login:2:other", windowMs: 5_000, max: 1 });

  const removed = clearLoginRateLimitBuckets("admin");
  assert.equal(removed, 1);

  const afterClear = consumeRateLimit({ key: "login:1:admin", windowMs: 5_000, max: 1 });
  const untouched = consumeRateLimit({ key: "login:2:other", windowMs: 5_000, max: 1 });

  assert.equal(afterClear.allowed, true);
  assert.equal(untouched.allowed, false);
});

after(() => {
  Date.now = originalNow;
});
