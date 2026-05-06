const { after, afterEach, test } = require("node:test");
const assert = require("node:assert/strict");
const Fastify = require("fastify");

const config = require("../src/lib/config");
const mysql = require("../src/lib/mysql");
const auth = require("../src/lib/auth");
const audit = require("../src/lib/audit");
const deviceCredentials = require("../src/lib/device-credentials");
const tenantFoundation = require("../src/lib/tenant-foundation");

let app = null;

const originalConfig = {
  rateLimitEnabled: config.rateLimit.enabled
};
const originalMysql = {
  pool: mysql.pool
};
const originalParseBearerToken = auth.parseBearerToken;
const originalLogOperation = audit.logOperation;
const originalResolveCredential = deviceCredentials.resolveDeviceIngestCredentialByToken;
const originalHasTenantFoundation = tenantFoundation.hasTenantFoundation;
const originalResolveDefaultTenantId = tenantFoundation.resolveDefaultTenantId;

function createIngestConnection() {
  return {
    began: false,
    committed: false,
    rolledBack: false,
    released: false,
    calls: [],
    async beginTransaction() {
      this.began = true;
    },
    async execute(sql, params) {
      this.calls.push({ sql, params });

      if (sql.includes("FROM biz_areas")) {
        return [[]];
      }
      if (sql.includes("INSERT INTO biz_areas")) {
        return [{ insertId: 71 }];
      }
      if (sql.includes("FROM iot_gateways") && sql.includes("serial_no")) {
        return [[]];
      }
      if (sql.includes("INSERT INTO iot_gateways")) {
        return [{ insertId: 81 }];
      }
      if (sql.includes("FROM iot_metric_defs")) {
        return [[]];
      }
      if (sql.includes("INSERT INTO iot_metric_defs")) {
        return [{ insertId: 91 }];
      }
      if (sql.includes("FROM iot_sensors")) {
        return [[]];
      }
      if (sql.includes("INSERT INTO iot_sensors")) {
        return [{ insertId: 101 }];
      }
      if (sql.includes("FROM iot_sensor_channels")) {
        return [[]];
      }
      if (sql.includes("INSERT INTO iot_sensor_channels")) {
        return [{ insertId: 111 }];
      }
      if (sql.includes("INSERT INTO iot_sensor_readings")) {
        return [{ insertId: 121 }];
      }
      if (sql.includes("UPDATE iot_sensors")) {
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("UPDATE iot_gateways")) {
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unexpected SQL in test: ${sql.slice(0, 80)}`);
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
}

function loadFreshIotRoutes() {
  const routePath = require.resolve("../src/routes/iot");
  delete require.cache[routePath];
  return require("../src/routes/iot");
}

async function createIotRouteApp() {
  const iotRoutes = loadFreshIotRoutes();
  const fastify = Fastify();
  await fastify.register(iotRoutes);
  return fastify;
}

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }

  config.rateLimit.enabled = originalConfig.rateLimitEnabled;
  mysql.pool = originalMysql.pool;
  auth.parseBearerToken = originalParseBearerToken;
  audit.logOperation = originalLogOperation;
  deviceCredentials.resolveDeviceIngestCredentialByToken = originalResolveCredential;
  tenantFoundation.hasTenantFoundation = originalHasTenantFoundation;
  tenantFoundation.resolveDefaultTenantId = originalResolveDefaultTenantId;
  delete require.cache[require.resolve("../src/routes/iot")];
});

after(async () => {
  try {
    await originalMysql.pool.end();
  } catch {
    // ignore pool shutdown errors in isolated test runs
  }
});

test("device control route returns gateway control payload for authorized device", async () => {
  config.rateLimit.enabled = false;
  auth.parseBearerToken = () => "good-token";
  deviceCredentials.resolveDeviceIngestCredentialByToken = async (token) => {
    return token === "good-token" ? { tenantId: "5" } : null;
  };
  tenantFoundation.hasTenantFoundation = async () => true;
  tenantFoundation.resolveDefaultTenantId = async () => 1;
  audit.logOperation = async () => {};
  mysql.pool = {
    async execute(sql) {
      if (sql.includes("FROM iot_gateways")) {
        return [[{
          id: 4,
          gatewayCode: "soil-001",
          desiredSamplingStatus: "paused",
          samplingStatus: "running",
          commandVersion: 6,
          appliedCommandVersion: 4,
          lastSamplingCommandAt: "2026-04-04 10:00:00",
          lastSamplingReportedAt: "2026-04-04 10:01:00"
        }]];
      }
      if (sql.includes("FROM ops_control_commands")) {
        return [[]];
      }
      throw new Error(`Unexpected SQL in device control test: ${sql.slice(0, 80)}`);
    }
  };

  app = await createIotRouteApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/iot/device-control?deviceId=soil-001",
    headers: {
      authorization: "Bearer good-token"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.gatewayId, 4);
  assert.equal(body.data.desiredSamplingStatus, "paused");
  assert.equal(body.data.pending, true);
  assert.equal(body.data.pumpPending, false);
  assert.equal(body.data.desiredPumpStatus, undefined);
});

test("device control route attaches next queued pump command for ESP32 polling", async () => {
  config.rateLimit.enabled = false;
  auth.parseBearerToken = () => "good-token";
  deviceCredentials.resolveDeviceIngestCredentialByToken = async () => ({ tenantId: "5" });
  tenantFoundation.hasTenantFoundation = async () => true;
  tenantFoundation.resolveDefaultTenantId = async () => 1;
  audit.logOperation = async () => {};

  const connection = {
    began: false,
    committed: false,
    rolledBack: false,
    released: false,
    calls: [],
    async beginTransaction() {
      this.began = true;
    },
    async execute(sql, params) {
      this.calls.push({ sql, params });
      if (sql.includes("FROM iot_gateways") && sql.includes("FOR UPDATE")) {
        return [[{ commandVersion: 6 }]];
      }
      if (sql.includes("UPDATE ops_control_commands")) {
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("UPDATE ops_control_executions")) {
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("UPDATE iot_gateways")) {
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL in pump command allocation test: ${sql.slice(0, 80)}`);
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
    async execute(sql) {
      if (sql.includes("FROM iot_gateways")) {
        return [[{
          id: 4,
          gatewayCode: "soil-001",
          desiredSamplingStatus: "running",
          samplingStatus: "running",
          commandVersion: 6,
          appliedCommandVersion: 6,
          lastSamplingCommandAt: null,
          lastSamplingReportedAt: null
        }]];
      }
      if (sql.includes("FROM ops_control_commands")) {
        return [[{
          id: 22,
          commandNo: "CMD-22",
          actuatorId: 8,
          controlType: "on",
          durationSeconds: 5,
          requestStatus: "queued",
          requestedStateJson: { power: "on" },
          commandVersion: null,
          maxRunSeconds: 600
        }]];
      }
      throw new Error(`Unexpected SQL in pump command fetch test: ${sql.slice(0, 80)}`);
    },
    async getConnection() {
      return connection;
    }
  };

  app = await createIotRouteApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/iot/device-control?deviceId=soil-001",
    headers: {
      authorization: "Bearer good-token"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.gatewayId, 4);
  assert.equal(body.data.pending, true);
  assert.equal(body.data.pumpPending, true);
  assert.equal(body.data.desiredPumpStatus, "pulse");
  assert.equal(body.data.pumpDurationMs, 5000);
  assert.equal(body.data.controlCommandId, 22);
  assert.equal(body.data.actuatorId, 8);
  assert.equal(body.data.commandVersion, 7);
  assert.equal(connection.began, true);
  assert.equal(connection.committed, true);
  assert.equal(connection.rolledBack, false);
  assert.equal(connection.released, true);
});

