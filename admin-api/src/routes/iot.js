// @ts-check

const config = require("../lib/config");
const { pool } = require("../lib/mysql");
const { logOperation } = require("../lib/audit");
const { ok, fail } = require("../lib/response");
const { parseBearerToken } = require("../lib/auth");
const { consumeRateLimit } = require("../lib/rate-limit");
const { resolveDeviceIngestCredentialByToken } = require("../lib/device-credentials");
const { hasTenantFoundation, resolveDefaultTenantId } = require("../lib/tenant-foundation");
const { optionalString } = require("../lib/helpers");
const {
  DEFAULT_ESP32_GATEWAY_CONFIG,
  normalizeGatewayConfig,
  stringifyGatewayConfig,
  summarizeGatewayConfig
} = require("../lib/gateway-config");
const {
  ACTIVE_FIRMWARE_JOB_STATUSES,
  normalizeJobStatus,
  normalizeProgressPercent,
  requiredVersion
} = require("../lib/firmware-ota");
const {
  resolveDeviceTenantId,
  normalizeIngestPayload,
  normalizeSamplingStatus,
  classifyTimeQuality,
  buildSensorCode,
  requiredTrimmed,
  toNullableInt
} = require("../lib/iot-payload");

const DEFAULT_AREA_CODE = "AREA-AUTO-DEFAULT";
const DEFAULT_AREA_NAME = "默认接入区";
const PUMP_ACTUATOR_TYPES = ["water_pump", "pump", "irrigation_pump"];

/**
 * @param {unknown} value
 * @returns {number}
 */
function normalizeAffectedRows(value) {
  const candidate = value && typeof value === "object"
    ? /** @type {{ affectedRows?: unknown }} */ (value)
    : null;
  const affectedRows = Number(candidate?.affectedRows);
  return Number.isFinite(affectedRows) ? affectedRows : 0;
}

async function iotRoutes(app) {
  app.post("/api/v1/iot/ingest", async (request, reply) => handleIngest(request, reply));
  app.post("/api/soil/ingest", async (request, reply) => handleIngest(request, reply));
  app.get("/api/v1/iot/device-control", async (request, reply) => handleFetchDeviceControl(request, reply));
  app.post("/api/v1/iot/device-control/report", async (request, reply) => handleReportDeviceControl(request, reply));
  app.get("/api/v1/iot/device-config", async (request, reply) => handleFetchDeviceConfig(request, reply));
  app.post("/api/v1/iot/device-config/report", async (request, reply) => handleReportDeviceConfig(request, reply));
  app.post("/api/v1/iot/firmware/report", async (request, reply) => handleReportDeviceFirmware(request, reply));
}

async function handleIngest(request, reply) {
  const deviceAuthContext = await authenticateDeviceRequest(request, reply, "设备上报令牌无效");
  if (!deviceAuthContext) {
    return;
  }

  try {
    const normalized = normalizeIngestPayload(request.body || {});
    if (config.rateLimit.enabled) {
      const rateLimit = consumeRateLimit({
        key: `iot:ingest:${deviceAuthContext.tenantId || "default"}:${normalized.deviceId}`,
        windowMs: config.rateLimit.ingestWindowMs,
        max: config.rateLimit.ingestMax
      });
      if (!rateLimit.allowed) {
        reply.header("Retry-After", Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000)));
        return fail(reply, 429, "设备上报过于频繁，请稍后再试", "rate_limited", {
          deviceId: normalized.deviceId
        });
      }
    }
    const result = await ingestDevicePayload(request, normalized, deviceAuthContext.tenantId);
    reply.code(201);
    return ok(result, "设备数据接收成功");
  } catch (error) {
    return fail(reply, 400, error.message);
  }
}

async function handleFetchDeviceControl(request, reply) {
  const deviceAuthContext = await authenticateDeviceRequest(request, reply, "设备控制令牌无效");
  if (!deviceAuthContext) {
    return;
  }

  const deviceId = requiredTrimmed(request.query?.deviceId ?? request.query?.device_id, "deviceId");
  const gateway = await findGatewayControlByDeviceId(deviceId, deviceAuthContext.tenantId);

  if (!gateway) {
    return fail(reply, 404, "未找到设备控制信息", "not_found");
  }

  const pumpCommand = await findPendingPumpCommand(gateway.id, deviceAuthContext.tenantId);
  const pumpCommandPayload = pumpCommand
    ? await ensurePumpCommandVersion(pumpCommand, gateway.id)
    : null;
  const commandVersion = Math.max(
    Number(gateway.commandVersion || 0),
    Number(pumpCommandPayload?.commandVersion || 0)
  );
  const appliedCommandVersion = Number(gateway.appliedCommandVersion || 0);
  const responsePayload = {
    deviceId,
    gatewayId: gateway.id,
    gatewayCode: gateway.gatewayCode,
    desiredSamplingStatus: gateway.desiredSamplingStatus || "running",
    samplingStatus: gateway.samplingStatus || "running",
    commandVersion,
    appliedCommandVersion,
    pending: commandVersion > appliedCommandVersion,
    pumpPending: Boolean(pumpCommandPayload && pumpCommandPayload.commandVersion > appliedCommandVersion),
    lastSamplingCommandAt: gateway.lastSamplingCommandAt || null,
    lastSamplingReportedAt: gateway.lastSamplingReportedAt || null
  };

  if (pumpCommandPayload) {
    Object.assign(responsePayload, pumpCommandPayload);
  }

  return ok(responsePayload);
}

