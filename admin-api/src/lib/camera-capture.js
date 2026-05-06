// @ts-check

const fs = require("fs/promises");
const { AppError } = require("./app-error");
const { pool, query } = require("./mysql");
const { optionalString, parseInteger } = require("./helpers");
const { assertTenantFeatureEnabled } = require("./tenant-entitlements");
const {
  loadMediaStorageConfig,
  loadTenantIdentity,
  buildSnapshotStoragePaths,
  resolveLocalMediaFilePath
} = require("./media-storage");
const { captureFrameToLocalFiles } = require("./stream-frame-capture");

/**
 * @param {unknown} result
 * @returns {number}
 */
function getInsertId(result) {
  const candidate =
    typeof result === "object" && result
      ? /** @type {{ insertId?: unknown }} */ (result)
      : null;
  const insertId = Number(candidate?.insertId);
  return Number.isFinite(insertId) ? insertId : 0;
}

function generateNo(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function sqlDateTime(input = null) {
  const date = input ? new Date(input) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, "0");
  const day = String(safeDate.getDate()).padStart(2, "0");
  const hour = String(safeDate.getHours()).padStart(2, "0");
  const minute = String(safeDate.getMinutes()).padStart(2, "0");
  const second = String(safeDate.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

async function touchCameraOnline(cameraId, atTime) {
  await query(
    `UPDATE iot_cameras
     SET online_status = 'online', last_online_at = ?
     WHERE id = ?`,
    [atTime, cameraId]
  );
}

async function getCameraContext(cameraId) {
  const rows = await query(
    `SELECT
       c.id,
       c.tenant_id AS tenantId,
       c.camera_code AS cameraCode,
       c.camera_name AS cameraName,
       c.area_id AS areaId,
       c.gateway_id AS gatewayId,
       c.snapshot_enabled AS snapshotEnabled,
       c.record_enabled AS recordEnabled,
       c.status
     FROM iot_cameras c
     WHERE c.id = ?
     LIMIT 1`,
    [cameraId]
  );

  if (!rows[0]) {
    return null;
  }

  return {
    ...rows[0],
    snapshotEnabled: Boolean(rows[0].snapshotEnabled),
    recordEnabled: Boolean(rows[0].recordEnabled)
  };
}

async function getMainCameraStream(cameraId) {
  const rows = await query(
    `SELECT
       id,
       camera_id AS cameraId,
       source_protocol AS sourceProtocol,
       source_url AS sourceUrl,
       stream_username AS streamUsername,
       stream_password AS streamPassword,
       target_protocol AS targetProtocol,
       target_url AS targetUrl,
       status
     FROM iot_camera_streams
     WHERE camera_id = ?
       AND stream_role = 'main'
     LIMIT 1`,
    [cameraId]
  );

  return rows[0] || null;
}

async function getCameraContextByCode(cameraCode, tenantId = null) {
  const normalizedCameraCode = optionalString(cameraCode);
  if (!normalizedCameraCode) {
    return null;
  }

  const rows = tenantId
    ? await query(
      `SELECT
         c.id,
         c.tenant_id AS tenantId,
         c.camera_code AS cameraCode,
         c.camera_name AS cameraName,
         c.area_id AS areaId,
         c.gateway_id AS gatewayId,
         c.snapshot_enabled AS snapshotEnabled,
         c.record_enabled AS recordEnabled,
         c.status
       FROM iot_cameras c
       WHERE c.tenant_id = ?
         AND c.camera_code = ?
       LIMIT 1`,
      [tenantId, normalizedCameraCode]
    )
    : await query(
      `SELECT
         c.id,
         c.tenant_id AS tenantId,
         c.camera_code AS cameraCode,
         c.camera_name AS cameraName,
         c.area_id AS areaId,
         c.gateway_id AS gatewayId,
         c.snapshot_enabled AS snapshotEnabled,
         c.record_enabled AS recordEnabled,
         c.status
       FROM iot_cameras c
       WHERE c.camera_code = ?
       ORDER BY c.id ASC
       LIMIT 1`,
      [normalizedCameraCode]
    );

  if (!rows[0]) {
    return null;
  }

  return {
    ...rows[0],
    snapshotEnabled: Boolean(rows[0].snapshotEnabled),
    recordEnabled: Boolean(rows[0].recordEnabled)
  };
}

function resolveSnapshotSourceType(triggerType) {
  if (triggerType === "schedule") {
    return "schedule";
  }
  if (triggerType === "event") {
    return "event";
  }
  return "manual";
}

async function assertCameraCaptureAvailable(camera) {
  if (!camera) {
    throw new AppError("not_found", "未找到摄像头", 404);
  }

  if (camera.tenantId) {
    await assertTenantFeatureEnabled(pool, {
      tenantId: camera.tenantId,
      featureKey: "enable_media",
      message: "当前租户未启用媒体能力，不能执行抓图"
    });
  }

  if (camera.status !== "enabled") {
    throw new AppError("conflict", "当前摄像头已禁用，不能执行抓图", 409);
  }

  if (!camera.snapshotEnabled) {
    throw new AppError("conflict", "当前摄像头未启用抓图", 409);
  }
}

async function createCameraCapture(input) {
  const cameraId = parseInteger(input.cameraId);
  const camera = input.camera || (await getCameraContext(cameraId));

  await assertCameraCaptureAvailable(camera);
  const stream = await getMainCameraStream(camera.id);
  if (!stream || stream.status !== "enabled") {
    throw new AppError("missing_stream", "当前摄像头未配置可用的主码流，无法执行抓图", 409);
  }

  const requestedAt = sqlDateTime();
  const scheduledAt = sqlDateTime(input.scheduledAt || requestedAt);
  const triggerType = optionalString(input.triggerType) || "manual";
  const sourceType = resolveSnapshotSourceType(triggerType);
  const capturePurpose = optionalString(input.capturePurpose) || "preview";
  const remark = optionalString(input.remark);
  const jobNo = generateNo("CAP");
  const snapshotNo = generateNo("SNP");
  const storageConfig = await loadMediaStorageConfig({ tenantId: camera.tenantId });
  if (storageConfig.storageProvider !== "local") {
    throw new AppError("unsupported_storage_provider", "当前抓图链路仅支持本地媒体存储", 409);
  }
  const tenantIdentity = await loadTenantIdentity(camera.tenantId);
  const storagePaths = buildSnapshotStoragePaths({
    storageConfig,
    tenantCode: tenantIdentity.tenantCode,
    cameraCode: camera.cameraCode,
    snapshotNo,
    capturedAt: scheduledAt,
    mimeType: "image/jpeg",
    sourceType
  });
  const requestParams = {
    capturePurpose,
    remark,
    requestedAt,
    executionMode: input.executionMode || "immediate",
    sourceProtocol: stream.sourceProtocol,
    sourceUrl: stream.sourceUrl
  };

  const jobResult = await query(
    `INSERT INTO iot_camera_capture_jobs
      (job_no, tenant_id, camera_id, trigger_type, trigger_source_type, trigger_source_id, capture_purpose, status,
       scheduled_at, started_at, retry_count, request_params_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, 0, ?, ?)`,
    [
      jobNo,
      camera.tenantId,
      camera.id,
      triggerType,
      optionalString(input.triggerSourceType) || "user",
      parseInteger(input.triggerSourceId),
      capturePurpose,
      scheduledAt,
      requestedAt,
      JSON.stringify(requestParams),
      parseInteger(input.createdBy)
    ]
  );
  const jobId = getInsertId(jobResult);

  try {
    const filePath = resolveLocalMediaFilePath(storageConfig, storagePaths.filePath);
    const thumbnailPath = resolveLocalMediaFilePath(storageConfig, storagePaths.thumbnailPath);
    const captureMeta = await captureFrameToLocalFiles(stream, filePath, thumbnailPath);

    const snapshotResult = await query(
      `INSERT INTO iot_camera_snapshots
        (snapshot_no, tenant_id, camera_id, capture_job_id, area_id, gateway_id, source_type, captured_at, received_at,
         storage_provider, file_path, file_size_bytes, mime_type, image_width, image_height, thumbnail_path, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        snapshotNo,
        camera.tenantId,
        camera.id,
        jobId,
        camera.areaId,
        camera.gatewayId,
        sourceType,
        scheduledAt,
        requestedAt,
        storagePaths.storageProvider,
        storagePaths.filePath,
        captureMeta.fileSizeBytes,
        captureMeta.mimeType,
        captureMeta.imageWidth,
        captureMeta.imageHeight,
        storagePaths.thumbnailPath,
        remark
      ]
    );
    const snapshotId = getInsertId(snapshotResult);

    await query(
      `UPDATE iot_camera_capture_jobs
       SET status = 'success', finished_at = ?, error_message = NULL
       WHERE id = ?`,
      [sqlDateTime(), jobId]
    );

    await touchCameraOnline(camera.id, requestedAt);

    return {
      camera,
      jobId,
      jobNo,
      snapshotId,
      snapshotNo,
      requestedAt,
      scheduledAt,
      sourceType
    };
  } catch (error) {
    await query(
      `UPDATE iot_camera_capture_jobs
       SET status = 'failed', finished_at = ?, error_message = ?
       WHERE id = ?`,
      [sqlDateTime(), String(error.message || "抓图失败").slice(0, 240), jobId]
    );

    const filePath = resolveLocalMediaFilePath(storageConfig, storagePaths.filePath);
    const thumbnailPath = resolveLocalMediaFilePath(storageConfig, storagePaths.thumbnailPath);
    if (filePath) {
      await fs.unlink(filePath).catch(() => {});
    }
    if (thumbnailPath) {
      await fs.unlink(thumbnailPath).catch(() => {});
    }

    throw error;
  }
}

module.exports = {
  assertCameraCaptureAvailable,
  createCameraCapture,
  generateNo,
  sqlDateTime,
  touchCameraOnline,
  getCameraContext,
  getCameraContextByCode
};
