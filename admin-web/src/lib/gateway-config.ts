export interface GatewayDeviceConfig {
  cloud: {
    apiHost: string;
    reportIntervalMs: number;
    controlPollIntervalMs: number;
  };
  rs485: {
    baudrate: number;
    modbusAddress: number;
    registerStart: number;
    registerCount: number;
    tempRegisterIndex: number;
    humRegisterIndex: number;
  };
  control: {
    pumpGpio: number;
    activeHigh: boolean;
    maxRunSeconds: number;
    minOffSeconds: number;
    maxDailyRunSeconds: number;
  };
  autonomy: {
    enabled: boolean;
    startHumidityBelow: number;
    stopHumidityAbove: number;
    pulseSeconds: number;
    minRecheckSeconds: number;
    requireValidSensor: boolean;
    disableWhenCloudCommandPending: boolean;
  };
  capabilities: {
    localWebEnabled: boolean;
    otaEnabled: boolean;
    cellularEnabled: boolean;
  };
}

export interface GatewayTemplateRecord {
  id: number;
  templateCode: string;
  templateName: string;
  gatewayType: string;
  status: string;
  remark: string | null;
  config: GatewayDeviceConfig;
  configSummary: GatewayConfigSummary;
  gatewayUsageCount?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface GatewayConfigRecord {
  gatewayId: number;
  gatewayCode: string;
  gatewayName: string;
  gatewayType: string;
  templateId: number | null;
  templateCode: string | null;
  templateName: string | null;
  configVersion: number;
  configSyncStatus: string;
  configMessage: string | null;
  lastConfigPushedAt: string | null;
  lastConfigAppliedAt: string | null;
  configSource: string;
  config: GatewayDeviceConfig;
  configSummary: GatewayConfigSummary;
}

export interface GatewayConfigLogRecord {
  id: number;
  gatewayId: number;
  gatewayCode: string;
  gatewayName: string;
  templateId: number | null;
  templateCode: string | null;
  templateName: string | null;
  configVersion: number;
  actionType: string;
  syncStatus: string;
  configSource: string;
  operatorUserId: number | null;
  operatorName: string | null;
  messageText: string | null;
  createdAt: string | null;
  configSummary: GatewayConfigSummary;
}

export interface GatewayConfigSummary {
  apiHost: string;
  reportIntervalMs: number;
  controlPollIntervalMs: number;
  modbusAddress: number;
  baudrate: number;
  pumpGpio: number;
  activeHigh: boolean;
  maxRunSeconds: number;
  minOffSeconds: number;
  maxDailyRunSeconds: number;
  autonomyEnabled: boolean;
  autonomyStartHumidityBelow: number;
  autonomyStopHumidityAbove: number;
  autonomyPulseSeconds: number;
  autonomyMinRecheckSeconds: number;
  autonomyRequireValidSensor: boolean;
  autonomyDisableWhenCloudCommandPending: boolean;
  localWebEnabled: boolean;
  otaEnabled: boolean;
  cellularEnabled: boolean;
}

export const DEFAULT_ESP32_GATEWAY_CONFIG: GatewayDeviceConfig = {
  cloud: {
    apiHost: "",
    reportIntervalMs: 20000,
    controlPollIntervalMs: 10000
  },
  rs485: {
    baudrate: 9600,
    modbusAddress: 2,
    registerStart: 0,
    registerCount: 2,
    tempRegisterIndex: 0,
    humRegisterIndex: 1
  },
  control: {
    pumpGpio: 26,
    activeHigh: true,
    maxRunSeconds: 900,
    minOffSeconds: 30,
    maxDailyRunSeconds: 1800
  },
  autonomy: {
    enabled: false,
    startHumidityBelow: 35,
    stopHumidityAbove: 45,
    pulseSeconds: 10,
    minRecheckSeconds: 300,
    requireValidSensor: true,
    disableWhenCloudCommandPending: true
  },
  capabilities: {
    localWebEnabled: true,
    otaEnabled: true,
    cellularEnabled: false
  }
};

function normalizeInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "enabled", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "disabled", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

export function cloneGatewayConfig(config: GatewayDeviceConfig = DEFAULT_ESP32_GATEWAY_CONFIG): GatewayDeviceConfig {
  return JSON.parse(JSON.stringify(config)) as GatewayDeviceConfig;
}

export function normalizeGatewayConfig(value: unknown): GatewayDeviceConfig {
  const input = (value && typeof value === "object" ? value : {}) as Record<string, any>;
  const cloud = (input.cloud || {}) as Record<string, any>;
  const rs485 = (input.rs485 || {}) as Record<string, any>;
  const control = (input.control || {}) as Record<string, any>;
  const autonomy = (input.autonomy || {}) as Record<string, any>;
  const capabilities = (input.capabilities || {}) as Record<string, any>;

  return {
    cloud: {
      apiHost: String(cloud.apiHost || DEFAULT_ESP32_GATEWAY_CONFIG.cloud.apiHost),
      reportIntervalMs: normalizeInt(cloud.reportIntervalMs, DEFAULT_ESP32_GATEWAY_CONFIG.cloud.reportIntervalMs),
      controlPollIntervalMs: normalizeInt(cloud.controlPollIntervalMs, DEFAULT_ESP32_GATEWAY_CONFIG.cloud.controlPollIntervalMs)
    },
    rs485: {
      baudrate: normalizeInt(rs485.baudrate, DEFAULT_ESP32_GATEWAY_CONFIG.rs485.baudrate),
      modbusAddress: normalizeInt(rs485.modbusAddress, DEFAULT_ESP32_GATEWAY_CONFIG.rs485.modbusAddress),
      registerStart: normalizeInt(rs485.registerStart, DEFAULT_ESP32_GATEWAY_CONFIG.rs485.registerStart),
      registerCount: normalizeInt(rs485.registerCount, DEFAULT_ESP32_GATEWAY_CONFIG.rs485.registerCount),
      tempRegisterIndex: normalizeInt(rs485.tempRegisterIndex, DEFAULT_ESP32_GATEWAY_CONFIG.rs485.tempRegisterIndex),
      humRegisterIndex: normalizeInt(rs485.humRegisterIndex, DEFAULT_ESP32_GATEWAY_CONFIG.rs485.humRegisterIndex)
    },
    control: {
      pumpGpio: normalizeInt(control.pumpGpio, DEFAULT_ESP32_GATEWAY_CONFIG.control.pumpGpio),
      activeHigh: normalizeBoolean(control.activeHigh, DEFAULT_ESP32_GATEWAY_CONFIG.control.activeHigh),
      maxRunSeconds: normalizeInt(control.maxRunSeconds, DEFAULT_ESP32_GATEWAY_CONFIG.control.maxRunSeconds),
      minOffSeconds: normalizeInt(control.minOffSeconds, DEFAULT_ESP32_GATEWAY_CONFIG.control.minOffSeconds),
      maxDailyRunSeconds: normalizeInt(control.maxDailyRunSeconds, DEFAULT_ESP32_GATEWAY_CONFIG.control.maxDailyRunSeconds)
    },
    autonomy: {
      enabled: normalizeBoolean(autonomy.enabled, DEFAULT_ESP32_GATEWAY_CONFIG.autonomy.enabled),
      startHumidityBelow: normalizeInt(autonomy.startHumidityBelow, DEFAULT_ESP32_GATEWAY_CONFIG.autonomy.startHumidityBelow),
      stopHumidityAbove: normalizeInt(autonomy.stopHumidityAbove, DEFAULT_ESP32_GATEWAY_CONFIG.autonomy.stopHumidityAbove),
      pulseSeconds: normalizeInt(autonomy.pulseSeconds, DEFAULT_ESP32_GATEWAY_CONFIG.autonomy.pulseSeconds),
      minRecheckSeconds: normalizeInt(autonomy.minRecheckSeconds, DEFAULT_ESP32_GATEWAY_CONFIG.autonomy.minRecheckSeconds),
      requireValidSensor: normalizeBoolean(autonomy.requireValidSensor, DEFAULT_ESP32_GATEWAY_CONFIG.autonomy.requireValidSensor),
      disableWhenCloudCommandPending: normalizeBoolean(
        autonomy.disableWhenCloudCommandPending,
        DEFAULT_ESP32_GATEWAY_CONFIG.autonomy.disableWhenCloudCommandPending
      )
    },
    capabilities: {
      localWebEnabled: normalizeBoolean(capabilities.localWebEnabled, DEFAULT_ESP32_GATEWAY_CONFIG.capabilities.localWebEnabled),
      otaEnabled: normalizeBoolean(capabilities.otaEnabled, DEFAULT_ESP32_GATEWAY_CONFIG.capabilities.otaEnabled),
      cellularEnabled: normalizeBoolean(capabilities.cellularEnabled, DEFAULT_ESP32_GATEWAY_CONFIG.capabilities.cellularEnabled)
    }
  };
}

export function summarizeGatewayConfig(config: GatewayDeviceConfig): GatewayConfigSummary {
  const normalized = normalizeGatewayConfig(config);
  return {
    apiHost: normalized.cloud.apiHost,
    reportIntervalMs: normalized.cloud.reportIntervalMs,
    controlPollIntervalMs: normalized.cloud.controlPollIntervalMs,
    modbusAddress: normalized.rs485.modbusAddress,
    baudrate: normalized.rs485.baudrate,
    pumpGpio: normalized.control.pumpGpio,
    activeHigh: normalized.control.activeHigh,
    maxRunSeconds: normalized.control.maxRunSeconds,
    minOffSeconds: normalized.control.minOffSeconds,
    maxDailyRunSeconds: normalized.control.maxDailyRunSeconds,
    autonomyEnabled: normalized.autonomy.enabled,
    autonomyStartHumidityBelow: normalized.autonomy.startHumidityBelow,
    autonomyStopHumidityAbove: normalized.autonomy.stopHumidityAbove,
    autonomyPulseSeconds: normalized.autonomy.pulseSeconds,
    autonomyMinRecheckSeconds: normalized.autonomy.minRecheckSeconds,
    autonomyRequireValidSensor: normalized.autonomy.requireValidSensor,
    autonomyDisableWhenCloudCommandPending: normalized.autonomy.disableWhenCloudCommandPending,
    localWebEnabled: normalized.capabilities.localWebEnabled,
    otaEnabled: normalized.capabilities.otaEnabled,
    cellularEnabled: normalized.capabilities.cellularEnabled
  };
}
