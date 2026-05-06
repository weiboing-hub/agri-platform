const crypto = require("crypto");
const config = require("./config");
const { query } = require("./mysql");
const { loadConfigItem, parseMaybeJson } = require("./system-config");
const { extractTenantId } = require("./tenant-foundation");

const DEVICE_CREDENTIAL_CACHE_TTL_MS = 60 * 1000;

let deviceCredentialCache = null;
let deviceCredentialListCache = null;

function maskToken(token) {
  const normalized = String(token || "").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= 12) {
    return `${normalized.slice(0, 4)}...${normalized.slice(-2)}`;
  }
  return `${normalized.slice(0, 8)}...${normalized.slice(-4)}`;
}

function generateDeviceIngestToken() {
  return crypto.randomBytes(24).toString("hex");
}

function normalizeTokenValue(value) {
  const parsed = parseMaybeJson(value);
  return String(parsed || "").trim();
}

function normalizeCredentialCacheOptions(options = null) {
  if (options && typeof options.execute === "function") {
    return {
      connection: options,
      authContext: null,
      tenantId: null
    };
  }
  return {
    connection: options?.connection || null,
    authContext: options?.authContext || null,
    tenantId: options?.tenantId ?? null
  };
}

function buildDeviceCredentialCacheKey(options = null) {
  const normalized = normalizeCredentialCacheOptions(options);
  const tenantId = Number.parseInt(normalized.tenantId, 10) || extractTenantId(normalized.authContext);
  return tenantId ? `tenant:${tenantId}` : "default";
}

async function loadDeviceIngestCredential(options = null) {
  const normalized = normalizeCredentialCacheOptions(options);
  const row = await loadConfigItem("device_credentials", "device_ingest_token", {
    connection: normalized.connection,
    authContext: normalized.authContext,
    tenantId: normalized.tenantId,
    fallbackToDefaultTenant: true,
    fallbackToGlobal: true
  });
  const updatedByNameRows = row?.updatedBy
    ? (normalized.connection
      ? (await normalized.connection.execute(
        `SELECT real_name AS updatedByName FROM sys_users WHERE id = ? LIMIT 1`,
        [row.updatedBy]
      ))[0]
      : await query(
        `SELECT real_name AS updatedByName FROM sys_users WHERE id = ? LIMIT 1`,
        [row.updatedBy]
      ))
    : [];
  const configuredToken = normalizeTokenValue(row?.configValueJson);
  const token = configuredToken || config.deviceIngestToken;

  return {
    id: row?.id || null,
    tenantId: row?.tenantId ? Number(row.tenantId) : null,
    token,
    maskedToken: maskToken(token),
    source: configuredToken ? "database" : "environment",
    updatedAt: row?.updatedAt || null,
    updatedByName: updatedByNameRows[0]?.updatedByName || null
  };
}

async function loadExplicitDeviceIngestCredential(options = null) {
  const normalized = normalizeCredentialCacheOptions(options);
  const row = await loadConfigItem("device_credentials", "device_ingest_token", {
    connection: normalized.connection,
    authContext: normalized.authContext,
    tenantId: normalized.tenantId,
    fallbackToDefaultTenant: false,
    fallbackToGlobal: false
  });
  const configuredToken = normalizeTokenValue(row?.configValueJson);
  return {
    id: row?.id || null,
    tenantId: row?.tenantId ? Number(row.tenantId) : null,
    token: configuredToken || "",
    maskedToken: maskToken(configuredToken),
    source: configuredToken ? "database" : "none",
    updatedAt: row?.updatedAt || null,
    updatedBy: row?.updatedBy || null
  };
}

async function getDeviceIngestCredential(options = null) {
  const cacheKey = buildDeviceCredentialCacheKey(options);
  if (deviceCredentialCache?.key === cacheKey && deviceCredentialCache.expiresAt > Date.now()) {
    return deviceCredentialCache.value;
  }

  const value = await loadDeviceIngestCredential(options);
  deviceCredentialCache = {
    key: cacheKey,
    value,
    expiresAt: Date.now() + DEVICE_CREDENTIAL_CACHE_TTL_MS
  };
  return value;
}

async function getDeviceIngestToken(options = null) {
  const credential = await getDeviceIngestCredential(options);
  return credential.token;
}

async function listDeviceIngestCredentials(connection = null) {
  if (deviceCredentialListCache && deviceCredentialListCache.expiresAt > Date.now()) {
    return deviceCredentialListCache.value;
  }

  const rows = connection
    ? (await connection.execute(
      `SELECT
         c.id,
         c.tenant_id AS tenantId,
         c.config_value_json AS configValueJson,
         c.updated_at AS updatedAt
       FROM sys_configs c
       WHERE c.config_group = 'device_credentials'
         AND c.config_key = 'device_ingest_token'`
    ))[0]
    : await query(
      `SELECT
         c.id,
         c.tenant_id AS tenantId,
         c.config_value_json AS configValueJson,
         c.updated_at AS updatedAt
       FROM sys_configs c
       WHERE c.config_group = 'device_credentials'
         AND c.config_key = 'device_ingest_token'`
    );

  const credentials = rows
    .map((row) => {
      const token = normalizeTokenValue(row.configValueJson);
      if (!token) {
        return null;
      }
      return {
        id: row.id ? Number(row.id) : null,
        tenantId: row.tenantId ? Number(row.tenantId) : null,
        token,
        updatedAt: row.updatedAt || null,
        source: "database"
      };
    })
    .filter(Boolean);

  deviceCredentialListCache = {
    value: credentials,
    expiresAt: Date.now() + DEVICE_CREDENTIAL_CACHE_TTL_MS
  };
  return credentials;
}

async function resolveDeviceIngestCredentialByToken(token, connection = null) {
  const normalized = String(token || "").trim();
  if (!normalized) {
    return null;
  }

  const configuredCredentials = await listDeviceIngestCredentials(connection);
  const matched = configuredCredentials.find((item) => item.token === normalized);
  if (matched) {
    return matched;
  }

  if (normalized === String(config.deviceIngestToken || "").trim()) {
    return {
      id: null,
      tenantId: null,
      token: normalized,
      updatedAt: null,
      source: "environment"
    };
  }

  return null;
}

async function isValidDeviceIngestToken(token) {
  return Boolean(await resolveDeviceIngestCredentialByToken(token));
}

function invalidateDeviceCredentialCache() {
  deviceCredentialCache = null;
  deviceCredentialListCache = null;
}

module.exports = {
  maskToken,
  generateDeviceIngestToken,
  loadDeviceIngestCredential,
  loadExplicitDeviceIngestCredential,
  getDeviceIngestCredential,
  getDeviceIngestToken,
  listDeviceIngestCredentials,
  resolveDeviceIngestCredentialByToken,
  isValidDeviceIngestToken,
  invalidateDeviceCredentialCache
};
