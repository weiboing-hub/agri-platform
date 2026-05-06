const { query } = require("./mysql");
const { AppError } = require("./app-error");
const { parseMaybeJson, loadConfigGroup } = require("./system-config");
const { hasTenantFoundation, extractTenantId, resolveCurrentTenantId } = require("./tenant-foundation");
const { DEFAULT_TENANT_FEATURES, DEFAULT_TENANT_LIMITS } = require("./tenant-provisioning");

const SUBSCRIPTION_STATUSES = new Set(["active", "paused", "expired", "cancelled"]);
const LIMIT_MIN_VALUES = {
  max_users: 1,
  max_gateways: 1,
  max_cameras: 0,
  max_ai_tasks_per_day: 0
};

function normalizeBooleanOverride(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "enabled", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "disabled", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function normalizeIntegerOverride(value, min = 0) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.max(parsed, min);
}

function normalizeFeatureOverrides(rawConfig = {}) {
  const result = {};
  for (const key of Object.keys(DEFAULT_TENANT_FEATURES)) {
    const normalized = normalizeBooleanOverride(rawConfig?.[key]);
    if (normalized !== undefined) {
      result[key] = normalized;
    }
  }
  return result;
}

function normalizeLimitOverrides(rawConfig = {}) {
  const result = {};
  for (const [key, min] of Object.entries(LIMIT_MIN_VALUES)) {
    const normalized = normalizeIntegerOverride(rawConfig?.[key], min);
    if (normalized !== undefined) {
      result[key] = normalized;
    }
  }
  return result;
}

function mergeDefined(target, source) {
  const result = { ...target };
  for (const [key, value] of Object.entries(source || {})) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function normalizeSubscriptionStatus(value, fallback = "active") {
  const normalized = String(value || fallback).trim();
  if (!SUBSCRIPTION_STATUSES.has(normalized)) {
    throw new AppError("invalid_subscription_status", "订阅状态仅支持 active / paused / expired / cancelled", 400);
  }
  return normalized;
}

function normalizeDateTimeValue(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  const normalized = String(value).trim().replace("T", " ");
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) {
    return `${normalized}:00`;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return normalized;
  }
  throw new AppError("invalid_datetime", "订阅时间格式无效", 400);
}

function mapPlanRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: Number(row.planRowId || row.id),
    planCode: row.planCode,
    planName: row.planName,
    planLevel: Number(row.planLevel || 0),
    billingCycle: row.billingCycle,
    status: row.status,
    description: row.description || null,
    isBuiltin: Boolean(Number(row.isBuiltin || 0)),
    features: normalizeFeatureOverrides(parseMaybeJson(row.featuresJson) || {}),
    limits: normalizeLimitOverrides(parseMaybeJson(row.limitsJson) || {}),
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null
  };
}

function mapSubscriptionRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: Number(row.id),
    tenantId: Number(row.tenantId),
    planId: Number(row.planId),
    subscriptionStatus: row.subscriptionStatus,
    startsAt: row.startsAt || null,
    expiresAt: row.expiresAt || null,
    remark: row.remark || null,
    updatedBy: row.updatedBy ? Number(row.updatedBy) : null,
    updatedByName: row.updatedByName || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
    featureOverrides: normalizeFeatureOverrides(parseMaybeJson(row.featureOverridesJson) || {}),
    limitOverrides: normalizeLimitOverrides(parseMaybeJson(row.limitOverridesJson) || {}),
    plan: mapPlanRow(row)
  };
}

async function loadTenantPlans(options = {}) {
  const connection = options.connection || null;
  const includeDisabled = options.includeDisabled === true;
  const params = [];
  const statement = `
    SELECT
      id,
      plan_code AS planCode,
      plan_name AS planName,
      plan_level AS planLevel,
      billing_cycle AS billingCycle,
      status,
      description,
      features_json AS featuresJson,
      limits_json AS limitsJson,
      is_builtin AS isBuiltin,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM sys_tenant_plans
    ${includeDisabled ? "" : "WHERE status = 'enabled'"}
    ORDER BY plan_level ASC, id ASC
  `;
  const rows = connection
    ? (await connection.execute(statement, params))[0]
    : await query(statement, params);
  return rows.map((row) => mapPlanRow(row));
}

