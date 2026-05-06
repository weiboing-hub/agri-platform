const fs = require("fs/promises");
const path = require("path");
const { query } = require("./mysql");
const { loadConfigGroup } = require("./system-config");

const DEFAULT_MEDIA_STORAGE_CONFIG = {
  storage_provider: "local",
  public_base_url: "",
  bucket_name: "",
  region: "",
  path_prefix: "tenant",
  local_root_path: "/data/agri-media",
  local_public_base_url: ""
};

function normalizeString(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }
  const normalized = String(value).trim();
  return normalized || fallback;
}

function sanitizePathSegment(value, fallback = "unknown") {
  const normalized = normalizeString(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function normalizeMimeExtension(mimeType, fallback = "jpg") {
  const normalized = normalizeString(mimeType).toLowerCase();
  if (normalized === "image/png") {
    return "png";
  }
  if (normalized === "image/webp") {
    return "webp";
  }
  if (normalized === "video/mp4") {
    return "mp4";
  }
  return fallback;
}

function formatDateParts(input) {
  const date = input instanceof Date ? input : new Date(input || Date.now());
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return {
    year: String(safeDate.getFullYear()),
    month: String(safeDate.getMonth() + 1).padStart(2, "0"),
    day: String(safeDate.getDate()).padStart(2, "0")
  };
}

function buildObjectKey(segments = []) {
  return segments
    .map((segment) => String(segment || "").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function normalizeMediaStorageConfig(raw = {}) {
  return {
    storageProvider: sanitizePathSegment(raw.storage_provider || DEFAULT_MEDIA_STORAGE_CONFIG.storage_provider, "local"),
    publicBaseUrl: normalizeString(raw.public_base_url || DEFAULT_MEDIA_STORAGE_CONFIG.public_base_url),
    bucketName: normalizeString(raw.bucket_name || DEFAULT_MEDIA_STORAGE_CONFIG.bucket_name),
    region: normalizeString(raw.region || DEFAULT_MEDIA_STORAGE_CONFIG.region),
    pathPrefix: sanitizePathSegment(raw.path_prefix || DEFAULT_MEDIA_STORAGE_CONFIG.path_prefix, "tenant"),
    localRootPath: normalizeString(raw.local_root_path || DEFAULT_MEDIA_STORAGE_CONFIG.local_root_path),
    localPublicBaseUrl: normalizeString(raw.local_public_base_url || DEFAULT_MEDIA_STORAGE_CONFIG.local_public_base_url)
  };
}

async function loadMediaStorageConfig(options = {}) {
  const raw = await loadConfigGroup("media_storage", options);
  return normalizeMediaStorageConfig(raw);
}

async function loadTenantIdentity(tenantId) {
  const normalizedTenantId = Number.parseInt(tenantId, 10);
  if (!Number.isFinite(normalizedTenantId)) {
    return {
      tenantId: null,
      tenantCode: "default",
      tenantSlug: "default",
      tenantName: "默认租户"
    };
  }

  const rows = await query(
    `SELECT
       id AS tenantId,
       tenant_code AS tenantCode,
       tenant_slug AS tenantSlug,
       tenant_name AS tenantName
     FROM sys_tenants
     WHERE id = ?
     LIMIT 1`,
    [normalizedTenantId]
  );

  if (!rows[0]) {
    return {
      tenantId: normalizedTenantId,
      tenantCode: `tenant-${normalizedTenantId}`,
      tenantSlug: `tenant-${normalizedTenantId}`,
      tenantName: `租户-${normalizedTenantId}`
    };
  }

  return rows[0];
}

function resolveMediaUrl(storageConfig, storedPath) {
  const normalizedPath = normalizeString(storedPath);
  if (!normalizedPath) {
    return "";
  }

  if (/^(https?:|data:|blob:)/.test(normalizedPath)) {
    return normalizedPath;
  }

  if (storageConfig.storageProvider === "local") {
    if (storageConfig.localPublicBaseUrl) {
      return `${storageConfig.localPublicBaseUrl.replace(/\/+$/g, "")}/${normalizedPath.replace(/^\/+/g, "")}`;
    }
    return `/media/${normalizedPath.replace(/^\/+/g, "")}`;
  }

  if (storageConfig.publicBaseUrl) {
    return `${storageConfig.publicBaseUrl.replace(/\/+$/g, "")}/${normalizedPath.replace(/^\/+/g, "")}`;
  }

  return "";
}

function buildSnapshotStoragePaths({ storageConfig, tenantCode, cameraCode, snapshotNo, capturedAt, mimeType, sourceType }) {
  const { year, month, day } = formatDateParts(capturedAt);
  const extension = normalizeMimeExtension(mimeType, "jpg");
  const safeTenantCode = sanitizePathSegment(tenantCode, "default");
  const safeCameraCode = sanitizePathSegment(cameraCode, "camera");
  const safeSourceType = sanitizePathSegment(sourceType, "manual");
  const keyBase = buildObjectKey([
    storageConfig.pathPrefix,
    safeTenantCode,
    "camera",
    safeCameraCode,
    "snapshot",
    safeSourceType,
    year,
    month,
    day
  ]);
  const fileName = `${sanitizePathSegment(snapshotNo, "snapshot")}.${extension}`;
  const thumbFileName = `${sanitizePathSegment(snapshotNo, "snapshot")}-thumb.${extension}`;
  const filePath = buildObjectKey([keyBase, fileName]);
  const thumbnailPath = buildObjectKey([keyBase, "thumb", thumbFileName]);

  return {
    storageProvider: storageConfig.storageProvider,
    filePath,
    thumbnailPath,
    fileUrl: resolveMediaUrl(storageConfig, filePath),
    thumbnailUrl: resolveMediaUrl(storageConfig, thumbnailPath)
  };
}

function buildRecordingStoragePaths({ storageConfig, tenantCode, cameraCode, recordingNo, recordedAt, mimeType }) {
  const { year, month, day } = formatDateParts(recordedAt);
  const extension = normalizeMimeExtension(mimeType, "mp4");
  const safeTenantCode = sanitizePathSegment(tenantCode, "default");
  const safeCameraCode = sanitizePathSegment(cameraCode, "camera");
  const filePath = buildObjectKey([
    storageConfig.pathPrefix,
    safeTenantCode,
    "camera",
    safeCameraCode,
    "recording",
    year,
    month,
    day,
    `${sanitizePathSegment(recordingNo, "recording")}.${extension}`
  ]);

  return {
    storageProvider: storageConfig.storageProvider,
    filePath,
    fileUrl: resolveMediaUrl(storageConfig, filePath)
  };
}

function extractUploadBasename(inputPath, fallbackName) {
  const raw = normalizeString(inputPath);
  if (!raw) {
    return fallbackName;
  }
  const base = path.basename(raw);
  return base || fallbackName;
}

function resolveLocalMediaFilePath(storageConfig, storedPath) {
  const normalizedPath = normalizeString(storedPath);
  if (!normalizedPath) {
    return "";
  }
  return path.join(storageConfig.localRootPath, normalizedPath);
}

async function writeLocalMediaFile(storageConfig, storedPath, buffer) {
  const targetPath = resolveLocalMediaFilePath(storageConfig, storedPath);
  if (!targetPath) {
    throw new Error("未生成有效的媒体文件路径");
  }
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, buffer);
  return targetPath;
}

async function deleteLocalMediaFile(storageConfig, storedPath) {
  const targetPath = resolveLocalMediaFilePath(storageConfig, storedPath);
  if (!targetPath) {
    return false;
  }

  try {
    await fs.unlink(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

module.exports = {
  DEFAULT_MEDIA_STORAGE_CONFIG,
  normalizeMediaStorageConfig,
  loadMediaStorageConfig,
  loadTenantIdentity,
  resolveMediaUrl,
  resolveLocalMediaFilePath,
  writeLocalMediaFile,
  deleteLocalMediaFile,
  buildSnapshotStoragePaths,
  buildRecordingStoragePaths,
  extractUploadBasename,
  sanitizePathSegment
};
