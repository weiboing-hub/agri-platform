<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>手动控制</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="refreshAll">刷新</button>
        </div>
      </div>

      <section class="panel mobile-only mobile-field-panel">
        <div class="mobile-field-panel-head">
          <div>
            <div class="mobile-field-kicker">现场模式</div>
            <h2>控制面板</h2>
            <p class="panel-subtitle">{{ selectedAreaName }} · {{ selectedCommandStatusName }}</p>
          </div>
        </div>

        <div class="mobile-field-stat-grid">
          <article class="mobile-field-stat-card">
            <span class="mobile-field-stat-label">当前执行器</span>
            <strong class="mobile-field-stat-value">{{ actuators.length }}</strong>
            <small>{{ selectedActuator?.actuatorName || "未选执行器" }}</small>
          </article>
          <article class="mobile-field-stat-card">
            <span class="mobile-field-stat-label">状态失配</span>
            <strong class="mobile-field-stat-value">{{ driftCount }}</strong>
            <small>平台期望和设备回报不一致</small>
          </article>
          <article class="mobile-field-stat-card">
            <span class="mobile-field-stat-label">待执行命令</span>
            <strong class="mobile-field-stat-value">{{ queuedCommandCount }}</strong>
            <small>当前还在排队或待确认</small>
          </article>
          <article class="mobile-field-stat-card">
            <span class="mobile-field-stat-label">失败命令</span>
            <strong class="mobile-field-stat-value">{{ failedCommandCount }}</strong>
            <small>优先回看失败与急停记录</small>
          </article>
        </div>

        <div class="mobile-field-shortcuts">
          <RouterLink :to="dashboardLink" class="mobile-field-shortcut">返回工作台</RouterLink>
          <RouterLink :to="realtimeLink" class="mobile-field-shortcut">实时监控</RouterLink>
          <RouterLink :to="historyLink" class="mobile-field-shortcut">最近数据</RouterLink>
          <RouterLink :to="alertsLink" class="mobile-field-shortcut mobile-field-shortcut-strong">告警中心</RouterLink>
        </div>
      </section>

      <div class="mobile-only mobile-filter-summary">
        <div class="mobile-filter-summary-copy">
          <strong>当前筛选</strong>
          <span>{{ selectedAreaName }} · {{ selectedCommandStatusName }} · {{ selectedActuator?.actuatorName || "未选执行器" }}</span>
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
          <span>命令状态</span>
          <select v-model="commandStatus">
            <option value="">全部</option>
            <option value="queued">{{ enumLabel("commandStatus", "queued") }}</option>
            <option value="executed">{{ enumLabel("commandStatus", "executed") }}</option>
            <option value="failed">{{ enumLabel("commandStatus", "failed") }}</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="refreshAll">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <div class="mobile-only mobile-control-current-card">
        <div class="mobile-inline-detail-head">
          <div>
            <div class="mobile-inline-detail-title">{{ selectedActuator?.actuatorName || "请选择执行器" }}</div>
            <div class="mobile-inline-detail-subtitle">{{ selectedActuator?.areaName || "未绑定区域" }} · {{ selectedActuator?.gatewayName || "未绑定网关" }}</div>
          </div>
          <span class="tag tag-p0">{{ selectedActuator ? enumLabel("shadowStatus", selectedActuator.shadowStatus) : "待选择" }}</span>
        </div>

        <div class="mobile-inline-detail-grid">
          <article class="detail-card">
            <span class="detail-label">平台期望</span>
            <strong>{{ selectedActuator?.desiredStateText ? enumLabel("controlType", selectedActuator.desiredStateText) : "-" }}</strong>
            <small>当前目标状态</small>
          </article>
          <article class="detail-card">
            <span class="detail-label">设备回报</span>
            <strong>{{ selectedActuator?.reportedStateText ? enumLabel("controlType", selectedActuator.reportedStateText) : "-" }}</strong>
            <small>最新实际状态</small>
          </article>
          <article class="detail-card">
            <span class="detail-label">网关状态</span>
            <strong>{{ selectedActuator?.onlineStatus ? enumLabel("onlineStatus", selectedActuator.onlineStatus) : "-" }}</strong>
            <small>{{ selectedActuator?.backfillStatus ? `补传 ${enumLabel("backfillStatus", selectedActuator.backfillStatus)}` : "无补传状态" }}</small>
          </article>
        </div>

        <div class="mobile-control-quick-actions">
          <button class="mobile-control-quick-button" type="button" :disabled="controlSubmitDisabled" @click="submitQuickCommand('on')">
            <strong>一键开启</strong>
            <span>按当前默认时长直接下发</span>
          </button>
          <button class="mobile-control-quick-button" type="button" :disabled="controlSubmitDisabled" @click="submitQuickCommand('off')">
            <strong>一键关闭</strong>
            <span>关闭当前设备并回看回执</span>
          </button>
          <button class="mobile-control-quick-button danger-button" type="button" :disabled="controlSubmitDisabled" @click="submitQuickCommand('stop')">
            <strong>急停</strong>
            <span>立即停止当前执行器</span>
          </button>
        </div>

        <div class="detail-card control-safety-card">
          <div class="detail-label">控制前安全自检</div>
          <div class="detail-value">{{ controlSafetySummary }}</div>
          <div class="control-safety-list">
            <span
              v-for="item in controlSafetyChecks"
              :key="item.key"
              class="tag"
              :class="controlSafetyTagClass(item.status)"
            >
              {{ item.label }}
            </span>
          </div>
        </div>

        <form class="form-grid" @submit.prevent="submitCommand">
          <label class="form-item">
            <span>操作类型</span>
            <select v-model="commandForm.controlType" :disabled="!selectedActuator">
              <option value="on">开启</option>
              <option value="off">关闭</option>
              <option value="stop">停止</option>
            </select>
          </label>
          <label class="form-item">
            <span>持续秒数</span>
            <input v-model="commandForm.durationSeconds" :disabled="!selectedActuator" type="number" min="0" />
          </label>
          <label class="form-item">
            <span>强制执行</span>
            <select v-model="commandForm.forceExecute" :disabled="!selectedActuator">
              <option :value="false">否</option>
              <option :value="true">是</option>
            </select>
          </label>
          <label class="form-item form-span">
            <span>原因说明</span>
            <textarea v-model="commandForm.reasonText" :disabled="!selectedActuator" rows="3" placeholder="如：人工巡检临时灌溉" />
          </label>
          <div class="form-actions form-span">
            <button class="primary-button" :disabled="controlSubmitDisabled">
              {{ saving ? "提交中..." : "发送控制命令" }}
            </button>
          </div>
        </form>

        <div class="detail-card" v-if="selectedActuatorLastCommand">
          <div class="detail-label">最近控制回执</div>
          <div class="detail-value">
            {{ enumLabel("controlType", selectedActuatorLastCommand.controlType) }} ·
            {{ enumLabel("commandStatus", selectedActuatorLastCommand.requestStatus) }} /
            {{ selectedActuatorLastCommand.executionStatus ? enumLabel("resultStatus", selectedActuatorLastCommand.executionStatus) : "-" }}
          </div>
          <div class="mobile-inline-detail-copy">
            {{ formatDateTime(selectedActuatorLastCommand.queuedAt) }} · {{ selectedActuatorLastCommand.commandNo }}
          </div>
        </div>
      </div>

      <div class="mobile-only mobile-control-list">
        <button
          v-for="item in actuators"
          :key="item.id"
          type="button"
          class="mobile-control-item"
          :class="{ 'mobile-control-item-active': selectedActuator?.id === item.id }"
          @click="selectActuator(item)"
        >
          <div class="mobile-control-item-head">
            <strong>{{ item.actuatorName }}</strong>
            <span class="tag tag-p1">{{ enumLabel("shadowStatus", item.shadowStatus) }}</span>
          </div>
          <div class="mobile-control-item-meta">
            <span>{{ item.areaName || "未绑定区域" }}</span>
            <span>期望 {{ item.desiredStateText ? enumLabel("controlType", item.desiredStateText) : "-" }}</span>
            <span>回报 {{ item.reportedStateText ? enumLabel("controlType", item.reportedStateText) : "-" }}</span>
          </div>
        </button>
        <div v-if="!loading && actuators.length === 0" class="empty-sidebar-tip">暂无执行器数据</div>
      </div>

      <div class="split-panel mobile-control-desktop">
        <div>
          <div class="panel-header">
            <h3>执行器列表</h3>
          </div>
          <table class="simple-table compact-table">
            <thead>
              <tr>
                <th>执行器</th>
                <th>区域</th>
                <th>期望</th>
                <th>实际</th>
                <th>Shadow</th>
                <th>网关</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in actuators"
                :key="item.id"
                :class="{ 'table-row-active': selectedActuator?.id === item.id }"
                @click="selectActuator(item)"
              >
                <td>{{ item.actuatorName }}</td>
                <td>{{ item.areaName || "-" }}</td>
                <td>{{ item.desiredStateText ? enumLabel("controlType", item.desiredStateText) : "-" }}</td>
                <td>{{ item.reportedStateText ? enumLabel("controlType", item.reportedStateText) : "-" }}</td>
                <td>{{ enumLabel("shadowStatus", item.shadowStatus) }}</td>
                <td>{{ item.onlineStatus ? enumLabel("onlineStatus", item.onlineStatus) : "-" }}</td>
              </tr>
              <tr v-if="!loading && actuators.length === 0">
                <td colspan="6" class="empty-cell">暂无执行器数据</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <div class="panel-header">
            <h3>控制表单</h3>
            <span class="tag tag-p0">{{ selectedActuator?.actuatorName || "请选择执行器" }}</span>
          </div>
          <form class="form-grid" @submit.prevent="submitCommand">
            <label class="form-item">
              <span>操作类型</span>
              <select v-model="commandForm.controlType" :disabled="!selectedActuator">
                <option value="on">开启</option>
                <option value="off">关闭</option>
                <option value="stop">停止</option>
              </select>
            </label>
            <label class="form-item">
              <span>持续秒数</span>
              <input v-model="commandForm.durationSeconds" :disabled="!selectedActuator" type="number" min="0" />
            </label>
            <label class="form-item">
              <span>强制执行</span>
              <select v-model="commandForm.forceExecute" :disabled="!selectedActuator">
                <option :value="false">否</option>
                <option :value="true">是</option>
              </select>
            </label>
            <label class="form-item form-span">
              <span>原因说明</span>
              <textarea v-model="commandForm.reasonText" :disabled="!selectedActuator" rows="3" placeholder="如：人工巡检临时灌溉" />
            </label>
            <div class="detail-card form-span" v-if="selectedActuator">
              <div class="detail-label">当前设备状态</div>
              <div class="detail-value">
                期望 {{ selectedActuator.desiredStateText ? enumLabel("controlType", selectedActuator.desiredStateText) : "-" }} / 实际 {{ selectedActuator.reportedStateText ? enumLabel("controlType", selectedActuator.reportedStateText) : "-" }} /
                Shadow {{ enumLabel("shadowStatus", selectedActuator.shadowStatus) }} / 网关 {{ selectedActuator.onlineStatus ? enumLabel("onlineStatus", selectedActuator.onlineStatus) : "-" }} / 补传 {{ selectedActuator.backfillStatus ? enumLabel("backfillStatus", selectedActuator.backfillStatus) : "-" }}
              </div>
            </div>
            <div class="detail-card control-safety-card form-span" v-if="selectedActuator">
              <div class="detail-label">控制前安全自检</div>
              <div class="detail-value">{{ controlSafetySummary }}</div>
              <div class="control-safety-list">
                <span
                  v-for="item in controlSafetyChecks"
                  :key="item.key"
                  class="tag"
                  :class="controlSafetyTagClass(item.status)"
                >
                  {{ item.label }}
                </span>
              </div>
            </div>
            <div class="form-actions form-span">
              <button class="primary-button" :disabled="controlSubmitDisabled">
                {{ saving ? "提交中..." : "发送控制命令" }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>

    <section class="panel mobile-control-desktop">
      <div class="panel-header">
        <h2>控制记录</h2>
      </div>
      <table class="simple-table">
        <thead>
          <tr>
            <th>指令编号</th>
            <th>执行器</th>
            <th>控制类型</th>
            <th>来源</th>
            <th>请求状态</th>
            <th>执行结果</th>
            <th>结果说明</th>
            <th>补传中</th>
            <th>下发时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in commands" :key="item.id">
            <td>{{ item.commandNo }}</td>
            <td>{{ item.actuatorName || "-" }}</td>
            <td>{{ enumLabel("controlType", item.controlType) }}</td>
            <td>{{ enumLabel("triggerType", item.sourceType) }}</td>
            <td>{{ enumLabel("commandStatus", item.requestStatus) }}</td>
            <td>{{ item.executionStatus ? enumLabel("resultStatus", item.executionStatus) : "-" }}</td>
            <td>{{ item.executionResultMessage || item.reasonText || "-" }}</td>
            <td>{{ item.backfillInProgress ? "是" : "否" }}</td>
            <td>{{ formatDateTime(item.queuedAt) }}</td>
          </tr>
          <tr v-if="!commandLoading && commands.length === 0">
            <td colspan="9" class="empty-cell">暂无控制记录</td>
          </tr>
        </tbody>
      </table>
      <div v-if="commandLoading" class="muted-text">正在加载控制记录...</div>
    </section>

    <section class="panel mobile-only">
      <div class="panel-header">
        <h2>最近控制记录</h2>
      </div>
      <div class="mobile-control-log-list">
        <article v-for="item in commands" :key="item.id" class="detail-card">
          <span class="detail-label">{{ item.commandNo }}</span>
          <strong>{{ item.actuatorName || "-" }} · {{ enumLabel("controlType", item.controlType) }}</strong>
          <small>{{ enumLabel("commandStatus", item.requestStatus) }} / {{ item.executionStatus ? enumLabel("resultStatus", item.executionStatus) : "-" }}</small>
          <small>{{ item.executionResultMessage || item.reasonText || "暂无结果说明" }}</small>
          <small>{{ formatDateTime(item.queuedAt) }}</small>
        </article>
        <div v-if="!commandLoading && commands.length === 0" class="empty-sidebar-tip">暂无控制记录</div>
      </div>
      <div v-if="commandLoading" class="muted-text">正在加载控制记录...</div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatDateTime } from "../lib/format";