async function loadTenantPlanById(planId, options = {}) {
  const normalizedPlanId = Number.parseInt(planId, 10);
  if (!Number.isFinite(normalizedPlanId)) {
    return null;
  }
  const connection = options.connection || null;
  const rows = connection
    ? (await connection.execute(
      `SELECT
         id,
         plan_code AS planCode,
         plan_name AS planName,
         plan_level AS planLevel,
         billing_cycle AS billingCycle,
         status,
         description,
         features_json AS featuresJson,
         limits_json AS limitsJson,
         is_builtin AS isBuiltin,
         created_at AS createdAt,
         updated_at AS updatedAt
       FROM sys_tenant_plans
       WHERE id = ?
       LIMIT 1`,
      [normalizedPlanId]
    ))[0]
    : await query(
      `SELECT
         id,
         plan_code AS planCode,
         plan_name AS planName,
         plan_level AS planLevel,
         billing_cycle AS billingCycle,
         status,
         description,
         features_json AS featuresJson,
         limits_json AS limitsJson,
         is_builtin AS isBuiltin,
         created_at AS createdAt,
         updated_at AS updatedAt
       FROM sys_tenant_plans
       WHERE id = ?
       LIMIT 1`,
      [normalizedPlanId]
    );
  return mapPlanRow(rows[0] || null);
}

async function loadTenantPlanByCode(planCode, options = {}) {
  const normalizedPlanCode = String(planCode || "").trim();
  if (!normalizedPlanCode) {
    return null;
  }
  const connection = options.connection || null;
  const rows = connection
    ? (await connection.execute(
      `SELECT
         id,
         plan_code AS planCode,
         plan_name AS planName,
         plan_level AS planLevel,
         billing_cycle AS billingCycle,
         status,
         description,
         features_json AS featuresJson,
         limits_json AS limitsJson,
         is_builtin AS isBuiltin,
         created_at AS createdAt,
         updated_at AS updatedAt
       FROM sys_tenant_plans
       WHERE plan_code = ?
       LIMIT 1`,
      [normalizedPlanCode]
    ))[0]
    : await query(
      `SELECT
         id,
         plan_code AS planCode,
         plan_name AS planName,
         plan_level AS planLevel,
         billing_cycle AS billingCycle,
         status,
         description,
         features_json AS featuresJson,
         limits_json AS limitsJson,
         is_builtin AS isBuiltin,
         created_at AS createdAt,
         updated_at AS updatedAt
       FROM sys_tenant_plans
       WHERE plan_code = ?
       LIMIT 1`,
      [normalizedPlanCode]
    );
  return mapPlanRow(rows[0] || null);
}

async function loadTenantSubscription(tenantId, options = {}) {
  const normalizedTenantId = Number.parseInt(tenantId, 10);
  if (!Number.isFinite(normalizedTenantId)) {
    return null;
  }

  const connection = options.connection || null;
  if (!await hasTenantFoundation(connection)) {
    return null;
  }

  const statement = `
    SELECT
      s.id,
      s.tenant_id AS tenantId,
      s.plan_id AS planId,
      s.subscription_status AS subscriptionStatus,
      s.starts_at AS startsAt,
      s.expires_at AS expiresAt,
      s.feature_overrides_json AS featureOverridesJson,
      s.limit_overrides_json AS limitOverridesJson,
      s.remark,
      s.updated_by AS updatedBy,
      s.created_at AS createdAt,
      s.updated_at AS updatedAt,
      u.real_name AS updatedByName,
      p.id AS planRowId,
      p.plan_code AS planCode,
      p.plan_name AS planName,
      p.plan_level AS planLevel,
      p.billing_cycle AS billingCycle,
      p.status AS status,
      p.description AS description,
      p.features_json AS featuresJson,
      p.limits_json AS limitsJson,
      p.is_builtin AS isBuiltin
    FROM sys_tenant_subscriptions s
    JOIN sys_tenant_plans p ON p.id = s.plan_id
    LEFT JOIN sys_users u ON u.id = s.updated_by
    WHERE s.tenant_id = ?
    LIMIT 1
  `;
  const rows = connection
    ? (await connection.execute(statement, [normalizedTenantId]))[0]
    : await query(statement, [normalizedTenantId]);
  return mapSubscriptionRow(rows[0] || null);
}

function resolveDefaultPlanCodeForTenantType(tenantType, options = {}) {
  if (options.isDefault === true) {
    return "internal";
  }
  if (tenantType === "trial") {
    return "trial";
  }
  if (tenantType === "internal") {
    return "internal";
  }
  return "standard";
}

async function ensureTenantDefaultSubscription(connection, tenantId, tenantType, updatedBy = null, options = {}) {
  const existingSubscription = await loadTenantSubscription(tenantId, { connection });
  if (existingSubscription) {
    return existingSubscription;
  }

  const plan = await loadTenantPlanByCode(resolveDefaultPlanCodeForTenantType(tenantType, options), { connection });
  if (!plan) {
    return null;
  }

  await connection.execute(
    `INSERT INTO sys_tenant_subscriptions
      (tenant_id, plan_id, subscription_status, starts_at, expires_at, feature_overrides_json, limit_overrides_json, remark, updated_by)
     VALUES (?, ?, 'active', NOW(), NULL, NULL, NULL, ?, ?)`,
    [tenantId, plan.id, "租户默认套餐", updatedBy]
  );

  return loadTenantSubscription(tenantId, { connection });
}