test("device config route returns flattened gateway config payload for authorized device", async () => {
  config.rateLimit.enabled = false;
  auth.parseBearerToken = () => "good-token";
  deviceCredentials.resolveDeviceIngestCredentialByToken = async () => ({ tenantId: "5" });
  tenantFoundation.hasTenantFoundation = async () => true;
  tenantFoundation.resolveDefaultTenantId = async () => 1;
  audit.logOperation = async () => {};
  mysql.pool = {
    async execute() {
      return [[{
        id: 7,
        tenantId: 5,
        gatewayCode: "soil-001",
        gatewayName: "温室东区网关",
        templateId: 3,
        configJson: {
          cloud: {
            apiHost: "http://82.156.45.208",
            reportIntervalMs: 30000,
            controlPollIntervalMs: 12000
          },
          rs485: {
            baudrate: 4800,
            modbusAddress: 9,
            registerStart: 4,
            registerCount: 2,
            tempRegisterIndex: 0,
            humRegisterIndex: 1
          },
          control: {
            pumpGpio: 27,
            activeHigh: false,
            maxRunSeconds: 600,
            minOffSeconds: 45
          },
          capabilities: {
            localWebEnabled: true,
            otaEnabled: false,
            cellularEnabled: true
          }
        },
        configVersion: 4,
        configSyncStatus: "pending_push",
        configMessage: "已更新配置，待设备同步",
        templateConfigJson: null
      }]];
    }
  };

  app = await createIotRouteApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/iot/device-config?deviceId=soil-001&currentConfigVersion=2",
    headers: {
      authorization: "Bearer good-token"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.gatewayId, 7);
  assert.equal(body.data.configVersion, 4);
  assert.equal(body.data.hasUpdate, true);
  assert.equal(body.data.apiHost, "http://82.156.45.208");
  assert.equal(body.data.reportIntervalMs, 30000);
  assert.equal(body.data.modbusAddress, 9);
  assert.equal(body.data.cellularEnabled, true);
});

