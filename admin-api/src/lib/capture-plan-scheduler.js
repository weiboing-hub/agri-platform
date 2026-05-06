// @ts-check

const { query } = require("./mysql");
const { optionalString } = require("./helpers");
const { createCameraCapture, sqlDateTime } = require("./camera-capture");
const {
  computeNextTriggerAfterExecution,
  getCapturePlanContext
} = require("./capture-plan");

const SCHEDULER_INTERVAL_MS = 30 * 1000;
const MAX_PLANS_PER_RUN = 20;
const MAX_ERROR_TEXT_LENGTH = 240;

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

function normalizeErrorMessage(error) {
  const message = optionalString(error?.message) || "执行失败";
  return message.slice(0, MAX_ERROR_TEXT_LENGTH);
}

async function executeCapturePlan(planId, logger) {
  const plan = await getCapturePlanContext(planId);
  if (!plan || plan.status !== "enabled" || !plan.nextTriggerAt) {
    return;
  }

  const claimedAt = sqlDateTime();
  const nextTriggerAt = computeNextTriggerAfterExecution(
    plan,
    /** @type {string | Date | null} */ (plan.nextTriggerAt || null),
    claimedAt
  );
  const claimResult = await query(
    `UPDATE iot_camera_capture_plans
     SET last_triggered_at = ?, next_trigger_at = ?, last_error_message = NULL
     WHERE id = ? AND status = 'enabled' AND next_trigger_at = ?`,
    [claimedAt, nextTriggerAt, planId, plan.nextTriggerAt]
  );

  if (!normalizeAffectedRows(claimResult)) {
    return;
  }

  try {
    const captureResult = await createCameraCapture({
      cameraId: plan.cameraId,
      triggerType: "schedule",
      triggerSourceType: "capture_plan",
      triggerSourceId: planId,
      capturePurpose: plan.capturePurpose,
      remark: plan.remark,
      executionMode: "scheduler",
      scheduledAt: plan.nextTriggerAt,
      createdBy: null
    });

    await query(
      `UPDATE iot_camera_capture_plans
       SET last_job_id = ?, last_snapshot_id = ?, last_success_at = ?, last_error_message = NULL
       WHERE id = ?`,
      [captureResult.jobId, captureResult.snapshotId, claimedAt, planId]
    );
  } catch (error) {
    await query(
      `UPDATE iot_camera_capture_plans
       SET last_failure_at = ?, last_error_message = ?
       WHERE id = ?`,
      [claimedAt, normalizeErrorMessage(error), planId]
    );

    logger?.warn?.(
      {
        planId,
        cameraId: plan.cameraId,
        tenantId: plan.tenantId,
        err: error
      },
      "capture plan execution failed"
    );
  }
}

async function pollDueCapturePlans(logger) {
  if (running) {
    return;
  }

  running = true;
  try {
    const now = sqlDateTime();
    const rows = asRowArray(await query(
      `SELECT id
       FROM iot_camera_capture_plans
       WHERE status = 'enabled'
         AND next_trigger_at IS NOT NULL
         AND next_trigger_at <= ?
       ORDER BY next_trigger_at ASC, id ASC
       LIMIT ${MAX_PLANS_PER_RUN}`,
      [now]
    ));

    for (const row of rows) {
      await executeCapturePlan(row.id, logger);
    }
  } catch (error) {
    logger?.error?.({ err: error }, "capture plan scheduler crashed");
  } finally {
    running = false;
  }
}

function startCapturePlanScheduler(logger) {
  if (timer) {
    return timer;
  }

  timer = setInterval(() => {
    pollDueCapturePlans(logger);
  }, SCHEDULER_INTERVAL_MS);
  timer.unref?.();
  return timer;
}

module.exports = {
  startCapturePlanScheduler,
  pollDueCapturePlans
};
