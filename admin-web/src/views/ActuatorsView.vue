<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>执行器管理</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadActuators">刷新</button>
          <button v-if="canEdit" class="primary-button" @click="startCreate">新增执行器</button>
        </div>
      </div>

      <div class="metric-strip actuator-summary-strip">
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ actuators.length }}</div>
          <div class="stat-desc">当前执行器</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ syncCount }}</div>
          <div class="stat-desc">状态一致</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ pendingCount }}</div>
          <div class="stat-desc">等待同步</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ driftCount }}</div>
          <div class="stat-desc">状态失配</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ controllableCount }}</div>
          <div class="stat-desc">控制可用</div>
        </article>
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
          <select v-model="filters.actuatorType">
            <option value="">全部</option>
            <option value="water_pump">{{ enumLabel("actuatorType", "water_pump") }}</option>
            <option value="valve">{{ enumLabel("actuatorType", "valve") }}</option>
            <option value="fan">{{ enumLabel("actuatorType", "fan") }}</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadActuators">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table desktop-table-only">
        <thead>
          <tr>
            <th>编号</th>
            <th>执行器</th>
            <th>区域</th>
            <th>平台期望</th>
            <th>设备回报</th>
            <th>当前判断</th>
            <th>网关在线</th>
            <th>控制可用性</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in actuators" :key="item.id">
            <td>{{ item.actuatorCode }}</td>
            <td>
              <div class="table-primary-cell">
                <strong>{{ item.actuatorName }}</strong>
                <span>{{ enumLabel("actuatorType", item.actuatorType) }}</span>
              </div>
            </td>
            <td>{{ item.areaName || "-" }}</td>
            <td>{{ describeActuatorState(item, "desired") }}</td>
            <td>{{ describeActuatorState(item, "reported") }}</td>
            <td><span class="tag" :class="shadowClass(item.shadowStatus)">{{ shadowSummary(item.shadowStatus) }}</span></td>
            <td><span class="tag" :class="item.onlineStatus === 'online' ? 'tag-success' : 'tag-warning'">{{ item.onlineStatus ? enumLabel("onlineStatus", item.onlineStatus) : "-" }}</span></td>
            <td>{{ item.controlAvailability ? enumLabel("status", item.controlAvailability) : "-" }}</td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click="loadShadow(item)">影子</button>
                <button v-if="canEdit" class="table-link" @click="startEdit(item)">编辑</button>
                <button v-if="canDelete" class="table-link" @click="deleteActuator(item)">删除</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && actuators.length === 0">
            <td colspan="10" class="empty-cell">暂无执行器数据</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!loading && actuators.length > 0" class="responsive-card-list tablet-card-list">
        <article
          v-for="item in actuators"
          :key="item.id"
          class="responsive-entity-card"
          :class="{ active: shadowDetail?.actuatorId === item.id || editingActuatorId === item.id }"
        >
          <div class="responsive-card-head">
            <div class="table-primary-cell">
              <strong>{{ item.actuatorName }}</strong>
              <span>{{ item.actuatorCode }} · {{ enumLabel("actuatorType", item.actuatorType) }}</span>
            </div>
            <div class="responsive-card-tags">
              <span class="tag" :class="shadowClass(item.shadowStatus)">{{ shadowSummary(item.shadowStatus) }}</span>
            </div>
          </div>
          <div class="responsive-card-grid">
            <div class="responsive-card-field">
              <span>区域</span>
              <strong>{{ item.areaName || "-" }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>平台期望</span>
              <strong>{{ describeActuatorState(item, "desired") }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>设备回报</span>
              <strong>{{ describeActuatorState(item, "reported") }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>网关在线</span>
              <strong>{{ item.onlineStatus ? enumLabel("onlineStatus", item.onlineStatus) : "-" }}</strong>
            </div>
            <div class="responsive-card-field responsive-card-field-full">
              <span>控制可用性</span>
              <strong>{{ item.controlAvailability ? enumLabel("status", item.controlAvailability) : "-" }}</strong>
            </div>
          </div>
          <div class="responsive-card-actions">
            <button class="ghost-button" @click="loadShadow(item)">影子</button>
            <button v-if="canEdit" class="ghost-button" @click="startEdit(item)">编辑</button>
            <button v-if="canDelete" class="ghost-button danger-button" @click="deleteActuator(item)">删除</button>
          </div>
        </article>
      </div>
      <div v-if="!loading && actuators.length === 0" class="empty-state tablet-card-empty">暂无执行器数据</div>
      <div v-if="loading" class="muted-text">正在加载执行器数据...</div>
    </section>

    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>{{ editingActuatorId ? "编辑执行器" : "新增执行器" }}</h2>
          <span class="tag tag-p0">P0</span>
        </div>
        <div class="detail-card actuator-form-tip">
          <div class="detail-label">表单说明</div>
          <div class="detail-value">
            这里维护执行器主档和联调初始状态。实际运行时，重点还是看右侧影子状态是否与平台目标一致。
          </div>
        </div>
        <form class="form-grid" @submit.prevent="saveActuator">
          <label class="form-item">
            <span>执行器编号</span>
            <input v-model="form.actuatorCode" type="text" :disabled="Boolean(editingActuatorId)" />
          </label>
          <label class="form-item">
            <span>执行器名称</span>
            <input v-model="form.actuatorName" type="text" />
          </label>
          <label class="form-item">
            <span>类型</span>
            <select v-model="form.actuatorType">
              <option value="water_pump">{{ enumLabel("actuatorType", "water_pump") }}</option>
              <option value="valve">{{ enumLabel("actuatorType", "valve") }}</option>
              <option value="fan">{{ enumLabel("actuatorType", "fan") }}</option>
            </select>
          </label>
          <label class="form-item">
            <span>控制通道</span>
            <input v-model="form.controlChannel" type="text" />
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
            <span>平台期望状态</span>
            <input v-model="form.desiredStateText" type="text" placeholder="off / on" />
          </label>
          <label class="form-item">
            <span>设备回报状态</span>
            <input v-model="form.reportedStateText" type="text" placeholder="off / on" />
          </label>
          <label class="form-item">
            <span>同步状态</span>
            <select v-model="form.shadowStatus">
              <option value="unknown">{{ enumLabel("shadowStatus", "unknown") }}</option>
              <option value="sync">{{ enumLabel("shadowStatus", "sync") }}</option>
              <option value="pending">{{ enumLabel("shadowStatus", "pending") }}</option>
              <option value="drift">{{ enumLabel("shadowStatus", "drift") }}</option>
            </select>
          </label>
          <label class="form-item">
            <span>最大运行秒数</span>
            <input v-model="form.maxRunSeconds" type="number" min="0" />
          </label>
          <label class="form-item">
            <span>互斥组</span>
            <input v-model="form.mutexGroup" type="text" />
          </label>
          <label class="form-item">
            <span>运行模式</span>
            <select v-model="form.runningMode">
              <option value="manual">{{ enumLabel("runtimeMode", "manual") }}</option>
              <option value="auto">{{ enumLabel("runtimeMode", "auto") }}</option>
            </select>
          </label>
          <label class="form-item">
            <span>状态</span>
            <select v-model="form.status">
              <option value="enabled">{{ enumLabel("status", "enabled") }}</option>
              <option value="disabled">{{ enumLabel("status", "disabled") }}</option>
            </select>
          </label>
          <label class="form-item form-span">
            <span>备注</span>
            <textarea v-model="form.remark" rows="3" />
          </label>
          <div class="form-actions form-span">
            <button class="ghost-button" type="button" @click="resetForm">清空</button>
            <button class="primary-button" :disabled="saving || !canEdit">
              {{ saving ? "保存中..." : editingActuatorId ? "保存修改" : "创建执行器" }}
            </button>
          </div>
        </form>
      </div>

      <div>
        <div class="panel-header">
          <h2>设备影子状态</h2>
          <span class="tag tag-p1">{{ shadowDetail?.actuatorName || "未选择" }}</span>
        </div>
        <div v-if="shadowDetail" class="stack">
          <div class="shadow-highlight-grid">
            <article class="detail-card shadow-highlight-card">
              <div class="detail-label">平台期望</div>
              <div class="shadow-highlight-value">{{ describeShadowState(shadowDetail, "desired") }}</div>
              <div class="shadow-highlight-copy">平台最近一次命令后，希望设备保持的状态</div>
            </article>
            <article class="detail-card shadow-highlight-card">
              <div class="detail-label">设备回报</div>
              <div class="shadow-highlight-value">{{ describeShadowState(shadowDetail, "reported") }}</div>
              <div class="shadow-highlight-copy">设备最新回传给平台的状态</div>
            </article>
            <article class="detail-card shadow-highlight-card">
              <div class="detail-label">当前判断</div>
              <div class="shadow-highlight-value">{{ shadowSummary(shadowDetail.shadowStatus) }}</div>
              <div class="shadow-highlight-copy">{{ shadowMeaning(shadowDetail.shadowStatus) }}</div>
            </article>
            <article class="detail-card shadow-highlight-card">
              <div class="detail-label">漂移时长</div>
              <div class="shadow-highlight-value">{{ formatDriftSeconds(shadowDetail.driftSeconds ?? 0) }}</div>
              <div class="shadow-highlight-copy">平台期望和设备回报不一致时，失配已持续的时间</div>
            </article>
          </div>
          <div class="detail-grid">
            <div>
              <div class="detail-label">最后命令 ID</div>
              <div class="detail-value">{{ shadowDetail.lastCommandId || "-" }}</div>
            </div>
            <div>
              <div class="detail-label">最后命令结果</div>
              <div class="detail-value">{{ shadowDetail.lastCommandResult || "-" }}</div>
            </div>
          </div>
          <details class="config-disclosure">
            <summary class="config-disclosure-summary">查看原始状态 JSON</summary>
            <div class="stack shadow-json-stack">
              <div class="detail-span">
                <div class="detail-label">期望状态 JSON</div>
                <pre class="json-block">{{ formatJson(shadowDetail.desiredStateJson) }}</pre>
              </div>
              <div class="detail-span">
                <div class="detail-label">实际状态 JSON</div>
                <pre class="json-block">{{ formatJson(shadowDetail.reportedStateJson) }}</pre>
              </div>
            </div>
          </details>
        </div>
        <div v-else class="empty-state">从列表选择一个执行器查看影子状态。</div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatJson } from "../lib/format";
import { hasPermission } from "../lib/session";

const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const message = ref("");
const areas = ref([]);
const gateways = ref([]);
const actuators = ref([]);
const shadowDetail = ref(null);
const editingActuatorId = ref(null);

const filters = reactive({
  areaId: "",
  actuatorType: ""
});

const form = reactive({
  actuatorCode: "",
  actuatorName: "",
  actuatorType: "water_pump",
  gatewayId: "",
  areaId: "",
  controlChannel: "",
  desiredStateText: "off",
  reportedStateText: "off",
  shadowStatus: "unknown",
  maxRunSeconds: "",
  mutexGroup: "",
  runningMode: "manual",
  status: "enabled",
  remark: ""
});

const canEdit = hasPermission("device:edit");
const canDelete = hasPermission("device:delete");
const syncCount = computed(() => actuators.value.filter((item) => item.shadowStatus === "sync").length);
const pendingCount = computed(() => actuators.value.filter((item) => item.shadowStatus === "pending").length);
const driftCount = computed(() => actuators.value.filter((item) => item.shadowStatus === "drift").length);
const controllableCount = computed(() => actuators.value.filter((item) => item.controlAvailability === "enabled").length);

function shadowClass(status) {
  if (status === "sync") return "tag-success";
  if (status === "pending") return "tag-warning";
  return "tag-danger";
}

function parseStateJson(value) {
  if (!value) {
    return null;
  }
  if (typeof value === "object") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizePowerValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (["on", "open", "start", "running", "run", "1", "true"].includes(normalized)) {
    return "开启";
  }
  if (["off", "close", "stop", "stopped", "0", "false"].includes(normalized)) {
    return "关闭";
  }
  return "";
}

function describeShadowState(item, type) {
  const raw = type === "desired" ? item?.desiredStateJson : item?.reportedStateJson;
  const state = parseStateJson(raw);
  const powerLabel = normalizePowerValue(state?.power);
  if (powerLabel) {
    return powerLabel;
  }
  if (state && typeof state === "object" && Object.keys(state).length > 0) {
    return "已记录复合状态";
  }
  return "未回传";
}

function describeActuatorState(item, type) {
  const textValue = type === "desired" ? item?.desiredStateText : item?.reportedStateText;
  const textLabel = normalizePowerValue(textValue);
  if (textLabel) {
    return textLabel;
  }
  const jsonLabel = describeShadowState(item, type);
  if (jsonLabel !== "未回传") {
    return jsonLabel;
  }
  return textValue || "未回传";
}

function shadowSummary(status) {
  if (status === "sync") {
    return "状态一致";
  }
  if (status === "pending") {
    return "等待同步";
  }
  if (status === "drift") {
    return "状态失配";
  }
  return "状态未知";
}

function shadowMeaning(status) {
  if (status === "sync") {
    return "平台期望与设备回报一致，当前无需额外处理。";
  }
  if (status === "pending") {
    return "平台已下发状态，正在等待设备执行或回报。";
  }
  if (status === "drift") {
    return "平台期望与设备回报不一致，建议排查命令执行与设备在线状态。";
  }
  return "平台暂时无法确认该执行器是否与目标状态一致。";
}

function formatDriftSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0 秒";
  }
  if (seconds < 60) {
    return `${seconds} 秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  if (minutes < 60) {
    return remainSeconds ? `${minutes} 分 ${remainSeconds} 秒` : `${minutes} 分`;
  }
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return remainMinutes ? `${hours} 小时 ${remainMinutes} 分` : `${hours} 小时`;
}

function resetFilters() {
  filters.areaId = "";
  filters.actuatorType = "";
  loadActuators();
}

function resetForm() {
  editingActuatorId.value = null;
  form.actuatorCode = "";
  form.actuatorName = "";
  form.actuatorType = "water_pump";
  form.gatewayId = "";
  form.areaId = "";
  form.controlChannel = "";
  form.desiredStateText = "off";
  form.reportedStateText = "off";
  form.shadowStatus = "unknown";
  form.maxRunSeconds = "";
  form.mutexGroup = "";
  form.runningMode = "manual";
  form.status = "enabled";
  form.remark = "";
}

function startCreate() {
  resetForm();
  message.value = "";
  errorMessage.value = "";
}

function startEdit(item) {
  editingActuatorId.value = item.id;
  form.actuatorCode = item.actuatorCode;
  form.actuatorName = item.actuatorName;
  form.actuatorType = item.actuatorType || "water_pump";
  form.gatewayId = item.gatewayId || "";
  form.areaId = item.areaId || "";
  form.controlChannel = item.controlChannel || "";
  form.desiredStateText = item.desiredStateText || "";
  form.reportedStateText = item.reportedStateText || "";
  form.shadowStatus = item.shadowStatus || "unknown";
  form.maxRunSeconds = item.maxRunSeconds ?? "";
  form.mutexGroup = item.mutexGroup || "";
  form.runningMode = item.runningMode || "manual";
  form.status = item.status || "enabled";
  form.remark = item.remark || "";
}

async function loadLookups() {
  const [areaRows, gatewayRows] = await Promise.all([
    apiRequest("/api/v1/areas"),
    apiRequest("/api/v1/gateways")
  ]);
  areas.value = areaRows;
  gateways.value = gatewayRows;
}

async function loadActuators() {
  loading.value = true;
  errorMessage.value = "";
  try {
    actuators.value = await apiRequest(`/api/v1/actuators${buildQuery(filters)}`);
    if (!shadowDetail.value && actuators.value[0]) {
      await loadShadow(actuators.value[0]);
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function loadShadow(item) {
  errorMessage.value = "";
  try {
    shadowDetail.value = await apiRequest(`/api/v1/actuators/${item.id}/shadow`);
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function saveActuator() {
  if (!canEdit) {
    return;
  }
  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const payload = {
      actuatorCode: form.actuatorCode,
      actuatorName: form.actuatorName,
      actuatorType: form.actuatorType,
      gatewayId: form.gatewayId || null,
      areaId: form.areaId || null,
      controlChannel: form.controlChannel,
      desiredStateText: form.desiredStateText,
      reportedStateText: form.reportedStateText,
      shadowStatus: form.shadowStatus,
      maxRunSeconds: form.maxRunSeconds === "" ? null : Number(form.maxRunSeconds),
      mutexGroup: form.mutexGroup,
      runningMode: form.runningMode,
      status: form.status,
      remark: form.remark
    };

    if (editingActuatorId.value) {
      await apiRequest(`/api/v1/actuators/${editingActuatorId.value}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      message.value = "执行器已更新";
    } else {
      await apiRequest("/api/v1/actuators", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      message.value = "执行器已创建";
    }
    resetForm();
    await loadActuators();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

async function deleteActuator(item) {
  if (!canDelete) {
    return;
  }
  const confirmed = window.confirm(`确认删除执行器“${item.actuatorName}”吗？`);
  if (!confirmed) {
    return;
  }

  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/actuators/${item.id}`, {
      method: "DELETE"
    });
    if (shadowDetail.value?.actuatorId === item.id) {
      shadowDetail.value = null;
    }
    if (editingActuatorId.value === item.id) {
      resetForm();
    }
    message.value = "执行器已删除";
    await loadActuators();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

onMounted(async () => {
  await loadLookups();
  await loadActuators();
});
</script>
