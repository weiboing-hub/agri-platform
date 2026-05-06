// @ts-check

const os = require("os");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: process.env.ENV_FILE || path.resolve(process.cwd(), ".env"),
});

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function asInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * @param {unknown} value
 * @param {boolean} [fallback]
 * @returns {boolean}
 */
function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function asCsvList(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** @type {{
 *   port: number;
 *   host: string;
 *   tokenSecret: string;
 *   refreshTokenSecret: string;
 *   deviceIngestToken: string;
 *   openclawReadonlyToken: string;
 *   tokenExpiresHours: number;
 *   accessTokenExpiresMinutes: number;
 *   refreshTokenExpiresDays: number;
 *   authCacheTtlMs: number;
 *   bootstrapAdmin: { enabled: boolean; username: string; password: string; realName: string };
 *   rateLimit: { enabled: boolean; loginWindowMs: number; loginMax: number; ingestWindowMs: number; ingestMax: number };
 *   loginSecurity: { lockEnabled: boolean; failureThreshold: number; lockMinutes: number };
 *   aiProvider: { enabled: boolean; providerType: string; baseUrl: string; apiKey: string; model: string; timeoutMs: number; maxTokens: number; temperature: number; systemPrompt: string };
 *   notification: { senderName: string; webhookUrl: string; wecomWebhookUrl: string; dingtalkWebhookUrl: string; smsWebhookUrl: string; emailWebhookUrl: string; defaultTestChannel: string; testReceiver: string; timeoutMs: number };
 *   cors: { allowAll: boolean; allowedOrigins: string[]; credentials: boolean };
 *   mysql: {
 *     host: string;
 *     port: number;
 *     database: string;
 *     user: string;
 *     password: string;
 *     waitForConnections: true;
 *     connectionLimit: number;
 *     maxIdle: number;
 *     idleTimeout: number;
 *     queueLimit: number;
 *     enableKeepAlive: boolean;
 *     keepAliveInitialDelay: number;
 *   };
 * }} */
const config = {
  port: asInt(process.env.PORT, 3001),
  host: process.env.HOST || "0.0.0.0",
  tokenSecret: process.env.APP_TOKEN_SECRET || "dev-only-change-this-secret",
  refreshTokenSecret:
    process.env.APP_REFRESH_TOKEN_SECRET ||
    `${process.env.APP_TOKEN_SECRET || "dev-only-change-this-secret"}:refresh`,
  deviceIngestToken: process.env.DEVICE_INGEST_TOKEN || "DgQHl5VE1HpU7ab0AxAvRgMuIOOXrA_I",
  openclawReadonlyToken:
    process.env.OPENCLAW_READONLY_TOKEN ||
    (process.env.NODE_ENV === "production" ? "" : "OCLAW_READONLY_20260329_W7xP3L8Q"),
  tokenExpiresHours: asInt(process.env.TOKEN_EXPIRES_HOURS, 24),
  accessTokenExpiresMinutes: asInt(process.env.ACCESS_TOKEN_EXPIRES_MINUTES, 15),
  refreshTokenExpiresDays: asInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS, 7),
  authCacheTtlMs: asInt(process.env.AUTH_CACHE_TTL_MS, 5 * 60 * 1000),
  bootstrapAdmin: {
    enabled: String(process.env.BOOTSTRAP_ADMIN_ENABLED || "true").toLowerCase() !== "false",
    username: process.env.BOOTSTRAP_ADMIN_USERNAME || "admin",
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD || "Admin@123456",
    realName: process.env.BOOTSTRAP_ADMIN_REAL_NAME || "系统管理员"
  },
  rateLimit: {
    enabled: asBool(process.env.RATE_LIMIT_ENABLED, true),
    loginWindowMs: asInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MS, 15 * 60 * 1000),
    loginMax: asInt(process.env.RATE_LIMIT_LOGIN_MAX, 5),
    ingestWindowMs: asInt(process.env.RATE_LIMIT_INGEST_WINDOW_MS, 60 * 1000),
    ingestMax: asInt(process.env.RATE_LIMIT_INGEST_MAX, 100)
  },
  loginSecurity: {
    lockEnabled: asBool(process.env.LOGIN_LOCK_ENABLED, true),
    failureThreshold: asInt(process.env.LOGIN_FAILURE_THRESHOLD, 5),
    lockMinutes: asInt(process.env.LOGIN_LOCK_MINUTES, 15)
  },
  aiProvider: {
    enabled: String(process.env.AI_PROVIDER_ENABLED || "false").toLowerCase() === "true",
    providerType: process.env.AI_PROVIDER_TYPE || "local_mock",
    baseUrl: process.env.AI_PROVIDER_BASE_URL || "",
    apiKey: process.env.AI_PROVIDER_API_KEY || "",
    model: process.env.AI_PROVIDER_MODEL || "",
    timeoutMs: asInt(process.env.AI_PROVIDER_TIMEOUT_MS, 10000),
    maxTokens: asInt(process.env.AI_PROVIDER_MAX_TOKENS, 1200),
    temperature: Number.isFinite(Number(process.env.AI_PROVIDER_TEMPERATURE))
      ? Number(process.env.AI_PROVIDER_TEMPERATURE)
      : 0.2,
    systemPrompt: process.env.AI_PROVIDER_SYSTEM_PROMPT || ""
  },
  notification: {
    senderName: process.env.NOTIFICATION_SENDER_NAME || "智能农业监测平台",
    webhookUrl: process.env.NOTIFICATION_WEBHOOK_URL || "",
    wecomWebhookUrl: process.env.NOTIFICATION_WECOM_WEBHOOK_URL || "",
    dingtalkWebhookUrl: process.env.NOTIFICATION_DINGTALK_WEBHOOK_URL || "",
    smsWebhookUrl: process.env.NOTIFICATION_SMS_WEBHOOK_URL || "",
    emailWebhookUrl: process.env.NOTIFICATION_EMAIL_WEBHOOK_URL || "",
    defaultTestChannel: process.env.NOTIFICATION_DEFAULT_TEST_CHANNEL || "webhook",
    testReceiver: process.env.NOTIFICATION_TEST_RECEIVER || "",
    timeoutMs: asInt(process.env.NOTIFICATION_TIMEOUT_MS, 10000)
  },
  cors: {
    allowAll: asBool(process.env.CORS_ALLOW_ALL, process.env.NODE_ENV !== "production"),
    allowedOrigins: asCsvList(process.env.CORS_ALLOWED_ORIGINS),
    credentials: asBool(process.env.CORS_ALLOW_CREDENTIALS, true)
  },
  mysql: {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: asInt(process.env.MYSQL_PORT, 3306),
    database: process.env.MYSQL_DATABASE || "agri_iot_platform_dev",
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    waitForConnections: true,
    connectionLimit: asInt(process.env.MYSQL_CONNECTION_LIMIT, Math.max(20, os.cpus().length * 5)),
    maxIdle: asInt(process.env.MYSQL_MAX_IDLE, Math.max(10, os.cpus().length * 3)),
    idleTimeout: asInt(process.env.MYSQL_IDLE_TIMEOUT_MS, 60000),
    queueLimit: asInt(process.env.MYSQL_QUEUE_LIMIT, 100),
    enableKeepAlive: asBool(process.env.MYSQL_ENABLE_KEEP_ALIVE, true),
    keepAliveInitialDelay: asInt(process.env.MYSQL_KEEP_ALIVE_INITIAL_DELAY_MS, 10000)
  }
};