async function handleReportDeviceControl(request, reply) {
  const deviceAuthContext = await authenticateDeviceRequest(request, reply, "设备控制令牌无效");
  if (!deviceAuthContext) {
    return;
  }

  try {
    const deviceId = requiredTrimmed(request.body?.deviceId ?? request.body?.device_id, "deviceId");
    const samplingStatus = normalizeSamplingStatus(request.body?.samplingStatus ?? request.body?.sampling_status);
    const appliedCommandVersion = toNullableInt(
      request.body?.appliedCommandVersion ?? request.body?.applied_command_version
    );
    const rssi = toNullableInt(request.body?.rssi);
    const pumpStatus = normalizePumpStatus(request.body?.pumpStatus ?? request.body?.pump_status);
    const pumpResultStatus = normalizePumpCommandResultStatus(
      request.body?.pumpResultStatus ?? request.body?.pump_result_status
    );
    const pumpResultMessage = optionalString(
      request.body?.pumpResultMessage ?? request.body?.pump_result_message
    );

    const [result] = deviceAuthContext.tenantId
      ? await pool.execute(
        `UPDATE iot_gateways
         SET sampling_status = ?,
             applied_command_version = GREATEST(applied_command_version, ?),
             last_sampling_reported_at = NOW(),
             online_status = 'online',
             last_heartbeat_at = NOW(),
             wifi_rssi = COALESCE(?, wifi_rssi)
         WHERE tenant_id = ?
           AND (gateway_code = ? OR serial_no = ?)`,
        [samplingStatus, appliedCommandVersion ?? 0, rssi, deviceAuthContext.tenantId, deviceId, deviceId]
      )
      : await pool.execute(
        `UPDATE iot_gateways
         SET sampling_status = ?,
             applied_command_version = GREATEST(applied_command_version, ?),
             last_sampling_reported_at = NOW(),
             online_status = 'online',
             last_heartbeat_at = NOW(),
             wifi_rssi = COALESCE(?, wifi_rssi)
         WHERE gateway_code = ? OR serial_no = ?`,
        [samplingStatus, appliedCommandVersion ?? 0, rssi, deviceId, deviceId]
      );

    if (!normalizeAffectedRows(result)) {
      return fail(reply, 404, "未找到设备", "not_found");
    }

    const gateway = await findGatewayControlByDeviceId(deviceId, deviceAuthContext.tenantId);
    const pumpCommandResult = gateway && pumpStatus
      ? await applyPumpCommandReport({
        gatewayId: gateway.id,
        tenantId: deviceAuthContext.tenantId,
        appliedCommandVersion: appliedCommandVersion ?? 0,
        pumpStatus,
        commandResultStatus: pumpResultStatus,
        commandResultMessage: pumpResultMessage
      })
      : null;

    return ok(
      {
        deviceId,
        samplingStatus,
        appliedCommandVersion: appliedCommandVersion ?? 0,
        pumpStatus,
        pumpResultStatus,
        pumpResultMessage,
        pumpCommand: pumpCommandResult
      },
      "设备控制状态已回报"
    );
  } catch (error) {
    return fail(reply, 400, error.message);
  }
}

async function handleFetchDeviceConfig(request, reply) {
  const deviceAuthContext = await authenticateDeviceRequest(request, reply, "设备配置令牌无效");
  if (!deviceAuthContext) {
    return;
  }

  try {
    const deviceId = requiredTrimmed(request.query?.deviceId ?? request.query?.device_id, "deviceId");
    const currentConfigVersion = toNullableInt(
      request.query?.currentConfigVersion ?? request.query?.current_config_version
    ) ?? 0;
    const gateway = await findGatewayByDeviceId(deviceId, deviceAuthContext.tenantId);

    if (!gateway) {
      return fail(reply, 404, "未找到设备配置", "not_found");
    }

    const configSource = gateway.configJson ? "gateway" : gateway.templateConfigJson ? "template" : "default";
    const config = normalizeGatewayConfig(gateway.configJson || gateway.templateConfigJson || DEFAULT_ESP32_GATEWAY_CONFIG);
    const summary = summarizeGatewayConfig(config);
    const configVersion = Number(gateway.configVersion || 1);
    const configSyncStatus = gateway.configSyncStatus || "not_configured";
    const firmwareJob = summary.otaEnabled
      ? await findActiveFirmwareJobByGatewayId(gateway.id, deviceAuthContext.tenantId)
      : null;

    return ok({
      deviceId,
      gatewayId: gateway.id,
      gatewayCode: gateway.gatewayCode,
      gatewayName: gateway.gatewayName || deviceId,
      configVersion,
      currentConfigVersion,
      hasUpdate: configVersion > currentConfigVersion || configSyncStatus !== "applied",
      configSyncStatus,
      configMessage: gateway.configMessage || null,
      currentFirmwareVersion: optionalString(gateway.firmwareVersion),
      hasFirmwareUpdate: Boolean(
        firmwareJob
        && optionalString(firmwareJob.targetVersion)
        && optionalString(gateway.firmwareVersion) !== optionalString(firmwareJob.targetVersion)
      ),
      firmwareJobId: firmwareJob?.id || null,
      targetFirmwareVersion: firmwareJob?.targetVersion || null,
      firmwareUrl: firmwareJob?.downloadUrl || null,
      firmwareSha256: firmwareJob?.sha256 || null,
      firmwareSizeBytes: firmwareJob?.fileSizeBytes !== undefined && firmwareJob?.fileSizeBytes !== null
        ? Number(firmwareJob.fileSizeBytes)
        : null,
      firmwareJobStatus: firmwareJob?.status || null,
      configSource,
      ...summary,
      config
    });
  } catch (error) {
    return fail(reply, 400, error.message);
  }
}

