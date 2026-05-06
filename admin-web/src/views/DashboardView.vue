<template>
  <div class="stack">
    <section class="panel mobile-only mobile-field-panel">
      <div class="mobile-field-panel-head">
        <div>
          <div class="mobile-field-kicker">现场模式</div>
          <h2>工作台</h2>
          <p class="panel-subtitle">{{ selectedArea?.areaName || "请选择区域" }} · {{ weatherStatusLabel }}</p>
        </div>
        <label class="dashboard-area-filter mobile-field-area-filter">
          <span>当前区域</span>
          <select v-model="selectedAreaId" @change="handleAreaChange">
            <option v-for="item in areaOptions" :key="item.id" :value="String(item.id)">
              {{ item.areaName }}
            </option>
          </select>
        </label>
      </div>

      <div class="mobile-field-stat-grid">
        <article v-for="card in primaryCards.slice(0, 4)" :key="card.code" class="mobile-field-stat-card">
          <span class="mobile-field-stat-label">{{ card.title }}</span>
          <strong class="mobile-field-stat-value">{{ summary[card.code] ?? 0 }}</strong>
          <small>{{ card.desc }}</small>
        </article>
      </div>

      <div class="mobile-field-weather-card">
        <strong>{{ weatherHeadline }}</strong>
        <span>{{ weatherHumidityText || weatherWindText || weatherCardSummary }}</span>
        <RouterLink v-if="showWeatherConfigLink" :to="areaWeatherRoute" class="mobile-field-weather-action">配置天气</RouterLink>
      </div>

      <div class="mobile-field-decision-card" :class="`mobile-field-decision-${cropDecisionOverview.tone}`">
        <div class="mobile-field-decision-head">
          <div>
            <span>种植建议</span>
            <strong>{{ cropDecisionOverview.title }}</strong>
          </div>
          <span class="tag" :class="cropDecisionOverview.tagClass">{{ cropDecisionOverview.label }}</span>
        </div>
        <p>{{ cropDecisionOverview.summary }}</p>
        <RouterLink :to="cropKnowledgeRoute" class="mobile-field-shortcut mobile-field-shortcut-strong">查看作物建议</RouterLink>
      </div>

      <div class="mobile-field-shortcuts">
        <RouterLink :to="realtimeRoute" class="mobile-field-shortcut">实时监控</RouterLink>
        <RouterLink :to="alertsRoute" class="mobile-field-shortcut">告警中心</RouterLink>
        <RouterLink :to="manualControlRoute" class="mobile-field-shortcut">手动控制</RouterLink>
        <RouterLink :to="historyRoute" class="mobile-field-shortcut mobile-field-shortcut-strong">最近数据</RouterLink>
      </div>
    </section>

    <section class="panel dashboard-focus-panel">
      <div class="panel-header">
        <div>
          <h2>总览大屏</h2>
          <p class="panel-subtitle">按当前账号职责聚焦最关键的运行信号和下一步动作。</p>
        </div>
        <div class="inline-actions">
          <label class="dashboard-area-filter">
            <span>当前区域</span>
            <select v-model="selectedAreaId" @change="handleAreaChange">
              <option v-for="item in areaOptions" :key="item.id" :value="String(item.id)">
                {{ item.areaName }}
              </option>
            </select>
          </label>
          <span class="tag tag-p1">{{ dashboardProfile.label }}</span>
        </div>
      </div>

      <div class="dashboard-focus-grid">
        <div class="dashboard-focus-card">
          <small>当前工作视角</small>
          <strong>{{ dashboardProfile.headline }}</strong>
          <p>{{ dashboardProfile.summary }}</p>
        </div>
        <div class="dashboard-focus-card">
          <small>建议入口</small>
          <div class="dashboard-action-list">
            <RouterLink
              v-for="action in dashboardProfile.actions"
              :key="action.path"
              :to="buildAreaRoute(action.path)"
              class="dashboard-action-link"
            >
              <strong>{{ action.title }}</strong>
              <span>{{ action.desc }}</span>
            </RouterLink>
          </div>
        </div>
        <div :key="`weather-${selectedAreaId || 'none'}-${weatherContext.status || 'idle'}`" class="dashboard-focus-card dashboard-weather-card">
          <small>{{ weatherCardTitle }}</small>
          <strong>{{ weatherHeadline }}</strong>
          <p>{{ weatherCardSummary }}</p>
          <div class="dashboard-weather-meta">
            <span>当前区域：{{ selectedArea?.areaName || "未选择" }}</span>
            <span>状态：{{ weatherStatusLabel }}</span>
            <span v-if="weatherObservationText">{{ weatherObservationText }}</span>
            <span v-if="weatherBrowserCacheText">{{ weatherBrowserCacheText }}</span>
            <span v-if="weatherHumidityText">{{ weatherHumidityText }}</span>
            <span v-if="weatherWindText">{{ weatherWindText }}</span>
            <span v-if="hasWeatherCoordinates">
              {{ weatherLocation.latitude }}, {{ weatherLocation.longitude }}
            </span>
            <span v-else>经纬度未配置</span>
          </div>
          <div v-if="showWeatherConfigLink" class="dashboard-workspace-actions dashboard-weather-actions">
            <RouterLink :to="areaWeatherRoute" class="dashboard-mini-link dashboard-mini-link-strong">配置天气定位</RouterLink>
          </div>
        </div>
        <div class="dashboard-focus-card dashboard-crop-decision-card" :class="`dashboard-crop-decision-${cropDecisionOverview.tone}`">
          <small>种植决策</small>
          <strong>{{ cropDecisionOverview.title }}</strong>
          <p>{{ cropDecisionOverview.summary }}</p>
          <div class="dashboard-crop-decision-meta">
            <span class="tag" :class="cropDecisionOverview.tagClass">{{ cropDecisionOverview.label }}</span>
            <span>{{ cropDecisionOverview.cropText }}</span>
            <span>{{ cropDecisionOverview.metricText }}</span>
          </div>
          <div class="dashboard-workspace-actions dashboard-crop-decision-actions">
            <RouterLink :to="cropKnowledgeRoute" class="dashboard-mini-link dashboard-mini-link-strong">查看建议报告</RouterLink>
            <RouterLink :to="historyRoute" class="dashboard-mini-link">查看最近数据</RouterLink>
          </div>
        </div>
      </div>

      <div class="stats-grid dashboard-primary-stats">
        <div v-for="card in primaryCards" :key="card.code" class="stat-card">
          <div class="stat-title">{{ card.title }}</div>
          <div class="stat-value">{{ summary[card.code] ?? 0 }}</div>
          <div class="stat-desc">{{ card.desc }}</div>
        </div>
      </div>

      <div v-if="secondaryCards.length > 0" class="metric-strip dashboard-secondary-stats">
        <div v-for="card in secondaryCards" :key="card.code" class="metric-card">
          <small>{{ card.title }}</small>
          <strong>{{ summary[card.code] ?? 0 }}</strong>
          <div class="stat-desc">{{ card.desc }}</div>
        </div>
      </div>
    </section>

    <section class="panel dashboard-workspace-panel">
      <div class="panel-header">
        <div>
          <h2>现场工作台</h2>
          <p class="panel-subtitle">把当前区域最常用的实时、告警、控制和历史入口放到一屏里。</p>
        </div>
        <span class="tag tag-p1">{{ selectedArea?.areaName || "未选择区域" }}</span>
      </div>

      <div class="dashboard-workspace-grid">
        <article class="detail-card dashboard-workspace-card">
          <div class="detail-label">当前区域信号</div>
          <div class="dashboard-workspace-value">{{ selectedArea?.areaName || "请选择区域" }}</div>
          <div class="dashboard-workspace-copy">
            <span>在线网关 {{ summary.onlineGatewayCount ?? 0 }}</span>
            <span>离线网关 {{ summary.offlineGatewayCount ?? 0 }}</span>
            <span>未处理告警 {{ summary.pendingAlertCount ?? 0 }}</span>
          </div>
        </article>

        <article class="detail-card dashboard-workspace-card">
          <div class="detail-label">实时与历史</div>
          <div class="dashboard-workspace-copy">
            <span>现场先看实时状态，再回看最近数据确认波动来源。</span>
          </div>
          <div class="dashboard-workspace-actions">
            <RouterLink :to="realtimeRoute" class="dashboard-mini-link">实时监控</RouterLink>
            <RouterLink :to="historyRoute" class="dashboard-mini-link">最近数据</RouterLink>
            <RouterLink :to="alertsRoute" class="dashboard-mini-link">告警中心</RouterLink>
          </div>
        </article>

        <article class="detail-card dashboard-workspace-card">
          <div class="detail-label">控制与告警</div>
          <div class="dashboard-workspace-copy">
            <span>适合现场人员快速看异常、执行人工控制和回看最近动作。</span>
          </div>
          <div class="dashboard-workspace-actions">
            <RouterLink :to="alertsRoute" class="dashboard-mini-link">告警中心</RouterLink>
            <RouterLink :to="manualControlRoute" class="dashboard-mini-link">手动控制</RouterLink>
            <RouterLink :to="historyRoute" class="dashboard-mini-link">最近数据</RouterLink>
          </div>
        </article>

        <article class="detail-card dashboard-workspace-card">
          <div class="detail-label">常用入口</div>
          <div class="dashboard-workspace-actions">
            <RouterLink
              v-for="action in workspaceActions"
              :key="action.path"
              :to="buildAreaRoute(action.path)"
              class="dashboard-mini-link dashboard-mini-link-strong"
            >
              {{ action.title }}
            </RouterLink>
          </div>
        </article>

        <article class="detail-card dashboard-workspace-card">
          <div class="detail-label">现场值守回路</div>
          <div class="dashboard-workspace-copy">
            <span>按同一批区域筛选串起实时、告警、控制和历史数据，减少回菜单反复切换。</span>
          </div>
          <div class="dashboard-workspace-actions">
            <RouterLink :to="realtimeRoute" class="dashboard-mini-link">1. 实时监控</RouterLink>
            <RouterLink :to="alertsRoute" class="dashboard-mini-link">2. 告警中心</RouterLink>
            <RouterLink :to="manualControlRoute" class="dashboard-mini-link">3. 手动控制</RouterLink>
            <RouterLink :to="historyRoute" class="dashboard-mini-link dashboard-mini-link-strong">4. 最近数据</RouterLink>
          </div>
        </article>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>{{ currentPreset.label }}趋势</h2>
          <p class="panel-subtitle">{{ dashboardProfile.trendHint }}</p>
        </div>
        <div class="inline-actions">
          <div class="chip-list">
            <button
              v-for="item in TREND_PRESETS"
              :key="item.value"
              type="button"
              class="chip chip-button"
              :class="{ 'chip-button-active': trendPreset === item.value }"
              @click="changeTrendPreset(item.value)"
            >
              {{ item.label }}
            </button>
          </div>
        </div>
      </div>
      <MultiMetricTrendBoard
        :columns="trendColumns"
        :rows="trends"
        :granularity="trendGranularity"
        :range-label="currentPreset.label"
      />
      <div v-if="loading" class="muted-text">正在加载总览数据...</div>
      <div v-if="errorMessage" class="error-text">{{ errorMessage }}</div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { apiRequest, buildQuery } from "../lib/api";
