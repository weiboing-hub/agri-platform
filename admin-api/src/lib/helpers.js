// @ts-check

/**
 * @param {unknown} value
 * @param {number | null} [fallback]
 * @returns {number | null}
 */
function parseInteger(value, fallback = null) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * @param {unknown} value
 * @param {number | null} [fallback]
 * @returns {number | null}
 */
function parseDecimal(value, fallback = null) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * @param {unknown} value
 * @param {boolean} [fallback]
 * @returns {boolean}
 */
function normalizeEnabled(value, fallback = true) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "enabled", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "disabled", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {string}
 */
function requiredString(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${fieldName}不能为空`);
  }
  return normalized;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function optionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized || null;
}

/**
 * @template {Record<PropertyKey, unknown>} T
 * @template {keyof T} K
 * @param {T[]} rows
 * @param {K} key
 * @returns {Record<string, T>}
 */
function mapRowsByKey(rows, key) {
  return rows.reduce((result, row) => {
    result[String(row[key])] = row;
    return result;
  }, /** @type {Record<string, T>} */ ({}));
}

module.exports = {
  parseInteger,
  parseDecimal,
  normalizeEnabled,
  requiredString,
  optionalString,
  mapRowsByKey
};