async function handleReportDeviceConfig(request, reply) {
  const deviceAuthContext = await authenticateDeviceRequest(request, reply, "设备配置令牌无效");
  if (!deviceAuthContext) {
    return;
  }

  try {
    const deviceId = requiredTrimmed(request.body?.deviceId ?? request.body?.device_id, "deviceId");
    const appliedConfigVersion = toNullableInt(
      request.body?.appliedConfigVersion ?? request.body?.applied_config_version
    ) ?? 0;
    const reportedStatus = normalizeDeviceConfigStatus(
      request.body?.configStatus ?? request.body?.config_status
    );
    const reportedMessage = optionalString(request.body?.message ?? request.body?.configMessage ?? request.body?.config_message);
    const rssi = toNullableInt(request.body?.rssi);
    const gateway = await findGatewayByDeviceId(deviceId, deviceAuthContext.tenantId);

    if (!gateway) {
      return fail(reply, 404, "未找到设备配置", "not_found");
    }

    const platformConfigVersion = Number(gateway.configVersion || 1);
    const configSnapshotJson = stringifyGatewayConfig(
      gateway.configJson || gateway.templateConfigJson || DEFAULT_ESP32_GATEWAY_CONFIG
    );
    const configSource = gateway.configJson ? "gateway" : gateway.templateConfigJson ? "template" : "default";

    /** @type {"applied" | "failed" | "pending_push"} */
    let nextSyncStatus = "pending_push";
    /** @type {"applied" | "failed" | "stale"} */
    let result = "stale";
    let actionType = "device_report_stale";
    let messageText = reportedMessage;

    if (reportedStatus === "failed") {
      nextSyncStatus = "failed";
      result = "failed";
      actionType = "device_report_failed";
      messageText = messageText || `设备回报配置应用失败（设备版本 V${appliedConfigVersion || 0}）`;
    } else if (appliedConfigVersion >= platformConfigVersion && platformConfigVersion > 0) {
      nextSyncStatus = "applied";
      result = "applied";
      actionType = "device_report_applied";
      messageText = messageText || `设备已回报生效 V${platformConfigVersion}`;
    } else {
      nextSyncStatus = "pending_push";
      result = "stale";
      actionType = "device_report_stale";
      messageText = messageText || `设备当前为 V${appliedConfigVersion || 0}，平台最新为 V${platformConfigVersion}`;
    }

    const [updateResult] = deviceAuthContext.tenantId
      ? await pool.execute(
        `UPDATE iot_gateways
         SET device_config_sync_status = ?,
             device_config_message = ?,
             last_config_applied_at = CASE WHEN ? = 'applied' THEN NOW() ELSE last_config_applied_at END,
             online_status = 'online',
             last_heartbeat_at = NOW(),
             wifi_rssi = COALESCE(?, wifi_rssi)
         WHERE tenant_id = ?
           AND (gateway_code = ? OR serial_no = ?)`,
        [nextSyncStatus, messageText, result, rssi, deviceAuthContext.tenantId, deviceId, deviceId]
      )
      : await pool.execute(
        `UPDATE iot_gateways
         SET device_config_sync_status = ?,
             device_config_message = ?,
             last_config_applied_at = CASE WHEN ? = 'applied' THEN NOW() ELSE last_config_applied_at END,
             online_status = 'online',
             last_heartbeat_at = NOW(),
             wifi_rssi = COALESCE(?, wifi_rssi)
         WHERE gateway_code = ? OR serial_no = ?`,
        [nextSyncStatus, messageText, result, rssi, deviceId, deviceId]
      );

    if (!normalizeAffectedRows(updateResult)) {
      return fail(reply, 404, "未找到设备配置", "not_found");
    }

    await insertGatewayConfigLog({
      tenantId: gateway.tenantId,
      gatewayId: gateway.id,
      templateId: gateway.templateId,
      configVersion: platformConfigVersion,
      actionType,
      syncStatus: nextSyncStatus,
      configSource,
      operatorUserId: null,
      operatorName: "设备自动回报",
      messageText,
      configSnapshotJson
    });

    return ok({
      deviceId,
      gatewayId: gateway.id,
      reportedConfigVersion: appliedConfigVersion,
      platformConfigVersion,
      configSyncStatus: nextSyncStatus,
      result
    }, "设备配置状态已回报");
  } catch (error) {
    return fail(reply, 400, error.message);
  }
}

async function handleReportDeviceFirmware(request, reply) {
  const deviceAuthContext = await authenticateDeviceRequest(request, reply, "设备固件令牌无效");
  if (!deviceAuthContext) {
    return;
  }

  try {
    const deviceId = requiredTrimmed(request.body?.deviceId ?? request.body?.device_id, "deviceId");
    const firmwareJobId = toNullableInt(request.body?.firmwareJobId ?? request.body?.firmware_job_id);
    const status = normalizeJobStatus(request.body?.status);
    const progressPercent = normalizeProgressPercent(request.body?.progressPercent ?? request.body?.progress_percent);
    const messageText = optionalString(
      request.body?.message ?? request.body?.errorMessage ?? request.body?.error_message
    );
    const reportedVersion = optionalString(request.body?.reportedVersion ?? request.body?.reported_version)
      || optionalString(request.body?.firmwareVersion ?? request.body?.firmware_version);
    const targetVersion = optionalString(request.body?.targetVersion ?? request.body?.target_version);
    const rssi = toNullableInt(request.body?.rssi);
    const gateway = await findGatewayByDeviceId(deviceId, deviceAuthContext.tenantId);

    if (!gateway) {
      return fail(reply, 404, "未找到设备", "not_found");
    }

    const firmwareJob = await findFirmwareJobForDeviceReport(
      gateway.id,
      deviceAuthContext.tenantId,
      firmwareJobId,
      targetVersion
    );
    if (!firmwareJob) {
      return fail(reply, 404, "未找到固件升级任务", "not_found");
    }

    const finalReportedVersion = reportedVersion || firmwareJob.targetVersion;
    const nextProgressPercent = status === "success" ? 100 : progressPercent;
    const nextErrorMessage = status === "failed" ? (messageText || "设备回报固件升级失败") : null;

    await pool.execute(
      `UPDATE iot_firmware_jobs
       SET status = ?,
           progress_percent = ?,
           error_message = ?,
           started_at = CASE
             WHEN ? IN ('downloading', 'upgrading', 'success', 'failed') AND started_at IS NULL THEN NOW()
             ELSE started_at
           END,
           finished_at = CASE
             WHEN ? IN ('success', 'failed', 'cancelled') THEN NOW()
             ELSE finished_at
           END,
           last_reported_at = NOW(),
           reported_version = COALESCE(?, reported_version),
           retry_count = CASE WHEN ? = 'failed' THEN retry_count + 1 ELSE retry_count END
       WHERE id = ?`,
      [
        status,
        nextProgressPercent,
        nextErrorMessage,
        status,
        status,
        finalReportedVersion,
        status,
        firmwareJob.id
      ]
    );

    if (status === "success") {
      await pool.execute(
        `UPDATE iot_gateways
         SET firmware_version = ?,
             online_status = 'online',
             last_heartbeat_at = NOW(),
             wifi_rssi = COALESCE(?, wifi_rssi)
         WHERE id = ?`,
        [finalReportedVersion, rssi, gateway.id]
      );
    } else {
      await pool.execute(
        `UPDATE iot_gateways
         SET online_status = 'online',
             last_heartbeat_at = NOW(),
             wifi_rssi = COALESCE(?, wifi_rssi)
         WHERE id = ?`,
        [rssi, gateway.id]
      );
    }

    return ok({
      deviceId,
      gatewayId: gateway.id,
      firmwareJobId: firmwareJob.id,
      status,
      progressPercent: nextProgressPercent,
      targetVersion: firmwareJob.targetVersion,
      reportedVersion: finalReportedVersion
    }, "设备固件状态已回报");
  } catch (error) {
    return fail(reply, 400, error.message);
  }
}

async function authenticateDeviceRequest(request, reply, unauthorizedMessage) {
  const bearerToken = parseBearerToken(request);
  const credential = await resolveDeviceIngestCredentialByToken(bearerToken);
  if (!credential) {
    fail(reply, 401, unauthorizedMessage, "unauthorized");
    return null;
  }

  const tenantFoundationEnabled = await hasTenantFoundation();
  const tenantId = resolveDeviceTenantId(credential, {
    tenantFoundationEnabled,
    defaultTenantId: tenantFoundationEnabled ? await resolveDefaultTenantId() : null
  });

  return {
    credential,
    tenantId: Number.isFinite(Number(tenantId)) ? Number(tenantId) : null,
    tenantFoundationEnabled
  };
}