import MultiMetricTrendBoard from "../components/MultiMetricTrendBoard.vue";
import { formatDateTime, formatNumber } from "../lib/format";
import { useSessionStore } from "../stores/session";

const DASHBOARD_AREA_STORAGE_KEY = "agri_admin_dashboard_area_id";
const DASHBOARD_WEATHER_CACHE_KEY_PREFIX = "agri_admin_dashboard_weather_context";
const DASHBOARD_WEATHER_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const loading = ref(false);
const errorMessage = ref("");
const summary = ref({});
const trends = ref([]);
const trendColumns = ref([]);
const weatherContext = ref({});
const weatherRefreshing = ref(false);
const cropRecommendation = ref(null);
const cropRecommendationError = ref("");
const areaOptions = ref([]);
const trendPreset = ref("24h");
const trendGranularity = ref("hour");
const selectedAreaId = ref("");
const sessionStore = useSessionStore();
const { session } = storeToRefs(sessionStore);
const route = useRoute();
const router = useRouter();

const TREND_PRESETS = [
  { value: "3h", label: "最近 3 小时" },
  { value: "6h", label: "最近 6 小时" },
  { value: "12h", label: "最近 12 小时" },
  { value: "24h", label: "最近 24 小时" },
  { value: "3d", label: "最近 3 天" },
  { value: "7d", label: "最近 7 天" }
];

