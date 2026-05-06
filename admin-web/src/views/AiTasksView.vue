<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>AI任务队列</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadTasks">刷新</button>
        </div>
      </div>

      <div class="toolbar">
        <label class="filter-item">
          <span>任务类型</span>
          <select v-model="filters.taskType">
            <option value="">全部</option>
            <option value="diagnosis">{{ enumLabel("taskType", "diagnosis") }}</option>
            <option value="report">{{ enumLabel("taskType", "report") }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>状态</span>
          <select v-model="filters.status">
            <option value="">全部</option>
            <option value="pending">{{ enumLabel("taskStatus", "pending") }}</option>
            <option value="queued">{{ enumLabel("taskStatus", "queued") }}</option>
            <option value="running">{{ enumLabel("taskStatus", "running") }}</option>
            <option value="success">{{ enumLabel("taskStatus", "success") }}</option>
            <option value="failed">{{ enumLabel("taskStatus", "failed") }}</option>
            <option value="deduped">{{ enumLabel("taskStatus", "deduped") }}</option>
            <option value="cancelled">{{ enumLabel("taskStatus", "cancelled") }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>触发方式</span>
          <select v-model="filters.triggerType">
            <option value="">全部</option>
            <option value="manual">{{ enumLabel("triggerType", "manual") }}</option>
            <option value="event">{{ enumLabel("triggerType", "event") }}</option>
            <option value="schedule">{{ enumLabel("triggerType", "schedule") }}</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadTasks">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table compact-table">
        <thead>
          <tr>
            <th>任务编号</th>
            <th>类型</th>
            <th>触发方式</th>
            <th>范围</th>
            <th>状态</th>
            <th>重试</th>
            <th>报告数</th>
            <th>完成时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in tasks" :key="item.id">
            <td>{{ item.taskNo }}</td>
            <td>{{ enumLabel("taskType", item.taskType) }}</td>
            <td>{{ enumLabel("triggerType", item.triggerType) }}</td>
            <td>{{ enumLabel("scopeType", item.scopeType) }}</td>
            <td><span class="tag" :class="statusClass(item.status)">{{ enumLabel("taskStatus", item.status) }}</span></td>
            <td>{{ item.retryCount }}/{{ item.maxRetryCount }}</td>
            <td>{{ item.reportCount }}</td>
            <td>{{ formatDateTime(item.completedAt) }}</td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click="loadTaskDetail(item.id)">详情</button>
                <button v-if="canRetry(item)" class="table-link" @click="retryTask(item.id)">重试</button>
                <button v-if="canCancel(item)" class="table-link" @click="cancelTask(item.id)">取消</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && tasks.length === 0">
            <td colspan="9" class="empty-cell">暂无任务数据</td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="muted-text">正在加载 AI 任务队列...</div>
    </section>

    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>任务详情</h2>
          <span class="tag tag-p2">{{ selectedTask?.taskNo || "未选择" }}</span>
        </div>

        <div v-if="selectedTask" class="stack">
          <div class="detail-grid">
            <div>
              <div class="detail-label">任务类型</div>
              <div class="detail-value">{{ enumLabel("taskType", selectedTask.taskType) }}</div>
            </div>
            <div>
              <div class="detail-label">触发方式</div>
              <div class="detail-value">{{ enumLabel("triggerType", selectedTask.triggerType) }}</div>
            </div>
            <div>
              <div class="detail-label">计划时间</div>
              <div class="detail-value">{{ formatDateTime(selectedTask.scheduledAt) }}</div>
            </div>
            <div>
              <div class="detail-label">完成时间</div>
              <div class="detail-value">{{ formatDateTime(selectedTask.completedAt) }}</div>
            </div>
          </div>
          <div class="detail-span">
            <div class="detail-label">去重键</div>
            <div class="detail-value">{{ selectedTask.dedupeKey || "-" }}</div>
          </div>
          <div class="detail-span">
            <div class="detail-label">错误信息</div>
            <div class="detail-value">{{ selectedTask.errorMessage || "-" }}</div>
          </div>
          <div class="detail-span">
            <div class="detail-label">任务载荷</div>
            <pre class="json-block">{{ formatJson(selectedTask.payloadJson) }}</pre>
          </div>
        </div>
        <div v-else class="empty-state">从列表选择一条任务查看详情。</div>
      </div>

      <div>
        <div class="panel-header">
          <h2>关联报告</h2>
          <span class="tag tag-p2">{{ selectedTask?.reports?.length || 0 }}</span>
        </div>

        <div v-if="selectedTask?.reports?.length" class="stack">
          <div v-for="report in selectedTask.reports" :key="report.id" class="detail-card">
            <div class="detail-label">{{ report.reportNo }}</div>
            <div class="detail-value">
              {{ enumLabel("reportType", report.reportType) }} / v{{ report.versionNo }} / {{ enumLabel("reportStatus", report.status) }}
            </div>
            <div class="detail-value muted-text">{{ formatDateTime(report.generatedAt) }}</div>
          </div>
        </div>
        <div v-else class="empty-state">当前任务还没有生成关联报告。</div>
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
const message = ref("");
const errorMessage = ref("");
const tasks = ref([]);
const selectedTask = ref(null);

const filters = reactive({
  taskType: "",
  status: "",
  triggerType: ""
});

const canTriggerDiagnosis = hasPermission("ai:trigger");
const canGenerateReport = hasPermission("ai:report_generate");

function statusClass(status) {
  if (status === "success") {
    return "tag-success";
  }
  if (["failed", "cancelled"].includes(status)) {
    return "tag-danger";
  }
  return "tag-warning";
}

function canRetry(item) {
  if (!item) {
    return false;
  }
  if (item.taskType === "diagnosis") {
    return canTriggerDiagnosis && ["failed", "cancelled", "deduped"].includes(item.status);
  }
  return canGenerateReport && ["failed", "cancelled", "deduped"].includes(item.status);
}

function canCancel(item) {
  if (!item) {
    return false;
  }
  if (item.taskType === "diagnosis") {
    return canTriggerDiagnosis && ["pending", "queued", "running", "failed", "deduped"].includes(item.status);
  }
  return canGenerateReport && ["pending", "queued", "running", "failed", "deduped"].includes(item.status);
}

function resetFilters() {
  filters.taskType = "";
  filters.status = "";
  filters.triggerType = "";
  loadTasks();
}

async function loadTasks() {
  loading.value = true;
  errorMessage.value = "";
  try {
    tasks.value = await apiRequest(`/api/v1/ai/tasks${buildQuery(filters)}`);
    if (!selectedTask.value && tasks.value[0]) {
      await loadTaskDetail(tasks.value[0].id);
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function loadTaskDetail(taskId) {
  errorMessage.value = "";
  try {
    selectedTask.value = await apiRequest(`/api/v1/ai/tasks/${taskId}`);
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function retryTask(taskId) {
  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/ai/tasks/${taskId}/retry`, {
      method: "POST",
      body: JSON.stringify({})
    });
    message.value = "任务已重试";
    await loadTasks();
    await loadTaskDetail(taskId);
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function cancelTask(taskId) {
  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/ai/tasks/${taskId}/cancel`, {
      method: "POST",
      body: JSON.stringify({})
    });
    message.value = "任务已取消";
    await loadTasks();
    await loadTaskDetail(taskId);
  } catch (error) {
    errorMessage.value = error.message;
  }
}

onMounted(loadTasks);
</script>