async function findGatewayControlByDeviceId(deviceId, tenantId = null) {
  const [rows] = tenantId
    ? await pool.execute(
      `SELECT
         id,
         gateway_code AS gatewayCode,
         desired_sampling_status AS desiredSamplingStatus,
         sampling_status AS samplingStatus,
         sampling_command_version AS commandVersion,
         applied_command_version AS appliedCommandVersion,
         last_sampling_command_at AS lastSamplingCommandAt,
         last_sampling_reported_at AS lastSamplingReportedAt
       FROM iot_gateways
       WHERE tenant_id = ?
         AND (gateway_code = ? OR serial_no = ?)
       ORDER BY id ASC
       LIMIT 1`,
      [tenantId, deviceId, deviceId]
    )
    : await pool.execute(
      `SELECT
         id,
         gateway_code AS gatewayCode,
         desired_sampling_status AS desiredSamplingStatus,
         sampling_status AS samplingStatus,
         sampling_command_version AS commandVersion,
         applied_command_version AS appliedCommandVersion,
         last_sampling_command_at AS lastSamplingCommandAt,
         last_sampling_reported_at AS lastSamplingReportedAt
       FROM iot_gateways
       WHERE gateway_code = ? OR serial_no = ?
       ORDER BY id ASC
       LIMIT 1`,
      [deviceId, deviceId]
    );

  return rows[0] || null;
}

async function findPendingPumpCommand(gatewayId, tenantId = null) {
  const typePlaceholders = PUMP_ACTUATOR_TYPES.map(() => "?").join(",");
  const tenantClause = tenantId ? "AND c.tenant_id = ?" : "";
  const params = tenantId
    ? [gatewayId, tenantId, ...PUMP_ACTUATOR_TYPES]
    : [gatewayId, ...PUMP_ACTUATOR_TYPES];

  const [rows] = await pool.execute(
    `SELECT
       c.id,
       c.command_no AS commandNo,
       c.actuator_id AS actuatorId,
       c.control_type AS controlType,
       c.duration_seconds AS durationSeconds,
       c.request_status AS requestStatus,
       c.requested_state_json AS requestedStateJson,
       CAST(JSON_UNQUOTE(JSON_EXTRACT(c.requested_state_json, '$.commandVersion')) AS UNSIGNED) AS commandVersion,
       a.max_run_seconds AS maxRunSeconds
     FROM ops_control_commands c
     INNER JOIN iot_actuators a ON a.id = c.actuator_id
     WHERE c.gateway_id = ?
       ${tenantClause}
       AND c.request_status IN ('queued', 'sent')
       AND a.status = 'enabled'
       AND a.actuator_type IN (${typePlaceholders})
     ORDER BY c.queued_at ASC, c.id ASC
     LIMIT 1`,
    params
  );

  return rows[0] || null;
}

