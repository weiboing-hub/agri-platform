<template>
  <div class="stack">
    <section class="panel mobile-only mobile-field-panel">
      <div class="mobile-field-panel-head">
        <div>
          <div class="mobile-field-kicker">现场模式</div>
          <h2>最近数据</h2>
          <p class="panel-subtitle">{{ historyFocusSummary }}</p>
        </div>
      </div>

      <div class="mobile-field-stat-grid">
        <article class="mobile-field-stat-card">
          <span class="mobile-field-stat-label">样本数</span>
          <strong class="mobile-field-stat-value">{{ stats.count }}</strong>
          <small>{{ selectedSensorName }}</small>
        </article>
        <article class="mobile-field-stat-card">
          <span class="mobile-field-stat-label">平均值</span>
          <strong class="mobile-field-stat-value">{{ stats.avg }}</strong>
          <small>{{ selectedAreaName }}</small>
        </article>
        <article class="mobile-field-stat-card">
          <span class="mobile-field-stat-label">补传</span>
          <strong class="mobile-field-stat-value">{{ backfillHistoryCount }}</strong>
          <small>需要回看采集稳定性</small>
        </article>
        <article class="mobile-field-stat-card">
          <span class="mobile-field-stat-label">低可信</span>
          <strong class="mobile-field-stat-value">{{ lowQualityHistoryCount }}</strong>
          <small>时间可信度待核查</small>
        </article>
      </div>

      <div class="mobile-field-shortcuts">
        <RouterLink :to="dashboardLink" class="mobile-field-shortcut">返回工作台</RouterLink>
        <RouterLink :to="realtimeLink" class="mobile-field-shortcut">实时监控</RouterLink>
        <RouterLink :to="alertsLink" class="mobile-field-shortcut">告警中心</RouterLink>
        <RouterLink :to="manualControlLink" class="mobile-field-shortcut mobile-field-shortcut-strong">手动控制</RouterLink>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>历史分析</h2>
          <p class="panel-subtitle">{{ selectedAreaName }} · {{ selectedSensorName }}</p>
        </div>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadHistory">刷新</button>
        </div>
      </div>

      <div class="mobile-only mobile-filter-summary">
        <div class="mobile-filter-summary-copy">
          <strong>当前筛选</strong>
          <span>{{ selectedAreaName }} · {{ selectedSensorName }} · {{ selectedDataSourceName }} · {{ selectedTimeQualityName }}</span>
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
          <span>传感器</span>
          <select v-model="filters.sensorId">
            <option value="">请选择传感器</option>
            <option v-for="sensor in availableSensors" :key="sensor.id" :value="sensor.id">
              {{ sensor.sensorName }} ({{ sensor.sensorType }})
            </option>
          </select>
        </label>
        <label class="filter-item">
          <span>来源</span>
          <select v-model="filters.dataSource">
            <option value="">全部</option>
            <option value="realtime">{{ enumLabel("dataSource", "realtime") }}</option>
            <option value="backfill">{{ enumLabel("dataSource", "backfill") }}</option>
            <option value="manual">{{ enumLabel("dataSource", "manual") }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>时间可信度</span>
          <select v-model="filters.timeQuality">
            <option value="">全部</option>
            <option value="high">{{ enumLabel("timeQuality", "high") }}</option>
            <option value="medium">{{ enumLabel("timeQuality", "medium") }}</option>
            <option value="low">{{ enumLabel("timeQuality", "low") }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>条数</span>
          <input v-model="filters.limit" type="number" min="10" max="500" />
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadHistory">查询</button>
        </div>
      </div>

      <div class="stats-grid metrics-grid">
        <div class="stat-card">
          <div class="stat-title">样本数</div>
          <div class="stat-value">{{ stats.count }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">平均值</div>
          <div class="stat-value">{{ stats.avg }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">最小值</div>
          <div class="stat-value">{{ stats.min }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">最大值</div>
          <div class="stat-value">{{ stats.max }}</div>
        </div>
      </div>

      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table desktop-table-only">
        <thead>
          <tr>
            <th>指标</th>
            <th>值</th>
            <th>来源</th>
            <th>补传</th>
            <th>采集时间</th>
            <th>接收时间</th>
            <th>时间可信度</th>
            <th>时钟同步</th>
            <th>延迟(ms)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in rows" :key="item.id">
            <td>{{ item.metricName }}</td>
            <td>{{ item.metricValue }} {{ item.unitName || "" }}</td>
            <td>{{ enumLabel("dataSource", item.dataSource) }}</td>
            <td>{{ item.isBackfilled ? "是" : "否" }}</td>
            <td>{{ formatDateTime(item.collectedAt) }}</td>
            <td>{{ formatDateTime(item.receivedAt) }}</td>
            <td><span class="tag" :class="timeQualityClass(item.timeQuality)">{{ enumLabel("timeQuality", item.timeQuality) }}</span></td>
            <td>{{ item.clockSynced ? "是" : "否" }}</td>
            <td>{{ item.delayMs ?? "-" }}</td>
          </tr>
          <tr v-if="!loading && rows.length === 0">
            <td colspan="9" class="empty-cell">暂无历史数据</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!loading && rows.length > 0" class="responsive-card-list tablet-card-list">
        <article v-for="item in rows" :key="item.id" class="responsive-entity-card">
          <div class="responsive-card-head">
            <div class="table-primary-cell">
              <strong>{{ item.metricName }}</strong>
              <span>{{ selectedSensorName }} · {{ formatDateTime(item.collectedAt) }}</span>
            </div>
            <div class="responsive-card-tags">
              <span class="tag" :class="item.isBackfilled || item.dataSource === 'backfill' ? 'tag-warning' : 'tag-success'">
                {{ enumLabel("dataSource", item.dataSource) }}
              </span>
              <span class="tag" :class="timeQualityClass(item.timeQuality)">
                {{ enumLabel("timeQuality", item.timeQuality) }}
              </span>
            </div>
          </div>
          <div class="responsive-card-grid">
            <div class="responsive-card-field">
              <span>数值</span>
              <strong>{{ item.metricValue }} {{ item.unitName || "" }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>补传</span>
              <strong>{{ item.isBackfilled ? "是" : "否" }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>接收时间</span>
              <strong>{{ formatDateTime(item.receivedAt) }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>时钟同步</span>
              <strong>{{ item.clockSynced ? "是" : "否" }}</strong>
            </div>
            <div class="responsive-card-field responsive-card-field-full">
              <span>延迟</span>
              <strong>{{ item.delayMs ?? "-" }} ms</strong>
            </div>
          </div>
        </article>
      </div>
      <div v-if="!loading && rows.length === 0" class="empty-state tablet-card-empty">暂无历史数据</div>
      <div v-if="loading" class="muted-text">正在加载历史数据...</div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatDateTime, formatNumber } from "../lib/format";

const loading = ref(false);
const errorMessage = ref("");
const areas = ref([]);
const sensors = ref([]);
const rows = ref([]);
const mobileFiltersOpen = ref(false);
const route = useRoute();
const router = useRouter();

const filters = reactive({
  areaId: "",
  sensorId: "",
  dataSource: "",
  timeQuality: "",
  limit: 100
});
const availableSensors = computed(() =>
  filters.areaId ? sensors.value.filter((item) => String(item.areaId) === String(filters.areaId)) : sensors.value
);
const selectedAreaName = computed(() =>
  filters.areaId ? areas.value.find((item) => String(item.id) === String(filters.areaId))?.areaName || "当前区域" : "全部区域"
);
const selectedSensor = computed(() =>
  sensors.value.find((item) => String(item.id) === String(filters.sensorId)) || null
);
const selectedSensorName = computed(() => selectedSensor.value?.sensorName || "未选择传感器");
const selectedDataSourceName = computed(() =>
  filters.dataSource ? enumLabel("dataSource", filters.dataSource) : "全部来源"
);
const selectedTimeQualityName = computed(() =>
  filters.timeQuality ? enumLabel("timeQuality", filters.timeQuality) : "全部可信度"
);
const backfillHistoryCount = computed(() =>
  rows.value.filter((item) => item.isBackfilled || item.dataSource === "backfill").length
);
const lowQualityHistoryCount = computed(() =>
  rows.value.filter((item) => item.timeQuality && item.timeQuality !== "high").length
);

const stats = computed(() => {
  if (rows.value.length === 0) {
    return {
      count: 0,
      avg: "-",
      min: "-",
      max: "-"
    };
  }
  const values = rows.value
    .map((item) => Number(item.metricValue))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return {
      count: rows.value.length,
      avg: "-",
      min: "-",
      max: "-"
    };
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: rows.value.length,
    avg: formatNumber(total / values.length),
    min: formatNumber(Math.min(...values)),
    max: formatNumber(Math.max(...values))
  };
});
const historyFocusSummary = computed(() => {
  if (!filters.sensorId) {
    return "请选择传感器后查看最近采集数据。";
  }
  if (lowQualityHistoryCount.value > 0) {
    return `当前有 ${lowQualityHistoryCount.value} 条低可信数据，建议回到实时监控核查网关时间。`;
  }
  if (backfillHistoryCount.value > 0) {
    return `当前有 ${backfillHistoryCount.value} 条补传数据，建议关注采集连续性。`;
  }
  if (rows.value.length > 0) {
    return `最近 ${rows.value.length} 条数据已加载，可快速判断波动范围。`;
  }
  return "当前筛选下暂无历史数据，可切换区域或传感器。";
});
const dashboardLink = computed(() => ({ path: "/dashboard/overview", query: filters.areaId ? { areaId: String(filters.areaId) } : {} }));
const realtimeLink = computed(() => ({
  path: "/monitor/realtime",
  query: {
    ...(filters.areaId ? { areaId: String(filters.areaId) } : {})
  }
}));
const alertsLink = computed(() => ({ path: "/alerts/center", query: filters.areaId ? { areaId: String(filters.areaId) } : {} }));
const manualControlLink = computed(() => ({ path: "/controls/manual", query: filters.areaId ? { areaId: String(filters.areaId) } : {} }));

function timeQualityClass(value) {
  if (value === "high") return "tag-success";
  if (value === "medium") return "tag-warning";
  return "tag-danger";
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function readNumberQuery(value, fallback = "") {
  const raw = firstQueryValue(value);
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function hydrateFiltersFromRoute() {
  filters.areaId = readNumberQuery(route.query.areaId);
  filters.sensorId = readNumberQuery(route.query.sensorId);
  filters.dataSource = firstQueryValue(route.query.dataSource) || "";
  filters.timeQuality = firstQueryValue(route.query.timeQuality) || "";
  filters.limit = readNumberQuery(route.query.limit, 100) || 100;
}

function syncRouteQuery() {
  const query = {};
  if (filters.areaId) query.areaId = String(filters.areaId);
  if (filters.sensorId) query.sensorId = String(filters.sensorId);
  if (filters.dataSource) query.dataSource = String(filters.dataSource);
  if (filters.timeQuality) query.timeQuality = String(filters.timeQuality);
  if (filters.limit) query.limit = String(filters.limit);
  router.replace({ query }).catch(() => {});
}

function resetFilters() {
  filters.areaId = "";
  filters.sensorId = sensors.value[0]?.id || "";
  filters.dataSource = "";
  filters.timeQuality = "";
  filters.limit = 100;
  mobileFiltersOpen.value = false;
  loadHistory();
}

async function loadSensors() {
  const [areaRows, sensorRows] = await Promise.all([
    apiRequest("/api/v1/areas"),
    apiRequest("/api/v1/sensors")
  ]);
  areas.value = areaRows;
  sensors.value = sensorRows;
  if (filters.areaId && !availableSensors.value.some((item) => String(item.id) === String(filters.sensorId))) {
    filters.sensorId = availableSensors.value[0]?.id || "";
  }
  if (!filters.sensorId && availableSensors.value[0]) {
    filters.sensorId = availableSensors.value[0].id;
  }
}

async function loadHistory() {
  if (!filters.sensorId) {
    errorMessage.value = "请先选择传感器";
    return;
  }
  loading.value = true;
  errorMessage.value = "";
  try {
    syncRouteQuery();
    rows.value = await apiRequest(`/api/v1/monitor/history${buildQuery(filters)}`);
    mobileFiltersOpen.value = false;
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  hydrateFiltersFromRoute();
  await loadSensors();
  if (filters.sensorId) {
    await loadHistory();
  }
});

watch(
  () => filters.areaId,
  () => {
    if (filters.sensorId && availableSensors.value.some((item) => String(item.id) === String(filters.sensorId))) {
      return;
    }
    filters.sensorId = availableSensors.value[0]?.id || "";
  }
);
</script>
