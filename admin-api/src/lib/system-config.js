// @ts-check

const { query } = require("./mysql");
const { hasTenantFoundation, resolveCurrentTenantId, resolveDefaultTenantId } = require("./tenant-foundation");

/**
 * @typedef {{
 *   id?: number;
 *   tenantId?: number | null;
 *   configGroup?: string;
 *   configKey: string;
 *   configValueJson?: unknown;
 *   updatedBy?: number | null;
 *   updatedAt?: string | Date | null;
 * }} ConfigRow
 *
 * @typedef {{
 *   execute: (...args: any[]) => Promise<[unknown, unknown?]>
 * }} SqlConnection
 *
 * @typedef {{
 *   connection?: SqlConnection | null;
 *   authContext?: unknown;
 *   tenantId?: string | number | null;
 *   fallbackToDefaultTenant?: boolean;
 *   fallbackToGlobal?: boolean;
 * }} LoadConfigOptions
 */

/**
 * @param {unknown} result
 * @returns {ConfigRow[]}
 */
function asConfigRows(result) {
  return Array.isArray(result) ? /** @type {ConfigRow[]} */ (result) : [];
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function parseMaybeJson(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value === "object") {
    return value;
  }
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * @param {unknown} value
 * @returns {value is SqlConnection}
 */
function isSqlConnection(value) {
  const candidate =
    typeof value === "object" && value
      ? /** @type {{ execute?: unknown }} */ (value)
      : null;
  return typeof candidate?.execute === "function";
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function normalizeTenantId(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {LoadConfigOptions | SqlConnection | null} [options]
 * @returns {{
 *   connection: SqlConnection | null;
 *   authContext: unknown;
 *   tenantId: string | number | null;
 *   fallbackToDefaultTenant: boolean;
 *   fallbackToGlobal: boolean;
 * }}
 */
function normalizeLoadConfigOptions(options = null) {
  if (isSqlConnection(options)) {
    return {
      connection: options,
      authContext: null,
      tenantId: null,
      fallbackToDefaultTenant: true,
      fallbackToGlobal: true
    };
  }

  const safeOptions =
    typeof options === "object" && options
      ? /** @type {LoadConfigOptions} */ (options)
      : /** @type {LoadConfigOptions} */ ({});

  return {
    connection: isSqlConnection(safeOptions.connection) ? safeOptions.connection : null,
    authContext: safeOptions.authContext || null,
    tenantId: safeOptions.tenantId ?? null,
    fallbackToDefaultTenant: safeOptions.fallbackToDefaultTenant !== false,
    fallbackToGlobal: safeOptions.fallbackToGlobal !== false
  };
}

/**
 * @param {string} configGroup
 * @param {number | null | undefined} tenantId
 * @param {SqlConnection | null} [connection]
 * @returns {Promise<ConfigRow[]>}
 */
async function queryConfigGroupRows(configGroup, tenantId, connection = null) {
  const params = /** @type {unknown[]} */ ([configGroup]);
  let statement = `
    SELECT
      id,
      tenant_id AS tenantId,
      config_key AS configKey,
      config_value_json AS configValueJson
    FROM sys_configs
    WHERE config_group = ?
  `;

  if (tenantId === null) {
    statement += " AND tenant_id IS NULL";
  } else if (tenantId !== undefined) {
    statement += " AND tenant_id = ?";
    params.push(tenantId);
  }

  const rows = connection
    ? asConfigRows((await connection.execute(statement, params))[0])
    : asConfigRows(await query(statement, params));
  return rows;
}

/**
 * @param {ConfigRow[]} rows
 * @returns {Record<string, unknown>}
 */
function mapConfigRows(rows) {
  return rows.reduce((result, row) => {
    result[row.configKey] = parseMaybeJson(row.configValueJson);
    return result;
  }, /** @type {Record<string, unknown>} */ ({}));
}

/**
 * @param {LoadConfigOptions | SqlConnection | null} [options]
 * @returns {Promise<number | null | undefined>}
 */
async function resolveConfigTenantId(options = {}) {
  const normalized = normalizeLoadConfigOptions(options);
  const explicitTenantId = normalizeTenantId(normalized.tenantId);
  if (explicitTenantId !== null) {
    return explicitTenantId;
  }

  if (!await hasTenantFoundation(normalized.connection)) {
    return undefined;
  }

  if (normalized.authContext) {
    const currentTenantId = await resolveCurrentTenantId(normalized.authContext, normalized.connection);
    if (currentTenantId) {
      return currentTenantId;
    }
  }

  if (normalized.fallbackToDefaultTenant) {
    return resolveDefaultTenantId(normalized.connection);
  }

  return null;
}

/**
 * @param {string} configGroup
 * @param {LoadConfigOptions | SqlConnection | null} [options]
 * @returns {Promise<Record<string, unknown>>}
 */
async function loadConfigGroup(configGroup, options = null) {
  const normalized = normalizeLoadConfigOptions(options);
  const tenantFoundationEnabled = await hasTenantFoundation(normalized.connection);
  if (!tenantFoundationEnabled) {
    const rows = normalized.connection
      ? asConfigRows((await normalized.connection.execute(
        `SELECT
           config_key AS configKey,
           config_value_json AS configValueJson
         FROM sys_configs
         WHERE config_group = ?`,
        [configGroup]
      ))[0])
      : asConfigRows(await query(
        `SELECT
           config_key AS configKey,
           config_value_json AS configValueJson
         FROM sys_configs
         WHERE config_group = ?`,
        [configGroup]
      ));
    return mapConfigRows(rows);
  }

  const targetTenantId = await resolveConfigTenantId(normalized);
  let rows = await queryConfigGroupRows(configGroup, targetTenantId, normalized.connection);

  if (rows.length === 0 && normalized.fallbackToDefaultTenant) {
    const defaultTenantId = await resolveDefaultTenantId(normalized.connection);
    if (defaultTenantId && defaultTenantId !== targetTenantId) {
      rows = await queryConfigGroupRows(configGroup, defaultTenantId, normalized.connection);
    }
  }

  if (rows.length === 0 && normalized.fallbackToGlobal) {
    rows = await queryConfigGroupRows(configGroup, null, normalized.connection);
  }

  return mapConfigRows(rows);
}

/**
 * @param {string} configGroup
 * @param {string} configKey
 * @param {LoadConfigOptions | SqlConnection | null} [options]
 * @returns {Promise<ConfigRow | null>}
 */
async function loadConfigItem(configGroup, configKey, options = null) {
  const normalized = normalizeLoadConfigOptions(options);
  const tenantFoundationEnabled = await hasTenantFoundation(normalized.connection);
  if (!tenantFoundationEnabled) {
    const rows = normalized.connection
      ? asConfigRows((await normalized.connection.execute(
        `SELECT
           id,
           tenant_id AS tenantId,
           config_group AS configGroup,
           config_key AS configKey,
           config_value_json AS configValueJson,
           updated_by AS updatedBy,
           updated_at AS updatedAt
         FROM sys_configs
         WHERE config_group = ?
           AND config_key = ?
         LIMIT 1`,
        [configGroup, configKey]
      ))[0])
      : asConfigRows(await query(
        `SELECT
           id,
           tenant_id AS tenantId,
           config_group AS configGroup,
           config_key AS configKey,
           config_value_json AS configValueJson,
           updated_by AS updatedBy,
           updated_at AS updatedAt
         FROM sys_configs
         WHERE config_group = ?
           AND config_key = ?
         LIMIT 1`,
        [configGroup, configKey]
      ));
    return rows[0] || null;
  }

  const targetTenantId = await resolveConfigTenantId(normalized);
  const params = /** @type {unknown[]} */ ([configGroup, configKey]);
  let statement = `
    SELECT
      id,
      tenant_id AS tenantId,
      config_group AS configGroup,
      config_key AS configKey,
      config_value_json AS configValueJson,
      updated_by AS updatedBy,
      updated_at AS updatedAt
    FROM sys_configs
    WHERE config_group = ?
      AND config_key = ?
  `;

  if (targetTenantId === null) {
    statement += " AND tenant_id IS NULL";
  } else if (targetTenantId !== undefined) {
    statement += " AND tenant_id = ?";
    params.push(targetTenantId);
  }
  statement += " LIMIT 1";

  let rows = normalized.connection
    ? asConfigRows((await normalized.connection.execute(statement, params))[0])
    : asConfigRows(await query(statement, params));

  if (rows.length === 0 && normalized.fallbackToDefaultTenant) {
    const defaultTenantId = await resolveDefaultTenantId(normalized.connection);
    if (defaultTenantId && defaultTenantId !== targetTenantId) {
      const fallbackParams = /** @type {unknown[]} */ ([configGroup, configKey, defaultTenantId]);
      rows = normalized.connection
        ? asConfigRows((await normalized.connection.execute(
          `SELECT
             id,
             tenant_id AS tenantId,
             config_group AS configGroup,
             config_key AS configKey,
             config_value_json AS configValueJson,
             updated_by AS updatedBy,
             updated_at AS updatedAt
           FROM sys_configs
           WHERE config_group = ?
             AND config_key = ?
             AND tenant_id = ?
           LIMIT 1`,
          fallbackParams
        ))[0])
        : asConfigRows(await query(
          `SELECT
             id,
             tenant_id AS tenantId,
             config_group AS configGroup,
             config_key AS configKey,
             config_value_json AS configValueJson,
             updated_by AS updatedBy,
             updated_at AS updatedAt
           FROM sys_configs
           WHERE config_group = ?
             AND config_key = ?
             AND tenant_id = ?
           LIMIT 1`,
          fallbackParams
        ));
    }
  }

  if (rows.length === 0 && normalized.fallbackToGlobal) {
    rows = normalized.connection
      ? asConfigRows((await normalized.connection.execute(
        `SELECT
           id,
           tenant_id AS tenantId,
           config_group AS configGroup,
           config_key AS configKey,
           config_value_json AS configValueJson,
           updated_by AS updatedBy,
           updated_at AS updatedAt
         FROM sys_configs
         WHERE config_group = ?
           AND config_key = ?
           AND tenant_id IS NULL
         LIMIT 1`,
        [configGroup, configKey]
      ))[0])
      : asConfigRows(await query(
        `SELECT
           id,
           tenant_id AS tenantId,
           config_group AS configGroup,
           config_key AS configKey,
           config_value_json AS configValueJson,
           updated_by AS updatedBy,
           updated_at AS updatedAt
         FROM sys_configs
         WHERE config_group = ?
           AND config_key = ?
           AND tenant_id IS NULL
         LIMIT 1`,
        [configGroup, configKey]
      ));
  }

  return rows[0] || null;
}

module.exports = {
  parseMaybeJson,
  loadConfigGroup,
  loadConfigItem,
  resolveConfigTenantId
};