const loading = ref(false);
const commandLoading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const message = ref("");
const areas = ref([]);
const actuators = ref([]);
const commands = ref([]);
const selectedActuator = ref(null);
const commandStatus = ref("");
const route = useRoute();
const router = useRouter();

const filters = reactive({
  areaId: ""
});

const commandForm = reactive({
  controlType: "on",
  durationSeconds: 60,
  forceExecute: false,
  reasonText: ""
});

const selectedAreaName = computed(() => {
  if (!filters.areaId) {
    return "全部区域";
  }
  return areas.value.find((item) => String(item.id) === String(filters.areaId))?.areaName || "当前区域";
});

const selectedCommandStatusName = computed(() =>
  commandStatus.value ? enumLabel("commandStatus", commandStatus.value) : "全部状态"
);
const driftCount = computed(() => actuators.value.filter((item) => item.shadowStatus === "drift").length);
const queuedCommandCount = computed(() =>
  commands.value.filter((item) => ["queued", "sent", "acknowledged"].includes(item.requestStatus)).length
);
const failedCommandCount = computed(() =>
  commands.value.filter((item) => item.requestStatus === "failed" || item.executionStatus === "failed").length
);
const selectedActuatorLastCommand = computed(() =>
  selectedActuator.value?.id
    ? commands.value.find((item) => item.actuatorId === selectedActuator.value.id) || null
    : null
);
const controlSafetyChecks = computed(() => {
  const actuator = selectedActuator.value;
  if (!actuator) {
    return [
      { key: "select", label: "未选择执行器", status: "warning" }
    ];
  }
  return [
    {
      key: "gateway",
      label: actuator.onlineStatus === "online" ? "网关在线" : "网关离线",
      status: actuator.onlineStatus === "online" ? "ok" : "error"
    },
    {
      key: "backfill",
      label: actuator.backfillStatus === "running" ? "补传中" : "无补传阻塞",
      status: actuator.backfillStatus === "running" ? "warning" : "ok"
    },
    {
      key: "shadow",
      label: actuator.shadowStatus === "pending" ? "已有待执行命令" : `Shadow ${enumLabel("shadowStatus", actuator.shadowStatus)}`,
      status: actuator.shadowStatus === "pending" ? "warning" : "ok"
    },
    {
      key: "force",
      label: commandForm.forceExecute ? "强制执行已启用" : "普通控制",
      status: commandForm.forceExecute ? "warning" : "ok"
    }
  ];
});
const controlSafetyBlocked = computed(() =>
  !commandForm.forceExecute && controlSafetyChecks.value.some((item) => item.status === "error" || item.key === "backfill" && item.status === "warning" || item.key === "shadow" && item.status === "warning")
);
const forceReasonMissing = computed(() => commandForm.forceExecute && !String(commandForm.reasonText || "").trim());
const controlSubmitDisabled = computed(() =>
  saving.value || !selectedActuator.value || controlSafetyBlocked.value || forceReasonMissing.value
);
const controlSafetySummary = computed(() => {
  if (!selectedActuator.value) {
    return "请选择执行器后再下发控制命令。";
  }
  if (forceReasonMissing.value) {
    return "强制执行必须填写原因说明，便于后续审计。";
  }
  if (controlSafetyBlocked.value) {
    return "当前存在安全阻塞。确认现场安全后，可启用强制执行并填写原因。";
  }
  if (commandForm.forceExecute) {
    return "强制执行已启用，命令会绕过离线、补传或待执行阻塞校验。";
  }
  return "当前可按普通控制下发命令。";
});
const dashboardLink = computed(() => ({ path: "/dashboard/overview", query: filters.areaId ? { areaId: String(filters.areaId) } : {} }));
const realtimeLink = computed(() => ({ path: "/monitor/realtime", query: filters.areaId ? { areaId: String(filters.areaId) } : {} }));
const historyLink = computed(() => ({ path: "/monitor/history", query: filters.areaId ? { areaId: String(filters.areaId) } : {} }));
const alertsLink = computed(() => ({ path: "/alerts/center", query: filters.areaId ? { areaId: String(filters.areaId) } : {} }));

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
  commandStatus.value = firstQueryValue(route.query.status) || "";
}

