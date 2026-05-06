<template>
  <div class="stack">
    <section class="panel mobile-settings-hero">
      <div class="panel-header">
        <div>
          <h2>现场设置</h2>
          <p class="panel-subtitle">手机端只保留运行摘要、联调测试和跳转入口，不搬完整桌面长表单。</p>
        </div>
        <div class="inline-actions">
          <button class="ghost-button" type="button" @click="router.push('/mobile/me')">回我的</button>
          <button v-if="canEdit" class="primary-button" type="button" @click="router.push('/system/settings')">
            桌面完整配置
          </button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <div v-if="canEdit" class="mobile-me-summary-grid mobile-settings-summary-grid">
        <article class="detail-card">
          <span class="detail-label">可视分组</span>
          <strong>{{ settingsSections.length }}</strong>
          <small>登录、控制、AI、通知、媒体、天气</small>
        </article>
        <article class="detail-card">
          <span class="detail-label">配置状态</span>
          <strong>{{ loading ? "加载中" : "已同步" }}</strong>
          <small>手机端显示摘要，复杂修改仍建议桌面端处理</small>
        </article>
        <article class="detail-card">
          <span class="detail-label">最近联调</span>
          <strong>{{ lastTestLabel }}</strong>
          <small>{{ lastTestStatus }}</small>
        </article>
      </div>

      <div v-if="!canEdit" class="detail-card">
        <div class="detail-label">当前账号没有系统配置权限</div>
        <div class="detail-value">手机端只保留查看和快捷入口，完整系统设置仍需要平台管理员在桌面端处理。</div>
      </div>
    </section>

    <section v-if="canEdit" class="panel">
      <div class="panel-header">
        <div>
          <h2>联调测试</h2>
          <p class="panel-subtitle">把手机端最常用的三项联调直接保留下来，避免进入桌面长页。</p>
        </div>
      </div>

      <div class="mobile-settings-test-grid">
        <button type="button" class="mobile-me-action-card" @click="runTest('notification')" :disabled="testingTarget === 'notification'">
          <strong>{{ testingTarget === 'notification' ? "测试中..." : "测试通知" }}</strong>
          <span>检查企业微信、钉钉或通用 webhook 是否可用</span>
        </button>
        <button type="button" class="mobile-me-action-card" @click="runTest('ai-service')" :disabled="testingTarget === 'ai-service'">
          <strong>{{ testingTarget === 'ai-service' ? "测试中..." : "测试 AI 服务" }}</strong>
          <span>验证远程模型或本地摘要服务当前是否可用</span>
        </button>
        <button type="button" class="mobile-me-action-card" @click="runTest('device-connection')" :disabled="testingTarget === 'device-connection'">
          <strong>{{ testingTarget === 'device-connection' ? "测试中..." : "测试设备连接" }}</strong>
          <span>快速检查设备接入链路和当前网关连通性</span>
        </button>
      </div>

      <div v-if="testResult" class="detail-card mobile-settings-test-result">
        <div class="detail-label">最近一次联调结果</div>
        <div class="detail-value">{{ lastTestLabel }} / {{ lastTestStatus }}</div>
        <details class="config-disclosure settings-test-disclosure">
          <summary class="config-disclosure-summary">查看原始返回</summary>
          <pre class="json-block">{{ formatJson(testResult) }}</pre>
        </details>
      </div>
    </section>

    <section v-if="canEdit" class="panel">
      <div class="panel-header">
        <div>
          <h2>运行摘要</h2>
          <p class="panel-subtitle">手机端先看关键参数是否在合理状态，真正修改仍跳桌面完整配置。</p>
        </div>
        <button class="ghost-button" type="button" @click="loadConfigs" :disabled="loading">
          {{ loading ? "刷新中..." : "刷新摘要" }}
        </button>
      </div>

      <div class="mobile-settings-section-stack">
        <article
          v-for="section in settingsSections"
          :key="section.code"
          class="detail-card mobile-settings-section-card"
        >
          <div class="mobile-settings-section-head">
            <div>
              <div class="detail-label">{{ section.title }}</div>
              <div class="detail-value">{{ section.description }}</div>
            </div>
            <span class="tag tag-p2">{{ section.items.length }} 项</span>
          </div>

          <div class="mobile-settings-item-list">
            <div
              v-for="item in section.items"
              :key="`${section.code}-${item.key}`"
              class="mobile-settings-item"
            >
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>下一步</h2>
          <p class="panel-subtitle">手机端保留高频动作，复杂配置统一回桌面端。</p>
        </div>
      </div>

      <div class="mobile-me-actions-grid">
        <button type="button" class="mobile-me-action-card" @click="router.push('/dashboard/overview')">
          <strong>回工作台</strong>
          <span>继续从区域上下文进入实时、告警和图片巡检链</span>
        </button>
        <button type="button" class="mobile-me-action-card" @click="router.push('/system/settings')">
          <strong>打开桌面完整配置</strong>
          <span>需要改详细参数时，直接跳到桌面系统设置页</span>
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { apiRequest } from "../lib/api";
import { formatJson } from "../lib/format";
import { hasPermission } from "../lib/session";

interface ConfigRow {
  configGroup: string;
  configKey: string;
  configValueJson: unknown;
}

interface SettingsItemDefinition {
  key: string;
  label: string;
  formatter?: (value: unknown) => string;
}

interface SettingsSectionDefinition {
  code: string;
  title: string;
  description: string;
  items: SettingsItemDefinition[];
}

interface TestResultPayload {
  target?: string;
  status?: string;
  [key: string]: unknown;
}

