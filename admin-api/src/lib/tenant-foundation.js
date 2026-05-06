// @ts-check

const { query } = require("./mysql");

const TENANT_FOUNDATION_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_TENANT_CODE = "default";
const DEFAULT_TENANT_NAME = "默认租户";

/**
 * @typedef {{
 *   id: number | null;
 *   tenantCode: string;
 *   tenantName: string;
 *   tenantSlug: string | null;
 *   status: string;
 *   isDefault: boolean;
 *   source: "implicit" | "database";
 * }} TenantSummary
 *
 * @typedef {{
 *   tenant?: { id?: string | number | null; tenantCode?: string | null; tenantName?: string | null; tenantSlug?: string | null; status?: string | null; isDefault?: boolean | null } | null;
 *   user?: { tenantId?: string | number | null; tenantCode?: string | null; tenantName?: string | null; tenantSlug?: string | null; tenantStatus?: string | null; tenantIsDefault?: boolean | null } | null;
 * } | null} TenantAuthContext
 *
 * @typedef {{
 *   execute: (...args: any[]) => Promise<[unknown, unknown?]>
 * }} SqlConnection
 *
 * @typedef {{ value: boolean; expiresAt: number } | null} TenantFoundationCache
 */

/** @type {TenantFoundationCache} */
let tenantFoundationCache = null;

/**
 * @param {unknown} result
 * @returns {Record<string, unknown>[]}
 */
function asRowArray(result) {
  return Array.isArray(result) ? /** @type {Record<string, unknown>[]} */ (result) : [];
}

/**
 * @returns {TenantSummary}
 */
function buildImplicitTenant() {
  return {
    id: null,
    tenantCode: DEFAULT_TENANT_CODE,
    tenantName: DEFAULT_TENANT_NAME,
    tenantSlug: DEFAULT_TENANT_CODE,
    status: "enabled",
    isDefault: true,
    source: "implicit"
  };
}

/**
 * @param {TenantAuthContext} [authContext]
 * @returns {number | null}
 */
function extractTenantId(authContext = null) {
  const rawTenantId = authContext?.tenant?.id ?? authContext?.user?.tenantId ?? null;
  const tenantId = Number.parseInt(String(rawTenantId ?? ""), 10);
  return Number.isFinite(tenantId) ? tenantId : null;
}

/**
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {TenantSummary}
 */
function normalizeTenantRow(row) {
  if (!row || (!row.tenantId && !row.tenantCode && !row.tenantName)) {
    return buildImplicitTenant();
  }

  return {
    id: row.tenantId ? Number(row.tenantId) : null,
    tenantCode: String(row.tenantCode || DEFAULT_TENANT_CODE),
    tenantName: String(row.tenantName || DEFAULT_TENANT_NAME),
    tenantSlug: row.tenantSlug ? String(row.tenantSlug) : null,
    status: String(row.tenantStatus || "enabled"),
    isDefault: Boolean(Number(row.tenantIsDefault || 0)),
    source: "database"
  };
}

/**
 * @param {unknown} identifier
 * @returns {string | null}
 */
function normalizeTenantIdentifier(identifier) {
  if (identifier === undefined || identifier === null) {
    return null;
  }
  const normalized = String(identifier).trim();
  return normalized || null;
}

/**
 * @param {SqlConnection | null} [connection]
 * @returns {Promise<boolean>}
 */
async function hasTenantFoundation(connection = null) {
  if (tenantFoundationCache && tenantFoundationCache.expiresAt > Date.now()) {
    return tenantFoundationCache.value;
  }

  const statement = `
    SELECT
      EXISTS(
        SELECT 1
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'sys_tenants'
      ) AS hasTenantTable,
      EXISTS(
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'sys_users'
          AND COLUMN_NAME = 'tenant_id'
      ) AS hasUserTenantColumn
  `;
  const rows = connection
    ? asRowArray((await connection.execute(statement))[0])
    : asRowArray(await query(statement));
  const enabled = Boolean(
    Number(rows[0]?.hasTenantTable || 0) && Number(rows[0]?.hasUserTenantColumn || 0)
  );

  tenantFoundationCache = {
    value: enabled,
    expiresAt: Date.now() + TENANT_FOUNDATION_CACHE_TTL_MS
  };
  return enabled;
}

/**
 * @param {SqlConnection | null} [connection]
 * @returns {Promise<TenantSummary>}
 */
async function resolveDefaultTenant(connection = null) {
  if (!await hasTenantFoundation(connection)) {
    return buildImplicitTenant();
  }

  const statement = `
    SELECT
      id AS tenantId,
      tenant_code AS tenantCode,
      tenant_name AS tenantName,
      tenant_slug AS tenantSlug,
      status AS tenantStatus,
      is_default AS tenantIsDefault
    FROM sys_tenants
    WHERE is_default = 1
       OR tenant_code = ?
    ORDER BY is_default DESC, id ASC
    LIMIT 1
  `;
  const rows = connection
    ? asRowArray((await connection.execute(statement, [DEFAULT_TENANT_CODE]))[0])
    : asRowArray(await query(statement, [DEFAULT_TENANT_CODE]));
  return normalizeTenantRow(rows[0] || null);
}