if (process.env.NODE_ENV === "production") {
  if (!process.env.APP_TOKEN_SECRET || config.tokenSecret === "dev-only-change-this-secret") {
    throw new Error("生产环境必须设置 APP_TOKEN_SECRET");
  }
  if (!process.env.APP_REFRESH_TOKEN_SECRET || config.refreshTokenSecret.endsWith(":refresh")) {
    throw new Error("生产环境必须设置 APP_REFRESH_TOKEN_SECRET");
  }
  if (!process.env.DEVICE_INGEST_TOKEN || config.deviceIngestToken === "DgQHl5VE1HpU7ab0AxAvRgMuIOOXrA_I") {
    throw new Error("生产环境必须设置 DEVICE_INGEST_TOKEN");
  }
  if (config.openclawReadonlyToken === "OCLAW_READONLY_20260329_W7xP3L8Q") {
    throw new Error("生产环境禁止使用默认 OPENCLAW_READONLY_TOKEN");
  }
  if (config.bootstrapAdmin.enabled && config.bootstrapAdmin.password === "Admin@123456") {
    throw new Error("生产环境启用引导管理员时必须修改 BOOTSTRAP_ADMIN_PASSWORD");
  }
  if (!config.cors.allowAll && config.cors.allowedOrigins.length === 0) {
    throw new Error("生产环境收紧 CORS 时必须设置 CORS_ALLOWED_ORIGINS");
  }
}

module.exports = config;