const SUMMARY_CARD_CATALOG = {
  onlineGatewayCount: { code: "onlineGatewayCount", title: "在线网关数", desc: "网关在线状态汇总" },
  offlineGatewayCount: { code: "offlineGatewayCount", title: "离线网关数", desc: "需重点关注的离线设备" },
  sensorCount: { code: "sensorCount", title: "传感器总数", desc: "当前纳管传感器数量" },
  actuatorCount: { code: "actuatorCount", title: "执行器总数", desc: "当前纳管执行器数量" },
  pendingAlertCount: { code: "pendingAlertCount", title: "未处理告警数", desc: "待确认或处理中告警" },
  todayControlCount: { code: "todayControlCount", title: "今日控制次数", desc: "当天控制指令总数" },
  todayAutoControlCount: { code: "todayAutoControlCount", title: "今日自动控制", desc: "自动策略触发控制次数" },
  todayBackfillBatchCount: { code: "todayBackfillBatchCount", title: "今日补传批次", desc: "离线缓存补传次数" }
};

const DASHBOARD_PROFILES = {
  platform: {
    label: "平台治理视角",
    headline: "先看平台风险面，再进入租户与配置治理。",
    summary: "适合平台管理员和系统治理角色，先看全局风险、补传和平台配置，再做租户与权限调整。",
    primaryCardCodes: ["pendingAlertCount", "offlineGatewayCount", "todayBackfillBatchCount", "todayControlCount"],
    secondaryCardCodes: ["onlineGatewayCount", "sensorCount", "actuatorCount"],
    actions: [
      { title: "租户管理", path: "/system/tenants", desc: "处理租户状态、初始化和运行配置" },
      { title: "用户管理", path: "/system/users", desc: "排查账号、角色和锁定状态" },
      { title: "系统设置", path: "/system/settings", desc: "统一检查时区、安全和媒体配置" }
    ],
    trendHint: "更适合观察告警和补传影响下的整体运行趋势。"
  },
  operations: {
    label: "运行监控视角",
    headline: "先判断站点是否稳定，再下钻实时与历史波动。",
    summary: "适合监控和运营值守角色，优先关注在线率、异常告警和趋势变化，再决定是否需要人工干预。",
    primaryCardCodes: ["onlineGatewayCount", "offlineGatewayCount", "pendingAlertCount", "sensorCount"],
    secondaryCardCodes: ["todayBackfillBatchCount", "todayControlCount", "actuatorCount"],
    actions: [
      { title: "实时监控", path: "/monitor/realtime", desc: "查看当前采集值、时间可信度和阈值状态" },
      { title: "历史分析", path: "/monitor/history", desc: "定位波动、补传和低可信数据来源" },
      { title: "告警中心", path: "/alerts/center", desc: "处理待确认和处理中告警" }
    ],
    trendHint: "更适合查看近 24 小时内的实时波动和告警前后变化。"
  },
  field: {
    label: "现场控制视角",
    headline: "先判断设备在线和控制负载，再进入现场执行。",
    summary: "适合设备和执行器运维角色，先看在线网关、控制频次和补传情况，再进入设备或手动控制页。",
    primaryCardCodes: ["onlineGatewayCount", "offlineGatewayCount", "todayControlCount", "todayAutoControlCount"],
    secondaryCardCodes: ["actuatorCount", "sensorCount", "todayBackfillBatchCount"],
    actions: [
      { title: "网关设备管理", path: "/devices/gateways", desc: "检查心跳、固件、补传和参数下发状态" },
      { title: "手动控制", path: "/controls/manual", desc: "快速执行人工控制和紧急停止" },
      { title: "执行器管理", path: "/devices/actuators", desc: "核对期望状态、实际状态和 Shadow 偏差" }
    ],
    trendHint: "更适合结合控制记录看湿度、温度与设备动作的连动趋势。"
  },
  intelligence: {
    label: "智能分析视角",
    headline: "先判断异常密度，再进入规则、告警和 AI 分析闭环。",
    summary: "适合规则、告警和 AI 运营角色，优先看告警积压和自动控制影响，再进入规则、报告和诊断页面。",
    primaryCardCodes: ["pendingAlertCount", "todayAutoControlCount", "todayControlCount", "todayBackfillBatchCount"],
    secondaryCardCodes: ["offlineGatewayCount", "sensorCount", "onlineGatewayCount"],
    actions: [
      { title: "规则引擎", path: "/rules/engine", desc: "优化阈值、恢复策略和联动动作" },
      { title: "AI诊断", path: "/ai/diagnosis", desc: "查看当前异常的分析结论和建议动作" },
      { title: "AI日报/周报", path: "/ai/reports", desc: "输出日周报并汇总异常趋势" }
    ],
    trendHint: "更适合结合补传比例观察 AI 和规则判断的稳定性。"
  }
};

