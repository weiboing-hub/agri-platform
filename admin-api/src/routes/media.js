// @ts-check

const path = require("path");
const { pool, query } = require("../lib/mysql");
const { ok, fail } = require("../lib/response");
const {
  parseInteger,
  requiredString,
  optionalString,
  normalizeEnabled
} = require("../lib/helpers");
const { parseBearerToken } = require("../lib/auth");
const { logOperation } = require("../lib/audit");
const { appendAreaScope, appendTenantScope, assertAreaAccess } = require("../lib/data-scope");
const { extractTenantId, hasTenantFoundation, resolveDefaultTenantId } = require("../lib/tenant-foundation");
const { assertTenantFeatureEnabled, assertTenantLimitAvailable } = require("../lib/tenant-entitlements");
const {
  assertCameraCaptureAvailable,
  createCameraCapture,
  generateNo,
  sqlDateTime,
  touchCameraOnline,
  getCameraContext,
  getCameraContextByCode
} = require("../lib/camera-capture");
const {
  assertCapturePlanPayload,
  computeNextTriggerAt,
  buildCapturePlanSummary,
  getCapturePlanContext
} = require("../lib/capture-plan");
const { resolveDeviceIngestCredentialByToken } = require("../lib/device-credentials");
const {
  loadMediaStorageConfig,
  loadTenantIdentity,
  resolveMediaUrl,
  buildSnapshotStoragePaths,
  extractUploadBasename,
  writeLocalMediaFile,
  deleteLocalMediaFile
} = require("../lib/media-storage");