async function ensurePumpCommandVersion(command, gatewayId) {
  const existingVersion = readPumpCommandVersion(command);
  if (existingVersion > 0) {
    if (command.requestStatus === "queued") {
      await markPumpCommandSent(command.id);
    }
    return buildPumpCommandPayload(command, existingVersion);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [gatewayRows] = await connection.execute(
      `SELECT sampling_command_version AS commandVersion
       FROM iot_gateways
       WHERE id = ?
       FOR UPDATE`,
      [gatewayId]
    );
    const nextVersion = Number(gatewayRows[0]?.commandVersion || 0) + 1;
    const requestedState = parseJsonObject(command.requestedStateJson);
    requestedState.power = normalizeControlType(command.controlType);
    requestedState.commandVersion = nextVersion;

    await connection.execute(
      `UPDATE ops_control_commands
       SET requested_state_json = ?,
           request_status = 'sent',
           sent_at = COALESCE(sent_at, NOW())
       WHERE id = ?`,
      [JSON.stringify(requestedState), command.id]
    );
    await connection.execute(
      `UPDATE ops_control_executions
       SET execution_status = CASE WHEN execution_status = 'pending' THEN 'acknowledged' ELSE execution_status END,
           ack_at = COALESCE(ack_at, NOW()),
           result_message = CASE
             WHEN execution_status = 'pending' THEN '命令已下发给设备'
             ELSE result_message
           END
       WHERE command_id = ?`,
      [command.id]
    );
    await connection.execute(
      `UPDATE iot_gateways
       SET sampling_command_version = ?,
           last_sampling_command_at = NOW()
       WHERE id = ?`,
      [nextVersion, gatewayId]
    );

    await connection.commit();
    return buildPumpCommandPayload(command, nextVersion);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function markPumpCommandSent(commandId) {
  await pool.execute(
    `UPDATE ops_control_commands
     SET request_status = 'sent',
         sent_at = COALESCE(sent_at, NOW())
     WHERE id = ?
       AND request_status = 'queued'`,
    [commandId]
  );
  await pool.execute(
    `UPDATE ops_control_executions
     SET execution_status = CASE WHEN execution_status = 'pending' THEN 'acknowledged' ELSE execution_status END,
         ack_at = COALESCE(ack_at, NOW()),
         result_message = CASE
           WHEN execution_status = 'pending' THEN '命令已下发给设备'
           ELSE result_message
         END
     WHERE command_id = ?`,
    [commandId]
  );
}

async function applyPumpCommandReport(payload) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const command = payload.appliedCommandVersion > 0
      ? await findAppliedPumpCommand(connection, payload)
      : null;

    if (command) {
      const reportedStateJson = JSON.stringify({
        power: payload.pumpStatus,
        appliedCommandVersion: payload.appliedCommandVersion
      });
      const commandExecutionStatus = payload.commandResultStatus === "failed" ? "failed" : "success";
      const shadowStatusAfter = commandExecutionStatus === "failed" ? "desync" : "sync";
      const resultCode = commandExecutionStatus === "failed" ? "DEVICE_BLOCKED" : "OK";
      const resultMessage = payload.commandResultMessage || (
        commandExecutionStatus === "failed"
          ? "设备因本地安全保护拦截了控制命令"
          : "设备已回报执行成功"
      );
      await connection.execute(
        `UPDATE ops_control_commands
         SET request_status = 'executed',
             sent_at = COALESCE(sent_at, NOW())
         WHERE id = ?`,
        [command.id]
      );
      await connection.execute(
        `UPDATE ops_control_executions
         SET execution_status = ?,
             reported_state_json = ?,
             shadow_status_after = ?,
             result_code = ?,
             result_message = ?,
             ack_at = COALESCE(ack_at, NOW()),
             started_at = COALESCE(started_at, NOW()),
             completed_at = NOW()
         WHERE command_id = ?`,
        [commandExecutionStatus, reportedStateJson, shadowStatusAfter, resultCode, resultMessage, command.id]
      );
    }

    const actuator = await syncPumpActuatorState(connection, {
      gatewayId: payload.gatewayId,
      tenantId: payload.tenantId,
      actuatorId: command?.actuatorId || null,
      pumpStatus: payload.pumpStatus,
      commandId: command?.id || null,
      resultMessage: command
        ? (payload.commandResultMessage || (payload.commandResultStatus === "failed" ? "设备已回报执行失败" : "设备已回报执行成功"))
        : "设备状态上报同步"
    });

    await connection.commit();

    return command
      ? {
        commandId: command.id,
        actuatorId: command.actuatorId,
        requestStatus: "executed",
        executionStatus: payload.commandResultStatus === "failed" ? "failed" : "success",
        pumpStatus: payload.pumpStatus,
        actuatorSynced: Boolean(actuator)
      }
      : {
        commandId: null,
        actuatorId: actuator?.id || null,
        requestStatus: null,
        executionStatus: null,
        pumpStatus: payload.pumpStatus,
        actuatorSynced: Boolean(actuator)
      };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function findAppliedPumpCommand(connection, payload) {
  const typePlaceholders = PUMP_ACTUATOR_TYPES.map(() => "?").join(",");
  const tenantClause = payload.tenantId ? "AND c.tenant_id = ?" : "";
  const commandVersionExpression = "CAST(JSON_UNQUOTE(JSON_EXTRACT(c.requested_state_json, '$.commandVersion')) AS UNSIGNED)";
  const params = payload.tenantId
    ? [payload.gatewayId, payload.tenantId, ...PUMP_ACTUATOR_TYPES, payload.appliedCommandVersion]
    : [payload.gatewayId, ...PUMP_ACTUATOR_TYPES, payload.appliedCommandVersion];

  const [rows] = await connection.execute(
    `SELECT
       c.id,
       c.actuator_id AS actuatorId,
       c.control_type AS controlType,
       c.duration_seconds AS durationSeconds,
       ${commandVersionExpression} AS commandVersion
     FROM ops_control_commands c
     INNER JOIN iot_actuators a ON a.id = c.actuator_id
     WHERE c.gateway_id = ?
       ${tenantClause}
       AND c.request_status IN ('queued', 'sent')
       AND a.actuator_type IN (${typePlaceholders})
       AND ${commandVersionExpression} > 0
       AND ${commandVersionExpression} <= ?
     ORDER BY ${commandVersionExpression} DESC, c.id DESC
     LIMIT 1`,
    params
  );

  return rows[0] || null;
}

async function syncPumpActuatorState(connection, payload) {
  const actuator = payload.actuatorId
    ? { id: payload.actuatorId }
    : await findPumpActuatorForGateway(connection, payload.gatewayId, payload.tenantId);

  if (!actuator) {
    return null;
  }

  const stateJson = JSON.stringify({
    power: payload.pumpStatus
  });

  await connection.execute(
    `UPDATE iot_actuators
     SET desired_state_text = ?,
         reported_state_text = ?,
         shadow_status = 'sync',
         last_action_at = NOW()
     WHERE id = ?`,
    [payload.pumpStatus, payload.pumpStatus, actuator.id]
  );
  await connection.execute(
    `INSERT INTO iot_device_shadow
       (actuator_id, desired_state_json, reported_state_json, shadow_status,
        desired_updated_at, reported_updated_at, last_command_id, last_command_result, drift_seconds)
     VALUES (?, ?, ?, 'sync', NOW(), NOW(), ?, ?, 0)
     ON DUPLICATE KEY UPDATE
       desired_state_json = VALUES(desired_state_json),
       reported_state_json = VALUES(reported_state_json),
       shadow_status = 'sync',
       desired_updated_at = NOW(),
       reported_updated_at = NOW(),
       last_command_id = COALESCE(VALUES(last_command_id), last_command_id),
       last_command_result = VALUES(last_command_result),
       drift_seconds = 0`,
    [actuator.id, stateJson, stateJson, payload.commandId, payload.resultMessage]
  );

  return actuator;
}

async function findPumpActuatorForGateway(connection, gatewayId, tenantId = null) {
  const typePlaceholders = PUMP_ACTUATOR_TYPES.map(() => "?").join(",");
  const tenantClause = tenantId ? "AND tenant_id = ?" : "";
  const params = tenantId
    ? [gatewayId, tenantId, ...PUMP_ACTUATOR_TYPES]
    : [gatewayId, ...PUMP_ACTUATOR_TYPES];

  const [rows] = await connection.execute(
    `SELECT id
     FROM iot_actuators
     WHERE gateway_id = ?
       ${tenantClause}
       AND status = 'enabled'
       AND actuator_type IN (${typePlaceholders})
     ORDER BY id ASC
     LIMIT 1`,
    params
  );

  return rows[0] || null;
}

function buildPumpCommandPayload(command, commandVersion) {
  const controlType = normalizeControlType(command.controlType);
  const durationSeconds = Math.max(0, Number(command.durationSeconds || 0));
  const maxRunSeconds = Math.max(0, Number(command.maxRunSeconds || 0));
  const boundedDurationSeconds = durationSeconds > 0 && maxRunSeconds > 0
    ? Math.min(durationSeconds, maxRunSeconds)
    : durationSeconds;
  const desiredPumpStatus = controlType === "on" && boundedDurationSeconds > 0
    ? "pulse"
    : controlType;

  return {
    desiredPumpStatus,
    pumpDurationMs: boundedDurationSeconds > 0 ? boundedDurationSeconds * 1000 : null,
    pumpCommandId: command.id,
    controlCommandId: command.id,
    controlCommandNo: command.commandNo,
    actuatorId: command.actuatorId,
    commandVersion
  };
}

function normalizeControlType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "on") {
    return "on";
  }
  return "off";
}

function normalizePumpStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["on", "running", "open", "watering"].includes(normalized)) {
    return "on";
  }
  if (["off", "stopped", "stop", "closed", "idle"].includes(normalized)) {
    return "off";
  }
  return null;
}

function normalizePumpCommandResultStatus(value) {
  return String(value || "").trim().toLowerCase() === "failed" ? "failed" : "success";
}

function readPumpCommandVersion(command) {
  const directVersion = Number(command.commandVersion || 0);
  if (Number.isFinite(directVersion) && directVersion > 0) {
    return directVersion;
  }
  const requestedState = parseJsonObject(command.requestedStateJson);
  const payloadVersion = Number(requestedState.commandVersion || requestedState.command_version || 0);
  return Number.isFinite(payloadVersion) && payloadVersion > 0 ? payloadVersion : 0;
}

