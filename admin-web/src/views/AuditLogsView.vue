<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>操作日志</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadLogs">刷新</button>
        </div>
      </div>

      <div class="toolbar">
        <label class="filter-item">
          <span>模块</span>
          <select v-model="filters.moduleCode">
            <option value="">全部</option>
            <option v-for="item in moduleOptions" :key="item" :value="item">
              {{ item }}
            </option>
          </select>
        </label>
        <label class="filter-item">
          <span>结果</span>
          <select v-model="filters.resultStatus">
            <option value="">全部</option>
            <option value="success">{{ enumLabel("resultStatus", "success") }}</option>
            <option value="failed">{{ enumLabel("resultStatus", "failed") }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>操作人</span>
          <select v-model="filters.operatorUserId">
            <option value="">全部</option>
            <option v-for="user in users" :key="user.id" :value="user.id">
              {{ user.realName }} / {{ user.username }}
            </option>
          </select>
        </label>
        <label class="filter-item">
          <span>关键字</span>
          <input v-model="filters.keyword" type="text" placeholder="目标ID / 路径 / 结果" />
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadLogs">查询</button>
        </div>
      </div>

      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>模块</th>
            <th>动作</th>
            <th>操作人</th>
            <th>目标</th>
            <th>方法</th>
            <th>路径</th>
            <th>结果</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in logs" :key="item.id">
            <td>{{ formatDateTime(item.createdAt) }}</td>
            <td>{{ item.moduleCode }}</td>
            <td>{{ item.operationType }}</td>
            <td>{{ item.operatorName || "-" }}</td>
            <td>{{ item.targetType || "-" }} / {{ item.targetId || "-" }}</td>
            <td>{{ item.requestMethod || "-" }}</td>
            <td>{{ item.requestPath || "-" }}</td>
            <td><span class="tag" :class="item.resultStatus === 'success' ? 'tag-success' : 'tag-danger'">{{ enumLabel("resultStatus", item.resultStatus) }}</span></td>
            <td>{{ item.resultMessage || "-" }}</td>
          </tr>
          <tr v-if="!loading && logs.length === 0">
            <td colspan="9" class="empty-cell">暂无操作日志</td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="muted-text">正在加载操作日志...</div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatDateTime } from "../lib/format";

const loading = ref(false);
const errorMessage = ref("");
const logs = ref([]);
const users = ref([]);

const filters = reactive({
  moduleCode: "",
  resultStatus: "",
  operatorUserId: "",
  keyword: "",
  limit: 100
});

const moduleOptions = computed(() => {
  return Array.from(new Set(logs.value.map((item) => item.moduleCode).filter(Boolean))).sort();
});

function resetFilters() {
  filters.moduleCode = "";
  filters.resultStatus = "";
  filters.operatorUserId = "";
  filters.keyword = "";
  filters.limit = 100;
  loadLogs();
}

async function loadUsers() {
  try {
    users.value = await apiRequest("/api/v1/system/user-options");
  } catch {
    users.value = [];
  }
}

async function loadLogs() {
  loading.value = true;
  errorMessage.value = "";
  try {
    logs.value = await apiRequest(`/api/v1/system/audit-logs${buildQuery(filters)}`);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await loadUsers();
  await loadLogs();
});
</script>
