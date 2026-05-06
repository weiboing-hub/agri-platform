const { after, afterEach, test } = require("node:test");
const assert = require("node:assert/strict");
const Fastify = require("fastify");

const { pool, query } = require("../src/lib/mysql");
const config = require("../src/lib/config");
const { invalidateTenantFoundationCache } = require("../src/lib/tenant-foundation");

const shouldRunDbTests = process.env.RUN_DB_TESTS === "true" && Boolean(process.env.MYSQL_PASSWORD);
const dbTest = shouldRunDbTests ? test : test.skip;

let app = null;

function loadFreshRoute(modulePath) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  return require(modulePath);
}

async function createAlertRouteApp(authContext) {
  const alertRoutes = loadFreshRoute("../src/routes/alerts");
  const fastify = Fastify();
  fastify.decorateRequest("auth", null);
  fastify.decorate("authenticate", async (request) => {
    request.auth = authContext;
  });
  fastify.decorate("requirePermissions", () => async (request) => {
    request.auth = authContext;
  });
  await fastify.register(alertRoutes);
  return fastify;
}

async function createIotRouteApp() {
  const iotRoutes = loadFreshRoute("../src/routes/iot");
  const fastify = Fastify();
  await fastify.register(iotRoutes);
  return fastify;
}

async function findOrCreateArea(tenantId = null) {
  const filters = [];
  const params = [];
  if (tenantId) {
    filters.push("tenant_id = ?");
    params.push(tenantId);
  }

  const existingRows = await query(
    `SELECT id, area_code AS areaCode, tenant_id AS tenantId
     FROM biz_areas
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
     ORDER BY id ASC
     LIMIT 1`,
    params
  );
  if (existingRows[0]) {
    return {
      id: existingRows[0].id,
      areaCode: existingRows[0].areaCode,
      tenantId: existingRows[0].tenantId || tenantId,
      inserted: false
    };
  }

  const areaCode = `TEST-AREA-${Date.now()}`;
  let result;
  if (tenantId) {
    [result] = await pool.execute(
      `INSERT INTO biz_areas
        (tenant_id, area_code, area_name, area_type, area_level, status, remark)
       VALUES (?, ?, ?, 'greenhouse', 1, 'enabled', 'db integration test')`,
      [tenantId, areaCode, "DB 集成测试区域"]
    );
  } else {
    [result] = await pool.execute(
      `INSERT INTO biz_areas
        (area_code, area_name, area_type, area_level, status, remark)
       VALUES (?, ?, 'greenhouse', 1, 'enabled', 'db integration test')`,
      [areaCode, "DB 集成测试区域"]
    );
  }

  return {
    id: result.insertId,
    areaCode,
    tenantId,
    inserted: true
  };
}

async function getDefaultTenantId() {
  const rows = await query(
    `SELECT id
     FROM sys_tenants
     WHERE is_default = 1
        OR tenant_code = 'default'
     ORDER BY is_default DESC, id ASC
     LIMIT 1`
  );
  return rows[0]?.id || null;
}