function syncRouteQuery() {
  const query = {};
  if (filters.areaId) query.areaId = String(filters.areaId);
  if (commandStatus.value) query.status = String(commandStatus.value);
  if (selectedActuator.value?.id) query.actuatorId = String(selectedActuator.value.id);
  router.replace({ query }).catch(() => {});
}

function resetFilters() {
  filters.areaId = "";
  commandStatus.value = "";
  refreshAll();
}

function selectActuator(item) {
  selectedActuator.value = item;
  syncRouteQuery();
}

function controlSafetyTagClass(status) {
  if (status === "ok") {
    return "tag-success";
  }
  if (status === "error") {
    return "tag-danger";
  }
  return "tag-warning";
}

async function loadAreas() {
  areas.value = await apiRequest("/api/v1/areas");
}

async function loadActuators() {
  loading.value = true;
  errorMessage.value = "";
  try {
    actuators.value = await apiRequest(`/api/v1/actuators${buildQuery(filters)}`);
    const routeActuatorId = readNumberQuery(route.query.actuatorId);
    if (routeActuatorId) {
      selectedActuator.value = actuators.value.find((item) => item.id === routeActuatorId) || actuators.value[0] || null;
    } else if (!selectedActuator.value && actuators.value[0]) {
      selectedActuator.value = actuators.value[0];
    } else if (selectedActuator.value) {
      selectedActuator.value = actuators.value.find((item) => item.id === selectedActuator.value.id) || actuators.value[0] || null;
    }
    syncRouteQuery();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function loadCommands() {
  commandLoading.value = true;
  errorMessage.value = "";
  try {
    commands.value = await apiRequest(
      `/api/v1/controls/commands${buildQuery({
        areaId: filters.areaId,
        status: commandStatus.value
      })}`
    );
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    commandLoading.value = false;
  }
}

async function refreshAll() {
  await Promise.all([loadActuators(), loadCommands()]);
}

async function submitCommand() {
  if (!selectedActuator.value) {
    return;
  }
  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest("/api/v1/controls/commands", {
      method: "POST",
      body: JSON.stringify({
        actuatorId: selectedActuator.value.id,
        controlType: commandForm.controlType,
        durationSeconds: commandForm.durationSeconds,
        forceExecute: commandForm.forceExecute,
        reasonText: commandForm.reasonText
      })
    });
    message.value = "控制命令已入队";
    commandForm.reasonText = "";
    await refreshAll();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

async function submitQuickCommand(controlType) {
  if (!selectedActuator.value || saving.value) {
    return;
  }

  const actionLabel = enumLabel("controlType", controlType);
  if (!window.confirm(`确认对“${selectedActuator.value.actuatorName}”执行${actionLabel}吗？`)) {
    return;
  }

  commandForm.controlType = controlType;
  if (controlType !== "on") {
    commandForm.durationSeconds = 0;
  }
  if (!commandForm.reasonText) {
    commandForm.reasonText = `手机现场${actionLabel}`;
  }
  await submitCommand();
}

onMounted(async () => {
  hydrateFiltersFromRoute();
  await loadAreas();
  await refreshAll();
});
</script>