async function upsertTenantSubscription(connection, tenantId, payload = {}) {
  const normalizedTenantId = Number.parseInt(tenantId, 10);
  if (!Number.isFinite(normalizedTenantId)) {
    throw new AppError("invalid_tenant_id", "无效的租户ID", 400);
  }

  const planId = Number.parseInt(payload.planId, 10);
  if (!Number.isFinite(planId)) {
    throw new AppError("invalid_plan_id", "请选择有效的套餐", 400);
  }
  const plan = await loadTenantPlanById(planId, { connection });
  if (!plan) {
    throw new AppError("plan_not_found", "未找到套餐", 404);
  }

  const subscriptionStatus = normalizeSubscriptionStatus(payload.subscriptionStatus || "active");
  const startsAt = normalizeDateTimeValue(payload.startsAt) || new Date();
  const expiresAt = normalizeDateTimeValue(payload.expiresAt);
  const featureOverrides = normalizeFeatureOverrides(payload.featureOverrides || {});
  const limitOverrides = normalizeLimitOverrides(payload.limitOverrides || {});
  const remark = payload.remark ? String(payload.remark).trim() : null;
  const updatedBy = Number.parseInt(payload.updatedBy, 10) || null;

  await connection.execute(
    `INSERT INTO sys_tenant_subscriptions
      (tenant_id, plan_id, subscription_status, starts_at, expires_at, feature_overrides_json, limit_overrides_json, remark, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       plan_id = VALUES(plan_id),
       subscription_status = VALUES(subscription_status),
       starts_at = VALUES(starts_at),
       expires_at = VALUES(expires_at),
       feature_overrides_json = VALUES(feature_overrides_json),
       limit_overrides_json = VALUES(limit_overrides_json),
       remark = VALUES(remark),
       updated_by = VALUES(updated_by)`,
    [
      normalizedTenantId,
      plan.id,
      subscriptionStatus,
      startsAt,
      expiresAt,
      Object.keys(featureOverrides).length ? JSON.stringify(featureOverrides) : null,
      Object.keys(limitOverrides).length ? JSON.stringify(limitOverrides) : null,
      remark,
      updatedBy
    ]
  );

  return loadTenantSubscription(normalizedTenantId, { connection });
}

async function resolveEntitlementTenantId(options = {}) {
  const explicitTenantId = Number.parseInt(options.tenantId, 10);
  if (Number.isFinite(explicitTenantId)) {
    return explicitTenantId;
  }
  return resolveCurrentTenantId(options.authContext || null, options.connection || null);
}

async function loadEffectiveTenantEntitlements(options = {}) {
  const connection = options.connection || null;
  const tenantId = await resolveEntitlementTenantId(options);
  const features = { ...DEFAULT_TENANT_FEATURES };
  const limits = { ...DEFAULT_TENANT_LIMITS };

  if (!tenantId || !await hasTenantFoundation(connection)) {
    return {
      tenantId,
      features,
      limits,
      plan: null,
      subscription: null,
      runtimeFeatureOverrides: {},
      runtimeLimitOverrides: {}
    };
  }

  const subscription = await loadTenantSubscription(tenantId, { connection });
  let effectiveFeatures = { ...features };
  let effectiveLimits = { ...limits };

  if (subscription?.plan) {
    effectiveFeatures = mergeDefined(effectiveFeatures, subscription.plan.features);
    effectiveLimits = mergeDefined(effectiveLimits, subscription.plan.limits);
  }
  effectiveFeatures = mergeDefined(effectiveFeatures, subscription?.featureOverrides || {});
  effectiveLimits = mergeDefined(effectiveLimits, subscription?.limitOverrides || {});

  const runtimeFeatureOverrides = normalizeFeatureOverrides(await loadConfigGroup("tenant_features", {
    connection,
    tenantId,
    fallbackToDefaultTenant: false,
    fallbackToGlobal: false
  }));
  const runtimeLimitOverrides = normalizeLimitOverrides(await loadConfigGroup("tenant_limits", {
    connection,
    tenantId,
    fallbackToDefaultTenant: false,
    fallbackToGlobal: false
  }));

  effectiveFeatures = mergeDefined(effectiveFeatures, runtimeFeatureOverrides);
  effectiveLimits = mergeDefined(effectiveLimits, runtimeLimitOverrides);

  return {
    tenantId,
    features: effectiveFeatures,
    limits: effectiveLimits,
    plan: subscription?.plan || null,
    subscription,
    runtimeFeatureOverrides,
    runtimeLimitOverrides
  };
}

