// @ts-check

const fs = require("fs/promises");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const config = require("../lib/config");
const { pool, query } = require("../lib/mysql");
const { ok, fail } = require("../lib/response");
const { requiredString, optionalString, parseInteger, parseDecimal } = require("../lib/helpers");
const { hashPassword } = require("../lib/security");
const { invalidateAuthCache, invalidateAuthCacheForUsers, clearAuthCache } = require("../lib/auth");
const { logOperation } = require("../lib/audit");
const { testAiProvider } = require("../lib/ai-provider");
const { testNotificationChannel } = require("../lib/notification-provider");
const { AppError } = require("../lib/app-error");
const { clearLoginRateLimitBuckets } = require("../lib/rate-limit");
const { appendTenantScope } = require("../lib/data-scope");
const { loadConfigGroup } = require("../lib/system-config");
const {
  getDeviceIngestCredential,
  loadExplicitDeviceIngestCredential,
  generateDeviceIngestToken,
  invalidateDeviceCredentialCache
} = require("../lib/device-credentials");
const {
  loadTenantRuntimeSettings,
  normalizeTenantFeatures,
  normalizeTenantLimits,
  buildTenantRuntimeConfigItems,
  upsertConfigItems,
  bootstrapTenantWorkspace
} = require("../lib/tenant-provisioning");
const {
  loadTenantPlans,
  loadTenantSubscription,
  ensureTenantDefaultSubscription,
  upsertTenantSubscription,
  loadEffectiveTenantEntitlements,
  loadTenantUsageSnapshot,
  assertTenantLimitAvailable
} = require("../lib/tenant-entitlements");
const {
  extractTenantId,
  hasTenantFoundation,
  resolveCurrentTenantId,
  resolveDefaultTenantId,
  invalidateTenantFoundationCache
} = require("../lib/tenant-foundation");

const execFileAsync = promisify(execFile);

/**
 * @typedef {{
 *   execute: (sql: string, values?: any) => Promise<[any, any?]>
 * }} SqlExecutor
 */

/**
 * @template T
 * @param {any} rows
 * @returns {T[]}
 */
function asRowArray(rows) {
  return Array.isArray(rows) ? rows : [];
}

/**
 * @param {any} result
 * @returns {number}
 */
function getInsertId(result) {
  return Number(result?.insertId || 0);
}