test("device config route includes firmware OTA target when gateway OTA is enabled", async () => {
  config.rateLimit.enabled = false;
  auth.parseBearerToken = () => "good-token";
  deviceCredentials.resolveDeviceIngestCredentialByToken = async () => ({ tenantId: "5" });
  tenantFoundation.hasTenantFoundation = async () => true;
  tenantFoundation.resolveDefaultTenantId = async () => 1;
  audit.logOperation = async () => {};

  const executeCalls = [];
  mysql.pool = {
    async execute(sql, params) {
      executeCalls.push({ sql, params });
      if (sql.includes("FROM iot_gateways g")) {
        return [[{
          id: 7,
          tenantId: 5,
          gatewayCode: "soil-001",
          gatewayName: "温室东区网关",
          firmwareVersion: "1.0.0",
          templateId: 3,
          configJson: {
            cloud: {
              apiHost: "http://82.156.45.208",
              reportIntervalMs: 30000,
              controlPollIntervalMs: 12000
            },
            capabilities: {
              otaEnabled: true
            }
          },
          configVersion: 5,
          configSyncStatus: "applied",
          configMessage: null,
          templateConfigJson: null
        }]];
      }
      if (sql.includes("FROM iot_firmware_jobs j")) {
        return [[{
          id: 21,
          targetVersion: "1.0.2",
          status: "pending",
          downloadUrl: "https://cdn.example.com/soil-1.0.2.bin",
          sha256: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
          fileSizeBytes: 524288
        }]];
      }
      throw new Error(`Unexpected SQL in device config firmware test: ${sql.slice(0, 80)}`);
    }
  };

  app = await createIotRouteApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/iot/device-config?deviceId=soil-001&currentConfigVersion=5",
    headers: {
      authorization: "Bearer good-token"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.currentFirmwareVersion, "1.0.0");
  assert.equal(body.data.hasFirmwareUpdate, true);
  assert.equal(body.data.firmwareJobId, 21);
  assert.equal(body.data.targetFirmwareVersion, "1.0.2");
  assert.equal(body.data.firmwareUrl, "https://cdn.example.com/soil-1.0.2.bin");
  assert.equal(body.data.firmwareSizeBytes, 524288);
  assert.equal(body.data.firmwareJobStatus, "pending");
  assert.equal(executeCalls.some((item) => item.sql.includes("FROM iot_firmware_jobs j")), true);
});

