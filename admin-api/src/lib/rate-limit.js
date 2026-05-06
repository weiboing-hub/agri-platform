// @ts-check

/**
 * @typedef {{ count: number; resetAt: number }} RateLimitBucket
 * @typedef {{ allowed: boolean; remaining: number; resetAt: number }} RateLimitResult
 * @typedef {{ key: string; windowMs: number; max: number }} RateLimitOptions
 */

/** @type {Map<string, RateLimitBucket>} */
const buckets = new Map();

/**
 * @param {RateLimitOptions} options
 * @returns {RateLimitResult}
 */
function consumeRateLimit({ key, windowMs, max }) {
  const now = Date.now();
  const bucketKey = String(key || "anonymous");
  const current = buckets.get(bucketKey);

  if (!current || current.resetAt <= now) {
    const nextBucket = {
      count: 1,
      resetAt: now + windowMs
    };
    buckets.set(bucketKey, nextBucket);
    return {
      allowed: true,
      remaining: Math.max(0, max - 1),
      resetAt: nextBucket.resetAt
    };
  }

  if (current.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetAt
    };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, max - current.count),
    resetAt: current.resetAt
  };
}

function cleanupRateLimitBuckets() {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

/**
 * @param {(key: string) => boolean} matcher
 * @returns {number}
 */
function clearRateLimitBucketsByMatcher(matcher) {
  if (typeof matcher !== "function") {
    return 0;
  }

  let removedCount = 0;
  for (const key of buckets.keys()) {
    if (matcher(key)) {
      buckets.delete(key);
      removedCount += 1;
    }
  }
  return removedCount;
}

/**
 * @param {unknown} username
 * @returns {number}
 */
function clearLoginRateLimitBuckets(username) {
  const normalizedUsername = String(username || "").trim().toLowerCase();
  if (!normalizedUsername) {
    return 0;
  }

  return clearRateLimitBucketsByMatcher(
    (key) => key.startsWith("login:") && key.endsWith(`:${normalizedUsername}`)
  );
}

module.exports = {
  consumeRateLimit,
  cleanupRateLimitBuckets,
  clearLoginRateLimitBuckets
};
