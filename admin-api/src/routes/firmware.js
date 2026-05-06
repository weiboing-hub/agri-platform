// @ts-check

const { query } = require("../lib/mysql");
const { ok, fail } = require("../lib/response");
const { appendTenantScope, assertAreaAccess } = require("../lib/data-scope");
const { logOperation } = require("../lib/audit");
const { optionalString, parseInteger, requiredString } = require("../lib/helpers");
const { extractTenantId, resolveCurrentTenantId } = require("../lib/tenant-foundation");
const {
  ACTIVE_FIRMWARE_JOB_STATUSES,
  buildFirmwareJobNo,
  buildFirmwarePackageNo,
  formatFirmwareJobRow,
  formatFirmwarePackageRow,
  normalizePackageStatus,
  normalizeSha256,
  requiredVersion
} = require("../lib/firmware-ota");

/**
 * @param {any} rows
 * @returns {Record<string, unknown>[]}
 */
function asRowArray(rows) {
  return Array.isArray(rows) ? rows : [];
}

/**
 * @param {unknown} rows
 * @returns {Record<string, unknown> | null}
 */
function firstRow(rows) {
  return asRowArray(rows)[0] || null;
}

async function firmwareRoutes(app) {
  app.get(
    "/api/v1/firmware/packages",
    {
      preHandler: [app.requireAnyPermissions(["device:view", "gateway:firmware_upgrade"])]
    },
    async (request, reply) => {
      const filters = [];
      const params = [];
      appendTenantScope(filters, params, request.auth);

      const keyword = optionalString(request.query?.keyword);
      if (keyword) {
        filters.push("(package_no LIKE ? OR package_name LIKE ? OR firmware_version LIKE ?)");
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }

      const status = optionalString(request.query?.status);
      if (status) {
        filters.push("status = ?");
        params.push(normalizePackageStatus(status));
      }

      const deviceType = optionalString(request.query?.deviceType);
      if (deviceType) {
        filters.push("device_type = ?");
        params.push(deviceType);
      }

      const rows = await query(
        `SELECT
           id,
           tenant_id AS tenantId,
           package_no AS packageNo,
           device_type AS deviceType,
           package_name AS packageName,
           firmware_version AS firmwareVersion,
           hardware_version AS hardwareVersion,
           download_url AS downloadUrl,
           file_name AS fileName,
           file_size_bytes AS fileSizeBytes,
           sha256,
           release_note AS releaseNote,
           status,
           created_by AS createdBy,
           created_at AS createdAt,
           updated_at AS updatedAt
         FROM iot_firmware_packages
         ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
         ORDER BY id DESC`,
        params
      );

      return ok(rows.map(formatFirmwarePackageRow));
    }
  );

  app.post(
    "/api/v1/firmware/packages",
    {
      preHandler: [app.requireAnyPermissions(["gateway:firmware_upgrade"])]
    },
    async (request, reply) => {
      try {
        const packageName = requiredString(request.body?.packageName, "packageName");
        const firmwareVersion = requiredVersion(request.body?.firmwareVersion, "firmwareVersion");
        const downloadUrl = requiredString(request.body?.downloadUrl, "downloadUrl");
        const sha256 = normalizeSha256(request.body?.sha256);
        if (!sha256) {
          return fail(reply, 400, "sha256格式不正确", "bad_request");
        }

        const tenantId = await resolveCurrentTenantId(request.auth);
        const packageNo = buildFirmwarePackageNo();
        const status = normalizePackageStatus(request.body?.status || "draft");
        const deviceType = optionalString(request.body?.deviceType) || "esp32";
        const fileSizeBytes = parseInteger(request.body?.fileSizeBytes);
        const createdBy = parseInteger(request.auth?.user?.id);

        const result = await query(
          `INSERT INTO iot_firmware_packages
            (tenant_id, package_no, device_type, package_name, firmware_version, hardware_version,
             download_url, file_name, file_size_bytes, sha256, release_note, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tenantId,
            packageNo,
            deviceType,
            packageName,
            firmwareVersion,
            optionalString(request.body?.hardwareVersion),
            downloadUrl,
            optionalString(request.body?.fileName),
            fileSizeBytes,
            sha256,
            optionalString(request.body?.releaseNote),
            status,
            createdBy
          ]
        );

        const packageId = Number(result?.insertId || 0);
        await logOperation(request, {
          moduleCode: "device_gateway",
          operationType: "firmware_package_create",
          targetType: "iot_firmware_packages",
          targetId: packageId,
          requestParams: {
            packageNo,
            packageName,
            firmwareVersion,
            status
          },
          resultMessage: "创建固件包"
        });

        return ok({
          id: packageId,
          packageNo,
          firmwareVersion,
          status
        }, "固件包已创建");
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );

  app.get(
    "/api/v1/firmware/jobs",
    {
      preHandler: [app.requireAnyPermissions(["device:view", "gateway:firmware_upgrade"])]
    },
    async (request, reply) => {
      const filters = [];
      const params = [];
      appendTenantScope(filters, params, request.auth, "j.tenant_id");

      const status = optionalString(request.query?.status);
      if (status) {
        filters.push("j.status = ?");
        params.push(status);
      }

      const gatewayId = parseInteger(request.query?.gatewayId);
      if (gatewayId) {
        filters.push("j.gateway_id = ?");
        params.push(gatewayId);
      }

      const rows = await query(
        `SELECT
           j.id,
           j.tenant_id AS tenantId,
           j.job_no AS jobNo,
           j.gateway_id AS gatewayId,
           g.gateway_code AS gatewayCode,
           g.gateway_name AS gatewayName,
           j.firmware_package_id AS firmwarePackageId,
           p.package_no AS packageNo,
           p.package_name AS packageName,
           p.device_type AS deviceType,
           j.current_version AS currentVersion,
           j.target_version AS targetVersion,
           j.reported_version AS reportedVersion,
           j.trigger_source AS triggerSource,
           j.status,
           j.progress_percent AS progressPercent,
           j.error_message AS errorMessage,
           j.request_json AS requestJson,
           j.started_at AS startedAt,
           j.finished_at AS finishedAt,
           j.last_reported_at AS lastReportedAt,
           j.retry_count AS retryCount,
           j.created_by AS createdBy,
           j.created_at AS createdAt,
           j.updated_at AS updatedAt
         FROM iot_firmware_jobs j
         JOIN iot_gateways g ON g.id = j.gateway_id
         JOIN iot_firmware_packages p ON p.id = j.firmware_package_id
         ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
         ORDER BY j.id DESC
         LIMIT 200`,
        params
      );

      return ok(rows.map(formatFirmwareJobRow));
    }
  );

  app.post(
    "/api/v1/firmware/jobs",
    {
      preHandler: [app.requireAnyPermissions(["gateway:firmware_upgrade"])]
    },
    async (request, reply) => {
      try {
        const gatewayId = parseInteger(request.body?.gatewayId);
        const firmwarePackageId = parseInteger(request.body?.firmwarePackageId);
        if (!gatewayId || !firmwarePackageId) {
          return fail(reply, 400, "gatewayId和firmwarePackageId不能为空", "bad_request");
        }

        const gatewayRows = await query(
          `SELECT
             id,
             tenant_id AS tenantId,
             area_id AS areaId,
             gateway_code AS gatewayCode,
             gateway_name AS gatewayName,
             gateway_type AS gatewayType,
             firmware_version AS firmwareVersion
           FROM iot_gateways
           WHERE id = ?
           LIMIT 1`,
          [gatewayId]
        );
        const gateway = firstRow(gatewayRows);
        if (!gateway) {
          return fail(reply, 404, "未找到网关", "not_found");
        }
        const areaId = parseInteger(gateway.areaId);
        await assertAreaAccess(request.auth, areaId, "没有操作该区域网关升级任务的权限");

        const packageRows = await query(
          `SELECT
             id,
             tenant_id AS tenantId,
             package_no AS packageNo,
             device_type AS deviceType,
             package_name AS packageName,
             firmware_version AS firmwareVersion,
             download_url AS downloadUrl,
             sha256,
             status
           FROM iot_firmware_packages
           WHERE id = ?
           LIMIT 1`,
          [firmwarePackageId]
        );
        const firmwarePackage = firstRow(packageRows);
        if (!firmwarePackage) {
          return fail(reply, 404, "未找到固件包", "not_found");
        }
        if (extractTenantId(request.auth) && Number(firmwarePackage.tenantId || 0) !== Number(extractTenantId(request.auth))) {
          return fail(reply, 403, "没有访问该固件包的权限", "forbidden");
        }
        if (firmwarePackage.status !== "released") {
          return fail(reply, 400, "固件包未发布，不能创建升级任务", "bad_request");
        }
        if ((gateway.gatewayType || "esp32") !== firmwarePackage.deviceType) {
          return fail(reply, 400, "固件包设备类型与网关类型不匹配", "bad_request");
        }
        if (optionalString(gateway.firmwareVersion) === firmwarePackage.firmwareVersion) {
          return fail(reply, 400, "当前设备已经是目标固件版本", "bad_request");
        }

        await query(
          `UPDATE iot_firmware_jobs
           SET status = 'cancelled',
               finished_at = NOW(),
               error_message = COALESCE(error_message, '已被新的升级任务替代')
           WHERE gateway_id = ?
             AND status IN (${ACTIVE_FIRMWARE_JOB_STATUSES.map(() => "?").join(", ")})`,
          [gatewayId, ...ACTIVE_FIRMWARE_JOB_STATUSES]
        );

        const tenantId = parseInteger(gateway.tenantId) || await resolveCurrentTenantId(request.auth);
        const jobNo = buildFirmwareJobNo();
        const requestJson = JSON.stringify({
          operatorUserId: parseInteger(request.auth?.user?.id),
          operatorName: optionalString(request.auth?.user?.realName) || optionalString(request.auth?.user?.username),
          remark: optionalString(request.body?.remark) || null
        });

        const result = await query(
          `INSERT INTO iot_firmware_jobs
            (tenant_id, job_no, gateway_id, firmware_package_id, current_version, target_version,
             trigger_source, status, progress_percent, request_json, created_by)
           VALUES (?, ?, ?, ?, ?, ?, 'manual', 'pending', 0, ?, ?)`,
          [
            tenantId,
            jobNo,
            gatewayId,
            firmwarePackageId,
            optionalString(gateway.firmwareVersion),
            firmwarePackage.firmwareVersion,
            requestJson,
            parseInteger(request.auth?.user?.id)
          ]
        );

        const jobId = Number(result?.insertId || 0);
        await logOperation(request, {
          moduleCode: "device_gateway",
          operationType: "firmware_job_create",
          targetType: "iot_firmware_jobs",
          targetId: jobId,
          requestParams: {
            gatewayId,
            gatewayCode: gateway.gatewayCode,
            firmwarePackageId,
            targetVersion: firmwarePackage.firmwareVersion
          },
          resultMessage: "创建固件升级任务"
        });

        return ok({
          id: jobId,
          jobNo,
          gatewayId,
          gatewayCode: gateway.gatewayCode,
          firmwarePackageId,
          packageNo: firmwarePackage.packageNo,
          currentVersion: optionalString(gateway.firmwareVersion),
          targetVersion: firmwarePackage.firmwareVersion,
          status: "pending"
        }, "固件升级任务已创建");
      } catch (error) {
        return fail(reply, error.httpStatus || 400, error.message, error.code || "bad_request", error.details || null);
      }
    }
  );
}

module.exports = firmwareRoutes;
