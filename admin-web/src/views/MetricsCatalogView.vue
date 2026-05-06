<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>指标字典</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadMetrics">刷新</button>
          <button v-if="canEdit" class="primary-button" @click="startCreate">新增指标</button>
        </div>
      </div>

      <div class="toolbar">
        <label class="filter-item">
          <span>关键字</span>
          <input v-model="filters.keyword" type="text" placeholder="指标编码 / 名称" />
        </label>
        <label class="filter-item">
          <span>分类</span>
          <select v-model="filters.categoryCode">
            <option value="">全部</option>
            <option v-for="item in CATEGORY_OPTIONS" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </select>
        </label>
        <label class="filter-item">
          <span>状态</span>
          <select v-model="filters.enabled">
            <option value="">全部</option>
            <option value="true">启用</option>
            <option value="false">禁用</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadMetrics">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table">
        <thead>
          <tr>
            <th>指标编码</th>
            <th>指标名称</th>
            <th>分类</th>
            <th>单位</th>
            <th>精度</th>
            <th>正常范围</th>
            <th>预警范围</th>
            <th>通道/传感器</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in metrics" :key="item.id">
            <td>{{ item.metricCode }}</td>
            <td>
              <div class="color-with-text">
                <span class="color-dot" :style="{ backgroundColor: item.chartColor || '#2f6b42' }"></span>
                <span>{{ item.metricName }}</span>
              </div>
            </td>
            <td>{{ categoryLabel(item.categoryCode) }}</td>
            <td>{{ item.unitName || "-" }}</td>
            <td>{{ item.precisionScale ?? "-" }}</td>
            <td>{{ rangeText(item.normalMin, item.normalMax) }}</td>
            <td>{{ rangeText(item.warnMin, item.warnMax) }}</td>
            <td>{{ item.channelCount }}/{{ item.sensorCount }}</td>
            <td>
              <span class="tag" :class="item.enabled ? 'tag-success' : 'tag-warning'">
                {{ item.enabled ? "启用" : "禁用" }}
              </span>
            </td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click="showDetail(item)">详情</button>
                <button v-if="canEdit" class="table-link" @click="startEdit(item)">编辑</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && metrics.length === 0">
            <td colspan="10" class="empty-cell">暂无指标字典数据</td>
          </tr>
        </tbody>
      </table>

      <div v-if="loading" class="muted-text">正在加载指标字典...</div>
    </section>

    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>{{ editingMetricId ? "编辑指标" : "新增指标" }}</h2>
          <span class="tag tag-p1">字典配置</span>
        </div>

        <form class="form-grid" @submit.prevent="saveMetric">
          <label class="form-item">
            <span>指标编码</span>
            <input v-model="form.metricCode" type="text" :disabled="Boolean(editingMetricId)" placeholder="如 soil_temp" />
          </label>
          <label class="form-item">
            <span>指标名称</span>
            <input v-model="form.metricName" type="text" placeholder="如 土壤温度" />
          </label>
          <label class="form-item">
            <span>分类</span>
            <select v-model="form.categoryCode">
              <option v-for="item in CATEGORY_OPTIONS" :key="item.value" :value="item.value">
                {{ item.label }}
              </option>
            </select>
          </label>
          <label class="form-item">
            <span>值类型</span>
            <select v-model="form.valueType">
              <option v-for="item in VALUE_TYPE_OPTIONS" :key="item.value" :value="item.value">
                {{ item.label }}
              </option>
            </select>
          </label>
          <label class="form-item">
            <span>单位</span>
            <input v-model="form.unitName" type="text" placeholder="℃ / % / ppm" />
          </label>
          <label class="form-item">
            <span>显示精度</span>
            <input v-model="form.precisionScale" type="number" min="0" max="6" />
          </label>
          <label class="form-item">
            <span>正常最小值</span>
            <input v-model="form.normalMin" type="number" step="0.1" />
          </label>
          <label class="form-item">
            <span>正常最大值</span>
            <input v-model="form.normalMax" type="number" step="0.1" />
          </label>
          <label class="form-item">
            <span>预警最小值</span>
            <input v-model="form.warnMin" type="number" step="0.1" />
          </label>
          <label class="form-item">
            <span>预警最大值</span>
            <input v-model="form.warnMax" type="number" step="0.1" />
          </label>
          <label class="form-item">
            <span>图表颜色</span>
            <input v-model="form.chartColor" type="color" />
          </label>
          <label class="form-item">
            <span>排序</span>
            <input v-model="form.sortOrder" type="number" min="0" />
          </label>
          <label class="form-item">
            <span>启用状态</span>
            <select v-model="form.enabled">
              <option :value="true">启用</option>
              <option :value="false">禁用</option>
            </select>
          </label>
          <label class="form-item form-span">
            <span>备注</span>
            <textarea v-model="form.remark" rows="3" placeholder="指标业务说明、采集说明、图表使用说明" />
          </label>

          <div class="form-actions form-span">
            <button class="ghost-button" type="button" @click="resetForm">清空</button>
            <button class="primary-button" :disabled="saving || !canEdit">
              {{ saving ? "保存中..." : editingMetricId ? "保存修改" : "创建指标" }}
            </button>
          </div>
        </form>
      </div>

      <div>
        <div class="panel-header">
          <h2>指标详情</h2>
          <span class="tag tag-p1">{{ selectedMetric?.metricCode || "未选择" }}</span>
        </div>

        <div v-if="selectedMetric" class="detail-grid">
          <div class="detail-card">
            <div class="detail-label">指标名称</div>
            <div class="detail-value color-with-text">
              <span class="color-dot" :style="{ backgroundColor: selectedMetric.chartColor || '#2f6b42' }"></span>
              <span>{{ selectedMetric.metricName }}</span>
            </div>
          </div>
          <div class="detail-card">
            <div class="detail-label">分类</div>
            <div class="detail-value">{{ categoryLabel(selectedMetric.categoryCode) }}</div>
          </div>
          <div class="detail-card">
            <div class="detail-label">单位 / 精度</div>
            <div class="detail-value">{{ selectedMetric.unitName || "无单位" }} / {{ selectedMetric.precisionScale ?? 0 }} 位</div>
          </div>
          <div class="detail-card">
            <div class="detail-label">状态</div>
            <div class="detail-value">{{ selectedMetric.enabled ? "启用" : "禁用" }}</div>
          </div>
          <div class="detail-card">
            <div class="detail-label">正常范围</div>
            <div class="detail-value">{{ rangeText(selectedMetric.normalMin, selectedMetric.normalMax) }}</div>
          </div>
          <div class="detail-card">
            <div class="detail-label">预警范围</div>
            <div class="detail-value">{{ rangeText(selectedMetric.warnMin, selectedMetric.warnMax) }}</div>
          </div>
          <div class="detail-card">
            <div class="detail-label">已绑定通道/传感器</div>
            <div class="detail-value">{{ selectedMetric.channelCount || 0 }} / {{ selectedMetric.sensorCount || 0 }}</div>
          </div>
          <div class="detail-card">
            <div class="detail-label">更新时间</div>
            <div class="detail-value">{{ formatDateTime(selectedMetric.updatedAt) }}</div>
          </div>
          <div class="detail-card detail-span">
            <div class="detail-label">备注</div>
            <div class="detail-value">{{ selectedMetric.remark || "-" }}</div>
          </div>
        </div>
        <div v-else class="empty-state">从列表选择一条指标查看详情。</div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import { apiRequest, buildQuery } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { hasPermission } from "../lib/session";

