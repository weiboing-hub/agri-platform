const { query } = require("../lib/mysql");
const { ok, fail } = require("../lib/response");
const { parseInteger } = require("../lib/helpers");
const { resolveAreaWeather } = require("../lib/weather-provider");
const {
  appendAreaScope,
  buildAreaScopeFilter,
  appendTenantScope,
  appendTenantReferenceScope
} = require("../lib/data-scope");
const TREND_PRESETS = {
  "3h": { intervalValue: 3, intervalUnit: "HOUR", bucketFormat: "%Y-%m-%d %H:00:00", granularity: "hour" },
  "6h": { intervalValue: 6, intervalUnit: "HOUR", bucketFormat: "%Y-%m-%d %H:00:00", granularity: "hour" },
  "12h": { intervalValue: 12, intervalUnit: "HOUR", bucketFormat: "%Y-%m-%d %H:00:00", granularity: "hour" },
  "24h": { intervalValue: 24, intervalUnit: "HOUR", bucketFormat: "%Y-%m-%d %H:00:00", granularity: "hour" },
  "3d": { intervalValue: 3, intervalUnit: "DAY", bucketFormat: "%Y-%m-%d", granularity: "day" },
  "7d": { intervalValue: 7, intervalUnit: "DAY", bucketFormat: "%Y-%m-%d", granularity: "day" }
};
const ALLOWED_INTERVAL_UNITS = new Set(["HOUR", "DAY"]);
const ALLOWED_BUCKET_FORMATS = new Set(["%Y-%m-%d %H:00:00", "%Y-%m-%d"]);

