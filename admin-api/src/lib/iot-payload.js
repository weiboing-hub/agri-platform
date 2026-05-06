// @ts-check

/**
 * @typedef {{ tenantId?: string | number | null }} DeviceCredentialLike
 * @typedef {{ tenantFoundationEnabled?: boolean; defaultTenantId?: string | number | null }} ResolveTenantOptions
 * @typedef {{ metricCode: string; metricName: string | null; value: number; unitName: string | null }} IngestMetric
 * @typedef {{
 *   deviceId: string;
 *   deviceName: string;
 *   rssi: number | null;
 *   collectedAt: Date | null;
 *   dataSource: string;
 *   samplingStatus: "running" | "paused";
 *   appliedCommandVersion: number | null;
 *   rawPayload: Record<string, unknown>;
 *   metrics: IngestMetric[];
 * }} NormalizedIngestPayload
 */

/**
 * @param {DeviceCredentialLike | null | undefined} credential
 * @param {ResolveTenantOptions} [options]
 * @returns {number | null}
 */
function resolveDeviceTenantId(credential, options = {}) {
  const explicitTenantId = Number.parseInt(String(credential?.tenantId ?? ""), 10);
  if (Number.isFinite(explicitTenantId)) {
    return explicitTenantId;
  }

  if (!options.tenantFoundationEnabled) {
    return null;
  }

  const defaultTenantId = Number.parseInt(String(options.defaultTenantId ?? ""), 10);
  return Number.isFinite(defaultTenantId) ? defaultTenantId : null;
}

/**
 * @param {Record<string, unknown>} body
 * @returns {NormalizedIngestPayload}
 */
function normalizeIngestPayload(body) {
  const deviceId = requiredTrimmed(body.device_id ?? body.deviceId, "device_id");
  const deviceName = optionalTrimmed(body.name ?? body.deviceName) || deviceId;
  const rssi = toNullableInt(body.rssi);
  const collectedAt = parseCollectedAt(body.collected_at ?? body.collectedAt ?? body.ts ?? body.timestamp);
  const dataSource = optionalTrimmed(body.data_source ?? body.dataSource) || "realtime";
  const samplingStatus = normalizeSamplingStatus(body.sampling_status ?? body.samplingStatus ?? "running");
  const appliedCommandVersion = toNullableInt(body.applied_command_version ?? body.appliedCommandVersion);
  const metrics = Array.isArray(body.metrics) ? buildMetricsFromArray(body.metrics) : buildMetricsFromLegacy(body);

  if (metrics.length === 0) {
    throw new Error("上报内容缺少有效指标");
  }

  return {
    deviceId,
    deviceName,
    rssi,
    collectedAt,
    dataSource,
    samplingStatus,
    appliedCommandVersion,
    rawPayload: body,
    metrics
  };
}

/**
 * @param {Record<string, unknown>} body
 * @returns {IngestMetric[]}
 */
function buildMetricsFromLegacy(body) {
  const metrics = [];
  const temp = toNullableNumber(body.temp);
  const hum = toNullableNumber(body.hum ?? body.humidity);

  if (temp !== null) {
    metrics.push({
      metricCode: "temperature",
      metricName: "温度",
      value: temp,
      unitName: "℃"
    });
  }

  if (hum !== null) {
    metrics.push({
      metricCode: "humidity",
      metricName: "湿度",
      value: hum,
      unitName: "%"
    });
  }

  return metrics;
}

/**
 * @param {unknown[]} items
 * @returns {IngestMetric[]}
 */
function buildMetricsFromArray(items) {
  return items
    .map((item) => {
      const record = /** @type {Record<string, unknown>} */ (item ?? {});
      const metricCode = optionalTrimmed(record.metricCode ?? record.metric_code);
      const value = toNullableNumber(record.value);
      if (!metricCode || value === null) {
        return null;
      }
      return {
        metricCode,
        metricName: optionalTrimmed(record.metricName ?? record.metric_name) || null,
        value,
        unitName: optionalTrimmed(record.unitName ?? record.unit_name) || null
      };
    })
    .filter((item) => item !== null);
}

/**
 * @param {unknown} value
 * @returns {"running" | "paused"}
 */
function normalizeSamplingStatus(value) {
  const normalized = optionalTrimmed(value) || "running";
  if (!["running", "paused"].includes(normalized)) {
    throw new Error("samplingStatus 仅支持 running 或 paused");
  }
  return /** @type {"running" | "paused"} */ (normalized);
}

/**
 * @param {number} delayMs
 * @returns {"high" | "medium" | "low"}
 */
function classifyTimeQuality(delayMs) {
  if (delayMs <= 5000) {
    return "high";
  }
  if (delayMs <= 60000) {
    return "medium";
  }
  return "low";
}

/**
 * @param {unknown} deviceId
 * @param {unknown} metricCode
 * @returns {string}
 */
function buildSensorCode(deviceId, metricCode) {
  const deviceCode = sanitizeCode(deviceId, 32);
  const metricPart = sanitizeCode(metricCode, 20);
  return `SNS-${deviceCode}-${metricPart}`.slice(0, 64);
}

/**
 * @param {unknown} value
 * @param {number} [maxLength]
 * @returns {string}
 */
function sanitizeCode(value, maxLength = 32) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength) || "AUTO";
}

/**
 * @param {unknown} value
 * @returns {Date | null}
 */
function parseCollectedAt(value) {
  if (!value) {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("collectedAt 时间格式无效");
  }
  return parsed;
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {string}
 */
function requiredTrimmed(value, fieldName) {
  const normalized = optionalTrimmed(value);
  if (!normalized) {
    throw new Error(`${fieldName}不能为空`);
  }
  return normalized;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function optionalTrimmed(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized || null;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function toNullableNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function toNullableInt(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const numeric = Number.parseInt(String(value), 10);
  return Number.isFinite(numeric) ? numeric : null;
}

module.exports = {
  resolveDeviceTenantId,
  normalizeIngestPayload,
  buildMetricsFromLegacy,
  buildMetricsFromArray,
  normalizeSamplingStatus,
  classifyTimeQuality,
  buildSensorCode,
  sanitizeCode,
  parseCollectedAt,
  requiredTrimmed,
  optionalTrimmed,
  toNullableNumber,
  toNullableInt
};
