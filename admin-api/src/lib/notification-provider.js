const config = require("./config");
const { loadConfigGroup } = require("./system-config");

function normalizeNotificationOptions(options = null) {
  if (options && typeof options.execute === "function") {
    return {
      connection: options,
      authContext: null,
      tenantId: null
    };
  }

  return {
    connection: options?.connection || null,
    authContext: options?.authContext || null,
    tenantId: options?.tenantId ?? null
  };
}

async function getNotificationConfig(options = null) {
  const normalized = normalizeNotificationOptions(options);
  const rawConfig = await loadConfigGroup("notification_channel", normalized);
  return {
    senderName: String(rawConfig.sender_name || config.notification.senderName || "智能农业监测平台").trim(),
    defaultWebhookUrl: String(rawConfig.webhook_url || config.notification.webhookUrl || "").trim(),
    wecomWebhookUrl: String(rawConfig.wecom_webhook_url || rawConfig.wechat_webhook_url || config.notification.wecomWebhookUrl || "").trim(),
    dingtalkWebhookUrl: String(rawConfig.dingtalk_webhook_url || config.notification.dingtalkWebhookUrl || "").trim(),
    smsWebhookUrl: String(rawConfig.sms_webhook_url || config.notification.smsWebhookUrl || "").trim(),
    emailWebhookUrl: String(rawConfig.email_webhook_url || config.notification.emailWebhookUrl || "").trim(),
    defaultTestChannel: String(rawConfig.default_test_channel || config.notification.defaultTestChannel || "webhook").trim(),
    testReceiver: String(rawConfig.test_receiver || config.notification.testReceiver || "").trim(),
    timeoutMs: normalizeInteger(rawConfig.timeout_ms ?? config.notification.timeoutMs, 10000)
  };
}

async function testNotificationChannel(options = null) {
  const normalized = normalizeNotificationOptions(options);
  const channelConfig = await getNotificationConfig(normalized);
  const result = await sendNotification(normalized.connection, {
    channelType: channelConfig.defaultTestChannel,
    receiverType: "manual",
    receiverValue: channelConfig.testReceiver || "system-test",
    contentSummary: "系统联调测试通知",
    alertNo: "TEST-NOTIFICATION",
    alertTitle: "通知通道联调测试",
    isTest: true
  }, normalized);

  return {
    target: "notification",
    status: "healthy",
    provider: result.provider,
    channelType: result.channelType,
    receiverValue: result.receiverValue,
    httpStatus: result.httpStatus,
    responsePreview: truncateText(result.responseText, 180)
  };
}

async function sendNotification(connection, notification, options = null) {
  const normalizedOptions = normalizeNotificationOptions(options);
  const channelConfig = await getNotificationConfig({
    connection,
    authContext: normalizedOptions.authContext,
    tenantId: normalizedOptions.tenantId
  });
  const normalized = {
    channelType: String(notification.channelType || "webhook").trim(),
    receiverType: String(notification.receiverType || "manual").trim(),
    receiverValue: String(notification.receiverValue || "").trim(),
    contentSummary: String(notification.contentSummary || "").trim(),
    alertNo: String(notification.alertNo || "").trim(),
    alertTitle: String(notification.alertTitle || "").trim(),
    isTest: Boolean(notification.isTest)
  };

  if (!normalized.contentSummary) {
    throw new Error("通知内容不能为空");
  }

  if (["wechat", "wecom"].includes(normalized.channelType) && channelConfig.wecomWebhookUrl) {
    return postToWecom(channelConfig, normalized);
  }
  if (normalized.channelType === "dingtalk" && channelConfig.dingtalkWebhookUrl) {
    return postToDingtalk(channelConfig, normalized);
  }
  if (normalized.channelType === "sms" && channelConfig.smsWebhookUrl) {
    return postToGenericWebhook(channelConfig.smsWebhookUrl, "sms", channelConfig, normalized);
  }
  if (normalized.channelType === "email" && channelConfig.emailWebhookUrl) {
    return postToGenericWebhook(channelConfig.emailWebhookUrl, "email", channelConfig, normalized);
  }
  if (channelConfig.defaultWebhookUrl) {
    return postToGenericWebhook(channelConfig.defaultWebhookUrl, normalized.channelType, channelConfig, normalized);
  }
  if (normalized.channelType === "dingtalk" && channelConfig.dingtalkWebhookUrl) {
    return postToDingtalk(channelConfig, normalized);
  }
  if (normalized.channelType === "in_app") {
    return {
      provider: "in_app",
      channelType: normalized.channelType,
      receiverValue: normalized.receiverValue,
      httpStatus: 200,
      responseText: "站内通知无需外部发送"
    };
  }

  throw new Error(`通知通道 ${normalized.channelType} 未配置可用的真实发送地址`);
}