/**
 * @param {SqlConnection | null} [connection]
 * @returns {Promise<number | null>}
 */
async function resolveDefaultTenantId(connection = null) {
  const tenant = await resolveDefaultTenant(connection);
  return Number.isFinite(Number(tenant.id)) ? Number(tenant.id) : null;
}

/**
 * @param {TenantAuthContext} [authContext]
 * @param {SqlConnection | null} [connection]
 * @returns {Promise<TenantSummary>}
 */
async function resolveCurrentTenant(authContext = null, connection = null) {
  if (authContext?.tenant) {
    return normalizeTenantRow({
      tenantId: authContext.tenant.id,
      tenantCode: authContext.tenant.tenantCode,
      tenantName: authContext.tenant.tenantName,
      tenantSlug: authContext.tenant.tenantSlug,
      tenantStatus: authContext.tenant.status,
      tenantIsDefault: authContext.tenant.isDefault ? 1 : 0
    });
  }

  if (authContext?.user?.tenantId || authContext?.user?.tenantCode || authContext?.user?.tenantName) {
    return normalizeTenantRow({
      tenantId: authContext.user.tenantId,
      tenantCode: authContext.user.tenantCode,
      tenantName: authContext.user.tenantName,
      tenantSlug: authContext.user.tenantSlug,
      tenantStatus: authContext.user.tenantStatus,
      tenantIsDefault: authContext.user.tenantIsDefault ? 1 : 0
    });
  }

  return resolveDefaultTenant(connection);
}

/**
 * @param {TenantAuthContext} [authContext]
 * @param {SqlConnection | null} [connection]
 * @returns {Promise<number | null>}
 */
async function resolveCurrentTenantId(authContext = null, connection = null) {
  const currentTenantId = extractTenantId(authContext);
  if (currentTenantId) {
    return currentTenantId;
  }

  const tenant = await resolveCurrentTenant(authContext, connection);
  return Number.isFinite(Number(tenant.id)) ? Number(tenant.id) : null;
}

function invalidateTenantFoundationCache() {
  tenantFoundationCache = null;
}

/**
 * @param {unknown} identifier
 * @param {{ execute: (sql: string, values?: unknown[]) => Promise<[Record<string, unknown>[]]> } | null} [connection]
 * @returns {Promise<TenantSummary | null>}
 */
async function resolveTenantByIdentifier(identifier, connection = null) {
  const normalizedIdentifier = normalizeTenantIdentifier(identifier);
  if (!normalizedIdentifier) {
    return resolveDefaultTenant(connection);
  }

  if (!await hasTenantFoundation(connection)) {
    const implicitTenant = buildImplicitTenant();
    return normalizedIdentifier === implicitTenant.tenantCode || normalizedIdentifier === implicitTenant.tenantSlug
      ? implicitTenant
      : null;
  }

  const statement = `
    SELECT
      id AS tenantId,
      tenant_code AS tenantCode,
      tenant_name AS tenantName,
      tenant_slug AS tenantSlug,
      status AS tenantStatus,
      is_default AS tenantIsDefault
    FROM sys_tenants
    WHERE status = 'enabled'
      AND (tenant_code = ? OR tenant_slug = ?)
    ORDER BY is_default DESC, id ASC
    LIMIT 1
  `;
  const rows = connection
    ? asRowArray((await connection.execute(statement, [normalizedIdentifier, normalizedIdentifier]))[0])
    : asRowArray(await query(statement, [normalizedIdentifier, normalizedIdentifier]));
  return rows[0] ? normalizeTenantRow(rows[0]) : null;
}

/**
 * @param {{ execute: (sql: string, values?: unknown[]) => Promise<[Record<string, unknown>[]]> } | null} [connection]
 * @returns {Promise<TenantSummary[]>}
 */
async function listEnabledTenants(connection = null) {
  if (!await hasTenantFoundation(connection)) {
    return [buildImplicitTenant()];
  }

  const statement = `
    SELECT
      id AS tenantId,
      tenant_code AS tenantCode,
      tenant_name AS tenantName,
      tenant_slug AS tenantSlug,
      status AS tenantStatus,
      is_default AS tenantIsDefault
    FROM sys_tenants
    WHERE status = 'enabled'
    ORDER BY is_default DESC, tenant_name ASC, id ASC
  `;
  const rows = connection
    ? asRowArray((await connection.execute(statement))[0])
    : asRowArray(await query(statement));
  return rows.map((row) => normalizeTenantRow(row));
}

module.exports = {
  DEFAULT_TENANT_CODE,
  DEFAULT_TENANT_NAME,
  buildImplicitTenant,
  extractTenantId,
  normalizeTenantRow,
  normalizeTenantIdentifier,
  hasTenantFoundation,
  resolveDefaultTenant,
  resolveTenantByIdentifier,
  resolveDefaultTenantId,
  resolveCurrentTenant,
  resolveCurrentTenantId,
  listEnabledTenants,
  invalidateTenantFoundationCache
};