async function dashboardRoutes(app) {
  app.get(
    "/api/v1/dashboard/summary",
    {
      preHandler: [app.requirePermissions(["dashboard:view"])]
    },
    async (request, reply) => {
      try {
        const areaId = parseInteger(request.query?.areaId);
        const gatewayFilters = [];
        const gatewayParams = [];
        if (areaId) {
          gatewayFilters.push("area_id = ?");
          gatewayParams.push(areaId);
        }
        appendTenantScope(gatewayFilters, gatewayParams, request.auth, "tenant_id");
        const gatewayScopeFilter = buildAreaScopeFilter(request.auth, "area_id");
        if (gatewayScopeFilter.sql) {
          gatewayFilters.push(gatewayScopeFilter.sql);
          gatewayParams.push(...gatewayScopeFilter.params);
        }
        const whereArea = gatewayFilters.length ? `WHERE ${gatewayFilters.join(" AND ")}` : "";

        const [gatewayCounts] = await Promise.all([
          query(
            `SELECT
               SUM(CASE WHEN online_status = 'online' THEN 1 ELSE 0 END) AS onlineGatewayCount,
               SUM(CASE WHEN online_status <> 'online' OR online_status IS NULL THEN 1 ELSE 0 END) AS offlineGatewayCount
             FROM iot_gateways
             ${whereArea}`,
            gatewayParams
          )
        ]);

        const commonAreaFilters = [];
        const commonAreaParams = [];
        if (areaId) {
          commonAreaFilters.push("area_id = ?");
          commonAreaParams.push(areaId);
        }
        appendTenantScope(commonAreaFilters, commonAreaParams, request.auth, "tenant_id");
        const commonAreaScopeFilter = buildAreaScopeFilter(request.auth, "area_id");
        if (commonAreaScopeFilter.sql) {
          commonAreaFilters.push(commonAreaScopeFilter.sql);
          commonAreaParams.push(...commonAreaScopeFilter.params);
        }
        const commonAreaWhere = commonAreaFilters.length ? `WHERE ${commonAreaFilters.join(" AND ")}` : "";

        const [sensorCountRows, actuatorCountRows, alertCountRows, controlCountRows, backfillRows] = await Promise.all([
          query(`SELECT COUNT(*) AS sensorCount FROM iot_sensors ${commonAreaWhere}`, commonAreaParams),
          query(`SELECT COUNT(*) AS actuatorCount FROM iot_actuators ${commonAreaWhere}`, commonAreaParams),
          query(
            `SELECT COUNT(*) AS pendingAlertCount
             FROM ops_alerts
             WHERE status IN ('pending','acknowledged','in_progress','on_hold','reopened')
               ${commonAreaFilters.length ? `AND ${commonAreaFilters.join(" AND ")}` : ""}`,
            commonAreaParams
          ),
          query(`SELECT COUNT(*) AS todayControlCount,
                        SUM(CASE WHEN source_type = 'auto' THEN 1 ELSE 0 END) AS todayAutoControlCount
                 FROM ops_control_commands
                 WHERE DATE(queued_at) = CURDATE()
                   ${commonAreaFilters.length ? `AND ${commonAreaFilters.join(" AND ")}` : ""}`,
            commonAreaParams),
          query(`SELECT COUNT(*) AS todayBackfillBatchCount
                 FROM iot_gateway_backfill_batches
                 WHERE DATE(created_at) = CURDATE()
                   AND gateway_id IN (
                     SELECT id
                     FROM iot_gateways
                     ${whereArea}
                   )`,
            gatewayParams)
        ]);

        return ok({
          onlineGatewayCount: Number(gatewayCounts[0]?.onlineGatewayCount || 0),
          offlineGatewayCount: Number(gatewayCounts[0]?.offlineGatewayCount || 0),
          sensorCount: Number(sensorCountRows[0]?.sensorCount || 0),
          actuatorCount: Number(actuatorCountRows[0]?.actuatorCount || 0),
          pendingAlertCount: Number(alertCountRows[0]?.pendingAlertCount || 0),
          todayControlCount: Number(controlCountRows[0]?.todayControlCount || 0),
          todayAutoControlCount: Number(controlCountRows[0]?.todayAutoControlCount || 0),
          todayBackfillBatchCount: Number(backfillRows[0]?.todayBackfillBatchCount || 0)
        });
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.get(
    "/api/v1/dashboard/weather-context",
    {
      preHandler: [app.requirePermissions(["dashboard:view"])]
    },
    async (request, reply) => {
      try {
        const areaId = parseInteger(request.query?.areaId);
        const filters = [];
        const params = [];

        if (areaId) {
          filters.push("a.id = ?");
          params.push(areaId);
        }

        appendTenantScope(filters, params, request.auth, "a.tenant_id");
        appendAreaScope(filters, params, request.auth, "a.id");

        const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
        const rows = await query(
          `SELECT
             a.id,
             a.area_code AS areaCode,
             a.area_name AS areaName,
             a.weather_location_name AS weatherLocationName,
             a.weather_provider_ref AS weatherProviderRef,
             a.latitude,
             a.longitude,
             a.updated_at AS updatedAt
           FROM biz_areas a
           ${whereClause}
           ORDER BY a.id ASC
           LIMIT 1`,
          params
        );

        if (rows.length === 0) {
          return ok({
            status: "no_area",
            summary: "当前账号还没有可用区域，暂时无法展示天气上下文。",
            weatherEnabled: false,
            currentDateSource: "Asia/Shanghai"
          });
        }

        const area = rows[0];
        const weatherContext = await resolveAreaWeather(area, {
          authContext: request.auth
        });
        return ok(weatherContext);
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.get(
    "/api/v1/dashboard/trends",
    {
      preHandler: [app.requirePermissions(["dashboard:view"])]
    },
    async (request, reply) => {
      try {
        const preset = String(request.query?.preset || "24h").trim().toLowerCase();
        const areaId = parseInteger(request.query?.areaId);
        const { intervalValue, intervalUnit, bucketFormat, granularity } = resolveTrendPreset(preset);
        const trendFilters = ["r.collected_at >= DATE_SUB(NOW(), INTERVAL ? " + intervalUnit + ")"];
        const trendParams = [intervalValue];
        if (areaId) {
          trendFilters.push("r.area_id = ?");
          trendParams.push(areaId);
        }
        appendTenantReferenceScope(trendFilters, trendParams, request.auth, "r.area_id", "biz_areas");
        const trendScopeFilter = buildAreaScopeFilter(request.auth, "r.area_id");
        if (trendScopeFilter.sql) {
          trendFilters.push(trendScopeFilter.sql);
          trendParams.push(...trendScopeFilter.params);
        }
        const metricRows = await query(
          `SELECT
             DATE_FORMAT(r.collected_at, '${bucketFormat}') AS bucketAt,
             r.metric_code AS metricCode,
             COALESCE(MAX(m.metric_name), MAX(r.metric_name), r.metric_code) AS metricName,
             COALESCE(MAX(NULLIF(m.unit_name, '')), MAX(r.unit_name), '') AS unitName,
             COALESCE(MAX(m.sort_order), 999) AS sortOrder,
             ROUND(AVG(r.metric_value), 2) AS avgValue
           FROM iot_sensor_readings r
           LEFT JOIN iot_metric_defs m ON m.metric_code = r.metric_code
           WHERE ${trendFilters.join(" AND ")}
           GROUP BY DATE_FORMAT(r.collected_at, '${bucketFormat}'), r.metric_code
           ORDER BY bucketAt ASC, sortOrder ASC, metricCode ASC`,
          trendParams
        );

        const backfillFilters = ["collected_at >= DATE_SUB(NOW(), INTERVAL ? " + intervalUnit + ")"];
        const backfillParams = [intervalValue];
        if (areaId) {
          backfillFilters.push("area_id = ?");
          backfillParams.push(areaId);
        }
        appendTenantReferenceScope(backfillFilters, backfillParams, request.auth, "area_id", "biz_areas");
        const backfillScopeFilter = buildAreaScopeFilter(request.auth, "area_id");
        if (backfillScopeFilter.sql) {
          backfillFilters.push(backfillScopeFilter.sql);
          backfillParams.push(...backfillScopeFilter.params);
        }
        const backfillRows = await query(
          `SELECT
             DATE_FORMAT(collected_at, '${bucketFormat}') AS bucketAt,
             ROUND(SUM(CASE WHEN is_backfilled = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 4) AS backfillRatio
           FROM iot_sensor_readings
           WHERE ${backfillFilters.join(" AND ")}
           GROUP BY DATE_FORMAT(collected_at, '${bucketFormat}')
           ORDER BY bucketAt ASC`,
          backfillParams
        );

        const columnMap = new Map();
        const rowMap = new Map();

        backfillRows.forEach((item) => {
          rowMap.set(item.bucketAt, {
            bucketAt: item.bucketAt,
            backfillRatio: toNullableNumber(item.backfillRatio),
            metricsByCode: {}
          });
        });

        metricRows.forEach((item) => {
          if (!columnMap.has(item.metricCode)) {
            columnMap.set(item.metricCode, {
              metricCode: item.metricCode,
              metricName: item.metricName || item.metricCode,
              unitName: item.unitName || "",
              sortOrder: Number(item.sortOrder || 999)
            });
          }

          if (!rowMap.has(item.bucketAt)) {
            rowMap.set(item.bucketAt, {
              bucketAt: item.bucketAt,
              backfillRatio: null,
              metricsByCode: {}
            });
          }

          rowMap.get(item.bucketAt).metricsByCode[item.metricCode] = toNullableNumber(item.avgValue);
        });

        const metricColumns = Array.from(columnMap.values()).sort(
          (left, right) => left.sortOrder - right.sortOrder || left.metricCode.localeCompare(right.metricCode)
        );
        const rows = Array.from(rowMap.values()).sort((left, right) => left.bucketAt.localeCompare(right.bucketAt));

        return ok({
          preset,
          granularity,
          metricColumns,
          rows
        });
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );
}

module.exports = dashboardRoutes;

function toNullableNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : null;
}

function resolveTrendPreset(preset) {
  const resolved = TREND_PRESETS[preset] || TREND_PRESETS["24h"];
  if (
    !ALLOWED_INTERVAL_UNITS.has(resolved.intervalUnit) ||
    !ALLOWED_BUCKET_FORMATS.has(resolved.bucketFormat)
  ) {
    throw new Error("Invalid preset");
  }
  return resolved;
}