function parseJsonObject(value) {
  if (!value) {
    return {};
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return { ...value };
  }
  if (typeof value !== "string") {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * @param {string} deviceId
 * @param {number | null} tenantId
 * @returns {Promise<{
 *   id: number;
 *   tenantId: number | null;
 *   gatewayCode: string;
 *   gatewayName: string | null;
 *   firmwareVersion: string | null;
 *   templateId: number | null;
 *   configJson: unknown;
 *   configVersion: number;
 *   configSyncStatus: string | null;
 *   configMessage: string | null;
 *   templateConfigJson: unknown;
 * } | null>}
 */
async function findGatewayByDeviceId(deviceId, tenantId = null) {
  const [rows] = tenantId
    ? await pool.execute(
      `SELECT
         g.id,
         g.tenant_id AS tenantId,
         g.gateway_code AS gatewayCode,
         g.gateway_name AS gatewayName,
         g.firmware_version AS firmwareVersion,
         g.device_template_id AS templateId,
         g.device_config_json AS configJson,
         g.device_config_version AS configVersion,
         g.device_config_sync_status AS configSyncStatus,
         g.device_config_message AS configMessage,
         t.config_json AS templateConfigJson
       FROM iot_gateways g
       LEFT JOIN iot_gateway_templates t ON t.id = g.device_template_id
       WHERE g.tenant_id = ?
         AND (g.gateway_code = ? OR g.serial_no = ?)
       ORDER BY g.id ASC
       LIMIT 1`,
      [tenantId, deviceId, deviceId]
    )
    : await pool.execute(
      `SELECT
         g.id,
         g.tenant_id AS tenantId,
         g.gateway_code AS gatewayCode,
         g.gateway_name AS gatewayName,
         g.firmware_version AS firmwareVersion,
         g.device_template_id AS templateId,
         g.device_config_json AS configJson,
         g.device_config_version AS configVersion,
         g.device_config_sync_status AS configSyncStatus,
         g.device_config_message AS configMessage,
         t.config_json AS templateConfigJson
       FROM iot_gateways g
       LEFT JOIN iot_gateway_templates t ON t.id = g.device_template_id
       WHERE g.gateway_code = ? OR g.serial_no = ?
       ORDER BY g.id ASC
       LIMIT 1`,
      [deviceId, deviceId]
    );

  return rows[0] || null;
}

async function findActiveFirmwareJobByGatewayId(gatewayId, tenantId = null) {
  const placeholders = ACTIVE_FIRMWARE_JOB_STATUSES.map(() => "?").join(", ");
  const [rows] = tenantId
    ? await pool.execute(
      `SELECT
         j.id,
         j.target_version AS targetVersion,
         j.status,
         p.download_url AS downloadUrl,
         p.sha256,
         p.file_size_bytes AS fileSizeBytes
       FROM iot_firmware_jobs j
       JOIN iot_firmware_packages p ON p.id = j.firmware_package_id
       WHERE j.tenant_id = ?
         AND j.gateway_id = ?
         AND j.status IN (${placeholders})
       ORDER BY j.id DESC
       LIMIT 1`,
      [tenantId, gatewayId, ...ACTIVE_FIRMWARE_JOB_STATUSES]
    )
    : await pool.execute(
      `SELECT
         j.id,
         j.target_version AS targetVersion,
         j.status,
         p.download_url AS downloadUrl,
         p.sha256,
         p.file_size_bytes AS fileSizeBytes
       FROM iot_firmware_jobs j
       JOIN iot_firmware_packages p ON p.id = j.firmware_package_id
       WHERE j.gateway_id = ?
         AND j.status IN (${placeholders})
       ORDER BY j.id DESC
       LIMIT 1`,
      [gatewayId, ...ACTIVE_FIRMWARE_JOB_STATUSES]
    );

  return rows[0] || null;
}

async function findFirmwareJobForDeviceReport(gatewayId, tenantId, firmwareJobId, targetVersion) {
  const filters = [];
  const params = [];

  if (tenantId) {
    filters.push("tenant_id = ?");
    params.push(tenantId);
  }
  filters.push("gateway_id = ?");
  params.push(gatewayId);

  if (firmwareJobId) {
    filters.push("id = ?");
    params.push(firmwareJobId);
  } else if (targetVersion) {
    filters.push("target_version = ?");
    params.push(requiredVersion(targetVersion, "targetVersion"));
  } else {
    filters.push(`status IN (${ACTIVE_FIRMWARE_JOB_STATUSES.map(() => "?").join(", ")})`);
    params.push(...ACTIVE_FIRMWARE_JOB_STATUSES);
  }

  const [rows] = await pool.execute(
    `SELECT
       id,
       target_version AS targetVersion,
       status
     FROM iot_firmware_jobs
     WHERE ${filters.join(" AND ")}
     ORDER BY id DESC
     LIMIT 1`,
    params
  );

  return rows[0] || null;
}

/**
 * @param {unknown} value
 * @returns {"applied" | "failed"}
 */
function normalizeDeviceConfigStatus(value) {
  return String(value || "").trim().toLowerCase() === "failed" ? "failed" : "applied";
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
  await pool.execute(
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

async function ingestDevicePayload(request, normalized, tenantId = null) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const tenantFoundationEnabled = await hasTenantFoundation(connection);
    const resolvedTenantId = tenantFoundationEnabled
      ? (Number.parseInt(tenantId, 10) || await resolveDefaultTenantId(connection))
      : null;

    const area = await ensureDefaultArea(connection, resolvedTenantId);
    const gateway = await ensureGateway(connection, area.id, normalized, resolvedTenantId);
    const metricDefs = await ensureMetricDefs(connection, normalized.metrics);

    const processedMetrics = [];
    for (const metric of normalized.metrics) {
      const metricDef = metricDefs.get(metric.metricCode) || null;
      const sensor = await ensureSensor(connection, gateway, metric, metricDef, resolvedTenantId);
      await ensureSensorChannel(connection, sensor.id, metric, metricDef);
      const reading = await insertReading(connection, gateway, sensor, metric, metricDef, normalized);
      await updateSensorSnapshot(connection, sensor.id, metric, normalized);
      processedMetrics.push({
        metricCode: metric.metricCode,
        sensorId: sensor.id,
        readingId: reading.insertId,
        value: metric.value
      });
    }

    await updateGatewayHeartbeat(connection, gateway.id, normalized);
    const pumpStatus = normalizePumpStatus(normalized.rawPayload.pumpStatus ?? normalized.rawPayload.pump_status);
    if (pumpStatus) {
      await syncPumpActuatorState(connection, {
        gatewayId: gateway.id,
        tenantId: resolvedTenantId,
        actuatorId: null,
        pumpStatus,
        commandId: null,
        resultMessage: "设备数据上报同步"
      });
    }

    await connection.commit();
    await logOperation(request, {
      moduleCode: "iot_ingest",
      operationType: "ingest",
      targetType: "iot_gateways",
      targetId: gateway.id,
      requestParams: {
        deviceId: normalized.deviceId,
        metrics: processedMetrics.map((item) => ({
          metricCode: item.metricCode,
          value: item.value
        }))
      },
      resultMessage: "设备数据接收成功"
    });

    return {
      deviceId: normalized.deviceId,
      gatewayId: gateway.id,
      gatewayCode: gateway.gatewayCode,
      areaId: gateway.areaId,
      acceptedMetricCount: processedMetrics.length,
      metrics: processedMetrics
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function ensureDefaultArea(connection, tenantId = null) {
  const [rows] = tenantId
    ? await connection.execute(
      `SELECT id, area_code AS areaCode, area_name AS areaName
       FROM biz_areas
       WHERE tenant_id = ?
         AND area_code = ?
       LIMIT 1`,
      [tenantId, DEFAULT_AREA_CODE]
    )
    : await connection.execute(
      `SELECT id, area_code AS areaCode, area_name AS areaName
       FROM biz_areas
       WHERE area_code = ?
       LIMIT 1`,
      [DEFAULT_AREA_CODE]
    );

  if (rows.length > 0) {
    return rows[0];
  }

  const [insertResult] = tenantId
    ? await connection.execute(
      `INSERT INTO biz_areas
        (tenant_id, area_code, area_name, area_type, area_level, status, remark)
       VALUES (?, ?, ?, 'greenhouse', 1, 'enabled', '设备自动接入默认区域')`,
      [tenantId, DEFAULT_AREA_CODE, DEFAULT_AREA_NAME]
    )
    : await connection.execute(
      `INSERT INTO biz_areas
        (area_code, area_name, area_type, area_level, status, remark)
       VALUES (?, ?, 'greenhouse', 1, 'enabled', '设备自动接入默认区域')`,
      [DEFAULT_AREA_CODE, DEFAULT_AREA_NAME]
    );

  return {
    id: insertResult.insertId,
    areaCode: DEFAULT_AREA_CODE,
    areaName: DEFAULT_AREA_NAME
  };
}

async function ensureGateway(connection, areaId, normalized, tenantId = null) {
  const [rows] = tenantId
    ? await connection.execute(
      `SELECT id, gateway_code AS gatewayCode, gateway_name AS gatewayName, area_id AS areaId, tenant_id AS tenantId
       FROM iot_gateways
       WHERE tenant_id = ?
         AND (gateway_code = ? OR serial_no = ?)
       ORDER BY id ASC
       LIMIT 1`,
      [tenantId, normalized.deviceId, normalized.deviceId]
    )
    : await connection.execute(
      `SELECT id, gateway_code AS gatewayCode, gateway_name AS gatewayName, area_id AS areaId, tenant_id AS tenantId
       FROM iot_gateways
       WHERE gateway_code = ? OR serial_no = ?
       ORDER BY id ASC
       LIMIT 1`,
      [normalized.deviceId, normalized.deviceId]
    );

  if (rows.length > 0) {
    const gateway = rows[0];
    await connection.execute(
      `UPDATE iot_gateways
       SET gateway_name = ?, area_id = COALESCE(area_id, ?), tenant_id = COALESCE(tenant_id, ?), gateway_type = 'esp32'
       WHERE id = ?`,
      [normalized.deviceName, areaId, tenantId, gateway.id]
    );
    return {
      ...gateway,
      gatewayName: normalized.deviceName,
      areaId: gateway.areaId || areaId
    };
  }

  const [insertResult] = tenantId
    ? await connection.execute(
      `INSERT INTO iot_gateways
        (tenant_id, gateway_code, gateway_name, gateway_type, serial_no, area_id, firmware_version, online_status,
         runtime_mode, backfill_status, control_availability, status, remark)
       VALUES (?, ?, ?, 'esp32', ?, ?, 'auto-provisioned', 'online', 'manual', 'idle', 'enabled', 'enabled', '自动接入创建')`,
      [tenantId, normalized.deviceId, normalized.deviceName, normalized.deviceId, areaId]
    )
    : await connection.execute(
      `INSERT INTO iot_gateways
        (gateway_code, gateway_name, gateway_type, serial_no, area_id, firmware_version, online_status,
         runtime_mode, backfill_status, control_availability, status, remark)
       VALUES (?, ?, 'esp32', ?, ?, 'auto-provisioned', 'online', 'manual', 'idle', 'enabled', 'enabled', '自动接入创建')`,
      [normalized.deviceId, normalized.deviceName, normalized.deviceId, areaId]
    );

  return {
    id: insertResult.insertId,
    gatewayCode: normalized.deviceId,
    gatewayName: normalized.deviceName,
    areaId
  };
}

async function ensureMetricDefs(connection, metrics) {
  if (!metrics.length) {
    return new Map();
  }

  const metricCodes = metrics.map((item) => item.metricCode);
  const placeholders = metricCodes.map(() => "?").join(",");
  const [rows] = await connection.execute(
    `SELECT metric_code AS metricCode, metric_name AS metricName, unit_name AS unitName
     FROM iot_metric_defs
     WHERE metric_code IN (${placeholders})`,
    metricCodes
  );

  const metricMap = new Map(rows.map((item) => [item.metricCode, item]));
  for (const metric of metrics) {
    if (metricMap.has(metric.metricCode)) {
      continue;
    }
    const metricName = metric.metricName || metric.metricCode;
    await connection.execute(
      `INSERT INTO iot_metric_defs
        (metric_code, metric_name, category_code, unit_name, value_type, precision_scale,
         chart_color, sort_order, enabled, remark)
       VALUES (?, ?, 'custom', ?, 'decimal', 2, '#2f6b42', 999, 1, '设备自动接入创建')`,
      [metric.metricCode, metricName, metric.unitName || null]
    );
    metricMap.set(metric.metricCode, {
      metricCode: metric.metricCode,
      metricName,
      unitName: metric.unitName || null
    });
  }

  return metricMap;
}

async function ensureSensor(connection, gateway, metric, metricDef, tenantId = null) {
  const sensorCode = buildSensorCode(gateway.gatewayCode, metric.metricCode);
  const [rows] = tenantId
    ? await connection.execute(
      `SELECT id, sensor_code AS sensorCode, sensor_name AS sensorName, area_id AS areaId, gateway_id AS gatewayId
       FROM iot_sensors
       WHERE tenant_id = ?
         AND sensor_code = ?
       LIMIT 1`,
      [tenantId, sensorCode]
    )
    : await connection.execute(
      `SELECT id, sensor_code AS sensorCode, sensor_name AS sensorName, area_id AS areaId, gateway_id AS gatewayId
       FROM iot_sensors
       WHERE sensor_code = ?
       LIMIT 1`,
      [sensorCode]
    );

  const sensorName = `${gateway.gatewayName} ${metricDef?.metricName || metric.metricName || metric.metricCode}`;
  const unitName = metric.unitName || metricDef?.unitName || null;

  if (rows.length > 0) {
    await connection.execute(
      `UPDATE iot_sensors
       SET sensor_name = ?, sensor_type = ?, gateway_id = ?, area_id = ?, tenant_id = COALESCE(tenant_id, ?),
           unit_name = ?, sensor_status = 'enabled'
       WHERE id = ?`,
      [sensorName, metric.metricCode, gateway.id, gateway.areaId, tenantId, unitName, rows[0].id]
    );
    return {
      ...rows[0],
      areaId: gateway.areaId,
      gatewayId: gateway.id,
      sensorName
    };
  }

  const [insertResult] = tenantId
    ? await connection.execute(
      `INSERT INTO iot_sensors
        (tenant_id, sensor_code, sensor_name, sensor_type, model_name, protocol_type, gateway_id, area_id,
         install_position, unit_name, sensor_status, calibration_status, remark)
       VALUES (?, ?, ?, ?, 'ESP32-AUTO', 'http', ?, ?, 'auto', ?, 'enabled', 'pending', '设备自动接入创建')`,
      [tenantId, sensorCode, sensorName, metric.metricCode, gateway.id, gateway.areaId, unitName]
    )
    : await connection.execute(
      `INSERT INTO iot_sensors
        (sensor_code, sensor_name, sensor_type, model_name, protocol_type, gateway_id, area_id,
         install_position, unit_name, sensor_status, calibration_status, remark)
       VALUES (?, ?, ?, 'ESP32-AUTO', 'http', ?, ?, 'auto', ?, 'enabled', 'pending', '设备自动接入创建')`,
      [sensorCode, sensorName, metric.metricCode, gateway.id, gateway.areaId, unitName]
    );

  return {
    id: insertResult.insertId,
    sensorCode,
    sensorName,
    areaId: gateway.areaId,
    gatewayId: gateway.id
  };
}

async function ensureSensorChannel(connection, sensorId, metric, metricDef) {
  const channelCode = metric.metricCode;
  const [rows] = await connection.execute(
    `SELECT id
     FROM iot_sensor_channels
     WHERE sensor_id = ? AND channel_code = ?
     LIMIT 1`,
    [sensorId, channelCode]
  );

  if (rows.length > 0) {
    await connection.execute(
      `UPDATE iot_sensor_channels
       SET channel_name = ?, metric_code = ?, unit_name = ?, enabled = 1
       WHERE id = ?`,
      [metricDef?.metricName || metric.metricName || metric.metricCode, metric.metricCode, metric.unitName || metricDef?.unitName || null, rows[0].id]
    );
    return rows[0];
  }

  const [insertResult] = await connection.execute(
    `INSERT INTO iot_sensor_channels
      (sensor_id, channel_code, channel_name, metric_code, unit_name, channel_order, enabled, remark)
     VALUES (?, ?, ?, ?, ?, 1, 1, '设备自动接入创建')`,
    [sensorId, channelCode, metricDef?.metricName || metric.metricName || metric.metricCode, metric.metricCode, metric.unitName || metricDef?.unitName || null]
  );

  return { id: insertResult.insertId };
}

async function insertReading(connection, gateway, sensor, metric, metricDef, normalized) {
  const receivedAt = new Date();
  const collectedAt = normalized.collectedAt || receivedAt;
  const delayMs = Math.max(receivedAt.getTime() - collectedAt.getTime(), 0);
  const hasClientTimestamp = Boolean(normalized.collectedAt);
  const clockSynced = hasClientTimestamp ? 1 : 0;
  const timeQuality = hasClientTimestamp ? classifyTimeQuality(delayMs) : "medium";
  const timeUncertaintyMs = hasClientTimestamp ? Math.min(delayMs, 60000) : 1000;

  const [insertResult] = await connection.execute(
    `INSERT INTO iot_sensor_readings
      (gateway_id, sensor_id, area_id, metric_code, metric_name, metric_value, unit_name,
       data_source, is_backfilled, collected_at, received_at, clock_synced, time_uncertainty_ms,
       time_quality, delay_ms, quality_score, raw_payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      gateway.id,
      sensor.id,
      gateway.areaId,
      metric.metricCode,
      metricDef?.metricName || metric.metricName || metric.metricCode,
      metric.value,
      metric.unitName || metricDef?.unitName || null,
      normalized.dataSource,
      normalized.dataSource === "backfill" ? 1 : 0,
      toMysqlDateTime(collectedAt),
      toMysqlDateTime(receivedAt),
      clockSynced,
      timeUncertaintyMs,
      timeQuality,
      delayMs,
      100,
      JSON.stringify(normalized.rawPayload)
    ]
  );

  return insertResult;
}

async function updateSensorSnapshot(connection, sensorId, metric, normalized) {
  const eventAt = normalized.collectedAt || new Date();
  await connection.execute(
    `UPDATE iot_sensors
     SET current_value_decimal = ?,
         unit_name = COALESCE(?, unit_name),
         sensor_status = 'enabled',
         data_quality_score = 100,
         last_collected_at = ?,
         last_received_at = NOW()
     WHERE id = ?`,
    [metric.value, metric.unitName || null, toMysqlDateTime(eventAt), sensorId]
  );
}

async function updateGatewayHeartbeat(connection, gatewayId, normalized) {
  await connection.execute(
    `UPDATE iot_gateways
     SET online_status = 'online',
         wifi_rssi = ?,
         last_heartbeat_at = NOW(),
         sampling_status = ?,
         applied_command_version = GREATEST(applied_command_version, ?),
         last_sampling_reported_at = NOW(),
         cached_record_count = 0,
         last_backfill_at = CASE WHEN ? = 'backfill' THEN NOW() ELSE last_backfill_at END,
         backfill_status = CASE WHEN ? = 'backfill' THEN 'idle' ELSE backfill_status END,
         status = 'enabled'
     WHERE id = ?`,
    [
      normalized.rssi,
      normalized.samplingStatus,
      normalized.appliedCommandVersion ?? 0,
      normalized.dataSource,
      normalized.dataSource,
      gatewayId
    ]
  );
}

function toMysqlDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

module.exports = iotRoutes;
