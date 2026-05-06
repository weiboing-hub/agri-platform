<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>传感器管理</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadSensors">刷新</button>
          <button v-if="canEdit" class="primary-button" @click="startCreate">新增传感器</button>
        </div>
      </div>

      <div class="toolbar">
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
          <span>类型</span>
          <select v-model="filters.sensorType">
            <option value="">全部</option>
            <option v-for="metric in metricOptions" :key="metric.metricCode" :value="metric.metricCode">
              {{ formatMetricOption(metric) }}
            </option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadSensors">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table">
        <thead>
          <tr>
            <th>编号</th>
            <th>名称</th>
            <th>类型</th>
            <th>区域</th>
            <th>网关</th>
            <th>地址</th>
            <th>当前值</th>
            <th>校准状态</th>
            <th>质量评分</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in sensors" :key="item.id">
            <td>{{ item.sensorCode }}</td>
            <td>{{ item.sensorName }}</td>
            <td>{{ displayMetricLabel(item.sensorType) }}</td>
            <td>{{ item.areaName || "-" }}</td>
            <td>{{ item.gatewayName || "-" }}</td>
            <td>{{ item.modbusAddress ?? "-" }}</td>
            <td>{{ item.currentValue ?? "-" }} {{ item.unitName || "" }}</td>
            <td>{{ item.calibrationStatus ? enumLabel("calibrationStatus", item.calibrationStatus) : "-" }}</td>
            <td>{{ item.dataQualityScore ?? "-" }}</td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click="showDetail(item)">详情</button>
                <button v-if="canEdit" class="table-link" @click="startEdit(item)">编辑</button>
                <button v-if="canDelete" class="table-link" @click="deleteSensor(item)">删除</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && sensors.length === 0">
            <td colspan="10" class="empty-cell">暂无传感器数据</td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="muted-text">正在加载传感器数据...</div>
    </section>

    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>{{ editingSensorId ? "编辑传感器" : "新增传感器" }}</h2>
          <span class="tag tag-p0">P0</span>
        </div>
        <form class="form-grid" @submit.prevent="saveSensor">
          <label class="form-item">
            <span>传感器编号</span>
            <input v-model="form.sensorCode" type="text" :disabled="Boolean(editingSensorId)" />
          </label>
          <label class="form-item">
            <span>传感器名称</span>
            <input v-model="form.sensorName" type="text" />
          </label>
          <label class="form-item">
            <span>传感器类型</span>
            <select v-model="form.sensorType">
              <option v-for="metric in metricOptions" :key="metric.metricCode" :value="metric.metricCode">
                {{ formatMetricOption(metric) }}
              </option>
            </select>
          </label>
          <label class="form-item">
            <span>协议</span>
            <select v-model="form.protocolType">
              <option value="modbus">{{ enumLabel("protocolType", "modbus") }}</option>
              <option value="uart">{{ enumLabel("protocolType", "uart") }}</option>
            </select>
          </label>
          <label class="form-item">
            <span>型号</span>
            <input v-model="form.modelName" type="text" />
          </label>
          <label class="form-item">
            <span>Modbus 地址</span>
            <input v-model="form.modbusAddress" type="number" min="1" />
          </label>
          <label class="form-item">
            <span>区域</span>
            <select v-model="form.areaId">
              <option value="">请选择区域</option>
              <option v-for="area in areas" :key="area.id" :value="area.id">
                {{ area.areaName }}
              </option>
            </select>
          </label>
          <label class="form-item">
            <span>网关</span>
            <select v-model="form.gatewayId">
              <option value="">请选择网关</option>
              <option v-for="gateway in gateways" :key="gateway.id" :value="gateway.id">
                {{ gateway.gatewayName }}
              </option>
            </select>
          </label>
          <label class="form-item">
            <span>安装位置</span>
            <input v-model="form.installPosition" type="text" />
          </label>
          <label class="form-item">
            <span>单位</span>
            <input v-model="form.unitName" type="text" placeholder="℃ / %" />
          </label>
          <label class="form-item">
            <span>状态</span>
            <select v-model="form.sensorStatus">
              <option value="enabled">{{ enumLabel("status", "enabled") }}</option>
              <option value="disabled">{{ enumLabel("status", "disabled") }}</option>
            </select>
          </label>
          <label class="form-item">
            <span>校准状态</span>
            <select v-model="form.calibrationStatus">
              <option value="pending">{{ enumLabel("calibrationStatus", "pending") }}</option>
              <option value="calibrated">{{ enumLabel("calibrationStatus", "calibrated") }}</option>
              <option value="expired">{{ enumLabel("calibrationStatus", "expired") }}</option>
            </select>
          </label>
          <label class="form-item form-span">
            <span>备注</span>
            <textarea v-model="form.remark" rows="3" />
          </label>
          <div class="form-actions form-span">
            <button class="ghost-button" type="button" @click="resetForm">清空</button>
            <button class="primary-button" :disabled="saving || !canEdit">
              {{ saving ? "保存中..." : editingSensorId ? "保存修改" : "创建传感器" }}
            </button>
          </div>
        </form>
      </div>

      <div>
        <div class="panel-header">
          <h2>传感器详情</h2>
          <span class="tag tag-p1">{{ selectedSensor?.sensorCode || "未选择" }}</span>
        </div>
        <div v-if="selectedSensor" class="detail-grid">
          <div>
            <div class="detail-label">最近采集</div>
            <div class="detail-value">{{ formatDateTime(selectedSensor.lastCollectedAt) }}</div>
          </div>
          <div>
            <div class="detail-label">最近接收</div>
            <div class="detail-value">{{ formatDateTime(selectedSensor.lastReceivedAt) }}</div>
          </div>
          <div>
            <div class="detail-label">当前值</div>
            <div class="detail-value">{{ selectedSensor.currentValue ?? "-" }} {{ selectedSensor.unitName || "" }}</div>
          </div>
          <div>
            <div class="detail-label">质量评分</div>
            <div class="detail-value">{{ selectedSensor.dataQualityScore ?? "-" }}</div>
          </div>
          <div class="detail-span">
            <div class="detail-label">备注</div>
            <div class="detail-value">{{ selectedSensor.remark || "-" }}</div>
          </div>
        </div>
        <div v-else class="empty-state">从列表选择一个传感器查看详情。</div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, watch } from "vue";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatDateTime } from "../lib/format";
