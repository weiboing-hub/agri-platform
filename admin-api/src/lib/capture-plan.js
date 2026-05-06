// @ts-check

const { AppError } = require("./app-error");
const { query } = require("./mysql");
const { optionalString, parseInteger } = require("./helpers");
const { sqlDateTime } = require("./camera-capture");

/**
 * @typedef {{
 *   scheduleType?: string;
 *   schedule_type?: string;
 *   intervalMinutes?: string | number | null;
 *   interval_minutes?: string | number | null;
 *   dailyTime?: string | null;
 *   daily_time?: string | null;
 * }} CapturePlanLike
 *
 * @typedef {{
 *   hour: number;
 *   minute: number;
 *   value: string;
 * }} DailyTimeValue
 */

/**
 * @param {number | string} value
 * @returns {string}
 */
function pad(value) {
  return String(value).padStart(2, "0");
}

/**
 * @param {unknown} value
 * @returns {DailyTimeValue | null}
 */
function parseDailyTime(value) {
  const safe = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(safe)) {
    return null;
  }

  const [hourText, minuteText] = safe.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (
    Number.isNaN(hour)
    || Number.isNaN(minute)
    || hour < 0
    || hour > 23
    || minute < 0
    || minute > 59
  ) {
    return null;
  }

  return { hour, minute, value: `${pad(hour)}:${pad(minute)}` };
}

/**
 * @param {Record<string, unknown> | null | undefined} body
 * @returns {{ scheduleType: string; intervalMinutes: number | null; dailyTime: string | null }}
 */
function assertCapturePlanPayload(body) {
  const scheduleType = optionalString(body?.scheduleType);
  if (!["interval", "daily"].includes(scheduleType)) {
    throw new AppError("bad_request", "scheduleType 仅支持 interval 或 daily", 400);
  }

  const intervalMinutes = parseInteger(body?.intervalMinutes);
  const dailyTime = parseDailyTime(body?.dailyTime);

  if (scheduleType === "interval" && (!intervalMinutes || intervalMinutes < 1)) {
    throw new AppError("bad_request", "intervalMinutes 必须大于 0", 400);
  }

  if (scheduleType === "daily" && !dailyTime) {
    throw new AppError("bad_request", "dailyTime 必须是 HH:mm 格式", 400);
  }

  return {
    scheduleType,
    intervalMinutes: scheduleType === "interval" ? intervalMinutes : null,
    dailyTime: scheduleType === "daily" ? dailyTime.value : null
  };
}

/**
 * @param {CapturePlanLike} plan
 * @param {string | Date | null} [fromTime]
 * @returns {string | null}
 */
function computeNextTriggerAt(plan, fromTime = null) {
  const now = fromTime ? new Date(fromTime) : new Date();
  const safeNow = Number.isNaN(now.getTime()) ? new Date() : now;
  const scheduleType = optionalString(plan.scheduleType || plan.schedule_type);

  if (scheduleType === "interval") {
    const intervalMinutes = parseInteger(plan.intervalMinutes || plan.interval_minutes);
    if (!intervalMinutes || intervalMinutes < 1) {
      return null;
    }
    const next = new Date(safeNow.getTime());
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + intervalMinutes);
    return sqlDateTime(next);
  }

  if (scheduleType === "daily") {
    const parsed = parseDailyTime(plan.dailyTime || plan.daily_time);
    if (!parsed) {
      return null;
    }
    const candidate = new Date(safeNow.getTime());
    candidate.setSeconds(0, 0);
    candidate.setHours(parsed.hour, parsed.minute, 0, 0);
    if (candidate.getTime() <= safeNow.getTime()) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return sqlDateTime(candidate);
  }

  return null;
}

/**
 * @param {CapturePlanLike} plan
 * @param {string | Date | null} [dueAt]
 * @param {string | Date | null} [executedAt]
 * @returns {string | null}
 */
function computeNextTriggerAfterExecution(plan, dueAt = null, executedAt = null) {
  const executedDate = executedAt ? new Date(executedAt) : new Date();
  const safeExecutedDate = Number.isNaN(executedDate.getTime()) ? new Date() : executedDate;
  const dueDate = dueAt ? new Date(dueAt) : safeExecutedDate;
  const safeDueDate = Number.isNaN(dueDate.getTime()) ? safeExecutedDate : dueDate;
  const scheduleType = optionalString(plan.scheduleType || plan.schedule_type);

  if (scheduleType === "interval") {
    const intervalMinutes = parseInteger(plan.intervalMinutes || plan.interval_minutes);
    if (!intervalMinutes || intervalMinutes < 1) {
      return null;
    }

    const next = new Date(safeDueDate.getTime());
    do {
      next.setMinutes(next.getMinutes() + intervalMinutes);
    } while (next.getTime() <= safeExecutedDate.getTime());
    next.setSeconds(0, 0);
    return sqlDateTime(next);
  }

  return computeNextTriggerAt(plan, safeExecutedDate);
}

/**
 * @param {CapturePlanLike | null | undefined} plan
 * @returns {string}
 */
function buildCapturePlanSummary(plan) {
  if (!plan) {
    return "";
  }
  if ((plan.scheduleType || plan.schedule_type) === "interval") {
    const intervalMinutes = parseInteger(plan.intervalMinutes || plan.interval_minutes);
    return `每 ${intervalMinutes} 分钟`;
  }
  if ((plan.scheduleType || plan.schedule_type) === "daily") {
    return `每日 ${plan.dailyTime || plan.daily_time}`;
  }
  return "-";
}

/**
 * @param {number | string} planId
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function getCapturePlanContext(planId) {
  const rows = await query(
    `SELECT
       p.id,
       p.plan_no AS planNo,
       p.tenant_id AS tenantId,
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
       c.area_id AS areaId,
       c.camera_code AS cameraCode,
       c.camera_name AS cameraName
     FROM iot_camera_capture_plans p
     INNER JOIN iot_cameras c ON c.id = p.camera_id
     WHERE p.id = ?
     LIMIT 1`,
    [planId]
  );

  return rows[0] || null;
}

module.exports = {
  assertCapturePlanPayload,
  computeNextTriggerAt,
  computeNextTriggerAfterExecution,
  buildCapturePlanSummary,
  getCapturePlanContext
};
