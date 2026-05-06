// @ts-check

const { AppError } = require("./app-error");

/**
 * @typedef {"assign" | "confirm" | "process" | "hold" | "ignore" | "close" | "reopen"} AlertActionType
 * @typedef {{ permission: string; targetStatus: string | null }} AlertActionConfig
 * @typedef {{ permissionCodes?: string[] | null }} AlertAuthContext
 * @typedef {{ status: string; assignedTo?: number | null }} AlertRecord
 * @typedef {{
 *   assignedTo?: number | string | null;
 *   assigneeExists?: boolean;
 *   remarkText?: string | null;
 *   now?: Date;
 * }} AlertTransitionOptions
 * @typedef {{
 *   nextStatus: string;
 *   nextAssignedTo: number | null;
 *   closedAt: Date | null;
 *   closedReason: string | null;
 *   closeSource: string | null;
 *   reopenDelta: number;
 * }} AlertTransitionPlan
 */

/** @type {Record<AlertActionType, AlertActionConfig>} */
const ALERT_ACTION_CONFIG = {
  assign: {
    permission: "alert:assign",
    targetStatus: null
  },
  confirm: {
    permission: "alert:confirm",
    targetStatus: "acknowledged"
  },
  process: {
    permission: "alert:process",
    targetStatus: "in_progress"
  },
  hold: {
    permission: "alert:process",
    targetStatus: "on_hold"
  },
  ignore: {
    permission: "alert:close",
    targetStatus: "ignored"
  },
  close: {
    permission: "alert:close",
    targetStatus: "closed"
  },
  reopen: {
    permission: "alert:reopen",
    targetStatus: "reopened"
  }
};

const FINAL_ALERT_STATUSES = new Set(["closed", "ignored"]);
const ACTION_ALLOWED_STATUSES = {
  assign: new Set(["new", "pending", "acknowledged", "in_progress", "on_hold", "reopened"]),
  confirm: new Set(["new", "pending", "reopened"]),
  process: new Set(["new", "pending", "acknowledged", "on_hold", "reopened"]),
  hold: new Set(["acknowledged", "in_progress"]),
  ignore: new Set(["new", "pending", "acknowledged", "in_progress", "on_hold", "reopened"]),
  close: new Set(["new", "pending", "acknowledged", "in_progress", "on_hold", "reopened"]),
  reopen: FINAL_ALERT_STATUSES
};

/**
 * @param {unknown} actionType
 * @returns {AlertActionConfig | null}
 */
function getAlertActionConfig(actionType) {
  return ALERT_ACTION_CONFIG[String(actionType || "").trim()] || null;
}

/**
 * @param {unknown} actionType
 * @param {AlertAuthContext | null | undefined} authContext
 * @returns {AlertActionConfig}
 */
function assertAlertActionAllowed(actionType, authContext) {
  const config = getAlertActionConfig(actionType);
  if (!config) {
    throw new AppError("bad_request", "不支持的告警动作", 400);
  }

  const granted = new Set(authContext?.permissionCodes || []);
  if (!granted.has(config.permission)) {
    throw new AppError("forbidden", "当前用户没有执行该动作的权限", 403);
  }

  return config;
}

/**
 * @param {string | null | undefined} status
 * @param {unknown} actionType
 * @returns {boolean}
 */
function isAlertActionAvailable(status, actionType) {
  const normalizedAction = String(actionType || "").trim();
  const normalizedStatus = String(status || "").trim();
  const allowedStatuses = ACTION_ALLOWED_STATUSES[normalizedAction];
  if (!allowedStatuses) {
    return false;
  }
  return allowedStatuses.has(normalizedStatus);
}

/**
 * @param {string | null | undefined} status
 * @param {unknown} actionType
 */
function assertAlertActionAvailable(status, actionType) {
  if (!isAlertActionAvailable(status, actionType)) {
    throw new AppError("invalid_alert_transition", "当前告警状态不支持该动作", 409, {
      status,
      actionType
    });
  }
}

/**
 * @param {AlertRecord} currentAlert
 * @param {unknown} actionType
 * @param {AlertTransitionOptions} [options]
 * @returns {AlertTransitionPlan}
 */
function buildAlertTransitionPlan(currentAlert, actionType, options = {}) {
  const config = getAlertActionConfig(actionType);
  if (!config) {
    throw new AppError("bad_request", "不支持的告警动作", 400);
  }
  assertAlertActionAvailable(currentAlert.status, actionType);

  const assignedTo = Number.isFinite(Number(options.assignedTo)) ? Number(options.assignedTo) : null;
  const assigneeExists = options.assigneeExists !== false;
  const remarkText = options.remarkText ?? null;
  const now = options.now instanceof Date ? options.now : new Date();

  let nextStatus = config.targetStatus || currentAlert.status;
  let nextAssignedTo = currentAlert.assignedTo ?? null;
  let closedAt = null;
  let closedReason = null;
  let closeSource = null;
  let reopenDelta = 0;

  if (actionType === "assign") {
    if (!assignedTo) {
      throw new AppError("bad_request", "assign 动作必须指定 assignedTo", 400);
    }
    if (!assigneeExists) {
      throw new AppError("bad_request", "指定的处理人不存在", 400);
    }
    nextAssignedTo = assignedTo;
  } else if (actionType === "close" || actionType === "ignore") {
    closedAt = now;
    closedReason = remarkText;
    closeSource = "manual";
  } else if (actionType === "reopen") {
    reopenDelta = 1;
  }

  return {
    nextStatus,
    nextAssignedTo,
    closedAt,
    closedReason,
    closeSource,
    reopenDelta
  };
}

module.exports = {
  ALERT_ACTION_CONFIG,
  ACTION_ALLOWED_STATUSES,
  getAlertActionConfig,
  assertAlertActionAllowed,
  isAlertActionAvailable,
  assertAlertActionAvailable,
  buildAlertTransitionPlan
};