test("device control report route returns not_found when gateway update affects no rows", async () => {
  config.rateLimit.enabled = false;
  auth.parseBearerToken = () => "good-token";
  deviceCredentials.resolveDeviceIngestCredentialByToken = async () => ({ tenantId: "5" });
  tenantFoundation.hasTenantFoundation = async () => true;
  tenantFoundation.resolveDefaultTenantId = async () => 1;
  audit.logOperation = async () => {};
  mysql.pool = {
    async execute() {
      return [{ affectedRows: 0 }];
    }
  };

  app = await createIotRouteApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/iot/device-control/report",
    headers: {
      authorization: "Bearer good-token"
    },
    payload: {
      deviceId: "soil-001",
      samplingStatus: "paused",
      appliedCommandVersion: 7
    }
  });

  assert.equal(response.statusCode, 404);
  const body = response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "not_found");
});

test("device control report route marks applied pump command as executed", async () => {
  config.rateLimit.enabled = false;
  auth.parseBearerToken = () => "good-token";
  deviceCredentials.resolveDeviceIngestCredentialByToken = async () => ({ tenantId: "5" });
  tenantFoundation.hasTenantFoundation = async () => true;
  tenantFoundation.resolveDefaultTenantId = async () => 1;
  audit.logOperation = async () => {};

  const connection = {
    began: false,
    committed: false,
    rolledBack: false,
    released: false,
    calls: [],
    async beginTransaction() {
      this.began = true;
    },
    async execute(sql, params) {
      this.calls.push({ sql, params });
      if (sql.includes("FROM ops_control_commands")) {
        return [[{
          id: 22,
          actuatorId: 8,
          controlType: "on",
          durationSeconds: 5,
          commandVersion: 7
        }]];
      }
      if (sql.includes("UPDATE ops_control_commands")) {
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("UPDATE ops_control_executions")) {
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("UPDATE iot_actuators")) {
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("INSERT INTO iot_device_shadow")) {
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL in pump command report test: ${sql.slice(0, 80)}`);
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
    async execute(sql) {
      if (sql.includes("UPDATE iot_gateways")) {
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("FROM iot_gateways")) {
        return [[{
          id: 4,
          gatewayCode: "soil-001",
          desiredSamplingStatus: "running",
          samplingStatus: "running",
          commandVersion: 7,
          appliedCommandVersion: 7,
          lastSamplingCommandAt: null,
          lastSamplingReportedAt: null
        }]];
      }
      throw new Error(`Unexpected SQL in pump command report gateway test: ${sql.slice(0, 80)}`);
    },
    async getConnection() {
      return connection;
    }
  };

  app = await createIotRouteApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/iot/device-control/report",
    headers: {
      authorization: "Bearer good-token"
    },
    payload: {
      deviceId: "soil-001",
      samplingStatus: "running",
      appliedCommandVersion: 7,
      pumpStatus: "on"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.pumpStatus, "on");
  assert.equal(body.data.pumpCommand.commandId, 22);
  assert.equal(body.data.pumpCommand.actuatorId, 8);
  assert.equal(body.data.pumpCommand.requestStatus, "executed");
  assert.equal(body.data.pumpCommand.executionStatus, "success");
  assert.equal(body.data.pumpCommand.actuatorSynced, true);
  assert.equal(connection.began, true);
  assert.equal(connection.committed, true);
  assert.equal(connection.rolledBack, false);
  assert.equal(connection.released, true);
});

test("device control report route marks blocked pump command as failed", async () => {
  config.rateLimit.enabled = false;
  auth.parseBearerToken = () => "good-token";
  deviceCredentials.resolveDeviceIngestCredentialByToken = async () => ({ tenantId: "5" });
  tenantFoundation.hasTenantFoundation = async () => true;
  tenantFoundation.resolveDefaultTenantId = async () => 1;
  audit.logOperation = async () => {};

  const connection = {
    executionUpdateParams: null,
    async beginTransaction() {},
    async execute(sql, params) {
      if (sql.includes("FROM ops_control_commands")) {
        return [[{
          id: 23,
          actuatorId: 8,
          controlType: "on",
          durationSeconds: 15,
          commandVersion: 9
        }]];
      }
      if (sql.includes("UPDATE ops_control_commands")) {
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("UPDATE ops_control_executions")) {
        this.executionUpdateParams = params;
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("UPDATE iot_actuators")) {
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("INSERT INTO iot_device_shadow")) {
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL in blocked pump command report test: ${sql.slice(0, 80)}`);
    },
    async commit() {},
    async rollback() {},
    release() {}
  };

  mysql.pool = {
    async execute(sql) {
      if (sql.includes("UPDATE iot_gateways")) {
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("FROM iot_gateways")) {
        return [[{
          id: 4,
          gatewayCode: "soil-001",
          desiredSamplingStatus: "running",
          samplingStatus: "running",
          commandVersion: 9,
          appliedCommandVersion: 9,
          lastSamplingCommandAt: null,
          lastSamplingReportedAt: null
        }]];
      }
      throw new Error(`Unexpected SQL in blocked pump gateway test: ${sql.slice(0, 80)}`);
    },
    async getConnection() {
      return connection;
    }
  };

  app = await createIotRouteApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/iot/device-control/report",
    headers: {
      authorization: "Bearer good-token"
    },
    payload: {
      deviceId: "soil-001",
      samplingStatus: "running",
      appliedCommandVersion: 9,
      pumpStatus: "off",
      pumpResultStatus: "failed",
      pumpResultMessage: "已达到日累计运行上限"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.pumpCommand.commandId, 23);
  assert.equal(body.data.pumpCommand.executionStatus, "failed");
  assert.equal(connection.executionUpdateParams[0], "failed");
  assert.equal(connection.executionUpdateParams[2], "desync");
  assert.equal(connection.executionUpdateParams[3], "DEVICE_BLOCKED");
  assert.equal(connection.executionUpdateParams[4], "已达到日累计运行上限");
});

