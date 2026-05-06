// @ts-check

const { query } = require("./mysql");
const { AppError } = require("./app-error");
const { extractTenantId } = require("./tenant-foundation");

/**
 * @typedef {{
 *   scopeCode?: string | null;
 *   scopeName?: string | null;
 *   scopeType?: string | null;
 *   targetType?: string | null;
 *   targetId?: string | number | null;
 * }} ScopeRow
 *
 * @typedef {{
 *   id?: string | number | null;
 *   tenantId?: string | number | null;
 *   tenantCode?: string | null;
 *   tenantName?: string | null;
 *   tenantSlug?: string | null;
 *   tenantStatus?: string | null;
 *   tenantIsDefault?: boolean | null;
 * } | null} ScopeAuthUser
 *
 * @typedef {{
 *   tenant?: { id?: string | number | null; tenantCode?: string | null; tenantName?: string | null; tenantSlug?: string | null; status?: string | null; isDefault?: boolean | null } | null;
 *   user?: ScopeAuthUser;
 *   dataScopes?: ScopeRow[] | null;
 * } | null} ScopeAuthContext
 */

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function normalizeNumericId(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {unknown} rows
 * @returns {Record<string, unknown>[]}
 */
function asRowArray(rows) {
  return Array.isArray(rows) ? /** @type {Record<string, unknown>[]} */ (rows) : [];
}

/**
 * @param {ScopeAuthContext} authContext
 */
function normalizeAreaScope(authContext) {
  const scopes = Array.isArray(authContext?.dataScopes) ? authContext.dataScopes : [];
  const explicitAreaIds = [];
  let hasAllAreas = false;
  let hasOwnerAreas = false;

  for (const scope of scopes) {
    if (scope?.targetType !== "area") {
      continue;
    }

    if (scope.scopeType === "all") {
      hasAllAreas = true;
      continue;
    }

    if (scope.scopeType === "owner") {
      hasOwnerAreas = true;
      continue;
    }

    const targetId = normalizeNumericId(scope.targetId);
    if (targetId !== null) {
      explicitAreaIds.push(targetId);
    }
  }

  return {
    hasAllAreas,
    hasOwnerAreas,
    explicitAreaIds: Array.from(new Set(explicitAreaIds))
  };
}

/**
 * @param {ScopeAuthContext} authContext
 * @returns {Promise<number[] | null>}
 */
async function resolveAccessibleAreaIds(authContext) {
  const scope = normalizeAreaScope(authContext);
  const tenantId = extractTenantId(authContext);

  if (scope.hasAllAreas && !tenantId) {
    return null;
  }

  const areaIds = [];

  if (scope.hasAllAreas) {
    const filters = [];
    const params = /** @type {unknown[]} */ ([]);
    if (tenantId) {
      filters.push("tenant_id = ?");
      params.push(tenantId);
    }
    const rows = asRowArray(await query(
      `SELECT id
       FROM biz_areas
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}`,
      params
    ));
    rows.forEach((row) => {
      const areaId = normalizeNumericId(row.id);
      if (areaId !== null) {
        areaIds.push(areaId);
      }
    });
    return Array.from(new Set(areaIds));
  }

  if (scope.explicitAreaIds.length > 0) {
    const filters = [`id IN (${scope.explicitAreaIds.map(() => "?").join(", ")})`];
    const params = /** @type {unknown[]} */ ([...scope.explicitAreaIds]);
    if (tenantId) {
      filters.push("tenant_id = ?");
      params.push(tenantId);
    }
    const rows = asRowArray(await query(
      `SELECT id
       FROM biz_areas
       WHERE ${filters.join(" AND ")}`,
      params
    ));
    rows.forEach((row) => {
      const areaId = normalizeNumericId(row.id);
      if (areaId !== null) {
        areaIds.push(areaId);
      }
    });
  }

  if (scope.hasOwnerAreas && Number.isFinite(Number(authContext?.user?.id))) {
    const filters = ["owner_user_id = ?"];
    const params = /** @type {unknown[]} */ ([Number(authContext.user.id)]);
    if (tenantId) {
      filters.push("tenant_id = ?");
      params.push(tenantId);
    }
    const rows = asRowArray(await query(
      `SELECT id
       FROM biz_areas
       WHERE ${filters.join(" AND ")}`,
      params
    ));
    rows.forEach((row) => {
      const areaId = normalizeNumericId(row.id);
      if (areaId !== null) {
        areaIds.push(areaId);
      }
    });
  }

  return Array.from(new Set(areaIds));
}

/**
 * @param {ScopeAuthContext} authContext
 * @returns {Promise<number[] | null>}
 */
async function resolveAccessibleGatewayIds(authContext) {
  const tenantId = extractTenantId(authContext);
  const areaIds = await resolveAccessibleAreaIds(authContext);
  if (areaIds === null && !tenantId) {
    return null;
  }
  if (areaIds !== null && areaIds.length === 0) {
    return [];
  }

  const filters = [];
  const params = [];
  if (tenantId) {
    filters.push("tenant_id = ?");
    params.push(tenantId);
  }
  if (areaIds !== null) {
    filters.push(`area_id IN (${areaIds.map(() => "?").join(", ")})`);
    params.push(...areaIds);
  }

  const rows = asRowArray(await query(
    `SELECT id
     FROM iot_gateways
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}`,
    params
  ));
  return rows
    .map((row) => normalizeNumericId(row.id))
    .filter((gatewayId) => gatewayId !== null);
}

/**
 * @param {ScopeAuthContext} authContext
 * @param {string} [tenantColumn]
 */
function buildTenantScopeFilter(authContext, tenantColumn = "tenant_id") {
  const tenantId = extractTenantId(authContext);
  if (!tenantId) {
    return {
      sql: "",
      params: []
    };
  }

  return {
    sql: `${tenantColumn} = ?`,
    params: [tenantId]
  };
}

/**
 * @param {string[]} filters
 * @param {unknown[]} params
 * @param {ScopeAuthContext} authContext
 * @param {string} [tenantColumn]
 */
function appendTenantScope(filters, params, authContext, tenantColumn = "tenant_id") {
  const scopeFilter = buildTenantScopeFilter(authContext, tenantColumn);
  if (scopeFilter.sql) {
    filters.push(scopeFilter.sql);
    params.push(...scopeFilter.params);
  }
}

/**
 * @param {ScopeAuthContext} authContext
 * @param {string} referenceColumn
 * @param {string} referenceTable
 * @param {string} [referenceIdColumn]
 */
function buildTenantReferenceScopeFilter(
  authContext,
  referenceColumn,
  referenceTable,
  referenceIdColumn = "id"
) {
  const tenantId = extractTenantId(authContext);
  if (!tenantId) {
    return {
      sql: "",
      params: []
    };
  }

  return {
    sql: `${referenceColumn} IN (SELECT ${referenceIdColumn} FROM ${referenceTable} WHERE tenant_id = ?)`,
    params: [tenantId]
  };
}

/**
 * @param {string[]} filters
 * @param {unknown[]} params
 * @param {ScopeAuthContext} authContext
 * @param {string} referenceColumn
 * @param {string} referenceTable
 * @param {string} [referenceIdColumn]
 */
function appendTenantReferenceScope(
  filters,
  params,
  authContext,
  referenceColumn,
  referenceTable,
  referenceIdColumn = "id"
) {
  const scopeFilter = buildTenantReferenceScopeFilter(
    authContext,
    referenceColumn,
    referenceTable,
    referenceIdColumn
  );
  if (scopeFilter.sql) {
    filters.push(scopeFilter.sql);
    params.push(...scopeFilter.params);
  }
}

/**
 * @param {ScopeAuthContext} authContext
 * @param {string} [areaColumn]
 */
function buildAreaScopeFilter(authContext, areaColumn = "area_id") {
  const scope = normalizeAreaScope(authContext);
  if (scope.hasAllAreas) {
    return {
      sql: "",
      params: []
    };
  }

  const clauses = [];
  const params = [];

  if (scope.explicitAreaIds.length > 0) {
    clauses.push(`${areaColumn} IN (${scope.explicitAreaIds.map(() => "?").join(", ")})`);
    params.push(...scope.explicitAreaIds);
  }

  if (scope.hasOwnerAreas && Number.isFinite(Number(authContext?.user?.id))) {
    clauses.push(`${areaColumn} IN (SELECT id FROM biz_areas WHERE owner_user_id = ?)`);
    params.push(Number(authContext.user.id));
  }

  if (clauses.length === 0) {
    return {
      sql: "1 = 0",
      params: []
    };
  }

  return {
    sql: clauses.length === 1 ? clauses[0] : `(${clauses.join(" OR ")})`,
    params
  };
}

/**
 * @param {string[]} filters
 * @param {unknown[]} params
 * @param {ScopeAuthContext} authContext
 * @param {string} [areaColumn]
 */
function appendAreaScope(filters, params, authContext, areaColumn = "area_id") {
  const scopeFilter = buildAreaScopeFilter(authContext, areaColumn);
  if (scopeFilter.sql) {
    filters.push(scopeFilter.sql);
    params.push(...scopeFilter.params);
  }
}

/**
 * @param {ScopeAuthContext} authContext
 * @param {number | string} areaId
 * @returns {Promise<boolean>}
 */
async function hasAreaAccess(authContext, areaId) {
  const normalizedAreaId = normalizeNumericId(areaId);
  if (normalizedAreaId === null) {
    return false;
  }

  const areaIds = await resolveAccessibleAreaIds(authContext);
  if (areaIds === null) {
    return true;
  }
  return areaIds.includes(normalizedAreaId);
}

/**
 * @param {ScopeAuthContext} authContext
 * @param {number | string} areaId
 * @param {string} [message]
 * @returns {Promise<void>}
 */
async function assertAreaAccess(authContext, areaId, message = "没有访问该区域资源的权限") {
  const allowed = await hasAreaAccess(authContext, areaId);
  if (!allowed) {
    throw new AppError("forbidden_scope", message, 403, {
      areaId: normalizeNumericId(areaId)
    });
  }
}

module.exports = {
  normalizeAreaScope,
  resolveAccessibleAreaIds,
  resolveAccessibleGatewayIds,
  buildTenantScopeFilter,
  appendTenantScope,
  buildTenantReferenceScopeFilter,
  appendTenantReferenceScope,
  buildAreaScopeFilter,
  appendAreaScope,
  hasAreaAccess,
  assertAreaAccess
};