const CATEGORY_OPTIONS = [
  { label: "环境类", value: "environment" },
  { label: "土壤类", value: "soil" },
  { label: "气体类", value: "gas" },
  { label: "光照类", value: "light" },
  { label: "养分类", value: "nutrient" },
  { label: "自定义", value: "custom" }
];

const VALUE_TYPE_OPTIONS = [
  { label: "小数", value: "decimal" },
  { label: "整数", value: "integer" },
  { label: "布尔", value: "boolean" },
  { label: "枚举", value: "enum" },
  { label: "文本", value: "string" }
];

const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const message = ref("");
const metrics = ref([]);
const selectedMetric = ref(null);
const editingMetricId = ref(null);

const filters = reactive({
  keyword: "",
  categoryCode: "",
  enabled: ""
});

const form = reactive({
  metricCode: "",
  metricName: "",
  categoryCode: "environment",
  unitName: "",
  valueType: "decimal",
  precisionScale: 2,
  normalMin: "",
  normalMax: "",
  warnMin: "",
  warnMax: "",
  chartColor: "#2f6b42",
  sortOrder: 100,
  enabled: true,
  remark: ""
});

const canEdit = hasPermission("system:config");

function categoryLabel(value) {
  return CATEGORY_OPTIONS.find((item) => item.value === value)?.label || value || "-";
}