async function countTenantUsage(connection, tenantId, limitKey) {
  if (!tenantId) {
    return 0;
  }

  if (limitKey === "max_users") {
    const [rows] = await connection.execute(
      "SELECT COUNT(*) AS usageCount FROM sys_users WHERE tenant_id = ?",
      [tenantId]
    );
    return Number(rows[0]?.usageCount || 0);
  }

  if (limitKey === "max_gateways") {
    const [rows] = await connection.execute(
      "SELECT COUNT(*) AS usageCount FROM iot_gateways WHERE tenant_id = ?",
      [tenantId]
    );
    return Number(rows[0]?.usageCount || 0);
  }

  if (limitKey === "max_cameras") {
    const [rows] = await connection.execute(
      "SELECT COUNT(*) AS usageCount FROM iot_cameras WHERE tenant_id = ?",
      [tenantId]
    );
    return Number(rows[0]?.usageCount || 0);
  }

  if (limitKey === "max_ai_tasks_per_day") {
    const [rows] = await connection.execute(
      `SELECT COUNT(*) AS usageCount
       FROM ai_tasks
       WHERE tenant_id = ?
         AND DATE(created_at) = CURRENT_DATE()
         AND status <> 'deduped'`,
      [tenantId]
    );
    return Number(rows[0]?.usageCount || 0);
  }

  return 0;
}

async function loadTenantUsageSnapshot(connection, tenantId) {
  const normalizedTenantId = Number.parseInt(tenantId, 10);
  if (!Number.isFinite(normalizedTenantId)) {
    return {
      users: 0,
      gateways: 0,
      cameras: 0,
      aiTasksToday: 0
    };
  }

  const [users, gateways, cameras, aiTasksToday] = await Promise.all([
    countTenantUsage(connection, normalizedTenantId, "max_users"),
    countTenantUsage(connection, normalizedTenantId, "max_gateways"),
    countTenantUsage(connection, normalizedTenantId, "max_cameras"),
    countTenantUsage(connection, normalizedTenantId, "max_ai_tasks_per_day")
  ]);

  return {
    users,
    gateways,
    cameras,
    aiTasksToday
  };
}

async function assertTenantFeatureEnabled(connection, options = {}) {
  const featureKey = String(options.featureKey || "").trim();
  if (!featureKey) {
    return null;
  }

  const entitlements = await loadEffectiveTenantEntitlements({
    connection,
    tenantId: options.tenantId,
    authContext: options.authContext || null
  });

  if (entitlements.features[featureKey] === false) {
    throw new AppError(
      options.errorCode || "tenant_feature_disabled",
      options.message || "当前租户未启用该能力",
      options.httpStatus || 403,
      {
        tenantId: entitlements.tenantId,
        featureKey,
        planCode: entitlements.plan?.planCode || null,
        subscriptionStatus: entitlements.subscription?.subscriptionStatus || null
      }
    );
  }

  return entitlements;
}

async function assertTenantLimitAvailable(connection, options = {}) {
  const tenantId = Number.parseInt(options.tenantId, 10);
  if (!Number.isFinite(tenantId)) {
    return null;
  }

  const limitKey = String(options.limitKey || "").trim();
  if (!limitKey) {
    return null;
  }

  const increment = Number.parseInt(options.increment, 10);
  const requestedIncrement = Number.isFinite(increment) ? Math.max(increment, 0) : 1;
  const entitlements = await loadEffectiveTenantEntitlements({
    connection,
    tenantId
  });
  const limitValue = Number.parseInt(entitlements.limits[limitKey], 10);
  if (!Number.isFinite(limitValue)) {
    return {
      ...entitlements,
      limitValue: null,
      currentUsage: 0
    };
  }

  const currentUsage = await countTenantUsage(connection, tenantId, limitKey);
  if (currentUsage + requestedIncrement > limitValue) {
    throw new AppError(
      options.errorCode || "tenant_limit_exceeded",
      options.message || "当前租户已达到资源上限",
      options.httpStatus || 409,
      {
        tenantId,
        limitKey,
        limitValue,
        currentUsage,
        requestedIncrement,
        planCode: entitlements.plan?.planCode || null,
        subscriptionStatus: entitlements.subscription?.subscriptionStatus || null
      }
    );
  }

  return {
    ...entitlements,
    limitValue,
    currentUsage
  };
}

module.exports = {
  normalizeSubscriptionStatus,
  normalizeFeatureOverrides,
  normalizeLimitOverrides,
  resolveDefaultPlanCodeForTenantType,
  loadTenantPlans,
  loadTenantPlanById,
  loadTenantPlanByCode,
  loadTenantSubscription,
  ensureTenantDefaultSubscription,
  upsertTenantSubscription,
  loadEffectiveTenantEntitlements,
  loadTenantUsageSnapshot,
  assertTenantFeatureEnabled,
  assertTenantLimitAvailable
};
