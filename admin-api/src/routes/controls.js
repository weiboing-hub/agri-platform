// @ts-check

const { pool, query } = require("../lib/mysql");
const { ok, fail } = require("../lib/response");
const { parseInteger, optionalString, requiredString } = require("../lib/helpers");
const { logOperation } = require("../lib/audit");
const { appendAreaScope, appendTenantScope, assertAreaAccess } = require("../lib/data-scope");
const { extractTenantId } = require("../lib/tenant-foundation");

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

async function controlRoutes(app) {
  app.get(
    "/api/v1/controls/commands",
    {
      preHandler: [app.requireAnyPermissions([
        "control:view",
        "actuator:control",
        "actuator:force_control",
        "control:batch",
        "mode:switch"
      ])]
    },
    async (request) => {
      const areaId = parseInteger(request.query?.areaId);
      const status = String(request.query?.status || "").trim();
      const filters = [];
      const params = [];
      if (areaId) {
        filters.push("c.area_id = ?");
        params.push(areaId);
      }
      if (status) {
        filters.push("c.request_status = ?");
        params.push(status);
      }
      appendTenantScope(filters, params, request.auth, "c.tenant_id");
      appendAreaScope(filters, params, request.auth, "c.area_id");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           c.id,
           c.command_no AS commandNo,
           c.gateway_id AS gatewayId,
           c.actuator_id AS actuatorId,
           c.source_type AS sourceType,
           c.mode_type AS modeType,
           c.control_type AS controlType,
           c.duration_seconds AS durationSeconds,
           c.force_execute AS forceExecute,
           c.reason_text AS reasonText,
           c.request_status AS requestStatus,
           c.device_online AS deviceOnline,
           c.backfill_in_progress AS backfillInProgress,
           c.queued_at AS queuedAt,
           c.sent_at AS sentAt,
           a.area_name AS areaName,
           ac.actuator_name AS actuatorName,
           u.real_name AS requestedByName,
           e.execution_status AS executionStatus,
           e.result_message AS executionResultMessage,
           e.completed_at AS completedAt
         FROM ops_control_commands c
         LEFT JOIN biz_areas a ON a.id = c.area_id
         LEFT JOIN iot_actuators ac ON ac.id = c.actuator_id
         LEFT JOIN sys_users u ON u.id = c.requested_by
         LEFT JOIN ops_control_executions e ON e.command_id = c.id
         ${whereClause}
         ORDER BY c.queued_at DESC, c.id DESC`,
        params
      );
      return ok(rows);
    }
  );

  app.post(
    "/api/v1/controls/commands",
    {
      preHandler: [app.requirePermissions(["actuator:control"])]
    },
    async (request, reply) => {
      const actuatorId = parseInteger(request.body?.actuatorId);
      const controlType = String(request.body?.controlType || "").trim();
      if (!actuatorId || !controlType) {
        return fail(reply, 400, "actuatorId 和 controlType 不能为空");
      }
      if (!["on", "off", "stop"].includes(controlType)) {
        return fail(reply, 400, "controlType 仅支持 on/off/stop");
      }

      const durationSeconds = parseInteger(request.body?.durationSeconds);
      const forceExecute = request.body?.forceExecute ? 1 : 0;
      const reasonText = optionalString(request.body?.reasonText);
      const requestedStateJson = JSON.stringify({
        power: controlType
      });

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [rawActuatorRows] = await connection.execute(
          `SELECT
             a.id,
             a.area_id AS areaId,
             a.gateway_id AS gatewayId,
             a.actuator_name AS actuatorName,
             a.desired_state_text AS desiredStateText,
             a.reported_state_text AS reportedStateText,
             a.shadow_status AS shadowStatus,
             g.online_status AS onlineStatus,
             g.backfill_status AS backfillStatus
           FROM iot_actuators a
           LEFT JOIN iot_gateways g ON g.id = a.gateway_id
           WHERE a.id = ?
           LIMIT 1`,
          [actuatorId]
        );
        const actuatorRows = asRowArray(rawActuatorRows);

        if (actuatorRows.length === 0) {
          await connection.rollback();
          return fail(reply, 404, "未找到执行器", "not_found");
        }

        const actuator = actuatorRows[0];
        const currentTenantId = extractTenantId(request.auth);
        await assertAreaAccess(request.auth, actuator.areaId, "没有操作该区域执行器的权限");
        const commandNo = `CMD-${Date.now()}`;
        const deviceOnline = actuator.onlineStatus === "online" ? 1 : 0;
        const backfillInProgress = actuator.backfillStatus === "running" ? 1 : 0;
        const safetyReasons = [];
        if (!deviceOnline) {
          safetyReasons.push("网关离线");
        }
        if (backfillInProgress) {
          safetyReasons.push("网关正在补传");
        }
        if (actuator.shadowStatus === "pending") {
          safetyReasons.push("已有待执行命令");
        }
        if (forceExecute && !reasonText) {
          await connection.rollback();
          return fail(reply, 400, "强制执行必须填写原因说明", "force_reason_required");
        }
        if (!forceExecute && safetyReasons.length > 0) {
          await connection.rollback();
          return fail(
            reply,
            409,
            `控制安全校验未通过：${safetyReasons.join("、")}。如确认仍要下发，请启用强制执行。`,
            "control_safety_blocked",
            {
              actuatorId,
              reasons: safetyReasons,
              deviceOnline: Boolean(deviceOnline),
              backfillInProgress: Boolean(backfillInProgress),
              shadowStatus: actuator.shadowStatus
            }
          );
        }

        const [commandResult] = currentTenantId
          ? await connection.execute(
            `INSERT INTO ops_control_commands
              (tenant_id, command_no, area_id, gateway_id, actuator_id, source_type, mode_type, control_type,
               requested_state_json, duration_seconds, force_execute, reason_text, requested_by,
               request_status, device_online, backfill_in_progress)
             VALUES (?, ?, ?, ?, ?, 'manual', 'manual', ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
            [
              currentTenantId,
              commandNo,
              actuator.areaId,
              actuator.gatewayId,
              actuatorId,
              controlType,
              requestedStateJson,
              durationSeconds,
              forceExecute,
              reasonText,
              request.auth.user.id,
              deviceOnline,
              backfillInProgress
            ]
          )
          : await connection.execute(
            `INSERT INTO ops_control_commands
              (command_no, area_id, gateway_id, actuator_id, source_type, mode_type, control_type,
               requested_state_json, duration_seconds, force_execute, reason_text, requested_by,
               request_status, device_online, backfill_in_progress)
             VALUES (?, ?, ?, ?, 'manual', 'manual', ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
            [
              commandNo,
              actuator.areaId,
              actuator.gatewayId,
              actuatorId,
              controlType,
              requestedStateJson,
              durationSeconds,
              forceExecute,
              reasonText,
              request.auth.user.id,
              deviceOnline,
              backfillInProgress
            ]
          );
        const commandId = getInsertId(commandResult);

        await connection.execute(
          `INSERT INTO ops_control_executions
            (command_id, gateway_id, actuator_id, execution_status, desired_state_json, shadow_status_after, result_message)
           VALUES (?, ?, ?, 'pending', ?, 'pending', '命令已入队，等待设备执行')`,
          [commandId, actuator.gatewayId, actuatorId, requestedStateJson]
        );

        await connection.execute(
          `UPDATE iot_actuators
           SET desired_state_text = ?, shadow_status = 'pending'
           WHERE id = ?`,
          [controlType, actuatorId]
        );

        await connection.execute(
          `UPDATE iot_device_shadow
           SET desired_state_json = ?,
               shadow_status = 'pending',
               desired_updated_at = NOW(),
               last_command_id = ?,
               last_command_result = '命令已入队'
           WHERE actuator_id = ?`,
          [requestedStateJson, commandId, actuatorId]
        );

        await connection.commit();
        await logOperation(request, {
          moduleCode: "manual_control",
          operationType: "queue_command",
          targetType: "ops_control_commands",
          targetId: commandId,
          requestParams: {
            actuatorId,
            controlType,
            durationSeconds,
            forceExecute: Boolean(forceExecute)
          },
          resultMessage: "控制命令入队"
        });
        reply.code(202);
        return ok(
          {
            commandId,
            commandNo,
            actuatorId,
            actuatorName: actuator.actuatorName,
            controlType,
            requestStatus: "queued",
            deviceOnline: Boolean(deviceOnline),
            backfillInProgress: Boolean(backfillInProgress)
          },
          "控制命令已入队"
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
    "/api/v1/rules",
    {
      preHandler: [app.requirePermissions(["rule:view"])]
    },
    async (request) => {
      const enabled = request.query?.enabled;
      const keyword = String(request.query?.keyword || "").trim();
      const ruleType = String(request.query?.ruleType || "").trim();
      const builderMode = String(request.query?.builderMode || "").trim();
      const filters = [];
      const params = [];
      if (enabled !== undefined) {
        filters.push("enabled = ?");
        params.push(String(enabled) === "true" ? 1 : 0);
      }
      if (keyword) {
        filters.push("(rule_name LIKE ? OR rule_code LIKE ?)");
        params.push(`%${keyword}%`, `%${keyword}%`);
      }
      if (ruleType) {
        filters.push("rule_type = ?");
        params.push(ruleType);
      }
      if (builderMode) {
        filters.push("builder_mode = ?");
        params.push(builderMode);
      }
      appendTenantScope(filters, params, request.auth, "r.tenant_id");
      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           r.id,
           r.rule_code AS ruleCode,
           r.rule_name AS ruleName,
           r.rule_type AS ruleType,
           r.target_type AS targetType,
           r.target_ids_json AS targetIdsJson,
           r.builder_mode AS builderMode,
           r.condition_json AS conditionJson,
           r.action_json AS actionJson,
           r.recovery_policy AS recoveryPolicy,
           r.recovery_stable_seconds AS recoveryStableSeconds,
           r.cooldown_seconds AS cooldownSeconds,
           r.daily_max_executions AS dailyMaxExecutions,
           r.priority,
           r.enabled,
           r.created_by AS createdBy,
           r.updated_by AS updatedBy,
           r.created_at AS createdAt,
           r.updated_at AS updatedAt,
           creator.real_name AS createdByName,
           updater.real_name AS updatedByName
         FROM rule_definitions r
         LEFT JOIN sys_users creator ON creator.id = r.created_by
         LEFT JOIN sys_users updater ON updater.id = r.updated_by
         ${whereClause}
         ORDER BY r.priority ASC, r.id DESC`,
        params
      );
      return ok(
        rows.map((row) => {
          const conditionObject = row.conditionJson || null;
          const actionObject = row.actionJson || null;
          return {
            ...row,
            conditionSummary: summarizeCondition(conditionObject),
            actionSummary: summarizeAction(actionObject)
          };
        })
      );
    }
  );

  app.get(
    "/api/v1/rules/:id",
    {
      preHandler: [app.requirePermissions(["rule:view"])]
    },
    async (request, reply) => {
      const ruleId = parseInteger(request.params.id);
      if (!ruleId) {
        return fail(reply, 400, "无效的规则ID");
      }

      const filters = [];
      const params = [ruleId];
      appendTenantScope(filters, params, request.auth, "tenant_id");
      const rows = await query(
        `SELECT
           id,
           rule_code AS ruleCode,
           rule_name AS ruleName,
           rule_type AS ruleType,
           target_type AS targetType,
           target_ids_json AS targetIdsJson,
           builder_mode AS builderMode,
           condition_json AS conditionJson,
           action_json AS actionJson,
           recovery_policy AS recoveryPolicy,
           recovery_stable_seconds AS recoveryStableSeconds,
           cooldown_seconds AS cooldownSeconds,
           daily_max_executions AS dailyMaxExecutions,
           priority,
           enabled,
           created_by AS createdBy,
           updated_by AS updatedBy,
           created_at AS createdAt,
           updated_at AS updatedAt
         FROM rule_definitions
         WHERE id = ?
           ${filters.length ? `AND ${filters.join(" AND ")}` : ""}
         LIMIT 1`,
        params
      );

      if (!rows[0]) {
        return fail(reply, 404, "未找到规则", "not_found");
      }

      return ok(rows[0]);
    }
  );

  app.post(
    "/api/v1/rules",
    {
      preHandler: [app.requirePermissions(["rule:edit"])]
    },
    async (request, reply) => {
      try {
        const ruleCode = requiredString(request.body?.ruleCode, "ruleCode");
        const ruleName = requiredString(request.body?.ruleName, "ruleName");
        const ruleType = requiredString(request.body?.ruleType, "ruleType");
        const targetType = requiredString(request.body?.targetType, "targetType");
        const builderMode = optionalString(request.body?.builderMode) || "visual";
        const conditionJson = normalizeJsonPayload(request.body?.conditionJson, "conditionJson");
        const actionJson = normalizeJsonPayload(request.body?.actionJson, "actionJson");
        const targetIdsJson = normalizeOptionalJsonPayload(request.body?.targetIdsJson);
        const currentTenantId = extractTenantId(request.auth);

        const result = currentTenantId
          ? await query(
            `INSERT INTO rule_definitions
              (tenant_id, rule_code, rule_name, rule_type, target_type, target_ids_json, builder_mode, condition_json, action_json,
               recovery_policy, recovery_stable_seconds, cooldown_seconds, daily_max_executions, priority, enabled, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              currentTenantId,
              ruleCode,
              ruleName,
              ruleType,
              targetType,
              targetIdsJson,
              builderMode,
              conditionJson,
              actionJson,
              optionalString(request.body?.recoveryPolicy) || "manual_close",
              parseInteger(request.body?.recoveryStableSeconds, 0),
              parseInteger(request.body?.cooldownSeconds, 0),
              parseInteger(request.body?.dailyMaxExecutions, 0),
              parseInteger(request.body?.priority, 100),
              request.body?.enabled === false || String(request.body?.enabled) === "false" ? 0 : 1,
              request.auth.user.id,
              request.auth.user.id
            ]
          )
          : await query(
            `INSERT INTO rule_definitions
              (rule_code, rule_name, rule_type, target_type, target_ids_json, builder_mode, condition_json, action_json,
               recovery_policy, recovery_stable_seconds, cooldown_seconds, daily_max_executions, priority, enabled, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              ruleCode,
              ruleName,
              ruleType,
              targetType,
              targetIdsJson,
              builderMode,
              conditionJson,
              actionJson,
              optionalString(request.body?.recoveryPolicy) || "manual_close",
              parseInteger(request.body?.recoveryStableSeconds, 0),
              parseInteger(request.body?.cooldownSeconds, 0),
              parseInteger(request.body?.dailyMaxExecutions, 0),
              parseInteger(request.body?.priority, 100),
              request.body?.enabled === false || String(request.body?.enabled) === "false" ? 0 : 1,
              request.auth.user.id,
              request.auth.user.id
            ]
          );

        await logOperation(request, {
          moduleCode: "rule_engine",
          operationType: "create",
          targetType: "rule_definitions",
          targetId: result.insertId,
          requestParams: {
            ruleCode,
            ruleName,
            ruleType,
            targetType
          },
          resultMessage: "创建规则"
        });

        return ok({ insertId: result.insertId }, "规则创建成功");
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.put(
    "/api/v1/rules/:id",
    {
      preHandler: [app.requirePermissions(["rule:edit"])]
    },
    async (request, reply) => {
      try {
        const ruleId = parseInteger(request.params.id);
        if (!ruleId) {
          return fail(reply, 400, "无效的规则ID");
        }

        const ruleName = requiredString(request.body?.ruleName, "ruleName");
        const ruleType = requiredString(request.body?.ruleType, "ruleType");
        const targetType = requiredString(request.body?.targetType, "targetType");
        const builderMode = optionalString(request.body?.builderMode) || "visual";
        const conditionJson = normalizeJsonPayload(request.body?.conditionJson, "conditionJson");
        const actionJson = normalizeJsonPayload(request.body?.actionJson, "actionJson");
        const targetIdsJson = normalizeOptionalJsonPayload(request.body?.targetIdsJson);
        const tenantFilters = [];
        const tenantParams = [];
        appendTenantScope(tenantFilters, tenantParams, request.auth, "tenant_id");

        const currentRows = await query(
          `SELECT id
           FROM rule_definitions
           WHERE id = ?
             ${tenantFilters.length ? `AND ${tenantFilters.join(" AND ")}` : ""}
           LIMIT 1`,
          [ruleId, ...tenantParams]
        );
        if (!currentRows[0]) {
          return fail(reply, 404, "未找到规则", "not_found");
        }

        await query(
          `UPDATE rule_definitions
           SET rule_name = ?, rule_type = ?, target_type = ?, target_ids_json = ?, builder_mode = ?,
               condition_json = ?, action_json = ?, recovery_policy = ?, recovery_stable_seconds = ?,
               cooldown_seconds = ?, daily_max_executions = ?, priority = ?, enabled = ?, updated_by = ?
           WHERE id = ?`,
          [
            ruleName,
            ruleType,
            targetType,
            targetIdsJson,
            builderMode,
            conditionJson,
            actionJson,
            optionalString(request.body?.recoveryPolicy) || "manual_close",
            parseInteger(request.body?.recoveryStableSeconds, 0),
            parseInteger(request.body?.cooldownSeconds, 0),
            parseInteger(request.body?.dailyMaxExecutions, 0),
            parseInteger(request.body?.priority, 100),
            request.body?.enabled === false || String(request.body?.enabled) === "false" ? 0 : 1,
            request.auth.user.id,
            ruleId
          ]
        );

        await logOperation(request, {
          moduleCode: "rule_engine",
          operationType: "update",
          targetType: "rule_definitions",
          targetId: ruleId,
          requestParams: {
            ruleName,
            ruleType,
            targetType
          },
          resultMessage: "更新规则"
        });

        return ok({ id: ruleId }, "规则更新成功");
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );
}

function normalizeJsonPayload(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${fieldName}不能为空`);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed);
    } catch {
      throw new Error(`${fieldName}不是有效JSON`);
    }
  }
  return JSON.stringify(value);
}

function normalizeOptionalJsonPayload(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      throw new Error("targetIdsJson不是有效JSON");
    }
  }
  return JSON.stringify(value);
}

function summarizeCondition(conditionJson) {
  const data = parseMaybeJson(conditionJson);
  if (!data) {
    return "-";
  }
  if (data.summary) {
    return data.summary;
  }
  if (data.metric && data.operator && data.threshold !== undefined) {
    return `${data.metric} ${data.operator} ${data.threshold}`;
  }
  return "已配置条件";
}

function summarizeAction(actionJson) {
  const data = parseMaybeJson(actionJson);
  if (!data) {
    return "-";
  }
  if (data.summary) {
    return data.summary;
  }
  if (Array.isArray(data.actions)) {
    return data.actions
      .map((item) => item.type || item.actionType || "action")
      .join(" / ");
  }
  if (data.type) {
    return data.type;
  }
  return "已配置动作";
}

function parseMaybeJson(value) {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

module.exports = controlRoutes;