const router = useRouter();
const canEdit = hasPermission("system:config");
const loading = ref(false);
const message = ref("");
const errorMessage = ref("");
const testingTarget = ref("");
const configRows = ref<ConfigRow[]>([]);
const testResult = ref<TestResultPayload | null>(null);

const SETTINGS_SECTIONS: SettingsSectionDefinition[] = [
  {
    code: "login_security",
    title: "登录安全",
    description: "快速看登录限流和账号锁定是否启用。",
    items: [
      { key: "rate_limit_enabled", label: "登录限流", formatter: formatBooleanState },
      { key: "rate_limit_login_max", label: "窗口最大尝试次数", formatter: formatCount },
      { key: "login_lock_enabled", label: "失败锁定", formatter: formatBooleanState },
      { key: "login_lock_minutes", label: "锁定时长", formatter: formatMinutes }
    ]
  },
  {
    code: "control_safety",
    title: "控制安全",
    description: "手机端先确认是否允许强制控制、最大运行时长等高风险参数。",
    items: [
      { key: "allow_force_control", label: "允许强制控制", formatter: formatBooleanState },
      { key: "max_run_seconds", label: "单次最大运行", formatter: formatSeconds },
      { key: "backfill_control_policy", label: "补传期间控制策略" }
    ]
  },
  {
    code: "ai_provider",
    title: "AI 服务",
    description: "确认模型服务是否启用、模型名和请求超时。",
    items: [
      { key: "enabled", label: "启用远程模型", formatter: formatBooleanState },
      { key: "provider_type", label: "服务类型" },
      { key: "model", label: "模型名称", formatter: formatTextFallback },
      { key: "timeout_ms", label: "超时", formatter: formatMilliseconds }
    ]
  },
  {
    code: "notification_channel",
    title: "通知通道",
    description: "只看当前默认通道和 webhook 是否已登记。",
    items: [
      { key: "default_test_channel", label: "默认测试通道" },
      { key: "test_receiver", label: "测试接收对象", formatter: formatTextFallback },
      { key: "webhook_url", label: "通用 Webhook", formatter: formatUrlPresence }
    ]
  },
  {
    code: "media_storage",
    title: "媒体存储",
    description: "确认当前图片走本地还是对象存储，以及公开访问前缀。",
    items: [
      { key: "storage_provider", label: "存储提供方" },
      { key: "public_base_url", label: "公网访问前缀", formatter: formatTextFallback },
      { key: "local_root_path", label: "本地根目录", formatter: formatTextFallback }
    ]
  },
  {
    code: "weather_provider",
    title: "天气服务",
    description: "确认天气卡是否启用、缓存时长和服务提供方。",
    items: [
      { key: "enabled", label: "启用天气服务", formatter: formatBooleanState },
      { key: "provider_type", label: "服务提供方" },
      { key: "current_cache_ttl_seconds", label: "实时天气缓存", formatter: formatSeconds }
    ]
  }
];

const settingsMap = computed(() => {
  const result = new Map<string, unknown>();
  configRows.value.forEach((row) => {
    result.set(`${row.configGroup}.${row.configKey}`, row.configValueJson);
  });
  return result;
});

const settingsSections = computed(() =>
  SETTINGS_SECTIONS.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      const rawValue = settingsMap.value.get(`${section.code}.${item.key}`);
      return {
        ...item,
        value: item.formatter ? item.formatter(rawValue) : formatValue(rawValue)
      };
    })
  }))
);

const lastTestLabel = computed(() => testResult.value?.target || "尚未执行");
const lastTestStatus = computed(() => testResult.value?.status || "未执行联调");

function formatBooleanState(value: unknown): string {
  return value ? "已启用" : "未启用";
}

function formatSeconds(value: unknown): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "未设置";
  }
  if (seconds >= 60) {
    return `${Math.round(seconds / 60)} 分钟`;
  }
  return `${seconds} 秒`;
}

function formatMilliseconds(value: unknown): string {
  const milliseconds = Number(value);
  return Number.isFinite(milliseconds) && milliseconds > 0 ? `${milliseconds} ms` : "未设置";
}

function formatMinutes(value: unknown): string {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes > 0 ? `${minutes} 分钟` : "未设置";
}

function formatCount(value: unknown): string {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? `${count} 次` : "未设置";
}

function formatTextFallback(value: unknown): string {
  return String(value || "未设置");
}

function formatUrlPresence(value: unknown): string {
  return value ? "已登记" : "未登记";
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join("、") || "未设置";
  }
  if (typeof value === "boolean") {
    return formatBooleanState(value);
  }
  if (value === undefined || value === null || value === "") {
    return "未设置";
  }
  return String(value);
}

async function loadConfigs() {
  if (!canEdit) {
    return;
  }

  loading.value = true;
  message.value = "";
  errorMessage.value = "";
  try {
    configRows.value = await apiRequest<ConfigRow[]>("/api/v1/system/configs");
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "加载系统设置失败";
  } finally {
    loading.value = false;
  }
}

async function runTest(target: string) {
  if (!canEdit) {
    return;
  }

  testingTarget.value = target;
  message.value = "";
  errorMessage.value = "";
  try {
    testResult.value = await apiRequest<TestResultPayload>(`/api/v1/system/test/${target}`, {
      method: "POST",
      body: JSON.stringify({})
    });
    message.value = "联调测试已完成";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "联调测试失败";
  } finally {
    testingTarget.value = "";
  }
}

onMounted(() => {
  if (canEdit) {
    loadConfigs();
  }
});
</script>
