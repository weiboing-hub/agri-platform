// @ts-check

const { optionalString, parseInteger } = require("./helpers");

const FIRMWARE_PACKAGE_STATUSES = ["draft", "released", "disabled"];
const FIRMWARE_JOB_STATUSES = ["pending", "downloading", "upgrading", "success", "failed", "cancelled"];
const ACTIVE_FIRMWARE_JOB_STATUSES = ["pending", "downloading", "upgrading"];

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizePackageStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return FIRMWARE_PACKAGE_STATUSES.includes(normalized) ? normalized : "draft";
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeJobStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return FIRMWARE_JOB_STATUSES.includes(normalized) ? normalized : "pending";
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function normalizeProgressPercent(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, parsed));
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {string}
 */
function requiredVersion(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${fieldName}不能为空`);
  }
  if (normalized.length > 64) {
    throw new Error(`${fieldName}长度不能超过64个字符`);
  }
  return normalized;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeSha256(value) {
  const normalized = optionalString(value);
  if (!normalized) {
    return null;
  }
  const compact = normalized.toLowerCase();
  return /^[a-f0-9]{32,128}$/.test(compact) ? compact : null;
}

function buildFirmwarePackageNo() {
  return `FWPKG-${Date.now()}`.slice(0, 64);
}

function buildFirmwareJobNo() {
  return `FWJOB-${Date.now()}`.slice(0, 64);
}

/**
 * @param {any} row
 */
function formatFirmwarePackageRow(row) {
  return {
    id: parseInteger(row?.id),
    tenantId: parseInteger(row?.tenantId),
    packageNo: row?.packageNo || null,
    deviceType: row?.deviceType || "esp32",
    packageName: row?.packageName || null,
    firmwareVersion: row?.firmwareVersion || null,
    hardwareVersion: row?.hardwareVersion || null,
    downloadUrl: row?.downloadUrl || null,
    fileName: row?.fileName || null,
    fileSizeBytes: row?.fileSizeBytes !== undefined && row?.fileSizeBytes !== null ? Number(row.fileSizeBytes) : null,
    sha256: row?.sha256 || null,
    releaseNote: row?.releaseNote || null,
    status: normalizePackageStatus(row?.status),
    createdBy: parseInteger(row?.createdBy),
    createdAt: row?.createdAt || null,
    updatedAt: row?.updatedAt || null
  };
}

/**
 * @param {any} row
 */
function formatFirmwareJobRow(row) {
  return {
    id: parseInteger(row?.id),
    tenantId: parseInteger(row?.tenantId),
    jobNo: row?.jobNo || null,
    gatewayId: parseInteger(row?.gatewayId),
    gatewayCode: row?.gatewayCode || null,
    gatewayName: row?.gatewayName || null,
    firmwarePackageId: parseInteger(row?.firmwarePackageId),
    packageNo: row?.packageNo || null,
    packageName: row?.packageName || null,
    deviceType: row?.deviceType || "esp32",
    currentVersion: row?.currentVersion || null,
    targetVersion: row?.targetVersion || null,
    reportedVersion: row?.reportedVersion || null,
    triggerSource: row?.triggerSource || "manual",
    status: normalizeJobStatus(row?.status),
    progressPercent: normalizeProgressPercent(row?.progressPercent),
    errorMessage: row?.errorMessage || null,
    requestJson: typeof row?.requestJson === "string" ? safeParseJson(row.requestJson) : row?.requestJson || null,
    startedAt: row?.startedAt || null,
    finishedAt: row?.finishedAt || null,
    lastReportedAt: row?.lastReportedAt || null,
    retryCount: Number(row?.retryCount || 0),
    createdBy: parseInteger(row?.createdBy),
    createdAt: row?.createdAt || null,
    updatedAt: row?.updatedAt || null
  };
}

/**
 * @param {string} value
 */
function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

module.exports = {
  ACTIVE_FIRMWARE_JOB_STATUSES,
  FIRMWARE_JOB_STATUSES,
  FIRMWARE_PACKAGE_STATUSES,
  buildFirmwareJobNo,
  buildFirmwarePackageNo,
  formatFirmwareJobRow,
  formatFirmwarePackageRow,
  normalizeJobStatus,
  normalizePackageStatus,
  normalizeProgressPercent,
  normalizeSha256,
  requiredVersion
};