async function isSchemaReadyForDbIntegration() {
  const rows = await query(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND (
         (TABLE_NAME = 'sys_configs' AND COLUMN_NAME = 'tenant_id')
         OR (TABLE_NAME = 'sys_operation_logs' AND COLUMN_NAME = 'tenant_id')
       )`
  );

  const found = new Set(rows.map((row) => `${row.tableName}.${row.columnName}`));
  return (
    found.has("sys_configs.tenant_id") &&
    found.has("sys_operation_logs.tenant_id")
  );
}

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

after(async () => {
  await pool.end();
});

dbTest("db integration: alert transition route updates alert and writes transition", async (t) => {
  if (!await isSchemaReadyForDbIntegration()) {
    t.skip("本地开发库缺少多租户相关列，需先同步最新 SQL 迁移后再跑真数据库集成测试");
    return;
  }

  invalidateTenantFoundationCache();
  const defaultTenantId = await getDefaultTenantId();
  const area = await findOrCreateArea(defaultTenantId);
  const alertNo = `AL-DB-${Date.now()}`;
  let alertId = null;

  try {
    const [insertResult] = await pool.execute(
      `INSERT INTO ops_alerts
        (tenant_id, alert_no, area_id, alert_type, severity, status, title, triggered_at)
       VALUES (?, ?, ?, 'threshold', 'high', 'pending', 'DB 集成测试告警', NOW())`,
      [defaultTenantId, alertNo, area.id]
    );
    alertId = insertResult.insertId;

    app = await createAlertRouteApp({
      tenant: {
        id: defaultTenantId,
        tenantCode: "default",
        tenantSlug: "default"
      },
      user: { id: 1 },
      permissionCodes: ["alert:assign"],
      dataScopes: [
        {
          targetType: "area",
          scopeType: "all"
        }
      ]
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/alerts/${alertId}/transitions`,
      payload: {
        actionType: "assign",
        assignedTo: 2,
        remarkText: "转交值班员"
      }
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.ok, true);
    assert.equal(body.data.assignedTo, 2);

    const alertRows = await query(
      `SELECT status, assigned_to AS assignedTo, handled_remark AS handledRemark
       FROM ops_alerts
       WHERE id = ?`,
      [alertId]
    );
    assert.equal(alertRows[0].status, "pending");
    assert.equal(alertRows[0].assignedTo, 2);
    assert.equal(alertRows[0].handledRemark, "转交值班员");

    const transitionRows = await query(
      `SELECT action_type AS actionType, assigned_to AS assignedTo, remark_text AS remarkText
       FROM ops_alert_transitions
       WHERE alert_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [alertId]
    );
    assert.equal(transitionRows[0].actionType, "assign");
    assert.equal(transitionRows[0].assignedTo, 2);
    assert.equal(transitionRows[0].remarkText, "转交值班员");
  } finally {
    if (alertId) {
      await pool.execute("DELETE FROM sys_operation_logs WHERE module_code = 'alert_center' AND target_id = ?", [String(alertId)]);
      await pool.execute("DELETE FROM ops_alert_transitions WHERE alert_id = ?", [alertId]);
      await pool.execute("DELETE FROM ops_alerts WHERE id = ?", [alertId]);
    }
    if (area.inserted) {
      await pool.execute("DELETE FROM biz_areas WHERE id = ?", [area.id]);
    }
  }
});

dbTest("db integration: iot ingest route writes gateway, sensor, reading and operation log", async (t) => {
  if (!await isSchemaReadyForDbIntegration()) {
    t.skip("本地开发库缺少多租户相关列，需先同步最新 SQL 迁移后再跑真数据库集成测试");
    return;
  }

  invalidateTenantFoundationCache();
  const deviceId = `soil-db-${Date.now()}`;
  const sensorCode = `SNS-${deviceId.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}-TEMPERATURE`;
  let createdAreaId = null;
  let gatewayId = null;
  let sensorId = null;

  try {
    const existingDefaultArea = await query(
      `SELECT id
       FROM biz_areas
       WHERE area_code = 'AREA-AUTO-DEFAULT'
       LIMIT 1`
    );
    createdAreaId = existingDefaultArea[0]?.id || null;

    app = await createIotRouteApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/iot/ingest",
      headers: {
        authorization: `Bearer ${config.deviceIngestToken}`
      },
      payload: {
        deviceId,
        deviceName: "数据库集成测试设备",
        samplingStatus: "running",
        rssi: -61,
        metrics: [
          {
            metricCode: "temperature",
            metricName: "温度",
            value: 22.4,
            unitName: "℃"
          }
        ]
      }
    });

    assert.equal(response.statusCode, 201);
    const body = response.json();
    assert.equal(body.ok, true);
    assert.equal(body.data.deviceId, deviceId);
    assert.equal(body.data.acceptedMetricCount, 1);

    const gatewayRows = await query(
      `SELECT id, area_id AS areaId, gateway_name AS gatewayName
       FROM iot_gateways
       WHERE gateway_code = ?
       LIMIT 1`,
      [deviceId]
    );
    assert.equal(gatewayRows.length, 1);
    gatewayId = gatewayRows[0].id;
    assert.equal(gatewayRows[0].gatewayName, "数据库集成测试设备");

    if (!createdAreaId) {
      createdAreaId = gatewayRows[0].areaId;
    }

    const sensorRows = await query(
      `SELECT id, sensor_name AS sensorName, current_value_decimal AS currentValue
       FROM iot_sensors
       WHERE sensor_code = ?
       LIMIT 1`,
      [sensorCode]
    );
    assert.equal(sensorRows.length, 1);
    sensorId = sensorRows[0].id;
    assert.match(sensorRows[0].sensorName, /数据库集成测试设备/);
    assert.equal(Number(sensorRows[0].currentValue), 22.4);

    const readingRows = await query(
      `SELECT metric_code AS metricCode, metric_value AS metricValue, data_source AS dataSource
       FROM iot_sensor_readings
       WHERE sensor_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [sensorId]
    );
    assert.equal(readingRows.length, 1);
    assert.equal(readingRows[0].metricCode, "temperature");
    assert.equal(Number(readingRows[0].metricValue), 22.4);
    assert.equal(readingRows[0].dataSource, "realtime");

    const logRows = await query(
      `SELECT module_code AS moduleCode, target_id AS targetId
       FROM sys_operation_logs
       WHERE module_code = 'iot_ingest'
         AND target_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [String(gatewayId)]
    );
    assert.equal(logRows.length, 1);
    assert.equal(logRows[0].moduleCode, "iot_ingest");
  } finally {
    if (sensorId) {
      await pool.execute("DELETE FROM iot_sensor_readings WHERE sensor_id = ?", [sensorId]);
      await pool.execute("DELETE FROM iot_sensor_channels WHERE sensor_id = ?", [sensorId]);
      await pool.execute("DELETE FROM iot_sensors WHERE id = ?", [sensorId]);
    }
    if (gatewayId) {
      await pool.execute("DELETE FROM sys_operation_logs WHERE module_code = 'iot_ingest' AND target_id = ?", [String(gatewayId)]);
      await pool.execute("DELETE FROM iot_gateways WHERE id = ?", [gatewayId]);
    }
    if (createdAreaId) {
      const areaRows = await query(
        `SELECT area_code AS areaCode, remark
         FROM biz_areas
         WHERE id = ?
         LIMIT 1`,
        [createdAreaId]
      );
      if (areaRows[0]?.areaCode === "AREA-AUTO-DEFAULT" && /默认区域/.test(areaRows[0]?.remark || "")) {
        const gatewayCountRows = await query(
          `SELECT COUNT(*) AS total
           FROM iot_gateways
           WHERE area_id = ?`,
          [createdAreaId]
        );
        if (Number(gatewayCountRows[0].total || 0) === 0) {
          await pool.execute("DELETE FROM biz_areas WHERE id = ?", [createdAreaId]);
        }
      }
    }
  }
});
