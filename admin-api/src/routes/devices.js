// @ts-check

const { pool, query } = require("../lib/mysql");
const { ok, fail } = require("../lib/response");
const { parseInteger, parseDecimal, requiredString, optionalString, normalizeEnabled } = require("../lib/helpers");
const { logOperation } = require("../lib/audit");
const {
  appendAreaScope,
  appendTenantScope,
  buildAreaScopeFilter,
  assertAreaAccess
} = require("../lib/data-scope");
const { extractTenantId } = require("../lib/tenant-foundation");
const { assertTenantLimitAvailable } = require("../lib/tenant-entitlements");
const { resolveAreaCropSelection } = require("../lib/crop-knowledge");
const { resolveAreaWeather } = require("../lib/weather-provider");
const {
  DEFAULT_ESP32_GATEWAY_CONFIG,
  normalizeGatewayConfig,
  stringifyGatewayConfig,
  summarizeGatewayConfig
} = require("../lib/gateway-config");

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

/**
 * @param {unknown} value
 * @returns {Record<string, any> | null}
 */
function parseJsonObject(value) {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? /** @type {Record<string, any>} */ (value) : null;
}

/**
 * @param {string | null | undefined} gatewayType
 * @returns {string}
 */
function normalizeGatewayType(gatewayType) {
  return optionalString(gatewayType) || "esp32";
}

/**
 * @param {any} row
 */
