// @ts-check

const { pool, query } = require("../lib/mysql");
const { ok, fail } = require("../lib/response");
const { parseInteger, optionalString } = require("../lib/helpers");
const { logOperation } = require("../lib/audit");
const { sendNotification } = require("../lib/notification-provider");
const { appendAreaScope, appendTenantScope, buildAreaScopeFilter } = require("../lib/data-scope");
const { assertAlertActionAllowed, buildAlertTransitionPlan } = require("../lib/alert-workflow");

/**
 * @template T
 * @param {any} rows
 * @returns {T[]}
 */
function asRowArray(rows) {
  return Array.isArray(rows) ? rows : [];
}

async function alertRoutes(app) {
  app.get(
    "/api/v1/alerts",
    {
      preHandler: [app.requirePermissions(["alert:view"])]
    },
    async (request) => {
      const status = String(request.query?.status || "").trim();
      const severity = String(request.query?.severity || "").trim();
      const areaId = parseInteger(request.query?.areaId);

      const filters = [];
      const params = [];
      if (status) {
        filters.push("al.status = ?");
        params.push(status);
      }
      if (severity) {
        filters.push("al.severity = ?");
        params.push(severity);
      }
      if (areaId) {
        filters.push("al.area_id = ?");
        params.push(areaId);
      }
      appendTenantScope(filters, params, request.auth, "al.tenant_id");
      appendAreaScope(filters, params, request.auth, "al.area_id");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           al.id,
           al.alert_no AS alertNo,
           al.alert_type AS alertType,
           al.severity,
           al.status,
           al.title,
           al.current_value_decimal AS currentValue,
           al.unit_name AS unitName,
           al.triggered_at AS triggeredAt,
           al.last_transition_at AS lastTransitionAt,
           al.reopen_count AS reopenCount,
           a.area_name AS areaName,
           s.sensor_name AS sensorName,
           g.gateway_name AS gatewayName,
           u.real_name AS assignedToName,
           r.rule_name AS ruleName
         FROM ops_alerts al
         LEFT JOIN biz_areas a ON a.id = al.area_id
         LEFT JOIN iot_sensors s ON s.id = al.sensor_id
         LEFT JOIN iot_gateways g ON g.id = al.gateway_id
         LEFT JOIN sys_users u ON u.id = al.assigned_to
         LEFT JOIN rule_definitions r ON r.id = al.rule_id
         ${whereClause}
         ORDER BY al.triggered_at DESC, al.id DESC`,
        params
      );

      return ok(rows);
    }
  );

  app.get(
    "/api/v1/alerts/:id",
    {
      preHandler: [app.requirePermissions(["alert:view"])]
    },
    async (request, reply) => {
      const alertId = parseInteger(request.params.id);
      if (!alertId) {
        return fail(reply, 400, "无效的告警ID");
      }

      const tenantFilters = [];
      const tenantParams = [];
      appendTenantScope(tenantFilters, tenantParams, request.auth, "al.tenant_id");
      const scopeFilter = buildAreaScopeFilter(request.auth, "al.area_id");
      const alertRows = await query(
        `SELECT
           al.*,
           a.area_name AS areaName,
           s.sensor_name AS sensorName,
           g.gateway_name AS gatewayName,
           ac.actuator_name AS actuatorName,
           r.rule_name AS ruleName,
           u.real_name AS assignedToName
         FROM ops_alerts al
         LEFT JOIN biz_areas a ON a.id = al.area_id
         LEFT JOIN iot_sensors s ON s.id = al.sensor_id
         LEFT JOIN iot_gateways g ON g.id = al.gateway_id
         LEFT JOIN iot_actuators ac ON ac.id = al.actuator_id
         LEFT JOIN rule_definitions r ON r.id = al.rule_id
         LEFT JOIN sys_users u ON u.id = al.assigned_to
         WHERE al.id = ?
           ${tenantFilters.length ? `AND ${tenantFilters.join(" AND ")}` : ""}
           ${scopeFilter.sql ? `AND ${scopeFilter.sql}` : ""}
         LIMIT 1`,
        [alertId, ...tenantParams, ...scopeFilter.params]
      );

      if (!alertRows[0]) {
        return fail(reply, 404, "未找到告警", "not_found");
      }

      const transitions = await query(
        `SELECT
           t.id,
           t.from_status AS fromStatus,
           t.to_status AS toStatus,
           t.action_type AS actionType,
           t.remark_text AS remarkText,
           t.created_at AS createdAt,
           u.real_name AS actorName
         FROM ops_alert_transitions t
         LEFT JOIN sys_users u ON u.id = t.actor_user_id
         WHERE t.alert_id = ?
         ORDER BY t.created_at DESC, t.id DESC`,
        [alertId]
      );

      return ok({
        ...alertRows[0],
        transitions
      });
    }
  );

  app.post(
    "/api/v1/alerts/:id/transitions",
    {
      preHandler: [app.authenticate]
    },
    async (request, reply) => {
      const alertId = parseInteger(request.params.id);
      if (!alertId) {
        return fail(reply, 400, "无效的告警ID");
      }

      const actionType = String(request.body?.actionType || "").trim();
      try {
        assertAlertActionAllowed(actionType, request.auth);
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }

      const assignedTo = parseInteger(request.body?.assignedTo);
      const remarkText = optionalString(request.body?.remarkText);

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const tenantFilters = [];
        const tenantParams = [];
        appendTenantScope(tenantFilters, tenantParams, request.auth, "tenant_id");
        const scopeFilter = buildAreaScopeFilter(request.auth, "area_id");
        const [rawAlertRows] = await connection.execute(
          `SELECT id, status, area_id AS areaId, assigned_to AS assignedTo, reopen_count AS reopenCount
           FROM ops_alerts
           WHERE id = ?
             ${tenantFilters.length ? `AND ${tenantFilters.join(" AND ")}` : ""}
             ${scopeFilter.sql ? `AND ${scopeFilter.sql}` : ""}
           LIMIT 1`,
          [alertId, ...tenantParams, ...scopeFilter.params]
        );
        const alertRows = asRowArray(rawAlertRows);

        if (alertRows.length === 0) {
          await connection.rollback();
          return fail(reply, 404, "未找到告警", "not_found");
        }

        const currentAlert = alertRows[0];
        let assigneeExists = true;
        if (actionType === "assign") {
          const [rawAssigneeRows] = await connection.execute(
            "SELECT id FROM sys_users WHERE id = ? LIMIT 1",
            [assignedTo]
          );
          const assigneeRows = asRowArray(rawAssigneeRows);
          assigneeExists = assigneeRows.length > 0;
        }
        const transitionPlan = buildAlertTransitionPlan(currentAlert, actionType, {
          assignedTo,
          assigneeExists,
          remarkText
        });

        await connection.execute(
          `UPDATE ops_alerts
           SET status = ?,
               assigned_to = ?,
               handled_remark = ?,
               last_transition_at = NOW(),
               closed_at = ?,
               closed_reason = ?,
               close_source = ?,
               reopen_count = reopen_count + ?
           WHERE id = ?`,
          [
            transitionPlan.nextStatus,
            transitionPlan.nextAssignedTo,
            remarkText,
            transitionPlan.closedAt,
            transitionPlan.closedReason,
            transitionPlan.closeSource,
            transitionPlan.reopenDelta,
            alertId
          ]
        );

        await connection.execute(
          `INSERT INTO ops_alert_transitions
            (alert_id, from_status, to_status, action_type, actor_user_id, assigned_to, remark_text)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            alertId,
            currentAlert.status,
            transitionPlan.nextStatus,
            actionType,
            request.auth.user.id,
            transitionPlan.nextAssignedTo,
            remarkText
          ]
        );

        await connection.commit();
        await logOperation(request, {
          moduleCode: "alert_center",
          operationType: actionType,
          targetType: "ops_alerts",
          targetId: alertId,
          requestParams: {
            actionType,
            assignedTo: transitionPlan.nextAssignedTo,
            remarkText
          },
          resultMessage: "告警流转"
        });
        return ok(
          {
            id: alertId,
            fromStatus: currentAlert.status,
            toStatus: transitionPlan.nextStatus,
            assignedTo: transitionPlan.nextAssignedTo,
            reopenCount: Number(currentAlert.reopenCount || 0) + transitionPlan.reopenDelta
          },
          "告警流转成功"
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
    "/api/v1/notifications",
    {
      preHandler: [app.requirePermissions(["alert:view"])]
    },
    async (request) => {
      const status = String(request.query?.status || "").trim();
      const channelType = String(request.query?.channelType || "").trim();
      const receiverKeyword = String(request.query?.receiverKeyword || "").trim();
      const alertId = parseInteger(request.query?.alertId);
      const filters = [];
      const params = [];
      if (status) {
        filters.push("n.send_status = ?");
        params.push(status);
      }
      if (channelType) {
        filters.push("n.channel_type = ?");
        params.push(channelType);
      }
      if (receiverKeyword) {
        filters.push("(n.receiver_value LIKE ? OR n.content_summary LIKE ?)");
        params.push(`%${receiverKeyword}%`, `%${receiverKeyword}%`);
      }
      if (alertId) {
        filters.push("n.alert_id = ?");
        params.push(alertId);
      }
      appendTenantScope(filters, params, request.auth, "n.tenant_id");
      appendAreaScope(filters, params, request.auth, "al.area_id");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           n.id,
           n.notification_no AS notificationNo,
           n.alert_id AS alertId,
           n.channel_type AS channelType,
           n.receiver_type AS receiverType,
           n.receiver_value AS receiverValue,
           n.content_summary AS contentSummary,
           n.send_status AS sendStatus,
           n.retry_count AS retryCount,
           n.response_text AS responseText,
           n.sent_at AS sentAt,
           n.created_at AS createdAt,
           al.alert_no AS alertNo,
           al.title AS alertTitle
         FROM ops_notifications n
         LEFT JOIN ops_alerts al ON al.id = n.alert_id
         ${whereClause}
         ORDER BY n.created_at DESC, n.id DESC`,
        params
      );
      return ok(rows);
    }
  );

  app.post(
    "/api/v1/notifications/:id/resend",
    {
      preHandler: [app.requirePermissions(["alert:assign"])]
    },
    async (request, reply) => {
      const notificationId = parseInteger(request.params.id);
      if (!notificationId) {
        return fail(reply, 400, "无效的通知ID");
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const tenantFilters = [];
        const tenantParams = [];
        appendTenantScope(tenantFilters, tenantParams, request.auth, "n.tenant_id");
        const scopeFilter = buildAreaScopeFilter(request.auth, "al.area_id");
        const [rawNotificationRows] = await connection.execute(
          `SELECT
             n.id AS id,
             notification_no AS notificationNo,
             alert_id AS alertId,
             send_status AS sendStatus,
             retry_count AS retryCount,
             receiver_value AS receiverValue,
             channel_type AS channelType,
          content_summary AS contentSummary,
          al.alert_no AS alertNo,
          al.title AS alertTitle
          FROM ops_notifications n
          LEFT JOIN ops_alerts al ON al.id = n.alert_id
           WHERE n.id = ?
             ${tenantFilters.length ? `AND ${tenantFilters.join(" AND ")}` : ""}
             ${scopeFilter.sql ? `AND ${scopeFilter.sql}` : ""}
           LIMIT 1`,
          [notificationId, ...tenantParams, ...scopeFilter.params]
        );
        const notificationRows = asRowArray(rawNotificationRows);

        if (notificationRows.length === 0) {
          await connection.rollback();
          return fail(reply, 404, "未找到通知记录", "not_found");
        }

        let sendResult;
        let sendStatus = "sent";
        let responseText = "已手动重发";
        let sentAt = new Date();

        try {
          sendResult = await sendNotification(connection, {
            channelType: notificationRows[0].channelType,
            receiverType: "manual",
            receiverValue: notificationRows[0].receiverValue,
            contentSummary: notificationRows[0].contentSummary || `重发通知：${notificationRows[0].notificationNo}`,
            alertNo: notificationRows[0].alertNo || String(notificationRows[0].alertId || ""),
            alertTitle: notificationRows[0].alertTitle || `通知重发 ${notificationRows[0].notificationNo}`
          }, {
            authContext: request.auth
          });
          responseText = truncateResponseText(sendResult.responseText || "通知发送成功");
        } catch (error) {
          sendStatus = "failed";
          responseText = truncateResponseText(error.message);
          sentAt = null;
        }

        await connection.execute(
          `UPDATE ops_notifications
           SET retry_count = retry_count + 1,
               send_status = ?,
               response_text = ?,
               sent_at = ?
           WHERE id = ?`,
          [sendStatus, responseText, sentAt, notificationId]
        );

        await connection.commit();
        await logOperation(request, {
          moduleCode: "notification_logs",
          operationType: "resend",
          targetType: "ops_notifications",
          targetId: notificationId,
          requestParams: {
            notificationNo: notificationRows[0].notificationNo,
            channelType: notificationRows[0].channelType,
            receiverValue: notificationRows[0].receiverValue
          },
          resultMessage: "重发通知"
        });

        return ok(
          {
            id: notificationId,
            alertId: notificationRows[0].alertId,
            retryCount: Number(notificationRows[0].retryCount || 0) + 1,
            sendStatus,
            provider: sendResult?.provider || null,
            responseText
          },
          sendStatus === "sent" ? "通知已重发" : "通知重发失败"
        );
      } catch (error) {
        await connection.rollback();
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      } finally {
        connection.release();
      }
    }
  );
}

function truncateResponseText(value) {
  const normalized = String(value || "").trim();
  if (normalized.length <= 240) {
    return normalized;
  }
  return `${normalized.slice(0, 240)}...`;
}

module.exports = alertRoutes;