function rangeText(minValue, maxValue) {
  const hasMin = minValue !== undefined && minValue !== null && minValue !== "";
  const hasMax = maxValue !== undefined && maxValue !== null && maxValue !== "";
  if (!hasMin && !hasMax) {
    return "-";
  }
  return `${hasMin ? minValue : "-"} ~ ${hasMax ? maxValue : "-"}`;
}

function resetFilters() {
  filters.keyword = "";
  filters.categoryCode = "";
  filters.enabled = "";
  loadMetrics();
}

function resetForm() {
  editingMetricId.value = null;
  form.metricCode = "";
  form.metricName = "";
  form.categoryCode = "environment";
  form.unitName = "";
  form.valueType = "decimal";
  form.precisionScale = 2;
  form.normalMin = "";
  form.normalMax = "";
  form.warnMin = "";
  form.warnMax = "";
  form.chartColor = "#2f6b42";
  form.sortOrder = 100;
  form.enabled = true;
  form.remark = "";
}

function showDetail(item) {
  selectedMetric.value = item;
}

function startCreate() {
  resetForm();
  errorMessage.value = "";
  message.value = "";
}

function startEdit(item) {
  editingMetricId.value = item.id;
  form.metricCode = item.metricCode;
  form.metricName = item.metricName;
  form.categoryCode = item.categoryCode || "environment";
  form.unitName = item.unitName || "";
  form.valueType = item.valueType || "decimal";
  form.precisionScale = item.precisionScale ?? 2;
  form.normalMin = item.normalMin ?? "";
  form.normalMax = item.normalMax ?? "";
  form.warnMin = item.warnMin ?? "";
  form.warnMax = item.warnMax ?? "";
  form.chartColor = item.chartColor || "#2f6b42";
  form.sortOrder = item.sortOrder ?? 100;
  form.enabled = Boolean(item.enabled);
  form.remark = item.remark || "";
  selectedMetric.value = item;
  errorMessage.value = "";
  message.value = "";
}

function buildPayload() {
  return {
    metricCode: form.metricCode,
    metricName: form.metricName,
    categoryCode: form.categoryCode,
    unitName: form.unitName,
    valueType: form.valueType,
    precisionScale: Number(form.precisionScale) || 0,
    normalMin: form.normalMin === "" ? null : Number(form.normalMin),
    normalMax: form.normalMax === "" ? null : Number(form.normalMax),
    warnMin: form.warnMin === "" ? null : Number(form.warnMin),
    warnMax: form.warnMax === "" ? null : Number(form.warnMax),
    chartColor: form.chartColor,
    sortOrder: Number(form.sortOrder) || 0,
    enabled: Boolean(form.enabled),
    remark: form.remark
  };
}

async function loadMetrics() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const rows = await apiRequest(`/api/v1/metrics${buildQuery(filters)}`);
    metrics.value = rows;
    if (selectedMetric.value?.id) {
      const matched = rows.find((item) => item.id === selectedMetric.value.id);
      selectedMetric.value = matched || rows[0] || null;
    } else {
      selectedMetric.value = rows[0] || null;
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function saveMetric() {
  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const payload = buildPayload();
    if (editingMetricId.value) {
      await apiRequest(`/api/v1/metrics/${editingMetricId.value}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      message.value = "指标已更新";
    } else {
      await apiRequest("/api/v1/metrics", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      message.value = "指标已创建";
    }
    resetForm();
    await loadMetrics();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  resetForm();
  await loadMetrics();
});
</script>

<style scoped>
.color-with-text {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.color-dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 1px solid rgba(27, 43, 33, 0.18);
  flex: 0 0 auto;
}
</style>