const currentPreset = computed(() => TREND_PRESETS.find((item) => item.value === trendPreset.value) || TREND_PRESETS[3]);
const dashboardProfile = computed(() => resolveDashboardProfile(session.value?.permissionCodes || []));
const primaryCards = computed(() => dashboardProfile.value.primaryCardCodes.map((code) => SUMMARY_CARD_CATALOG[code]).filter(Boolean));
const secondaryCards = computed(() => dashboardProfile.value.secondaryCardCodes.map((code) => SUMMARY_CARD_CATALOG[code]).filter(Boolean));
const workspaceActions = computed(() => {
  const base = [
	    ...dashboardProfile.value.actions,
	    { title: "实时监控", path: "/monitor/realtime" },
	    { title: "历史分析", path: "/monitor/history" },
	    { title: "告警中心", path: "/alerts/center" },
	    { title: "手动控制", path: "/controls/manual" }
	  ];
  const deduped = [];
  const seen = new Set();
  for (const item of base) {
    if (!item?.path || seen.has(item.path)) {
      continue;
    }
    seen.add(item.path);
    deduped.push(item);
  }
  return deduped.slice(0, 6);
});
const alertsRoute = computed(() => buildAreaRoute("/alerts/center"));
const realtimeRoute = computed(() => buildAreaRoute("/monitor/realtime"));
const historyRoute = computed(() => buildAreaRoute("/monitor/history"));
const manualControlRoute = computed(() => buildAreaRoute("/controls/manual"));
const cropKnowledgeRoute = computed(() => buildAreaRoute("/ai/crop-knowledge"));
const areaWeatherRoute = computed(() => buildAreaRoute("/devices/areas"));
const selectedArea = computed(() => areaOptions.value.find((item) => String(item.id) === selectedAreaId.value) || null);
const weatherArea = computed(() => weatherContext.value?.area || null);
const weatherLocation = computed(() => weatherContext.value?.location || weatherArea.value || null);
const weatherCurrent = computed(() => weatherContext.value?.current || null);
const hasWeatherCoordinates = computed(() => weatherLocation.value?.latitude != null && weatherLocation.value?.longitude != null);
const weatherCardTitle = computed(() => (weatherCurrent.value?.temperature != null ? "当前区域天气" : "区域天气"));
const weatherHeadline = computed(() => {
  if (weatherCurrent.value?.temperature != null) {
    const weatherLabel = weatherCurrent.value?.weatherLabel || "实时天气";
    return `${formatNumber(weatherCurrent.value.temperature, 1)}${weatherCurrent.value.temperatureUnit || "℃"} · ${weatherLabel}`;
  }
  return weatherArea.value?.weatherLocationName || weatherArea.value?.areaName || "未配置区域天气定位";
});
const weatherCardSummary = computed(() => {
  const summaryText = weatherContext.value?.summary;
  if (summaryText && weatherContext.value?.fromBrowserCache && weatherRefreshing.value) {
    return `${summaryText}（后台刷新中）`;
  }
  return summaryText || "正在准备区域天气上下文...";
});
const weatherObservationText = computed(() =>
  weatherCurrent.value?.observedAt ? `更新：${formatDateTime(weatherCurrent.value.observedAt)}` : ""
);
const weatherBrowserCacheText = computed(() =>
  weatherContext.value?.fromBrowserCache && weatherContext.value?.browserCachedAt
    ? `本地缓存：${formatDateTime(weatherContext.value.browserCachedAt)}`
    : ""
);
const weatherHumidityText = computed(() =>
  weatherCurrent.value?.relativeHumidity != null
    ? `湿度：${formatNumber(weatherCurrent.value.relativeHumidity, 0)}${weatherCurrent.value.humidityUnit || "%"}`
    : ""
);
const weatherWindText = computed(() =>
  weatherCurrent.value?.windSpeed != null
    ? `风速：${formatNumber(weatherCurrent.value.windSpeed, 1)} ${weatherCurrent.value.windSpeedUnit || "km/h"}`
    : ""
);
const weatherStatusLabel = computed(() => {
  const status = weatherContext.value?.status;
  if (weatherContext.value?.fromBrowserCache && weatherRefreshing.value) {
    return "缓存刷新中";
  }
  if (weatherContext.value?.fromBrowserCache) {
    return "本地缓存";
  }
  if (status === "live") {
    return "实时";
  }
  if (status === "stale") {
    return "缓存";
  }
  if (status === "provider_error") {
    return "异常";
  }
  if (status === "location_unresolved") {
    return "待定位";
  }
  if (status === "disabled") {
    return "已关闭";
  }
  if (status === "not_configured") {
    return "待配置";
  }
  if (status === "no_area") {
    return "无区域";
  }
  return "占位中";
});
const showWeatherConfigLink = computed(() => Boolean(selectedAreaId.value) && !["live", "stale"].includes(String(weatherContext.value?.status || "")));
const cropDecisionOverview = computed(() => buildCropDecisionOverview());