async function postToWecom(channelConfig, notification) {
  const payload = {
    msgtype: "text",
    text: {
      content: buildTextMessage(channelConfig.senderName, notification)
    }
  };
  const result = await postJson(channelConfig.wecomWebhookUrl, payload, channelConfig.timeoutMs);
  const parsed = tryParseJson(result.responseText);
  if (parsed && Number(parsed.errcode || 0) !== 0) {
    throw new Error(`企业微信通知发送失败: ${truncateText(result.responseText, 180)}`);
  }
  return {
    provider: "wecom_robot",
    channelType: notification.channelType,
    receiverValue: notification.receiverValue,
    httpStatus: result.httpStatus,
    responseText: result.responseText
  };
}

async function postToDingtalk(channelConfig, notification) {
  const payload = {
    msgtype: "text",
    text: {
      content: buildTextMessage(channelConfig.senderName, notification)
    }
  };
  const result = await postJson(channelConfig.dingtalkWebhookUrl, payload, channelConfig.timeoutMs);
  const parsed = tryParseJson(result.responseText);
  if (parsed && Number(parsed.errcode || 0) !== 0) {
    throw new Error(`钉钉通知发送失败: ${truncateText(result.responseText, 180)}`);
  }
  return {
    provider: "dingtalk_robot",
    channelType: notification.channelType,
    receiverValue: notification.receiverValue,
    httpStatus: result.httpStatus,
    responseText: result.responseText
  };
}

async function postToGenericWebhook(url, provider, channelConfig, notification) {
  const payload = {
    provider,
    senderName: channelConfig.senderName,
    channelType: notification.channelType,
    receiverType: notification.receiverType,
    receiverValue: notification.receiverValue,
    contentSummary: notification.contentSummary,
    alertNo: notification.alertNo,
    alertTitle: notification.alertTitle,
    isTest: notification.isTest,
    sentAt: new Date().toISOString()
  };

  const result = await postJson(url, payload, channelConfig.timeoutMs);
  return {
    provider,
    channelType: notification.channelType,
    receiverValue: notification.receiverValue,
    httpStatus: result.httpStatus,
    responseText: result.responseText
  };
}

function buildTextMessage(senderName, notification) {
  return [
    `【${senderName}】${notification.alertTitle || "通知消息"}`,
    notification.alertNo ? `编号：${notification.alertNo}` : "",
    notification.receiverValue ? `接收对象：${notification.receiverValue}` : "",
    `内容：${notification.contentSummary}`,
    notification.isTest ? "说明：这是一条联调测试消息" : ""
  ]
    .filter(Boolean)
    .join("\n");
}

async function postJson(url, payload, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${truncateText(responseText, 180)}`);
    }
    return {
      httpStatus: response.status,
      responseText
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`通知通道调用超时，超过 ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function truncateText(value, maxLength) {
  const normalized = String(value || "").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

module.exports = {
  getNotificationConfig,
  sendNotification,
  testNotificationChannel
};