test("device config report route marks config as applied when device reports latest version", async () => {
  config.rateLimit.enabled = false;
  auth.parseBearerToken = () => "good-token";
  deviceCredentials.resolveDeviceIngestCredentialByToken = async () => ({ tenantId: "5" });
  tenantFoundation.hasTenantFoundation = async () => true;
  tenantFoundation.resolveDefaultTenantId = async () => 1;
  audit.logOperation = async () => {};

  const executeCalls = [];
  mysql.pool = {
    async execute(sql, params) {
      executeCalls.push({ sql, params });

      if (sql.includes("FROM iot_gateways g") && sql.includes("templateConfigJson")) {
        return [[{
          id: 9,
          tenantId: 5,
          gatewayCode: "soil-001",
          gatewayName: "温室东区网关",
          templateId: 2,
          configJson: {
            cloud: {
              apiHost: "http://82.156.45.208",
              reportIntervalMs: 20000,
              controlPollIntervalMs: 10000
            }
          },
          configVersion: 6,
          configSyncStatus: "pending_push",
          configMessage: "待同步",
          templateConfigJson: null
        }]];
      }
      if (sql.includes("UPDATE iot_gateways")) {
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("INSERT INTO iot_gateway_config_logs")) {
        return [{ insertId: 99 }];
      }

      throw new Error(`Unexpected SQL in device config report test: ${sql.slice(0, 80)}`);
    }
  };

  app = await createIotRouteApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/iot/device-config/report",
    headers: {
      authorization: "Bearer good-token"
    },
    payload: {
      deviceId: "soil-001",
      appliedConfigVersion: 6,
      configStatus: "applied",
      message: "设备已拉取并应用最新配置",
      rssi: -63
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.gatewayId, 9);
  assert.equal(body.data.platformConfigVersion, 6);
  assert.equal(body.data.configSyncStatus, "applied");
  assert.equal(body.data.result, "applied");
  assert.ok(executeCalls.some((item) => item.sql.includes("INSERT INTO iot_gateway_config_logs")));
});