async function loadDashboard() {
  loading.value = true;
  errorMessage.value = "";
  weatherRefreshing.value = true;
  const areaId = selectedAreaId.value || undefined;
  applyCachedWeatherContext(areaId);
  try {
    const cropRecommendationRequest = areaId
      ? apiRequest(`/api/v1/crop-knowledge/recommendation${buildQuery({ areaId })}`).catch((error) => ({
          __error: error.message
        }))
      : Promise.resolve(null);
    const [summaryData, trendData, weatherData, cropRecommendationData] = await Promise.all([
      apiRequest(`/api/v1/dashboard/summary${buildQuery({ areaId })}`),
      apiRequest(`/api/v1/dashboard/trends${buildQuery({ preset: trendPreset.value, areaId })}`),
      apiRequest(`/api/v1/dashboard/weather-context${buildQuery({ areaId })}`),
      cropRecommendationRequest
    ]);
    if (String(areaId || "") !== String(selectedAreaId.value || "")) {
      return;
    }
    summary.value = summaryData;
    weatherContext.value = weatherData || {};
    weatherRefreshing.value = false;
    saveCachedWeatherContext(areaId, weatherData);
    applyCropRecommendation(cropRecommendationData);
    if (Array.isArray(trendData)) {
      trends.value = trendData.map((item) => ({
        bucketAt: item.bucketAt,
        backfillRatio: item.backfillRatio,
        metricsByCode: {
          humidity: item.avgHumidity,
          temperature: item.avgTemperature
        }
      }));
      trendColumns.value = [
        { metricCode: "humidity", metricName: "湿度", unitName: "%" },
        { metricCode: "temperature", metricName: "温度", unitName: "℃" }
      ];
      trendGranularity.value = "hour";
    } else {
      trends.value = trendData?.rows || [];
      trendColumns.value = trendData?.metricColumns || [];
      trendGranularity.value = trendData?.granularity || "hour";
    }
  } catch (error) {
    errorMessage.value = error.message;
    applyCropRecommendation(null);
  } finally {
    weatherRefreshing.value = false;
    loading.value = false;
  }
}

