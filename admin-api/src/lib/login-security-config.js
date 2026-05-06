// @ts-check

const config = require("./config");
const { loadConfigGroup } = require("./system-config");

/** @typedef {import("./system-config").SqlConnection} SqlConnection */

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} [minimum]
 * @returns {number}
 */
function normalizeInteger(value, fallback, minimum = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(minimum, parsed);
}

/**
 * @param {unknown} value
 * @param {boolean} [fallback]
 * @returns {boolean}
 */
function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return ["1", "true", "yes", "on", "enabled"].includes(String(value).trim().toLowerCase());
}

/**
 * @param {SqlConnection | null} [connection]
 * @returns {Promise<{
 *   rateLimitEnabled: boolean;
 *   rateLimitLoginWindowMs: number;
 *   rateLimitLoginMax: number;
 *   lockEnabled: boolean;
 *   failureThreshold: number;
 *   lockMinutes: number;
 * }>}
 */
async function getLoginSecurityConfig(connection = null) {
  const rawConfig = await loadConfigGroup("login_security", connection);

  return {
    rateLimitEnabled: normalizeBoolean(rawConfig.rate_limit_enabled, config.rateLimit.enabled),
    rateLimitLoginWindowMs: normalizeInteger(
      rawConfig.rate_limit_login_window_ms,
      config.rateLimit.loginWindowMs,
      1000
    ),
    rateLimitLoginMax: normalizeInteger(rawConfig.rate_limit_login_max, config.rateLimit.loginMax, 1),
    lockEnabled: normalizeBoolean(rawConfig.login_lock_enabled, config.loginSecurity.lockEnabled),
    failureThreshold: normalizeInteger(
      rawConfig.login_failure_threshold,
      config.loginSecurity.failureThreshold,
      1
    ),
    lockMinutes: normalizeInteger(rawConfig.login_lock_minutes, config.loginSecurity.lockMinutes, 1)
  };
}

module.exports = {
  getLoginSecurityConfig
};