import { DEFAULT_METRIC_OPTIONS, loadMetricOptions, metricLabel, metricUnit } from "../lib/metrics";
import { hasPermission } from "../lib/session";

const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const message = ref("");
const areas = ref([]);
const gateways = ref([]);
const metricOptions = ref(DEFAULT_METRIC_OPTIONS);
const sensors = ref([]);
const selectedSensor = ref(null);
const editingSensorId = ref(null);

const filters = reactive({
  areaId: "",
  sensorType: ""
});

const form = reactive({
  sensorCode: "",
  sensorName: "",
  sensorType: "temperature",
  modelName: "",
  protocolType: "modbus",
  modbusAddress: "",
  gatewayId: "",
  areaId: "",
  installPosition: "",
  unitName: "",
  sensorStatus: "enabled",
  calibrationStatus: "pending",
  remark: ""
});

const canEdit = hasPermission("sensor:edit");
const canDelete = hasPermission("device:delete");

function displayMetricLabel(metricCode) {
  return metricLabel(metricOptions.value, metricCode);
}

function formatMetricOption(metric) {
  return metric.unitName ? `${metric.metricName} (${metric.unitName})` : metric.metricName;
}

function resetFilters() {
  filters.areaId = "";
  filters.sensorType = "";
  loadSensors();
}

function resetForm() {
  editingSensorId.value = null;
  form.sensorCode = "";
  form.sensorName = "";
  form.sensorType = metricOptions.value[0]?.metricCode || "temperature";
  form.modelName = "";
  form.protocolType = "modbus";
  form.modbusAddress = "";
  form.gatewayId = "";
  form.areaId = "";
  form.installPosition = "";
  form.unitName = metricUnit(metricOptions.value, form.sensorType);
  form.sensorStatus = "enabled";
  form.calibrationStatus = "pending";
  form.remark = "";
}

function showDetail(item) {
  selectedSensor.value = item;
}

function startCreate() {
  resetForm();
  message.value = "";
  errorMessage.value = "";
}

function startEdit(item) {
  editingSensorId.value = item.id;
  form.sensorCode = item.sensorCode;
  form.sensorName = item.sensorName;
  form.sensorType = item.sensorType || "temperature";
  form.modelName = item.modelName || "";
  form.protocolType = item.protocolType || "modbus";
  form.modbusAddress = item.modbusAddress ?? "";
  form.gatewayId = item.gatewayId || "";
  form.areaId = item.areaId || "";
  form.installPosition = item.installPosition || "";
  form.unitName = item.unitName || "";
  form.sensorStatus = item.sensorStatus || "enabled";
  form.calibrationStatus = item.calibrationStatus || "pending";
  form.remark = item.remark || "";
  selectedSensor.value = item;
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
  if (!metricOptions.value.some((item) => item.metricCode === form.sensorType)) {
    form.sensorType = metricOptions.value[0]?.metricCode || "temperature";
  }
  if (!form.unitName) {
    form.unitName = metricUnit(metricOptions.value, form.sensorType);
  }
}

async function loadSensors() {
  loading.value = true;
  errorMessage.value = "";
  try {
    sensors.value = await apiRequest(`/api/v1/sensors${buildQuery(filters)}`);
    if (!selectedSensor.value && sensors.value[0]) {
      selectedSensor.value = sensors.value[0];
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function saveSensor() {
  if (!canEdit) {
    return;
  }
  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const payload = {
      sensorCode: form.sensorCode,
      sensorName: form.sensorName,
      sensorType: form.sensorType,
      modelName: form.modelName,
      protocolType: form.protocolType,
      modbusAddress: form.modbusAddress === "" ? null : Number(form.modbusAddress),
      gatewayId: form.gatewayId || null,
      areaId: form.areaId || null,
      installPosition: form.installPosition,
      unitName: form.unitName,
      sensorStatus: form.sensorStatus,
      calibrationStatus: form.calibrationStatus,
      remark: form.remark
    };

    if (editingSensorId.value) {
      await apiRequest(`/api/v1/sensors/${editingSensorId.value}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      message.value = "传感器已更新";
    } else {
      await apiRequest("/api/v1/sensors", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      message.value = "传感器已创建";
    }
    resetForm();
    await loadSensors();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

async function deleteSensor(item) {
  if (!canDelete) {
    return;
  }
  const confirmed = window.confirm(`确认删除传感器“${item.sensorName}”吗？`);
  if (!confirmed) {
    return;
  }

  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/sensors/${item.id}`, {
      method: "DELETE"
    });
    if (selectedSensor.value?.id === item.id) {
      selectedSensor.value = null;
    }
    if (editingSensorId.value === item.id) {
      resetForm();
    }
    message.value = "传感器已删除";
    await loadSensors();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

onMounted(async () => {
  await loadLookups();
  await loadSensors();
});

watch(
  () => form.sensorType,
  (value, previousValue) => {
    const previousUnit = metricUnit(metricOptions.value, previousValue);
    const nextUnit = metricUnit(metricOptions.value, value);
    if (!form.unitName || form.unitName === previousUnit) {
      form.unitName = nextUnit;
    }
  }
);
</script>