async function systemRoutes(app) {
  app.get(
    "/api/v1/system/theme",
    {
      preHandler: [app.authenticate]
    },
    async (request) => {
      const appearanceConfig = await loadConfigGroup("appearance", {
        authContext: request.auth,
        fallbackToDefaultTenant: true,
        fallbackToGlobal: true
      });
      const themePreset = appearanceConfig.theme_preset || "forest";
      return ok({ themePreset });
    }
  );

  app.get(
    "/api/v1/system/tenants",
    {
      preHandler: [app.requirePermissions(["tenant:manage"])]
    },
    async (request, reply) => {
      try {
        await assertTenantManagementAllowed(request.auth);

        const keyword = String(request.query?.keyword || "").trim();
        const status = String(request.query?.status || "").trim();
        const tenantType = String(request.query?.tenantType || "").trim();

        const filters = [];
        const params = [];

        if (keyword) {
          filters.push(`(
            t.tenant_code LIKE ?
            OR t.tenant_name LIKE ?
            OR t.tenant_slug LIKE ?
            OR t.contact_name LIKE ?
            OR t.contact_phone LIKE ?
            OR t.contact_email LIKE ?
          )`);
          params.push(
            `%${keyword}%`,
            `%${keyword}%`,
            `%${keyword}%`,
            `%${keyword}%`,
            `%${keyword}%`,
            `%${keyword}%`
          );
        }
        if (status) {
          filters.push("t.status = ?");
          params.push(status);
        }
        if (tenantType) {
          filters.push("t.tenant_type = ?");
          params.push(tenantType);
        }

        const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
        const rows = await query(
          `SELECT
             t.id,
             t.tenant_code AS tenantCode,
             t.tenant_name AS tenantName,
             t.tenant_slug AS tenantSlug,
             t.tenant_type AS tenantType,
             t.status,
             t.is_default AS isDefault,
             t.contact_name AS contactName,
             t.contact_phone AS contactPhone,
             t.contact_email AS contactEmail,
             t.expires_at AS expiresAt,
             t.remark,
             t.created_at AS createdAt,
             t.updated_at AS updatedAt,
             (SELECT COUNT(*) FROM sys_users u WHERE u.tenant_id = t.id) AS userCount,
             (SELECT COUNT(*) FROM biz_areas a WHERE a.tenant_id = t.id) AS areaCount,
             (SELECT COUNT(*) FROM iot_gateways g WHERE g.tenant_id = t.id) AS gatewayCount
           FROM sys_tenants t
           ${whereClause}
           ORDER BY t.is_default DESC, t.updated_at DESC, t.id DESC`,
          params
        );

        return ok(
          rows.map((row) => ({
            ...row,
            isDefault: Boolean(Number(row.isDefault || 0)),
            userCount: Number(row.userCount || 0),
            areaCount: Number(row.areaCount || 0),
            gatewayCount: Number(row.gatewayCount || 0),
            loginEntry: row.tenantSlug ? `/login?tenant=${encodeURIComponent(row.tenantSlug)}` : null
          }))
        );
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.post(
    "/api/v1/system/tenants",
    {
      preHandler: [app.requirePermissions(["tenant:manage"])]
    },
    async (request, reply) => {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await assertTenantManagementAllowed(request.auth, connection);

        const tenantCode = normalizeTenantCode(requiredString(request.body?.tenantCode, "tenantCode"));
        const tenantName = requiredString(request.body?.tenantName, "tenantName");
        const tenantSlug = normalizeTenantSlug(optionalString(request.body?.tenantSlug) || tenantCode);
        const tenantType = normalizeTenantType(optionalString(request.body?.tenantType) || "enterprise");
        const status = normalizeTenantStatus(optionalString(request.body?.status) || "enabled");
        const isDefault = request.body?.isDefault ? 1 : 0;
        const contactName = optionalString(request.body?.contactName);
        const contactPhone = optionalString(request.body?.contactPhone);
        const contactEmail = optionalString(request.body?.contactEmail);
        const expiresAt = normalizeDateTimeInput(optionalString(request.body?.expiresAt), "expiresAt");
        const remark = optionalString(request.body?.remark);

        if (isDefault && status !== "enabled") {
          throw new AppError("default_tenant_requires_enabled", "默认租户必须保持启用状态", 400);
        }

        if (isDefault) {
          await connection.execute("UPDATE sys_tenants SET is_default = 0 WHERE is_default = 1");
        }

        const [result] = await connection.execute(
          `INSERT INTO sys_tenants
            (tenant_code, tenant_name, tenant_slug, tenant_type, status, is_default,
             contact_name, contact_phone, contact_email, expires_at, remark)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tenantCode,
            tenantName,
            tenantSlug,
            tenantType,
            status,
            isDefault,
            contactName,
            contactPhone,
            contactEmail,
            expiresAt,
            remark
          ]
        );
        const createdTenantId = getInsertId(result);

        await ensureTenantDefaultSubscription(connection, createdTenantId, tenantType, request.auth.user.id, {
          isDefault: Boolean(isDefault),
          tenantCode
        });
        await connection.commit();
        invalidateTenantFoundationCache();

        await logOperation(request, {
          moduleCode: "system_tenant",
          operationType: "create",
          targetType: "sys_tenants",
          targetId: createdTenantId,
          requestParams: {
            tenantCode,
            tenantName,
            tenantSlug,
            tenantType,
            status,
            isDefault
          },
          resultMessage: "创建租户"
        });

        return ok({ insertId: createdTenantId }, "租户创建成功");
      } catch (error) {
        await connection.rollback();
        return fail(reply, tenantPersistenceErrorStatus(error), tenantPersistenceErrorMessage(error), error.code || "bad_request", error.details || null);
      } finally {
        connection.release();
      }
    }
  );

  app.put(
    "/api/v1/system/tenants/:id",
    {
      preHandler: [app.requirePermissions(["tenant:manage"])]
    },
    async (request, reply) => {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await assertTenantManagementAllowed(request.auth, connection);

        const tenantId = parseInteger(request.params.id);
        if (!tenantId) {
          return fail(reply, 400, "无效的租户ID");
        }

        const targetTenant = await loadTenantById(tenantId, connection);
        if (!targetTenant) {
          await connection.rollback();
          return fail(reply, 404, "未找到租户", "not_found");
        }

        const nextTenantCode = normalizeTenantCode(optionalString(request.body?.tenantCode) || targetTenant.tenantCode);
        if (nextTenantCode !== targetTenant.tenantCode) {
          throw new AppError("tenant_code_immutable", "租户编码创建后不可修改", 400);
        }

        const tenantName = requiredString(request.body?.tenantName, "tenantName");
        const tenantSlug = normalizeTenantSlug(optionalString(request.body?.tenantSlug) || targetTenant.tenantSlug || targetTenant.tenantCode);
        const tenantType = normalizeTenantType(optionalString(request.body?.tenantType) || targetTenant.tenantType);
        const status = normalizeTenantStatus(optionalString(request.body?.status) || targetTenant.status);
        const isDefault = request.body?.isDefault ? 1 : 0;
        const contactName = optionalString(request.body?.contactName);
        const contactPhone = optionalString(request.body?.contactPhone);
        const contactEmail = optionalString(request.body?.contactEmail);
        const expiresAt = normalizeDateTimeInput(optionalString(request.body?.expiresAt), "expiresAt");
        const remark = optionalString(request.body?.remark);

        if (targetTenant.isDefault && status !== "enabled") {
          throw new AppError("default_tenant_requires_enabled", "默认租户必须保持启用，请先将其他租户设为默认", 400);
        }
        if (targetTenant.isDefault && !isDefault) {
          throw new AppError("default_tenant_requires_replacement", "请先将其他租户设为默认租户", 400);
        }
        if (isDefault && status !== "enabled") {
          throw new AppError("default_tenant_requires_enabled", "默认租户必须保持启用状态", 400);
        }

        if (isDefault) {
          await connection.execute("UPDATE sys_tenants SET is_default = 0 WHERE id <> ?", [tenantId]);
        }

        await connection.execute(
          `UPDATE sys_tenants
           SET tenant_name = ?,
               tenant_slug = ?,
               tenant_type = ?,
               status = ?,
               is_default = ?,
               contact_name = ?,
               contact_phone = ?,
               contact_email = ?,
               expires_at = ?,
               remark = ?
           WHERE id = ?`,
          [
            tenantName,
            tenantSlug,
            tenantType,
            status,
            isDefault,
            contactName,
            contactPhone,
            contactEmail,
            expiresAt,
            remark,
            tenantId
          ]
        );

        await connection.commit();
        invalidateTenantFoundationCache();

        await logOperation(request, {
          moduleCode: "system_tenant",
          operationType: "update",
          targetType: "sys_tenants",
          targetId: tenantId,
          requestParams: {
            tenantName,
            tenantSlug,
            tenantType,
            status,
            isDefault
          },
          resultMessage: "更新租户"
        });

        return ok({ id: tenantId }, "租户更新成功");
      } catch (error) {
        await connection.rollback();
        return fail(reply, tenantPersistenceErrorStatus(error), tenantPersistenceErrorMessage(error), error.code || "bad_request", error.details || null);
      } finally {
        connection.release();
      }
    }
  );

  app.get(
    "/api/v1/system/tenant-plans",
    {
      preHandler: [app.requirePermissions(["tenant:manage"])]
    },
    async (request, reply) => {
      try {
        await assertTenantManagementAllowed(request.auth);
        const includeDisabled = String(request.query?.includeDisabled || "").trim() === "true";
        const plans = await loadTenantPlans({ includeDisabled });
        return ok(plans);
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.get(
    "/api/v1/system/tenants/:id/subscription",
    {
      preHandler: [app.requirePermissions(["tenant:manage"])]
    },
    async (request, reply) => {
      try {
        await assertTenantManagementAllowed(request.auth);
        const tenantId = parseInteger(request.params.id);
        if (!tenantId) {
          return fail(reply, 400, "无效的租户ID");
        }

        const connection = await pool.getConnection();
        try {
          const targetTenant = await loadTenantById(tenantId, connection);
          if (!targetTenant) {
            return fail(reply, 404, "未找到租户", "not_found");
          }

          const [subscription, entitlements, usage] = await Promise.all([
            loadTenantSubscription(tenantId, { connection }),
            loadEffectiveTenantEntitlements({ connection, tenantId }),
            loadTenantUsageSnapshot(connection, tenantId)
          ]);

          return ok({
            tenant: targetTenant,
            subscription,
            effectiveFeatures: entitlements.features,
            effectiveLimits: entitlements.limits,
            runtimeFeatureOverrides: entitlements.runtimeFeatureOverrides,
            runtimeLimitOverrides: entitlements.runtimeLimitOverrides,
            usage
          });
        } finally {
          connection.release();
        }
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.put(
    "/api/v1/system/tenants/:id/subscription",
    {
      preHandler: [app.requirePermissions(["tenant:manage"])]
    },
    async (request, reply) => {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await assertTenantManagementAllowed(request.auth, connection);

        const tenantId = parseInteger(request.params.id);
        if (!tenantId) {
          return fail(reply, 400, "无效的租户ID");
        }

        const targetTenant = await loadTenantById(tenantId, connection);
        if (!targetTenant) {
          await connection.rollback();
          return fail(reply, 404, "未找到租户", "not_found");
        }

        const subscription = await upsertTenantSubscription(connection, tenantId, {
          planId: request.body?.planId,
          subscriptionStatus: optionalString(request.body?.subscriptionStatus) || "active",
          startsAt: optionalString(request.body?.startsAt),
          expiresAt: optionalString(request.body?.expiresAt),
          featureOverrides: request.body?.featureOverrides || {},
          limitOverrides: request.body?.limitOverrides || {},
          remark: optionalString(request.body?.remark),
          updatedBy: request.auth.user.id
        });

        await connection.commit();

        await logOperation(request, {
          moduleCode: "system_tenant",
          operationType: "update_subscription",
          targetType: "sys_tenants",
          targetId: tenantId,
          requestParams: {
            tenantCode: targetTenant.tenantCode,
            planId: subscription?.planId || null,
            planCode: subscription?.plan?.planCode || null,
            subscriptionStatus: subscription?.subscriptionStatus || null
          },
          resultMessage: "更新租户套餐订阅"
        });

        return ok({
          tenantId,
          subscription
        }, "租户套餐订阅已保存");
      } catch (error) {
        await connection.rollback();
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      } finally {
        connection.release();
      }
    }
  );

  app.get(
    "/api/v1/system/tenants/:id/runtime-settings",
    {
      preHandler: [app.requirePermissions(["tenant:manage"])]
    },
    async (request, reply) => {
      try {
        await assertTenantManagementAllowed(request.auth);
        const tenantId = parseInteger(request.params.id);
        if (!tenantId) {
          return fail(reply, 400, "无效的租户ID");
        }

        const connection = await pool.getConnection();
        try {
          const runtime = await loadTenantRuntimeSettings(connection, tenantId);
          if (!runtime) {
            return fail(reply, 404, "未找到租户", "not_found");
          }

          const [effectiveCredential, entitlements] = await Promise.all([
            getDeviceIngestCredential({ connection, tenantId }),
            loadEffectiveTenantEntitlements({ connection, tenantId })
          ]);
          return ok({
            features: entitlements.features,
            limits: entitlements.limits,
            runtimeFeatureOverrides: entitlements.runtimeFeatureOverrides,
            runtimeLimitOverrides: entitlements.runtimeLimitOverrides,
            stats: runtime.stats,
            explicitCredentialConfigured: runtime.explicitCredentialConfigured,
            credential: {
              deviceIngestTokenMasked: effectiveCredential.maskedToken,
              tokenSource: effectiveCredential.source,
              updatedAt: effectiveCredential.updatedAt,
              updatedByName: effectiveCredential.updatedByName
            }
          });
        } finally {
          connection.release();
        }
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.put(
    "/api/v1/system/tenants/:id/runtime-settings",
    {
      preHandler: [app.requirePermissions(["tenant:manage"])]
    },
    async (request, reply) => {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await assertTenantManagementAllowed(request.auth, connection);

        const tenantId = parseInteger(request.params.id);
        if (!tenantId) {
          return fail(reply, 400, "无效的租户ID");
        }
        const targetTenant = await loadTenantById(tenantId, connection);
        if (!targetTenant) {
          await connection.rollback();
          return fail(reply, 404, "未找到租户", "not_found");
        }

        const items = buildTenantRuntimeConfigItems(tenantId, request.auth.user.id, {
          features: normalizeTenantFeatures(request.body?.features || {}),
          limits: normalizeTenantLimits(request.body?.limits || {})
        });
        await upsertConfigItems(connection, items);
        await connection.commit();

        await logOperation(request, {
          moduleCode: "system_tenant",
          operationType: "update_runtime_settings",
          targetType: "sys_tenants",
          targetId: tenantId,
          requestParams: {
            tenantCode: targetTenant.tenantCode,
            configKeys: items.map((item) => `${item.configGroup}.${item.configKey}`)
          },
          resultMessage: "更新租户能力与配额"
        });

        return ok({ id: tenantId }, "租户能力与配额已保存");
      } catch (error) {
        await connection.rollback();
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      } finally {
        connection.release();
      }
    }
  );

  app.get(
    "/api/v1/system/tenants/:id/device-credentials",
    {
      preHandler: [app.requirePermissions(["tenant:manage"])]
    },
    async (request, reply) => {
      try {
        await assertTenantManagementAllowed(request.auth);
        const tenantId = parseInteger(request.params.id);
        if (!tenantId) {
          return fail(reply, 400, "无效的租户ID");
        }

        const connection = await pool.getConnection();
        try {
          const targetTenant = await loadTenantById(tenantId, connection);
          if (!targetTenant) {
            return fail(reply, 404, "未找到租户", "not_found");
          }

          const effectiveCredential = await getDeviceIngestCredential({ connection, tenantId });
          const explicitCredential = await loadExplicitDeviceIngestCredential({ connection, tenantId });
          return ok({
            tenantId,
            tenantCode: targetTenant.tenantCode,
            hasExplicitToken: Boolean(explicitCredential.token),
            tokenScope: explicitCredential.token ? "tenant" : "fallback",
            deviceIngestTokenMasked: effectiveCredential.maskedToken,
            tokenSource: effectiveCredential.source,
            updatedAt: effectiveCredential.updatedAt,
            updatedByName: effectiveCredential.updatedByName
          });
        } finally {
          connection.release();
        }
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.post(
    "/api/v1/system/tenants/:id/device-credentials/reveal",
    {
      preHandler: [app.requirePermissions(["tenant:manage"])]
    },
    async (request, reply) => {
      try {
        await assertTenantManagementAllowed(request.auth);
        const tenantId = parseInteger(request.params.id);
        if (!tenantId) {
          return fail(reply, 400, "无效的租户ID");
        }

        const connection = await pool.getConnection();
        try {
          const targetTenant = await loadTenantById(tenantId, connection);
          if (!targetTenant) {
            return fail(reply, 404, "未找到租户", "not_found");
          }

          const effectiveCredential = await getDeviceIngestCredential({ connection, tenantId });
          const explicitCredential = await loadExplicitDeviceIngestCredential({ connection, tenantId });

          await logOperation(request, {
            moduleCode: "system_tenant",
            operationType: "reveal_device_token",
            targetType: "sys_tenants",
            targetId: tenantId,
            requestParams: {
              tenantCode: targetTenant.tenantCode,
              tokenScope: explicitCredential.token ? "tenant" : "fallback"
            },
            resultMessage: "查看租户设备接入令牌"
          });

          return ok({
            tenantId,
            deviceIngestToken: effectiveCredential.token,
            deviceIngestTokenMasked: effectiveCredential.maskedToken,
            tokenSource: effectiveCredential.source,
            tokenScope: explicitCredential.token ? "tenant" : "fallback",
            updatedAt: effectiveCredential.updatedAt,
            updatedByName: effectiveCredential.updatedByName
          });
        } finally {
          connection.release();
        }
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.post(
    "/api/v1/system/tenants/:id/device-credentials/rotate",
    {
      preHandler: [app.requirePermissions(["tenant:manage"])]
    },
    async (request, reply) => {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await assertTenantManagementAllowed(request.auth, connection);

        const tenantId = parseInteger(request.params.id);
        if (!tenantId) {
          return fail(reply, 400, "无效的租户ID");
        }
        const targetTenant = await loadTenantById(tenantId, connection);
        if (!targetTenant) {
          await connection.rollback();
          return fail(reply, 404, "未找到租户", "not_found");
        }

        const nextToken = generateDeviceIngestToken();
        await upsertConfigItems(connection, [
          {
            tenantId,
            configGroup: "device_credentials",
            configKey: "device_ingest_token",
            configName: "设备接入令牌",
            configValueJson: JSON.stringify(nextToken),
            description: "用于该租户设备上报与控制轮询的接入凭证",
            updatedBy: request.auth.user.id
          }
        ]);
        await connection.commit();
        invalidateDeviceCredentialCache();

        const credential = await getDeviceIngestCredential({ tenantId });
        await logOperation(request, {
          moduleCode: "system_tenant",
          operationType: "rotate_device_token",
          targetType: "sys_tenants",
          targetId: tenantId,
          requestParams: {
            tenantCode: targetTenant.tenantCode
          },
          resultMessage: "轮换租户设备接入令牌"
        });

        return ok({
          tenantId,
          deviceIngestToken: nextToken,
          deviceIngestTokenMasked: credential.maskedToken,
          tokenSource: credential.source,
          updatedAt: credential.updatedAt,
          updatedByName: credential.updatedByName
        }, "租户设备接入令牌已重新生成");
      } catch (error) {
        await connection.rollback();
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      } finally {
        connection.release();
      }
    }
  );

  app.get(
    "/api/v1/system/tenants/:id/bootstrap-summary",
    {
      preHandler: [app.requirePermissions(["tenant:manage"])]
    },
    async (request, reply) => {
      try {
        await assertTenantManagementAllowed(request.auth);
        const tenantId = parseInteger(request.params.id);
        if (!tenantId) {
          return fail(reply, 400, "无效的租户ID");
        }

        const connection = await pool.getConnection();
        try {
          const runtime = await loadTenantRuntimeSettings(connection, tenantId);
          if (!runtime) {
            return fail(reply, 404, "未找到租户", "not_found");
          }

          return ok({
            tenant: runtime.tenant,
            stats: runtime.stats,
            explicitCredentialConfigured: runtime.explicitCredentialConfigured,
            bootstrapped:
              runtime.stats.roleCount > 0
              && runtime.stats.dataScopeCount > 0
              && runtime.stats.superAdminCount > 0
              && runtime.explicitCredentialConfigured
          });
        } finally {
          connection.release();
        }
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.post(
    "/api/v1/system/tenants/:id/bootstrap",
    {
      preHandler: [app.requirePermissions(["tenant:manage"])]
    },
    async (request, reply) => {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await assertTenantManagementAllowed(request.auth, connection);

        const tenantId = parseInteger(request.params.id);
        if (!tenantId) {
          return fail(reply, 400, "无效的租户ID");
        }
        const targetTenant = await loadTenantById(tenantId, connection);
        if (!targetTenant) {
          await connection.rollback();
          return fail(reply, 404, "未找到租户", "not_found");
        }

        const defaultTenantId = await resolveDefaultTenantId(connection);
        if (!defaultTenantId) {
          throw new AppError("default_tenant_missing", "未找到默认租户，无法初始化模板", 400);
        }

        const username = requiredString(request.body?.username, "username");
        const realName = requiredString(request.body?.realName, "realName");
        const password = requiredString(request.body?.password, "password");
        const phone = optionalString(request.body?.phone);
        const email = optionalString(request.body?.email);
        const remark = optionalString(request.body?.remark);

        const bootstrapResult = await bootstrapTenantWorkspace(connection, tenantId, {
          sourceTenantId: defaultTenantId,
          updatedBy: request.auth.user.id,
          features: request.body?.features || {},
          limits: request.body?.limits || {},
          adminUser: {
            username,
            realName,
            password,
            phone,
            email,
            remark
          }
        });

        await connection.commit();
        invalidateDeviceCredentialCache();
        invalidateTenantFoundationCache();

        await logOperation(request, {
          moduleCode: "system_tenant",
          operationType: "bootstrap",
          targetType: "sys_tenants",
          targetId: tenantId,
          requestParams: {
            tenantCode: targetTenant.tenantCode,
            username,
            roleCount: bootstrapResult.roleCount,
            dataScopeCount: bootstrapResult.dataScopeCount
          },
          resultMessage: "初始化租户基础能力"
        });

        return ok({
          tenantId,
          username,
          roleCount: bootstrapResult.roleCount,
          dataScopeCount: bootstrapResult.dataScopeCount,
          adminUser: bootstrapResult.adminUser
        }, "租户初始化成功");
      } catch (error) {
        await connection.rollback();
        const status = ["username_conflict", "phone_conflict", "email_conflict"].includes(error.code)
          ? 409
          : (error.httpStatus || 400);
        return fail(reply, status, error.message, error.code || "bad_request", error.details || null);
      } finally {
        connection.release();
      }
    }
  );

  app.get(
    "/api/v1/system/user-options",
    {
      preHandler: [app.requireAnyPermissions(["user:manage", "permission:manage"])]
    },
    async (request) => {
      const status = String(request.query?.status || "enabled").trim();
      const filters = [];
      const params = [];

      if (status) {
        filters.push("status = ?");
        params.push(status);
      }
      appendTenantScope(filters, params, request.auth, "sys_users.tenant_id");
      appendProtectedUserFilter(filters, request.auth, "sys_users");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT id, username, real_name AS realName, status
         FROM sys_users
         ${whereClause}
         ORDER BY real_name ASC, id ASC`,
        params
      );

      return ok(rows);
    }
  );

  app.get(
    "/api/v1/system/users",
    {
      preHandler: [app.requirePermissions(["user:manage"])]
    },
    async (request) => {
      const keyword = String(request.query?.keyword || "").trim();
      const status = String(request.query?.status || "").trim();

      const filters = [];
      const params = [];

      if (keyword) {
        filters.push("(u.username LIKE ? OR u.real_name LIKE ? OR u.phone LIKE ?)");
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }
      if (status) {
        filters.push("u.status = ?");
        params.push(status);
      }
      appendTenantScope(filters, params, request.auth, "u.tenant_id");
      appendProtectedUserFilter(filters, request.auth, "u");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           u.id,
           u.user_no AS userNo,
           u.username,
           u.real_name AS realName,
           u.phone,
           u.email,
           u.status,
           u.remark,
           u.login_failed_attempts AS loginFailedAttempts,
           u.locked_until AS lockedUntil,
           u.last_login_failed_at AS lastLoginFailedAt,
           u.last_login_at AS lastLoginAt,
           u.created_at AS createdAt,
           GROUP_CONCAT(r.role_code ORDER BY r.role_level ASC) AS roleCodes,
           GROUP_CONCAT(r.role_name ORDER BY r.role_level ASC) AS roleNames
         FROM sys_users u
         LEFT JOIN sys_user_roles ur ON ur.user_id = u.id
         LEFT JOIN sys_roles r ON r.id = ur.role_id
         ${whereClause}
         GROUP BY
           u.id, u.user_no, u.username, u.real_name, u.phone, u.email, u.status, u.remark,
           u.login_failed_attempts, u.locked_until, u.last_login_failed_at, u.last_login_at, u.created_at
         ORDER BY u.id DESC`,
        params
      );

      return ok(
        rows.map((row) => ({
          ...row,
          roleCodes: row.roleCodes ? row.roleCodes.split(",") : [],
          roleNames: row.roleNames ? row.roleNames.split(",") : []
        }))
      );
    }
  );

  app.get(
    "/api/v1/system/role-options",
    {
      preHandler: [app.requireAnyPermissions(["user:manage", "role:manage", "permission:manage"])]
    },
    async (request) => {
      const status = String(request.query?.status || "enabled").trim();
      const filters = [];
      const params = [];

      if (status) {
        filters.push("status = ?");
        params.push(status);
      }
      appendTenantScope(filters, params, request.auth, "sys_roles.tenant_id");
      appendProtectedRoleFilter(filters, request.auth, "sys_roles");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT id, role_code AS roleCode, role_name AS roleName, role_level AS roleLevel, status
         FROM sys_roles
         ${whereClause}
         ORDER BY role_level ASC, id ASC`,
        params
      );

      return ok(rows);
    }
  );

  app.post(
    "/api/v1/system/users",
    {
      preHandler: [app.requirePermissions(["user:manage"])]
    },
    async (request, reply) => {
      try {
        const username = requiredString(request.body?.username, "username");
        const realName = requiredString(request.body?.realName, "realName");
        const password = requiredString(request.body?.password, "password");
        const roleIds = Array.isArray(request.body?.roleIds) ? request.body.roleIds : [];
        const phone = optionalString(request.body?.phone);
        const email = optionalString(request.body?.email);
        const remark = optionalString(request.body?.remark);

        if (roleIds.length === 0) {
          return fail(reply, 400, "至少要分配一个角色");
        }

        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          const tenantFoundationEnabled = await hasTenantFoundation(connection);
          const currentTenantId = tenantFoundationEnabled ? await resolveCurrentTenantId(request.auth, connection) : null;

          if (currentTenantId) {
            await assertTenantLimitAvailable(connection, {
              tenantId: currentTenantId,
              limitKey: "max_users",
              increment: 1,
              message: "当前租户已达到用户数上限，请升级套餐或调整租户配额"
            });
          }

          const [rawExistingUsers] = await connection.execute(
            "SELECT id FROM sys_users WHERE username = ? LIMIT 1",
            [username]
          );
          const existingUsers = asRowArray(rawExistingUsers);
          if (existingUsers.length > 0) {
            await connection.rollback();
            return fail(reply, 409, "用户名已存在", "conflict");
          }

          const assignedRoleRows = await loadRoleRowsByIds(connection, roleIds, request.auth);
          if (assignedRoleRows.length !== roleIds.length) {
            await connection.rollback();
            return fail(reply, 400, "存在无效角色ID");
          }
          assertProtectedRolesAllowed(request.auth, assignedRoleRows, "没有分配高敏角色的权限");

          const passwordHash = await hashPassword(password);
          const userNo = `U${Date.now()}`;

          const [result] = tenantFoundationEnabled
            ? await connection.execute(
              `INSERT INTO sys_users
                (tenant_id, user_no, username, real_name, phone, email, password_hash, status, remark)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'enabled', ?)`,
              [currentTenantId, userNo, username, realName, phone, email, passwordHash, remark]
            )
            : await connection.execute(
              `INSERT INTO sys_users
                (user_no, username, real_name, phone, email, password_hash, status, remark)
               VALUES (?, ?, ?, ?, ?, ?, 'enabled', ?)`,
              [userNo, username, realName, phone, email, passwordHash, remark]
            );
          const createdUserId = getInsertId(result);

          for (const roleId of roleIds) {
            await connection.execute(
              "INSERT INTO sys_user_roles (user_id, role_id) VALUES (?, ?)",
              [createdUserId, roleId]
            );
          }

          await connection.commit();
          await logOperation(request, {
            moduleCode: "system_user",
            operationType: "create",
            targetType: "sys_users",
            targetId: createdUserId,
            requestParams: {
              username,
              realName,
              roleIds,
              phone,
              email
            },
            resultMessage: "创建用户"
          });
          invalidateAuthCache(createdUserId);
          return ok(
            {
              id: createdUserId,
              userNo,
              username,
              realName,
              roleIds
            },
            "用户创建成功"
          );
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.put(
    "/api/v1/system/users/:id",
    {
      preHandler: [app.requirePermissions(["user:manage"])]
    },
    async (request, reply) => {
      try {
        const userId = parseInteger(request.params.id);
        if (!userId) {
          return fail(reply, 400, "无效的用户ID");
        }

        const realName = requiredString(request.body?.realName, "realName");
        const roleIds = Array.isArray(request.body?.roleIds) ? request.body.roleIds : [];
        if (roleIds.length === 0) {
          return fail(reply, 400, "至少要分配一个角色");
        }

        const phone = optionalString(request.body?.phone);
        const email = optionalString(request.body?.email);
        const remark = optionalString(request.body?.remark);
        const status = optionalString(request.body?.status) || "enabled";

        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          const currentTenantId = extractTenantId(request.auth);

          const [rawUsers] = await connection.execute(
            `SELECT id, username FROM sys_users WHERE id = ? ${currentTenantId ? "AND tenant_id = ?" : ""} LIMIT 1`,
            currentTenantId ? [userId, currentTenantId] : [userId]
          );
          const users = asRowArray(rawUsers);
          if (users.length === 0) {
            await connection.rollback();
            return fail(reply, 404, "未找到用户", "not_found");
          }
          const currentUserRoleRows = await loadUserRoleRows(connection, userId, request.auth);
          assertProtectedRolesAllowed(request.auth, currentUserRoleRows, "没有修改高敏用户的权限");

          const assignedRoleRows = await loadRoleRowsByIds(connection, roleIds, request.auth);
          if (assignedRoleRows.length !== roleIds.length) {
            await connection.rollback();
            return fail(reply, 400, "存在无效角色ID");
          }
          assertProtectedRolesAllowed(request.auth, assignedRoleRows, "没有分配高敏角色的权限");

          await connection.execute(
            `UPDATE sys_users
             SET real_name = ?,
                 phone = ?,
                 email = ?,
                 status = ?,
                 remark = ?,
                 login_failed_attempts = CASE WHEN ? = 'enabled' THEN 0 ELSE login_failed_attempts END,
                 locked_until = CASE WHEN ? = 'enabled' THEN NULL ELSE locked_until END,
                 last_login_failed_at = CASE WHEN ? = 'enabled' THEN NULL ELSE last_login_failed_at END
             WHERE id = ?`,
            [realName, phone, email, status, remark, status, status, status, userId]
          );

          await connection.execute("DELETE FROM sys_user_roles WHERE user_id = ?", [userId]);
          for (const roleId of roleIds) {
            await connection.execute(
              "INSERT INTO sys_user_roles (user_id, role_id) VALUES (?, ?)",
              [userId, roleId]
            );
          }

          await connection.commit();
          await logOperation(request, {
            moduleCode: "system_user",
            operationType: "update",
            targetType: "sys_users",
            targetId: userId,
            requestParams: {
              realName,
              roleIds,
              phone,
              email,
              status
            },
            resultMessage: "更新用户"
          });
          invalidateAuthCache(userId);
          return ok(
            {
              id: userId,
              username: users[0].username,
              realName,
              roleIds,
              status
            },
            "用户更新成功"
          );
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.post(
    "/api/v1/system/users/:id/unlock",
    {
      preHandler: [app.requirePermissions(["user:manage"])]
    },
    async (request, reply) => {
      try {
        const userId = parseInteger(request.params.id);
        if (!userId) {
          return fail(reply, 400, "无效的用户ID");
        }

        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          const currentTenantId = extractTenantId(request.auth);

          const [rawUsers] = await connection.execute(
            `SELECT id, username, status
             FROM sys_users
             WHERE id = ?
               ${currentTenantId ? "AND tenant_id = ?" : ""}
             LIMIT 1`,
            currentTenantId ? [userId, currentTenantId] : [userId]
          );
          const users = asRowArray(rawUsers);
          if (users.length === 0) {
            await connection.rollback();
            return fail(reply, 404, "未找到用户", "not_found");
          }

          const currentUserRoleRows = await loadUserRoleRows(connection, userId, request.auth);
          assertProtectedRolesAllowed(request.auth, currentUserRoleRows, "没有解锁高敏用户的权限");

          await connection.execute(
            `UPDATE sys_users
             SET status = CASE WHEN status = 'locked' THEN 'enabled' ELSE status END,
                 login_failed_attempts = 0,
                 locked_until = NULL,
                 last_login_failed_at = NULL
             WHERE id = ?`,
            [userId]
          );

          await connection.commit();

          const nextStatus = users[0].status === "disabled" ? "disabled" : "enabled";
          const clearedRateLimitBuckets = clearLoginRateLimitBuckets(users[0].username);

          await logOperation(request, {
            moduleCode: "system_user",
            operationType: "unlock",
            targetType: "sys_users",
            targetId: userId,
            requestParams: {
              username: users[0].username,
              clearedRateLimitBuckets
            },
            resultMessage: "解锁用户"
          });
          invalidateAuthCache(userId);

          return ok(
            {
              id: userId,
              username: users[0].username,
              status: nextStatus,
              clearedRateLimitBuckets
            },
            "账号已解锁"
          );
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.get(
    "/api/v1/system/roles",
    {
      preHandler: [app.requirePermissions(["role:manage"])]
    },
    async (request) => {
      const filters = [];
      const params = [];
      appendTenantScope(filters, params, request.auth, "r.tenant_id");
      appendProtectedRoleFilter(filters, request.auth, "r");
      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           r.id,
           r.role_code AS roleCode,
           r.role_name AS roleName,
           r.role_level AS roleLevel,
           r.status,
           r.description,
           COUNT(DISTINCT ur.user_id) AS userCount,
           COUNT(DISTINCT rp.permission_id) AS permissionCount
         FROM sys_roles r
         LEFT JOIN sys_user_roles ur ON ur.role_id = r.id
         LEFT JOIN sys_role_permissions rp ON rp.role_id = r.id
         ${whereClause}
         GROUP BY r.id, r.role_code, r.role_name, r.role_level, r.status, r.description
         ORDER BY r.role_level ASC, r.id ASC`,
        params
      );

      return ok(rows);
    }
  );

  app.post(
    "/api/v1/system/roles",
    {
      preHandler: [app.requirePermissions(["role:manage"])]
    },
    async (request, reply) => {
      try {
        const roleCode = requiredString(request.body?.roleCode, "roleCode");
        const roleName = requiredString(request.body?.roleName, "roleName");
        const roleLevel = parseInteger(request.body?.roleLevel, 100);
        const status = optionalString(request.body?.status) || "enabled";
        const description = optionalString(request.body?.description);
        assertRoleLevelAllowed(request.auth, roleLevel, "没有创建高敏角色的权限");
        const tenantFoundationEnabled = await hasTenantFoundation();
        const currentTenantId = tenantFoundationEnabled ? await resolveCurrentTenantId(request.auth) : null;

        const result = tenantFoundationEnabled
          ? await query(
            `INSERT INTO sys_roles
              (tenant_id, role_code, role_name, role_level, status, description)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [currentTenantId, roleCode, roleName, roleLevel, status, description]
          )
          : await query(
            `INSERT INTO sys_roles
              (role_code, role_name, role_level, status, description)
             VALUES (?, ?, ?, ?, ?)`,
            [roleCode, roleName, roleLevel, status, description]
          );
        const createdRoleId = getInsertId(result);

        await logOperation(request, {
          moduleCode: "system_role",
          operationType: "create",
          targetType: "sys_roles",
          targetId: createdRoleId,
          requestParams: {
            roleCode,
            roleName,
            roleLevel,
            status
          },
          resultMessage: "创建角色"
        });
        clearAuthCache();

        return ok({ insertId: createdRoleId }, "角色创建成功");
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.put(
    "/api/v1/system/roles/:id",
    {
      preHandler: [app.requirePermissions(["role:manage"])]
    },
    async (request, reply) => {
      try {
        const roleId = parseInteger(request.params.id);
        if (!roleId) {
          return fail(reply, 400, "无效的角色ID");
        }

        const roleName = requiredString(request.body?.roleName, "roleName");
        const roleLevel = parseInteger(request.body?.roleLevel, 100);
        const status = optionalString(request.body?.status) || "enabled";
        const description = optionalString(request.body?.description);
        const targetRole = await loadRoleById(roleId, request.auth);
        if (!targetRole) {
          return fail(reply, 404, "未找到角色", "not_found");
        }
        assertProtectedRolesAllowed(request.auth, [targetRole], "没有修改高敏角色的权限");
        assertRoleLevelAllowed(request.auth, roleLevel, "没有将角色调整为高敏级别的权限");

        await query(
          `UPDATE sys_roles
           SET role_name = ?, role_level = ?, status = ?, description = ?
           WHERE id = ?`,
          [roleName, roleLevel, status, description, roleId]
        );

        await logOperation(request, {
          moduleCode: "system_role",
          operationType: "update",
          targetType: "sys_roles",
          targetId: roleId,
          requestParams: {
            roleName,
            roleLevel,
            status
          },
          resultMessage: "更新角色"
        });
        const affectedUsers = await query(
          "SELECT user_id AS userId FROM sys_user_roles WHERE role_id = ?",
          [roleId]
        );
        invalidateAuthCacheForUsers(affectedUsers.map((item) => item.userId));

        return ok({ id: roleId }, "角色更新成功");
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.get(
    "/api/v1/system/roles/:id/permissions",
    {
      preHandler: [app.requirePermissions(["permission:manage"])]
    },
    async (request, reply) => {
      const roleId = parseInteger(request.params.id);
      if (!roleId) {
        return fail(reply, 400, "无效的角色ID");
      }
      const targetRole = await loadRoleById(roleId, request.auth);
      if (!targetRole) {
        return fail(reply, 404, "未找到角色", "not_found");
      }
      assertProtectedRolesAllowed(request.auth, [targetRole], "没有查看高敏角色权限的权限");

      const rows = await query(
        `SELECT
           p.id,
           p.permission_code AS permissionCode,
           p.permission_name AS permissionName,
           p.module_code AS moduleCode,
           p.permission_type AS permissionType,
           EXISTS(
             SELECT 1
             FROM sys_role_permissions rp
             WHERE rp.role_id = ?
               AND rp.permission_id = p.id
           ) AS checked
         FROM sys_permissions p
         WHERE ${buildPermissionVisibilityClause(request.auth, "p")}
         ORDER BY p.module_code ASC, p.permission_code ASC`,
        buildPermissionVisibilityParams(request.auth, [roleId])
      );

      return ok(rows);
    }
  );

  app.put(
    "/api/v1/system/roles/:id/permissions",
    {
      preHandler: [app.requirePermissions(["permission:manage"])]
    },
    async (request, reply) => {
      const roleId = parseInteger(request.params.id);
      if (!roleId) {
        return fail(reply, 400, "无效的角色ID");
      }

      const permissionIds = Array.isArray(request.body?.permissionIds)
        ? request.body.permissionIds.map((item) => parseInteger(item)).filter(Boolean)
        : [];

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [rawRoleRows] = await connection.execute("SELECT id FROM sys_roles WHERE id = ? LIMIT 1", [roleId]);
        const roleRows = asRowArray(rawRoleRows);
        const targetRole = await loadRoleById(roleId, request.auth);
        if (!targetRole) {
          await connection.rollback();
          return fail(reply, 404, "未找到角色", "not_found");
        }
        if (roleRows.length === 0) {
          await connection.rollback();
          return fail(reply, 404, "未找到角色", "not_found");
        }
        assertProtectedRolesAllowed(request.auth, [targetRole], "没有修改高敏角色权限的权限");

        if (permissionIds.length > 0) {
          const permissionRows = await loadPermissionRowsByIds(connection, permissionIds);
          if (permissionRows.length !== permissionIds.length) {
            await connection.rollback();
            return fail(reply, 400, "存在无效权限ID");
          }
          assertProtectedPermissionsAllowed(request.auth, permissionRows, "没有分配高敏权限的权限");
        }

        await connection.execute("DELETE FROM sys_role_permissions WHERE role_id = ?", [roleId]);
        for (const permissionId of permissionIds) {
          await connection.execute(
            "INSERT INTO sys_role_permissions (role_id, permission_id) VALUES (?, ?)",
            [roleId, permissionId]
          );
        }

        await connection.commit();
        await logOperation(request, {
          moduleCode: "system_permission",
          operationType: "update_role_permissions",
          targetType: "sys_roles",
          targetId: roleId,
          requestParams: {
            permissionIds
          },
          resultMessage: "更新角色权限"
        });
        const affectedUsers = await query(
          "SELECT user_id AS userId FROM sys_user_roles WHERE role_id = ?",
          [roleId]
        );
        invalidateAuthCacheForUsers(affectedUsers.map((item) => item.userId));
        return ok({ roleId, permissionIds }, "角色权限更新成功");
      } catch (error) {
        await connection.rollback();
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      } finally {
        connection.release();
      }
    }
  );

  app.get(
    "/api/v1/system/permissions",
    {
      preHandler: [app.requirePermissions(["permission:manage"])]
    },
    async (request) => {
      const rows = await query(
        `SELECT
           id,
           permission_code AS permissionCode,
           permission_name AS permissionName,
           module_code AS moduleCode,
           permission_type AS permissionType,
           route_path AS routePath,
           description
         FROM sys_permissions
         WHERE ${buildPermissionVisibilityClause(request.auth)}
         ORDER BY module_code ASC, permission_code ASC`,
        buildPermissionVisibilityParams(request.auth)
      );

      return ok(rows);
    }
  );

  app.get(
    "/api/v1/system/users/:id/permission-overrides",
    {
      preHandler: [app.requirePermissions(["permission:manage"])]
    },
    async (request, reply) => {
      const userId = parseInteger(request.params.id);
      if (!userId) {
        return fail(reply, 400, "无效的用户ID");
      }
      const userRoleRows = await loadUserRoleRows(pool, userId, request.auth);
      assertProtectedRolesAllowed(request.auth, userRoleRows, "没有查看高敏用户授权的权限");

      const rows = await query(
        `SELECT
           o.id,
           p.permission_code AS permissionCode,
           p.permission_name AS permissionName,
           o.effect_type AS effectType,
           o.effective_from AS effectiveFrom,
           o.effective_to AS effectiveTo,
           o.is_temporary AS isTemporary,
           o.approval_status AS approvalStatus,
           o.reason_text AS reasonText,
           o.created_at AS createdAt
         FROM sys_user_permission_overrides o
         JOIN sys_permissions p ON p.id = o.permission_id
         WHERE o.user_id = ?
         ORDER BY o.id DESC`,
        [userId]
      );

      return ok(rows);
    }
  );

  app.post(
    "/api/v1/system/users/:id/permission-overrides",
    {
      preHandler: [app.requirePermissions(["permission:manage"])]
    },
    async (request, reply) => {
      try {
        const userId = parseInteger(request.params.id);
        if (!userId) {
          return fail(reply, 400, "无效的用户ID");
        }
        const userRoleRows = await loadUserRoleRows(pool, userId, request.auth);
        assertProtectedRolesAllowed(request.auth, userRoleRows, "没有修改高敏用户授权的权限");

        const permissionId = parseInteger(request.body?.permissionId);
        const effectType = requiredString(request.body?.effectType, "effectType");
        const effectiveFrom = optionalString(request.body?.effectiveFrom);
        const effectiveTo = optionalString(request.body?.effectiveTo);
        const isTemporary = request.body?.isTemporary ? 1 : 0;
        const reasonText = optionalString(request.body?.reasonText);

        if (!["grant", "revoke"].includes(effectType)) {
          return fail(reply, 400, "effectType 仅支持 grant 或 revoke");
        }
        if (!permissionId) {
          return fail(reply, 400, "permissionId不能为空");
        }

        const permissionRows = await loadPermissionRowsByIds(pool, [permissionId]);
        if (permissionRows.length === 0) {
          return fail(reply, 400, "存在无效权限ID");
        }
        assertProtectedPermissionsAllowed(request.auth, permissionRows, "没有授予高敏权限的权限");

        const result = await query(
          `INSERT INTO sys_user_permission_overrides
            (user_id, permission_id, effect_type, effective_from, effective_to, is_temporary, approval_status, reason_text, approved_by)
           VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?)`,
          [userId, permissionId, effectType, effectiveFrom, effectiveTo, isTemporary, reasonText, request.auth.user.id]
        );
        const overrideId = getInsertId(result);

        await logOperation(request, {
          moduleCode: "system_permission",
          operationType: "create_override",
          targetType: "sys_user_permission_overrides",
          targetId: overrideId,
          requestParams: {
            userId,
            permissionId,
            effectType,
            effectiveFrom,
            effectiveTo,
            isTemporary
          },
          resultMessage: "创建用户特殊授权"
        });
        invalidateAuthCache(userId);

        return ok({ insertId: overrideId }, "权限覆盖创建成功");
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.get(
    "/api/v1/system/configs",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request) => {
      const configGroup = String(request.query?.configGroup || "").trim();
      const filters = [];
      const params = [];

      if (configGroup) {
        filters.push("c.config_group = ?");
        params.push(configGroup);
      }
      appendTenantScope(filters, params, request.auth, "c.tenant_id");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           c.id,
           c.config_group AS configGroup,
           c.config_key AS configKey,
           c.config_name AS configName,
           c.config_value_json AS configValueJson,
           c.description,
           c.updated_at AS updatedAt,
           u.real_name AS updatedByName
         FROM sys_configs c
         LEFT JOIN sys_users u ON u.id = c.updated_by
         ${whereClause}
         ORDER BY c.config_group ASC, c.config_key ASC`,
        params
      );

      return ok(
        rows.map((row) => ({
          ...row,
          configValueJson: parseMaybeJson(row.configValueJson)
        }))
      );
    }
  );

  app.put(
    "/api/v1/system/configs",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      const items = Array.isArray(request.body?.items) ? request.body.items : [];
      if (items.length === 0) {
        return fail(reply, 400, "items 不能为空");
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const tenantFoundationEnabled = await hasTenantFoundation(connection);
        const currentTenantId = tenantFoundationEnabled ? await resolveCurrentTenantId(request.auth, connection) : null;

        for (const item of items) {
          const configGroup = requiredString(item?.configGroup, "configGroup");
          const configKey = requiredString(item?.configKey, "configKey");
          const configName = requiredString(item?.configName, "configName");
          const description = optionalString(item?.description);

          if (tenantFoundationEnabled) {
            await connection.execute(
              `INSERT INTO sys_configs
                (tenant_id, config_group, config_key, config_name, config_value_json, description, updated_by)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                 tenant_id = VALUES(tenant_id),
                 config_name = VALUES(config_name),
                 config_value_json = VALUES(config_value_json),
                 description = VALUES(description),
                 updated_by = VALUES(updated_by)`,
              [
                currentTenantId,
                configGroup,
                configKey,
                configName,
                JSON.stringify(item?.configValueJson ?? null),
                description,
                request.auth.user.id
              ]
            );
          } else {
            await connection.execute(
              `INSERT INTO sys_configs
                (config_group, config_key, config_name, config_value_json, description, updated_by)
               VALUES (?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                 config_name = VALUES(config_name),
                 config_value_json = VALUES(config_value_json),
                 description = VALUES(description),
                 updated_by = VALUES(updated_by)`,
              [
                configGroup,
                configKey,
                configName,
                JSON.stringify(item?.configValueJson ?? null),
                description,
                request.auth.user.id
              ]
            );
          }
        }

        await connection.commit();
        await logOperation(request, {
          moduleCode: "system_settings",
          operationType: "save_configs",
          targetType: "sys_configs",
          targetId: String(items.length),
          requestParams: {
            configKeys: items.map((item) => `${item.configGroup}.${item.configKey}`)
          },
          resultMessage: "更新系统配置"
        });

        return ok({ updatedCount: items.length }, "系统配置已保存");
      } catch (error) {
        await connection.rollback();
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      } finally {
        connection.release();
      }
    }
  );

  app.get(
    "/api/v1/system/health-summary",
    {
      preHandler: [app.requireAnyPermissions(["system:config", "audit:view"])]
    },
    async (request, reply) => {
      try {
        const backupDir = process.env.MYSQL_BACKUP_DIR || "/opt/agri-platform/backups/mysql-daily";
        const diskPath = process.env.HEALTH_DISK_PATH || backupDir;
        const [database, backup, storage, business, recentFailures] = await Promise.all([
          loadDatabaseHealth(),
          loadBackupHealth(backupDir),
          loadStorageHealth(diskPath),
          loadBusinessHealth(request.auth),
          loadRecentFailureHealth(request.auth)
        ]);
        const api = loadApiHealth();
        const checks = [
          buildCheck("api", "API 服务", "healthy", `${formatDurationSeconds(api.uptimeSeconds)} / PID ${api.pid}`),
          buildCheck(
            "database",
            "MySQL 数据库",
            database.status,
            database.errorMessage || `${database.databaseName || config.mysql.database} / ${database.tableCount} 张表`
          ),
          buildCheck(
            "storage",
            "磁盘空间",
            storage.status,
            storage.errorMessage || `${storage.mountPath} 已用 ${storage.usedPercent}%`
          ),
          buildCheck(
            "backup",
            "数据库备份",
            backup.status,
            backup.errorMessage || (backup.latestFile ? `${backup.latestFile} / ${backup.latestAgeHours} 小时前` : "未发现备份文件")
          ),
          buildCheck(
            "operation",
            "最近操作",
            recentFailures.status,
            `近 24 小时失败操作 ${recentFailures.failedCount} 次`
          )
        ];
        const status = summarizeHealthStatus(checks);

        return ok({
          status,
          generatedAt: new Date().toISOString(),
          api,
          database,
          storage,
          backup,
          business,
          recentFailures,
          checks
        });
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.post(
    "/api/v1/system/test/:target",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      const target = String(request.params.target || "").trim();

      if (target === "ai-service") {
        const [taskStats, reportStats] = await Promise.all([
          query(
            `SELECT
               COUNT(*) AS totalTasks,
               SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successTasks,
               SUM(CASE WHEN status IN ('failed', 'cancelled') THEN 1 ELSE 0 END) AS abnormalTasks
             FROM ai_tasks
             ${extractTenantId(request.auth) ? "WHERE tenant_id = ?" : ""}`,
            extractTenantId(request.auth) ? [extractTenantId(request.auth)] : []
          ),
          query(
            `SELECT
               COUNT(*) AS totalReports,
               MAX(generated_at) AS lastGeneratedAt
             FROM ai_reports
             ${extractTenantId(request.auth) ? "WHERE tenant_id = ?" : ""}`,
            extractTenantId(request.auth) ? [extractTenantId(request.auth)] : []
          )
        ]);
        let providerCheck;
        try {
          providerCheck = await testAiProvider({
            authContext: request.auth
          });
        } catch (error) {
          providerCheck = {
            target,
            status: "warning",
            configured: true,
            mode: "remote_error",
            message: error.message
          };
        }

        return ok(
          {
            ...providerCheck,
            totalTasks: Number(taskStats[0]?.totalTasks || 0),
            successTasks: Number(taskStats[0]?.successTasks || 0),
            abnormalTasks: Number(taskStats[0]?.abnormalTasks || 0),
            totalReports: Number(reportStats[0]?.totalReports || 0),
            lastGeneratedAt: reportStats[0]?.lastGeneratedAt || null
          },
          providerCheck.status === "healthy" ? "AI服务检测通过" : "AI服务当前未接入远程模型"
        );
      }

      if (target === "notification") {
        const notificationFilters = [];
        const notificationParams = [];
        appendTenantScope(notificationFilters, notificationParams, request.auth, "n.tenant_id");
        const notificationWhereClause = notificationFilters.length
          ? `WHERE ${notificationFilters.join(" AND ")}`
          : "";
        const rows = await query(
          `SELECT
             COUNT(n.id) AS totalNotifications,
             SUM(CASE WHEN n.send_status = 'sent' THEN 1 ELSE 0 END) AS sentCount,
             SUM(CASE WHEN n.send_status = 'failed' THEN 1 ELSE 0 END) AS failedCount,
             MAX(n.created_at) AS lastCreatedAt
           FROM ops_notifications n
           ${notificationWhereClause}`,
          notificationParams
        );
        let providerCheck;
        try {
          providerCheck = await testNotificationChannel({
            authContext: request.auth
          });
        } catch (error) {
          providerCheck = {
            target,
            status: "warning",
            provider: "unavailable",
            message: error.message
          };
        }

        return ok(
          {
            ...providerCheck,
            status:
              providerCheck.status === "healthy" && Number(rows[0]?.failedCount || 0) === 0
                ? "healthy"
                : "warning",
            totalNotifications: Number(rows[0]?.totalNotifications || 0),
            sentCount: Number(rows[0]?.sentCount || 0),
            failedCount: Number(rows[0]?.failedCount || 0),
            lastCreatedAt: rows[0]?.lastCreatedAt || null
          },
          "通知通道检测完成"
        );
      }

      if (target === "device-connection") {
        const rows = await query(
          `SELECT
             COUNT(*) AS totalGateways,
             SUM(CASE WHEN online_status = 'online' THEN 1 ELSE 0 END) AS onlineGateways,
             SUM(CASE WHEN online_status <> 'online' THEN 1 ELSE 0 END) AS offlineGateways,
             MAX(last_heartbeat_at) AS lastHeartbeatAt
           FROM iot_gateways
           WHERE status = 'enabled'
             ${extractTenantId(request.auth) ? "AND tenant_id = ?" : ""}`,
          extractTenantId(request.auth) ? [extractTenantId(request.auth)] : []
        );

        return ok(
          {
            target,
            status: Number(rows[0]?.offlineGateways || 0) > 0 ? "warning" : "healthy",
            totalGateways: Number(rows[0]?.totalGateways || 0),
            onlineGateways: Number(rows[0]?.onlineGateways || 0),
            offlineGateways: Number(rows[0]?.offlineGateways || 0),
            lastHeartbeatAt: rows[0]?.lastHeartbeatAt || null
          },
          "设备连接检测完成"
        );
      }

      return fail(reply, 400, "仅支持 ai-service / notification / device-connection");
    }
  );

  app.get(
    "/api/v1/system/device-credentials",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request) => {
      const credential = await getDeviceIngestCredential({
        authContext: request.auth
      });
      return ok({
        deviceIngestTokenMasked: credential.maskedToken,
        tokenSource: credential.source,
        updatedAt: credential.updatedAt,
        updatedByName: credential.updatedByName
      });
    }
  );

  app.get(
    "/api/v1/system/device-ingest-diagnostics",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      try {
        const credential = await getDeviceIngestCredential({
          authContext: request.auth
        });
        const diagnostics = await loadDeviceIngestDiagnostics(request);

        return ok({
          apiHost: resolveRequestOrigin(request),
          tokenMasked: credential.maskedToken,
          tokenSource: credential.source,
          endpoints: {
            ingest: "/api/v1/iot/ingest",
            legacyIngest: "/api/soil/ingest",
            controlPoll: "/api/v1/iot/device-control?deviceId=<deviceId>",
            configPoll: "/api/v1/iot/device-config?deviceId=<deviceId>"
          },
          samplePayload: buildDeviceIngestSamplePayload(),
          ...diagnostics
        });
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.post(
    "/api/v1/system/device-ingest-test",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      let payload = null;
      try {
        payload = buildDeviceIngestTestPayload(request.body || {});
        const credential = await getDeviceIngestCredential({
          authContext: request.auth
        });
        const endpoint = `${resolveInternalApiBaseUrl()}/api/v1/iot/ingest`;
        const response = await postJsonToInternalApi(endpoint, payload, credential.token);
        const result = response.data;

        if (!response.ok || result?.ok === false) {
          await logOperation(request, {
            moduleCode: "system_device_ingest",
            operationType: "test_ingest",
            targetType: "iot_gateways",
            targetId: payload.deviceId,
            requestParams: {
              deviceId: payload.deviceId,
              metricCount: payload.metrics.length
            },
            resultStatus: "failed",
            resultMessage: result?.message || "模拟设备上报失败"
          });
          return fail(reply, response.status || 502, result?.message || "模拟设备上报失败", result?.error || "device_ingest_failed", result?.details || null);
        }

        await logOperation(request, {
          moduleCode: "system_device_ingest",
          operationType: "test_ingest",
          targetType: "iot_gateways",
          targetId: result?.data?.gatewayId || payload.deviceId,
          requestParams: {
            deviceId: payload.deviceId,
            metricCount: payload.metrics.length
          },
          resultMessage: "后台模拟设备上报成功"
        });

        return ok(
          {
            endpoint: "/api/v1/iot/ingest",
            requestPayload: payload,
            ingestResult: result?.data || null
          },
          "模拟设备上报成功"
        );
      } catch (error) {
        await logOperation(request, {
          moduleCode: "system_device_ingest",
          operationType: "test_ingest",
          targetType: "iot_gateways",
          targetId: payload?.deviceId || null,
          requestParams: {
            deviceId: payload?.deviceId || null,
            metricCount: payload?.metrics?.length || 0
          },
          resultStatus: "failed",
          resultMessage: error.message
        });
        return fail(reply, error.httpStatus || 500, error.message || "模拟设备上报失败", error.code || "device_ingest_failed", error.details || null);
      }
    }
  );

  app.get(
    "/api/v1/system/device-ingest-troubleshooting-logs",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request) => {
      const gatewayCode = String(request.query?.gatewayCode || "").trim();
      const limit = Math.min(Math.max(parseInteger(request.query?.limit, 20) || 20, 1), 100);
      const filters = [
        "l.module_code = 'system_device_ingest'",
        "l.operation_type = 'troubleshoot'"
      ];
      const params = [];

      if (gatewayCode) {
        filters.push("(l.target_id = ? OR l.request_params_json LIKE ?)");
        params.push(gatewayCode, `%"gatewayCode":"${gatewayCode.replace(/[%_\\]/g, "\\$&")}"%`);
      }
      appendTenantScope(filters, params, request.auth, "l.tenant_id");

      const rows = await query(
        `SELECT
           l.id,
           l.log_no AS logNo,
           l.operator_user_id AS operatorUserId,
           l.target_id AS targetId,
           l.request_params_json AS requestParamsJson,
           l.result_message AS resultMessage,
           l.created_at AS createdAt,
           u.real_name AS operatorName
         FROM sys_operation_logs l
         LEFT JOIN sys_users u ON u.id = l.operator_user_id
         WHERE ${filters.join(" AND ")}
         ORDER BY l.created_at DESC, l.id DESC
         LIMIT ${limit}`,
        params
      );

      return ok(rows.map((row) => {
        const requestParams = parseMaybeJson(row.requestParamsJson) || {};
        return {
          id: row.id,
          logNo: row.logNo,
          operatorUserId: row.operatorUserId,
          operatorName: row.operatorName || "系统用户",
          targetId: row.targetId,
          gatewayId: requestParams.gatewayId || null,
          gatewayCode: requestParams.gatewayCode || row.targetId || "",
          gatewayName: requestParams.gatewayName || "",
          areaName: requestParams.areaName || "",
          riskCodes: Array.isArray(requestParams.riskCodes) ? requestParams.riskCodes : [],
          note: requestParams.note || "",
          summary: requestParams.summary || row.resultMessage || "",
          resultMessage: row.resultMessage || "",
          createdAt: row.createdAt
        };
      }));
    }
  );

  app.post(
    "/api/v1/system/device-ingest-troubleshooting-logs",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      try {
        const gatewayCode = requiredString(request.body?.gatewayCode, "gatewayCode");
        const gatewayId = parseInteger(request.body?.gatewayId);
        const gatewayName = optionalString(request.body?.gatewayName);
        const areaName = optionalString(request.body?.areaName);
        const note = optionalString(request.body?.note) || "已完成一次设备接入排查";
        const summary = optionalString(request.body?.summary) || `记录设备接入排查：${gatewayCode}`;
        const riskCodes = Array.isArray(request.body?.riskCodes)
          ? request.body.riskCodes.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 10)
          : [];

        await logOperation(request, {
          moduleCode: "system_device_ingest",
          operationType: "troubleshoot",
          targetType: "iot_gateways",
          targetId: gatewayCode,
          requestParams: {
            gatewayId: gatewayId || null,
            gatewayCode,
            gatewayName,
            areaName,
            riskCodes,
            note,
            summary
          },
          resultMessage: summary
        });

        return ok(
          {
            gatewayCode,
            gatewayId: gatewayId || null,
            riskCodes,
            note,
            summary
          },
          "排查记录已保存"
        );
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message || "保存排查记录失败", error.code || "bad_request", error.details || null);
      }
    }
  );

  app.post(
    "/api/v1/system/device-credentials/reveal",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      try {
        const credential = await getDeviceIngestCredential({
          authContext: request.auth
        });
        await logOperation(request, {
          moduleCode: "system_device_credentials",
          operationType: "reveal",
          targetType: "sys_configs",
          targetId: "device_credentials.device_ingest_token",
          requestParams: {
            source: credential.source
          },
          resultMessage: "查看设备接入令牌"
        });
        return ok({
          deviceIngestToken: credential.token,
          deviceIngestTokenMasked: credential.maskedToken,
          tokenSource: credential.source,
          updatedAt: credential.updatedAt,
          updatedByName: credential.updatedByName
        });
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.post(
    "/api/v1/system/device-credentials/rotate",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const tenantFoundationEnabled = await hasTenantFoundation(connection);
        const currentTenantId = tenantFoundationEnabled ? await resolveCurrentTenantId(request.auth, connection) : null;
        const nextToken = generateDeviceIngestToken();

        if (tenantFoundationEnabled) {
          await connection.execute(
            `INSERT INTO sys_configs
              (tenant_id, config_group, config_key, config_name, config_value_json, description, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               tenant_id = VALUES(tenant_id),
               config_name = VALUES(config_name),
               config_value_json = VALUES(config_value_json),
               description = VALUES(description),
               updated_by = VALUES(updated_by)`,
            [
              currentTenantId,
              "device_credentials",
              "device_ingest_token",
              "设备接入令牌",
              JSON.stringify(nextToken),
              "用于 ESP32 / 网关数据上报与控制轮询的接入凭证",
              request.auth.user.id
            ]
          );
        } else {
          await connection.execute(
            `INSERT INTO sys_configs
              (config_group, config_key, config_name, config_value_json, description, updated_by)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               config_name = VALUES(config_name),
               config_value_json = VALUES(config_value_json),
               description = VALUES(description),
               updated_by = VALUES(updated_by)`,
            [
              "device_credentials",
              "device_ingest_token",
              "设备接入令牌",
              JSON.stringify(nextToken),
              "用于 ESP32 / 网关数据上报与控制轮询的接入凭证",
              request.auth.user.id
            ]
          );
        }

        await connection.commit();
        invalidateDeviceCredentialCache();
        const credential = await getDeviceIngestCredential({
          authContext: request.auth
        });

        await logOperation(request, {
          moduleCode: "system_device_credentials",
          operationType: "rotate",
          targetType: "sys_configs",
          targetId: "device_credentials.device_ingest_token",
          requestParams: {
            tokenSource: "database"
          },
          resultMessage: "轮换设备接入令牌"
        });

        return ok(
          {
            deviceIngestToken: nextToken,
            deviceIngestTokenMasked: credential.maskedToken,
            tokenSource: credential.source,
            updatedAt: credential.updatedAt,
            updatedByName: credential.updatedByName
          },
          "设备接入令牌已重新生成"
        );
      } catch (error) {
        await connection.rollback();
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      } finally {
        connection.release();
      }
    }
  );

  app.get(
    "/api/v1/system/audit-logs",
    {
      preHandler: [app.requirePermissions(["audit:view"])]
    },
    async (request) => {
      const moduleCode = String(request.query?.moduleCode || "").trim();
      const resultStatus = String(request.query?.resultStatus || "").trim();
      const operatorUserId = parseInteger(request.query?.operatorUserId);
      const keyword = String(request.query?.keyword || "").trim();
      const limit = Math.min(Math.max(parseInteger(request.query?.limit, 100) || 100, 1), 500);

      const filters = [];
      const params = [];

      if (moduleCode) {
        filters.push("l.module_code = ?");
        params.push(moduleCode);
      }
      if (resultStatus) {
        filters.push("l.result_status = ?");
        params.push(resultStatus);
      }
      if (operatorUserId) {
        filters.push("l.operator_user_id = ?");
        params.push(operatorUserId);
      }
      if (keyword) {
        filters.push("(l.target_id LIKE ? OR l.result_message LIKE ? OR l.request_path LIKE ?)");
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }
      appendTenantScope(filters, params, request.auth, "l.tenant_id");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           l.id,
           l.log_no AS logNo,
           l.module_code AS moduleCode,
           l.operation_type AS operationType,
           l.operator_user_id AS operatorUserId,
           l.operator_ip AS operatorIp,
           l.target_type AS targetType,
           l.target_id AS targetId,
           l.request_method AS requestMethod,
           l.request_path AS requestPath,
           l.request_params_json AS requestParamsJson,
           l.result_status AS resultStatus,
           l.result_message AS resultMessage,
           l.created_at AS createdAt,
           u.real_name AS operatorName
         FROM sys_operation_logs l
         LEFT JOIN sys_users u ON u.id = l.operator_user_id
         ${whereClause}
         ORDER BY l.created_at DESC, l.id DESC
         LIMIT ${limit}`,
        params
      );

      return ok(rows);
    }
  );
}

function parseMaybeJson(value) {
  if (!value) {
    return null;
  }
  if (typeof value === "object") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function loadApiHealth() {
  const memory = process.memoryUsage();
  return {
    service: "agri-admin-api",
    host: config.host,
    port: config.port,
    pid: process.pid,
    nodeVersion: process.version,
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    cpuCount: os.cpus().length,
    loadAverage: os.loadavg().map((item) => Number(item.toFixed(2))),
    uptimeSeconds: Math.round(process.uptime()),
    memory: {
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      externalBytes: memory.external,
      heapUsedPercent: memory.heapTotal > 0 ? Number(((memory.heapUsed / memory.heapTotal) * 100).toFixed(1)) : 0
    }
  };
}

async function loadDatabaseHealth() {
  const start = Date.now();
  try {
    const [serverRows, tableRows] = await Promise.all([
      query("SELECT DATABASE() AS databaseName, NOW() AS serverTime, VERSION() AS version"),
      query(
        `SELECT COUNT(*) AS tableCount
         FROM information_schema.tables
         WHERE table_schema = ?`,
        [config.mysql.database]
      )
    ]);
    return {
      status: "healthy",
      latencyMs: Date.now() - start,
      databaseName: serverRows[0]?.databaseName || config.mysql.database,
      serverTime: serverRows[0]?.serverTime || null,
      version: serverRows[0]?.version || "",
      tableCount: Number(tableRows[0]?.tableCount || 0),
      errorMessage: null
    };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      databaseName: config.mysql.database,
      serverTime: null,
      version: "",
      tableCount: 0,
      errorMessage: error.message
    };
  }
}

async function loadBackupHealth(backupDir) {
  try {
    const entries = await fs.readdir(backupDir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .filter((entry) => /\.(sql|sql\.gz|gz)$/i.test(entry.name))
        .map(async (entry) => {
          const filePath = path.join(backupDir, entry.name);
          const stat = await fs.stat(filePath);
          return {
            fileName: entry.name,
            sizeBytes: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            modifiedMs: stat.mtimeMs
          };
        })
    );
    files.sort((a, b) => b.modifiedMs - a.modifiedMs);
    const latest = files[0] || null;
    const latestAgeHours = latest ? Number(((Date.now() - latest.modifiedMs) / 3600000).toFixed(1)) : null;
    let status = "warning";
    let errorMessage = null;
    if (latest && latestAgeHours !== null && latestAgeHours <= 36) {
      status = "healthy";
    } else if (latest && latestAgeHours !== null && latestAgeHours > 72) {
      status = "error";
      errorMessage = "最近备份已超过 72 小时";
    } else if (!latest) {
      errorMessage = "备份目录存在，但未发现 SQL 备份文件";
    }

    return {
      status,
      directory: backupDir,
      retentionDays: Number(process.env.MYSQL_BACKUP_RETENTION_DAYS || 3),
      fileCount: files.length,
      totalSizeBytes: files.reduce((sum, item) => sum + item.sizeBytes, 0),
      latestFile: latest?.fileName || "",
      latestSizeBytes: latest?.sizeBytes || 0,
      latestModifiedAt: latest?.modifiedAt || null,
      latestAgeHours,
      files: files.slice(0, 5).map(({ modifiedMs, ...item }) => item),
      errorMessage
    };
  } catch (error) {
    return {
      status: "warning",
      directory: backupDir,
      retentionDays: Number(process.env.MYSQL_BACKUP_RETENTION_DAYS || 3),
      fileCount: 0,
      totalSizeBytes: 0,
      latestFile: "",
      latestSizeBytes: 0,
      latestModifiedAt: null,
      latestAgeHours: null,
      files: [],
      errorMessage: error.code === "ENOENT" ? "备份目录不存在或不可访问" : error.message
    };
  }
}

async function loadStorageHealth(targetPath) {
  try {
    const mountPath = await resolveExistingPath(targetPath);
    if (typeof fs.statfs !== "function") {
      return loadStorageHealthByDf(mountPath);
    }
    const stat = await fs.statfs(mountPath);
    const totalBytes = Number(stat.blocks) * Number(stat.bsize);
    const freeBytes = Number(stat.bavail) * Number(stat.bsize);
    const usedBytes = Math.max(totalBytes - freeBytes, 0);
    const usedPercent = totalBytes > 0 ? Number(((usedBytes / totalBytes) * 100).toFixed(1)) : 0;
    return {
      status: usedPercent >= 95 ? "error" : usedPercent >= 85 ? "warning" : "healthy",
      mountPath,
      totalBytes,
      freeBytes,
      usedBytes,
      usedPercent,
      errorMessage: null
    };
  } catch (error) {
    return {
      status: "warning",
      mountPath: targetPath,
      totalBytes: 0,
      freeBytes: 0,
      usedBytes: 0,
      usedPercent: 0,
      errorMessage: error.message
    };
  }
}

async function loadStorageHealthByDf(mountPath) {
  const { stdout } = await execFileAsync("df", ["-kP", mountPath], {
    timeout: 3000
  });
  const lines = String(stdout || "").trim().split(/\r?\n/).filter(Boolean);
  const row = lines[1] || "";
  const columns = row.trim().split(/\s+/);
  if (columns.length < 6) {
    throw new Error("磁盘信息解析失败");
  }
  const totalBytes = Number(columns[1] || 0) * 1024;
  const usedBytes = Number(columns[2] || 0) * 1024;
  const freeBytes = Number(columns[3] || 0) * 1024;
  const usedPercent = totalBytes > 0 ? Number(((usedBytes / totalBytes) * 100).toFixed(1)) : 0;
  return {
    status: usedPercent >= 95 ? "error" : usedPercent >= 85 ? "warning" : "healthy",
    mountPath,
    totalBytes,
    freeBytes,
    usedBytes,
    usedPercent,
    errorMessage: null
  };
}

async function resolveExistingPath(targetPath) {
  let current = path.resolve(targetPath || process.cwd());
  while (current && current !== path.dirname(current)) {
    try {
      const stat = await fs.stat(current);
      if (stat.isDirectory()) {
        return current;
      }
    } catch {
      // Walk up until an existing parent directory is found.
    }
    current = path.dirname(current);
  }
  return current || process.cwd();
}

function resolveRequestOrigin(request) {
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const forwardedHost = String(request.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const protocol = forwardedProto || request.protocol || "http";
  const host = forwardedHost || request.headers.host || `127.0.0.1:${config.port}`;
  return `${protocol}://${host}`;
}

function buildDeviceIngestSamplePayload() {
  return {
    deviceId: "soil-001",
    deviceName: "ESP32 土壤监测网关",
    rssi: -58,
    collectedAt: "2026-04-11T08:30:00+08:00",
    samplingStatus: "running",
    metrics: [
      {
        metricCode: "temperature",
        metricName: "温度",
        value: 22.5,
        unitName: "℃"
      },
      {
        metricCode: "humidity",
        metricName: "湿度",
        value: 61.2,
        unitName: "%"
      }
    ]
  };
}

function buildDeviceIngestTestPayload(body = {}) {
  const deviceId = optionalString(body.deviceId ?? body.device_id) || "SIM-ESP32-001";
  const deviceName = optionalString(body.deviceName ?? body.name) || "后台联调 ESP32";
  const samplingStatus = optionalString(body.samplingStatus ?? body.sampling_status) || "running";
  if (!["running", "paused"].includes(samplingStatus)) {
    throw new AppError("invalid_sampling_status", "samplingStatus 仅支持 running 或 paused", 400);
  }

  return {
    deviceId,
    deviceName,
    rssi: parseInteger(body.rssi, -58),
    collectedAt: new Date().toISOString(),
    dataSource: "manual",
    samplingStatus,
    metrics: [
      {
        metricCode: "temperature",
        metricName: "温度",
        value: parseDecimal(body.temperature ?? body.temp, 22.5),
        unitName: "℃"
      },
      {
        metricCode: "humidity",
        metricName: "湿度",
        value: parseDecimal(body.humidity ?? body.hum, 61.2),
        unitName: "%"
      }
    ]
  };
}

function resolveInternalApiBaseUrl() {
  return process.env.INTERNAL_API_BASE_URL || `http://127.0.0.1:${config.port}`;
}

function postJsonToInternalApi(endpoint, payload, bearerToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const body = JSON.stringify(payload);
    const client = url.protocol === "https:" ? https : http;
    const request = client.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: `Bearer ${bearerToken}`
        },
        timeout: 10000
      },
      (response) => {
        let rawBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          rawBody += chunk;
        });
        response.on("end", () => {
          let data = null;
          if (rawBody) {
            try {
              data = JSON.parse(rawBody);
            } catch {
              data = {
                ok: false,
                message: rawBody
              };
            }
          }
          const status = Number(response.statusCode || 0);
          resolve({
            ok: status >= 200 && status < 300,
            status,
            data
          });
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("模拟设备上报请求超时"));
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

async function loadDeviceIngestDiagnostics(request) {
  const gatewayFilters = ["g.status = 'enabled'"];
  const gatewayParams = [];
  appendTenantScope(gatewayFilters, gatewayParams, request.auth, "g.tenant_id");
  const gatewayWhereClause = `WHERE ${gatewayFilters.join(" AND ")}`;

  const readingFilters = ["r.received_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)"];
  const readingParams = [];
  appendTenantScope(readingFilters, readingParams, request.auth, "s.tenant_id");
  const readingWhereClause = `WHERE ${readingFilters.join(" AND ")}`;

  const latestReadingFilters = [];
  const latestReadingParams = [];
  appendTenantScope(latestReadingFilters, latestReadingParams, request.auth, "s.tenant_id");
  const latestReadingWhereClause = latestReadingFilters.length ? `WHERE ${latestReadingFilters.join(" AND ")}` : "";

  const configLogFilters = [];
  const configLogParams = [];
  appendTenantScope(configLogFilters, configLogParams, request.auth, "l.tenant_id");
  const configLogWhereClause = configLogFilters.length ? `WHERE ${configLogFilters.join(" AND ")}` : "";

  const [
    gatewayStatsRows,
    readingStatsRows,
    latestGatewayRows,
    latestReadingRows,
    latestConfigLogRows,
    gatewayRiskRows
  ] = await Promise.all([
    query(
      `SELECT
         COUNT(*) AS totalGateways,
         SUM(CASE WHEN g.online_status = 'online' THEN 1 ELSE 0 END) AS onlineGateways,
         SUM(CASE WHEN g.online_status <> 'online' THEN 1 ELSE 0 END) AS offlineGateways,
         SUM(CASE WHEN g.online_status = 'online' AND g.last_heartbeat_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE) THEN 1 ELSE 0 END) AS staleGatewayCount,
         SUM(CASE WHEN g.wifi_rssi IS NOT NULL AND g.wifi_rssi <= -75 THEN 1 ELSE 0 END) AS weakSignalGateways,
         SUM(CASE WHEN COALESCE(g.device_config_sync_status, 'not_configured') NOT IN ('applied', 'not_configured') THEN 1 ELSE 0 END) AS pendingConfigGateways,
         MAX(g.last_heartbeat_at) AS lastHeartbeatAt
       FROM iot_gateways g
       ${gatewayWhereClause}`,
      gatewayParams
    ),
    query(
      `SELECT
         COUNT(*) AS readingCount24h,
         COUNT(DISTINCT r.gateway_id) AS reportingGateways24h,
         MAX(r.received_at) AS lastReadingAt,
         AVG(r.delay_ms) AS avgDelayMs
       FROM iot_sensor_readings r
       JOIN iot_sensors s ON s.id = r.sensor_id
       ${readingWhereClause}`,
      readingParams
    ),
    query(
      `SELECT
         g.id,
         g.gateway_code AS gatewayCode,
         g.gateway_name AS gatewayName,
         g.gateway_type AS gatewayType,
         g.online_status AS onlineStatus,
         g.wifi_rssi AS wifiRssi,
         g.sampling_status AS samplingStatus,
         g.device_config_version AS configVersion,
         g.device_config_sync_status AS configSyncStatus,
         g.last_heartbeat_at AS lastHeartbeatAt,
         a.area_name AS areaName
       FROM iot_gateways g
       LEFT JOIN biz_areas a ON a.id = g.area_id
       ${gatewayWhereClause}
       ORDER BY g.last_heartbeat_at DESC, g.updated_at DESC, g.id DESC
       LIMIT 6`,
      gatewayParams
    ),
    query(
      `SELECT
         r.id,
         r.metric_code AS metricCode,
         r.metric_name AS metricName,
         r.metric_value AS metricValue,
         r.unit_name AS unitName,
         r.data_source AS dataSource,
         r.time_quality AS timeQuality,
         r.delay_ms AS delayMs,
         r.collected_at AS collectedAt,
         r.received_at AS receivedAt,
         s.sensor_code AS sensorCode,
         s.sensor_name AS sensorName,
         g.gateway_code AS gatewayCode,
         g.gateway_name AS gatewayName,
         a.area_name AS areaName
       FROM iot_sensor_readings r
       JOIN iot_sensors s ON s.id = r.sensor_id
       LEFT JOIN iot_gateways g ON g.id = r.gateway_id
       LEFT JOIN biz_areas a ON a.id = r.area_id
       ${latestReadingWhereClause}
       ORDER BY r.received_at DESC, r.id DESC
       LIMIT 10`,
      latestReadingParams
    ),
    query(
      `SELECT
         l.id,
         l.gateway_id AS gatewayId,
         l.config_version AS configVersion,
         l.action_type AS actionType,
         l.sync_status AS syncStatus,
         l.operator_name AS operatorName,
         l.message_text AS messageText,
         l.created_at AS createdAt,
         g.gateway_code AS gatewayCode,
         g.gateway_name AS gatewayName
       FROM iot_gateway_config_logs l
       LEFT JOIN iot_gateways g ON g.id = l.gateway_id
       ${configLogWhereClause}
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT 5`,
      configLogParams
    ),
    query(
      `SELECT
         g.id,
         g.gateway_code AS gatewayCode,
         g.gateway_name AS gatewayName,
         g.online_status AS onlineStatus,
         g.wifi_rssi AS wifiRssi,
         g.device_config_sync_status AS configSyncStatus,
         g.last_heartbeat_at AS lastHeartbeatAt,
         TIMESTAMPDIFF(SECOND, g.last_heartbeat_at, NOW()) AS heartbeatAgeSeconds,
         a.area_name AS areaName,
         COUNT(r.id) AS readingCount24h,
         MAX(r.received_at) AS lastReadingAt
       FROM iot_gateways g
       LEFT JOIN biz_areas a ON a.id = g.area_id
       LEFT JOIN iot_sensor_readings r
         ON r.gateway_id = g.id
        AND r.received_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       ${gatewayWhereClause}
       GROUP BY
         g.id,
         g.gateway_code,
         g.gateway_name,
         g.online_status,
         g.wifi_rssi,
         g.device_config_sync_status,
         g.last_heartbeat_at,
         a.area_name
       HAVING
         g.online_status <> 'online'
         OR g.last_heartbeat_at IS NULL
         OR g.last_heartbeat_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)
         OR readingCount24h = 0
         OR COALESCE(g.device_config_sync_status, 'not_configured') NOT IN ('applied', 'not_configured')
         OR (g.wifi_rssi IS NOT NULL AND g.wifi_rssi <= -75)
       ORDER BY
         readingCount24h ASC,
         g.last_heartbeat_at ASC,
         g.id ASC
       LIMIT 12`,
      gatewayParams
    )
  ]);

  const gatewayStats = gatewayStatsRows[0] || {};
  const readingStats = readingStatsRows[0] || {};
  const readingCount24h = Number(readingStats.readingCount24h || 0);
  const totalGateways = Number(gatewayStats.totalGateways || 0);
  const reportingGateways24h = Number(readingStats.reportingGateways24h || 0);
  const offlineGateways = Number(gatewayStats.offlineGateways || 0);
  const staleGatewayCount = Number(gatewayStats.staleGatewayCount || 0);
  const weakSignalGateways = Number(gatewayStats.weakSignalGateways || 0);
  const pendingConfigGateways = Number(gatewayStats.pendingConfigGateways || 0);
  const avgDelayMs = Math.round(Number(readingStats.avgDelayMs || 0));
  const healthIssues = buildDeviceIngestHealthIssues({
    totalGateways,
    offlineGateways,
    staleGatewayCount,
    weakSignalGateways,
    pendingConfigGateways,
    readingCount24h,
    reportingGateways24h,
    avgDelayMs
  });
  const status = totalGateways === 0
    ? "empty"
    : healthIssues.some((item) => item.severity === "error")
      ? "error"
      : healthIssues.some((item) => item.severity === "warning")
        ? "warning"
        : "healthy";

  return {
    status,
    stats: {
      totalGateways,
      onlineGateways: Number(gatewayStats.onlineGateways || 0),
      offlineGateways,
      staleGatewayCount,
      weakSignalGateways,
      pendingConfigGateways,
      lastHeartbeatAt: gatewayStats.lastHeartbeatAt || null,
      readingCount24h,
      reportingGateways24h,
      lastReadingAt: readingStats.lastReadingAt || null,
      avgDelayMs
    },
    healthIssues,
    latestGateway: latestGatewayRows[0] || null,
    latestReading: latestReadingRows[0] || null,
    latestConfigLog: latestConfigLogRows[0] || null,
    recentGateways: latestGatewayRows,
    recentReadings: latestReadingRows,
    recentConfigLogs: latestConfigLogRows,
    riskGateways: gatewayRiskRows.map((row) => ({
      ...row,
      heartbeatAgeSeconds: row.heartbeatAgeSeconds === null || row.heartbeatAgeSeconds === undefined
        ? null
        : Number(row.heartbeatAgeSeconds || 0),
      readingCount24h: Number(row.readingCount24h || 0),
      riskCodes: buildGatewayRiskCodes(row)
    }))
  };
}

function buildDeviceIngestHealthIssues(summary) {
  const issues = [];
  if (summary.totalGateways === 0) {
    issues.push({
      code: "no_gateway",
      severity: "info",
      title: "暂无接入设备",
      detail: "平台还没有启用中的网关设备。",
      action: "先使用后台模拟上报，或让 ESP32 使用当前接入地址完成首次上报。"
    });
    return issues;
  }

  if (summary.offlineGateways > 0) {
    issues.push({
      code: "offline_gateway",
      severity: "warning",
      title: "存在离线设备",
      detail: `${summary.offlineGateways} 个设备当前不是 online 状态。`,
      action: "检查设备供电、WiFi/4G 网络和固件 API_HOST 配置。"
    });
  }

  if (summary.staleGatewayCount > 0) {
    issues.push({
      code: "stale_heartbeat",
      severity: "warning",
      title: "心跳超过 10 分钟未更新",
      detail: `${summary.staleGatewayCount} 个在线设备心跳时间偏旧。`,
      action: "确认设备仍在轮询控制接口或按计划上报数据。"
    });
  }

  if (summary.readingCount24h === 0) {
    issues.push({
      code: "no_reading_24h",
      severity: "error",
      title: "24 小时内无传感器上报",
      detail: "设备档案可能存在，但最近没有任何传感器读数入库。",
      action: "使用页面的发送测试上报验证 token 与 /api/v1/iot/ingest 链路。"
    });
  } else if (summary.reportingGateways24h < summary.totalGateways) {
    issues.push({
      code: "partial_reporting",
      severity: "warning",
      title: "部分设备 24 小时内未上报",
      detail: `${summary.reportingGateways24h}/${summary.totalGateways} 个设备有读数入库。`,
      action: "在最近设备列表里选择未上报设备，检查固件采样任务和网络。"
    });
  }

  if (summary.avgDelayMs > 60000) {
    issues.push({
      code: "high_delay",
      severity: "warning",
      title: "平均上报延迟偏高",
      detail: `最近 24 小时平均延迟约 ${Math.round(summary.avgDelayMs / 1000)} 秒。`,
      action: "检查设备本地时间同步、缓存补传和网络质量。"
    });
  }

  if (summary.weakSignalGateways > 0) {
    issues.push({
      code: "weak_signal",
      severity: "warning",
      title: "存在 WiFi 弱信号设备",
      detail: `${summary.weakSignalGateways} 个设备 RSSI 小于等于 -75 dBm。`,
      action: "优化路由器位置、天线方向，或考虑 4G/有线网关。"
    });
  }

  if (summary.pendingConfigGateways > 0) {
    issues.push({
      code: "pending_config",
      severity: "info",
      title: "存在待同步配置",
      detail: `${summary.pendingConfigGateways} 个设备配置未确认生效。`,
      action: "让设备轮询 /api/v1/iot/device-config 并回报应用结果。"
    });
  }

  return issues;
}

function buildGatewayRiskCodes(row) {
  const risks = [];
  const onlineStatus = String(row.onlineStatus || "");
  const configSyncStatus = String(row.configSyncStatus || "not_configured");
  const readingCount24h = Number(row.readingCount24h || 0);
  const heartbeatAgeSeconds = row.heartbeatAgeSeconds === null || row.heartbeatAgeSeconds === undefined
    ? null
    : Number(row.heartbeatAgeSeconds || 0);
  const wifiRssi = row.wifiRssi === null || row.wifiRssi === undefined
    ? null
    : Number(row.wifiRssi);

  if (onlineStatus !== "online") {
    risks.push("offline");
  }
  if (heartbeatAgeSeconds === null || heartbeatAgeSeconds > 600) {
    risks.push("stale_heartbeat");
  }
  if (readingCount24h === 0) {
    risks.push("no_reading_24h");
  }
  if (wifiRssi !== null && wifiRssi <= -75) {
    risks.push("weak_signal");
  }
  if (!["applied", "not_configured"].includes(configSyncStatus)) {
    risks.push("pending_config");
  }

  return risks;
}

async function loadBusinessHealth(authContext) {
  const tenantId = extractTenantId(authContext);
  const [
    tenantCount,
    userCount,
    areaCount,
    gatewayCount,
    sensorCount,
    actuatorCount,
    activeAlertCount,
    todayCommandCount,
    aiPendingTaskCount
  ] = await Promise.all([
    tenantId ? Promise.resolve(1) : safeCount("SELECT COUNT(*) AS value FROM sys_tenants"),
    scopedCount("sys_users", "tenant_id", authContext),
    scopedCount("biz_areas", "tenant_id", authContext),
    scopedCount("iot_gateways", "tenant_id", authContext),
    scopedCount("iot_sensors", "tenant_id", authContext),
    scopedCount("iot_actuators", "tenant_id", authContext),
    scopedCount("ops_alerts", "tenant_id", authContext, ["status IN ('pending','acknowledged','in_progress','on_hold','reopened')"]),
    scopedCount("ops_control_commands", "tenant_id", authContext, ["DATE(queued_at) = CURDATE()"]),
    scopedCount("ai_tasks", "tenant_id", authContext, ["status IN ('pending','running','retrying')"])
  ]);

  return {
    tenantCount,
    userCount,
    areaCount,
    gatewayCount,
    sensorCount,
    actuatorCount,
    activeAlertCount,
    todayCommandCount,
    aiPendingTaskCount
  };
}

async function loadRecentFailureHealth(authContext) {
  const filters = ["l.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)", "l.result_status <> 'success'"];
  const params = [];
  appendTenantScope(filters, params, authContext, "l.tenant_id");
  const whereClause = `WHERE ${filters.join(" AND ")}`;
  const failedCount = await safeCount(`SELECT COUNT(*) AS value FROM sys_operation_logs l ${whereClause}`, params);
  const status = failedCount >= 20 ? "error" : failedCount > 0 ? "warning" : "healthy";
  return {
    status,
    failedCount
  };
}

async function scopedCount(tableName, tenantColumn, authContext, extraFilters = []) {
  const filters = Array.isArray(extraFilters) ? [...extraFilters] : [];
  const params = [];
  appendTenantScope(filters, params, authContext, tenantColumn);
  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  return safeCount(`SELECT COUNT(*) AS value FROM ${tableName} ${whereClause}`, params);
}

async function safeCount(sql, params = []) {
  try {
    const rows = await query(sql, params);
    return Number(rows[0]?.value || rows[0]?.count || 0);
  } catch {
    return 0;
  }
}

function buildCheck(code, label, status, detail) {
  return {
    code,
    label,
    status,
    detail
  };
}

function summarizeHealthStatus(checks) {
  if (checks.some((item) => item.status === "error")) {
    return "error";
  }
  if (checks.some((item) => item.status === "warning")) {
    return "warning";
  }
  return "healthy";
}

function formatDurationSeconds(seconds) {
  const total = Math.max(Number(seconds) || 0, 0);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) {
    return `${days}天${hours}小时`;
  }
  if (hours > 0) {
    return `${hours}小时${minutes}分钟`;
  }
  return `${minutes}分钟`;
}

async function assertTenantManagementAllowed(authContext, connection = null) {
  const tenantFoundationEnabled = await hasTenantFoundation(connection);
  if (!tenantFoundationEnabled) {
    throw new AppError("tenant_foundation_disabled", "当前环境尚未启用多租户底座", 400);
  }
  if (!isPlatformSuperAdmin(authContext)) {
    throw new AppError("forbidden_tenant", "只有超级管理员可以管理租户", 403);
  }
}

function isSuperAdmin(authContext) {
  return Array.isArray(authContext?.roles)
    && authContext.roles.some((role) => role?.roleCode === "super_admin");
}

function isPlatformSuperAdmin(authContext) {
  return isSuperAdmin(authContext) && Boolean(authContext?.tenant?.isDefault);
}

function isProtectedPermission(permission) {
  return permission?.permissionCode === "tenant:manage";
}

function isProtectedRole(role) {
  return role?.roleCode === "super_admin" || Number(role?.roleLevel || 999) <= 10;
}

function buildPermissionVisibilityClause(authContext, tableAlias = null) {
  const field = tableAlias ? `${tableAlias}.permission_code` : "permission_code";
  if (isPlatformSuperAdmin(authContext)) {
    return "1 = 1";
  }
  return `${field} <> ?`;
}

function buildPermissionVisibilityParams(authContext, initialParams = []) {
  if (isPlatformSuperAdmin(authContext)) {
    return initialParams;
  }
  return [...initialParams, "tenant:manage"];
}

function appendProtectedRoleFilter(filters, authContext, roleTableOrAlias = "r") {
  if (isSuperAdmin(authContext)) {
    return;
  }
  filters.push(`${roleTableOrAlias}.role_level > 10`);
}

function appendProtectedUserFilter(filters, authContext, userTableOrAlias = "u") {
  if (isSuperAdmin(authContext)) {
    return;
  }
  filters.push(
    `NOT EXISTS (
      SELECT 1
      FROM sys_user_roles urp
      JOIN sys_roles rp ON rp.id = urp.role_id
      WHERE urp.user_id = ${userTableOrAlias}.id
        AND rp.role_level <= 10
    )`
  );
}

/**
 * @param {SqlExecutor} executor
 * @param {number[]} roleIds
 * @param {any} [authContext]
 */
async function loadRoleRowsByIds(executor, roleIds, authContext = null) {
  if (!Array.isArray(roleIds) || roleIds.length === 0) {
    return [];
  }
  const tenantId = extractTenantId(authContext);
  const sql = `SELECT id, role_code AS roleCode, role_level AS roleLevel
               FROM sys_roles
               WHERE id IN (${roleIds.map(() => "?").join(",")})
                 ${tenantId ? "AND tenant_id = ?" : ""}`;
  const result = await executor.execute(sql, tenantId ? [...roleIds, tenantId] : roleIds);
  return asRowArray(result[0]);
}

/**
 * @param {SqlExecutor} executor
 * @param {number[]} permissionIds
 */
async function loadPermissionRowsByIds(executor, permissionIds) {
  if (!Array.isArray(permissionIds) || permissionIds.length === 0) {
    return [];
  }
  const result = await executor.execute(
    `SELECT id, permission_code AS permissionCode
     FROM sys_permissions
     WHERE id IN (${permissionIds.map(() => "?").join(",")})`,
    permissionIds
  );
  return asRowArray(result[0]);
}

/**
 * @param {SqlExecutor} executor
 * @param {number} userId
 * @param {any} [authContext]
 */
async function loadUserRoleRows(executor, userId, authContext = null) {
  const tenantId = extractTenantId(authContext);
  const result = await executor.execute(
    `SELECT r.id, r.role_code AS roleCode, r.role_level AS roleLevel
     FROM sys_user_roles ur
     JOIN sys_roles r ON r.id = ur.role_id
     JOIN sys_users u ON u.id = ur.user_id
     WHERE ur.user_id = ?
       ${tenantId ? "AND u.tenant_id = ? AND r.tenant_id = ?" : ""}`,
    tenantId ? [userId, tenantId, tenantId] : [userId]
  );
  return asRowArray(result[0]);
}

/**
 * @param {number} tenantId
 * @param {SqlExecutor} [executor]
 */
async function loadTenantById(tenantId, executor = pool) {
  const result = await executor.execute(
    `SELECT
       id,
       tenant_code AS tenantCode,
       tenant_name AS tenantName,
       tenant_slug AS tenantSlug,
       tenant_type AS tenantType,
       status,
       is_default AS isDefault,
       contact_name AS contactName,
       contact_phone AS contactPhone,
       contact_email AS contactEmail,
       expires_at AS expiresAt,
       remark
     FROM sys_tenants
     WHERE id = ?
     LIMIT 1`,
    [tenantId]
  );
  const rows = asRowArray(result[0]);
  if (!rows[0]) {
    return null;
  }
  return {
    ...rows[0],
    isDefault: Boolean(Number(rows[0].isDefault || 0))
  };
}

async function loadRoleById(roleId, authContext = null) {
  const filters = ["id = ?"];
  const params = [roleId];
  appendTenantScope(filters, params, authContext, "tenant_id");
  const rows = await query(
    `SELECT id, role_code AS roleCode, role_level AS roleLevel
     FROM sys_roles
     WHERE ${filters.join(" AND ")}
     LIMIT 1`,
    params
  );
  return rows[0] || null;
}

function assertProtectedRolesAllowed(authContext, roleRows, message) {
  if (isSuperAdmin(authContext)) {
    return;
  }
  const protectedRoles = (Array.isArray(roleRows) ? roleRows : []).filter(isProtectedRole);
  if (protectedRoles.length > 0) {
    throw new AppError("forbidden_role", message, 403, {
      roleIds: protectedRoles.map((item) => item.id),
      roleCodes: protectedRoles.map((item) => item.roleCode)
    });
  }
}

function assertProtectedPermissionsAllowed(authContext, permissionRows, message) {
  if (isSuperAdmin(authContext)) {
    return;
  }
  const protectedPermissions = (Array.isArray(permissionRows) ? permissionRows : []).filter(isProtectedPermission);
  if (protectedPermissions.length > 0) {
    throw new AppError("forbidden_permission", message, 403, {
      permissionIds: protectedPermissions.map((item) => item.id),
      permissionCodes: protectedPermissions.map((item) => item.permissionCode)
    });
  }
}

function assertRoleLevelAllowed(authContext, roleLevel, message) {
  if (isSuperAdmin(authContext)) {
    return;
  }
  if (Number(roleLevel || 999) <= 10) {
    throw new AppError("forbidden_role", message, 403, {
      roleLevel: Number(roleLevel || 0)
    });
  }
}

function normalizeTenantCode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(normalized)) {
    throw new AppError("invalid_tenant_code", "租户编码仅支持小写字母、数字、下划线和横线，长度 2-64", 400);
  }
  return normalized;
}

function normalizeTenantSlug(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,127}$/.test(normalized)) {
    throw new AppError("invalid_tenant_slug", "租户标识仅支持小写字母、数字和横线，长度 2-128", 400);
  }
  return normalized;
}

function normalizeTenantStatus(value) {
  const normalized = String(value || "").trim();
  if (!["enabled", "disabled", "expired"].includes(normalized)) {
    throw new AppError("invalid_tenant_status", "租户状态仅支持 enabled / disabled / expired", 400);
  }
  return normalized;
}

function normalizeTenantType(value) {
  const normalized = String(value || "").trim();
  if (!["enterprise", "trial", "internal"].includes(normalized)) {
    throw new AppError("invalid_tenant_type", "租户类型仅支持 enterprise / trial / internal", 400);
  }
  return normalized;
}

function normalizeDateTimeInput(value, fieldName) {
  if (!value) {
    return null;
  }
  const normalized = String(value).trim().replace("T", " ");
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) {
    return `${normalized}:00`;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return normalized;
  }
  throw new AppError("invalid_datetime", `${fieldName} 时间格式无效`, 400);
}

function tenantPersistenceErrorMessage(error) {
  if (error?.code === "ER_DUP_ENTRY") {
    if (String(error.message || "").includes("uk_sys_tenants_tenant_code")) {
      return "租户编码已存在";
    }
    if (String(error.message || "").includes("uk_sys_tenants_tenant_slug")) {
      return "租户标识已存在";
    }
    return "租户数据存在重复项";
  }
  return error.message;
}

function tenantPersistenceErrorStatus(error) {
  if (error?.httpStatus) {
    return error.httpStatus;
  }
  return error?.code === "ER_DUP_ENTRY" ? 409 : 400;
}

module.exports = systemRoutes;
