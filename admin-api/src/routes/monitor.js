// @ts-check

const { pool, query } = require("../lib/mysql");
const { ok, fail } = require("../lib/response");
const { parseDecimal, parseInteger, optionalString } = require("../lib/helpers");
const { logOperation } = require("../lib/audit");
const {
  appendAreaScope,
  appendTenantScope,
  appendTenantReferenceScope,
  buildAreaScopeFilter
} = require("../lib/data-scope");

async function monitorRoutes(app) {
  app.get(
    "/api/v1/monitor/realtime",
    {
      preHandler: [app.requirePermissions(["monitor:view"])]
    },
    async (request, reply) => {
      try {
        const areaId = parseInteger(request.query?.areaId);
        const gatewayId = parseInteger(request.query?.gatewayId);
        const sensorType = String(request.query?.sensorType || "").trim();
        /** @type {string[]} */
        const filters = [];
        /** @type {any[]} */
        const params = [];

        if (areaId) {
          filters.push("s.area_id = ?");
          params.push(areaId);
        }
        if (gatewayId) {
          filters.push("s.gateway_id = ?");
          params.push(gatewayId);
        }
        if (sensorType) {
          filters.push("s.sensor_type = ?");
          params.push(sensorType);
        }
        appendTenantScope(filters, params, request.auth, "s.tenant_id");
        appendAreaScope(filters, params, request.auth, "s.area_id");

        const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
        const rows = await query(
          `SELECT
             s.id AS sensorId,
             s.sensor_code AS sensorCode,
             s.sensor_name AS sensorName,
             s.sensor_type AS sensorType,
             s.current_value_decimal AS currentValue,
             s.unit_name AS unitName,
             s.last_collected_at AS lastCollectedAt,
             s.last_received_at AS lastReceivedAt,
             TIMESTAMPDIFF(SECOND, s.last_collected_at, s.last_received_at) AS delaySeconds,
             g.gateway_name AS gatewayName,
             a.area_name AS areaName,
             latest.data_source AS dataSource,
             latest.time_quality AS timeQuality,
             latest.clock_synced AS clockSynced,
             latest.time_uncertainty_ms AS timeUncertaintyMs,
             latest.delay_ms AS delayMs,
             CASE
               WHEN s.last_collected_at IS NULL THEN 'no_data'
               WHEN s.current_value_decimal IS NULL THEN 'unknown'
               ELSE 'normal'
             END AS thresholdStatus
           FROM iot_sensors s
           LEFT JOIN iot_gateways g ON g.id = s.gateway_id
           LEFT JOIN biz_areas a ON a.id = s.area_id
           LEFT JOIN iot_sensor_readings latest
             ON latest.id = (
               SELECT sr.id
               FROM iot_sensor_readings sr
               WHERE sr.sensor_id = s.id
               ORDER BY sr.collected_at DESC, sr.id DESC
               LIMIT 1
             )
           ${whereClause}
           ORDER BY s.id DESC`,
          params
        );

        return ok(rows);
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.get(
    "/api/v1/monitor/history",
    {
      preHandler: [app.requirePermissions(["history:view"])]
    },
    async (request, reply) => {
      try {
        const sensorId = parseInteger(request.query?.sensorId);
        if (!sensorId) {
          return fail(reply, 400, "sensorId不能为空");
        }

        const limit = Math.min(Math.max(parseInteger(request.query?.limit, 200) || 200, 1), 500);
        const from = String(request.query?.from || "").trim();
        const to = String(request.query?.to || "").trim();
        const dataSource = String(request.query?.dataSource || "").trim();
        const timeQuality = String(request.query?.timeQuality || "").trim();

        /** @type {string[]} */
        const filters = ["sensor_id = ?"];
        /** @type {any[]} */
        const params = [sensorId];

        if (from) {
          filters.push("collected_at >= ?");
          params.push(from);
        }
        if (to) {
          filters.push("collected_at <= ?");
          params.push(to);
        }
        if (dataSource) {
          filters.push("data_source = ?");
          params.push(dataSource);
        }
        if (timeQuality) {
          filters.push("time_quality = ?");
          params.push(timeQuality);
        }
        appendTenantReferenceScope(filters, params, request.auth, "area_id", "biz_areas");
        const scopeFilter = buildAreaScopeFilter(request.auth, "area_id");
        if (scopeFilter.sql) {
          filters.push(scopeFilter.sql);
          params.push(...scopeFilter.params);
        }
        const rows = await query(
          `SELECT
             id,
             metric_code AS metricCode,
             metric_name AS metricName,
             metric_value AS metricValue,
             unit_name AS unitName,
             data_source AS dataSource,
             is_backfilled AS isBackfilled,
             collected_at AS collectedAt,
             received_at AS receivedAt,
             clock_synced AS clockSynced,
             time_uncertainty_ms AS timeUncertaintyMs,
             time_quality AS timeQuality,
             delay_ms AS delayMs
           FROM iot_sensor_readings
           WHERE ${filters.join(" AND ")}
           ORDER BY collected_at DESC, id DESC
           LIMIT ${limit}`,
          params
        );

        return ok(rows);
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.post(
    "/api/v1/monitor/test-reading",
    {
      preHandler: [app.requireAnyPermissions(["sensor:test_read", "sensor:edit", "system:config"])]
    },
    async (request, reply) => {
      const connection = await pool.getConnection();
      try {
        const sensorId = parseInteger(request.body?.sensorId);
        const metricValue = parseDecimal(request.body?.metricValue);
        if (!sensorId) {
          return fail(reply, 400, "sensorId不能为空");
        }
        if (metricValue === null) {
          return fail(reply, 400, "metricValue不能为空");
        }

        const filters = ["s.id = ?"];
        const params = [sensorId];
        appendTenantScope(filters, params, request.auth, "s.tenant_id");
        appendAreaScope(filters, params, request.auth, "s.area_id");

        const sensorRows = await query(
          `SELECT
             s.id,
             s.tenant_id AS tenantId,
             s.sensor_code AS sensorCode,
             s.sensor_name AS sensorName,
             s.sensor_type AS sensorType,
             s.unit_name AS unitName,
             s.gateway_id AS gatewayId,
             s.area_id AS areaId
           FROM iot_sensors s
           WHERE ${filters.join(" AND ")}
           LIMIT 1`,
          params
        );
        const sensor = sensorRows[0];
        if (!sensor) {
          return fail(reply, 404, "传感器不存在或无权限写入测试数据");
        }

        const remark = optionalString(request.body?.remark);
        const rawPayload = {
          source: "manual_test",
          sensorId: sensor.id,
          sensorCode: sensor.sensorCode,
          metricValue,
          remark,
          operatorUserId: request.auth?.user?.id || null
        };

        await connection.beginTransaction();
        const [insertResult] = await connection.execute(
          `INSERT INTO iot_sensor_readings
            (gateway_id, sensor_id, area_id, metric_code, metric_name, metric_value, unit_name, data_source,
             is_backfilled, collected_at, received_at, clock_synced, time_uncertainty_ms, time_quality, delay_ms, quality_score, raw_payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', 0, NOW(), NOW(), 1, 0, 'high', 0, 100, ?)`,
          [
            sensor.gatewayId,
            sensor.id,
            sensor.areaId,
            sensor.sensorType,
            sensor.sensorName,
            metricValue,
            sensor.unitName,
            JSON.stringify(rawPayload)
          ]
        );
        const readingId = Number((/** @type {{ insertId?: unknown }} */ (insertResult)).insertId || 0);
        await connection.execute(
          `UPDATE iot_sensors
           SET current_value_decimal = ?, data_quality_score = 100, last_collected_at = NOW(), last_received_at = NOW()
           WHERE id = ?`,
          [metricValue, sensor.id]
        );
        await connection.commit();

        await logOperation(request, {
          moduleCode: "monitor_realtime",
          operationType: "manual_test_reading",
          targetType: "iot_sensor_readings",
          targetId: readingId,
          requestParams: {
            sensorId: sensor.id,
            sensorCode: sensor.sensorCode,
            metricValue,
            remark
          },
          resultMessage: "写入传感器测试数据"
        });

        return ok(
          {
            readingId,
            sensorId: sensor.id,
            sensorCode: sensor.sensorCode,
            metricValue
          },
          "测试数据已写入"
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

module.exports = monitorRoutes;
