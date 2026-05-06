// @ts-check

const { pool, query } = require("../lib/mysql");
const { ok, fail } = require("../lib/response");
const { parseInteger, optionalString, requiredString } = require("../lib/helpers");
const { hasPermission } = require("../lib/auth");
const { logOperation } = require("../lib/audit");
const { buildAiEnhancedReport } = require("../lib/ai-provider");
const { AppError } = require("../lib/app-error");
const { loadConfigGroup } = require("../lib/system-config");
const {
  normalizeAreaScope,
  resolveAccessibleAreaIds,
  resolveAccessibleGatewayIds,
  appendTenantScope
} = require("../lib/data-scope");
const { extractTenantId } = require("../lib/tenant-foundation");
const { assertTenantFeatureEnabled, assertTenantLimitAvailable } = require("../lib/tenant-entitlements");

const REPORT_TYPE_LABELS = {
  diagnosis: "AI诊断",
  daily: "AI日报",
  weekly: "AI周报",
  monthly: "AI月报"
};

const RISK_LEVEL_LABELS = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "紧急"
};

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

async function aiRoutes(app) {
  app.get(
    "/api/v1/ai/diagnoses",
    {
      preHandler: [app.requirePermissions(["ai:view"])]
    },
    async (request) => {
      const triggerType = String(request.query?.triggerType || "").trim();
      const status = String(request.query?.status || "").trim();
      const keyword = String(request.query?.keyword || "").trim();

      const filters = ["r.report_type = 'diagnosis'"];
      const params = [];

      if (triggerType) {
        filters.push("r.trigger_type = ?");
        params.push(triggerType);
      }
      if (status) {
        filters.push("r.status = ?");
        params.push(status);
      }
      if (keyword) {
        filters.push("(r.report_no LIKE ? OR r.summary_text LIKE ?)");
        params.push(`%${keyword}%`, `%${keyword}%`);
      }
      appendTenantScope(filters, params, request.auth, "r.tenant_id");

      const rows = await query(
        `SELECT
           r.id,
           r.report_no AS reportNo,
           r.task_id AS taskId,
           r.report_type AS reportType,
           r.report_date AS reportDate,
           r.version_no AS versionNo,
           r.scope_type AS scopeType,
           r.scope_ids_json AS scopeIdsJson,
           r.tenant_id AS tenantId,
           r.status,
           r.metrics_json AS metricsJson,
           r.summary_text AS summaryText,
           r.content_markdown AS contentMarkdown,
           r.is_current_version AS isCurrentVersion,
           r.trigger_type AS triggerType,
           r.generated_at AS generatedAt,
           r.generated_by AS generatedBy,
           t.task_no AS taskNo,
           u.real_name AS generatedByName
         FROM ai_reports r
         LEFT JOIN ai_tasks t ON t.id = r.task_id
         LEFT JOIN sys_users u ON u.id = r.generated_by
         WHERE ${filters.join(" AND ")}
         ORDER BY r.generated_at DESC, r.id DESC`,
        params
      );

      const visibleRows = await filterAiRowsByScope(request.auth, rows);
      return ok(visibleRows.map(mapReportRow));
    }
  );

  app.get(
    "/api/v1/ai/tasks",
    {
      preHandler: [app.requirePermissions(["ai:view"])]
    },
    async (request) => {
      const taskType = String(request.query?.taskType || "").trim();
      const status = String(request.query?.status || "").trim();
      const triggerType = String(request.query?.triggerType || "").trim();

      const filters = [];
      const params = [];

      if (taskType) {
        filters.push("t.task_type = ?");
        params.push(taskType);
      }
      if (status) {
        filters.push("t.status = ?");
        params.push(status);
      }
      if (triggerType) {
        filters.push("t.trigger_type = ?");
        params.push(triggerType);
      }
      appendTenantScope(filters, params, request.auth, "t.tenant_id");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           t.id,
           t.task_no AS taskNo,
           t.task_type AS taskType,
           t.trigger_type AS triggerType,
           t.scope_type AS scopeType,
           t.scope_ids_json AS scopeIdsJson,
           t.dedupe_key AS dedupeKey,
           t.related_alert_count AS relatedAlertCount,
           t.status,
           t.retry_count AS retryCount,
           t.max_retry_count AS maxRetryCount,
           t.payload_json AS payloadJson,
           t.error_message AS errorMessage,
           t.scheduled_at AS scheduledAt,
           t.started_at AS startedAt,
           t.completed_at AS completedAt,
           t.created_at AS createdAt,
           u.real_name AS createdByName,
           (
             SELECT COUNT(*)
             FROM ai_reports r
             WHERE r.task_id = t.id
           ) AS reportCount
         FROM ai_tasks t
         LEFT JOIN sys_users u ON u.id = t.created_by
         ${whereClause}
         ORDER BY t.created_at DESC, t.id DESC`,
        params
      );

      const visibleRows = await filterAiRowsByScope(request.auth, rows);
      return ok(visibleRows.map(mapTaskRow));
    }
  );

  app.get(
    "/api/v1/ai/tasks/:id",
    {
      preHandler: [app.requirePermissions(["ai:view"])]
    },
    async (request, reply) => {
      const taskId = parseInteger(request.params.id);
      if (!taskId) {
        return fail(reply, 400, "无效的任务ID");
      }

      const filters = ["t.id = ?"];
      const params = [taskId];
      appendTenantScope(filters, params, request.auth, "t.tenant_id");
      const rows = await query(
        `SELECT
           t.id,
           t.task_no AS taskNo,
           t.task_type AS taskType,
           t.trigger_type AS triggerType,
           t.scope_type AS scopeType,
           t.scope_ids_json AS scopeIdsJson,
           t.dedupe_key AS dedupeKey,
           t.related_alert_count AS relatedAlertCount,
           t.status,
           t.retry_count AS retryCount,
           t.max_retry_count AS maxRetryCount,
           t.payload_json AS payloadJson,
           t.error_message AS errorMessage,
           t.scheduled_at AS scheduledAt,
           t.started_at AS startedAt,
           t.completed_at AS completedAt,
           t.created_at AS createdAt,
           t.created_by AS createdBy,
           u.real_name AS createdByName
         FROM ai_tasks t
         LEFT JOIN sys_users u ON u.id = t.created_by
         WHERE ${filters.join(" AND ")}
         LIMIT 1`,
        params
      );

      const task = rows[0];
      if (!task) {
        return fail(reply, 404, "未找到任务", "not_found");
      }
      await assertAiScopeAccess(request.auth, task.scopeType, task.scopeIdsJson, "没有访问该 AI 任务范围的权限", {
        requireAll: false,
        errorCode: "not_found",
        httpStatus: 404
      });

      const reports = await query(
        `SELECT
           id,
           report_no AS reportNo,
           report_type AS reportType,
           report_date AS reportDate,
           version_no AS versionNo,
           status,
           generated_at AS generatedAt
         FROM ai_reports
         WHERE task_id = ?
         ORDER BY generated_at DESC, id DESC`,
        [taskId]
      );

      return ok({
        ...mapTaskRow(task),
        reports
      });
    }
  );

  app.post(
    "/api/v1/ai/tasks",
    {
      preHandler: [app.authenticate]
    },
    async (request, reply) => {
      try {
        const taskType = requiredString(request.body?.taskType, "taskType");
        const requiredPermission = resolveTaskPermission(taskType);
        if (!requiredPermission) {
          return fail(reply, 400, "taskType 仅支持 diagnosis 或 report");
        }
        if (!hasPermission(request.auth, [requiredPermission])) {
          return fail(reply, 403, "没有访问该资源的权限", "forbidden", {
            required: [requiredPermission],
            granted: request.auth.permissionCodes
          });
        }

        const payload = normalizeTaskPayload(request.body);
        await assertAiScopeAccess(request.auth, payload.scopeType, payload.scopeIds, "没有访问该 AI 范围资源的权限");
        await assertTenantFeatureEnabled(pool, {
          authContext: request.auth,
          featureKey: "enable_ai",
          message: "当前租户未启用 AI 能力，不能创建 AI 任务"
        });
        const result = await createTaskAndArtifacts({
          request,
          taskType,
          createdBy: request.auth.user.id,
          ...payload
        });

        reply.code(result.task.status === "deduped" ? 202 : 201);
        return ok(result, result.task.status === "deduped" ? "任务已去重合并" : "AI任务已创建");
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.post(
    "/api/v1/ai/tasks/:id/retry",
    {
      preHandler: [app.authenticate]
    },
    async (request, reply) => {
      const taskId = parseInteger(request.params.id);
      if (!taskId) {
        return fail(reply, 400, "无效的任务ID");
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const tenantId = extractTenantId(request.auth);
        const [taskRows] = await connection.execute(
          `SELECT
             id,
             task_no AS taskNo,
             task_type AS taskType,
             trigger_type AS triggerType,
             scope_type AS scopeType,
             scope_ids_json AS scopeIdsJson,
             dedupe_key AS dedupeKey,
             related_alert_count AS relatedAlertCount,
             status,
             retry_count AS retryCount,
             max_retry_count AS maxRetryCount,
             payload_json AS payloadJson
           FROM ai_tasks
           WHERE id = ?
             ${tenantId ? "AND tenant_id = ?" : ""}
           LIMIT 1`,
          tenantId ? [taskId, tenantId] : [taskId]
        );

        const task = taskRows[0];
        if (!task) {
          await connection.rollback();
          return fail(reply, 404, "未找到任务", "not_found");
        }

        const requiredPermission = resolveTaskPermission(task.taskType);
        if (!hasPermission(request.auth, [requiredPermission])) {
          await connection.rollback();
          return fail(reply, 403, "没有访问该资源的权限", "forbidden", {
            required: [requiredPermission],
            granted: request.auth.permissionCodes
          });
        }
        await assertAiScopeAccess(request.auth, task.scopeType, task.scopeIdsJson, "没有访问该 AI 任务范围的权限");
        await assertTenantFeatureEnabled(connection, {
          tenantId,
          featureKey: "enable_ai",
          message: "当前租户未启用 AI 能力，不能重试 AI 任务"
        });

        if (["pending", "queued", "running"].includes(task.status)) {
          await connection.rollback();
          return fail(reply, 409, "运行中的任务不能重试", "conflict");
        }

        if (task.retryCount >= task.maxRetryCount) {
          await connection.rollback();
          return fail(reply, 409, "已达到最大重试次数", "conflict");
        }

        const payload = parseMaybeJson(task.payloadJson) || {};
        const scopeIds = normalizeScopeIds(payload.scopeIds || task.scopeIdsJson);
        const reportType = task.taskType === "diagnosis" ? "diagnosis" : payload.reportType || "daily";
        const reportDate = normalizeReportDate(payload.reportDate);
        const now = new Date();
        const currentTenantId = extractTenantId(request.auth);

        await connection.execute(
          `UPDATE ai_tasks
           SET status = 'success',
               retry_count = retry_count + 1,
               error_message = NULL,
               started_at = ?,
               completed_at = ?
           WHERE id = ?`,
          [now, now, taskId]
        );

        const report = await createReportForTask(connection, {
          taskId,
          taskType: task.taskType,
          triggerType: task.triggerType,
          scopeType: task.scopeType,
          scopeIds,
          relatedAlertCount: task.relatedAlertCount,
          reportType,
          reportDate,
          reasonText: payload.reasonText || "手动重试 AI 任务",
          createdBy: request.auth.user.id,
          tenantId: currentTenantId
        });

        await connection.commit();
        await logOperation(request, {
          moduleCode: "ai_task",
          operationType: "retry",
          targetType: "ai_tasks",
          targetId: taskId,
          requestParams: {
            taskNo: task.taskNo,
            taskType: task.taskType
          },
          resultMessage: "重试 AI 任务"
        });

        return ok(
          {
            taskId,
            taskNo: task.taskNo,
            status: "success",
            report
          },
          "AI任务已重试"
        );
      } catch (error) {
        await connection.rollback();
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      } finally {
        connection.release();
      }
    }
  );

  app.post(
    "/api/v1/ai/tasks/:id/cancel",
    {
      preHandler: [app.authenticate]
    },
    async (request, reply) => {
      const taskId = parseInteger(request.params.id);
      if (!taskId) {
        return fail(reply, 400, "无效的任务ID");
      }

      const filters = ["id = ?"];
      const params = [taskId];
      appendTenantScope(filters, params, request.auth, "tenant_id");
      const rows = await query(
        `SELECT id, task_no AS taskNo, task_type AS taskType, scope_type AS scopeType, scope_ids_json AS scopeIdsJson, status
         FROM ai_tasks
         WHERE ${filters.join(" AND ")}
         LIMIT 1`,
        params
      );
      const task = rows[0];
      if (!task) {
        return fail(reply, 404, "未找到任务", "not_found");
      }

      const requiredPermission = resolveTaskPermission(task.taskType);
      if (!hasPermission(request.auth, [requiredPermission])) {
        return fail(reply, 403, "没有访问该资源的权限", "forbidden", {
          required: [requiredPermission],
          granted: request.auth.permissionCodes
        });
      }
      await assertAiScopeAccess(request.auth, task.scopeType, task.scopeIdsJson, "没有访问该 AI 任务范围的权限");

      if (task.status === "success") {
        return fail(reply, 409, "已成功完成的任务不能取消", "conflict");
      }

      await query(
        `UPDATE ai_tasks
         SET status = 'cancelled',
             completed_at = NOW(),
             error_message = '任务已手动取消'
         WHERE id = ?`,
        [taskId]
      );

      await logOperation(request, {
        moduleCode: "ai_task",
        operationType: "cancel",
        targetType: "ai_tasks",
        targetId: taskId,
        requestParams: {
          taskNo: task.taskNo,
          taskType: task.taskType
        },
        resultMessage: "取消 AI 任务"
      });

      return ok({ taskId, status: "cancelled" }, "AI任务已取消");
    }
  );

  app.get(
    "/api/v1/ai/report-scheduler/status",
    {
      preHandler: [app.requirePermissions(["ai:view"])]
    },
    async (request) => {
      const schedulerConfig = await loadConfigGroup("ai_scheduler", {
        authContext: request.auth,
        fallbackToDefaultTenant: true,
        fallbackToGlobal: true
      });

      return ok(normalizeAiSchedulerStatus(schedulerConfig));
    }
  );

  app.get(
    "/api/v1/ai/reports",
    {
      preHandler: [app.requirePermissions(["ai:view"])]
    },
    async (request) => {
      const reportType = String(request.query?.reportType || "").trim();
      const status = String(request.query?.status || "").trim();
      const scopeType = String(request.query?.scopeType || "").trim();

      const filters = [];
      const params = [];

      if (reportType) {
        filters.push("r.report_type = ?");
        params.push(reportType);
      }
      if (status) {
        filters.push("r.status = ?");
        params.push(status);
      }
      if (scopeType) {
        filters.push("r.scope_type = ?");
        params.push(scopeType);
      }
      appendTenantScope(filters, params, request.auth, "r.tenant_id");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           r.id,
           r.report_no AS reportNo,
           r.task_id AS taskId,
           r.report_type AS reportType,
           r.report_date AS reportDate,
           r.version_no AS versionNo,
           r.scope_type AS scopeType,
           r.scope_ids_json AS scopeIdsJson,
           r.status,
           r.metrics_json AS metricsJson,
           r.summary_text AS summaryText,
           r.content_markdown AS contentMarkdown,
           r.is_current_version AS isCurrentVersion,
           r.trigger_type AS triggerType,
           r.generated_at AS generatedAt,
           r.generated_by AS generatedBy,
           t.task_no AS taskNo,
           u.real_name AS generatedByName
         FROM ai_reports r
         LEFT JOIN ai_tasks t ON t.id = r.task_id
         LEFT JOIN sys_users u ON u.id = r.generated_by
         ${whereClause}
         ORDER BY r.report_date DESC, r.generated_at DESC, r.id DESC`,
        params
      );

      const visibleRows = await filterAiRowsByScope(request.auth, rows);
      return ok(visibleRows.map(mapReportRow));
    }
  );

  app.get(
    "/api/v1/ai/reports/:id",
    {
      preHandler: [app.requirePermissions(["ai:view"])]
    },
    async (request, reply) => {
      const reportId = parseInteger(request.params.id);
      if (!reportId) {
        return fail(reply, 400, "无效的报告ID");
      }

      const filters = ["r.id = ?"];
      const params = [reportId];
      appendTenantScope(filters, params, request.auth, "r.tenant_id");
      const rows = await query(
        `SELECT
           r.id,
           r.report_no AS reportNo,
           r.task_id AS taskId,
           r.report_type AS reportType,
           r.report_date AS reportDate,
           r.version_no AS versionNo,
           r.scope_type AS scopeType,
           r.scope_ids_json AS scopeIdsJson,
           r.status,
           r.metrics_json AS metricsJson,
           r.summary_text AS summaryText,
           r.content_markdown AS contentMarkdown,
           r.is_current_version AS isCurrentVersion,
           r.trigger_type AS triggerType,
           r.generated_at AS generatedAt,
           r.generated_by AS generatedBy,
           t.task_no AS taskNo,
           u.real_name AS generatedByName
         FROM ai_reports r
         LEFT JOIN ai_tasks t ON t.id = r.task_id
         LEFT JOIN sys_users u ON u.id = r.generated_by
         WHERE ${filters.join(" AND ")}
         LIMIT 1`,
        params
      );

      const report = rows[0];
      if (!report) {
        return fail(reply, 404, "未找到报告", "not_found");
      }
      await assertAiScopeAccess(request.auth, report.scopeType, report.scopeIdsJson, "没有访问该 AI 报告范围的权限", {
        requireAll: false,
        errorCode: "not_found",
        httpStatus: 404
      });

      const versionRows = await query(
        `SELECT
           id,
           report_no AS reportNo,
           version_no AS versionNo,
           status,
           is_current_version AS isCurrentVersion,
           generated_at AS generatedAt,
           scope_ids_json AS scopeIdsJson
         FROM ai_reports
         WHERE report_type = ?
           AND tenant_id <=> ?
           AND DATE(report_date) = DATE(?)
           AND scope_type = ?
         ORDER BY version_no DESC, id DESC`,
        [report.reportType, report.tenantId || null, formatLocalDate(report.reportDate), report.scopeType]
      );

      return ok({
        ...mapReportRow(report),
        versions: versionRows.filter((item) => sameScopeIds(item.scopeIdsJson, report.scopeIdsJson))
      });
    }
  );

  app.post(
    "/api/v1/ai/reports/generate",
    {
      preHandler: [app.requirePermissions(["ai:report_generate"])]
    },
    async (request, reply) => {
      try {
        const payload = normalizeTaskPayload({
          ...request.body,
          taskType: "report"
        });
        await assertAiScopeAccess(request.auth, payload.scopeType, payload.scopeIds, "没有访问该 AI 范围资源的权限");
        await assertTenantFeatureEnabled(pool, {
          authContext: request.auth,
          featureKey: "enable_ai",
          message: "当前租户未启用 AI 能力，不能生成报告"
        });
        const result = await createTaskAndArtifacts({
          request,
          taskType: "report",
          createdBy: request.auth.user.id,
          ...payload
        });

        reply.code(201);
        return ok(result, "AI报告生成成功");
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );
}

function resolveTaskPermission(taskType) {
  if (taskType === "diagnosis") {
    return "ai:trigger";
  }
  if (taskType === "report") {
    return "ai:report_generate";
  }
  return null;
}

function normalizeTaskPayload(input = {}) {
  const triggerType = optionalString(input.triggerType) || "manual";
  const scopeType = optionalString(input.scopeType) || "global";
  const scopeIds = normalizeScopeIds(input.scopeIds);
  const dedupeKey = optionalString(input.dedupeKey);
  const relatedAlertCount = parseInteger(input.relatedAlertCount, 0) || 0;
  const reasonText = optionalString(input.reasonText);
  const reportType = input.taskType === "diagnosis" ? "diagnosis" : optionalString(input.reportType) || "daily";
  const reportDate = normalizeReportDate(input.reportDate);
  const scheduledAt = optionalString(input.scheduledAt);

  if (!["manual", "event", "schedule"].includes(triggerType)) {
    throw new Error("triggerType 仅支持 manual/event/schedule");
  }
  if (!["area", "device", "global"].includes(scopeType)) {
    throw new Error("scopeType 仅支持 area/device/global");
  }
  if (!["diagnosis", "daily", "weekly", "monthly"].includes(reportType)) {
    throw new Error("reportType 仅支持 diagnosis/daily/weekly/monthly");
  }

  return {
    triggerType,
    scopeType,
    scopeIds,
    dedupeKey,
    relatedAlertCount,
    reasonText,
    reportType,
    reportDate,
    scheduledAt
  };
}

function normalizeAiSchedulerStatus(configValues) {
  const autoDailyReportEnabled = normalizeBooleanConfig(configValues.auto_daily_report_enabled, false);
  const autoWeeklyReportEnabled = normalizeBooleanConfig(configValues.auto_weekly_report_enabled, false);
  const eventDiagnosisEnabled = normalizeBooleanConfig(configValues.event_diagnosis_enabled, false);

  return {
    autoDailyReportEnabled,
    dailyReportTime: optionalString(configValues.daily_report_time) || "08:30",
    autoWeeklyReportEnabled,
    weeklyReportTime: optionalString(configValues.weekly_report_time) || "MON 08:30",
    eventDiagnosisEnabled,
    cooldownMinutes: parseInteger(configValues.cooldown_minutes, 30) || 30,
    maxConcurrency: parseInteger(configValues.max_concurrency, 3) || 3,
    maxQueueSize: parseInteger(configValues.max_queue_size, 100) || 100,
    retryCount: parseInteger(configValues.retry_count, 2) || 2,
    retryIntervalMinutes: parseInteger(configValues.retry_interval_minutes, 15) || 15,
    mode: autoDailyReportEnabled || autoWeeklyReportEnabled ? "auto_enabled" : "manual_only",
    manualGenerateEnabled: true,
    effectiveSummary: autoDailyReportEnabled || autoWeeklyReportEnabled
      ? "自动生成已开启，系统可按配置时间生成报告。"
      : "自动生成已关闭，测试阶段仅支持手动点击生成报告。"
  };
}

function normalizeBooleanConfig(value, fallback = false) {
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

async function resolveAiAccessContext(authContext) {
  const areaScope = normalizeAreaScope(authContext);
  const [areaIds, gatewayIds] = await Promise.all([
    resolveAccessibleAreaIds(authContext),
    resolveAccessibleGatewayIds(authContext)
  ]);

  return {
    areaIds,
    gatewayIds,
    hasAllAreas: areaScope.hasAllAreas
  };
}

function hasIntersection(allowedIds, requestedIds, requireAll = false) {
  if (allowedIds === null) {
    return true;
  }
  if (!Array.isArray(requestedIds) || requestedIds.length === 0) {
    return false;
  }
  return requireAll
    ? requestedIds.every((id) => allowedIds.includes(id))
    : requestedIds.some((id) => allowedIds.includes(id));
}

function canAccessAiScope(scopeType, scopeIds, accessContext, requireAll = false) {
  const ids = normalizeScopeIds(scopeIds);
  if (scopeType === "global") {
    return accessContext.hasAllAreas || accessContext.areaIds === null;
  }
  if (scopeType === "area") {
    return hasIntersection(accessContext.areaIds, ids, requireAll);
  }
  if (scopeType === "device") {
    return hasIntersection(accessContext.gatewayIds, ids, requireAll);
  }
  return false;
}

async function filterAiRowsByScope(authContext, rows) {
  const accessContext = await resolveAiAccessContext(authContext);
  return rows.filter((row) => canAccessAiScope(row.scopeType, row.scopeIdsJson, accessContext, false));
}

async function assertAiScopeAccess(
  authContext,
  scopeType,
  scopeIds,
  message = "没有访问该 AI 范围资源的权限",
  options = {}
) {
  const {
    requireAll = true,
    errorCode = "forbidden_scope",
    httpStatus = 403
  } = options;
  const accessContext = await resolveAiAccessContext(authContext);
  if (!canAccessAiScope(scopeType, scopeIds, accessContext, requireAll)) {
    throw new AppError(errorCode, message, httpStatus, {
      scopeType,
      scopeIds: normalizeScopeIds(scopeIds)
    });
  }
}

async function createTaskAndArtifacts({
  request,
  taskType,
  createdBy,
  triggerType,
  scopeType,
  scopeIds,
  dedupeKey,
  relatedAlertCount,
  reasonText,
  reportType,
  reportDate,
  scheduledAt
}) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const currentTenantId = extractTenantId(request.auth);

    if (dedupeKey) {
      const [rawActiveTaskRows] = await connection.execute(
        `SELECT id, task_no AS taskNo
         FROM ai_tasks
         WHERE dedupe_key = ?
           ${currentTenantId ? "AND tenant_id = ?" : ""}
           AND status IN ('pending', 'queued', 'running')
         ORDER BY id DESC
         LIMIT 1`,
        currentTenantId ? [dedupeKey, currentTenantId] : [dedupeKey]
      );
      const activeTaskRows = asRowArray(rawActiveTaskRows);

      if (activeTaskRows.length > 0) {
        const taskNo = `AI-TASK-${Date.now()}`;
        const payloadJson = JSON.stringify({
          taskType,
          reportType,
          scopeType,
          scopeIds,
          reportDate,
          reasonText
        });
        const [dedupedResult] = currentTenantId
          ? await connection.execute(
            `INSERT INTO ai_tasks
              (tenant_id, task_no, task_type, trigger_type, scope_type, scope_ids_json, dedupe_key, related_alert_count, status,
               retry_count, max_retry_count, payload_json, error_message, scheduled_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'deduped', 0, 3, ?, ?, ?, ?)`,
            [
              currentTenantId,
              taskNo,
              taskType,
              triggerType,
              scopeType,
              JSON.stringify(scopeIds),
              dedupeKey,
              relatedAlertCount,
              payloadJson,
              `与任务 ${activeTaskRows[0].taskNo} 合并`,
              scheduledAt || new Date(),
              createdBy
            ]
          )
          : await connection.execute(
            `INSERT INTO ai_tasks
              (task_no, task_type, trigger_type, scope_type, scope_ids_json, dedupe_key, related_alert_count, status,
               retry_count, max_retry_count, payload_json, error_message, scheduled_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'deduped', 0, 3, ?, ?, ?, ?)`,
            [
              taskNo,
              taskType,
              triggerType,
              scopeType,
              JSON.stringify(scopeIds),
              dedupeKey,
              relatedAlertCount,
              payloadJson,
              `与任务 ${activeTaskRows[0].taskNo} 合并`,
              scheduledAt || new Date(),
              createdBy
            ]
          );
        const dedupedTaskId = getInsertId(dedupedResult);

        await connection.commit();
        await logOperation(request, {
          moduleCode: "ai_task",
          operationType: "create_deduped",
          targetType: "ai_tasks",
          targetId: dedupedTaskId,
          requestParams: {
            taskType,
            triggerType,
            scopeType,
            scopeIds,
            dedupeKey
          },
          resultMessage: "AI任务去重合并"
        });

        return {
          task: {
            id: dedupedTaskId,
            taskNo,
            taskType,
            triggerType,
            scopeType,
            scopeIds,
            status: "deduped",
            errorMessage: `与任务 ${activeTaskRows[0].taskNo} 合并`
          },
          report: null
        };
      }
    }

    const taskNo = `AI-TASK-${Date.now()}`;
    const now = new Date();
    const payloadJson = JSON.stringify({
      taskType,
      reportType,
      scopeType,
      scopeIds,
      reportDate,
      reasonText
    });

    if (currentTenantId) {
      await assertTenantLimitAvailable(connection, {
        tenantId: currentTenantId,
        limitKey: "max_ai_tasks_per_day",
        increment: 1,
        message: "当前租户已达到 AI 每日任务上限，请升级套餐或调整租户配额"
      });
    }

    const [taskResult] = currentTenantId
      ? await connection.execute(
        `INSERT INTO ai_tasks
          (tenant_id, task_no, task_type, trigger_type, scope_type, scope_ids_json, dedupe_key, related_alert_count, status,
           retry_count, max_retry_count, payload_json, scheduled_at, started_at, completed_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'success', 0, 3, ?, ?, ?, ?, ?)`,
        [
          currentTenantId,
          taskNo,
          taskType,
          triggerType,
          scopeType,
          JSON.stringify(scopeIds),
          dedupeKey,
          relatedAlertCount,
          payloadJson,
          scheduledAt || now,
          now,
          now,
          createdBy
        ]
      )
      : await connection.execute(
        `INSERT INTO ai_tasks
          (task_no, task_type, trigger_type, scope_type, scope_ids_json, dedupe_key, related_alert_count, status,
           retry_count, max_retry_count, payload_json, scheduled_at, started_at, completed_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'success', 0, 3, ?, ?, ?, ?, ?)`,
        [
          taskNo,
          taskType,
          triggerType,
          scopeType,
          JSON.stringify(scopeIds),
          dedupeKey,
          relatedAlertCount,
          payloadJson,
          scheduledAt || now,
          now,
          now,
          createdBy
        ]
      );
    const taskId = getInsertId(taskResult);

    const report = await createReportForTask(connection, {
      taskId,
      taskType,
      triggerType,
      scopeType,
      scopeIds,
      relatedAlertCount,
      reportType,
      reportDate,
      reasonText,
      createdBy,
      tenantId: currentTenantId
    });

    await connection.commit();
    await logOperation(request, {
      moduleCode: "ai_task",
      operationType: "create",
      targetType: "ai_tasks",
      targetId: taskId,
      requestParams: {
        taskType,
        triggerType,
        scopeType,
        scopeIds,
        reportType
      },
      resultMessage: "创建 AI 任务"
    });

    return {
      task: {
        id: taskId,
        taskNo,
        taskType,
        triggerType,
        scopeType,
        scopeIds,
        status: "success",
        relatedAlertCount
      },
      report
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function createReportForTask(connection, options) {
  const {
    taskId,
    taskType,
    triggerType,
    scopeType,
    scopeIds,
    relatedAlertCount,
    reportType,
    reportDate,
    reasonText,
    createdBy,
    tenantId = null
  } = options;

  const snapshot = await loadScopeSnapshot(connection, scopeType, scopeIds, {
    reportType,
    reportDate,
    tenantId
  });
  const metrics = buildMetrics({
    reportType,
    snapshot,
    relatedAlertCount
  });
  const defaultSummaryText = buildSummaryText({
    taskType,
    reportType,
    snapshot,
    metrics,
    reasonText
  });
  const defaultContentMarkdown = buildReportMarkdown({
    taskType,
    reportType,
    reportDate,
    scopeType,
    snapshot,
    metrics,
    summaryText: defaultSummaryText,
    reasonText
  });

  let summaryText = defaultSummaryText;
  let contentMarkdown = defaultContentMarkdown;
  let enrichedMetrics = {
    ...metrics,
    aiProvider: {
      mode: "local_mock",
      configured: false
    }
  };

  try {
    const aiResult = await buildAiEnhancedReport(connection, {
      taskType,
      reportType,
      reportDate,
      scopeType,
      scopeIds,
      reasonText,
      snapshot,
      metrics,
      fallbackSummaryText: defaultSummaryText,
      fallbackContentMarkdown: defaultContentMarkdown
    }, {
      tenantId
    });

    enrichedMetrics = {
      ...metrics,
      riskLevel: aiResult.riskLevel || metrics.riskLevel,
      suggestedActions: aiResult.suggestedActions?.length ? aiResult.suggestedActions : metrics.suggestedActions,
      aiProvider: {
        mode: aiResult.mode,
        configured: Boolean(aiResult.configured),
        model: aiResult.model || null,
        baseUrl: aiResult.baseUrl || null,
        latencyMs: aiResult.latencyMs || null,
        error: null
      }
    };
    summaryText = aiResult.summaryText || defaultSummaryText;
    contentMarkdown = aiResult.contentMarkdown || defaultContentMarkdown;
  } catch (error) {
    enrichedMetrics = {
      ...metrics,
      aiProvider: {
        mode: "fallback",
        configured: true,
        model: null,
        baseUrl: null,
        latencyMs: null,
        error: error.message
      }
    };
    contentMarkdown = `${defaultContentMarkdown}\n\n> 远程 AI 模型调用失败，已回退到本地规则摘要：${error.message}`;
  }

  const [versionRows] = await connection.execute(
    `SELECT COALESCE(MAX(version_no), 0) AS maxVersion
     FROM ai_reports
     WHERE report_type = ?
       ${tenantId ? "AND tenant_id = ?" : ""}
       AND DATE(report_date) = DATE(?)
       AND scope_type = ?`,
    tenantId ? [reportType, tenantId, reportDate, scopeType] : [reportType, reportDate, scopeType]
  );
  const versionNo = Number(versionRows[0]?.maxVersion || 0) + 1;

  await connection.execute(
    `UPDATE ai_reports
     SET is_current_version = 0
     WHERE report_type = ?
       ${tenantId ? "AND tenant_id = ?" : ""}
       AND DATE(report_date) = DATE(?)
       AND scope_type = ?`,
    tenantId ? [reportType, tenantId, reportDate, scopeType] : [reportType, reportDate, scopeType]
  );

  const reportNo = `AI-REPORT-${Date.now()}`;
  const [reportResult] = tenantId
    ? await connection.execute(
      `INSERT INTO ai_reports
        (tenant_id, report_no, task_id, report_type, report_date, version_no, scope_type, scope_ids_json, status,
         metrics_json, summary_text, content_markdown, is_current_version, trigger_type, generated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'generated', ?, ?, ?, 1, ?, ?)`,
      [
        tenantId,
        reportNo,
        taskId,
        reportType,
        reportDate,
        versionNo,
        scopeType,
        JSON.stringify(scopeIds),
        JSON.stringify(enrichedMetrics),
        summaryText,
        contentMarkdown,
        triggerType,
        createdBy
      ]
    )
    : await connection.execute(
      `INSERT INTO ai_reports
        (report_no, task_id, report_type, report_date, version_no, scope_type, scope_ids_json, status,
         metrics_json, summary_text, content_markdown, is_current_version, trigger_type, generated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'generated', ?, ?, ?, 1, ?, ?)`,
      [
        reportNo,
        taskId,
        reportType,
        reportDate,
        versionNo,
        scopeType,
        JSON.stringify(scopeIds),
        JSON.stringify(enrichedMetrics),
        summaryText,
        contentMarkdown,
        triggerType,
        createdBy
      ]
    );

  return {
    id: reportResult.insertId,
    reportNo,
    reportType,
    reportDate,
    versionNo,
    status: "generated",
    summaryText,
    metrics: enrichedMetrics
  };
}

async function loadScopeSnapshot(connection, scopeType, scopeIds, options = {}) {
  const normalizedScopeType = scopeType || "global";
  const ids = normalizeScopeIds(scopeIds);
  const scopeNames = await loadScopeNames(connection, normalizedScopeType, ids);
  const sensorSnapshot = await loadSensorSnapshot(connection, normalizedScopeType, ids);
  const gatewaySnapshot = await loadGatewaySnapshot(connection, normalizedScopeType, ids);
  const actuatorSnapshot = await loadActuatorSnapshot(connection, normalizedScopeType, ids);
  const alertSnapshot = await loadAlertSnapshot(connection, normalizedScopeType, ids);
  const cropRecommendationSnapshot = await loadCropRecommendationSnapshot(connection, {
    scopeType: normalizedScopeType,
    scopeIds: ids,
    reportType: options.reportType,
    reportDate: options.reportDate,
    tenantId: options.tenantId || null
  });

  return {
    scopeType: normalizedScopeType,
    scopeIds: ids,
    scopeNames,
    sensorSnapshot,
    gatewaySnapshot,
    actuatorSnapshot,
    alertSnapshot,
    cropRecommendationSnapshot
  };
}

async function loadScopeNames(connection, scopeType, scopeIds) {
  if (scopeType === "area") {
    const { sql, params } = buildScopeFilter(scopeType, scopeIds, "id", "id");
    const statement = `SELECT area_name AS name FROM biz_areas WHERE status = 'enabled' ${sql} ORDER BY id ASC`;
    const [rows] = await connection.execute(statement, params);
    return rows.map((row) => row.name);
  }

  if (scopeType === "device") {
    const { sql, params } = buildScopeFilter(scopeType, scopeIds, "area_id", "id");
    const statement = `SELECT gateway_name AS name FROM iot_gateways WHERE status = 'enabled' ${sql} ORDER BY id ASC`;
    const [rows] = await connection.execute(statement, params);
    return rows.map((row) => row.name);
  }

  return ["全局视图"];
}

async function loadSensorSnapshot(connection, scopeType, scopeIds) {
  const { sql, params } = buildScopeFilter(scopeType, scopeIds, "area_id", "gateway_id");
  const [countRows] = await connection.execute(
    `
      SELECT COUNT(*) AS sensorCount
      FROM iot_sensors
      WHERE sensor_status = 'enabled' ${sql}
    `,
    params
  );
  const [metricRows] = await connection.execute(
    `
      SELECT
        COALESCE(m.metric_code, s.sensor_type) AS metricCode,
        COALESCE(MAX(m.metric_name), MAX(s.sensor_type)) AS metricName,
        COALESCE(MAX(NULLIF(m.unit_name, '')), MAX(s.unit_name), '') AS unitName,
        COALESCE(MAX(m.sort_order), 999) AS sortOrder,
        MAX(m.warn_min) AS warnMin,
        MAX(m.warn_max) AS warnMax,
        MAX(m.normal_min) AS normalMin,
        MAX(m.normal_max) AS normalMax,
        COUNT(*) AS sensorCount,
        AVG(s.current_value_decimal) AS avgValue
      FROM iot_sensors s
      LEFT JOIN iot_metric_defs m ON m.metric_code = s.sensor_type
      WHERE s.sensor_status = 'enabled' ${sql}
      GROUP BY COALESCE(m.metric_code, s.sensor_type)
      ORDER BY sortOrder ASC, metricCode ASC
    `,
    params
  );

  const metricSummaries = metricRows.map((item) => ({
    metricCode: item.metricCode,
    metricName: item.metricName || item.metricCode,
    unitName: item.unitName || "",
    sortOrder: Number(item.sortOrder || 999),
    sensorCount: Number(item.sensorCount || 0),
    avgValue: toNullableNumber(item.avgValue),
    warnMin: toNullableNumber(item.warnMin),
    warnMax: toNullableNumber(item.warnMax),
    normalMin: toNullableNumber(item.normalMin),
    normalMax: toNullableNumber(item.normalMax)
  }));

  const metricsByCode = Object.fromEntries(metricSummaries.map((item) => [item.metricCode, item.avgValue]));
  return {
    sensorCount: Number(countRows[0]?.sensorCount || 0),
    avgTemperature: metricsByCode.temperature ?? null,
    avgHumidity: metricsByCode.humidity ?? null,
    metricSummaries
  };
}

async function loadGatewaySnapshot(connection, scopeType, scopeIds) {
  const { sql, params } = buildScopeFilter(scopeType, scopeIds, "area_id", "id");
  const statement = `
    SELECT
      COUNT(*) AS gatewayCount,
      SUM(CASE WHEN online_status = 'online' THEN 1 ELSE 0 END) AS onlineGatewayCount,
      AVG(wifi_rssi) AS avgWifiRssi
    FROM iot_gateways
    WHERE status = 'enabled' ${sql}
  `;
  const [rows] = await connection.execute(statement, params);
  return rows[0] || {
    gatewayCount: 0,
    onlineGatewayCount: 0,
    avgWifiRssi: null
  };
}

async function loadActuatorSnapshot(connection, scopeType, scopeIds) {
  const { sql, params } = buildScopeFilter(scopeType, scopeIds, "area_id", "gateway_id");
  const statement = `
    SELECT
      COUNT(*) AS actuatorCount,
      SUM(CASE WHEN desired_state_text = 'on' THEN 1 ELSE 0 END) AS activeActuatorCount,
      SUM(CASE WHEN shadow_status <> 'sync' THEN 1 ELSE 0 END) AS driftActuatorCount
    FROM iot_actuators
    WHERE status = 'enabled' ${sql}
  `;
  const [rows] = await connection.execute(statement, params);
  return rows[0] || {
    actuatorCount: 0,
    activeActuatorCount: 0,
    driftActuatorCount: 0
  };
}

async function loadAlertSnapshot(connection, scopeType, scopeIds) {
  const { sql, params } = buildScopeFilter(scopeType, scopeIds, "area_id", "gateway_id");
  const statement = `
    SELECT
      COUNT(*) AS activeAlertCount,
      SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS criticalAlertCount,
      SUM(CASE WHEN status IN ('pending', 'acknowledged', 'processing', 'hold', 'reopened') THEN 1 ELSE 0 END) AS openAlertCount
    FROM ops_alerts
    WHERE status IN ('pending', 'acknowledged', 'processing', 'hold', 'reopened') ${sql}
  `;
  const [rows] = await connection.execute(statement, params);
  return rows[0] || {
    activeAlertCount: 0,
    criticalAlertCount: 0,
    openAlertCount: 0
  };
}

async function loadCropRecommendationSnapshot(connection, options) {
  const reportWindow = resolveReportWindow(options.reportType, options.reportDate);
  const filters = ["s.created_at >= ?", "s.created_at < ?"];
  const params = /** @type {unknown[]} */ ([reportWindow.start, reportWindow.end]);
  const scopeFilter = buildCropRecommendationScopeFilter(options.scopeType, options.scopeIds);

  if (options.tenantId) {
    filters.push("s.tenant_id = ?");
    params.push(options.tenantId);
  }
  if (scopeFilter.sql) {
    filters.push(scopeFilter.sql);
    params.push(...scopeFilter.params);
  }

  const [rows] = await connection.execute(
    `SELECT
       s.id,
       s.snapshot_no AS snapshotNo,
       s.area_id AS areaId,
       a.area_name AS areaName,
       s.recommendation_status AS recommendationStatus,
       s.report_level AS reportLevel,
       s.report_title AS reportTitle,
       s.summary_text AS summaryText,
       s.crop_text AS cropText,
       s.stage_text AS stageText,
       s.weather_status AS weatherStatus,
       s.weather_summary AS weatherSummary,
       s.metrics_snapshot_json AS metricsSnapshotJson,
       s.actions_snapshot_json AS actionsSnapshotJson,
       s.created_by_name AS createdByName,
       s.created_at AS createdAt
     FROM agri_crop_recommendation_snapshots s
     LEFT JOIN biz_areas a ON a.id = s.area_id
     WHERE ${filters.join(" AND ")}
     ORDER BY s.created_at DESC, s.id DESC
     LIMIT 8`,
    params
  );

  return summarizeCropRecommendationSnapshots(rows, reportWindow);
}

function buildCropRecommendationScopeFilter(scopeType, scopeIds) {
  const ids = normalizeScopeIds(scopeIds);
  if (scopeType === "area" && ids.length > 0) {
    return {
      sql: `s.area_id IN (${ids.map(() => "?").join(",")})`,
      params: ids
    };
  }
  if (scopeType === "device" && ids.length > 0) {
    return {
      sql: `s.area_id IN (SELECT area_id FROM iot_gateways WHERE id IN (${ids.map(() => "?").join(",")}))`,
      params: ids
    };
  }
  return {
    sql: "",
    params: []
  };
}

function summarizeCropRecommendationSnapshots(rows, reportWindow) {
  const snapshots = rows.map(mapCropRecommendationSnapshotRow);
  const needsActionCount = snapshots.filter((item) => item.reportLevel === "needs_action").length;
  const dataGapCount = snapshots.filter((item) => item.reportLevel === "data_gap").length;
  const stableCount = snapshots.filter((item) => item.reportLevel === "stable").length;
  const overallLevel = snapshots.reduce(
    (result, item) => cropRecommendationLevelPriority(item.reportLevel) > cropRecommendationLevelPriority(result)
      ? item.reportLevel
      : result,
    "stable"
  );
  const actionMap = new Map();

  snapshots.forEach((snapshot) => {
    snapshot.actionsSnapshot.forEach((action) => {
      const title = optionalString(action.title) || "现场建议";
      const text = optionalString(action.text) || "";
      const key = `${title}:${text}`;
      if (!actionMap.has(key)) {
        actionMap.set(key, {
          snapshotNo: snapshot.snapshotNo,
          areaName: snapshot.areaName,
          label: optionalString(action.label) || cropRecommendationLevelLabel(snapshot.reportLevel),
          title,
          text,
          type: optionalString(action.type) || "crop_recommendation"
        });
      }
    });
  });

  return {
    count: snapshots.length,
    window: reportWindow,
    overallLevel: snapshots.length > 0 ? overallLevel : "none",
    overallLevelLabel: snapshots.length > 0 ? cropRecommendationLevelLabel(overallLevel) : "暂无快照",
    needsActionCount,
    dataGapCount,
    stableCount,
    latest: snapshots[0] || null,
    actions: Array.from(actionMap.values()).slice(0, 6),
    snapshots
  };
}

function mapCropRecommendationSnapshotRow(row) {
  const actionsSnapshot = parseMaybeJson(row.actionsSnapshotJson);
  const metricsSnapshot = parseMaybeJson(row.metricsSnapshotJson);
  return {
    id: Number(row.id),
    snapshotNo: row.snapshotNo,
    areaId: Number(row.areaId),
    areaName: row.areaName || `区域 ${row.areaId}`,
    recommendationStatus: row.recommendationStatus,
    reportLevel: row.reportLevel || "stable",
    reportTitle: row.reportTitle,
    summaryText: row.summaryText,
    cropText: row.cropText,
    stageText: row.stageText,
    weatherStatus: row.weatherStatus,
    weatherSummary: row.weatherSummary,
    metricsSnapshot: Array.isArray(metricsSnapshot) ? metricsSnapshot : [],
    actionsSnapshot: Array.isArray(actionsSnapshot) ? actionsSnapshot : [],
    createdByName: row.createdByName,
    createdAt: row.createdAt
  };
}

function emptyCropRecommendationSummary() {
  return {
    count: 0,
    window: null,
    overallLevel: "none",
    overallLevelLabel: "暂无快照",
    needsActionCount: 0,
    dataGapCount: 0,
    stableCount: 0,
    latest: null,
    actions: [],
    snapshots: []
  };
}

function cropRecommendationLevelPriority(level) {
  return {
    none: 0,
    stable: 1,
    no_targets: 2,
    unconfigured: 2,
    data_gap: 3,
    needs_action: 4
  }[level] || 0;
}

function cropRecommendationLevelLabel(level) {
  return {
    stable: "整体平稳",
    needs_action: "需要处理",
    data_gap: "数据待补齐",
    unconfigured: "区域待绑定作物",
    no_targets: "推荐目标待配置",
    none: "暂无快照"
  }[level] || "建议快照";
}

function buildCropRecommendationLines(summary) {
  const cropSummary = summary || emptyCropRecommendationSummary();
  if (!cropSummary.count) {
    return ["- 当前报告周期没有保存的作物建议快照。"];
  }

  const latest = cropSummary.latest;
  const lines = [
    `- 快照数量：${cropSummary.count} 条`,
    `- 综合状态：${cropSummary.overallLevelLabel}`,
    latest ? `- 最新快照：${latest.areaName} / ${latest.reportTitle}` : "",
    latest?.weatherSummary ? `- 天气上下文：${latest.weatherSummary}` : ""
  ].filter(Boolean);

  if (cropSummary.actions.length > 0) {
    lines.push("- 主要建议：");
    cropSummary.actions.slice(0, 5).forEach((item) => {
      lines.push(`  - ${item.title}${item.text ? `：${item.text}` : ""}`);
    });
  }

  return lines;
}

function resolveReportWindow(reportType, reportDate) {
  const baseDate = parseReportDateAsLocal(reportDate);
  let startDate = new Date(baseDate);
  const endDate = addDays(baseDate, 1);

  if (reportType === "weekly") {
    startDate = addDays(baseDate, -6);
  } else if (reportType === "monthly") {
    startDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  }

  return {
    start: formatSqlDateTime(startDate),
    end: formatSqlDateTime(endDate),
    label: `${formatSqlDate(startDate)} 至 ${formatSqlDate(addDays(endDate, -1))}`
  };
}

function parseReportDateAsLocal(value) {
  const normalized = formatLocalDate(value || new Date());
  const [year, month, day] = normalized.split("-").map((item) => Number.parseInt(item, 10));
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatSqlDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatSqlDateTime(date) {
  return `${formatSqlDate(date)} 00:00:00`;
}

function elevateRisk(currentRisk, nextRisk) {
  const order = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4
  };
  return (order[nextRisk] || 0) > (order[currentRisk] || 0) ? nextRisk : currentRisk;
}

function buildScopeFilter(scopeType, scopeIds, areaColumn, gatewayColumn) {
  const ids = normalizeScopeIds(scopeIds);
  if (scopeType === "area" && ids.length > 0) {
    return {
      sql: ` AND ${areaColumn} IN (${ids.map(() => "?").join(",")})`,
      params: ids
    };
  }
  if (scopeType === "device" && ids.length > 0) {
    return {
      sql: ` AND ${gatewayColumn} IN (${ids.map(() => "?").join(",")})`,
      params: ids
    };
  }
  return {
    sql: "",
    params: []
  };
}

function buildMetrics({ reportType, snapshot, relatedAlertCount }) {
  const cropRecommendationSnapshot = snapshot.cropRecommendationSnapshot || emptyCropRecommendationSummary();
  const metricSummaries = Array.isArray(snapshot.sensorSnapshot.metricSummaries)
    ? snapshot.sensorSnapshot.metricSummaries.map((item) => ({
        ...item,
        avgValue: toNullableNumber(item.avgValue),
        warnMin: toNullableNumber(item.warnMin),
        warnMax: toNullableNumber(item.warnMax),
        normalMin: toNullableNumber(item.normalMin),
        normalMax: toNullableNumber(item.normalMax)
      }))
    : [];
  const metricsByCode = Object.fromEntries(metricSummaries.map((item) => [item.metricCode, item.avgValue]));
  const avgTemperature = metricsByCode.temperature ?? null;
  const avgHumidity = metricsByCode.humidity ?? null;
  const activeAlertCount = Number(snapshot.alertSnapshot.openAlertCount || 0);
  const abnormalMetrics = metricSummaries.filter(isMetricOutOfWarnRange);
  const primaryMetrics = selectPrimaryMetrics(metricSummaries);

  let riskLevel = "low";
  if (Number(snapshot.alertSnapshot.criticalAlertCount || 0) > 0 || abnormalMetrics.length >= 2 || avgHumidity !== null && avgHumidity < 35) {
    riskLevel = "high";
  } else if (activeAlertCount > 0 || abnormalMetrics.length > 0 || avgTemperature !== null && avgTemperature > 30 || avgHumidity !== null && avgHumidity < 45) {
    riskLevel = "medium";
  }
  if (cropRecommendationSnapshot.needsActionCount > 0) {
    riskLevel = elevateRisk(riskLevel, cropRecommendationSnapshot.needsActionCount >= 2 ? "high" : "medium");
  } else if (cropRecommendationSnapshot.dataGapCount > 0) {
    riskLevel = elevateRisk(riskLevel, "medium");
  }

  const suggestedActions = [];
  cropRecommendationSnapshot.actions.slice(0, 3).forEach((item) => {
    suggestedActions.push(`种植建议：${item.title}${item.text ? `，${item.text}` : ""}`);
  });
  if (avgHumidity !== null && avgHumidity < 45) {
    suggestedActions.push("复核当前灌溉策略并关注湿度回升");
  }
  if (avgTemperature !== null && avgTemperature > 30) {
    suggestedActions.push("检查通风与遮阳策略");
  }
  abnormalMetrics.slice(0, 2).forEach((item) => {
    if (item.metricCode === "humidity" || item.metricCode === "temperature") {
      return;
    }
    const direction = item.warnMin !== null && item.avgValue !== null && item.avgValue < item.warnMin ? "偏低" : "偏高";
    suggestedActions.push(`关注${item.metricName}${direction}，复核采集值和阈值配置`);
  });
  if (snapshot.actuatorSnapshot.driftActuatorCount > 0) {
    suggestedActions.push("排查 Device Shadow 不一致的执行器");
  }
  if (activeAlertCount > 0 && suggestedActions.length === 0) {
    suggestedActions.push("优先核查当前活动告警和现场状态");
  }
  if (suggestedActions.length === 0) {
    suggestedActions.push("保持当前运行策略，持续观察");
  }
  const uniqueSuggestedActions = Array.from(new Set(suggestedActions));

  return {
    reportLabel: REPORT_TYPE_LABELS[reportType] || reportType,
    riskLevel,
    relatedAlertCount: Math.max(relatedAlertCount, activeAlertCount),
    scopeNames: snapshot.scopeNames,
    gatewayCount: Number(snapshot.gatewaySnapshot.gatewayCount || 0),
    onlineGatewayCount: Number(snapshot.gatewaySnapshot.onlineGatewayCount || 0),
    sensorCount: Number(snapshot.sensorSnapshot.sensorCount || 0),
    actuatorCount: Number(snapshot.actuatorSnapshot.actuatorCount || 0),
    driftActuatorCount: Number(snapshot.actuatorSnapshot.driftActuatorCount || 0),
    abnormalMetricCount: abnormalMetrics.length,
    metricSummaries,
    primaryMetrics,
    metricsByCode,
    cropRecommendationSnapshot,
    cropRecommendationSnapshotCount: cropRecommendationSnapshot.count,
    cropRecommendationNeedsActionCount: cropRecommendationSnapshot.needsActionCount,
    cropRecommendationDataGapCount: cropRecommendationSnapshot.dataGapCount,
    avgTemperature,
    avgHumidity,
    avgWifiRssi: toNullableNumber(snapshot.gatewaySnapshot.avgWifiRssi),
    suggestedActions: uniqueSuggestedActions
  };
}

function buildSummaryText({ taskType, reportType, snapshot, metrics, reasonText }) {
  const scopeLabel = snapshot.scopeNames.length > 0 ? snapshot.scopeNames.join("、") : "当前范围";
  const alertText = metrics.relatedAlertCount > 0 ? `关联 ${metrics.relatedAlertCount} 条告警` : "暂无活动告警";
  const reasonSuffix = reasonText ? `；触发原因：${reasonText}` : "";
  const metricText = formatMetricHighlights(metrics.primaryMetrics);
  const cropSuffix = metrics.cropRecommendationSnapshotCount > 0
    ? `；种植建议快照 ${metrics.cropRecommendationSnapshotCount} 条，${metrics.cropRecommendationSnapshot.overallLevelLabel}`
    : "";

  if (taskType === "diagnosis") {
    return `${scopeLabel} 当前关键指标 ${metricText}，风险等级 ${RISK_LEVEL_LABELS[metrics.riskLevel] || metrics.riskLevel}，${alertText}${cropSuffix}${reasonSuffix}`;
  }

  return `${REPORT_TYPE_LABELS[reportType] || "AI报告"}已生成，范围 ${scopeLabel}，关键指标 ${metricText}，在线网关 ${metrics.onlineGatewayCount}/${metrics.gatewayCount}，风险等级 ${RISK_LEVEL_LABELS[metrics.riskLevel] || metrics.riskLevel}${cropSuffix}${reasonSuffix}`;
}

function buildReportMarkdown({ taskType, reportType, reportDate, scopeType, snapshot, metrics, summaryText, reasonText }) {
  const scopeLabel = snapshot.scopeNames.length > 0 ? snapshot.scopeNames.join("、") : "全局";
  const title = taskType === "diagnosis" ? "AI诊断报告" : REPORT_TYPE_LABELS[reportType] || "AI报告";
  const reasonLine = reasonText ? `- 触发原因：${reasonText}` : "";
  const actionLines = metrics.suggestedActions.map((item) => `- ${item}`).join("\n");

  return [
    `# ${title}`,
    "",
    `- 报告日期：${reportDate}`,
    `- 覆盖范围：${scopeLabel}`,
    `- 范围类型：${scopeType}`,
    reasonLine,
    "",
    "## 摘要",
    "",
    summaryText,
    "",
    "## 关键指标",
    "",
    ...buildMetricLines(metrics.metricSummaries),
    `- 在线网关：${metrics.onlineGatewayCount}/${metrics.gatewayCount}`,
    `- 设备漂移数：${metrics.driftActuatorCount}`,
    `- 活动告警数：${metrics.relatedAlertCount}`,
    `- 风险等级：${RISK_LEVEL_LABELS[metrics.riskLevel] || metrics.riskLevel}`,
    "",
    "## 种植建议快照",
    "",
    ...buildCropRecommendationLines(metrics.cropRecommendationSnapshot),
    "",
    "## 建议动作",
    "",
    actionLines
  ]
    .filter(Boolean)
    .join("\n");
}

function mapTaskRow(row) {
  return {
    ...row,
    scopeIdsJson: parseMaybeJson(row.scopeIdsJson) || [],
    payloadJson: parseMaybeJson(row.payloadJson),
    reportCount: Number(row.reportCount || 0)
  };
}

function mapReportRow(row) {
  const scopeIds = parseMaybeJson(row.scopeIdsJson) || [];
  const metrics = parseMaybeJson(row.metricsJson) || {};
  let scopeSummary = "全局";
  if (Array.isArray(metrics.scopeNames) && metrics.scopeNames.length > 0) {
    scopeSummary = metrics.scopeNames.join("、");
  } else if (row.scopeType === "area" && scopeIds.length > 0) {
    scopeSummary = `area:${scopeIds.join(",")}`;
  } else if (row.scopeType === "device" && scopeIds.length > 0) {
    scopeSummary = `device:${scopeIds.join(",")}`;
  }
  return {
    ...row,
    scopeIdsJson: scopeIds,
    metricsJson: metrics,
    riskLevel: metrics.riskLevel || "low",
    relatedAlertCount: Number(metrics.relatedAlertCount || 0),
    scopeSummary
  };
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
    return null;
  }
}

function normalizeScopeIds(value) {
  if (Array.isArray(value)) {
    return value.map((item) => parseInteger(item)).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return normalizeScopeIds(parsed);
    } catch {
      return value
        .split(",")
        .map((item) => parseInteger(item.trim()))
        .filter(Boolean);
    }
  }
  return [];
}

function sameScopeIds(left, right) {
  const leftIds = normalizeScopeIds(left);
  const rightIds = normalizeScopeIds(right);
  if (leftIds.length !== rightIds.length) {
    return false;
  }
  return leftIds.every((id, index) => id === rightIds[index]);
}

function normalizeReportDate(value) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("reportDate 格式无效");
  }
  return date.toISOString().slice(0, 10);
}

function formatLocalDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("reportDate 格式无效");
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isMetricOutOfWarnRange(item) {
  if (item?.avgValue === null || item?.avgValue === undefined) {
    return false;
  }
  if (item.warnMin !== null && item.warnMin !== undefined && item.avgValue < item.warnMin) {
    return true;
  }
  if (item.warnMax !== null && item.warnMax !== undefined && item.avgValue > item.warnMax) {
    return true;
  }
  return false;
}

function selectPrimaryMetrics(metricSummaries) {
  const preferredOrder = ["temperature", "humidity", "ec", "ph", "co2", "lux"];
  const metricMap = new Map(metricSummaries.map((item) => [item.metricCode, item]));
  const preferredMetrics = preferredOrder
    .map((metricCode) => metricMap.get(metricCode))
    .filter(Boolean);
  const remainder = metricSummaries.filter((item) => !preferredOrder.includes(item.metricCode));
  return [...preferredMetrics, ...remainder].slice(0, 4);
}

function buildMetricLines(metricSummaries) {
  if (!Array.isArray(metricSummaries) || metricSummaries.length === 0) {
    return ["- 暂无可用指标"];
  }
  return metricSummaries.slice(0, 6).map((item) => {
    const rangeText = describeMetricRange(item);
    return `- ${item.metricName}：${formatMetric(item.avgValue, item.unitName)}${rangeText ? `（${rangeText}）` : ""}`;
  });
}

function formatMetricHighlights(metrics) {
  if (!Array.isArray(metrics) || metrics.length === 0) {
    return "暂无可用指标";
  }
  return metrics
    .map((item) => `${item.metricName} ${formatMetric(item.avgValue, item.unitName)}`)
    .join("，");
}

function describeMetricRange(item) {
  if (item.warnMin !== null && item.warnMin !== undefined && item.avgValue !== null && item.avgValue < item.warnMin) {
    return "低于告警下限";
  }
  if (item.warnMax !== null && item.warnMax !== undefined && item.avgValue !== null && item.avgValue > item.warnMax) {
    return "高于告警上限";
  }
  return "";
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : 0;
}

function toNullableNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : null;
}

function formatMetric(value, unit) {
  const numeric = toNullableNumber(value);
  if (numeric === null) {
    return "-";
  }
  return `${numeric}${unit || ""}`;
}

module.exports = aiRoutes;
