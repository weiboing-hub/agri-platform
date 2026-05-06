const { after, afterEach, test } = require("node:test");
const assert = require("node:assert/strict");

const mysql = require("../src/lib/mysql");

const originalQuery = mysql.query;
const originalPool = mysql.pool;

function loadFreshScheduler() {
  const modulePath = require.resolve("../src/lib/automation-rule-scheduler");
  delete require.cache[modulePath];
  return require("../src/lib/automation-rule-scheduler");
}

afterEach(() => {
  mysql.query = originalQuery;
  mysql.pool = originalPool;
  delete require.cache[require.resolve("../src/lib/automation-rule-scheduler")];
});

after(async () => {
  try {
    await originalPool.end();
  } catch {
    // ignore pool shutdown errors in isolated test runs
  }
});

test("automation rule scheduler queues a control command when humidity stays below threshold", async () => {
  const queryCalls = [];
  mysql.query = async (sql, params = []) => {
    queryCalls.push({ sql, params });
    if (sql.includes("FROM rule_definitions")) {
      return [{
        id: 2,
        tenantId: 1,
        ruleCode: "RULE-HUM-IRRIGATE-001",
        ruleName: "低湿自动灌溉策略",
        conditionJson: {
          metric: "humidity",
          operator: "<",
          threshold: 28,
          stableSeconds: 300,
          areaId: 7
        },
        actionJson: {
          actions: [
            {
              type: "control",
              actuatorId: 1,
              controlType: "on",
              durationSeconds: 120
            }
          ]
        },
        targetIdsJson: [1],
        cooldownSeconds: 1800,
        dailyMaxExecutions: 6,
        recoveryPolicy: "manual_close"
      }];
    }
    if (sql.includes("metric_value AS latestValue")) {
      return [{
        sensorId: 8,
        gatewayId: 4,
        unitName: "%",
        latestValue: "16.7",
        latestReceivedAt: "2026-05-03 12:47:21",
        latestAgeSec: 19
      }];
    }
    if (sql.includes("MIN(metric_value) AS min_value")) {
      return [{
        min_value: "16.5",
        max_value: "16.8",
        sample_count: 15,
        coverage_sec: 280
      }];
    }
    throw new Error(`Unexpected scheduler query: ${sql.slice(0, 120)}`);
  };

  const connection = {
    began: false,
    committed: false,
    rolledBack: false,
    released: false,
    calls: [],
    async beginTransaction() {
      this.began = true;
    },
    async execute(sql, params = []) {
      this.calls.push({ sql, params });
      if (sql.includes("FROM iot_actuators")) {
        return [[{
          id: 1,
          tenantId: 1,
          actuatorCode: "A-PUMP-001",
          actuatorName: "灌溉水泵 1 号",
          areaId: 7,
          maxRunSeconds: 1800,
          desiredStateText: "off",
          reportedStateText: "off",
          shadowStatus: "sync",
          actuatorStatus: "enabled",
          gatewayId: 4,
          onlineStatus: "online",
          backfillStatus: "idle"
        }]];
      }
      if (sql.includes("FROM ops_control_commands") && sql.includes("request_status IN")) {
        return [[]];
      }
      if (sql.includes("JSON_UNQUOTE(JSON_EXTRACT(requested_state_json, '$.ruleCode'))") && sql.includes("DATE_SUB(NOW(), INTERVAL")) {
        return [[{ commandCount: 0 }]];
      }
      if (sql.includes("JSON_UNQUOTE(JSON_EXTRACT(requested_state_json, '$.ruleCode'))") && sql.includes("CURRENT_DATE()")) {
        return [[{ commandCount: 0 }]];
      }
      if (sql.includes("INSERT INTO ops_control_commands")) {
        return [{ insertId: 9 }];
      }
      if (sql.includes("INSERT INTO ops_control_executions")) {
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("UPDATE iot_actuators")) {
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("INSERT INTO iot_device_shadow")) {
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected scheduler execute: ${sql.slice(0, 120)}`);
    },
    async commit() {
      this.committed = true;
    },
    async rollback() {
      this.rolledBack = true;
    },
    release() {
      this.released = true;
    }
  };

  mysql.pool = {
    async getConnection() {
      return connection;
    }
  };

  const scheduler = loadFreshScheduler();
  const logEntries = [];
  await scheduler.pollAutomationRules({
    info(payload, message) {
      logEntries.push({ payload, message });
    }
  });

  assert.equal(connection.began, true);
  assert.equal(connection.committed, true);
  assert.equal(connection.rolledBack, false);
  assert.equal(connection.released, true);
  assert.ok(connection.calls.some((item) => item.sql.includes("INSERT INTO ops_control_commands")));
  assert.ok(connection.calls.some((item) => item.sql.includes("INSERT INTO ops_control_executions")));
  assert.equal(logEntries.length, 1);
  assert.equal(logEntries[0].message, "automation rule queued control command");
  assert.equal(logEntries[0].payload.ruleCode, "RULE-HUM-IRRIGATE-001");
  assert.equal(queryCalls.length, 3);
});

test("automation rule scheduler skips command creation when humidity condition is not satisfied", async () => {
  mysql.query = async (sql) => {
    if (sql.includes("FROM rule_definitions")) {
      return [{
        id: 2,
        tenantId: 1,
        ruleCode: "RULE-HUM-IRRIGATE-001",
        ruleName: "低湿自动灌溉策略",
        conditionJson: {
          metric: "humidity",
          operator: "<",
          threshold: 28,
          stableSeconds: 300,
          areaId: 7
        },
        actionJson: {
          actions: [
            {
              type: "control",
              actuatorId: 1,
              controlType: "on",
              durationSeconds: 120
            }
          ]
        },
        targetIdsJson: [1],
        cooldownSeconds: 1800,
        dailyMaxExecutions: 6,
        recoveryPolicy: "manual_close"
      }];
    }
    if (sql.includes("metric_value AS latestValue")) {
      return [{
        sensorId: 8,
        gatewayId: 4,
        unitName: "%",
        latestValue: "30.2",
        latestReceivedAt: "2026-05-03 12:47:21",
        latestAgeSec: 19
      }];
    }
    throw new Error(`Unexpected scheduler query: ${sql.slice(0, 120)}`);
  };

  let getConnectionCalled = false;
  mysql.pool = {
    async getConnection() {
      getConnectionCalled = true;
      throw new Error("should not allocate connection");
    }
  };

  const scheduler = loadFreshScheduler();
  await scheduler.pollAutomationRules();
  assert.equal(getConnectionCalled, false);
});

test("automation rule scheduler blocks control and creates alert when humidity stays at invalid zero", async () => {
  const queryCalls = [];
  mysql.query = async (sql, params = []) => {
    queryCalls.push({ sql, params });
    if (sql.includes("FROM rule_definitions")) {
      return [{
        id: 2,
        tenantId: 1,
        ruleCode: "RULE-HUM-IRRIGATE-001",
        ruleName: "低湿自动灌溉策略",
        conditionJson: {
          metric: "humidity",
          operator: "<",
          threshold: 28,
          stableSeconds: 300,
          areaId: 7,
          valueGuard: {
            minValid: 0.1,
            maxValid: 100,
            minRecentPositiveCount: 1,
            recentPositiveWindowSeconds: 300,
            invalidSampleCount: 3,
            invalidWindowSeconds: 300,
            createAlert: true,
            alertSeverity: "high"
          }
        },
        actionJson: {
          actions: [
            { type: "control", actuatorId: 1, controlType: "on", durationSeconds: 120 }
          ]
        },
        targetIdsJson: [1],
        cooldownSeconds: 1800,
        dailyMaxExecutions: 6,
        recoveryPolicy: "manual_close"
      }];
    }
    if (sql.includes("metric_value AS latestValue")) {
      return [{
        sensorId: 8,
        gatewayId: 4,
        unitName: "%",
        latestValue: "0",
        latestReceivedAt: "2026-05-03 12:47:21",
        latestAgeSec: 19
      }];
    }
    if (sql.includes("MIN(metric_value) AS min_value")) {
      return [{
        min_value: "0",
        max_value: "0",
        sample_count: 15,
        coverage_sec: 280
      }];
    }
    if (sql.includes("SUM(CASE WHEN metric_value < ?")) {
      return [{
        sample_count: 15,
        invalid_count: 15
      }];
    }
    if (sql.includes("FROM ops_alerts")) {
      return [];
    }
    if (sql.includes("INSERT INTO ops_alerts")) {
      return [{ insertId: 77 }];
    }
    throw new Error(`Unexpected scheduler query: ${sql.slice(0, 160)}`);
  };

  let getConnectionCalled = false;
  mysql.pool = {
    async getConnection() {
      getConnectionCalled = true;
      throw new Error("should not allocate connection when guard blocks control");
    }
  };

  const scheduler = loadFreshScheduler();
  const logs = [];
  await scheduler.pollAutomationRules({
    warn(payload, message) {
      logs.push({ payload, message });
    }
  });

  assert.equal(getConnectionCalled, false);
  const invalidQuery = queryCalls.find((item) => item.sql.includes("SUM(CASE WHEN metric_value < ?"));
  assert.deepEqual(invalidQuery?.params, [0.1, 100, 7, "humidity"]);
  assert.ok(queryCalls.some((item) => item.sql.includes("INSERT INTO ops_alerts")));
  assert.equal(logs[0]?.message, "automation rule blocked by value guard");
});

test("automation rule scheduler skips control when secondary temperature condition is not met", async () => {
  mysql.query = async (sql, params = []) => {
    if (sql.includes("FROM rule_definitions")) {
      return [{
        id: 2,
        tenantId: 1,
        ruleCode: "RULE-HUM-IRRIGATE-001",
        ruleName: "低湿自动灌溉策略",
        conditionJson: {
          metric: "humidity",
          operator: "<",
          threshold: 28,
          stableSeconds: 300,
          areaId: 7,
          secondaryCondition: {
            metric: "temperature",
            operator: ">",
            threshold: 24,
            stableSeconds: 300
          }
        },
        actionJson: {
          actions: [
            { type: "control", actuatorId: 1, controlType: "on", durationSeconds: 120 }
          ]
        },
        targetIdsJson: [1],
        cooldownSeconds: 1800,
        dailyMaxExecutions: 6,
        recoveryPolicy: "manual_close"
      }];
    }
    if (sql.includes("metric_value AS latestValue") && sql.includes("ORDER BY received_at DESC")) {
      if (String(params[1]) === "humidity") {
        return [{
          sensorId: 8,
          gatewayId: 4,
          unitName: "%",
          latestValue: "16.7",
          latestReceivedAt: "2026-05-03 12:47:21",
          latestAgeSec: 19
        }];
      }
      return [{
        sensorId: 7,
        gatewayId: 4,
        unitName: "℃",
        latestValue: "21.3",
        latestReceivedAt: "2026-05-03 12:47:21",
        latestAgeSec: 19
      }];
    }
    if (sql.includes("MIN(metric_value) AS min_value")) {
      if (String(params[1]) === "humidity") {
        return [{
          min_value: "16.5",
          max_value: "16.8",
          sample_count: 15,
          coverage_sec: 280
        }];
      }
      return [{
        min_value: "21.1",
        max_value: "21.4",
        sample_count: 15,
        coverage_sec: 280
      }];
    }
    throw new Error(`Unexpected scheduler query: ${sql.slice(0, 160)}`);
  };

  let getConnectionCalled = false;
  mysql.pool = {
    async getConnection() {
      getConnectionCalled = true;
      throw new Error("should not allocate connection");
    }
  };

  const scheduler = loadFreshScheduler();
  await scheduler.pollAutomationRules();
  assert.equal(getConnectionCalled, false);
});