async function mediaRoutes(app) {
  app.post("/api/v1/iot/camera-upload", async (request, reply) => handleCameraHttpUpload(request, reply));
  app.put("/api/v1/iot/camera-upload", async (request, reply) => handleCameraHttpUpload(request, reply));
  app.post("/api/v1/iot/camera-upload/:cameraCode", async (request, reply) => handleCameraHttpUpload(request, reply));
  app.put("/api/v1/iot/camera-upload/:cameraCode", async (request, reply) => handleCameraHttpUpload(request, reply));

  app.get(
    "/api/v1/media-nodes",
    {
      preHandler: [app.requireAnyPermissions(["device:view", "device:add", "device:edit", "device:delete"])]
    },
    async (request) => {
      const keyword = String(request.query?.keyword || "").trim();
      const status = String(request.query?.status || "").trim();
      const filters = [];
      const params = [];

      if (keyword) {
        filters.push("(node_name LIKE ? OR node_code LIKE ? OR host_address LIKE ?)");
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }
      if (status) {
        filters.push("status = ?");
        params.push(status);
      }
      appendTenantScope(filters, params, request.auth, "tenant_id");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           id,
           node_code AS nodeCode,
           node_name AS nodeName,
           node_type AS nodeType,
           host_address AS hostAddress,
           api_base_url AS apiBaseUrl,
           rtmp_base_url AS rtmpBaseUrl,
           hls_base_url AS hlsBaseUrl,
           ftp_root_path AS ftpRootPath,
           status,
           health_status AS healthStatus,
           last_heartbeat_at AS lastHeartbeatAt,
           remark,
           created_at AS createdAt,
           updated_at AS updatedAt
         FROM iot_media_nodes
         ${whereClause}
         ORDER BY id DESC`,
        params
      );

      return ok(rows);
    }
  );

  app.post(
    "/api/v1/media-nodes",
    {
      preHandler: [app.requirePermissions(["device:add"])]
    },
    async (request, reply) => {
      try {
        const nodeCode = requiredString(request.body?.nodeCode, "nodeCode");
        const nodeName = requiredString(request.body?.nodeName, "nodeName");
        const nodeType = requiredString(request.body?.nodeType, "nodeType");
        const hostAddress = requiredString(request.body?.hostAddress, "hostAddress");
        const currentTenantId = extractTenantId(request.auth);
        if (currentTenantId) {
          await assertTenantFeatureEnabled(pool, {
            tenantId: currentTenantId,
            featureKey: "enable_media",
            message: "当前租户未启用媒体能力，不能创建媒体节点"
          });
        }

        const result = currentTenantId
          ? await query(
            `INSERT INTO iot_media_nodes
              (tenant_id, node_code, node_name, node_type, host_address, api_base_url, rtmp_base_url, hls_base_url,
               ftp_root_path, status, health_status, remark)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              currentTenantId,
              nodeCode,
              nodeName,
              nodeType,
              hostAddress,
              optionalString(request.body?.apiBaseUrl),
              optionalString(request.body?.rtmpBaseUrl),
              optionalString(request.body?.hlsBaseUrl),
              optionalString(request.body?.ftpRootPath),
              optionalString(request.body?.status) || "enabled",
              optionalString(request.body?.healthStatus) || "unknown",
              optionalString(request.body?.remark)
            ]
          )
          : await query(
            `INSERT INTO iot_media_nodes
              (node_code, node_name, node_type, host_address, api_base_url, rtmp_base_url, hls_base_url,
               ftp_root_path, status, health_status, remark)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              nodeCode,
              nodeName,
              nodeType,
              hostAddress,
              optionalString(request.body?.apiBaseUrl),
              optionalString(request.body?.rtmpBaseUrl),
              optionalString(request.body?.hlsBaseUrl),
              optionalString(request.body?.ftpRootPath),
              optionalString(request.body?.status) || "enabled",
              optionalString(request.body?.healthStatus) || "unknown",
              optionalString(request.body?.remark)
            ]
          );

        await logOperation(request, {
          moduleCode: "media_node",
          operationType: "create",
          targetType: "iot_media_nodes",
          targetId: result.insertId,
          requestParams: {
            nodeCode,
            nodeName,
            nodeType,
            hostAddress
          },
          resultMessage: "创建媒体节点"
        });

        return ok({ insertId: result.insertId }, "媒体节点创建成功");
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.put(
    "/api/v1/media-nodes/:id",
    {
      preHandler: [app.requirePermissions(["device:edit"])]
    },
    async (request, reply) => {
      try {
        const id = parseInteger(request.params.id);
        if (!id) {
          return fail(reply, 400, "无效的媒体节点ID");
        }

        await query(
          `UPDATE iot_media_nodes
           SET node_name = ?, node_type = ?, host_address = ?, api_base_url = ?, rtmp_base_url = ?, hls_base_url = ?,
               ftp_root_path = ?, status = ?, health_status = ?, remark = ?
           WHERE id = ?`,
          [
            requiredString(request.body?.nodeName, "nodeName"),
            requiredString(request.body?.nodeType, "nodeType"),
            requiredString(request.body?.hostAddress, "hostAddress"),
            optionalString(request.body?.apiBaseUrl),
            optionalString(request.body?.rtmpBaseUrl),
            optionalString(request.body?.hlsBaseUrl),
            optionalString(request.body?.ftpRootPath),
            optionalString(request.body?.status) || "enabled",
            optionalString(request.body?.healthStatus) || "unknown",
            optionalString(request.body?.remark),
            id
          ]
        );

        await logOperation(request, {
          moduleCode: "media_node",
          operationType: "update",
          targetType: "iot_media_nodes",
          targetId: id,
          requestParams: {
            nodeName: request.body?.nodeName,
            nodeType: request.body?.nodeType,
            hostAddress: request.body?.hostAddress
          },
          resultMessage: "更新媒体节点"
        });

        return ok({ id }, "媒体节点更新成功");
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.delete(
    "/api/v1/media-nodes/:id",
    {
      preHandler: [app.requirePermissions(["device:delete"])]
    },
    async (request, reply) => {
      const id = parseInteger(request.params.id);
      if (!id) {
        return fail(reply, 400, "无效的媒体节点ID");
      }

      const rows = await query(
        `SELECT id, node_code AS nodeCode, node_name AS nodeName
         FROM iot_media_nodes
         WHERE id = ?
         LIMIT 1`,
        [id]
      );

      const node = rows[0];
      if (!node) {
        return fail(reply, 404, "未找到媒体节点", "not_found");
      }

      const dependencyRows = await query(
        `SELECT COUNT(*) AS cameraCount
         FROM iot_cameras
         WHERE media_node_id = ?`,
        [id]
      );
      const cameraCount = Number(dependencyRows[0]?.cameraCount || 0);
      if (cameraCount > 0) {
        return fail(reply, 409, "当前媒体节点下仍绑定摄像头，不能直接删除", "conflict", {
          cameraCount
        });
      }

      await query("DELETE FROM iot_media_nodes WHERE id = ?", [id]);
      await logOperation(request, {
        moduleCode: "media_node",
        operationType: "delete",
        targetType: "iot_media_nodes",
        targetId: id,
        requestParams: {
          nodeCode: node.nodeCode,
          nodeName: node.nodeName
        },
        resultMessage: "删除媒体节点"
      });

      return ok({ id, nodeCode: node.nodeCode }, "媒体节点删除成功");
    }
  );

  app.get(
    "/api/v1/media-node-options",
    {
      preHandler: [app.requireAnyPermissions(["device:view", "device:add", "device:edit", "device:delete"])]
    },
    async (request) => {
      const filters = [];
      const params = [];
      appendTenantScope(filters, params, request.auth, "tenant_id");
      const whereClause = filters.length ? `AND ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           id,
           node_code AS nodeCode,
           node_name AS nodeName,
           node_type AS nodeType,
           health_status AS healthStatus,
           status
         FROM iot_media_nodes
         WHERE status = 'enabled'
           ${whereClause}
         ORDER BY node_name ASC, id ASC`
        ,
        params
      );

      return ok(rows);
    }
  );

  app.get(
    "/api/v1/cameras",
    {
      preHandler: [app.requireAnyPermissions(["device:view", "device:add", "device:edit", "device:delete"])]
    },
    async (request) => {
      const keyword = String(request.query?.keyword || "").trim();
      const areaId = parseInteger(request.query?.areaId);
      const gatewayId = parseInteger(request.query?.gatewayId);
      const onlineStatus = String(request.query?.onlineStatus || "").trim();
      const filters = [];
      const params = [];

      if (keyword) {
        filters.push("(c.camera_name LIKE ? OR c.camera_code LIKE ? OR c.ip_address LIKE ?)");
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }
      if (areaId) {
        filters.push("c.area_id = ?");
        params.push(areaId);
      }
      if (gatewayId) {
        filters.push("c.gateway_id = ?");
        params.push(gatewayId);
      }
      if (onlineStatus) {
        filters.push("c.online_status = ?");
        params.push(onlineStatus);
      }
      appendTenantScope(filters, params, request.auth, "c.tenant_id");
      appendAreaScope(filters, params, request.auth, "c.area_id");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           c.id,
           c.camera_code AS cameraCode,
           c.camera_name AS cameraName,
           c.camera_type AS cameraType,
           c.vendor_name AS vendorName,
           c.model_name AS modelName,
           c.serial_no AS serialNo,
           c.gateway_id AS gatewayId,
           c.area_id AS areaId,
           c.media_node_id AS mediaNodeId,
           c.ip_address AS ipAddress,
           c.mac_address AS macAddress,
           c.wifi_ssid AS wifiSsid,
           c.install_position AS installPosition,
           c.orientation_text AS orientationText,
           c.capture_mode AS captureMode,
           c.stream_protocol AS streamProtocol,
           c.online_status AS onlineStatus,
           c.last_online_at AS lastOnlineAt,
           c.snapshot_enabled AS snapshotEnabled,
           c.record_enabled AS recordEnabled,
           c.status,
           c.remark,
           a.area_name AS areaName,
           g.gateway_name AS gatewayName,
           m.node_name AS mediaNodeName,
           s.source_url AS sourceUrl,
           s.target_url AS targetUrl,
           s.stream_username AS streamUsername
         FROM iot_cameras c
         LEFT JOIN biz_areas a ON a.id = c.area_id
         LEFT JOIN iot_gateways g ON g.id = c.gateway_id
         LEFT JOIN iot_media_nodes m ON m.id = c.media_node_id
         LEFT JOIN iot_camera_streams s ON s.camera_id = c.id AND s.stream_role = 'main'
         ${whereClause}
         ORDER BY c.id DESC`,
        params
      );

      return ok(
        rows.map((row) => ({
          ...row,
          snapshotEnabled: Boolean(row.snapshotEnabled),
          recordEnabled: Boolean(row.recordEnabled)
        }))
      );
    }
  );

  app.post(
    "/api/v1/cameras",
    {
      preHandler: [app.requirePermissions(["device:add"])]
    },
    async (request, reply) => {
      try {
        const cameraCode = requiredString(request.body?.cameraCode, "cameraCode");
        const cameraName = requiredString(request.body?.cameraName, "cameraName");
        const cameraType = requiredString(request.body?.cameraType, "cameraType");
        const areaId = parseInteger(request.body?.areaId);
        const gatewayId = parseInteger(request.body?.gatewayId);
        const mediaNodeId = parseInteger(request.body?.mediaNodeId);
        const streamName = optionalString(request.body?.streamName) || "主码流";
        const streamRole = optionalString(request.body?.streamRole) || "main";
        const currentTenantId = extractTenantId(request.auth);
        await assertAreaAccess(request.auth, areaId, "没有在该区域创建摄像头的权限");
        if (currentTenantId) {
          await assertTenantFeatureEnabled(pool, {
            tenantId: currentTenantId,
            featureKey: "enable_media",
            message: "当前租户未启用媒体能力，不能创建摄像头"
          });
          await assertTenantLimitAvailable(pool, {
            tenantId: currentTenantId,
            limitKey: "max_cameras",
            increment: 1,
            message: "当前租户已达到摄像头数量上限，请升级套餐或调整租户配额"
          });
        }

        const result = currentTenantId
          ? await query(
            `INSERT INTO iot_cameras
              (tenant_id, camera_code, camera_name, camera_type, vendor_name, model_name, serial_no, gateway_id, area_id, media_node_id,
               ip_address, mac_address, wifi_ssid, install_position, orientation_text, capture_mode, stream_protocol,
               online_status, snapshot_enabled, record_enabled, status, remark)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offline', ?, ?, ?, ?)`,
            [
              currentTenantId,
              cameraCode,
              cameraName,
              cameraType,
              optionalString(request.body?.vendorName),
              optionalString(request.body?.modelName),
              optionalString(request.body?.serialNo),
              gatewayId,
              areaId,
              mediaNodeId,
              optionalString(request.body?.ipAddress),
              optionalString(request.body?.macAddress),
              optionalString(request.body?.wifiSsid),
              optionalString(request.body?.installPosition),
              optionalString(request.body?.orientationText),
              optionalString(request.body?.captureMode) || "manual",
              optionalString(request.body?.streamProtocol) || "rtsp",
              normalizeEnabled(request.body?.snapshotEnabled, true) ? 1 : 0,
              normalizeEnabled(request.body?.recordEnabled, false) ? 1 : 0,
              optionalString(request.body?.status) || "enabled",
              optionalString(request.body?.remark)
            ]
          )
          : await query(
            `INSERT INTO iot_cameras
              (camera_code, camera_name, camera_type, vendor_name, model_name, serial_no, gateway_id, area_id, media_node_id,
               ip_address, mac_address, wifi_ssid, install_position, orientation_text, capture_mode, stream_protocol,
               online_status, snapshot_enabled, record_enabled, status, remark)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offline', ?, ?, ?, ?)`,
            [
              cameraCode,
              cameraName,
              cameraType,
              optionalString(request.body?.vendorName),
              optionalString(request.body?.modelName),
              optionalString(request.body?.serialNo),
              gatewayId,
              areaId,
              mediaNodeId,
              optionalString(request.body?.ipAddress),
              optionalString(request.body?.macAddress),
              optionalString(request.body?.wifiSsid),
              optionalString(request.body?.installPosition),
              optionalString(request.body?.orientationText),
              optionalString(request.body?.captureMode) || "manual",
              optionalString(request.body?.streamProtocol) || "rtsp",
              normalizeEnabled(request.body?.snapshotEnabled, true) ? 1 : 0,
              normalizeEnabled(request.body?.recordEnabled, false) ? 1 : 0,
              optionalString(request.body?.status) || "enabled",
              optionalString(request.body?.remark)
            ]
          );

        await ensureMainCameraStream(result.insertId, request.body, {
          streamName,
          streamRole
        });

        await logOperation(request, {
          moduleCode: "device_camera",
          operationType: "create",
          targetType: "iot_cameras",
          targetId: result.insertId,
          requestParams: {
            cameraCode,
            cameraName,
            cameraType,
            gatewayId,
            areaId
          },
          resultMessage: "创建摄像头"
        });

        return ok({ insertId: result.insertId }, "摄像头创建成功");
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.put(
    "/api/v1/cameras/:id",
    {
      preHandler: [app.requirePermissions(["device:edit"])]
    },
    async (request, reply) => {
      try {
        const id = parseInteger(request.params.id);
        if (!id) {
          return fail(reply, 400, "无效的摄像头ID");
        }
        const camera = await getCameraContext(id);
        if (!camera) {
          return fail(reply, 404, "未找到摄像头", "not_found");
        }
        await assertAreaAccess(request.auth, camera.areaId, "没有操作该区域摄像头的权限");
        const nextAreaId = parseInteger(request.body?.areaId);
        await assertAreaAccess(request.auth, nextAreaId, "没有将摄像头调整到该区域的权限");

        await query(
          `UPDATE iot_cameras
           SET camera_name = ?, camera_type = ?, vendor_name = ?, model_name = ?, serial_no = ?, gateway_id = ?, area_id = ?,
               media_node_id = ?, ip_address = ?, mac_address = ?, wifi_ssid = ?, install_position = ?, orientation_text = ?,
               capture_mode = ?, stream_protocol = ?, snapshot_enabled = ?, record_enabled = ?, status = ?, remark = ?
           WHERE id = ?`,
          [
            requiredString(request.body?.cameraName, "cameraName"),
            requiredString(request.body?.cameraType, "cameraType"),
            optionalString(request.body?.vendorName),
            optionalString(request.body?.modelName),
            optionalString(request.body?.serialNo),
            parseInteger(request.body?.gatewayId),
            nextAreaId,
            parseInteger(request.body?.mediaNodeId),
            optionalString(request.body?.ipAddress),
            optionalString(request.body?.macAddress),
            optionalString(request.body?.wifiSsid),
            optionalString(request.body?.installPosition),
            optionalString(request.body?.orientationText),
            optionalString(request.body?.captureMode) || "manual",
            optionalString(request.body?.streamProtocol) || "rtsp",
            normalizeEnabled(request.body?.snapshotEnabled, true) ? 1 : 0,
            normalizeEnabled(request.body?.recordEnabled, false) ? 1 : 0,
            optionalString(request.body?.status) || "enabled",
            optionalString(request.body?.remark),
            id
          ]
        );

        await ensureMainCameraStream(id, request.body, {
          streamName: optionalString(request.body?.streamName) || "主码流",
          streamRole: optionalString(request.body?.streamRole) || "main"
        });

        await logOperation(request, {
          moduleCode: "device_camera",
          operationType: "update",
          targetType: "iot_cameras",
          targetId: id,
          requestParams: {
            cameraName: request.body?.cameraName,
            cameraType: request.body?.cameraType,
            gatewayId: request.body?.gatewayId,
            mediaNodeId: request.body?.mediaNodeId
          },
          resultMessage: "更新摄像头"
        });

        return ok({ id }, "摄像头更新成功");
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.delete(
    "/api/v1/cameras/:id",
    {
      preHandler: [app.requirePermissions(["device:delete"])]
    },
    async (request, reply) => {
      const id = parseInteger(request.params.id);
      if (!id) {
        return fail(reply, 400, "无效的摄像头ID");
      }

      const rows = await query(
        `SELECT id, camera_code AS cameraCode, camera_name AS cameraName
         FROM iot_cameras
         WHERE id = ?
         LIMIT 1`,
        [id]
      );
      const camera = rows[0];
      if (!camera) {
        return fail(reply, 404, "未找到摄像头", "not_found");
      }
      const cameraContext = await getCameraContext(id);
      await assertAreaAccess(request.auth, cameraContext?.areaId, "没有操作该区域摄像头的权限");

      const dependencyRows = await query(
        `SELECT
           (SELECT COUNT(*) FROM iot_camera_capture_jobs WHERE camera_id = ?) AS jobCount,
           (SELECT COUNT(*) FROM iot_camera_snapshots WHERE camera_id = ?) AS snapshotCount,
           (SELECT COUNT(*) FROM iot_camera_recordings WHERE camera_id = ?) AS recordingCount`,
        [id, id, id]
      );

      const dependency = dependencyRows[0] || {};
      if (
        Number(dependency.jobCount || 0) > 0 ||
        Number(dependency.snapshotCount || 0) > 0 ||
        Number(dependency.recordingCount || 0) > 0
      ) {
        return fail(reply, 409, "当前摄像头下仍存在抓图或录像数据，不能直接删除", "conflict", {
          jobCount: Number(dependency.jobCount || 0),
          snapshotCount: Number(dependency.snapshotCount || 0),
          recordingCount: Number(dependency.recordingCount || 0)
        });
      }

      await query("DELETE FROM iot_camera_streams WHERE camera_id = ?", [id]);
      await query("DELETE FROM iot_cameras WHERE id = ?", [id]);

      await logOperation(request, {
        moduleCode: "device_camera",
        operationType: "delete",
        targetType: "iot_cameras",
        targetId: id,
        requestParams: {
          cameraCode: camera.cameraCode,
          cameraName: camera.cameraName
        },
        resultMessage: "删除摄像头"
      });

      return ok({ id, cameraCode: camera.cameraCode }, "摄像头删除成功");
    }
  );

  app.get(
    "/api/v1/capture-plans",
    {
      preHandler: [app.requireAnyPermissions(["device:view", "device:edit", "history:view"])]
    },
    async (request) => {
      const keyword = String(request.query?.keyword || "").trim();
      const cameraId = parseInteger(request.query?.cameraId);
      const status = String(request.query?.status || "").trim();
      const scheduleType = String(request.query?.scheduleType || "").trim();
      const filters = [];
      const params = [];

      if (keyword) {
        filters.push("(p.plan_no LIKE ? OR p.plan_name LIKE ? OR c.camera_name LIKE ? OR c.camera_code LIKE ?)");
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }
      if (cameraId) {
        filters.push("p.camera_id = ?");
        params.push(cameraId);
      }
      if (status) {
        filters.push("p.status = ?");
        params.push(status);
      }
      if (scheduleType) {
        filters.push("p.schedule_type = ?");
        params.push(scheduleType);
      }
      appendTenantScope(filters, params, request.auth, "p.tenant_id");
      appendAreaScope(filters, params, request.auth, "c.area_id");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           p.id,
           p.plan_no AS planNo,
           p.camera_id AS cameraId,
           p.plan_name AS planName,
           p.schedule_type AS scheduleType,
           p.interval_minutes AS intervalMinutes,
           p.daily_time AS dailyTime,
           p.capture_purpose AS capturePurpose,
           p.status,
           p.next_trigger_at AS nextTriggerAt,
           p.last_triggered_at AS lastTriggeredAt,
           p.last_success_at AS lastSuccessAt,
           p.last_failure_at AS lastFailureAt,
           p.last_job_id AS lastJobId,
           p.last_snapshot_id AS lastSnapshotId,
           p.last_error_message AS lastErrorMessage,
           p.remark,
           p.created_by AS createdBy,
           p.created_at AS createdAt,
           p.updated_at AS updatedAt,
           c.camera_code AS cameraCode,
           c.camera_name AS cameraName,
           a.area_name AS areaName,
           u.real_name AS createdByName
         FROM iot_camera_capture_plans p
         INNER JOIN iot_cameras c ON c.id = p.camera_id
         LEFT JOIN biz_areas a ON a.id = c.area_id
         LEFT JOIN sys_users u ON u.id = p.created_by
         ${whereClause}
         ORDER BY p.id DESC`,
        params
      );

      return ok(
        rows.map((row) => ({
          ...row,
          scheduleSummary: buildCapturePlanSummary(row)
        }))
      );
    }
  );

  app.get(
    "/api/v1/capture-plans/:id",
    {
      preHandler: [app.requireAnyPermissions(["device:view", "device:edit"])]
    },
    async (request, reply) => {
      const planId = parseInteger(request.params?.id);
      if (!planId) {
        return fail(reply, 400, "无效的抓图计划ID", "bad_request");
      }

      const plan = await getCapturePlanContext(planId);
      if (!plan) {
        return fail(reply, 404, "未找到抓图计划", "not_found");
      }

      const planAreaId = parseInteger(plan.areaId);
      if (!planAreaId) {
        return fail(reply, 400, "抓图计划缺少有效区域信息", "bad_request");
      }

      await assertAreaAccess(request.auth, planAreaId, "没有查看该区域抓图计划的权限");
      return ok({
        ...plan,
        scheduleSummary: buildCapturePlanSummary(plan)
      });
    }
  );

  app.post(
    "/api/v1/capture-plans",
    {
      preHandler: [app.requirePermissions(["device:edit"])]
    },
    async (request, reply) => {
      try {
        const cameraId = parseInteger(request.body?.cameraId);
        if (!cameraId) {
          return fail(reply, 400, "无效的摄像头ID");
        }

        const camera = await getCameraContext(cameraId);
        if (!camera) {
          return fail(reply, 404, "未找到摄像头", "not_found");
        }
        await assertAreaAccess(request.auth, camera.areaId, "没有为该区域摄像头创建抓图计划的权限");
        if (camera.tenantId) {
          await assertTenantFeatureEnabled(pool, {
            tenantId: camera.tenantId,
            featureKey: "enable_media",
            message: "当前租户未启用媒体能力，不能创建抓图计划"
          });
        }

        const payload = assertCapturePlanPayload(request.body);
        const status = optionalString(request.body?.status) || "enabled";
        const nextTriggerAt = status === "enabled" ? computeNextTriggerAt(payload) : null;
        const planNo = generateNo("CPL");
        const result = await query(
          `INSERT INTO iot_camera_capture_plans
            (plan_no, tenant_id, camera_id, plan_name, schedule_type, interval_minutes, daily_time, capture_purpose, status,
             next_trigger_at, remark, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            planNo,
            camera.tenantId,
            cameraId,
            requiredString(request.body?.planName, "planName"),
            payload.scheduleType,
            payload.intervalMinutes,
            payload.dailyTime,
            optionalString(request.body?.capturePurpose) || "preview",
            status,
            nextTriggerAt,
            optionalString(request.body?.remark),
            request.auth?.user?.id || null
          ]
        );

        await logOperation(request, {
          moduleCode: "camera_capture_plan",
          operationType: "create",
          targetType: "iot_camera_capture_plans",
          targetId: result.insertId,
          requestParams: {
            cameraId,
            cameraCode: camera.cameraCode,
            planNo,
            scheduleType: payload.scheduleType
          },
          resultMessage: "创建抓图计划"
        });

        return ok({ id: result.insertId, planNo }, "抓图计划创建成功");
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.put(
    "/api/v1/capture-plans/:id",
    {
      preHandler: [app.requirePermissions(["device:edit"])]
    },
    async (request, reply) => {
      try {
        const planId = parseInteger(request.params.id);
        if (!planId) {
          return fail(reply, 400, "无效的抓图计划ID");
        }

        const existingPlan = await getCapturePlanContext(planId);
        if (!existingPlan) {
          return fail(reply, 404, "未找到抓图计划", "not_found");
        }

        const cameraId = parseInteger(request.body?.cameraId) || existingPlan.cameraId;
        const camera = await getCameraContext(cameraId);
        if (!camera) {
          return fail(reply, 404, "未找到摄像头", "not_found");
        }
        await assertAreaAccess(request.auth, camera.areaId, "没有编辑该区域抓图计划的权限");
        if (camera.tenantId) {
          await assertTenantFeatureEnabled(pool, {
            tenantId: camera.tenantId,
            featureKey: "enable_media",
            message: "当前租户未启用媒体能力，不能编辑抓图计划"
          });
        }

        const payload = assertCapturePlanPayload(request.body);
        const status = optionalString(request.body?.status) || existingPlan.status || "enabled";
        const nextTriggerAt = status === "enabled" ? computeNextTriggerAt(payload) : null;

        await query(
          `UPDATE iot_camera_capture_plans
           SET camera_id = ?, plan_name = ?, schedule_type = ?, interval_minutes = ?, daily_time = ?, capture_purpose = ?,
               status = ?, next_trigger_at = ?, last_error_message = NULL, remark = ?
           WHERE id = ?`,
          [
            cameraId,
            requiredString(request.body?.planName, "planName"),
            payload.scheduleType,
            payload.intervalMinutes,
            payload.dailyTime,
            optionalString(request.body?.capturePurpose) || "preview",
            status,
            nextTriggerAt,
            optionalString(request.body?.remark),
            planId
          ]
        );

        await logOperation(request, {
          moduleCode: "camera_capture_plan",
          operationType: "update",
          targetType: "iot_camera_capture_plans",
          targetId: planId,
          requestParams: {
            cameraId,
            cameraCode: camera.cameraCode,
            scheduleType: payload.scheduleType
          },
          resultMessage: "更新抓图计划"
        });

        return ok({ id: planId }, "抓图计划更新成功");
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.post(
    "/api/v1/capture-plans/:id/run",
    {
      preHandler: [app.requirePermissions(["device:edit"])]
    },
    async (request, reply) => {
      try {
        const planId = parseInteger(request.params.id);
        if (!planId) {
          return fail(reply, 400, "无效的抓图计划ID");
        }

        const plan = await getCapturePlanContext(planId);
        if (!plan) {
          return fail(reply, 404, "未找到抓图计划", "not_found");
        }
        const planAreaId = parseInteger(plan.areaId);
        if (!planAreaId) {
          return fail(reply, 400, "抓图计划缺少有效区域信息");
        }
        await assertAreaAccess(request.auth, planAreaId, "没有执行该区域抓图计划的权限");

        const result = await createCameraCapture({
          cameraId: plan.cameraId,
          triggerType: "schedule",
          triggerSourceType: "capture_plan",
          triggerSourceId: planId,
          capturePurpose: plan.capturePurpose,
          remark: plan.remark,
          executionMode: "manual_plan_run",
          createdBy: request.auth?.user?.id || null
        });
        const now = sqlDateTime();

        await query(
          `UPDATE iot_camera_capture_plans
           SET last_job_id = ?, last_snapshot_id = ?, last_triggered_at = ?, last_success_at = ?, last_error_message = NULL
           WHERE id = ?`,
          [result.jobId, result.snapshotId, now, now, planId]
        );

        await logOperation(request, {
          moduleCode: "camera_capture_plan",
          operationType: "execute",
          targetType: "iot_camera_capture_plans",
          targetId: planId,
          requestParams: {
            planNo: plan.planNo,
            cameraId: plan.cameraId,
            cameraCode: plan.cameraCode
          },
          resultMessage: "立即执行抓图计划"
        });

        return ok(
          {
            planId,
            jobId: result.jobId,
            jobNo: result.jobNo,
            snapshotId: result.snapshotId,
            snapshotNo: result.snapshotNo
          },
          "抓图计划已立即执行"
        );
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.delete(
    "/api/v1/capture-plans/:id",
    {
      preHandler: [app.requirePermissions(["device:edit"])]
    },
    async (request, reply) => {
      const planId = parseInteger(request.params.id);
      if (!planId) {
        return fail(reply, 400, "无效的抓图计划ID");
      }

      const plan = await getCapturePlanContext(planId);
      if (!plan) {
        return fail(reply, 404, "未找到抓图计划", "not_found");
      }
      const planAreaId = parseInteger(plan.areaId);
      if (!planAreaId) {
        return fail(reply, 400, "抓图计划缺少有效区域信息");
      }
      await assertAreaAccess(request.auth, planAreaId, "没有删除该区域抓图计划的权限");

      await query("DELETE FROM iot_camera_capture_plans WHERE id = ?", [planId]);
      await logOperation(request, {
        moduleCode: "camera_capture_plan",
        operationType: "delete",
        targetType: "iot_camera_capture_plans",
        targetId: planId,
        requestParams: {
          planNo: plan.planNo,
          cameraId: plan.cameraId,
          cameraCode: plan.cameraCode
        },
        resultMessage: "删除抓图计划"
      });

      return ok({ id: planId, planNo: plan.planNo }, "抓图计划删除成功");
    }
  );

  app.get(
    "/api/v1/capture-jobs",
    {
      preHandler: [app.requireAnyPermissions(["device:view", "device:edit", "history:view"])]
    },
    async (request) => {
      const keyword = String(request.query?.keyword || "").trim();
      const cameraId = parseInteger(request.query?.cameraId);
      const status = String(request.query?.status || "").trim();
      const triggerType = String(request.query?.triggerType || "").trim();
      const limit = clampLimit(parseInteger(request.query?.limit, 50), 100);
      const filters = [];
      const params = [];

      if (keyword) {
        filters.push("(j.job_no LIKE ? OR c.camera_name LIKE ? OR c.camera_code LIKE ?)");
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }
      if (cameraId) {
        filters.push("j.camera_id = ?");
        params.push(cameraId);
      }
      if (status) {
        filters.push("j.status = ?");
        params.push(status);
      }
      if (triggerType) {
        filters.push("j.trigger_type = ?");
        params.push(triggerType);
      }
      appendTenantScope(filters, params, request.auth, "j.tenant_id");
      appendAreaScope(filters, params, request.auth, "c.area_id");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           j.id,
           j.job_no AS jobNo,
           j.camera_id AS cameraId,
           j.trigger_type AS triggerType,
           j.trigger_source_type AS triggerSourceType,
           j.trigger_source_id AS triggerSourceId,
           j.capture_purpose AS capturePurpose,
           j.status,
           j.scheduled_at AS scheduledAt,
           j.started_at AS startedAt,
           j.finished_at AS finishedAt,
           j.retry_count AS retryCount,
           j.error_message AS errorMessage,
           j.request_params_json AS requestParamsJson,
           j.created_by AS createdBy,
           j.created_at AS createdAt,
           c.camera_code AS cameraCode,
           c.camera_name AS cameraName,
           a.area_name AS areaName,
           u.real_name AS createdByName
         FROM iot_camera_capture_jobs j
         INNER JOIN iot_cameras c ON c.id = j.camera_id
         LEFT JOIN biz_areas a ON a.id = c.area_id
         LEFT JOIN sys_users u ON u.id = j.created_by
         ${whereClause}
         ORDER BY j.id DESC
         LIMIT ${limit}`,
        params
      );

      return ok(rows);
    }
  );

  app.post(
    "/api/v1/cameras/:id/capture",
    {
      preHandler: [app.requirePermissions(["device:edit"])]
    },
    async (request, reply) => {
      try {
        const cameraId = parseInteger(request.params.id);
        if (!cameraId) {
          return fail(reply, 400, "无效的摄像头ID");
        }

        const camera = await getCameraContext(cameraId);
        if (!camera) {
          return fail(reply, 404, "未找到摄像头", "not_found");
        }
        await assertAreaAccess(request.auth, camera.areaId, "没有操作该区域摄像头的权限");
        const capturePurpose = optionalString(request.body?.capturePurpose) || "preview";
        const result = await createCameraCapture({
          camera,
          cameraId,
          triggerType: optionalString(request.body?.triggerType) || "manual",
          triggerSourceType: optionalString(request.body?.triggerSourceType) || "user",
          triggerSourceId: parseInteger(request.body?.triggerSourceId),
          capturePurpose,
          remark: optionalString(request.body?.remark),
          createdBy: request.auth?.user?.id || null,
          executionMode: "manual"
        });
        await logOperation(request, {
          moduleCode: "camera_capture",
          operationType: "create",
          targetType: "iot_camera_capture_jobs",
          targetId: result.jobId,
          requestParams: {
            cameraId,
            cameraCode: camera.cameraCode,
            capturePurpose
          },
          resultMessage: "手动创建抓图任务"
        });

        return ok(
          {
            jobId: result.jobId,
            jobNo: result.jobNo,
            snapshotId: result.snapshotId,
            snapshotNo: result.snapshotNo
          },
          "抓图任务创建成功"
        );
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.get(
    "/api/v1/snapshots",
    {
      preHandler: [app.requireAnyPermissions(["history:view", "device:view"])]
    },
    async (request) => {
      const keyword = String(request.query?.keyword || "").trim();
      const cameraId = parseInteger(request.query?.cameraId);
      const areaId = parseInteger(request.query?.areaId);
      const sourceType = String(request.query?.sourceType || "").trim();
      const dateFrom = optionalString(request.query?.dateFrom);
      const dateTo = optionalString(request.query?.dateTo);
      const limit = clampLimit(parseInteger(request.query?.limit, 60), 200);
      const filters = [];
      const params = [];

      if (keyword) {
        filters.push("(s.snapshot_no LIKE ? OR c.camera_name LIKE ? OR c.camera_code LIKE ? OR s.file_path LIKE ?)");
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }
      if (cameraId) {
        filters.push("s.camera_id = ?");
        params.push(cameraId);
      }
      if (areaId) {
        filters.push("s.area_id = ?");
        params.push(areaId);
      }
      if (sourceType) {
        filters.push("s.source_type = ?");
        params.push(sourceType);
      }
      if (dateFrom) {
        filters.push("s.captured_at >= ?");
        params.push(dateFrom);
      }
      if (dateTo) {
        filters.push("s.captured_at <= ?");
        params.push(dateTo);
      }
      appendTenantScope(filters, params, request.auth, "s.tenant_id");
      appendAreaScope(filters, params, request.auth, "s.area_id");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           s.id,
           s.snapshot_no AS snapshotNo,
           s.camera_id AS cameraId,
           s.capture_job_id AS captureJobId,
           s.area_id AS areaId,
           s.gateway_id AS gatewayId,
           s.source_type AS sourceType,
           s.captured_at AS capturedAt,
           s.received_at AS receivedAt,
           s.storage_provider AS storageProvider,
           s.bucket_name AS bucketName,
           s.object_key AS objectKey,
           s.file_path AS filePath,
           s.file_size_bytes AS fileSizeBytes,
           s.mime_type AS mimeType,
           s.image_width AS imageWidth,
           s.image_height AS imageHeight,
           s.ftp_path AS ftpPath,
           s.thumbnail_path AS thumbnailPath,
           s.remark,
           c.camera_code AS cameraCode,
           c.camera_name AS cameraName,
           a.area_name AS areaName,
           g.gateway_code AS gatewayCode,
           g.gateway_name AS gatewayName
         FROM iot_camera_snapshots s
         INNER JOIN iot_cameras c ON c.id = s.camera_id
         LEFT JOIN biz_areas a ON a.id = s.area_id
         LEFT JOIN iot_gateways g ON g.id = s.gateway_id
         ${whereClause}
         ORDER BY s.captured_at DESC, s.id DESC
         LIMIT ${limit}`,
        params
      );

      const tenantId = extractTenantId(request.auth);
      const storageConfig = await loadMediaStorageConfig({ authContext: request.auth, tenantId });

      return ok(
        rows.map((row) => ({
          ...row,
          fileUrl: resolveMediaUrl(storageConfig, row.filePath),
          thumbnailUrl: resolveMediaUrl(storageConfig, row.thumbnailPath),
          previewText: `${row.cameraName || row.cameraCode} ${row.snapshotNo}`
        }))
      );
    }
  );

  app.delete(
    "/api/v1/snapshots/:id",
    {
      preHandler: [app.requirePermissions(["device:delete"])]
    },
    async (request, reply) => {
      const snapshotId = parseInteger(request.params?.id);
      if (!snapshotId) {
        return fail(reply, 400, "无效的快照ID", "bad_request");
      }

      const snapshotRows = await loadSnapshotsForDeletion([snapshotId]);
      const snapshot = snapshotRows[0];
      if (!snapshot) {
        return fail(reply, 404, "未找到图片记录", "not_found");
      }

      await assertAreaAccess(request.auth, snapshot.areaId, "没有操作该区域图片的权限");
      const deletionResult = await deleteSnapshotsWithCleanup({
        snapshots: [snapshot],
        authContext: request.auth
      });
      if (deletionResult.skipped.length > 0) {
        return fail(reply, 409, "当前图片已被 AI 分析结果引用，暂不允许删除", "snapshot_in_use");
      }

      await logOperation(request, {
        moduleCode: "camera_snapshot",
        operationType: "delete",
        targetType: "iot_camera_snapshots",
        targetId: snapshotId,
        requestParams: {
          snapshotId,
          snapshotNo: snapshot.snapshotNo,
          cameraId: snapshot.cameraId,
          cameraCode: snapshot.cameraCode
        },
        resultMessage: deletionResult.cleanupWarnings.length
          ? `删除图片记录成功，但有 ${deletionResult.cleanupWarnings.length} 个本地文件未清理`
          : "删除图片记录"
      });

      return ok(
        {
          snapshotId,
          snapshotNo: snapshot.snapshotNo,
          cameraName: snapshot.cameraName,
          cleanupWarnings: deletionResult.cleanupWarnings
        },
        deletionResult.cleanupWarnings.length ? "图片记录已删除，部分文件清理失败" : "图片记录删除成功"
      );
    }
  );

  app.post(
    "/api/v1/snapshots/batch-delete",
    {
      preHandler: [app.requirePermissions(["device:delete"])]
    },
    async (request, reply) => {
      const requestedIds = Array.isArray(request.body?.ids)
        ? [...new Set(request.body.ids.map((item) => parseInteger(item)).filter(Boolean))]
        : [];
      if (requestedIds.length === 0) {
        return fail(reply, 400, "请先选择要删除的图片", "bad_request");
      }
      if (requestedIds.length > 100) {
        return fail(reply, 400, "单次最多删除 100 张图片", "bad_request");
      }

      const snapshotRows = await loadSnapshotsForDeletion(requestedIds);
      const foundIdSet = new Set(snapshotRows.map((item) => item.id));
      for (const snapshot of snapshotRows) {
        await assertAreaAccess(request.auth, snapshot.areaId, "没有操作该区域图片的权限");
      }

      const deletionResult = await deleteSnapshotsWithCleanup({
        snapshots: snapshotRows,
        authContext: request.auth
      });

      const skipped = [
        ...requestedIds
          .filter((id) => !foundIdSet.has(id))
          .map((id) => ({ snapshotId: id, reason: "not_found", message: "图片记录不存在或已删除" })),
        ...deletionResult.skipped
      ];

      await logOperation(request, {
        moduleCode: "camera_snapshot",
        operationType: "delete",
        targetType: "iot_camera_snapshots",
        targetId: requestedIds.length === 1 ? requestedIds[0] : null,
        requestParams: {
          snapshotIds: requestedIds,
          deletedIds: deletionResult.deletedIds
        },
        resultMessage: `批量删除图片：成功 ${deletionResult.deletedIds.length} 张，跳过 ${skipped.length} 张`
      });

      return ok(
        {
          requestedIds,
          deletedIds: deletionResult.deletedIds,
          deletedCount: deletionResult.deletedIds.length,
          skipped,
          cleanupWarnings: deletionResult.cleanupWarnings
        },
        skipped.length > 0 ? "批量删除已完成，部分图片已跳过" : "批量删除成功"
      );
    }
  );

  app.post(
    "/api/v1/cameras/:id/ftp-receive",
    {
      preHandler: [app.requirePermissions(["device:edit"])]
    },
    async (request, reply) => {
      try {
        const cameraId = parseInteger(request.params.id);
        if (!cameraId) {
          return fail(reply, 400, "无效的摄像头ID");
        }

        const camera = await getCameraContext(cameraId);
        if (!camera) {
          return fail(reply, 404, "未找到摄像头", "not_found");
        }
        await assertAreaAccess(request.auth, camera.areaId, "没有操作该区域摄像头的权限");
        if (camera.tenantId) {
          await assertTenantFeatureEnabled(pool, {
            tenantId: camera.tenantId,
            featureKey: "enable_media",
            message: "当前租户未启用媒体能力，不能接收抓图"
          });
        }

        const capturedAt = sqlDateTime(request.body?.capturedAt);
        const receivedAt = sqlDateTime();
        const snapshotNo = generateNo("FTP");
        const ftpPath = requiredString(request.body?.ftpPath, "ftpPath");
        const storageConfig = await loadMediaStorageConfig({ tenantId: camera.tenantId });
        const tenantIdentity = await loadTenantIdentity(camera.tenantId);
        const uploadName = extractUploadBasename(optionalString(request.body?.filePath) || ftpPath, `${snapshotNo}.jpg`);
        const uploadExtension = uploadName.includes(".") ? uploadName.split(".").pop() : "jpg";
        const normalizedMimeType = optionalString(request.body?.mimeType)
          || (uploadExtension.toLowerCase() === "png" ? "image/png" : "image/jpeg");
        const storagePaths = buildSnapshotStoragePaths({
          storageConfig,
          tenantCode: tenantIdentity.tenantCode,
          cameraCode: camera.cameraCode,
          snapshotNo,
          capturedAt,
          mimeType: normalizedMimeType,
          sourceType: "ftp_upload"
        });

        const result = await query(
          `INSERT INTO iot_camera_snapshots
            (snapshot_no, tenant_id, camera_id, area_id, gateway_id, source_type, captured_at, received_at, storage_provider,
             file_path, file_size_bytes, mime_type, image_width, image_height, ftp_path, thumbnail_path, remark)
           VALUES (?, ?, ?, ?, ?, 'ftp_upload', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            snapshotNo,
            camera.tenantId,
            cameraId,
            camera.areaId,
            camera.gatewayId,
            capturedAt,
            receivedAt,
            storagePaths.storageProvider,
            storagePaths.filePath,
            parseInteger(request.body?.fileSizeBytes),
            normalizedMimeType,
            parseInteger(request.body?.imageWidth),
            parseInteger(request.body?.imageHeight),
            ftpPath,
            storagePaths.thumbnailPath,
            optionalString(request.body?.remark)
          ]
        );

        await touchCameraOnline(cameraId, receivedAt);
        await logOperation(request, {
          moduleCode: "camera_snapshot",
          operationType: "create",
          targetType: "iot_camera_snapshots",
          targetId: result.insertId,
          requestParams: {
            cameraId,
            cameraCode: camera.cameraCode,
            ftpPath
          },
          resultMessage: "接收 FTP 抓图元数据"
        });

        return ok({ snapshotId: result.insertId, snapshotNo }, "FTP 抓图接收成功");
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );
}

function clampLimit(value, maxLimit) {
  if (!value || value < 1) {
    return Math.min(50, maxLimit);
  }
  return Math.min(value, maxLimit);
}

async function loadSnapshotsForDeletion(snapshotIds = []) {
  if (!Array.isArray(snapshotIds) || snapshotIds.length === 0) {
    return [];
  }

  const placeholders = snapshotIds.map(() => "?").join(", ");
  return query(
    `SELECT
       s.id,
       s.snapshot_no AS snapshotNo,
       s.tenant_id AS tenantId,
       s.camera_id AS cameraId,
       s.area_id AS areaId,
       s.storage_provider AS storageProvider,
       s.file_path AS filePath,
       s.thumbnail_path AS thumbnailPath,
       c.camera_code AS cameraCode,
       c.camera_name AS cameraName
     FROM iot_camera_snapshots s
     INNER JOIN iot_cameras c ON c.id = s.camera_id
     WHERE s.id IN (${placeholders})`,
    snapshotIds
  );
}

async function deleteSnapshotsWithCleanup({ snapshots = [], authContext = null }) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return {
      deletedIds: [],
      cleanupWarnings: [],
      skipped: []
    };
  }

  const snapshotIds = snapshots.map((item) => item.id);
  const placeholders = snapshotIds.map(() => "?").join(", ");
  const analysisRefs = await query(
    `SELECT snapshot_id AS snapshotId
     FROM ai_image_analysis_results
     WHERE snapshot_id IN (${placeholders})
     GROUP BY snapshot_id`,
    snapshotIds
  );
  const referencedIds = new Set(analysisRefs.map((item) => Number(item.snapshotId)));
  const skipped = snapshots
    .filter((item) => referencedIds.has(Number(item.id)))
    .map((item) => ({
      snapshotId: item.id,
      snapshotNo: item.snapshotNo,
      reason: "snapshot_in_use",
      message: "已被 AI 分析结果引用"
    }));
  const deletableSnapshots = snapshots.filter((item) => !referencedIds.has(Number(item.id)));

  if (deletableSnapshots.length === 0) {
    return {
      deletedIds: [],
      cleanupWarnings: [],
      skipped
    };
  }

  const deletableIds = deletableSnapshots.map((item) => item.id);
  const deletablePlaceholders = deletableIds.map(() => "?").join(", ");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `UPDATE iot_camera_capture_plans
       SET last_snapshot_id = NULL
       WHERE last_snapshot_id IN (${deletablePlaceholders})`,
      deletableIds
    );
    await connection.execute(
      `DELETE FROM iot_camera_snapshots
       WHERE id IN (${deletablePlaceholders})`,
      deletableIds
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const storageConfigCache = new Map();
  const cleanupWarnings = [];
  for (const snapshot of deletableSnapshots) {
    const storageKey = String(snapshot.tenantId || 0);
    if (!storageConfigCache.has(storageKey)) {
      storageConfigCache.set(
        storageKey,
        await loadMediaStorageConfig({ authContext, tenantId: snapshot.tenantId })
      );
    }
    const storageConfig = storageConfigCache.get(storageKey);
    if (snapshot.storageProvider !== "local" && storageConfig.storageProvider !== "local") {
      continue;
    }
    const deleteTargets = [...new Set([snapshot.filePath, snapshot.thumbnailPath].filter(Boolean))];
    for (const storedPath of deleteTargets) {
      try {
        await deleteLocalMediaFile(storageConfig, storedPath);
      } catch (error) {
        cleanupWarnings.push(`${storedPath}: ${error.message}`);
      }
    }
  }

  return {
    deletedIds: deletableIds,
    cleanupWarnings,
    skipped
  };
}

async function handleCameraHttpUpload(request, reply) {
  const deviceAuthContext = await authenticateCameraUploadRequest(request, reply);
  if (!deviceAuthContext) {
    return;
  }

  try {
    const cameraCode = requiredString(request.params?.cameraCode || request.query?.cameraCode, "cameraCode");
    const camera = await getCameraContextByCode(cameraCode, deviceAuthContext.tenantId);
    if (!camera) {
      return fail(reply, 404, "未找到摄像头", "not_found");
    }

    await assertCameraCaptureAvailable(camera);

    const uploadPayload = await extractHttpUploadPayload(request);
    const capturedAt = sqlDateTime(uploadPayload.capturedAt);
    const receivedAt = sqlDateTime();
    const snapshotNo = generateNo("HUP");
    const storageConfig = await loadMediaStorageConfig({ tenantId: camera.tenantId });
    const tenantIdentity = await loadTenantIdentity(camera.tenantId);
    if (storageConfig.storageProvider !== "local") {
      return fail(reply, 409, "当前仅支持本地媒体存储接收 HTTP 摄像头上传", "unsupported_storage_provider", {
        storageProvider: storageConfig.storageProvider
      });
    }

    const normalizedMimeType = normalizeUploadMimeType(uploadPayload.mimeType, uploadPayload.fileName);
    const storagePaths = buildSnapshotStoragePaths({
      storageConfig,
      tenantCode: tenantIdentity.tenantCode,
      cameraCode: camera.cameraCode,
      snapshotNo,
      capturedAt,
      mimeType: normalizedMimeType,
      sourceType: "http_upload"
    });

    await writeLocalMediaFile(storageConfig, storagePaths.filePath, uploadPayload.buffer);

    const result = await query(
      `INSERT INTO iot_camera_snapshots
        (snapshot_no, tenant_id, camera_id, area_id, gateway_id, source_type, captured_at, received_at, storage_provider,
         file_path, file_size_bytes, mime_type, thumbnail_path, remark)
       VALUES (?, ?, ?, ?, ?, 'http_upload', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        snapshotNo,
        camera.tenantId,
        camera.id,
        camera.areaId,
        camera.gatewayId,
        capturedAt,
        receivedAt,
        storageConfig.storageProvider,
        storagePaths.filePath,
        uploadPayload.buffer.length,
        normalizedMimeType,
        storagePaths.filePath,
        uploadPayload.remark
      ]
    );

    await touchCameraOnline(camera.id, receivedAt);
    return ok(
      {
        snapshotId: result.insertId,
        snapshotNo,
        cameraCode: camera.cameraCode,
        fileUrl: resolveMediaUrl(storageConfig, storagePaths.filePath),
        receivedAt
      },
      "HTTP 摄像头图片接收成功"
    );
  } catch (error) {
    return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
  }
}

async function authenticateCameraUploadRequest(request, reply) {
  const token = extractCameraUploadToken(request);
  const credential = await resolveDeviceIngestCredentialByToken(token);
  if (!credential) {
    fail(reply, 401, "摄像头上传令牌无效", "unauthorized");
    return null;
  }

  const tenantFoundationEnabled = await hasTenantFoundation();
  const explicitTenantId = Number.parseInt(credential.tenantId, 10);
  const tenantId = Number.isFinite(explicitTenantId)
    ? explicitTenantId
    : (tenantFoundationEnabled ? await resolveDefaultTenantId() : null);

  return {
    credential,
    tenantId: Number.isFinite(Number(tenantId)) ? Number(tenantId) : null
  };
}

function extractCameraUploadToken(request) {
  return String(
    request.query?.token
    || request.headers["x-device-token"]
    || request.headers["x-camera-token"]
    || parseBearerToken(request)
    || ""
  ).trim();
}

async function extractHttpUploadPayload(request) {
  if (typeof request.isMultipart === "function" && request.isMultipart()) {
    const parts = request.parts();
    let fileBuffer = null;
    let fileName = null;
    let mimeType = null;
    let capturedAt = null;
    let remark = null;

    for await (const part of parts) {
      if (part.type === "file" && !fileBuffer) {
        fileBuffer = await streamToBuffer(part.file);
        fileName = part.filename || null;
        mimeType = part.mimetype || null;
        continue;
      }
      if (part.type === "field") {
        if (part.fieldname === "capturedAt" || part.fieldname === "captured_at" || part.fieldname === "timestamp") {
          capturedAt = optionalString(part.value);
        }
        if (part.fieldname === "remark" || part.fieldname === "note") {
          remark = optionalString(part.value);
        }
      }
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error("未检测到上传图片文件");
    }

    return {
      buffer: fileBuffer,
      fileName,
      mimeType,
      capturedAt,
      remark
    };
  }

  if (Buffer.isBuffer(request.body) && request.body.length > 0) {
    return {
      buffer: request.body,
      fileName: optionalString(request.query?.filename),
      mimeType: optionalString(request.headers["content-type"]),
      capturedAt: optionalString(request.query?.capturedAt || request.query?.captured_at || request.query?.timestamp),
      remark: optionalString(request.query?.remark)
    };
  }

  throw new Error("当前请求未包含可识别的图片内容");
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function normalizeUploadMimeType(mimeType, fileName) {
  const normalizedMimeType = optionalString(mimeType)?.toLowerCase();
  if (normalizedMimeType === "image/png") {
    return "image/png";
  }
  if (normalizedMimeType === "image/webp") {
    return "image/webp";
  }
  if (normalizedMimeType === "image/jpeg" || normalizedMimeType === "image/jpg") {
    return "image/jpeg";
  }

  const extension = path.extname(optionalString(fileName) || "").toLowerCase();
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  return "image/jpeg";
}

async function ensureMainCameraStream(cameraId, body, defaults) {
  const streamRole = defaults.streamRole || "main";
  const rows = await query(
    `SELECT id
     FROM iot_camera_streams
     WHERE camera_id = ? AND stream_role = ?
     LIMIT 1`,
    [cameraId, streamRole]
  );

  const payload = [
    optionalString(body?.streamName) || defaults.streamName || "主码流",
    streamRole,
    optionalString(body?.sourceProtocol) || optionalString(body?.streamProtocol) || "rtsp",
    optionalString(body?.sourceUrl),
    optionalString(body?.streamUsername),
    optionalString(body?.streamPassword),
    optionalString(body?.targetProtocol),
    optionalString(body?.targetUrl),
    optionalString(body?.resolutionText),
    parseInteger(body?.frameRate),
    parseInteger(body?.bitrateKbps),
    1,
    optionalString(body?.status) || "enabled"
  ];

  if (rows[0]) {
    await query(
      `UPDATE iot_camera_streams
       SET stream_name = ?, stream_role = ?, source_protocol = ?, source_url = ?, stream_username = ?, stream_password = ?,
           target_protocol = ?, target_url = ?, resolution_text = ?, frame_rate = ?, bitrate_kbps = ?, is_default_stream = ?,
           status = ?
       WHERE id = ?`,
      [...payload, rows[0].id]
    );
    return;
  }

  await query(
    `INSERT INTO iot_camera_streams
      (camera_id, stream_name, stream_role, source_protocol, source_url, stream_username, stream_password,
       target_protocol, target_url, resolution_text, frame_rate, bitrate_kbps, is_default_stream, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [cameraId, ...payload]
  );
}

module.exports = mediaRoutes;
