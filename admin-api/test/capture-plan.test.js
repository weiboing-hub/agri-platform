const { after, test } = require("node:test");
const assert = require("node:assert/strict");

const {
  assertCapturePlanPayload,
  computeNextTriggerAt,
  computeNextTriggerAfterExecution,
  buildCapturePlanSummary
} = require("../src/lib/capture-plan");
const { pool } = require("../src/lib/mysql");

after(async () => {
  await pool.end();
});

test("assertCapturePlanPayload validates interval plans", () => {
  assert.deepEqual(assertCapturePlanPayload({
    scheduleType: "interval",
    intervalMinutes: "15"
  }), {
    scheduleType: "interval",
    intervalMinutes: 15,
    dailyTime: null
  });
});

test("assertCapturePlanPayload validates daily plans", () => {
  assert.deepEqual(assertCapturePlanPayload({
    scheduleType: "daily",
    dailyTime: "08:30"
  }), {
    scheduleType: "daily",
    intervalMinutes: null,
    dailyTime: "08:30"
  });
});

test("assertCapturePlanPayload rejects invalid schedule payloads", () => {
  assert.throws(
    () => assertCapturePlanPayload({ scheduleType: "interval", intervalMinutes: 0 }),
    /intervalMinutes 必须大于 0/
  );
  assert.throws(
    () => assertCapturePlanPayload({ scheduleType: "daily", dailyTime: "25:00" }),
    /dailyTime 必须是 HH:mm 格式/
  );
});

test("computeNextTriggerAt calculates interval triggers from a fixed time", () => {
  assert.equal(
    computeNextTriggerAt(
      { scheduleType: "interval", intervalMinutes: 10 },
      "2026-04-04 10:07:21"
    ),
    "2026-04-04 10:17:00"
  );
});

test("computeNextTriggerAt calculates daily triggers and rolls to next day when needed", () => {
  assert.equal(
    computeNextTriggerAt(
      { scheduleType: "daily", dailyTime: "08:30" },
      "2026-04-04 07:20:00"
    ),
    "2026-04-04 08:30:00"
  );
  assert.equal(
    computeNextTriggerAt(
      { scheduleType: "daily", dailyTime: "08:30" },
      "2026-04-04 09:20:00"
    ),
    "2026-04-05 08:30:00"
  );
});

test("computeNextTriggerAfterExecution advances interval plans past execution time", () => {
  assert.equal(
    computeNextTriggerAfterExecution(
      { scheduleType: "interval", intervalMinutes: 5 },
      "2026-04-04 10:05:00",
      "2026-04-04 10:11:15"
    ),
    "2026-04-04 10:15:00"
  );
});

test("buildCapturePlanSummary renders human-readable plan summaries", () => {
  assert.equal(
    buildCapturePlanSummary({ scheduleType: "interval", intervalMinutes: 30 }),
    "每 30 分钟"
  );
  assert.equal(
    buildCapturePlanSummary({ scheduleType: "daily", dailyTime: "19:45" }),
    "每日 19:45"
  );
});