function formatTemplateRow(row) {
  const config = normalizeGatewayConfig(row?.configJson);
  return {
    id: row.id,
    templateCode: row.templateCode,
    templateName: row.templateName,
    gatewayType: row.gatewayType,
    status: row.status,
    remark: row.remark,
    config,
    configSummary: summarizeGatewayConfig(config),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

/**
 * @param {any} row
 */
function formatGatewayConfigRow(row) {
  const config = normalizeGatewayConfig(row?.configJson);
  return {
    gatewayId: row.gatewayId,
    gatewayCode: row.gatewayCode,
    gatewayName: row.gatewayName,
    gatewayType: row.gatewayType,
    templateId: parseInteger(row.templateId),
    templateCode: row.templateCode || null,
    templateName: row.templateName || null,
    configVersion: Number(row.configVersion || 1),
    configSyncStatus: row.configSyncStatus || "not_configured",
    configMessage: row.configMessage || null,
    lastConfigPushedAt: row.lastConfigPushedAt || null,
    lastConfigAppliedAt: row.lastConfigAppliedAt || null,
    configSource: row.configSource || "default",
    config,
    configSummary: summarizeGatewayConfig(config)
  };
}

/**
 * @param {any} row
 */
function formatGatewayConfigLogRow(row) {
  const config = normalizeGatewayConfig(row?.configSnapshotJson || DEFAULT_ESP32_GATEWAY_CONFIG);
  return {
    id: row.id,
    gatewayId: row.gatewayId,
    gatewayCode: row.gatewayCode,
    gatewayName: row.gatewayName,
    templateId: parseInteger(row.templateId),
    templateCode: row.templateCode || null,
    templateName: row.templateName || null,
    configVersion: Number(row.configVersion || 1),
    actionType: row.actionType || "save_config",
    syncStatus: row.syncStatus || "not_configured",
    configSource: row.configSource || "gateway",
    operatorUserId: parseInteger(row.operatorUserId),
    operatorName: row.operatorName || null,
    messageText: row.messageText || null,
    createdAt: row.createdAt,
    configSummary: summarizeGatewayConfig(config)
  };
}

/**
 * @param {Record<string, any>} body
 * @param {any} existingArea
 * @returns {{
 *   id: number | null;
 *   areaCode: string | null;
 *   areaName: string | null;
 *   weatherLocationName: string | null;
 *   weatherProviderRef: string | null;
 *   latitude: number | null;
 *   longitude: number | null;
 * }}
 */
function buildWeatherPreviewArea(body, existingArea = null) {
  return {
    id: pickInteger(body, "areaId", existingArea?.id),
    areaCode: pickString(body, "areaCode", existingArea?.areaCode),
    areaName: pickString(body, "areaName", existingArea?.areaName) || "临时区域",
    weatherLocationName: pickString(body, "weatherLocationName", existingArea?.weatherLocationName),
    weatherProviderRef: pickString(body, "weatherProviderRef", existingArea?.weatherProviderRef),
    latitude: pickDecimal(body, "latitude", existingArea?.latitude),
    longitude: pickDecimal(body, "longitude", existingArea?.longitude)
  };
}

/**
 * @param {Record<string, any>} body
 * @param {string} key
 */
function hasOwn(body, key) {
  return Object.prototype.hasOwnProperty.call(body || {}, key);
}

/**
 * @param {Record<string, any>} body
 * @param {string} key
 * @param {any} fallback
 */
function pickString(body, key, fallback = null) {
  return hasOwn(body, key) ? optionalString(body[key]) : optionalString(fallback);
}

/**
 * @param {Record<string, any>} body
 * @param {string} key
 * @param {any} fallback
 */
function pickInteger(body, key, fallback = null) {
  return hasOwn(body, key) ? parseInteger(body[key]) : parseInteger(fallback);
}

/**
 * @param {Record<string, any>} body
 * @param {string} key
 * @param {any} fallback
 */
function pickDecimal(body, key, fallback = null) {
  return hasOwn(body, key) ? parseDecimal(body[key]) : parseDecimal(fallback);
}

/**
 * @param {{
 *   tenantId: number | null;
 *   gatewayId: number;
 *   templateId: number | null;
 *   configVersion: number;
 *   actionType: string;
 *   syncStatus: string;
 *   configSource: string;
 *   operatorUserId: number | null;
 *   operatorName: string | null;
 *   messageText: string | null;
 *   configSnapshotJson: string;
 * }} payload
 */
async function insertGatewayConfigLog(payload) {
  await query(
    `INSERT INTO iot_gateway_config_logs
      (tenant_id, gateway_id, template_id, config_version, action_type, sync_status, config_source,
       operator_user_id, operator_name, message_text, config_snapshot_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.tenantId,
      payload.gatewayId,
      payload.templateId,
      payload.configVersion,
      payload.actionType,
      payload.syncStatus,
      payload.configSource,
      payload.operatorUserId,
      payload.operatorName,
      payload.messageText,
      payload.configSnapshotJson
    ]
  );
}

async function deviceRoutes(app) {
  app.get(
    "/api/v1/areas",
    {
      preHandler: [app.requireAnyPermissions(["device:view", "area:add", "area:edit", "area:delete"])]
    },
    async (request) => {
      const keyword = String(request.query?.keyword || "").trim();
      const status = String(request.query?.status || "").trim();
      const filters = [];
      const params = [];

      if (keyword) {
        filters.push("(a.area_name LIKE ? OR a.area_code LIKE ?)");
        params.push(`%${keyword}%`, `%${keyword}%`);
      }
      if (status) {
        filters.push("a.status = ?");
        params.push(status);
      }
      appendTenantScope(filters, params, request.auth, "a.tenant_id");
      appendAreaScope(filters, params, request.auth, "a.id");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           a.id,
           a.area_code AS areaCode,
           a.area_name AS areaName,
           a.area_type AS areaType,
           a.area_level AS areaLevel,
           a.area_size AS areaSize,
           a.crop_type AS cropType,
           a.growth_stage AS growthStage,
           a.crop_species_id AS cropSpeciesId,
           a.crop_variety_id AS cropVarietyId,
           a.crop_stage_id AS cropStageId,
           a.weather_location_name AS weatherLocationName,
           a.weather_provider_ref AS weatherProviderRef,
           a.latitude AS latitude,
           a.longitude AS longitude,
           a.owner_user_id AS ownerUserId,
           a.status,
           a.remark,
           a.created_at AS createdAt,
           u.real_name AS ownerName,
           cs.species_name AS cropSpeciesName,
           cv.variety_name AS cropVarietyName,
           cg.stage_name AS cropStageName,
           COUNT(DISTINCT g.id) AS gatewayCount,
           COUNT(DISTINCT s.id) AS sensorCount,
           COUNT(DISTINCT ac.id) AS actuatorCount
         FROM biz_areas a
         LEFT JOIN sys_users u ON u.id = a.owner_user_id
         LEFT JOIN agri_crop_species cs ON cs.id = a.crop_species_id
         LEFT JOIN agri_crop_varieties cv ON cv.id = a.crop_variety_id
         LEFT JOIN agri_crop_growth_stages cg ON cg.id = a.crop_stage_id
         LEFT JOIN iot_gateways g ON g.area_id = a.id
         LEFT JOIN iot_sensors s ON s.area_id = a.id
         LEFT JOIN iot_actuators ac ON ac.area_id = a.id
         ${whereClause}
         GROUP BY
           a.id, a.area_code, a.area_name, a.area_type, a.area_level, a.area_size,
           a.crop_type, a.growth_stage, a.crop_species_id, a.crop_variety_id, a.crop_stage_id,
           a.weather_location_name, a.weather_provider_ref, a.latitude, a.longitude,
           a.owner_user_id, a.status, a.remark, a.created_at, u.real_name,
           cs.species_name, cv.variety_name, cg.stage_name
         ORDER BY a.id DESC`,
        params
      );

      return ok(rows);
    }
  );

  app.post(
    "/api/v1/areas",
    {
      preHandler: [app.requirePermissions(["area:add"])]
    },
    async (request, reply) => {
      try {
        const areaCode = requiredString(request.body?.areaCode, "areaCode");
        const areaName = requiredString(request.body?.areaName, "areaName");
        const areaType = requiredString(request.body?.areaType, "areaType");
        const ownerUserId = parseInteger(request.body?.ownerUserId);
        const currentTenantId = extractTenantId(request.auth);
        const cropSelection = await resolveAreaCropSelection(request.auth, request.body);

        const result = currentTenantId
          ? await query(
            `INSERT INTO biz_areas
              (tenant_id, area_code, area_name, area_type, area_level, area_size, crop_type, growth_stage,
               crop_species_id, crop_variety_id, crop_stage_id,
               weather_location_name, weather_provider_ref, latitude, longitude, owner_user_id, status, remark)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              currentTenantId,
              areaCode,
              areaName,
              areaType,
              parseInteger(request.body?.areaLevel, 1),
              request.body?.areaSize ?? null,
              cropSelection.cropType,
              cropSelection.growthStage,
              cropSelection.cropSpeciesId,
              cropSelection.cropVarietyId,
              cropSelection.cropStageId,
              optionalString(request.body?.weatherLocationName),
              optionalString(request.body?.weatherProviderRef),
              parseDecimal(request.body?.latitude),
              parseDecimal(request.body?.longitude),
              ownerUserId,
              optionalString(request.body?.status) || "enabled",
              optionalString(request.body?.remark)
            ]
          )
          : await query(
            `INSERT INTO biz_areas
              (area_code, area_name, area_type, area_level, area_size, crop_type, growth_stage,
               crop_species_id, crop_variety_id, crop_stage_id,
               weather_location_name, weather_provider_ref, latitude, longitude, owner_user_id, status, remark)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              areaCode,
              areaName,
              areaType,
              parseInteger(request.body?.areaLevel, 1),
              request.body?.areaSize ?? null,
              cropSelection.cropType,
              cropSelection.growthStage,
              cropSelection.cropSpeciesId,
              cropSelection.cropVarietyId,
              cropSelection.cropStageId,
              optionalString(request.body?.weatherLocationName),
              optionalString(request.body?.weatherProviderRef),
              parseDecimal(request.body?.latitude),
              parseDecimal(request.body?.longitude),
              ownerUserId,
              optionalString(request.body?.status) || "enabled",
              optionalString(request.body?.remark)
            ]
          );

        await logOperation(request, {
          moduleCode: "device_area",
          operationType: "create",
          targetType: "biz_areas",
          targetId: result.insertId,
          requestParams: {
            areaCode,
            areaName,
            areaType
          },
          resultMessage: "创建区域"
        });

        return ok({ insertId: result.insertId }, "区域创建成功");
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.post(
    "/api/v1/areas/weather-preview",
    {
      preHandler: [app.requireAnyPermissions(["device:view", "area:add", "area:edit"])]
    },
    async (request, reply) => {
      try {
        /** @type {Record<string, any>} */
        const body = request.body && typeof request.body === "object" ? request.body : {};
        const areaId = parseInteger(body.areaId || body.id);
        let existingArea = null;

        if (areaId) {
          await assertAreaAccess(request.auth, areaId, "没有测试该区域天气的权限");
          const filters = ["a.id = ?"];
          const params = [areaId];
          appendTenantScope(filters, params, request.auth, "a.tenant_id");
          appendAreaScope(filters, params, request.auth, "a.id");
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
             WHERE ${filters.join(" AND ")}
             LIMIT 1`,
            params
          );
          existingArea = rows[0] || null;
          if (!existingArea) {
            return fail(reply, 404, "未找到区域或没有访问权限", "not_found");
          }
        }

        const area = buildWeatherPreviewArea(body, existingArea);
        const weather = await resolveAreaWeather(area, {
          authContext: request.auth
        });

        return ok({
          area,
          weather
        });
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.put(
    "/api/v1/areas/:id",
    {
      preHandler: [app.requirePermissions(["area:edit"])]
    },
    async (request, reply) => {
      try {
        const id = parseInteger(request.params.id);
        if (!id) {
          return fail(reply, 400, "无效的区域ID");
        }
        const cropSelection = await resolveAreaCropSelection(request.auth, request.body);

        await query(
          `UPDATE biz_areas
           SET area_name = ?, area_type = ?, area_level = ?, area_size = ?, crop_type = ?, growth_stage = ?,
               crop_species_id = ?, crop_variety_id = ?, crop_stage_id = ?,
               weather_location_name = ?, weather_provider_ref = ?, latitude = ?, longitude = ?,
               owner_user_id = ?, status = ?, remark = ?
           WHERE id = ?`,
          [
            requiredString(request.body?.areaName, "areaName"),
            requiredString(request.body?.areaType, "areaType"),
            parseInteger(request.body?.areaLevel, 1),
            request.body?.areaSize ?? null,
            cropSelection.cropType,
            cropSelection.growthStage,
            cropSelection.cropSpeciesId,
            cropSelection.cropVarietyId,
            cropSelection.cropStageId,
            optionalString(request.body?.weatherLocationName),
            optionalString(request.body?.weatherProviderRef),
            parseDecimal(request.body?.latitude),
            parseDecimal(request.body?.longitude),
            parseInteger(request.body?.ownerUserId),
            optionalString(request.body?.status) || "enabled",
            optionalString(request.body?.remark),
            id
          ]
        );

        await logOperation(request, {
          moduleCode: "device_area",
          operationType: "update",
          targetType: "biz_areas",
          targetId: id,
          requestParams: {
            areaName: request.body?.areaName,
            areaType: request.body?.areaType,
            status: request.body?.status
          },
          resultMessage: "更新区域"
        });

        return ok({ id }, "区域更新成功");
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.delete(
    "/api/v1/areas/:id",
    {
      preHandler: [app.requirePermissions(["area:delete"])]
    },
    async (request, reply) => {
      const id = parseInteger(request.params.id);
      if (!id) {
        return fail(reply, 400, "无效的区域ID");
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [rawAreaRows] = await connection.execute(
          `SELECT id, area_code AS areaCode, area_name AS areaName
           FROM biz_areas
           WHERE id = ?
           LIMIT 1`,
          [id]
        );
        const areaRows = asRowArray(rawAreaRows);

        if (areaRows.length === 0) {
          await connection.rollback();
          return fail(reply, 404, "未找到区域", "not_found");
        }

        const [rawDependencyStatsRows] = await connection.query(
          `SELECT
             (SELECT COUNT(*) FROM iot_gateways WHERE area_id = ?) AS gatewayCount,
             (SELECT COUNT(*) FROM iot_sensors WHERE area_id = ?) AS sensorCount,
             (SELECT COUNT(*) FROM iot_actuators WHERE area_id = ?) AS actuatorCount`,
          [id, id, id]
        );
        const dependencyStats = asRowArray(rawDependencyStatsRows)[0] || {};

        const gatewayCount = Number(dependencyStats.gatewayCount || 0);
        const sensorCount = Number(dependencyStats.sensorCount || 0);
        const actuatorCount = Number(dependencyStats.actuatorCount || 0);

        if (gatewayCount > 0 || sensorCount > 0 || actuatorCount > 0) {
          await connection.rollback();
          return fail(reply, 409, "当前区域下仍存在设备，不能直接删除", "conflict", {
            gatewayCount,
            sensorCount,
            actuatorCount
          });
        }

        await connection.execute("DELETE FROM biz_areas WHERE id = ?", [id]);
        await connection.commit();

        await logOperation(request, {
          moduleCode: "device_area",
          operationType: "delete",
          targetType: "biz_areas",
          targetId: id,
          requestParams: {
            areaCode: areaRows[0].areaCode,
            areaName: areaRows[0].areaName
          },
          resultMessage: "删除区域"
        });

        return ok(
          {
            id,
            areaCode: areaRows[0].areaCode,
            areaName: areaRows[0].areaName
          },
          "区域删除成功"
        );
      } catch (error) {
        await connection.rollback();
        return fail(reply, 400, error.message);
      } finally {
        connection.release();
      }
    }
  );

  app.get(
    "/api/v1/gateways",
    {
      preHandler: [app.requireAnyPermissions([
        "device:view",
        "device:add",
        "device:edit",
        "device:delete",
        "gateway:reboot",
        "gateway:params_push",
        "gateway:backfill_trigger",
        "gateway:cache_clear",
        "gateway:firmware_upgrade"
      ])]
    },
    async (request) => {
      const keyword = String(request.query?.keyword || "").trim();
      const areaId = parseInteger(request.query?.areaId);
      const filters = [];
      const params = [];

      if (keyword) {
        filters.push("(g.gateway_name LIKE ? OR g.gateway_code LIKE ? OR g.serial_no LIKE ?)");
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }
      if (areaId) {
        filters.push("g.area_id = ?");
        params.push(areaId);
      }
      const gatewayType = optionalString(request.query?.gatewayType);
      if (gatewayType) {
        filters.push("g.gateway_type = ?");
        params.push(gatewayType);
      }
      appendTenantScope(filters, params, request.auth, "g.tenant_id");
      appendAreaScope(filters, params, request.auth, "g.area_id");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           g.id,
           g.gateway_code AS gatewayCode,
           g.gateway_name AS gatewayName,
           g.gateway_type AS gatewayType,
           g.serial_no AS serialNo,
           g.area_id AS areaId,
           g.ip_address AS ipAddress,
           g.mac_address AS macAddress,
           g.firmware_version AS firmwareVersion,
           g.device_template_id AS deviceTemplateId,
           g.device_config_version AS deviceConfigVersion,
           g.device_config_sync_status AS deviceConfigSyncStatus,
           g.last_config_pushed_at AS lastConfigPushedAt,
           g.last_config_applied_at AS lastConfigAppliedAt,
           g.device_config_message AS deviceConfigMessage,
           g.online_status AS onlineStatus,
           g.last_heartbeat_at AS lastHeartbeatAt,
           g.wifi_rssi AS wifiRssi,
           g.cached_record_count AS cachedRecordCount,
           g.last_backfill_at AS lastBackfillAt,
           g.backfill_status AS backfillStatus,
           g.control_availability AS controlAvailability,
           g.runtime_mode AS runtimeMode,
           g.sampling_status AS samplingStatus,
           g.desired_sampling_status AS desiredSamplingStatus,
           g.sampling_command_version AS samplingCommandVersion,
           g.applied_command_version AS appliedCommandVersion,
           g.last_sampling_command_at AS lastSamplingCommandAt,
           g.last_sampling_reported_at AS lastSamplingReportedAt,
           g.status,
           g.remark,
           a.area_name AS areaName,
           t.template_code AS deviceTemplateCode,
           t.template_name AS deviceTemplateName
         FROM iot_gateways g
         LEFT JOIN biz_areas a ON a.id = g.area_id
         LEFT JOIN iot_gateway_templates t ON t.id = g.device_template_id
         ${whereClause}
         ORDER BY g.id DESC`,
        params
      );

      return ok(rows);
    }
  );

  app.get(
    "/api/v1/gateway-templates",
    {
      preHandler: [app.requireAnyPermissions(["device:view", "device:add", "device:edit", "device:delete"])]
    },
    async (request) => {
      const keyword = String(request.query?.keyword || "").trim();
      const gatewayType = optionalString(request.query?.gatewayType);
      const status = optionalString(request.query?.status);
      const filters = [];
      const params = [];

      if (keyword) {
        filters.push("(t.template_name LIKE ? OR t.template_code LIKE ?)");
        params.push(`%${keyword}%`, `%${keyword}%`);
      }
      if (gatewayType) {
        filters.push("t.gateway_type = ?");
        params.push(gatewayType);
      }
      if (status) {
        filters.push("t.status = ?");
        params.push(status);
      }
      appendTenantScope(filters, params, request.auth, "t.tenant_id");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           t.id,
           t.template_code AS templateCode,
           t.template_name AS templateName,
           t.gateway_type AS gatewayType,
           t.config_json AS configJson,
           t.status,
           t.remark,
           t.created_at AS createdAt,
           t.updated_at AS updatedAt,
           COUNT(g.id) AS gatewayUsageCount
         FROM iot_gateway_templates t
         LEFT JOIN iot_gateways g ON g.device_template_id = t.id
         ${whereClause}
         GROUP BY
           t.id, t.template_code, t.template_name, t.gateway_type,
           t.config_json, t.status, t.remark, t.created_at, t.updated_at
         ORDER BY t.id DESC`,
        params
      );

      return ok(rows.map((row) => ({
        ...formatTemplateRow(row),
        gatewayUsageCount: Number(row.gatewayUsageCount || 0)
      })));
    }
  );

  app.post(
    "/api/v1/gateway-templates",
    {
      preHandler: [app.requirePermissions(["device:add"])]
    },
    async (request, reply) => {
      try {
        const tenantId = extractTenantId(request.auth);
        const gatewayType = normalizeGatewayType(request.body?.gatewayType);
        const result = tenantId
          ? await query(
            `INSERT INTO iot_gateway_templates
              (tenant_id, template_code, template_name, gateway_type, config_json, status, remark)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              tenantId,
              requiredString(request.body?.templateCode, "templateCode"),
              requiredString(request.body?.templateName, "templateName"),
              gatewayType,
              stringifyGatewayConfig(request.body?.config),
              optionalString(request.body?.status) || "enabled",
              optionalString(request.body?.remark)
            ]
          )
          : await query(
            `INSERT INTO iot_gateway_templates
              (template_code, template_name, gateway_type, config_json, status, remark)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              requiredString(request.body?.templateCode, "templateCode"),
              requiredString(request.body?.templateName, "templateName"),
              gatewayType,
              stringifyGatewayConfig(request.body?.config),
              optionalString(request.body?.status) || "enabled",
              optionalString(request.body?.remark)
            ]
          );

        await logOperation(request, {
          moduleCode: "gateway_template",
          operationType: "create",
          targetType: "iot_gateway_templates",
          targetId: getInsertId(result),
          requestParams: {
            templateCode: request.body?.templateCode,
            templateName: request.body?.templateName,
            gatewayType
          },
          resultMessage: "创建设备模板"
        });

        return ok({ insertId: getInsertId(result) }, "设备模板创建成功");
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.put(
    "/api/v1/gateway-templates/:id",
    {
      preHandler: [app.requirePermissions(["device:edit"])]
    },
    async (request, reply) => {
      try {
        const id = parseInteger(request.params.id);
        if (!id) {
          return fail(reply, 400, "无效的模板ID");
        }
        const rows = await query(
          `SELECT id
           FROM iot_gateway_templates
           WHERE id = ?
           LIMIT 1`,
          [id]
        );
        if (!rows[0]) {
          return fail(reply, 404, "未找到设备模板", "not_found");
        }

        await query(
          `UPDATE iot_gateway_templates
           SET template_name = ?, gateway_type = ?, config_json = ?, status = ?, remark = ?
           WHERE id = ?`,
          [
            requiredString(request.body?.templateName, "templateName"),
            normalizeGatewayType(request.body?.gatewayType),
            stringifyGatewayConfig(request.body?.config),
            optionalString(request.body?.status) || "enabled",
            optionalString(request.body?.remark),
            id
          ]
        );

        await logOperation(request, {
          moduleCode: "gateway_template",
          operationType: "update",
          targetType: "iot_gateway_templates",
          targetId: id,
          requestParams: {
            templateName: request.body?.templateName,
            gatewayType: request.body?.gatewayType,
            status: request.body?.status
          },
          resultMessage: "更新设备模板"
        });

        return ok({ id }, "设备模板更新成功");
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.delete(
    "/api/v1/gateway-templates/:id",
    {
      preHandler: [app.requirePermissions(["device:delete"])]
    },
    async (request, reply) => {
      const id = parseInteger(request.params.id);
      if (!id) {
        return fail(reply, 400, "无效的模板ID");
      }

      const [templateRows, usageRows] = await Promise.all([
        query(
          `SELECT id, template_code AS templateCode, template_name AS templateName
           FROM iot_gateway_templates
           WHERE id = ?
           LIMIT 1`,
          [id]
        ),
        query(
          `SELECT COUNT(*) AS usageCount
           FROM iot_gateways
           WHERE device_template_id = ?`,
          [id]
        )
      ]);

      const template = templateRows[0];
      if (!template) {
        return fail(reply, 404, "未找到设备模板", "not_found");
      }
      if (Number(usageRows[0]?.usageCount || 0) > 0) {
        return fail(reply, 409, "当前模板已被网关引用，不能删除", "conflict", {
          gatewayUsageCount: Number(usageRows[0]?.usageCount || 0)
        });
      }

      await query("DELETE FROM iot_gateway_templates WHERE id = ?", [id]);
      await logOperation(request, {
        moduleCode: "gateway_template",
        operationType: "delete",
        targetType: "iot_gateway_templates",
        targetId: id,
        requestParams: {
          templateCode: template.templateCode,
          templateName: template.templateName
        },
        resultMessage: "删除设备模板"
      });

      return ok({ id }, "设备模板删除成功");
    }
  );

  app.post(
    "/api/v1/gateways",
    {
      preHandler: [app.requirePermissions(["device:add"])]
    },
    async (request, reply) => {
      try {
        const areaId = parseInteger(request.body?.areaId);
        const currentTenantId = extractTenantId(request.auth);
        await assertAreaAccess(request.auth, areaId, "没有在该区域创建网关的权限");
        if (currentTenantId) {
          await assertTenantLimitAvailable(pool, {
            tenantId: currentTenantId,
            limitKey: "max_gateways",
            increment: 1,
            message: "当前租户已达到网关数量上限，请升级套餐或调整租户配额"
          });
        }
        const result = currentTenantId
          ? await query(
            `INSERT INTO iot_gateways
              (tenant_id, gateway_code, gateway_name, gateway_type, serial_no, area_id, ip_address, mac_address, firmware_version,
               online_status, runtime_mode, backfill_status, control_availability, status, remark)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'offline', ?, 'idle', ?, ?, ?)`,
            [
              currentTenantId,
              requiredString(request.body?.gatewayCode, "gatewayCode"),
              requiredString(request.body?.gatewayName, "gatewayName"),
              requiredString(request.body?.gatewayType, "gatewayType"),
              optionalString(request.body?.serialNo),
              areaId,
              optionalString(request.body?.ipAddress),
              optionalString(request.body?.macAddress),
              optionalString(request.body?.firmwareVersion),
              optionalString(request.body?.runtimeMode) || "manual",
              optionalString(request.body?.controlAvailability) || "enabled",
              optionalString(request.body?.status) || "enabled",
              optionalString(request.body?.remark)
            ]
          )
          : await query(
            `INSERT INTO iot_gateways
              (gateway_code, gateway_name, gateway_type, serial_no, area_id, ip_address, mac_address, firmware_version,
               online_status, runtime_mode, backfill_status, control_availability, status, remark)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'offline', ?, 'idle', ?, ?, ?)`,
            [
              requiredString(request.body?.gatewayCode, "gatewayCode"),
              requiredString(request.body?.gatewayName, "gatewayName"),
              requiredString(request.body?.gatewayType, "gatewayType"),
              optionalString(request.body?.serialNo),
              areaId,
              optionalString(request.body?.ipAddress),
              optionalString(request.body?.macAddress),
              optionalString(request.body?.firmwareVersion),
              optionalString(request.body?.runtimeMode) || "manual",
              optionalString(request.body?.controlAvailability) || "enabled",
              optionalString(request.body?.status) || "enabled",
              optionalString(request.body?.remark)
            ]
          );
        await logOperation(request, {
          moduleCode: "device_gateway",
          operationType: "create",
          targetType: "iot_gateways",
          targetId: result.insertId,
          requestParams: {
            gatewayCode: request.body?.gatewayCode,
            gatewayName: request.body?.gatewayName,
            gatewayType: request.body?.gatewayType
          },
          resultMessage: "创建网关"
        });
        return ok({ insertId: result.insertId }, "网关创建成功");
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.put(
    "/api/v1/gateways/:id",
    {
      preHandler: [app.requirePermissions(["device:edit"])]
    },
    async (request, reply) => {
      try {
        const id = parseInteger(request.params.id);
        if (!id) {
          return fail(reply, 400, "无效的网关ID");
        }
        const gatewayRows = await query(
          `SELECT area_id AS areaId
           FROM iot_gateways
           WHERE id = ?
           LIMIT 1`,
          [id]
        );
        const gateway = gatewayRows[0];
        if (!gateway) {
          return fail(reply, 404, "未找到网关", "not_found");
        }
        await assertAreaAccess(request.auth, gateway.areaId, "没有操作该区域网关的权限");
        const nextAreaId = parseInteger(request.body?.areaId);
        await assertAreaAccess(request.auth, nextAreaId, "没有将网关调整到该区域的权限");
        await query(
          `UPDATE iot_gateways
           SET gateway_name = ?, gateway_type = ?, serial_no = ?, area_id = ?, ip_address = ?, mac_address = ?,
               firmware_version = ?, runtime_mode = ?, control_availability = ?, status = ?, remark = ?
           WHERE id = ?`,
          [
            requiredString(request.body?.gatewayName, "gatewayName"),
            requiredString(request.body?.gatewayType, "gatewayType"),
            optionalString(request.body?.serialNo),
            nextAreaId,
            optionalString(request.body?.ipAddress),
            optionalString(request.body?.macAddress),
            optionalString(request.body?.firmwareVersion),
            optionalString(request.body?.runtimeMode) || "manual",
            optionalString(request.body?.controlAvailability) || "enabled",
            optionalString(request.body?.status) || "enabled",
            optionalString(request.body?.remark),
            id
          ]
        );
        await logOperation(request, {
          moduleCode: "device_gateway",
          operationType: "update",
          targetType: "iot_gateways",
          targetId: id,
          requestParams: {
            gatewayName: request.body?.gatewayName,
            gatewayType: request.body?.gatewayType,
            status: request.body?.status
          },
          resultMessage: "更新网关"
        });
        return ok({ id }, "网关更新成功");
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.get(
    "/api/v1/gateways/:id/device-config",
    {
      preHandler: [app.requireAnyPermissions(["device:view", "device:edit", "gateway:params_push"])]
    },
    async (request, reply) => {
      const id = parseInteger(request.params.id);
      if (!id) {
        return fail(reply, 400, "无效的网关ID");
      }

      const rows = await query(
        `SELECT
           g.id AS gatewayId,
           g.gateway_code AS gatewayCode,
           g.gateway_name AS gatewayName,
           g.gateway_type AS gatewayType,
           g.area_id AS areaId,
           g.device_template_id AS templateId,
           g.device_config_json AS configJson,
           g.device_config_version AS configVersion,
           g.device_config_sync_status AS configSyncStatus,
           g.device_config_message AS configMessage,
           g.last_config_pushed_at AS lastConfigPushedAt,
           g.last_config_applied_at AS lastConfigAppliedAt,
           t.template_code AS templateCode,
           t.template_name AS templateName,
           t.config_json AS templateConfigJson
         FROM iot_gateways g
         LEFT JOIN iot_gateway_templates t ON t.id = g.device_template_id
         WHERE g.id = ?
         LIMIT 1`,
        [id]
      );

      const row = rows[0];
      if (!row) {
        return fail(reply, 404, "未找到网关", "not_found");
      }
      await assertAreaAccess(request.auth, row.areaId, "没有查看该区域网关配置的权限");

      const configSource = row.configJson ? "gateway" : row.templateConfigJson ? "template" : "default";
      const config = normalizeGatewayConfig(row.configJson || row.templateConfigJson || DEFAULT_ESP32_GATEWAY_CONFIG);
      return ok(formatGatewayConfigRow({
        ...row,
        configJson: config,
        configSource
      }));
    }
  );

  app.get(
    "/api/v1/gateways/:id/device-config/logs",
    {
      preHandler: [app.requireAnyPermissions(["device:view", "device:edit", "gateway:params_push"])]
    },
    async (request, reply) => {
      const id = parseInteger(request.params.id);
      if (!id) {
        return fail(reply, 400, "无效的网关ID");
      }

      const gatewayRows = await query(
        `SELECT id, area_id AS areaId
         FROM iot_gateways
         WHERE id = ?
         LIMIT 1`,
        [id]
      );
      const gateway = gatewayRows[0];
      if (!gateway) {
        return fail(reply, 404, "未找到网关", "not_found");
      }
      await assertAreaAccess(request.auth, gateway.areaId, "没有查看该区域网关配置的权限");

      const rows = await query(
        `SELECT
           l.id,
           l.gateway_id AS gatewayId,
           g.gateway_code AS gatewayCode,
           g.gateway_name AS gatewayName,
           l.template_id AS templateId,
           t.template_code AS templateCode,
           t.template_name AS templateName,
           l.config_version AS configVersion,
           l.action_type AS actionType,
           l.sync_status AS syncStatus,
           l.config_source AS configSource,
           l.operator_user_id AS operatorUserId,
           COALESCE(l.operator_name, u.real_name) AS operatorName,
           l.message_text AS messageText,
           l.config_snapshot_json AS configSnapshotJson,
           l.created_at AS createdAt
         FROM iot_gateway_config_logs l
         JOIN iot_gateways g ON g.id = l.gateway_id
         LEFT JOIN iot_gateway_templates t ON t.id = l.template_id
         LEFT JOIN sys_users u ON u.id = l.operator_user_id
         WHERE l.gateway_id = ?
         ORDER BY l.id DESC
         LIMIT 20`,
        [id]
      );

      return ok(rows.map(formatGatewayConfigLogRow));
    }
  );

  app.put(
    "/api/v1/gateways/:id/device-config",
    {
      preHandler: [app.requireAnyPermissions(["device:edit", "gateway:params_push"])]
    },
    async (request, reply) => {
      try {
        const id = parseInteger(request.params.id);
        if (!id) {
          return fail(reply, 400, "无效的网关ID");
        }

        const gatewayRows = await query(
          `SELECT
             id,
             tenant_id AS tenantId,
             area_id AS areaId,
             gateway_code AS gatewayCode,
             gateway_name AS gatewayName,
             gateway_type AS gatewayType,
             device_config_version AS configVersion
           FROM iot_gateways
           WHERE id = ?
           LIMIT 1`,
          [id]
        );
        const gateway = gatewayRows[0];
        if (!gateway) {
          return fail(reply, 404, "未找到网关", "not_found");
        }
        await assertAreaAccess(request.auth, gateway.areaId, "没有操作该区域网关配置的权限");

        const templateId = parseInteger(request.body?.templateId);
        if (templateId) {
          const templateRows = await query(
            `SELECT id, gateway_type AS gatewayType
             FROM iot_gateway_templates
             WHERE id = ?
             LIMIT 1`,
            [templateId]
          );
          const template = templateRows[0];
          if (!template) {
            return fail(reply, 404, "未找到设备模板", "not_found");
          }
          if (template.gatewayType && gateway.gatewayType && template.gatewayType !== gateway.gatewayType) {
            return fail(reply, 400, "模板类型与当前网关类型不匹配", "bad_request");
          }
        }

        const nextVersion = Number(gateway.configVersion || 0) + 1;
        const configJson = stringifyGatewayConfig(request.body?.config);
        const syncStatus = optionalString(request.body?.configSyncStatus) || "pending_push";
        const configMessage = optionalString(request.body?.configMessage)
          || (syncStatus === "pending_push" ? "已更新配置，待设备同步" : null);
        const operatorUserId = parseInteger(request.auth?.user?.id);
        const operatorName = optionalString(request.auth?.user?.realName)
          || optionalString(request.auth?.user?.username)
          || null;

        await query(
          `UPDATE iot_gateways
           SET device_template_id = ?,
               device_config_json = ?,
               device_config_version = ?,
               device_config_sync_status = ?,
               device_config_message = ?,
               last_config_pushed_at = CASE WHEN ? = 'pending_push' THEN NOW() ELSE last_config_pushed_at END
           WHERE id = ?`,
          [templateId, configJson, nextVersion, syncStatus, configMessage, syncStatus, id]
        );

        await logOperation(request, {
          moduleCode: "device_gateway",
          operationType: "config_update",
          targetType: "iot_gateways",
          targetId: id,
          requestParams: {
            gatewayCode: gateway.gatewayCode,
            gatewayName: gateway.gatewayName,
            templateId,
            configVersion: nextVersion,
            configSyncStatus: syncStatus
          },
          resultMessage: "更新网关设备配置"
        });

        await insertGatewayConfigLog({
          tenantId: parseInteger(gateway.tenantId) || extractTenantId(request.auth),
          gatewayId: id,
          templateId,
          configVersion: nextVersion,
          actionType: "save_config",
          syncStatus,
          configSource: "gateway",
          operatorUserId,
          operatorName,
          messageText: configMessage || "已保存网关配置",
          configSnapshotJson: configJson
        });

        return ok(
          {
            gatewayId: id,
            configVersion: nextVersion,
            configSyncStatus: syncStatus
          },
          "网关配置已保存"
        );
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.post(
    "/api/v1/gateways/:id/device-config/mark-applied",
    {
      preHandler: [app.requireAnyPermissions(["device:edit", "gateway:params_push"])]
    },
    async (request, reply) => {
      const id = parseInteger(request.params.id);
      if (!id) {
        return fail(reply, 400, "无效的网关ID");
      }

      const rows = await query(
        `SELECT
           id,
           tenant_id AS tenantId,
           area_id AS areaId,
           gateway_code AS gatewayCode,
           gateway_name AS gatewayName,
           device_template_id AS templateId,
           device_config_version AS configVersion,
           device_config_json AS configJson
         FROM iot_gateways
         WHERE id = ?
         LIMIT 1`,
        [id]
      );
      const gateway = rows[0];
      if (!gateway) {
        return fail(reply, 404, "未找到网关", "not_found");
      }
      await assertAreaAccess(request.auth, gateway.areaId, "没有操作该区域网关配置的权限");

      await query(
        `UPDATE iot_gateways
         SET device_config_sync_status = 'applied',
             device_config_message = '已人工确认生效',
             last_config_applied_at = NOW()
         WHERE id = ?`,
        [id]
      );

      await logOperation(request, {
        moduleCode: "device_gateway",
        operationType: "config_mark_applied",
        targetType: "iot_gateways",
        targetId: id,
        requestParams: {
          gatewayCode: gateway.gatewayCode,
          gatewayName: gateway.gatewayName
        },
        resultMessage: "人工确认网关配置已生效"
      });

      await insertGatewayConfigLog({
        tenantId: parseInteger(gateway.tenantId) || extractTenantId(request.auth),
        gatewayId: id,
        templateId: parseInteger(gateway.templateId),
        configVersion: Number(gateway.configVersion || 1),
        actionType: "mark_applied",
        syncStatus: "applied",
        configSource: gateway.configJson ? "gateway" : "default",
        operatorUserId: parseInteger(request.auth?.user?.id),
        operatorName: optionalString(request.auth?.user?.realName)
          || optionalString(request.auth?.user?.username)
          || null,
        messageText: "已人工确认生效",
        configSnapshotJson: stringifyGatewayConfig(gateway.configJson || DEFAULT_ESP32_GATEWAY_CONFIG)
      });

      return ok({ gatewayId: id, configSyncStatus: "applied" }, "已标记为配置生效");
    }
  );

  app.post(
    "/api/v1/gateways/:id/sampling-state",
    {
      preHandler: [app.requirePermissions(["device:edit"])]
    },
    async (request, reply) => {
      const id = parseInteger(request.params.id);
      if (!id) {
        return fail(reply, 400, "无效的网关ID");
      }

      const desiredSamplingStatus = String(request.body?.desiredSamplingStatus || "").trim();
      if (!["running", "paused"].includes(desiredSamplingStatus)) {
        return fail(reply, 400, "desiredSamplingStatus 仅支持 running 或 paused");
      }

      const rows = await query(
        `SELECT
           id,
           gateway_code AS gatewayCode,
           gateway_name AS gatewayName,
           area_id AS areaId,
           desired_sampling_status AS desiredSamplingStatus,
           sampling_command_version AS samplingCommandVersion
         FROM iot_gateways
         WHERE id = ?
         LIMIT 1`,
        [id]
      );

      const gateway = rows[0];
      if (!gateway) {
        return fail(reply, 404, "未找到网关", "not_found");
      }
      await assertAreaAccess(request.auth, gateway.areaId, "没有操作该区域网关的权限");

      const nextVersion = Number(gateway.samplingCommandVersion || 0) + 1;
      await query(
        `UPDATE iot_gateways
         SET desired_sampling_status = ?,
             sampling_command_version = ?,
             last_sampling_command_at = NOW()
         WHERE id = ?`,
        [desiredSamplingStatus, nextVersion, id]
      );

      await logOperation(request, {
        moduleCode: "device_gateway",
        operationType: desiredSamplingStatus === "paused" ? "pause_sampling" : "resume_sampling",
        targetType: "iot_gateways",
        targetId: id,
        requestParams: {
          gatewayCode: gateway.gatewayCode,
          gatewayName: gateway.gatewayName,
          desiredSamplingStatus,
          commandVersion: nextVersion
        },
        resultMessage: desiredSamplingStatus === "paused" ? "暂停设备检测" : "恢复设备检测"
      });

      return ok(
        {
          id,
          gatewayCode: gateway.gatewayCode,
          desiredSamplingStatus,
          commandVersion: nextVersion
        },
        desiredSamplingStatus === "paused" ? "暂停检测指令已下发" : "恢复检测指令已下发"
      );
    }
  );

  app.delete(
    "/api/v1/gateways/:id",
    {
      preHandler: [app.requirePermissions(["device:delete"])]
    },
    async (request, reply) => {
      const id = parseInteger(request.params.id);
      if (!id) {
        return fail(reply, 400, "无效的网关ID");
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [rawGatewayRows] = await connection.execute(
          `SELECT id, area_id AS areaId, gateway_code AS gatewayCode, gateway_name AS gatewayName
           FROM iot_gateways
           WHERE id = ?
           LIMIT 1`,
          [id]
        );
        const gatewayRows = asRowArray(rawGatewayRows);

        if (gatewayRows.length === 0) {
          await connection.rollback();
          return fail(reply, 404, "未找到网关", "not_found");
        }
        await assertAreaAccess(request.auth, gatewayRows[0].areaId, "没有操作该区域网关的权限");

        const [rawDependencyStatsRows] = await connection.query(
          `SELECT
             (SELECT COUNT(*) FROM iot_sensors WHERE gateway_id = ?) AS sensorCount,
             (SELECT COUNT(*) FROM iot_actuators WHERE gateway_id = ?) AS actuatorCount,
             (SELECT COUNT(*) FROM iot_sensor_readings WHERE gateway_id = ?) AS readingCount,
             (SELECT COUNT(*) FROM iot_gateway_backfill_batches WHERE gateway_id = ?) AS backfillCount,
             (SELECT COUNT(*) FROM ops_alerts WHERE gateway_id = ?) AS alertCount,
             (SELECT COUNT(*) FROM ops_control_commands WHERE gateway_id = ?) AS commandCount,
             (SELECT COUNT(*) FROM ops_control_executions WHERE gateway_id = ?) AS executionCount`,
          [id, id, id, id, id, id, id]
        );
        const dependencyStats = asRowArray(rawDependencyStatsRows)[0] || {};

        const dependencyPayload = normalizeDependencyPayload(dependencyStats);
        if (hasDependencies(dependencyPayload)) {
          await connection.rollback();
          return fail(reply, 409, buildDeleteConflictMessage("网关", dependencyPayload), "conflict", dependencyPayload);
        }

        await connection.execute("DELETE FROM iot_gateways WHERE id = ?", [id]);
        await connection.commit();

        await logOperation(request, {
          moduleCode: "device_gateway",
          operationType: "delete",
          targetType: "iot_gateways",
          targetId: id,
          requestParams: {
            gatewayCode: gatewayRows[0].gatewayCode,
            gatewayName: gatewayRows[0].gatewayName
          },
          resultMessage: "删除网关"
        });

        return ok({ id, gatewayCode: gatewayRows[0].gatewayCode }, "网关删除成功");
      } catch (error) {
        await connection.rollback();
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      } finally {
        connection.release();
      }
    }
  );

  app.get(
    "/api/v1/sensors",
    {
      preHandler: [app.requireAnyPermissions(["device:view", "sensor:edit", "sensor:calibrate", "sensor:test_read"])]
    },
    async (request) => {
      const areaId = parseInteger(request.query?.areaId);
      const sensorType = String(request.query?.sensorType || "").trim();
      const filters = [];
      const params = [];

      if (areaId) {
        filters.push("s.area_id = ?");
        params.push(areaId);
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
           s.id,
           s.sensor_code AS sensorCode,
           s.sensor_name AS sensorName,
           s.sensor_type AS sensorType,
           s.model_name AS modelName,
           s.protocol_type AS protocolType,
           s.modbus_address AS modbusAddress,
           s.gateway_id AS gatewayId,
           s.area_id AS areaId,
           s.install_position AS installPosition,
           s.unit_name AS unitName,
           s.current_value_decimal AS currentValue,
           s.sensor_status AS sensorStatus,
           s.calibration_status AS calibrationStatus,
           s.data_quality_score AS dataQualityScore,
           s.last_collected_at AS lastCollectedAt,
           s.last_received_at AS lastReceivedAt,
           s.remark,
           g.gateway_name AS gatewayName,
           a.area_name AS areaName
         FROM iot_sensors s
         LEFT JOIN iot_gateways g ON g.id = s.gateway_id
         LEFT JOIN biz_areas a ON a.id = s.area_id
         ${whereClause}
         ORDER BY s.id DESC`,
        params
      );
      return ok(rows);
    }
  );

  app.post(
    "/api/v1/sensors",
    {
      preHandler: [app.requirePermissions(["sensor:edit"])]
    },
    async (request, reply) => {
      try {
        const areaId = parseInteger(request.body?.areaId);
        const currentTenantId = extractTenantId(request.auth);
        await assertAreaAccess(request.auth, areaId, "没有在该区域创建传感器的权限");
        const result = currentTenantId
          ? await query(
            `INSERT INTO iot_sensors
              (tenant_id, sensor_code, sensor_name, sensor_type, model_name, protocol_type, modbus_address, gateway_id, area_id,
               install_position, unit_name, sensor_status, calibration_status, remark)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              currentTenantId,
              requiredString(request.body?.sensorCode, "sensorCode"),
              requiredString(request.body?.sensorName, "sensorName"),
              requiredString(request.body?.sensorType, "sensorType"),
              optionalString(request.body?.modelName),
              optionalString(request.body?.protocolType),
              parseInteger(request.body?.modbusAddress),
              parseInteger(request.body?.gatewayId),
              areaId,
              optionalString(request.body?.installPosition),
              optionalString(request.body?.unitName),
              optionalString(request.body?.sensorStatus) || "enabled",
              optionalString(request.body?.calibrationStatus) || "pending",
              optionalString(request.body?.remark)
            ]
          )
          : await query(
            `INSERT INTO iot_sensors
              (sensor_code, sensor_name, sensor_type, model_name, protocol_type, modbus_address, gateway_id, area_id,
               install_position, unit_name, sensor_status, calibration_status, remark)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              requiredString(request.body?.sensorCode, "sensorCode"),
              requiredString(request.body?.sensorName, "sensorName"),
              requiredString(request.body?.sensorType, "sensorType"),
              optionalString(request.body?.modelName),
              optionalString(request.body?.protocolType),
              parseInteger(request.body?.modbusAddress),
              parseInteger(request.body?.gatewayId),
              areaId,
              optionalString(request.body?.installPosition),
              optionalString(request.body?.unitName),
              optionalString(request.body?.sensorStatus) || "enabled",
              optionalString(request.body?.calibrationStatus) || "pending",
              optionalString(request.body?.remark)
            ]
          );
        await logOperation(request, {
          moduleCode: "device_sensor",
          operationType: "create",
          targetType: "iot_sensors",
          targetId: result.insertId,
          requestParams: {
            sensorCode: request.body?.sensorCode,
            sensorName: request.body?.sensorName,
            sensorType: request.body?.sensorType
          },
          resultMessage: "创建传感器"
        });
        return ok({ insertId: result.insertId }, "传感器创建成功");
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.put(
    "/api/v1/sensors/:id",
    {
      preHandler: [app.requirePermissions(["sensor:edit"])]
    },
    async (request, reply) => {
      try {
        const id = parseInteger(request.params.id);
        if (!id) {
          return fail(reply, 400, "无效的传感器ID");
        }
        const sensorRows = await query(
          `SELECT area_id AS areaId
           FROM iot_sensors
           WHERE id = ?
           LIMIT 1`,
          [id]
        );
        const sensor = sensorRows[0];
        if (!sensor) {
          return fail(reply, 404, "未找到传感器", "not_found");
        }
        await assertAreaAccess(request.auth, sensor.areaId, "没有操作该区域传感器的权限");
        const nextAreaId = parseInteger(request.body?.areaId);
        await assertAreaAccess(request.auth, nextAreaId, "没有将传感器调整到该区域的权限");
        await query(
          `UPDATE iot_sensors
           SET sensor_name = ?, sensor_type = ?, model_name = ?, protocol_type = ?, modbus_address = ?, gateway_id = ?,
               area_id = ?, install_position = ?, unit_name = ?, sensor_status = ?, calibration_status = ?, remark = ?
           WHERE id = ?`,
          [
            requiredString(request.body?.sensorName, "sensorName"),
            requiredString(request.body?.sensorType, "sensorType"),
            optionalString(request.body?.modelName),
            optionalString(request.body?.protocolType),
            parseInteger(request.body?.modbusAddress),
            parseInteger(request.body?.gatewayId),
            nextAreaId,
            optionalString(request.body?.installPosition),
            optionalString(request.body?.unitName),
            optionalString(request.body?.sensorStatus) || "enabled",
            optionalString(request.body?.calibrationStatus) || "pending",
            optionalString(request.body?.remark),
            id
          ]
        );
        await logOperation(request, {
          moduleCode: "device_sensor",
          operationType: "update",
          targetType: "iot_sensors",
          targetId: id,
          requestParams: {
            sensorName: request.body?.sensorName,
            sensorType: request.body?.sensorType,
            sensorStatus: request.body?.sensorStatus
          },
          resultMessage: "更新传感器"
        });
        return ok({ id }, "传感器更新成功");
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.delete(
    "/api/v1/sensors/:id",
    {
      preHandler: [app.requirePermissions(["device:delete"])]
    },
    async (request, reply) => {
      const id = parseInteger(request.params.id);
      if (!id) {
        return fail(reply, 400, "无效的传感器ID");
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [rawSensorRows] = await connection.execute(
          `SELECT id, area_id AS areaId, sensor_code AS sensorCode, sensor_name AS sensorName
           FROM iot_sensors
           WHERE id = ?
           LIMIT 1`,
          [id]
        );
        const sensorRows = asRowArray(rawSensorRows);

        if (sensorRows.length === 0) {
          await connection.rollback();
          return fail(reply, 404, "未找到传感器", "not_found");
        }
        await assertAreaAccess(request.auth, sensorRows[0].areaId, "没有操作该区域传感器的权限");

        const [rawDependencyStatsRows] = await connection.query(
          `SELECT
             (SELECT COUNT(*) FROM iot_sensor_channels WHERE sensor_id = ?) AS channelCount,
             (SELECT COUNT(*) FROM iot_sensor_readings WHERE sensor_id = ?) AS readingCount,
             (SELECT COUNT(*) FROM ops_alerts WHERE sensor_id = ?) AS alertCount`,
          [id, id, id]
        );
        const dependencyStats = asRowArray(rawDependencyStatsRows)[0] || {};

        const dependencyPayload = normalizeDependencyPayload(dependencyStats);
        if (Number(dependencyPayload.readingCount || 0) > 0 || Number(dependencyPayload.alertCount || 0) > 0) {
          await connection.rollback();
          return fail(reply, 409, buildDeleteConflictMessage("传感器", dependencyPayload), "conflict", dependencyPayload);
        }

        await connection.execute("DELETE FROM iot_sensor_channels WHERE sensor_id = ?", [id]);
        await connection.execute("DELETE FROM iot_sensors WHERE id = ?", [id]);
        await connection.commit();

        await logOperation(request, {
          moduleCode: "device_sensor",
          operationType: "delete",
          targetType: "iot_sensors",
          targetId: id,
          requestParams: {
            sensorCode: sensorRows[0].sensorCode,
            sensorName: sensorRows[0].sensorName
          },
          resultMessage: "删除传感器"
        });

        return ok({ id, sensorCode: sensorRows[0].sensorCode }, "传感器删除成功");
      } catch (error) {
        await connection.rollback();
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      } finally {
        connection.release();
      }
    }
  );

  app.get(
    "/api/v1/actuators",
    {
      preHandler: [app.requireAnyPermissions([
        "device:view",
        "actuator:control",
        "actuator:force_control",
        "actuator:emergency_stop"
      ])]
    },
    async (request) => {
      const areaId = parseInteger(request.query?.areaId);
      const actuatorType = String(request.query?.actuatorType || "").trim();
      const filters = [];
      const params = [];

      if (areaId) {
        filters.push("a.area_id = ?");
        params.push(areaId);
      }
      if (actuatorType) {
        filters.push("a.actuator_type = ?");
        params.push(actuatorType);
      }
      appendTenantScope(filters, params, request.auth, "a.tenant_id");
      appendAreaScope(filters, params, request.auth, "a.area_id");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           a.id,
           a.actuator_code AS actuatorCode,
           a.actuator_name AS actuatorName,
           a.actuator_type AS actuatorType,
           a.gateway_id AS gatewayId,
           a.area_id AS areaId,
           a.control_channel AS controlChannel,
           a.desired_state_text AS desiredStateText,
           a.reported_state_text AS reportedStateText,
           a.shadow_status AS shadowStatus,
           a.last_action_at AS lastActionAt,
           a.max_run_seconds AS maxRunSeconds,
           a.mutex_group AS mutexGroup,
           a.running_mode AS runningMode,
           a.status,
           a.remark,
           g.gateway_name AS gatewayName,
           g.online_status AS onlineStatus,
           g.backfill_status AS backfillStatus,
           g.control_availability AS controlAvailability,
           ar.area_name AS areaName,
           ds.desired_state_json AS desiredStateJson,
           ds.reported_state_json AS reportedStateJson,
           ds.desired_updated_at AS desiredUpdatedAt,
           ds.reported_updated_at AS reportedUpdatedAt
         FROM iot_actuators a
         LEFT JOIN iot_gateways g ON g.id = a.gateway_id
         LEFT JOIN biz_areas ar ON ar.id = a.area_id
         LEFT JOIN iot_device_shadow ds ON ds.actuator_id = a.id
         ${whereClause}
         ORDER BY a.id DESC`,
        params
      );
      return ok(rows);
    }
  );

  app.post(
    "/api/v1/actuators",
    {
      preHandler: [app.requirePermissions(["device:edit"])]
    },
    async (request, reply) => {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const areaId = parseInteger(request.body?.areaId);
        const currentTenantId = extractTenantId(request.auth);
        await assertAreaAccess(request.auth, areaId, "没有在该区域创建执行器的权限");
        const [insertResult] = currentTenantId
          ? await connection.execute(
            `INSERT INTO iot_actuators
              (tenant_id, actuator_code, actuator_name, actuator_type, gateway_id, area_id, control_channel, desired_state_text,
               reported_state_text, shadow_status, max_run_seconds, mutex_group, running_mode, status, remark)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              currentTenantId,
              requiredString(request.body?.actuatorCode, "actuatorCode"),
              requiredString(request.body?.actuatorName, "actuatorName"),
              requiredString(request.body?.actuatorType, "actuatorType"),
              parseInteger(request.body?.gatewayId),
              areaId,
              optionalString(request.body?.controlChannel),
              optionalString(request.body?.desiredStateText),
              optionalString(request.body?.reportedStateText),
              optionalString(request.body?.shadowStatus) || "unknown",
              parseInteger(request.body?.maxRunSeconds),
              optionalString(request.body?.mutexGroup),
              optionalString(request.body?.runningMode) || "manual",
              optionalString(request.body?.status) || "enabled",
              optionalString(request.body?.remark)
            ]
          )
          : await connection.execute(
            `INSERT INTO iot_actuators
              (actuator_code, actuator_name, actuator_type, gateway_id, area_id, control_channel, desired_state_text,
               reported_state_text, shadow_status, max_run_seconds, mutex_group, running_mode, status, remark)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              requiredString(request.body?.actuatorCode, "actuatorCode"),
              requiredString(request.body?.actuatorName, "actuatorName"),
              requiredString(request.body?.actuatorType, "actuatorType"),
              parseInteger(request.body?.gatewayId),
              areaId,
              optionalString(request.body?.controlChannel),
              optionalString(request.body?.desiredStateText),
              optionalString(request.body?.reportedStateText),
              optionalString(request.body?.shadowStatus) || "unknown",
              parseInteger(request.body?.maxRunSeconds),
              optionalString(request.body?.mutexGroup),
              optionalString(request.body?.runningMode) || "manual",
              optionalString(request.body?.status) || "enabled",
              optionalString(request.body?.remark)
            ]
          );
        const actuatorId = getInsertId(insertResult);

        await connection.execute(
          `INSERT INTO iot_device_shadow
            (actuator_id, desired_state_json, reported_state_json, shadow_status, desired_updated_at, reported_updated_at, drift_seconds)
           VALUES (?, NULL, NULL, 'unknown', NULL, NULL, 0)`,
          [actuatorId]
        );

        await connection.commit();
        await logOperation(request, {
          moduleCode: "device_actuator",
          operationType: "create",
          targetType: "iot_actuators",
          targetId: actuatorId,
          requestParams: {
            actuatorCode: request.body?.actuatorCode,
            actuatorName: request.body?.actuatorName,
            actuatorType: request.body?.actuatorType
          },
          resultMessage: "创建执行器"
        });
        return ok({ insertId: actuatorId }, "执行器创建成功");
      } catch (error) {
        await connection.rollback();
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      } finally {
        connection.release();
      }
    }
  );

  app.put(
    "/api/v1/actuators/:id",
    {
      preHandler: [app.requirePermissions(["device:edit"])]
    },
    async (request, reply) => {
      try {
        const id = parseInteger(request.params.id);
        if (!id) {
          return fail(reply, 400, "无效的执行器ID");
        }
        const actuatorRows = await query(
          `SELECT area_id AS areaId
           FROM iot_actuators
           WHERE id = ?
           LIMIT 1`,
          [id]
        );
        const actuator = actuatorRows[0];
        if (!actuator) {
          return fail(reply, 404, "未找到执行器", "not_found");
        }
        await assertAreaAccess(request.auth, actuator.areaId, "没有操作该区域执行器的权限");
        const nextAreaId = parseInteger(request.body?.areaId);
        await assertAreaAccess(request.auth, nextAreaId, "没有将执行器调整到该区域的权限");
        await query(
          `UPDATE iot_actuators
           SET actuator_name = ?, actuator_type = ?, gateway_id = ?, area_id = ?, control_channel = ?,
               desired_state_text = ?, reported_state_text = ?, shadow_status = ?, max_run_seconds = ?,
               mutex_group = ?, running_mode = ?, status = ?, remark = ?
           WHERE id = ?`,
          [
            requiredString(request.body?.actuatorName, "actuatorName"),
            requiredString(request.body?.actuatorType, "actuatorType"),
            parseInteger(request.body?.gatewayId),
            nextAreaId,
            optionalString(request.body?.controlChannel),
            optionalString(request.body?.desiredStateText),
            optionalString(request.body?.reportedStateText),
            optionalString(request.body?.shadowStatus) || "unknown",
            parseInteger(request.body?.maxRunSeconds),
            optionalString(request.body?.mutexGroup),
            optionalString(request.body?.runningMode) || "manual",
            optionalString(request.body?.status) || "enabled",
            optionalString(request.body?.remark),
            id
          ]
        );
        await logOperation(request, {
          moduleCode: "device_actuator",
          operationType: "update",
          targetType: "iot_actuators",
          targetId: id,
          requestParams: {
            actuatorName: request.body?.actuatorName,
            actuatorType: request.body?.actuatorType,
            status: request.body?.status
          },
          resultMessage: "更新执行器"
        });
        return ok({ id }, "执行器更新成功");
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.delete(
    "/api/v1/actuators/:id",
    {
      preHandler: [app.requirePermissions(["device:delete"])]
    },
    async (request, reply) => {
      const id = parseInteger(request.params.id);
      if (!id) {
        return fail(reply, 400, "无效的执行器ID");
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [rawActuatorRows] = await connection.execute(
          `SELECT id, area_id AS areaId, actuator_code AS actuatorCode, actuator_name AS actuatorName
           FROM iot_actuators
           WHERE id = ?
           LIMIT 1`,
          [id]
        );
        const actuatorRows = asRowArray(rawActuatorRows);

        if (actuatorRows.length === 0) {
          await connection.rollback();
          return fail(reply, 404, "未找到执行器", "not_found");
        }
        await assertAreaAccess(request.auth, actuatorRows[0].areaId, "没有操作该区域执行器的权限");

        const [rawDependencyStatsRows] = await connection.query(
          `SELECT
             (SELECT COUNT(*) FROM ops_alerts WHERE actuator_id = ?) AS alertCount,
             (SELECT COUNT(*) FROM ops_control_commands WHERE actuator_id = ?) AS commandCount,
             (SELECT COUNT(*) FROM ops_control_executions WHERE actuator_id = ?) AS executionCount`,
          [id, id, id]
        );
        const dependencyStats = asRowArray(rawDependencyStatsRows)[0] || {};

        const dependencyPayload = normalizeDependencyPayload(dependencyStats);
        if (hasDependencies(dependencyPayload)) {
          await connection.rollback();
          return fail(reply, 409, buildDeleteConflictMessage("执行器", dependencyPayload), "conflict", dependencyPayload);
        }

        await connection.execute("DELETE FROM iot_device_shadow WHERE actuator_id = ?", [id]);
        await connection.execute("DELETE FROM iot_actuators WHERE id = ?", [id]);
        await connection.commit();

        await logOperation(request, {
          moduleCode: "device_actuator",
          operationType: "delete",
          targetType: "iot_actuators",
          targetId: id,
          requestParams: {
            actuatorCode: actuatorRows[0].actuatorCode,
            actuatorName: actuatorRows[0].actuatorName
          },
          resultMessage: "删除执行器"
        });

        return ok({ id, actuatorCode: actuatorRows[0].actuatorCode }, "执行器删除成功");
      } catch (error) {
        await connection.rollback();
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      } finally {
        connection.release();
      }
    }
  );

  app.get(
    "/api/v1/actuators/:id/shadow",
    {
      preHandler: [app.requireAnyPermissions([
        "device:view",
        "monitor:view",
        "actuator:control",
        "actuator:force_control",
        "actuator:emergency_stop"
      ])]
    },
    async (request, reply) => {
      const id = parseInteger(request.params.id);
      if (!id) {
        return fail(reply, 400, "无效的执行器ID");
      }

      const scopeFilter = buildAreaScopeFilter(request.auth, "a.area_id");
      const rows = await query(
        `SELECT
           ds.id,
           ds.actuator_id AS actuatorId,
           ds.desired_state_json AS desiredStateJson,
           ds.reported_state_json AS reportedStateJson,
           ds.shadow_status AS shadowStatus,
           ds.desired_updated_at AS desiredUpdatedAt,
           ds.reported_updated_at AS reportedUpdatedAt,
           ds.last_command_id AS lastCommandId,
           ds.last_command_result AS lastCommandResult,
           ds.drift_seconds AS driftSeconds,
           a.actuator_name AS actuatorName
         FROM iot_device_shadow ds
         JOIN iot_actuators a ON a.id = ds.actuator_id
         WHERE ds.actuator_id = ?
           ${scopeFilter.sql ? `AND ${scopeFilter.sql}` : ""}
         LIMIT 1`,
        [id, ...scopeFilter.params]
      );

      if (!rows[0]) {
        return fail(reply, 404, "未找到对应影子状态", "not_found");
      }

      return ok(rows[0]);
    }
  );

  app.get(
    "/api/v1/device-shadow",
    {
      preHandler: [app.requireAnyPermissions([
        "device:view",
        "monitor:view",
        "actuator:control",
        "actuator:force_control",
        "actuator:emergency_stop"
      ])]
    },
    async (request) => {
      const areaId = parseInteger(request.query?.areaId);
      const shadowStatus = String(request.query?.shadowStatus || "").trim();
      const onlineStatus = String(request.query?.onlineStatus || "").trim();

      const filters = [];
      const params = [];

      if (areaId) {
        filters.push("a.area_id = ?");
        params.push(areaId);
      }
      if (shadowStatus) {
        filters.push("ds.shadow_status = ?");
        params.push(shadowStatus);
      }
      if (onlineStatus) {
        filters.push("g.online_status = ?");
        params.push(onlineStatus);
      }
      appendTenantScope(filters, params, request.auth, "a.tenant_id");
      appendAreaScope(filters, params, request.auth, "a.area_id");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           ds.id,
           ds.actuator_id AS actuatorId,
           a.actuator_code AS actuatorCode,
           a.actuator_name AS actuatorName,
           a.actuator_type AS actuatorType,
           a.desired_state_text AS desiredStateText,
           a.reported_state_text AS reportedStateText,
           a.shadow_status AS actuatorShadowStatus,
           a.last_action_at AS lastActionAt,
           a.running_mode AS runningMode,
           a.status AS actuatorStatus,
           ds.desired_state_json AS desiredStateJson,
           ds.reported_state_json AS reportedStateJson,
           ds.shadow_status AS shadowStatus,
           ds.desired_updated_at AS desiredUpdatedAt,
           ds.reported_updated_at AS reportedUpdatedAt,
           ds.last_command_id AS lastCommandId,
           ds.last_command_result AS lastCommandResult,
           ds.drift_seconds AS driftSeconds,
           g.id AS gatewayId,
           g.gateway_code AS gatewayCode,
           g.gateway_name AS gatewayName,
           g.online_status AS onlineStatus,
           g.backfill_status AS backfillStatus,
           g.control_availability AS controlAvailability,
           ar.id AS areaId,
           ar.area_code AS areaCode,
           ar.area_name AS areaName,
           CASE
             WHEN ds.desired_updated_at IS NOT NULL AND ds.reported_updated_at IS NOT NULL
               THEN ABS(TIMESTAMPDIFF(SECOND, ds.desired_updated_at, ds.reported_updated_at))
             ELSE ds.drift_seconds
           END AS stateOffsetSeconds
         FROM iot_device_shadow ds
         JOIN iot_actuators a ON a.id = ds.actuator_id
         LEFT JOIN iot_gateways g ON g.id = a.gateway_id
         LEFT JOIN biz_areas ar ON ar.id = a.area_id
         ${whereClause}
         ORDER BY
           CASE ds.shadow_status
             WHEN 'drift' THEN 0
             WHEN 'pending' THEN 1
             WHEN 'unknown' THEN 2
             ELSE 3
           END ASC,
           ds.drift_seconds DESC,
           ds.id DESC`,
        params
      );

      return ok(rows);
    }
  );

  app.post(
    "/api/v1/device-shadow/:actuatorId/resync",
    {
      preHandler: [app.requirePermissions(["device:edit"])]
    },
    async (request, reply) => {
      const actuatorId = parseInteger(request.params.actuatorId);
      if (!actuatorId) {
        return fail(reply, 400, "无效的执行器ID");
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [rawShadowRows] = await connection.execute(
          `SELECT
             ds.id,
             ds.actuator_id AS actuatorId,
             a.actuator_name AS actuatorName,
             a.area_id AS areaId,
             ds.shadow_status AS shadowStatus
           FROM iot_device_shadow ds
           JOIN iot_actuators a ON a.id = ds.actuator_id
           WHERE ds.actuator_id = ?
           LIMIT 1`,
          [actuatorId]
        );
        const shadowRows = asRowArray(rawShadowRows);

        if (shadowRows.length === 0) {
          await connection.rollback();
          return fail(reply, 404, "未找到影子状态记录", "not_found");
        }
        await assertAreaAccess(request.auth, shadowRows[0].areaId, "没有操作该区域执行器影子状态的权限");

        await connection.execute(
          `UPDATE iot_device_shadow
           SET shadow_status = 'pending',
               desired_updated_at = NOW(),
               last_command_result = '已触发状态重同步',
               drift_seconds = 0
           WHERE actuator_id = ?`,
          [actuatorId]
        );

        await connection.execute(
          `UPDATE iot_actuators
           SET shadow_status = 'pending'
           WHERE id = ?`,
          [actuatorId]
        );

        await connection.commit();
        await logOperation(request, {
          moduleCode: "device_shadow",
          operationType: "resync",
          targetType: "iot_device_shadow",
          targetId: actuatorId,
          requestParams: {
            actuatorId,
            previousShadowStatus: shadowRows[0].shadowStatus
          },
          resultMessage: "触发设备影子重同步"
        });

        return ok(
          {
            actuatorId,
            actuatorName: shadowRows[0].actuatorName,
            shadowStatus: "pending"
          },
          "已触发影子状态重同步"
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

module.exports = deviceRoutes;

function normalizeDependencyPayload(stats = {}) {
  return Object.fromEntries(
    Object.entries(stats).map(([key, value]) => [key, Number(value || 0)])
  );
}

function hasDependencies(payload = {}) {
  return Object.values(payload).some((value) => Number(value || 0) > 0);
}

function buildDeleteConflictMessage(entityName, payload = {}) {
  const labels = {
    sensorCount: "传感器",
    actuatorCount: "执行器",
    readingCount: "历史读数",
    backfillCount: "补传批次",
    alertCount: "告警记录",
    commandCount: "控制指令",
    executionCount: "执行结果",
    channelCount: "通道配置"
  };

  const summary = Object.entries(payload)
    .filter(([, value]) => Number(value || 0) > 0)
    .map(([key, value]) => `${labels[key] || key}${value}条`)
    .join("、");

  return summary ? `${entityName}下仍存在${summary}，不能直接删除` : `${entityName}不能直接删除`;
}
