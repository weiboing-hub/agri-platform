const config = require("./config");
const { loadConfigGroup } = require("./system-config");

const DEFAULT_SYSTEM_PROMPT = [
  "你是智能农业环境监测平台的分析助手。",
  "请基于提供的结构化数据生成专业、简洁、可执行的中文分析。",
  "禁止编造不存在的数据。",
  "必须返回严格 JSON，不要输出 markdown 代码块。"
].join(" ");

function normalizeAiProviderOptions(options = null) {
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

function normalizeAiProviderConfig(rawConfig = {}) {
  const providerType = String(rawConfig.provider_type || config.aiProvider.providerType || "local_mock").trim();
  const enabled = Boolean(rawConfig.enabled ?? config.aiProvider.enabled);
  const baseUrl = String(rawConfig.base_url || config.aiProvider.baseUrl || "").trim().replace(/\/+$/, "");
  const apiKey = String(rawConfig.api_key || config.aiProvider.apiKey || "").trim();
  const model = String(rawConfig.model || config.aiProvider.model || "").trim();
  const timeoutMs = normalizeInteger(rawConfig.timeout_ms ?? config.aiProvider.timeoutMs, 10000);
  const temperature = normalizeNumber(rawConfig.temperature ?? config.aiProvider.temperature, 0.2);
  const maxTokens = normalizeInteger(rawConfig.max_tokens ?? config.aiProvider.maxTokens, 1200);
  const systemPrompt = String(rawConfig.system_prompt || config.aiProvider.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim();

  return {
    enabled,
    providerType,
    baseUrl,
    apiKey,
    model,
    timeoutMs,
    temperature,
    maxTokens,
    systemPrompt
  };
}

async function getAiProviderConfig(options = null) {
  const normalized = normalizeAiProviderOptions(options);
  const rawConfig = await loadConfigGroup("ai_provider", normalized);
  return normalizeAiProviderConfig(rawConfig);
}

async function testAiProvider(options = null) {
  const providerConfig = await getAiProviderConfig(options);
  if (!providerConfig.enabled || providerConfig.providerType === "local_mock") {
    return {
      target: "ai-service",
      status: "warning",
      mode: "local_mock",
      configured: false,
      message: "当前未启用远程 AI 模型服务，仍会使用本地规则摘要。"
    };
  }

  validateRemoteProviderConfig(providerConfig);
  const prompt = "请返回一段不超过18个字的中文短句，表达“AI连通测试成功”。";
  const result = await requestChatCompletion(providerConfig, [
    { role: "system", content: providerConfig.systemPrompt },
    { role: "user", content: prompt }
  ]);

  return {
    target: "ai-service",
    status: "healthy",
    configured: true,
    mode: providerConfig.providerType,
    model: providerConfig.model,
    baseUrl: providerConfig.baseUrl,
    latencyMs: result.latencyMs,
    preview: result.content.slice(0, 120)
  };
}

async function buildAiEnhancedReport(connection, input, options = null) {
  const normalized = normalizeAiProviderOptions(options);
  const providerConfig = await getAiProviderConfig({
    connection,
    authContext: normalized.authContext,
    tenantId: normalized.tenantId
  });
  if (!providerConfig.enabled || providerConfig.providerType === "local_mock") {
    return {
      mode: "local_mock",
      configured: false
    };
  }

  validateRemoteProviderConfig(providerConfig);

  const userPrompt = [
    "请根据以下智能农业监测数据，输出严格 JSON。",
    "",
    "输出格式：",
    "{",
    '  "summaryText": "100字以内摘要",',
    '  "contentMarkdown": "完整中文 Markdown 报告",',
    '  "riskLevel": "low|medium|high|critical",',
    '  "suggestedActions": ["建议1", "建议2", "建议3"]',
    "}",
    "",
    "要求：",
    "1. 使用简洁专业中文。",
    "2. 只能基于给定数据，不要编造现场情况。",
    "3. suggestedActions 最多 3 条。",
    "4. 如果判断不出更高风险，不要盲目提高 riskLevel。",
    "",
    `上下文数据：${JSON.stringify(input)}`
  ].join("\n");

  const result = await requestChatCompletion(providerConfig, [
    { role: "system", content: providerConfig.systemPrompt },
    { role: "user", content: userPrompt }
  ]);

  const parsed = parseLooseJson(result.content);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI 模型返回内容无法解析为 JSON");
  }

  return {
    mode: "remote",
    configured: true,
    model: providerConfig.model,
    baseUrl: providerConfig.baseUrl,
    latencyMs: result.latencyMs,
    summaryText: asOptionalString(parsed.summaryText),
    contentMarkdown: asOptionalString(parsed.contentMarkdown),
    riskLevel: normalizeRiskLevel(parsed.riskLevel),
    suggestedActions: normalizeStringArray(parsed.suggestedActions)
  };
}

async function requestChatCompletion(providerConfig, messages) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), providerConfig.timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(`${providerConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerConfig.apiKey}`
      },
      body: JSON.stringify({
        model: providerConfig.model,
        temperature: providerConfig.temperature,
        max_tokens: providerConfig.maxTokens,
        response_format: {
          type: "json_object"
        },
        messages
      }),
      signal: controller.signal
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`AI 服务调用失败: HTTP ${response.status} ${truncateText(responseText, 180)}`);
    }

    const payload = parseLooseJson(responseText);
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("AI 服务返回内容为空");
    }

    return {
      content,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`AI 服务调用超时，超过 ${providerConfig.timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function validateRemoteProviderConfig(providerConfig) {
  if (!providerConfig.baseUrl) {
    throw new Error("AI 服务 base_url 未配置");
  }
  if (!providerConfig.apiKey) {
    throw new Error("AI 服务 api_key 未配置");
  }
  if (!providerConfig.model) {
    throw new Error("AI 服务 model 未配置");
  }
}

function parseLooseJson(value) {
  if (!value) {
    return null;
  }
  if (typeof value === "object") {
    return value;
  }
  const trimmed = String(value).trim();
  const codeFenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = codeFenceMatch ? codeFenceMatch[1] : trimmed;
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function normalizeRiskLevel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["low", "medium", "high", "critical"].includes(normalized)) {
    return normalized;
  }
  return null;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => asOptionalString(item)).filter(Boolean).slice(0, 3);
}

function asOptionalString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeNumber(value, fallback) {
  const parsed = Number(value);
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
  getAiProviderConfig,
  testAiProvider,
  buildAiEnhancedReport
};
