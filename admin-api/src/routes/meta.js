// @ts-check

const { menuCatalog, permissionCatalog } = require("../lib/catalog");
const { query } = require("../lib/mysql");
const { parseInteger, normalizeEnabled, optionalString, requiredString } = require("../lib/helpers");
const { ok, fail } = require("../lib/response");
const { logOperation } = require("../lib/audit");

async function metaRoutes(app) {
  app.get("/api/v1/meta/menus", {
    preHandler: [app.authenticate]
  }, async () => ({
    ok: true,
    message: "success",
    data: menuCatalog
  }));

  app.get("/api/v1/meta/permission-codes", {
    preHandler: [app.requireAnyPermissions(["role:manage", "permission:manage"])]
  }, async () => ({
    ok: true,
    message: "success",
    data: permissionCatalog
  }));

  app.get(
    "/api/v1/metrics",
    {
      preHandler: [app.authenticate]
    },
    async (request) => {
      const enabled = request.query?.enabled;
      const keyword = String(request.query?.keyword || "").trim();
      const categoryCode = String(request.query?.categoryCode || "").trim();
      const filters = [];
      const params = [];

      if (enabled !== undefined) {
        filters.push("m.enabled = ?");
        params.push(String(enabled) === "true" ? 1 : 0);
      }
      if (keyword) {
        filters.push("(m.metric_code LIKE ? OR m.metric_name LIKE ?)");
        params.push(`%${keyword}%`, `%${keyword}%`);
      }
      if (categoryCode) {
        filters.push("m.category_code = ?");
        params.push(categoryCode);
      }

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           m.id,
           m.metric_code AS metricCode,
           m.metric_name AS metricName,
           m.category_code AS categoryCode,
           m.unit_name AS unitName,
           m.value_type AS valueType,
           m.precision_scale AS precisionScale,
           m.normal_min AS normalMin,
           m.normal_max AS normalMax,
           m.warn_min AS warnMin,
           m.warn_max AS warnMax,
           m.chart_color AS chartColor,
           m.sort_order AS sortOrder,
           m.enabled,
           m.remark,
           m.created_at AS createdAt,
           m.updated_at AS updatedAt,
           COUNT(DISTINCT c.id) AS channelCount,
           COUNT(DISTINCT c.sensor_id) AS sensorCount
         FROM iot_metric_defs m
         LEFT JOIN iot_sensor_channels c
           ON c.metric_code = m.metric_code
          AND c.enabled = 1
         ${whereClause}
         GROUP BY
           m.id, m.metric_code, m.metric_name, m.category_code, m.unit_name, m.value_type,
           m.precision_scale, m.normal_min, m.normal_max, m.warn_min, m.warn_max, m.chart_color,
           m.sort_order, m.enabled, m.remark, m.created_at, m.updated_at
         ORDER BY m.sort_order ASC, m.id ASC`,
        params
      );

      return ok(rows);
    }
  );

  app.post(
    "/api/v1/metrics",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      try {
        const metricCode = requiredString(request.body?.metricCode, "metricCode").toLowerCase();
        const metricName = requiredString(request.body?.metricName, "metricName");
        const categoryCode = optionalString(request.body?.categoryCode) || "environment";
        const unitName = optionalString(request.body?.unitName);
        const valueType = optionalString(request.body?.valueType) || "decimal";
        const precisionScale = parseInteger(request.body?.precisionScale, 2);
        const normalMin = toNullableNumber(request.body?.normalMin);
        const normalMax = toNullableNumber(request.body?.normalMax);
        const warnMin = toNullableNumber(request.body?.warnMin);
        const warnMax = toNullableNumber(request.body?.warnMax);
        const chartColor = optionalString(request.body?.chartColor) || "#2f6b42";
        const sortOrder = parseInteger(request.body?.sortOrder, 100);
        const enabled = normalizeEnabled(request.body?.enabled, true) ? 1 : 0;
        const remark = optionalString(request.body?.remark);

        const result = await query(
          `INSERT INTO iot_metric_defs
            (metric_code, metric_name, category_code, unit_name, value_type, precision_scale,
             normal_min, normal_max, warn_min, warn_max, chart_color, sort_order, enabled, remark)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            metricCode,
            metricName,
            categoryCode,
            unitName,
            valueType,
            precisionScale,
            normalMin,
            normalMax,
            warnMin,
            warnMax,
            chartColor,
            sortOrder,
            enabled,
            remark
          ]
        );

        await logOperation(request, {
          moduleCode: "metric_catalog",
          operationType: "create",
          targetType: "iot_metric_defs",
          targetId: result.insertId,
          requestParams: {
            metricCode,
            metricName,
            categoryCode,
            enabled: Boolean(enabled)
          },
          resultMessage: "创建指标字典"
        });

        return ok({ insertId: result.insertId, metricCode }, "指标创建成功");
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.put(
    "/api/v1/metrics/:id",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      try {
        const metricId = parseInteger(request.params?.id);
        if (!metricId) {
          return fail(reply, 400, "无效的指标ID");
        }

        const metricName = requiredString(request.body?.metricName, "metricName");
        const categoryCode = optionalString(request.body?.categoryCode) || "environment";
        const unitName = optionalString(request.body?.unitName);
        const valueType = optionalString(request.body?.valueType) || "decimal";
        const precisionScale = parseInteger(request.body?.precisionScale, 2);
        const normalMin = toNullableNumber(request.body?.normalMin);
        const normalMax = toNullableNumber(request.body?.normalMax);
        const warnMin = toNullableNumber(request.body?.warnMin);
        const warnMax = toNullableNumber(request.body?.warnMax);
        const chartColor = optionalString(request.body?.chartColor) || "#2f6b42";
        const sortOrder = parseInteger(request.body?.sortOrder, 100);
        const enabled = normalizeEnabled(request.body?.enabled, true) ? 1 : 0;
        const remark = optionalString(request.body?.remark);

        await query(
          `UPDATE iot_metric_defs
           SET metric_name = ?, category_code = ?, unit_name = ?, value_type = ?, precision_scale = ?,
               normal_min = ?, normal_max = ?, warn_min = ?, warn_max = ?, chart_color = ?,
               sort_order = ?, enabled = ?, remark = ?
           WHERE id = ?`,
          [
            metricName,
            categoryCode,
            unitName,
            valueType,
            precisionScale,
            normalMin,
            normalMax,
            warnMin,
            warnMax,
            chartColor,
            sortOrder,
            enabled,
            remark,
            metricId
          ]
        );

        await logOperation(request, {
          moduleCode: "metric_catalog",
          operationType: "update",
          targetType: "iot_metric_defs",
          targetId: metricId,
          requestParams: {
            metricName,
            categoryCode,
            enabled: Boolean(enabled)
          },
          resultMessage: "更新指标字典"
        });

        return ok({ id: metricId }, "指标更新成功");
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function toNullableNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

module.exports = metaRoutes;
