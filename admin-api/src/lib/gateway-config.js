// @ts-check

const { normalizeEnabled, optionalString, parseInteger } = require("./helpers");

const DEFAULT_ESP32_GATEWAY_CONFIG = Object.freeze({
  cloud: Object.freeze({
    apiHost: "",
    reportIntervalMs: 20000,
    controlPollIntervalMs: 10000
  }),
  rs485: Object.freeze({
    baudrate: 9600,
    modbusAddress: 2,
    registerStart: 0,
    registerCount: 2,
    tempRegisterIndex: 0,
    humRegisterIndex: 1
  }),
  control: Object.freeze({
    pumpGpio: 26,
    activeHigh: true,
    maxRunSeconds: 900,
    minOffSeconds: 30,
    maxDailyRunSeconds: 1800
  }),
  autonomy: Object.freeze({
    enabled: false,
    startHumidityBelow: 35,
    stopHumidityAbove: 45,
    pulseSeconds: 10,
    minRecheckSeconds: 300,
    requireValidSensor: true,
    disableWhenCloudCommandPending: true
  }),
  capabilities: Object.freeze({
    localWebEnabled: true,
    otaEnabled: true,
    cellularEnabled: false
  })
});

/**
 * @param {unknown} value
 * @returns {Record<string, any>}
 */