test("device firmware report route updates OTA job and gateway version", async () => {
  config.rateLimit.enabled = false;
  auth.parseBearerToken = () => "good-token";
  deviceCredentials.resolveDeviceIngestCredentialByToken = async () => ({ tenantId: "5" });
  tenantFoundation.hasTenantFoundation = async () => true;
  tenantFoundation.resolveDefaultTenantId = async () => 1;
  audit.logOperation = async () => {};

  const executeCalls = [];
  mysql.pool = {
    async execute(sql, params) {
      executeCalls.push({ sql, params });

      if (sql.includes("FROM iot_gateways g")) {
        return [[{
          id: 9,
          tenantId: 5,
          gatewayCode: "soil-001",
          gatewayName: "温室东区网关",
          firmwareVersion: "1.0.0",
          templateId: 2,
          configJson: null,
          configVersion: 6,
          configSyncStatus: "applied",
          configMessage: null,
          templateConfigJson: null
        }]];
      }
      if (sql.includes("FROM iot_firmware_jobs")) {
        return [[{
          id: 31,
          targetVersion: "1.0.2",
          status: "pending"
        }]];
      }
      if (sql.includes("UPDATE iot_firmware_jobs")) {
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("UPDATE iot_gateways")) {
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unexpected SQL in device firmware report test: ${sql.slice(0, 80)}`);
    }
  };

  app = await createIotRouteApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/iot/firmware/report",
    headers: {
      authorization: "Bearer good-token"
    },
    payload: {
      deviceId: "soil-001",
      firmwareJobId: 31,
      status: "success",
      progressPercent: 80,
      reportedVersion: "1.0.2",
      rssi: -56
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.gatewayId, 9);
  assert.equal(body.data.firmwareJobId, 31);
  assert.equal(body.data.status, "success");
  assert.equal(body.data.progressPercent, 100);
  assert.equal(body.data.targetVersion, "1.0.2");
  assert.equal(body.data.reportedVersion, "1.0.2");
  assert.equal(executeCalls.some((item) => item.sql.includes("UPDATE iot_firmware_jobs")), true);
  assert.equal(executeCalls.some((item) => item.sql.includes("SET firmware_version = ?")), true);
});

test("iot ingest route rejects invalid device token before touching database", async () => {
  config.rateLimit.enabled = false;
  auth.parseBearerToken = () => "bad-token";
  deviceCredentials.resolveDeviceIngestCredentialByToken = async () => null;
  tenantFoundation.hasTenantFoundation = async () => true;
  tenantFoundation.resolveDefaultTenantId = async () => 1;

  let executeCalled = false;
  mysql.pool = {
    async execute() {
      executeCalled = true;
      return [[]];
    },
    async getConnection() {
      executeCalled = true;
      throw new Error("should not connect");
    }
  };

  app = await createIotRouteApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/iot/ingest",
    headers: {
      authorization: "Bearer bad-token"
    },
    payload: {
      deviceId: "soil-001",
      metrics: [{ metricCode: "temperature", value: 21.3 }]
    }
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.body, "");
  assert.equal(executeCalled, false);
});

test("iot ingest route persists a valid metric payload and returns 201", async () => {
  config.rateLimit.enabled = false;
  auth.parseBearerToken = () => "good-token";
  deviceCredentials.resolveDeviceIngestCredentialByToken = async () => ({ tenantId: "5" });
  tenantFoundation.hasTenantFoundation = async () => true;
  tenantFoundation.resolveDefaultTenantId = async () => 1;

  let loggedOperation = null;
  audit.logOperation = async (_request, payload) => {
    loggedOperation = payload;
  };

  const connection = createIngestConnection();
  mysql.pool = {
    async getConnection() {
      return connection;
    }
  };

  app = await createIotRouteApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/iot/ingest",
    headers: {
      authorization: "Bearer good-token"
    },
    payload: {
      deviceId: "soil-001",
      deviceName: "温室东区",
      rssi: -58,
      samplingStatus: "running",
      appliedCommandVersion: 6,
      metrics: [
        { metricCode: "temperature", metricName: "温度", value: 21.3, unitName: "℃" }
      ]
    }
  });

  assert.equal(response.statusCode, 201);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.deviceId, "soil-001");
  assert.equal(body.data.gatewayId, 81);
  assert.equal(body.data.areaId, 71);
  assert.equal(body.data.acceptedMetricCount, 1);
  assert.equal(body.data.metrics[0].readingId, 121);
  assert.equal(connection.began, true);
  assert.equal(connection.committed, true);
  assert.equal(connection.rolledBack, false);
  assert.equal(connection.released, true);
  assert.equal(loggedOperation.moduleCode, "iot_ingest");
  assert.equal(loggedOperation.targetId, 81);
});
