<template>
  <div class="stack">
    <section class="panel mobile-only mobile-field-panel">
      <div class="mobile-field-panel-head">
        <div>
          <div class="mobile-field-kicker">现场模式</div>
          <h2>实时值守</h2>
          <p class="panel-subtitle">{{ realtimeFocusSummary }}</p>
        </div>
      </div>

      <div class="mobile-field-stat-grid">
        <article class="mobile-field-stat-card">
          <span class="mobile-field-stat-label">监测点</span>
          <strong class="mobile-field-stat-value">{{ items.length }}</strong>
          <small>{{ selectedAreaName }}</small>
        </article>
        <article class="mobile-field-stat-card">
          <span class="mobile-field-stat-label">补传</span>
          <strong class="mobile-field-stat-value">{{ backfillCount }}</strong>
          <small>当前补传来源</small>
        </article>
        <article class="mobile-field-stat-card">
          <span class="mobile-field-stat-label">低可信</span>
          <strong class="mobile-field-stat-value">{{ lowQualityCount }}</strong>
          <small>时间可信度待核查</small>
        </article>
        <article class="mobile-field-stat-card">
          <span class="mobile-field-stat-label">阈值异常</span>
          <strong class="mobile-field-stat-value">{{ abnormalThresholdCount }}</strong>
          <small>{{ selectedMetricName }}</small>
        </article>
      </div>

      <div class="mobile-field-shortcuts">
        <RouterLink :to="historyLink" class="mobile-field-shortcut">历史分析</RouterLink>
        <RouterLink :to="alertsLink" class="mobile-field-shortcut">告警中心</RouterLink>
        <RouterLink :to="dashboardLink" class="mobile-field-shortcut">返回工作台</RouterLink>
        <RouterLink :to="manualControlLink" class="mobile-field-shortcut mobile-field-shortcut-strong">手动控制</RouterLink>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2>实时监控</h2>
        <div class="inline-actions">
          <label class="switch-inline">
            <input v-model="autoRefresh" type="checkbox" />
            <span>自动刷新</span>
          </label>
          <button v-if="canWriteTestReading" class="ghost-button" @click="toggleTestPanel">
            {{ testPanelOpen ? "收起测试写入" : "测试写入" }}
          </button>
          <button class="ghost-button" @click="loadRealtime">手动刷新</button>
        </div>
      </div>

      <div class="metric-strip actuator-summary-strip">
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ items.length }}</div>
          <div class="stat-desc">当前监测点</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ backfillCount }}</div>
          <div class="stat-desc">补传来源</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ lowQualityCount }}</div>
          <div class="stat-desc">低可信时间</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ abnormalThresholdCount }}</div>
          <div class="stat-desc">阈值异常</div>
        </article>
      </div>

      <div class="context-strip">
        <div class="context-copy">
          <strong>当前上下文</strong>
          <span>{{ selectedAreaName }} · {{ selectedGatewayName }} · {{ selectedMetricName }}</span>
        </div>
        <div class="context-actions">
          <RouterLink :to="dashboardLink" class="context-link">返回工作台</RouterLink>
          <RouterLink :to="historyLink" class="context-link">历史分析</RouterLink>
          <RouterLink :to="alertsLink" class="context-link">告警中心</RouterLink>
          <RouterLink :to="manualControlLink" class="context-link">手动控制</RouterLink>
        </div>
      </div>

      <div v-if="diagnosticLocatorActive" class="diagnostic-location-strip">
        <div>
          <strong>接入诊断定位</strong>
          <span>当前正在查看 {{ selectedGatewayName }} 的实时数据，优先确认是否有最新读数、补传或低可信时间。</span>
        </div>
        <div class="diagnostic-location-actions">
          <RouterLink class="context-link" :to="selectedGatewayManagementLink">
            网关管理
          </RouterLink>
          <RouterLink class="context-link" to="/system/device-credentials">
            返回接入诊断
          </RouterLink>
          <button class="ghost-button" type="button" :disabled="!selectedGatewayRecord" @click="copyRealtimeTroubleshooting">
            复制排查
          </button>
          <button class="ghost-button" type="button" @click="clearDiagnosticLocator">
            清除定位
          </button>
        </div>
      </div>

      <div class="mobile-only mobile-filter-summary">
        <div class="mobile-filter-summary-copy">
          <strong>当前筛选</strong>
          <span>{{ selectedAreaName }} · {{ selectedGatewayName }} · {{ selectedMetricName }}</span>
        </div>
        <button class="ghost-button" @click="mobileFiltersOpen = !mobileFiltersOpen">
          {{ mobileFiltersOpen ? "收起筛选" : "展开筛选" }}
        </button>
      </div>

      <div class="toolbar desktop-filter-toolbar mobile-filter-toolbar" :class="{ 'mobile-filter-toolbar-open': mobileFiltersOpen }">
        <label class="filter-item">
          <span>区域</span>
          <select v-model="filters.areaId">
            <option value="">全部</option>
            <option v-for="area in areas" :key="area.id" :value="area.id">
              {{ area.areaName }}
            </option>
          </select>
        </label>
        <label class="filter-item">
          <span>网关</span>
          <select v-model="filters.gatewayId">
            <option value="">全部</option>
            <option v-for="gateway in gateways" :key="gateway.id" :value="gateway.id">
              {{ gateway.gatewayName }}
            </option>
          </select>
        </label>
        <label class="filter-item">
          <span>传感器类型</span>
          <select v-model="filters.sensorType">
            <option value="">全部</option>
            <option v-for="metric in metricOptions" :key="metric.metricCode" :value="metric.metricCode">
              {{ formatMetricOption(metric) }}
            </option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadRealtime">查询</button>
        </div>
      </div>

      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>
      <div v-if="message" class="success-text">{{ message }}</div>

      <section v-if="diagnosticLocatorActive && !loading && items.length === 0" class="diagnostic-empty-card">
        <div>
          <strong>{{ selectedGatewayName }} 暂无实时读数</strong>
          <p>{{ realtimeEmptyDiagnosticText }}</p>
        </div>
        <div class="diagnostic-location-actions">
          <RouterLink class="context-link" :to="selectedGatewayManagementLink">
            检查网关配置
          </RouterLink>
          <RouterLink class="context-link" to="/system/device-credentials">
            返回接入诊断
          </RouterLink>
        </div>
      </section>

      <section v-if="canWriteTestReading && testPanelOpen" class="detail-card realtime-test-card">
        <div class="realtime-test-head">
          <div>
            <div class="detail-label">传感器测试写入</div>
            <div class="detail-value">ESP32 不在现场时，用这里手动写入一条实时读数，验证监控和历史链路。</div>
          </div>
          <span class="tag tag-p2">manual</span>
        </div>
        <div class="form-grid">
          <label class="form-item">
            <span>传感器</span>
            <select v-model="testForm.sensorId" @change="syncTestValueFromSensor">
              <option value="">请选择传感器</option>
              <option v-for="item in items" :key="item.sensorId" :value="item.sensorId">
                {{ item.sensorName }} · {{ item.areaName || "未绑定区域" }}
              </option>
            </select>
          </label>
          <label class="form-item">
            <span>测试值</span>
            <input v-model="testForm.metricValue" type="number" step="0.01" placeholder="例如 23.5" />
          </label>
          <label class="form-item form-span">
            <span>备注</span>
            <input v-model="testForm.remark" type="text" placeholder="例如：ESP32 不在现场，手动验证实时链路" />
          </label>
        </div>
        <div class="inline-actions">
          <button class="primary-button" type="button" @click="writeTestReading" :disabled="writingTestReading || !testForm.sensorId">
            {{ writingTestReading ? "写入中..." : "写入测试数据" }}
          </button>
          <RouterLink :to="historyLink" class="dashboard-mini-link">写入后看历史</RouterLink>
        </div>
      </section>

      <section v-if="priorityItems.length > 0" class="mobile-only mobile-inline-detail-card">
        <div class="mobile-inline-detail-head">
          <div>
            <div class="mobile-field-kicker">优先处理</div>
            <strong class="mobile-inline-detail-title">先看这 {{ priorityItems.length }} 个监测点</strong>
            <div class="mobile-inline-detail-subtitle">异常、低可信和补传优先出现在这里，适合手机快速排查。</div>
          </div>
        </div>

        <div class="mobile-priority-list">
          <article v-for="item in priorityItems" :key="item.sensorId" class="mobile-priority-item">
            <div class="mobile-priority-main">
              <strong>{{ item.sensorName }}</strong>
              <span>{{ item.areaName || "未绑定区域" }} · {{ item.gatewayName || "未绑定网关" }}</span>
            </div>
            <div class="responsive-card-tags">
              <span class="tag" :class="item.dataSource === 'backfill' ? 'tag-warning' : 'tag-success'">
                {{ item.dataSource ? enumLabel("dataSource", item.dataSource) : "-" }}
              </span>
              <span class="tag" :class="timeQualityClass(item.timeQuality)">
                {{ item.timeQuality ? enumLabel("timeQuality", item.timeQuality) : "-" }}
              </span>
            </div>
            <div class="mobile-priority-metrics">
              <span>{{ item.currentValue ?? "-" }} {{ item.unitName || "" }}</span>
              <span>阈值：{{ item.thresholdStatus || "-" }}</span>
              <span>延迟：{{ item.delayMs ?? item.delaySeconds ?? "-" }}</span>
            </div>
          </article>
        </div>
      </section>

      <div class="dashboard-workspace-grid ops-workspace-grid">
        <article class="detail-card dashboard-workspace-card">
          <div class="detail-label">当前筛选</div>
          <div class="dashboard-workspace-value">{{ selectedAreaName }}</div>
          <div class="dashboard-workspace-copy">
            <span>网关：{{ selectedGatewayName }}</span>
            <span>指标：{{ selectedMetricName }}</span>
            <span>{{ autoRefresh ? "已启用自动刷新" : "当前手动刷新" }}</span>
          </div>
        </article>

        <article class="detail-card dashboard-workspace-card">
          <div class="detail-label">值守建议</div>
          <div class="dashboard-workspace-copy">
            <span>{{ realtimeFocusSummary }}</span>
            <span>优先核查补传来源、低可信时间和阈值异常，再决定是否需要人工干预。</span>
          </div>
        </article>

        <article class="detail-card dashboard-workspace-card">
          <div class="detail-label">现场联动</div>
          <div class="dashboard-workspace-actions">
            <RouterLink :to="historyLink" class="dashboard-mini-link">历史分析</RouterLink>
            <RouterLink :to="alertsLink" class="dashboard-mini-link">告警中心</RouterLink>
            <RouterLink :to="dashboardLink" class="dashboard-mini-link">返回工作台</RouterLink>
            <RouterLink :to="manualControlLink" class="dashboard-mini-link dashboard-mini-link-strong">手动控制</RouterLink>
          </div>
        </article>
      </div>

      <table class="simple-table desktop-table-only">
        <thead>
          <tr>
            <th>传感器</th>
            <th>区域</th>
            <th>网关</th>
            <th>当前值</th>
            <th>来源</th>
            <th>时间可信度</th>
            <th>采集时间</th>
            <th>接收时间</th>
            <th>延迟</th>
            <th>阈值状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.sensorId">
            <td>{{ item.sensorName }}</td>
            <td>{{ item.areaName || "-" }}</td>
            <td>{{ item.gatewayName || "-" }}</td>
            <td>{{ item.currentValue ?? "-" }} {{ item.unitName || "" }}</td>
            <td><span class="tag" :class="item.dataSource === 'backfill' ? 'tag-warning' : 'tag-success'">{{ item.dataSource ? enumLabel("dataSource", item.dataSource) : "-" }}</span></td>
            <td><span class="tag" :class="timeQualityClass(item.timeQuality)">{{ item.timeQuality ? enumLabel("timeQuality", item.timeQuality) : "-" }}</span></td>
            <td>{{ formatDateTime(item.lastCollectedAt) }}</td>
            <td>{{ formatDateTime(item.lastReceivedAt) }}</td>
            <td>{{ item.delayMs ?? item.delaySeconds ?? "-" }}</td>
            <td>{{ item.thresholdStatus }}</td>
          </tr>
          <tr v-if="!loading && items.length === 0">
            <td colspan="10" class="empty-cell">暂无实时监控数据</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!loading && items.length > 0" class="responsive-card-list tablet-card-list">
        <article v-for="item in items" :key="item.sensorId" class="responsive-entity-card">
          <div class="responsive-card-head">
            <div class="table-primary-cell">
              <strong>{{ item.sensorName }}</strong>
              <span>{{ item.areaName || "未绑定区域" }} · {{ item.gatewayName || "未绑定网关" }}</span>
            </div>
            <div class="responsive-card-tags">
              <span class="tag" :class="item.dataSource === 'backfill' ? 'tag-warning' : 'tag-success'">
                {{ item.dataSource ? enumLabel("dataSource", item.dataSource) : "-" }}
              </span>
              <span class="tag" :class="timeQualityClass(item.timeQuality)">
                {{ item.timeQuality ? enumLabel("timeQuality", item.timeQuality) : "-" }}
              </span>
            </div>
          </div>
          <div class="responsive-card-grid">
            <div class="responsive-card-field">
              <span>当前值</span>
              <strong>{{ item.currentValue ?? "-" }} {{ item.unitName || "" }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>阈值状态</span>
              <strong>{{ item.thresholdStatus || "-" }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>采集时间</span>
              <strong>{{ formatDateTime(item.lastCollectedAt) }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>接收时间</span>
              <strong>{{ formatDateTime(item.lastReceivedAt) }}</strong>
            </div>
            <div class="responsive-card-field responsive-card-field-full">
              <span>延迟</span>
              <strong>{{ item.delayMs ?? item.delaySeconds ?? "-" }}</strong>
            </div>
          </div>
        </article>
      </div>
      <div v-if="!loading && items.length === 0" class="empty-state tablet-card-empty">暂无实时监控数据</div>
      <div v-if="loading" class="muted-text">正在加载实时数据...</div>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatDateTime } from "../lib/format";
import { DEFAULT_METRIC_OPTIONS, loadMetricOptions } from "../lib/metrics";
import { hasAnyPermission } from "../lib/session";

const loading = ref(false);
const writingTestReading = ref(false);
const errorMessage = ref("");
const message = ref("");
const items = ref([]);
const areas = ref([]);
const gateways = ref([]);
const metricOptions = ref(DEFAULT_METRIC_OPTIONS);
const autoRefresh = ref(false);
const mobileFiltersOpen = ref(false);
const testPanelOpen = ref(false);
let timerId = null;

const filters = reactive({
  areaId: "",
  gatewayId: "",
  sensorType: ""
});
const testForm = reactive({
  sensorId: "",
  metricValue: "",
  remark: "手动测试实时监控链路"
});
const route = useRoute();
const router = useRouter();

const canWriteTestReading = hasAnyPermission(["sensor:test_read", "sensor:edit", "system:config"]);
const backfillCount = computed(() => items.value.filter((item) => item.dataSource === "backfill").length);
const lowQualityCount = computed(() => items.value.filter((item) => item.timeQuality && item.timeQuality !== "high").length);
const abnormalThresholdCount = computed(() => items.value.filter((item) => hasThresholdAttention(item.thresholdStatus)).length);
const selectedAreaName = computed(() => areas.value.find((item) => String(item.id) === String(filters.areaId))?.areaName || "全部区域");
const selectedGatewayRecord = computed(() => gateways.value.find((item) => String(item.id) === String(filters.gatewayId)) || null);
const selectedGatewayName = computed(() => selectedGatewayRecord.value?.gatewayName || "全部网关");
const selectedMetricName = computed(() => metricOptions.value.find((item) => item.metricCode === filters.sensorType)?.metricName || "全部指标");
const diagnosticLocatorActive = computed(() => firstQueryValue(route.query.source) === "ingestDiagnostics" && Boolean(filters.gatewayId));
const realtimeEmptyDiagnosticText = computed(() => {
  const gateway = selectedGatewayRecord.value;
  if (!gateway) {
    return "当前 URL 指向的网关不存在或已被删除，请回到接入诊断重新选择风险设备。";
  }
  if (gateway.onlineStatus && gateway.onlineStatus !== "online") {
    return "网关当前不在线，优先检查供电、WiFi/4G 网络、API_HOST 和 API_TOKEN。";
  }
  if (gateway.deviceConfigSyncStatus && gateway.deviceConfigSyncStatus !== "applied") {
    return "网关在线但配置未生效，优先进入网关管理确认 ESP32 是否已拉取并回报配置版本。";
  }
  return "网关存在但当前筛选下没有实时读数，优先检查传感器接线、采样任务、RS485 地址和设备上报接口。";
});
const queryContext = computed(() => {
  const query = {};
  if (filters.areaId) query.areaId = String(filters.areaId);
  if (filters.gatewayId) query.gatewayId = String(filters.gatewayId);
  return query;
});
const dashboardLink = computed(() => ({ path: "/dashboard/overview", query: filters.areaId ? { areaId: String(filters.areaId) } : {} }));
const historyLink = computed(() => ({ path: "/monitor/history", query: queryContext.value }));
const alertsLink = computed(() => ({ path: "/alerts/center", query: filters.areaId ? { areaId: String(filters.areaId) } : {} }));
const manualControlLink = computed(() => ({ path: "/controls/manual", query: filters.areaId ? { areaId: String(filters.areaId) } : {} }));
const selectedGatewayManagementLink = computed(() => ({
  path: "/devices/gateways",
  query: selectedGatewayRecord.value
    ? {
        source: "ingestDiagnostics",
        keyword: selectedGatewayRecord.value.gatewayCode,
        gatewayCode: selectedGatewayRecord.value.gatewayCode
      }
    : { source: "ingestDiagnostics" }
}));
const realtimeFocusSummary = computed(() => {
  if (abnormalThresholdCount.value > 0) {
    return `当前有 ${abnormalThresholdCount.value} 个监测点处于阈值异常，建议先联动告警与控制页。`;
  }
  if (lowQualityCount.value > 0) {
    return `当前有 ${lowQualityCount.value} 个监测点时间可信度偏低，建议先核查网关与补传情况。`;
  }
  if (backfillCount.value > 0) {
    return `当前有 ${backfillCount.value} 个监测点来自补传数据，适合转到历史分析看波动来源。`;
  }
  return "当前实时监测整体平稳，可以继续跟进历史曲线或现场控制状态。";
});
const priorityItems = computed(() =>
  items.value
    .filter((item) => hasThresholdAttention(item.thresholdStatus) || item.dataSource === "backfill" || (item.timeQuality && item.timeQuality !== "high"))
    .slice(0, 3)
);
const selectedTestSensor = computed(() =>
  items.value.find((item) => String(item.sensorId) === String(testForm.sensorId)) || null
);

function timeQualityClass(value) {
  if (value === "high") return "tag-success";
  if (value === "medium") return "tag-warning";
  return "tag-danger";
}

function hasThresholdAttention(value) {
  const text = String(value || "").trim();
  if (!text) {
    return false;
  }
  return !["normal", "ok", "正常", "-"].includes(text.toLowerCase());
}

function formatMetricOption(metric) {
  return metric.unitName ? `${metric.metricName} (${metric.unitName})` : metric.metricName;
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function readNumberQuery(value) {
  const raw = firstQueryValue(value);
  if (raw === undefined || raw === null || raw === "") {
    return "";
  }
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : "";
}

function hydrateFiltersFromRoute() {
  filters.areaId = readNumberQuery(route.query.areaId);
  filters.gatewayId = readNumberQuery(route.query.gatewayId);
  filters.sensorType = firstQueryValue(route.query.sensorType) || "";
}

function syncRouteQuery() {
  const query = {};
  const shouldKeepDiagnosticSource = firstQueryValue(route.query.source) === "ingestDiagnostics" && Boolean(filters.gatewayId);
  if (shouldKeepDiagnosticSource) query.source = "ingestDiagnostics";
  if (filters.areaId) query.areaId = String(filters.areaId);
  if (filters.gatewayId) query.gatewayId = String(filters.gatewayId);
  if (filters.sensorType) query.sensorType = String(filters.sensorType);
  router.replace({ query }).catch(() => {});
}

function resetFilters() {
  filters.areaId = "";
  filters.gatewayId = "";
  filters.sensorType = "";
  mobileFiltersOpen.value = false;
  loadRealtime();
}

function clearDiagnosticLocator() {
  filters.areaId = "";
  filters.gatewayId = "";
  filters.sensorType = "";
  mobileFiltersOpen.value = false;
  router.replace({ query: {} }).catch(() => {});
  loadRealtime();
}

function buildRealtimeTroubleshootingText() {
  const gateway = selectedGatewayRecord.value;
  return [
    "实时监控排查信息",
    `网关：${gateway?.gatewayName || selectedGatewayName.value}`,
    `编号：${gateway?.gatewayCode || "-"}`,
    `区域：${selectedAreaName.value}`,
    `在线状态：${gateway?.onlineStatus ? enumLabel("onlineStatus", gateway.onlineStatus) : "-"}`,
    `最近心跳：${formatDateTime(gateway?.lastHeartbeatAt)}`,
    `WiFi RSSI：${gateway?.wifiRssi ?? "-"} dBm`,
    `配置状态：${gateway?.deviceConfigSyncStatus || "-"}`,
    `当前指标：${selectedMetricName.value}`,
    `实时监测点：${items.value.length} 个`,
    `补传来源：${backfillCount.value} 个`,
    `低可信时间：${lowQualityCount.value} 个`,
    `阈值异常：${abnormalThresholdCount.value} 个`,
    `判断：${items.value.length > 0 ? realtimeFocusSummary.value : realtimeEmptyDiagnosticText.value}`
  ].join("\n");
}

async function copyRealtimeTroubleshooting() {
  if (!selectedGatewayRecord.value) {
    return;
  }
  try {
    await copyText(buildRealtimeTroubleshootingText());
    message.value = "实时监控排查信息已复制";
  } catch {
    errorMessage.value = "复制失败，请手动复制页面中的实时监控信息";
  }
}

async function copyText(value) {
  const text = String(value || "");
  if (!text) {
    throw new Error("empty_text");
  }

  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("copy_failed");
  }
}

function toggleTestPanel() {
  testPanelOpen.value = !testPanelOpen.value;
  if (testPanelOpen.value && !testForm.sensorId && items.value[0]) {
    testForm.sensorId = String(items.value[0].sensorId);
    syncTestValueFromSensor();
  }
}

function syncTestValueFromSensor() {
  const sensor = selectedTestSensor.value;
  if (!sensor) {
    return;
  }
  if (sensor.currentValue !== undefined && sensor.currentValue !== null && sensor.currentValue !== "") {
    testForm.metricValue = String(sensor.currentValue);
    return;
  }
  testForm.metricValue = "";
}

async function loadLookups() {
  const [areaRows, gatewayRows, metricRows] = await Promise.all([
    apiRequest("/api/v1/areas"),
    apiRequest("/api/v1/gateways"),
    loadMetricOptions()
  ]);
  areas.value = areaRows;
  gateways.value = gatewayRows;
  metricOptions.value = metricRows;
}

async function loadRealtime() {
  loading.value = true;
  errorMessage.value = "";
  try {
    syncRouteQuery();
    items.value = await apiRequest(`/api/v1/monitor/realtime${buildQuery(filters)}`);
    if (testPanelOpen.value && !items.value.some((item) => String(item.sensorId) === String(testForm.sensorId))) {
      testForm.sensorId = items.value[0]?.sensorId ? String(items.value[0].sensorId) : "";
      syncTestValueFromSensor();
    }
    mobileFiltersOpen.value = false;
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function writeTestReading() {
  if (!testForm.sensorId) {
    errorMessage.value = "请先选择传感器";
    return;
  }
  if (testForm.metricValue === "") {
    errorMessage.value = "请填写测试值";
    return;
  }
  writingTestReading.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const result = await apiRequest("/api/v1/monitor/test-reading", {
      method: "POST",
      body: JSON.stringify({
        sensorId: testForm.sensorId,
        metricValue: testForm.metricValue,
        remark: testForm.remark
      })
    });
    message.value = `测试数据已写入：${selectedTestSensor.value?.sensorName || "传感器"} = ${result.metricValue}`;
    await loadRealtime();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    writingTestReading.value = false;
  }
}

function syncTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  if (autoRefresh.value) {
    timerId = window.setInterval(loadRealtime, 15000);
  }
}

watch(autoRefresh, syncTimer);

onMounted(async () => {
  await loadLookups();
  hydrateFiltersFromRoute();
  await loadRealtime();
});

onBeforeUnmount(() => {
  if (timerId) {
    clearInterval(timerId);
  }
});
</script>