function parseObject(value) {
  if (!value) {
    return {};
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? /** @type {Record<string, any>} */ (value) : {};
}

/**
 * @param {unknown} value
 * @returns {{
 *   cloud: { apiHost: string; reportIntervalMs: number; controlPollIntervalMs: number };
 *   rs485: { baudrate: number; modbusAddress: number; registerStart: number; registerCount: number; tempRegisterIndex: number; humRegisterIndex: number };
 *   control: { pumpGpio: number; activeHigh: boolean; maxRunSeconds: number; minOffSeconds: number; maxDailyRunSeconds: number };
 *   autonomy: {
 *     enabled: boolean;
 *     startHumidityBelow: number;
 *     stopHumidityAbove: number;
 *     pulseSeconds: number;
 *     minRecheckSeconds: number;
 *     requireValidSensor: boolean;
 *     disableWhenCloudCommandPending: boolean;
 *   };
 *   capabilities: { localWebEnabled: boolean; otaEnabled: boolean; cellularEnabled: boolean };
 * }}
 */
function normalizeGatewayConfig(value) {
  const input = parseObject(value);
  const cloud = parseObject(input.cloud);
  const rs485 = parseObject(input.rs485);
  const control = parseObject(input.control);
  const autonomy = parseObject(input.autonomy);
  const capabilities = parseObject(input.capabilities);

  return {
    cloud: {
      apiHost: optionalString(cloud.apiHost) || DEFAULT_ESP32_GATEWAY_CONFIG.cloud.apiHost,
      reportIntervalMs: parseInteger(cloud.reportIntervalMs, DEFAULT_ESP32_GATEWAY_CONFIG.cloud.reportIntervalMs),
      controlPollIntervalMs: parseInteger(cloud.controlPollIntervalMs, DEFAULT_ESP32_GATEWAY_CONFIG.cloud.controlPollIntervalMs)
    },
    rs485: {
      baudrate: parseInteger(rs485.baudrate, DEFAULT_ESP32_GATEWAY_CONFIG.rs485.baudrate),
      modbusAddress: parseInteger(rs485.modbusAddress, DEFAULT_ESP32_GATEWAY_CONFIG.rs485.modbusAddress),
      registerStart: parseInteger(rs485.registerStart, DEFAULT_ESP32_GATEWAY_CONFIG.rs485.registerStart),
      registerCount: parseInteger(rs485.registerCount, DEFAULT_ESP32_GATEWAY_CONFIG.rs485.registerCount),
      tempRegisterIndex: parseInteger(rs485.tempRegisterIndex, DEFAULT_ESP32_GATEWAY_CONFIG.rs485.tempRegisterIndex),
      humRegisterIndex: parseInteger(rs485.humRegisterIndex, DEFAULT_ESP32_GATEWAY_CONFIG.rs485.humRegisterIndex)
    },
    control: {
      pumpGpio: parseInteger(control.pumpGpio, DEFAULT_ESP32_GATEWAY_CONFIG.control.pumpGpio),
      activeHigh: normalizeEnabled(control.activeHigh, DEFAULT_ESP32_GATEWAY_CONFIG.control.activeHigh),
      maxRunSeconds: parseInteger(control.maxRunSeconds, DEFAULT_ESP32_GATEWAY_CONFIG.control.maxRunSeconds),
      minOffSeconds: parseInteger(control.minOffSeconds, DEFAULT_ESP32_GATEWAY_CONFIG.control.minOffSeconds),
      maxDailyRunSeconds: parseInteger(control.maxDailyRunSeconds, DEFAULT_ESP32_GATEWAY_CONFIG.control.maxDailyRunSeconds)
    },
    autonomy: {
      enabled: normalizeEnabled(autonomy.enabled, DEFAULT_ESP32_GATEWAY_CONFIG.autonomy.enabled),
      startHumidityBelow: parseInteger(autonomy.startHumidityBelow, DEFAULT_ESP32_GATEWAY_CONFIG.autonomy.startHumidityBelow),
      stopHumidityAbove: parseInteger(autonomy.stopHumidityAbove, DEFAULT_ESP32_GATEWAY_CONFIG.autonomy.stopHumidityAbove),
      pulseSeconds: parseInteger(autonomy.pulseSeconds, DEFAULT_ESP32_GATEWAY_CONFIG.autonomy.pulseSeconds),
      minRecheckSeconds: parseInteger(autonomy.minRecheckSeconds, DEFAULT_ESP32_GATEWAY_CONFIG.autonomy.minRecheckSeconds),
      requireValidSensor: normalizeEnabled(autonomy.requireValidSensor, DEFAULT_ESP32_GATEWAY_CONFIG.autonomy.requireValidSensor),
      disableWhenCloudCommandPending: normalizeEnabled(
        autonomy.disableWhenCloudCommandPending,
        DEFAULT_ESP32_GATEWAY_CONFIG.autonomy.disableWhenCloudCommandPending
      )
    },
    capabilities: {
      localWebEnabled: normalizeEnabled(capabilities.localWebEnabled, DEFAULT_ESP32_GATEWAY_CONFIG.capabilities.localWebEnabled),
      otaEnabled: normalizeEnabled(capabilities.otaEnabled, DEFAULT_ESP32_GATEWAY_CONFIG.capabilities.otaEnabled),
      cellularEnabled: normalizeEnabled(capabilities.cellularEnabled, DEFAULT_ESP32_GATEWAY_CONFIG.capabilities.cellularEnabled)
    }
  };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function stringifyGatewayConfig(value) {
  return JSON.stringify(normalizeGatewayConfig(value));
}

/**
 * @param {unknown} value
 * @returns {{
 *   apiHost: string;
 *   reportIntervalMs: number;
 *   controlPollIntervalMs: number;
 *   modbusAddress: number;
 *   baudrate: number;
 *   pumpGpio: number;
 *   activeHigh: boolean;
 *   maxRunSeconds: number;
 *   minOffSeconds: number;
 *   maxDailyRunSeconds: number;
 *   autonomyEnabled: boolean;
 *   autonomyStartHumidityBelow: number;
 *   autonomyStopHumidityAbove: number;
 *   autonomyPulseSeconds: number;
 *   autonomyMinRecheckSeconds: number;
 *   autonomyRequireValidSensor: boolean;
 *   autonomyDisableWhenCloudCommandPending: boolean;
 *   localWebEnabled: boolean;
 *   otaEnabled: boolean;
 *   cellularEnabled: boolean;
 * }}
 */
function summarizeGatewayConfig(value) {
  const config = normalizeGatewayConfig(value);
  return {
    apiHost: config.cloud.apiHost,
    reportIntervalMs: config.cloud.reportIntervalMs,
    controlPollIntervalMs: config.cloud.controlPollIntervalMs,
    modbusAddress: config.rs485.modbusAddress,
    baudrate: config.rs485.baudrate,
    pumpGpio: config.control.pumpGpio,
    activeHigh: config.control.activeHigh,
    maxRunSeconds: config.control.maxRunSeconds,
    minOffSeconds: config.control.minOffSeconds,
    maxDailyRunSeconds: config.control.maxDailyRunSeconds,
    autonomyEnabled: config.autonomy.enabled,
    autonomyStartHumidityBelow: config.autonomy.startHumidityBelow,
    autonomyStopHumidityAbove: config.autonomy.stopHumidityAbove,
    autonomyPulseSeconds: config.autonomy.pulseSeconds,
    autonomyMinRecheckSeconds: config.autonomy.minRecheckSeconds,
    autonomyRequireValidSensor: config.autonomy.requireValidSensor,
    autonomyDisableWhenCloudCommandPending: config.autonomy.disableWhenCloudCommandPending,
    localWebEnabled: config.capabilities.localWebEnabled,
    otaEnabled: config.capabilities.otaEnabled,
    cellularEnabled: config.capabilities.cellularEnabled
  };
}

module.exports = {
  DEFAULT_ESP32_GATEWAY_CONFIG,
  normalizeGatewayConfig,
  stringifyGatewayConfig,
  summarizeGatewayConfig
};
