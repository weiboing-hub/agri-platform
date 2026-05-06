<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>控制记录</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadCommands">刷新</button>
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
          <span>请求状态</span>
          <select v-model="filters.status">
            <option value="">全部</option>
            <option value="queued">{{ enumLabel("commandStatus", "queued") }}</option>
            <option value="executed">{{ enumLabel("commandStatus", "executed") }}</option>
            <option value="failed">{{ enumLabel("commandStatus", "failed") }}</option>
            <option value="cancelled">{{ enumLabel("commandStatus", "cancelled") }}</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadCommands">查询</button>
        </div>
      </div>

      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table">
        <thead>
          <tr>
            <th>指令编号</th>
            <th>执行器</th>
            <th>来源</th>
            <th>控制类型</th>
            <th>持续秒数</th>
            <th>请求状态</th>
            <th>执行状态</th>
            <th>补传中</th>
            <th>排队时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in commands" :key="item.id">
            <td>{{ item.commandNo }}</td>
            <td>{{ item.actuatorName || "-" }}</td>
            <td>{{ enumLabel("triggerType", item.sourceType) }}</td>
            <td>{{ enumLabel("controlType", item.controlType) }}</td>
            <td>{{ item.durationSeconds ?? "-" }}</td>
            <td><span class="tag" :class="statusClass(item.requestStatus)">{{ enumLabel("commandStatus", item.requestStatus) }}</span></td>
            <td>{{ item.executionStatus ? enumLabel("resultStatus", item.executionStatus) : "-" }}</td>
            <td>{{ item.backfillInProgress ? "是" : "否" }}</td>
            <td>{{ formatDateTime(item.queuedAt) }}</td>
            <td>
              <button class="table-link" @click="selectCommand(item)">详情</button>
            </td>
          </tr>
          <tr v-if="!loading && commands.length === 0">
            <td colspan="10" class="empty-cell">暂无控制记录</td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="muted-text">正在加载控制记录...</div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2>记录详情</h2>
        <span class="tag tag-p1">{{ selectedCommand?.commandNo || "未选择" }}</span>
      </div>
      <div v-if="selectedCommand" class="detail-grid">
        <div>
          <div class="detail-label">区域</div>
          <div class="detail-value">{{ selectedCommand.areaName || "-" }}</div>
        </div>
        <div>
          <div class="detail-label">发起人</div>
          <div class="detail-value">{{ selectedCommand.requestedByName || "-" }}</div>
        </div>
        <div>
          <div class="detail-label">强制执行</div>
          <div class="detail-value">{{ selectedCommand.forceExecute ? "是" : "否" }}</div>
        </div>
        <div>
          <div class="detail-label">设备在线</div>
          <div class="detail-value">{{ selectedCommand.deviceOnline ? "是" : "否" }}</div>
        </div>
        <div>
          <div class="detail-label">发送时间</div>
          <div class="detail-value">{{ formatDateTime(selectedCommand.sentAt) }}</div>
        </div>
        <div>
          <div class="detail-label">完成时间</div>
          <div class="detail-value">{{ formatDateTime(selectedCommand.completedAt) }}</div>
        </div>
        <div class="detail-span">
          <div class="detail-label">原因说明</div>
          <div class="detail-value">{{ selectedCommand.reasonText || "-" }}</div>
        </div>
        <div class="detail-span">
          <div class="detail-label">执行结果</div>
          <div class="detail-value">{{ selectedCommand.executionResultMessage || "-" }}</div>
        </div>
      </div>
      <div v-else class="empty-state">从列表选择一条控制记录查看详情。</div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatDateTime } from "../lib/format";

const loading = ref(false);
const errorMessage = ref("");
const areas = ref([]);
const commands = ref([]);
const selectedCommand = ref(null);

const filters = reactive({
  areaId: "",
  status: ""
});

function statusClass(status) {
  if (status === "executed") return "tag-success";
  if (status === "queued" || status === "sent" || status === "acknowledged") return "tag-warning";
  return "tag-danger";
}

function resetFilters() {
  filters.areaId = "";
  filters.status = "";
  loadCommands();
}

function selectCommand(item) {
  selectedCommand.value = item;
}

async function loadAreas() {
  areas.value = await apiRequest("/api/v1/areas");
}

async function loadCommands() {
  loading.value = true;
  errorMessage.value = "";
  try {
    commands.value = await apiRequest(`/api/v1/controls/commands${buildQuery(filters)}`);
    if (!selectedCommand.value && commands.value[0]) {
      selectedCommand.value = commands.value[0];
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await loadAreas();
  await loadCommands();
});
</script>
