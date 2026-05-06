const { query } = require("./mysql");
const { extractTenantId } = require("./tenant-foundation");

function safeJson(value) {
  if (value === undefined) {
    return null;
  }
  return value === null ? null : JSON.stringify(value);
}

async function logOperation(request, payload = {}) {
  const {
    moduleCode,
    operationType,
    targetType = null,
    targetId = null,
    requestParams = null,
    resultStatus = "success",
    resultMessage = null
  } = payload;

  if (!moduleCode || !operationType) {
    return;
  }

  await query(
    `INSERT INTO sys_operation_logs
      (tenant_id, log_no, module_code, operation_type, operator_user_id, operator_ip, target_type, target_id,
       request_method, request_path, request_params_json, result_status, result_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      extractTenantId(request.auth),
      `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      moduleCode,
      operationType,
      request.auth?.user?.id || null,
      request.ip || request.headers["x-forwarded-for"] || "127.0.0.1",
      targetType,
      targetId === null || targetId === undefined ? null : String(targetId),
      request.method,
      request.routerPath || request.url,
      safeJson(requestParams),
      resultStatus,
      resultMessage
    ]
  );
}

module.exports = {
  logOperation
};
