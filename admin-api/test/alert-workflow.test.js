const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  ALERT_ACTION_CONFIG,
  assertAlertActionAllowed,
  buildAlertTransitionPlan,
  isAlertActionAvailable
} = require("../src/lib/alert-workflow");

/**
 * @param {unknown} error
 * @returns {{ httpStatus?: number; message?: string; code?: string }}
 */
function getErrorInfo(error) {
  return typeof error === "object" && error ? error : {};
}

test("alert action config stays aligned with expected permissions", () => {
  assert.equal(ALERT_ACTION_CONFIG.assign.permission, "alert:assign");
  assert.equal(ALERT_ACTION_CONFIG.close.targetStatus, "closed");
  assert.equal(ALERT_ACTION_CONFIG.reopen.targetStatus, "reopened");
});

test("assertAlertActionAllowed rejects unsupported actions", () => {
  assert.throws(
    () => assertAlertActionAllowed("unknown", { permissionCodes: ["alert:view"] }),
    (error) => {
      const info = getErrorInfo(error);
      return info.httpStatus === 400 && info.message === "不支持的告警动作";
    }
  );
});

test("assertAlertActionAllowed rejects users missing transition permission", () => {
  assert.throws(
    () => assertAlertActionAllowed("close", { permissionCodes: ["alert:view"] }),
    (error) => {
      const info = getErrorInfo(error);
      return info.httpStatus === 403 && info.code === "forbidden";
    }
  );
});

test("buildAlertTransitionPlan requires assignee for assign action", () => {
  assert.throws(
    () => buildAlertTransitionPlan({ status: "new", assignedTo: null }, "assign", {}),
    (error) => {
      const info = getErrorInfo(error);
      return info.httpStatus === 400 && info.message === "assign 动作必须指定 assignedTo";
    }
  );
});

test("isAlertActionAvailable blocks invalid final-state transitions", () => {
  assert.equal(isAlertActionAvailable("closed", "process"), false);
  assert.equal(isAlertActionAvailable("closed", "reopen"), true);
  assert.equal(isAlertActionAvailable("pending", "confirm"), true);
  assert.equal(isAlertActionAvailable("pending", "reopen"), false);
});

test("buildAlertTransitionPlan rejects unavailable action for current status", () => {
  assert.throws(
    () => buildAlertTransitionPlan({ status: "closed", assignedTo: 1 }, "process", {}),
    (error) => {
      const info = getErrorInfo(error);
      return info.httpStatus === 409 && info.code === "invalid_alert_transition";
    }
  );
});

test("buildAlertTransitionPlan rejects unknown assignee for assign action", () => {
  assert.throws(
    () => buildAlertTransitionPlan(
      { status: "new", assignedTo: null },
      "assign",
      { assignedTo: 9, assigneeExists: false }
    ),
    (error) => {
      const info = getErrorInfo(error);
      return info.httpStatus === 400 && info.message === "指定的处理人不存在";
    }
  );
});

test("buildAlertTransitionPlan sets manual close fields for close action", () => {
  const now = new Date("2026-04-04T12:30:00.000Z");
  const plan = buildAlertTransitionPlan(
    { status: "in_progress", assignedTo: 3 },
    "close",
    { remarkText: "现场已处理", now }
  );

  assert.equal(plan.nextStatus, "closed");
  assert.equal(plan.nextAssignedTo, 3);
  assert.equal(plan.closeSource, "manual");
  assert.equal(plan.closedReason, "现场已处理");
  assert.equal(plan.closedAt, now);
  assert.equal(plan.reopenDelta, 0);
});

test("buildAlertTransitionPlan increments reopen counter for reopen action", () => {
  const plan = buildAlertTransitionPlan(
    { status: "closed", assignedTo: 7 },
    "reopen",
    { remarkText: "误判恢复" }
  );

  assert.equal(plan.nextStatus, "reopened");
  assert.equal(plan.nextAssignedTo, 7);
  assert.equal(plan.reopenDelta, 1);
  assert.equal(plan.closedAt, null);
});
