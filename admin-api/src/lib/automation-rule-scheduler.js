// @ts-check

const mysql = require("./mysql");
const { optionalString } = require("./helpers");

const SCHEDULER_INTERVAL_MS = 30 * 1000;
const MAX_RULES_PER_RUN = 50;
const MAX_ERROR_TEXT_LENGTH = 240;
const STABLE_WINDOW_TOLERANCE_SEC = 60;
const STALE_READING_FLOOR_SEC = 90;
const ACTIVE_ALERT_STATUSES = ["pending", "acknowledged", "in_progress", "on_hold", "reopened"];
const DEFAULT_GUARD_ALERT_SEVERITY = "high";

let timer = null;
let running = false;

/**
 * @param {unknown} rows
 * @returns {Record<string, unknown>[]}
 */
function asRowArray(rows) {
  return Array.isArray(rows) ? /** @type {Record<string, unknown>[]} */ (rows) : [];
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function normalizeAffectedRows(value) {
  const candidate =
    typeof value === "object" && value
      ? /** @type {{ affectedRows?: unknown }} */ (value)
      : null;
  const affectedRows = Number(candidate?.affectedRows);
  return Number.isFinite(affectedRows) ? affectedRows : 0;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function normalizeInsertId(value) {
  const candidate =
    typeof value === "object" && value
      ? /** @type {{ insertId?: unknown }} */ (value)
      : null;
  const insertId = Number(candidate?.insertId);
  return Number.isFinite(insertId) ? insertId : 0;
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

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function parseMaybeJson(value) {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

function normalizeErrorMessage(error) {
  const message = optionalString(error?.message) || "自动控制执行失败";
  return message.slice(0, MAX_ERROR_TEXT_LENGTH);
}

/**
 * @param {string} controlType
 * @returns {"on" | "off"}
 */
function normalizeControlType(controlType) {
  return String(controlType || "").trim().toLowerCase() === "on" ? "on" : "off";
}

/**
 * @param {Record<string, unknown> | null} actionJson
 * @returns {Record<string, unknown> | null}
 */
function extractControlAction(actionJson) {
  if (!actionJson) {
    return null;
  }
  if (Array.isArray(actionJson.actions)) {
    return actionJson.actions.find((item) => item && item.type === "control") || null;
  }
  return actionJson.type === "control" ? actionJson : null;
}

/**
 * @param {Record<string, unknown> | null} actionJson
 * @returns {Record<string, unknown> | null}
 */
function extractAlertAction(actionJson) {
  if (!actionJson) {
    return null;
  }
  if (Array.isArray(actionJson.actions)) {
    return actionJson.actions.find((item) => item && item.type === "create_alert") || null;
  }
  return actionJson.type === "create_alert" ? actionJson : null;
}

/**
 * @param {string} operator
 * @param {number} value
 * @param {number} threshold
 * @returns {boolean}
 */
function matchesThreshold(operator, value, threshold) {
  switch (operator) {
    case "<":
      return value < threshold;
    case "<=":
      return value <= threshold;
    case ">":
      return value > threshold;
    case ">=":
      return value >= threshold;
    default:
      return false;
  }
}

function buildCommandNo(ruleId) {
  return `AUTO-${ruleId}-${Date.now()}`.slice(0, 64);
}

function buildReasonText(rule, snapshot) {
  const primaryText = `${rule.metric} ${rule.operator} ${rule.threshold}，当前 ${snapshot.latestValue}`;
  const secondaryText = snapshot.secondarySnapshot
    ? `；${formatConditionText(snapshot.secondarySnapshot)}，当前 ${snapshot.secondarySnapshot.latestValue}`
    : "";
  return `${rule.ruleName || rule.ruleCode}: ${primaryText}${secondaryText}`;
}

function buildAlertNo(ruleId) {
  return `ALERT-GUARD-${ruleId}-${Date.now()}`.slice(0, 64);
}

/**
 * @param {unknown} raw
 * @param {number} fallbackStableSeconds
 * @returns {Record<string, unknown> | null}
 */
function normalizeMetricCondition(raw, fallbackStableSeconds) {
  const data = /** @type {Record<string, unknown> | null} */ (parseMaybeJson(raw));
  if (!data) {
    return null;
  }

  const metric = optionalString(data.metric);
  const operator = optionalString(data.operator);
  const threshold = toNullableNumber(data.threshold);
  if (!metric || !operator || threshold === null) {
    return null;
  }

  return {
    metric,
    operator,
    threshold,
    stableSeconds: Math.max(0, Number(data.stableSeconds ?? fallbackStableSeconds ?? 0)),
    summary: optionalString(data.summary) || ""
  };
}

/**
 * @param {unknown} raw
 * @param {number} fallbackStableSeconds
 * @param {string} fallbackSeverity
 * @returns {Record<string, unknown> | null}
 */
function normalizeValueGuard(raw, fallbackStableSeconds, fallbackSeverity) {
  const data = /** @type {Record<string, unknown> | null} */ (parseMaybeJson(raw));
  if (!data || data.enabled === false) {
    return null;
  }

  const minValid = toNullableNumber(data.minValid);
  const maxValid = toNullableNumber(data.maxValid);
  const minRecentPositiveCount = Math.max(0, Number(data.minRecentPositiveCount || 0));
  const recentPositiveWindowSeconds = Math.max(0, Number(data.recentPositiveWindowSeconds || fallbackStableSeconds || 0));
  const recentPositiveThreshold = toNullableNumber(data.recentPositiveThreshold) ?? 0;
  const invalidSampleCount = Math.max(0, Number(data.invalidSampleCount || 0));
  const invalidWindowSeconds = Math.max(0, Number(data.invalidWindowSeconds || fallbackStableSeconds || 0));
  const createAlert = data.createAlert !== false;
  const alertSeverity = optionalString(data.alertSeverity) || fallbackSeverity || DEFAULT_GUARD_ALERT_SEVERITY;

  if (
    minValid === null &&
    maxValid === null &&
    minRecentPositiveCount <= 0 &&
    invalidSampleCount <= 0
  ) {
    return null;
  }

  return {
    minValid,
    maxValid,
    minRecentPositiveCount,
    recentPositiveWindowSeconds,
    recentPositiveThreshold,
    invalidSampleCount,
    invalidWindowSeconds,
    createAlert,
    alertSeverity
  };
}

/**
 * @param {number} value
 * @param {Record<string, unknown> | null} guard
 * @returns {boolean}
 */
function isValueWithinGuardRange(value, guard) {
  if (!guard) {
    return true;
  }
  const minValid = toNullableNumber(guard.minValid);
  const maxValid = toNullableNumber(guard.maxValid);
  if (minValid !== null && value < minValid) {
    return false;
  }
  if (maxValid !== null && value > maxValid) {
    return false;
  }
  return true;
}

/**
 * @param {Record<string, unknown>} condition
 * @returns {string}
 */
function formatConditionText(condition) {
  return `${condition.metric} ${condition.operator} ${condition.threshold}`;
}

/**
 * @param {Record<string, unknown>} row
 * @returns {Record<string, unknown> | null}
 */
function normalizeAutomationRule(row) {
  const conditionJson = /** @type {Record<string, unknown> | null} */ (parseMaybeJson(row.conditionJson));
  const actionJson = /** @type {Record<string, unknown> | null} */ (parseMaybeJson(row.actionJson));
  const controlAction = extractControlAction(actionJson);
  const alertAction = extractAlertAction(actionJson);
  const targetIds = parseMaybeJson(row.targetIdsJson);
  const targetIdList = Array.isArray(targetIds) ? targetIds : [];

  const metric = optionalString(conditionJson?.metric);
  const operator = optionalString(conditionJson?.operator);
  const threshold = toNullableNumber(conditionJson?.threshold);
  const stableSeconds = Math.max(0, Number(conditionJson?.stableSeconds || 0));
  const areaId = toNullableNumber(conditionJson?.areaId);
  const actuatorId = toNullableNumber(controlAction?.actuatorId) ?? toNullableNumber(targetIdList[0]);
  const controlType = normalizeControlType(String(controlAction?.controlType || ""));
  const durationSeconds = Math.max(0, Number(controlAction?.durationSeconds || 0));
  const secondaryCondition = normalizeMetricCondition(conditionJson?.secondaryCondition, stableSeconds);
  const valueGuard = normalizeValueGuard(
    conditionJson?.valueGuard,
    stableSeconds,
    optionalString(alertAction?.severity) || DEFAULT_GUARD_ALERT_SEVERITY
  );

  if (!metric || !operator || threshold === null || !actuatorId) {
    return null;
  }

  return {
    id: Number(row.id),
    tenantId: toNullableNumber(row.tenantId),
    ruleCode: optionalString(row.ruleCode) || `RULE-${row.id}`,
    ruleName: optionalString(row.ruleName) || optionalString(row.ruleCode) || `规则 ${row.id}`,
    metric,
    operator,
    threshold,
    stableSeconds,
    areaId,
    cooldownSeconds: Math.max(0, Number(row.cooldownSeconds || 0)),
    dailyMaxExecutions: Math.max(0, Number(row.dailyMaxExecutions || 0)),
    recoveryPolicy: optionalString(row.recoveryPolicy) || "manual_close",
    secondaryCondition,
    valueGuard,
    actuatorId,
    controlType,
    durationSeconds
  };
}

async function fetchEnabledAutomationRules() {
  const rows = asRowArray(await mysql.query(
    `SELECT
       id,
       tenant_id AS tenantId,
       rule_code AS ruleCode,
       rule_name AS ruleName,
       condition_json AS conditionJson,
       action_json AS actionJson,
       target_ids_json AS targetIdsJson,
       cooldown_seconds AS cooldownSeconds,
       daily_max_executions AS dailyMaxExecutions,
       recovery_policy AS recoveryPolicy
     FROM rule_definitions
     WHERE enabled = 1
       AND rule_type = 'threshold'
     ORDER BY priority ASC, id ASC
     LIMIT ${MAX_RULES_PER_RUN}`
  ));

  return rows
    .map((row) => normalizeAutomationRule(row))
    .filter((row) => row !== null);
}

async function fetchMetricSnapshot(areaId, condition) {
  if (!areaId || !condition?.metric) {
    return { status: "missing" };
  }

  const latestRows = asRowArray(await mysql.query(
    `SELECT
       sensor_id AS sensorId,
       gateway_id AS gatewayId,
       unit_name AS unitName,
       metric_value AS latestValue,
       received_at AS latestReceivedAt,
       TIMESTAMPDIFF(SECOND, received_at, NOW()) AS latestAgeSec
     FROM iot_sensor_readings
     WHERE area_id = ?
       AND metric_code = ?
     ORDER BY received_at DESC, id DESC
     LIMIT 1`,
    [areaId, condition.metric]
  ));
  const latest = latestRows[0];
  if (!latest) {
    return { status: "missing" };
  }

  const latestValue = Number(latest.latestValue);
  const latestAgeSec = Number(latest.latestAgeSec || 0);
  const staleAgeLimitSec = Math.max(STALE_READING_FLOOR_SEC, Number(condition.stableSeconds || 0) + 60);
  if (!Number.isFinite(latestValue) || latestAgeSec > staleAgeLimitSec) {
    return {
      status: "stale",
      metric: condition.metric,
      latestValue,
      latestAgeSec,
      sensorId: toNullableNumber(latest.sensorId),
      gatewayId: toNullableNumber(latest.gatewayId),
      unitName: optionalString(latest.unitName),
      latestReceivedAt: latest.latestReceivedAt
    };
  }

  const baseSnapshot = {
    metric: condition.metric,
    operator: condition.operator,
    threshold: condition.threshold,
    stableSeconds: Number(condition.stableSeconds || 0),
    sensorId: toNullableNumber(latest.sensorId),
    gatewayId: toNullableNumber(latest.gatewayId),
    unitName: optionalString(latest.unitName),
    latestValue,
    latestAgeSec,
    latestReceivedAt: latest.latestReceivedAt,
    sampleCount: 1,
    coverageSec: 0,
    minValue: latestValue,
    maxValue: latestValue
  };

  if (!matchesThreshold(condition.operator, latestValue, condition.threshold)) {
    return {
      status: "no_match",
      ...baseSnapshot
    };
  }

  if (Number(condition.stableSeconds || 0) <= 0) {
    return {
      status: "matched",
      ...baseSnapshot
    };
  }

  const stableWindowSeconds = Math.max(1, Math.trunc(Number(condition.stableSeconds || 0)));
  const stableRows = asRowArray(await mysql.query(
    `SELECT
       MIN(metric_value) AS min_value,
       MAX(metric_value) AS max_value,
       COUNT(*) AS sample_count,
       TIMESTAMPDIFF(SECOND, MIN(received_at), MAX(received_at)) AS coverage_sec
     FROM iot_sensor_readings
     WHERE area_id = ?
       AND metric_code = ?
       AND received_at >= DATE_SUB(NOW(), INTERVAL ${stableWindowSeconds} SECOND)`,
    [areaId, condition.metric]
  ));
  const stable = stableRows[0] || {};
  const coverageSec = Number(stable.coverage_sec || 0);
  const sampleCount = Number(stable.sample_count || 0);
  const minValue = Number(stable.min_value);
  const maxValue = Number(stable.max_value);
  const toleranceSec = Math.min(STABLE_WINDOW_TOLERANCE_SEC, stableWindowSeconds);

  if (sampleCount < 2 || coverageSec < Math.max(stableWindowSeconds - toleranceSec, 0)) {
    return {
      status: "no_match",
      ...baseSnapshot,
      sampleCount,
      coverageSec,
      minValue,
      maxValue
    };
  }

  if (condition.operator === "<" || condition.operator === "<=") {
    if (!matchesThreshold(condition.operator, maxValue, condition.threshold)) {
      return {
        status: "no_match",
        ...baseSnapshot,
        sampleCount,
        coverageSec,
        minValue,
        maxValue
      };
    }
  } else if (condition.operator === ">" || condition.operator === ">=") {
    if (!matchesThreshold(condition.operator, minValue, condition.threshold)) {
      return {
        status: "no_match",
        ...baseSnapshot,
        sampleCount,
        coverageSec,
        minValue,
        maxValue
      };
    }
  } else {
    return {
      status: "no_match",
      ...baseSnapshot,
      sampleCount,
      coverageSec,
      minValue,
      maxValue
    };
  }

  return {
    status: "matched",
    ...baseSnapshot,
    sampleCount,
    coverageSec,
    minValue,
    maxValue
  };
}

async function fetchPositiveCount(areaId, metric, windowSeconds, threshold) {
  const safeWindowSeconds = Math.max(1, Math.trunc(windowSeconds));
  const rows = asRowArray(await mysql.query(
    `SELECT
       COUNT(*) AS sample_count,
       SUM(CASE WHEN metric_value > ? THEN 1 ELSE 0 END) AS positive_count
     FROM iot_sensor_readings
     WHERE area_id = ?
       AND metric_code = ?
       AND received_at >= DATE_SUB(NOW(), INTERVAL ${safeWindowSeconds} SECOND)`,
    [threshold, areaId, metric]
  ));
  const data = rows[0] || {};
  return {
    sampleCount: Number(data.sample_count || 0),
    positiveCount: Number(data.positive_count || 0)
  };
}

async function fetchInvalidCount(areaId, metric, windowSeconds, guard) {
  const safeWindowSeconds = Math.max(1, Math.trunc(windowSeconds));
  const clauses = [];
  const rangeParams = [];
  const minValid = toNullableNumber(guard?.minValid);
  const maxValid = toNullableNumber(guard?.maxValid);

  if (minValid !== null) {
    clauses.push("metric_value < ?");
    rangeParams.push(minValid);
  }
  if (maxValid !== null) {
    clauses.push("metric_value > ?");
    rangeParams.push(maxValid);
  }
  if (clauses.length === 0) {
    return { sampleCount: 0, invalidCount: 0 };
  }

  const rows = asRowArray(await mysql.query(
    `SELECT
       COUNT(*) AS sample_count,
       SUM(CASE WHEN ${clauses.join(" OR ")} THEN 1 ELSE 0 END) AS invalid_count
     FROM iot_sensor_readings
     WHERE area_id = ?
       AND metric_code = ?
       AND received_at >= DATE_SUB(NOW(), INTERVAL ${safeWindowSeconds} SECOND)`,
    [...rangeParams, areaId, metric]
  ));
  const data = rows[0] || {};
  return {
    sampleCount: Number(data.sample_count || 0),
    invalidCount: Number(data.invalid_count || 0)
  };
}

async function evaluateRuleSnapshot(rule) {
  const primaryCondition = {
    metric: rule.metric,
    operator: rule.operator,
    threshold: rule.threshold,
    stableSeconds: rule.stableSeconds
  };
  const primarySnapshot = await fetchMetricSnapshot(rule.areaId, primaryCondition);
  if (primarySnapshot.status !== "matched") {
    return primarySnapshot;
  }

  if (rule.valueGuard) {
    if (!isValueWithinGuardRange(primarySnapshot.latestValue, rule.valueGuard)) {
      const invalidSampleCount = Math.max(0, Number(rule.valueGuard.invalidSampleCount || 0));
      const invalidWindowSeconds = Math.max(1, Number(rule.valueGuard.invalidWindowSeconds || rule.stableSeconds || 60));
      const invalidStats = invalidSampleCount > 0
        ? await fetchInvalidCount(rule.areaId, rule.metric, invalidWindowSeconds, rule.valueGuard)
        : { sampleCount: 0, invalidCount: 0 };

      return {
        ...primarySnapshot,
        status: "guard_blocked",
        guardType: "invalid_range",
        guardReason: `${rule.metric} 最新值 ${primarySnapshot.latestValue} 超出有效范围`,
        shouldAlert: Boolean(rule.valueGuard.createAlert) && (
          invalidSampleCount <= 0 || invalidStats.invalidCount >= invalidSampleCount
        ),
        guardStats: invalidStats
      };
    }

    const minRecentPositiveCount = Math.max(0, Number(rule.valueGuard.minRecentPositiveCount || 0));
    if (minRecentPositiveCount > 0) {
      const recentPositiveWindowSeconds = Math.max(1, Number(rule.valueGuard.recentPositiveWindowSeconds || rule.stableSeconds || 60));
      const recentPositiveThreshold = Number(rule.valueGuard.recentPositiveThreshold || 0);
      const positiveStats = await fetchPositiveCount(rule.areaId, rule.metric, recentPositiveWindowSeconds, recentPositiveThreshold);
      if (positiveStats.positiveCount < minRecentPositiveCount) {
        return {
          ...primarySnapshot,
          status: "guard_blocked",
          guardType: "recent_positive",
          guardReason: `${rule.metric} 最近 ${recentPositiveWindowSeconds} 秒内正样本不足`,
          shouldAlert: Boolean(rule.valueGuard.createAlert),
          guardStats: positiveStats
        };
      }
    }
  }

  if (rule.secondaryCondition) {
    const secondarySnapshot = await fetchMetricSnapshot(rule.areaId, rule.secondaryCondition);
    if (secondarySnapshot.status !== "matched") {
      return {
        status: "secondary_miss",
        primarySnapshot,
        secondarySnapshot
      };
    }
    return {
      status: "matched",
      ...primarySnapshot,
      secondarySnapshot
    };
  }

  return primarySnapshot;
}

function buildGuardAlertTitle(rule, evaluation) {
  if (evaluation.guardType === "invalid_range") {
    return `${rule.ruleName || rule.ruleCode}：${rule.metric} 数据异常`;
  }
  if (evaluation.guardType === "recent_positive") {
    return `${rule.ruleName || rule.ruleCode}：${rule.metric} 数据缺少有效样本`;
  }
  return `${rule.ruleName || rule.ruleCode}：自动控制保护已拦截`;
}

function buildGuardAlertContent(rule, evaluation) {
  if (evaluation.guardType === "invalid_range") {
    const minValid = toNullableNumber(rule.valueGuard?.minValid);
    const maxValid = toNullableNumber(rule.valueGuard?.maxValid);
    const rangeText = [minValid !== null ? `>= ${minValid}` : "", maxValid !== null ? `<= ${maxValid}` : ""]
      .filter(Boolean)
      .join(" 且 ");
    return `${rule.metric} 最新值 ${evaluation.latestValue} 超出有效范围${rangeText ? `（应为 ${rangeText}）` : ""}，已阻止自动控制。`;
  }
  if (evaluation.guardType === "recent_positive") {
    const windowSeconds = Number(rule.valueGuard?.recentPositiveWindowSeconds || rule.stableSeconds || 0);
    const minCount = Number(rule.valueGuard?.minRecentPositiveCount || 0);
    const actualCount = Number(evaluation.guardStats?.positiveCount || 0);
    return `${rule.metric} 最近 ${windowSeconds} 秒内仅有 ${actualCount} 个大于 ${Number(rule.valueGuard?.recentPositiveThreshold || 0)} 的样本，低于保护阈值 ${minCount}，已阻止自动控制。`;
  }
  return `${evaluation.guardReason || "数据保护规则已拦截本次自动控制"}。`;
}

async function upsertGuardAlert(rule, evaluation, logger) {
  if (!rule.valueGuard?.createAlert) {
    return null;
  }

  const sensorId = toNullableNumber(evaluation.sensorId);
  const gatewayId = toNullableNumber(evaluation.gatewayId);
  const areaId = toNullableNumber(rule.areaId);
  const activeStatusPlaceholders = ACTIVE_ALERT_STATUSES.map(() => "?").join(", ");
  const alertTitle = buildGuardAlertTitle(rule, evaluation);
  const alertContent = buildGuardAlertContent(rule, evaluation);
  const existingRows = asRowArray(await mysql.query(
    `SELECT id
     FROM ops_alerts
     WHERE rule_id = ?
       AND alert_type = 'invalid_sensor_value'
       AND gateway_id <=> ?
       AND sensor_id <=> ?
       AND status IN (${activeStatusPlaceholders})
     ORDER BY id DESC
     LIMIT 1`,
    [rule.id, gatewayId, sensorId, ...ACTIVE_ALERT_STATUSES]
  ));

  if (existingRows[0]?.id) {
    await mysql.query(
      `UPDATE ops_alerts
       SET current_value_decimal = ?,
           unit_name = ?,
           title = ?,
           content_text = ?,
           last_transition_at = NOW()
       WHERE id = ?`,
      [evaluation.latestValue, evaluation.unitName || null, alertTitle, alertContent, existingRows[0].id]
    );
    return { alertId: Number(existingRows[0].id), mode: "updated" };
  }

  const result = await mysql.query(
    `INSERT INTO ops_alerts
      (tenant_id, alert_no, rule_id, area_id, gateway_id, sensor_id, actuator_id, alert_type, severity, status,
       title, content_text, current_value_decimal, unit_name, trigger_source, triggered_at, last_transition_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'invalid_sensor_value', ?, 'pending', ?, ?, ?, ?, 'rule', NOW(), NOW())`,
    [
      rule.tenantId,
      buildAlertNo(rule.id),
      rule.id,
      areaId,
      gatewayId,
      sensorId,
      rule.actuatorId,
      optionalString(rule.valueGuard?.alertSeverity) || DEFAULT_GUARD_ALERT_SEVERITY,
      alertTitle,
      alertContent,
      evaluation.latestValue,
      evaluation.unitName || null
    ]
  );
  const alertId = normalizeInsertId(result);
  logger?.warn?.(
    {
      ruleId: rule.id,
      ruleCode: rule.ruleCode,
      alertId,
      guardType: evaluation.guardType,
      latestValue: evaluation.latestValue
    },
    "automation rule blocked by value guard"
  );
  return { alertId, mode: "created" };
}

async function executeAutomationRule(rule, logger) {
  const evaluation = await evaluateRuleSnapshot(rule);
  if (evaluation.status === "guard_blocked") {
    if (evaluation.shouldAlert) {
      await upsertGuardAlert(rule, evaluation, logger);
    }
    return null;
  }
  if (evaluation.status !== "matched") {
    return null;
  }
  const snapshot = evaluation;

  const connection = await mysql.pool.getConnection();
  try {
    await connection.beginTransaction();

    const tenantClause = rule.tenantId ? "AND a.tenant_id = ?" : "";
    const tenantParams = rule.tenantId ? [rule.tenantId] : [];
    const [actuatorRows] = await connection.execute(
      `SELECT
         a.id,
         a.tenant_id AS tenantId,
         a.actuator_code AS actuatorCode,
         a.actuator_name AS actuatorName,
         a.area_id AS areaId,
         a.max_run_seconds AS maxRunSeconds,
         a.desired_state_text AS desiredStateText,
         a.reported_state_text AS reportedStateText,
         a.shadow_status AS shadowStatus,
         a.status AS actuatorStatus,
         g.id AS gatewayId,
         g.online_status AS onlineStatus,
         g.backfill_status AS backfillStatus
       FROM iot_actuators a
       LEFT JOIN iot_gateways g ON g.id = a.gateway_id
       WHERE a.id = ?
         ${tenantClause}
       LIMIT 1
       FOR UPDATE`,
      [rule.actuatorId, ...tenantParams]
    );
    const actuator = actuatorRows[0];
    if (!actuator || actuator.actuatorStatus !== "enabled" || !actuator.gatewayId) {
      await connection.rollback();
      return null;
    }
    if (actuator.onlineStatus !== "online" || actuator.backfillStatus === "running") {
      await connection.rollback();
      return null;
    }

    const desiredState = normalizeControlType(String(actuator.desiredStateText || ""));
    const reportedState = normalizeControlType(String(actuator.reportedStateText || ""));
    if (rule.controlType === "on" && (desiredState === "on" || reportedState === "on")) {
      await connection.rollback();
      return null;
    }
    if (rule.controlType === "off" && desiredState === "off" && reportedState === "off" && actuator.shadowStatus === "sync") {
      await connection.rollback();
      return null;
    }

    const [pendingRows] = await connection.execute(
      `SELECT id
       FROM ops_control_commands
       WHERE actuator_id = ?
         AND request_status IN ('queued', 'sent', 'acknowledged')
       ORDER BY queued_at ASC, id ASC
       LIMIT 1`,
      [actuator.id]
    );
    if (asRowArray(pendingRows).length > 0) {
      await connection.rollback();
      return null;
    }

    if (rule.cooldownSeconds > 0) {
      const cooldownSeconds = Math.max(1, Math.trunc(rule.cooldownSeconds));
      const [cooldownRows] = await connection.execute(
        `SELECT COUNT(*) AS commandCount
         FROM ops_control_commands
         WHERE actuator_id = ?
           AND source_type = 'auto'
           AND JSON_UNQUOTE(JSON_EXTRACT(requested_state_json, '$.ruleCode')) = ?
           AND queued_at >= DATE_SUB(NOW(), INTERVAL ${cooldownSeconds} SECOND)`,
        [actuator.id, rule.ruleCode]
      );
      if (Number(cooldownRows[0]?.commandCount || 0) > 0) {
        await connection.rollback();
        return null;
      }
    }

    if (rule.dailyMaxExecutions > 0) {
      const [dailyRows] = await connection.execute(
        `SELECT COUNT(*) AS commandCount
         FROM ops_control_commands
         WHERE actuator_id = ?
           AND source_type = 'auto'
           AND JSON_UNQUOTE(JSON_EXTRACT(requested_state_json, '$.ruleCode')) = ?
           AND DATE(queued_at) = CURRENT_DATE()`,
        [actuator.id, rule.ruleCode]
      );
      if (Number(dailyRows[0]?.commandCount || 0) >= rule.dailyMaxExecutions) {
        await connection.rollback();
        return null;
      }
    }

    const normalizedControlType = normalizeControlType(rule.controlType);
    const requestedStateJson = JSON.stringify({
      power: normalizedControlType,
      ruleId: rule.id,
      ruleCode: rule.ruleCode,
      triggerMetric: rule.metric,
      triggerOperator: rule.operator,
      triggerThreshold: rule.threshold,
      triggeredMetricValue: snapshot.latestValue,
      secondaryMetric: snapshot.secondarySnapshot?.metric || null,
      secondaryTriggeredMetricValue: snapshot.secondarySnapshot?.latestValue ?? null,
      triggerAreaId: rule.areaId || actuator.areaId,
      stableSeconds: rule.stableSeconds,
      durationSeconds: rule.durationSeconds,
      recoveryPolicy: rule.recoveryPolicy
    });
    const commandNo = buildCommandNo(rule.id);
    const reasonText = buildReasonText(rule, snapshot);

    const [commandResult] = await connection.execute(
      `INSERT INTO ops_control_commands
        (tenant_id, command_no, area_id, gateway_id, actuator_id, source_type, mode_type, control_type,
         requested_state_json, duration_seconds, force_execute, reason_text, requested_by,
         request_status, device_online, backfill_in_progress)
       VALUES (?, ?, ?, ?, ?, 'auto', 'auto', ?, ?, ?, 0, ?, NULL, 'queued', ?, ?)`,
      [
        actuator.tenantId,
        commandNo,
        rule.areaId || actuator.areaId,
        actuator.gatewayId,
        actuator.id,
        normalizedControlType,
        requestedStateJson,
        rule.durationSeconds,
        reasonText,
        actuator.onlineStatus === "online" ? 1 : 0,
        actuator.backfillStatus === "running" ? 1 : 0
      ]
    );
    const commandId = normalizeInsertId(commandResult);

    await connection.execute(
      `INSERT INTO ops_control_executions
        (command_id, gateway_id, actuator_id, execution_status, desired_state_json, shadow_status_after, result_message)
       VALUES (?, ?, ?, 'pending', ?, 'pending', ?)`,
      [
        commandId,
        actuator.gatewayId,
        actuator.id,
        requestedStateJson,
        `自动策略 ${rule.ruleCode} 已入队，等待设备执行`
      ]
    );

    await connection.execute(
      `UPDATE iot_actuators
       SET desired_state_text = ?, shadow_status = 'pending'
       WHERE id = ?`,
      [normalizedControlType, actuator.id]
    );

    await connection.execute(
      `INSERT INTO iot_device_shadow
        (actuator_id, desired_state_json, reported_state_json, shadow_status,
         desired_updated_at, reported_updated_at, last_command_id, last_command_result, drift_seconds)
       VALUES (?, ?, NULL, 'pending', NOW(), NULL, ?, ?, 0)
       ON DUPLICATE KEY UPDATE
         desired_state_json = VALUES(desired_state_json),
         shadow_status = 'pending',
         desired_updated_at = NOW(),
         last_command_id = VALUES(last_command_id),
         last_command_result = VALUES(last_command_result)`,
      [actuator.id, requestedStateJson, commandId, "自动策略触发，命令已入队"]
    );

    await connection.commit();

    logger?.info?.(
      {
        ruleId: rule.id,
        ruleCode: rule.ruleCode,
        gatewayId: actuator.gatewayId,
        actuatorId: actuator.id,
        commandId,
        metric: rule.metric,
        threshold: rule.threshold,
        latestValue: snapshot.latestValue,
        secondaryMetric: snapshot.secondarySnapshot?.metric || null,
        secondaryLatestValue: snapshot.secondarySnapshot?.latestValue ?? null
      },
      "automation rule queued control command"
    );

    return {
      commandId,
      actuatorId: actuator.id,
      gatewayId: actuator.gatewayId,
      latestValue: snapshot.latestValue
    };
  } catch (error) {
    await connection.rollback();
    logger?.warn?.(
      {
        ruleId: rule.id,
        ruleCode: rule.ruleCode,
        err: error
      },
      "automation rule execution failed"
    );
    return null;
  } finally {
    connection.release();
  }
}

async function pollAutomationRules(logger) {
  if (running) {
    return;
  }

  running = true;
  try {
    const rules = await fetchEnabledAutomationRules();
    for (const rule of rules) {
      await executeAutomationRule(rule, logger);
    }
  } catch (error) {
    logger?.error?.({ err: normalizeErrorMessage(error) }, "automation rule scheduler crashed");
  } finally {
    running = false;
  }
}

function startAutomationRuleScheduler(logger) {
  if (timer) {
    return timer;
  }

  void pollAutomationRules(logger);
  timer = setInterval(() => {
    pollAutomationRules(logger);
  }, SCHEDULER_INTERVAL_MS);
  timer.unref?.();
  return timer;
}

module.exports = {
  startAutomationRuleScheduler,
  pollAutomationRules
};