function changeTrendPreset(value) {
  if (trendPreset.value === value) {
    return;
  }
  trendPreset.value = value;
  loadDashboard();
}

function loadStoredAreaId() {
  try {
    return localStorage.getItem(DASHBOARD_AREA_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function buildAreaRoute(path, extraQuery = {}) {
  const query = { ...extraQuery };
  if (selectedAreaId.value) {
    query.areaId = String(selectedAreaId.value);
  }
  return { path, query };
}

function syncDashboardRoute() {
  const query = {};
  if (selectedAreaId.value) {
    query.areaId = String(selectedAreaId.value);
  }
  router.replace({ query }).catch(() => {});
}

function persistAreaId(value) {
  try {
    if (value) {
      localStorage.setItem(DASHBOARD_AREA_STORAGE_KEY, value);
      return;
    }
    localStorage.removeItem(DASHBOARD_AREA_STORAGE_KEY);
  } catch {
    // Ignore localStorage write failures.
  }
}

function buildWeatherCacheKey(areaId = selectedAreaId.value) {
  return `${DASHBOARD_WEATHER_CACHE_KEY_PREFIX}:${areaId || "global"}`;
}

function loadCachedWeatherContext(areaId = selectedAreaId.value) {
  try {
    const rawValue = localStorage.getItem(buildWeatherCacheKey(areaId));
    if (!rawValue) {
      return null;
    }
    const payload = JSON.parse(rawValue);
    const cachedAt = Number(payload?.cachedAt);
    if (!payload?.weather || !Number.isFinite(cachedAt)) {
      return null;
    }
    if (Date.now() - cachedAt > DASHBOARD_WEATHER_CACHE_MAX_AGE_MS) {
      localStorage.removeItem(buildWeatherCacheKey(areaId));
      return null;
    }
    return {
      ...payload.weather,
      fromBrowserCache: true,
      browserCachedAt: cachedAt
    };
  } catch {
    return null;
  }
}

function applyCachedWeatherContext(areaId = selectedAreaId.value) {
  const cachedWeather = loadCachedWeatherContext(areaId);
  if (cachedWeather) {
    weatherContext.value = cachedWeather;
    return true;
  }
  weatherContext.value = {};
  return false;
}

function saveCachedWeatherContext(areaId = selectedAreaId.value, weatherData) {
  const status = String(weatherData?.status || "");
  if (!weatherData || !["live", "stale"].includes(status)) {
    return;
  }
  try {
    localStorage.setItem(
      buildWeatherCacheKey(areaId),
      JSON.stringify({
        cachedAt: Date.now(),
        weather: {
          ...weatherData,
          fromBrowserCache: false,
          browserCachedAt: null
        }
      })
    );
  } catch {
    // Ignore browser storage failures.
  }
}

async function loadAreaOptions() {
  const rows = await apiRequest("/api/v1/areas?status=enabled");
  areaOptions.value = Array.isArray(rows) ? rows : [];

  const routeAreaId = firstQueryValue(route.query.areaId) || "";
  const storedAreaId = loadStoredAreaId();
  const hasRouteArea = areaOptions.value.some((item) => String(item.id) === routeAreaId);
  const hasStoredArea = areaOptions.value.some((item) => String(item.id) === storedAreaId);
  selectedAreaId.value = hasRouteArea
    ? routeAreaId
    : hasStoredArea
      ? storedAreaId
      : (areaOptions.value[0] ? String(areaOptions.value[0].id) : "");
  persistAreaId(selectedAreaId.value);
  syncDashboardRoute();
  applyCachedWeatherContext(selectedAreaId.value);
}

function handleAreaChange() {
  persistAreaId(selectedAreaId.value);
  syncDashboardRoute();
  applyCachedWeatherContext(selectedAreaId.value);
  loadDashboard();
}

function applyCropRecommendation(data) {
  if (!data) {
    cropRecommendation.value = null;
    cropRecommendationError.value = "";
    return;
  }
  if (data.__error) {
    cropRecommendation.value = null;
    cropRecommendationError.value = data.__error;
    return;
  }
  cropRecommendation.value = data;
  cropRecommendationError.value = "";
}

function buildCropDecisionOverview() {
  if (!selectedAreaId.value) {
    return {
      tone: "warning",
      label: "待选择",
      tagClass: "tag-warning",
      title: "请选择区域",
      summary: "选择区域后，首页会同步显示作物阶段、实时值和天气上下文形成的种植建议。",
      cropText: "未选择区域",
      metricText: "暂无推荐目标"
    };
  }

  if (cropRecommendationError.value) {
    return {
      tone: "danger",
      label: "异常",
      tagClass: "tag-danger",
      title: "建议加载失败",
      summary: cropRecommendationError.value,
      cropText: selectedArea.value?.areaName || "当前区域",
      metricText: "请稍后刷新"
    };
  }

  const recommendation = cropRecommendation.value;
  if (!recommendation) {
    return {
      tone: "warning",
      label: "加载中",
      tagClass: "tag-warning",
      title: "正在生成建议",
      summary: "系统正在读取作物知识库、实时指标和天气上下文。",
      cropText: selectedArea.value?.areaName || "当前区域",
      metricText: "等待数据"
    };
  }

  const metrics = Array.isArray(recommendation.metrics) ? recommendation.metrics : [];
  const issueMetrics = metrics.filter((item) => item.deviationStatus === "high" || item.deviationStatus === "low");
  const missingMetrics = metrics.filter((item) => item.deviationStatus === "missing");
  const realtimeMetricCount = metrics.filter((item) => item.currentValue !== null && item.currentValue !== undefined && item.currentValue !== "").length;
  const cropText = formatDashboardAreaCrop(recommendation.area || selectedArea.value);
  const metricText = metrics.length > 0 ? `${realtimeMetricCount}/${metrics.length} 项有实时值` : "暂无推荐目标";

  if (recommendation.status === "unconfigured") {
    return {
      tone: "warning",
      label: "待绑定",
      tagClass: "tag-warning",
      title: "区域未绑定作物",
      summary: "需要先在区域管理中绑定作物品类和生长阶段，首页才能生成种植建议。",
      cropText,
      metricText
    };
  }

  if (recommendation.status === "no_targets") {
    return {
      tone: "warning",
      label: "待配置",
      tagClass: "tag-warning",
      title: "缺少推荐目标",
      summary: "当前作物阶段还没有维护温湿度、土壤湿度或光照目标，建议先补齐知识库。",
      cropText,
      metricText
    };
  }

  if (issueMetrics.length > 0) {
    const primaryMetric = issueMetrics[0];
    return {
      tone: "danger",
      label: "需处理",
      tagClass: "tag-danger",
      title: `${issueMetrics.length} 项指标偏离`,
      summary: `${primaryMetric.metricName || primaryMetric.metricCode} ${primaryMetric.deviationText || "偏离推荐区间"}。建议进入报告查看灌溉、通风或遮阴动作。`,
      cropText,
      metricText
    };
  }

  if (missingMetrics.length > 0) {
    return {
      tone: "warning",
      label: "待补数",
      tagClass: "tag-warning",
      title: `${missingMetrics.length} 项缺少实时值`,
      summary: "当前建议可以查看，但缺少部分实时监测值，现场决策前建议先检查传感器上报。",
      cropText,
      metricText
    };
  }

  return {
    tone: "success",
    label: "平稳",
    tagClass: "tag-success",
    title: "当前种植状态平稳",
    summary: recommendation.summary || "作物目标、实时数据和天气上下文暂无明显冲突，维持当前管理策略。",
    cropText,
    metricText
  };
}

function formatDashboardAreaCrop(area) {
  if (!area) {
    return "未绑定作物";
  }
  return [area.cropSpeciesName, area.cropVarietyName].filter(Boolean).join(" / ") || area.cropType || "未绑定作物";
}

onMounted(() => {
  trendPreset.value = resolveDefaultPreset(session.value?.permissionCodes || []);
  loadAreaOptions()
    .then(() => loadDashboard())
    .catch((error) => {
      errorMessage.value = error.message;
    });
});

function resolveDashboardProfile(permissionCodes = []) {
  const granted = new Set(permissionCodes || []);
  const hasAny = (codes) => codes.some((code) => granted.has(code));

  if (hasAny(["tenant:manage", "user:manage", "role:manage", "permission:manage", "system:config", "audit:view"])) {
    return DASHBOARD_PROFILES.platform;
  }

  if (hasAny(["monitor:view", "history:view"])) {
    return DASHBOARD_PROFILES.operations;
  }

  if (hasAny(["device:view", "actuator:control", "control:view", "mode:switch"])) {
    return DASHBOARD_PROFILES.field;
  }

  if (hasAny(["alert:view", "rule:view", "ai:view"])) {
    return DASHBOARD_PROFILES.intelligence;
  }

  return DASHBOARD_PROFILES.operations;
}

function resolveDefaultPreset(permissionCodes = []) {
  const profile = resolveDashboardProfile(permissionCodes);
  if (profile === DASHBOARD_PROFILES.platform) {
    return "7d";
  }
  if (profile === DASHBOARD_PROFILES.intelligence) {
    return "3d";
  }
  if (profile === DASHBOARD_PROFILES.field) {
    return "12h";
  }
  return "24h";
}
</script>
