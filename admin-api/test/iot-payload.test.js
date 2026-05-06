const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveDeviceTenantId,
  normalizeIngestPayload,
  normalizeSamplingStatus,
  classifyTimeQuality,
  buildSensorCode
} = require("../src/lib/iot-payload");

test("resolveDeviceTenantId prefers credential tenant when provided", () => {
  const tenantId = resolveDeviceTenantId(
    { tenantId: "7" },
    { tenantFoundationEnabled: true, defaultTenantId: 1 }
  );

  assert.equal(tenantId, 7);
});

test("resolveDeviceTenantId falls back to default tenant when foundation is enabled", () => {
  const tenantId = resolveDeviceTenantId(
    { tenantId: null },
    { tenantFoundationEnabled: true, defaultTenantId: 3 }
  );

  assert.equal(tenantId, 3);
});

test("resolveDeviceTenantId returns null when tenant foundation is disabled", () => {
  const tenantId = resolveDeviceTenantId(
    { tenantId: null },
    { tenantFoundationEnabled: false, defaultTenantId: 3 }
  );

  assert.equal(tenantId, null);
});

test("normalizeIngestPayload accepts metrics array payload", () => {
  const payload = normalizeIngestPayload({
    deviceId: "soil-001",
    deviceName: "温室东区",
    rssi: "-62",
    samplingStatus: "paused",
    appliedCommandVersion: "6",
    collectedAt: "2026-04-04T10:00:00.000Z",
    metrics: [
      { metricCode: "temperature", metricName: "温度", value: "21.3", unitName: "℃" },
      { metricCode: "humidity", metricName: "湿度", value: "56.5", unitName: "%" }
    ]
  });

  assert.equal(payload.deviceId, "soil-001");
  assert.equal(payload.deviceName, "温室东区");
  assert.equal(payload.rssi, -62);
  assert.equal(payload.samplingStatus, "paused");
  assert.equal(payload.appliedCommandVersion, 6);
  assert.equal(payload.metrics.length, 2);
  assert.equal(payload.metrics[0].metricCode, "temperature");
  assert.equal(payload.metrics[1].value, 56.5);
  assert.ok(payload.collectedAt instanceof Date);
});

test("normalizeIngestPayload falls back to legacy temp and hum fields", () => {
  const payload = normalizeIngestPayload({
    device_id: "soil-002",
    temp: "19.8",
    humidity: "44.2"
  });

  assert.equal(payload.deviceId, "soil-002");
  assert.equal(payload.deviceName, "soil-002");
  assert.equal(payload.metrics.length, 2);
  assert.deepEqual(
    payload.metrics.map((item) => item.metricCode),
    ["temperature", "humidity"]
  );
});

test("normalizeIngestPayload rejects empty metric payloads", () => {
  assert.throws(
    () => normalizeIngestPayload({ deviceId: "soil-003", metrics: [] }),
    /上报内容缺少有效指标/
  );
});

test("normalizeSamplingStatus only accepts running or paused", () => {
  assert.equal(normalizeSamplingStatus("running"), "running");
  assert.equal(normalizeSamplingStatus(" paused "), "paused");
  assert.throws(() => normalizeSamplingStatus("sleep"), /samplingStatus 仅支持 running 或 paused/);
});

test("classifyTimeQuality returns high medium low by delay thresholds", () => {
  assert.equal(classifyTimeQuality(3000), "high");
  assert.equal(classifyTimeQuality(12000), "medium");
  assert.equal(classifyTimeQuality(90000), "low");
});

test("buildSensorCode normalizes device and metric codes", () => {
  const sensorCode = buildSensorCode("soil east #1", "soil moisture");

  assert.equal(sensorCode, "SNS-SOIL-EAST-1-SOIL-MOISTURE");
});
