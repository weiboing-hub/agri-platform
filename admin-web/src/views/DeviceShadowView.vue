<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>设备影子状态</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadShadows">刷新</button>
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
          <span>同步状态</span>
          <select v-model="filters.shadowStatus">
            <option value="">全部</option>
            <option value="sync">{{ enumLabel("shadowStatus", "sync") }}</option>
            <option value="pending">{{ enumLabel("shadowStatus", "pending") }}</option>
            <option value="drift">{{ enumLabel("shadowStatus", "drift") }}</option>
            <option value="unknown">{{ enumLabel("shadowStatus", "unknown") }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>网关在线状态</span>
          <select v-model="filters.onlineStatus">
            <option value="">全部</option>
            <option value="online">{{ enumLabel("onlineStatus", "online") }}</option>
            <option value="offline">{{ enumLabel("onlineStatus", "offline") }}</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadShadows">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table compact-table">
        <thead>
          <tr>
            <th>执行器</th>
            <th>区域</th>
            <th>平台期望</th>
            <th>设备回报</th>
            <th>当前判断</th>
            <th>在线状态</th>
            <th>漂移时长</th>
            <th>最后命令</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in shadowRows" :key="item.id">
            <td>{{ item.actuatorName }}</td>
            <td>{{ item.areaName || "-" }}</td>
            <td>{{ describeShadowState(item, "desired") }}</td>
            <td>{{ describeShadowState(item, "reported") }}</td>
            <td>
              <span class="tag" :class="shadowClass(item.shadowStatus)">
                {{ shadowSummary(item.shadowStatus) }}
              </span>
            </td>
            <td><span class="tag" :class="item.onlineStatus === 'online' ? 'tag-success' : 'tag-warning'">{{ item.onlineStatus ? enumLabel("onlineStatus", item.onlineStatus) : "-" }}</span></td>
            <td>{{ formatDriftSeconds(item.stateOffsetSeconds ?? item.driftSeconds ?? 0) }}</td>
            <td>{{ item.lastCommandId || "-" }}</td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click="selectShadow(item)">详情</button>
                <button v-if="canEdit" class="table-link" @click="resyncShadow(item)">重同步</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && shadowRows.length === 0">
            <td colspan="9" class="empty-cell">暂无设备影子状态数据</td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="muted-text">正在加载设备影子状态...</div>
    </section>

    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>状态详情</h2>
          <span class="tag tag-p2">{{ selectedShadow?.actuatorName || "未选择" }}</span>
        </div>

        <div v-if="selectedShadow" class="stack">
          <div class="shadow-highlight-grid">
            <article class="detail-card shadow-highlight-card">
              <div class="detail-label">平台期望</div>
              <div class="shadow-highlight-value">{{ describeShadowState(selectedShadow, "desired") }}</div>
              <div class="shadow-highlight-copy">平台最近一次下发后，希望设备保持的状态</div>
            </article>
            <article class="detail-card shadow-highlight-card">
              <div class="detail-label">设备回报</div>
              <div class="shadow-highlight-value">{{ describeShadowState(selectedShadow, "reported") }}</div>
              <div class="shadow-highlight-copy">设备当前最新回传到平台的状态</div>
            </article>
            <article class="detail-card shadow-highlight-card">
              <div class="detail-label">当前判断</div>
              <div class="shadow-highlight-value">{{ shadowSummary(selectedShadow.shadowStatus) }}</div>
              <div class="shadow-highlight-copy">{{ shadowMeaning(selectedShadow.shadowStatus) }}</div>
            </article>
            <article class="detail-card shadow-highlight-card">
              <div class="detail-label">漂移时长</div>
              <div class="shadow-highlight-value">{{ formatDriftSeconds(selectedShadow.driftSeconds ?? 0) }}</div>
              <div class="shadow-highlight-copy">期望与回报不一致时，失配已持续的时间</div>
            </article>
          </div>

          <div class="detail-grid">
            <div>
              <div class="detail-label">执行器类型</div>
              <div class="detail-value">{{ enumLabel("actuatorType", selectedShadow.actuatorType) }}</div>
            </div>
            <div>
              <div class="detail-label">运行模式</div>
              <div class="detail-value">{{ selectedShadow.runningMode ? enumLabel("runtimeMode", selectedShadow.runningMode) : "-" }}</div>
            </div>
            <div>
              <div class="detail-label">网关</div>
              <div class="detail-value">{{ selectedShadow.gatewayName || "-" }}</div>
            </div>
            <div>
              <div class="detail-label">补传状态</div>
              <div class="detail-value">{{ selectedShadow.backfillStatus ? enumLabel("backfillStatus", selectedShadow.backfillStatus) : "-" }}</div>
            </div>
            <div>
              <div class="detail-label">平台更新时间</div>
              <div class="detail-value">{{ formatDateTime(selectedShadow.desiredUpdatedAt) }}</div>
            </div>
            <div>
              <div class="detail-label">设备回报时间</div>
              <div class="detail-value">{{ formatDateTime(selectedShadow.reportedUpdatedAt) }}</div>
            </div>
            <div>
              <div class="detail-label">最后命令 ID</div>
              <div class="detail-value">{{ selectedShadow.lastCommandId || "-" }}</div>
            </div>
            <div>
              <div class="detail-label">网关在线状态</div>
              <div class="detail-value">{{ selectedShadow.onlineStatus ? enumLabel("onlineStatus", selectedShadow.onlineStatus) : "-" }}</div>
            </div>
          </div>

          <div class="detail-span">
            <div class="detail-label">最后命令结果</div>
            <div class="detail-value">{{ selectedShadow.lastCommandResult || "-" }}</div>
          </div>
          <details class="config-disclosure">
            <summary class="config-disclosure-summary">查看原始状态 JSON</summary>
            <div class="stack shadow-json-stack">
              <div class="detail-span">
                <div class="detail-label">期望状态 JSON</div>
                <pre class="json-block">{{ formatJson(selectedShadow.desiredStateJson) }}</pre>
              </div>
              <div class="detail-span">
                <div class="detail-label">实际状态 JSON</div>
                <pre class="json-block">{{ formatJson(selectedShadow.reportedStateJson) }}</pre>
              </div>
            </div>
          </details>
        </div>
        <div v-else class="empty-state">从列表选择一个执行器查看影子状态详情。</div>
      </div>

      <div>
        <div class="panel-header">
          <h2>运维提示</h2>
          <span class="tag tag-p2">ops</span>
        </div>
        <div class="stack">
          <div class="detail-card">
            <div class="detail-label">何时需要重同步</div>
            <div class="detail-value">当 `desired` 与 `reported` 长时间不一致，或者上次命令回执异常时，建议手动触发重同步。</div>
          </div>
          <div class="detail-card">
            <div class="detail-label">补传影响</div>
            <div class="detail-value">若网关处于补传状态，控制动作可能延迟。建议先观察 `backfillStatus` 和 `onlineStatus`。</div>
          </div>
          <div class="detail-card">
            <div class="detail-label">当前优先级</div>
            <div class="detail-value">优先处理 `drift` 和 `pending` 状态，尤其是处于 `online` 但长时间未同步的执行器。</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatDateTime, formatJson } from "../lib/format";
