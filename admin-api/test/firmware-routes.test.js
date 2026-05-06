const { after, afterEach, test } = require("node:test");
const assert = require("node:assert/strict");
const Fastify = require("fastify");

const mysql = require("../src/lib/mysql");
const audit = require("../src/lib/audit");
const dataScope = require("../src/lib/data-scope");
const tenantFoundation = require("../src/lib/tenant-foundation");

let app = null;

const originalMysqlQuery = mysql.query;
const originalLogOperation = audit.logOperation;
const originalAssertAreaAccess = dataScope.assertAreaAccess;
const originalResolveCurrentTenantId = tenantFoundation.resolveCurrentTenantId;

const defaultAuth = {
  tenant: { id: 5 },
  user: { id: 9, username: "codex", realName: "Codex" },
  dataScopes: [{ targetType: "area", scopeType: "all" }]
};

function loadFreshFirmwareRoutes() {
  const routePath = require.resolve("../src/routes/firmware");
  delete require.cache[routePath];
  return require("../src/routes/firmware");
}

async function createFirmwareRouteApp(authContext = defaultAuth) {
  const firmwareRoutes = loadFreshFirmwareRoutes();
  const fastify = Fastify();
  fastify.decorate("requireAnyPermissions", () => async (request) => {
    request.auth = authContext;
  });
  await fastify.register(firmwareRoutes);
  return fastify;
}

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }

  mysql.query = originalMysqlQuery;
  audit.logOperation = originalLogOperation;
  dataScope.assertAreaAccess = originalAssertAreaAccess;
  tenantFoundation.resolveCurrentTenantId = originalResolveCurrentTenantId;
  delete require.cache[require.resolve("../src/routes/firmware")];
});

after(async () => {
  try {
    await mysql.pool.end();
  } catch {
    // ignore pool shutdown errors in isolated test runs
  }
});

test("firmware package create route persists package metadata", async () => {
  const queryCalls = [];
  mysql.query = async (sql, params) => {
    queryCalls.push({ sql, params });
    if (sql.includes("INSERT INTO iot_firmware_packages")) {
      return { insertId: 18 };
    }
    throw new Error(`Unexpected SQL in firmware package create test: ${sql.slice(0, 80)}`);
  };
  audit.logOperation = async () => {};
  tenantFoundation.resolveCurrentTenantId = async () => 5;

  app = await createFirmwareRouteApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/firmware/packages",
    payload: {
      packageName: "soil-sensor-reporter",
      firmwareVersion: "1.0.2",
      downloadUrl: "https://cdn.example.com/soil-1.0.2.bin",
      sha256: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      status: "released"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.id, 18);
  assert.equal(body.data.firmwareVersion, "1.0.2");
  assert.equal(body.data.status, "released");
  assert.equal(queryCalls.some((item) => item.sql.includes("INSERT INTO iot_firmware_packages")), true);
});

test("firmware package list route returns scoped package rows", async () => {
  mysql.query = async (sql, params) => {
    if (sql.includes("FROM iot_firmware_packages")) {
      assert.deepEqual(params, [5, "released"]);
      return [{
        id: 3,
        tenantId: 5,
        packageNo: "FWPKG-3",
        deviceType: "esp32",
        packageName: "soil-sensor-reporter",
        firmwareVersion: "1.0.3",
        hardwareVersion: "32e",
        downloadUrl: "https://cdn.example.com/soil-1.0.3.bin",
        fileName: "soil-1.0.3.bin",
        fileSizeBytes: 786432,
        sha256: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        releaseNote: "ota",
        status: "released",
        createdBy: 9,
        createdAt: "2026-05-03 20:00:00",
        updatedAt: "2026-05-03 20:10:00"
      }];
    }
    throw new Error(`Unexpected SQL in firmware package list test: ${sql.slice(0, 80)}`);
  };

  app = await createFirmwareRouteApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/firmware/packages?status=released"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].packageNo, "FWPKG-3");
  assert.equal(body.data[0].firmwareVersion, "1.0.3");
});

test("firmware job create route schedules OTA for a gateway", async () => {
  const queryCalls = [];
  mysql.query = async (sql, params) => {
    queryCalls.push({ sql, params });
    if (sql.includes("FROM iot_gateways")) {
      return [{
        id: 7,
        tenantId: 5,
        areaId: 12,
        gatewayCode: "soil-001",
        gatewayName: "温室东区网关",
        gatewayType: "esp32",
        firmwareVersion: "1.0.0"
      }];
    }
    if (sql.includes("FROM iot_firmware_packages")) {
      return [{
        id: 11,
        tenantId: 5,
        packageNo: "FWPKG-11",
        deviceType: "esp32",
        packageName: "soil-sensor-reporter",
        firmwareVersion: "1.0.2",
        downloadUrl: "https://cdn.example.com/soil-1.0.2.bin",
        sha256: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        status: "released"
      }];
    }
    if (sql.includes("UPDATE iot_firmware_jobs")) {
      return { affectedRows: 0 };
    }
    if (sql.includes("INSERT INTO iot_firmware_jobs")) {
      return { insertId: 25 };
    }
    throw new Error(`Unexpected SQL in firmware job create test: ${sql.slice(0, 80)}`);
  };
  audit.logOperation = async () => {};
  dataScope.assertAreaAccess = async () => {};
  tenantFoundation.resolveCurrentTenantId = async () => 5;

  app = await createFirmwareRouteApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/firmware/jobs",
    payload: {
      gatewayId: 7,
      firmwarePackageId: 11,
      remark: "测试 OTA"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.id, 25);
  assert.equal(body.data.gatewayCode, "soil-001");
  assert.equal(body.data.targetVersion, "1.0.2");
  assert.equal(body.data.status, "pending");
  assert.equal(queryCalls.some((item) => item.sql.includes("UPDATE iot_firmware_jobs")), true);
  assert.equal(queryCalls.some((item) => item.sql.includes("INSERT INTO iot_firmware_jobs")), true);
});

test("firmware job create route rejects draft package", async () => {
  mysql.query = async (sql) => {
    if (sql.includes("FROM iot_gateways")) {
      return [{
        id: 7,
        tenantId: 5,
        areaId: 12,
        gatewayCode: "soil-001",
        gatewayName: "温室东区网关",
        gatewayType: "esp32",
        firmwareVersion: "1.0.0"
      }];
    }
    if (sql.includes("FROM iot_firmware_packages")) {
      return [{
        id: 11,
        tenantId: 5,
        packageNo: "FWPKG-11",
        deviceType: "esp32",
        packageName: "soil-sensor-reporter",
        firmwareVersion: "1.0.2",
        status: "draft"
      }];
    }
    throw new Error(`Unexpected SQL in firmware draft package test: ${sql.slice(0, 80)}`);
  };
  dataScope.assertAreaAccess = async () => {};

  app = await createFirmwareRouteApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/firmware/jobs",
    payload: {
      gatewayId: 7,
      firmwarePackageId: 11
    }
  });

  assert.equal(response.statusCode, 400);
  const body = response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "bad_request");
  assert.match(body.message, /固件包未发布/);
});