import { hasPermission } from "../lib/session";

const loading = ref(false);
const errorMessage = ref("");
const message = ref("");
const shadowRows = ref([]);
const selectedShadow = ref(null);
const areas = ref([]);

const filters = reactive({
  areaId: "",
  shadowStatus: "",
  onlineStatus: ""
});

const canEdit = hasPermission("device:edit");

function shadowClass(status) {
  if (status === "sync") {
    return "tag-success";
  }
  if (status === "pending") {
    return "tag-warning";
  }
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
  const textKey = type === "desired" ? item?.desiredStateText : item?.reportedStateText;
  const jsonKey = type === "desired" ? item?.desiredStateJson : item?.reportedStateJson;
  const textLabel = normalizePowerValue(textKey) || (textKey ? enumLabel("controlType", textKey) : "");
  if (textLabel && textLabel !== textKey) {
    return textLabel;
  }

  const state = parseStateJson(jsonKey);
  const powerLabel = normalizePowerValue(state?.power);
  if (powerLabel) {
    return powerLabel;
  }

  if (textKey) {
    return textKey;
  }

  if (state && typeof state === "object" && Object.keys(state).length > 0) {
    return "已记录复合状态";
  }

  return "未回传";
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
    return "平台期望与设备回报一致，当前不需要额外处理。";
  }
  if (status === "pending") {
    return "平台已下发目标状态，正在等待设备执行或回报。";
  }
  if (status === "drift") {
    return "平台期望与设备回报不一致，建议检查命令执行和设备在线状态。";
  }
  return "平台暂时无法确认设备是否与目标状态一致。";
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
  filters.shadowStatus = "";
  filters.onlineStatus = "";
  loadShadows();
}

function selectShadow(item) {
  selectedShadow.value = item;
}

async function loadLookups() {
  areas.value = await apiRequest("/api/v1/areas");
}

async function loadShadows() {
  loading.value = true;
  errorMessage.value = "";
  try {
    shadowRows.value = await apiRequest(`/api/v1/device-shadow${buildQuery(filters)}`);
    if (selectedShadow.value) {
      selectedShadow.value =
        shadowRows.value.find((item) => item.id === selectedShadow.value.id) || shadowRows.value[0] || null;
    } else if (shadowRows.value[0]) {
      selectedShadow.value = shadowRows.value[0];
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function resyncShadow(item) {
  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/device-shadow/${item.actuatorId}/resync`, {
      method: "POST",
      body: JSON.stringify({})
    });
    message.value = `${item.actuatorName} 已触发重同步`;
    await loadShadows();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

onMounted(async () => {
  await loadLookups();
  await loadShadows();
});
</script>
