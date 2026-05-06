<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>AI诊断</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadDiagnoses">刷新</button>
          <button v-if="canTrigger" class="primary-button" @click="submitDiagnosis" :disabled="submitting">
            {{ submitting ? "提交中..." : "发起诊断" }}
          </button>
        </div>
      </div>

      <div class="toolbar">
        <label class="filter-item">
          <span>关键字</span>
          <input v-model="filters.keyword" type="text" placeholder="报告编号 / 摘要" />
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
        <label class="filter-item">
          <span>生成状态</span>
          <select v-model="filters.status">
            <option value="">全部</option>
            <option value="generated">{{ enumLabel("reportStatus", "generated") }}</option>
            <option value="failed">{{ enumLabel("reportStatus", "failed") }}</option>
            <option value="cancelled">{{ enumLabel("reportStatus", "cancelled") }}</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadDiagnoses">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table compact-table">
        <thead>
          <tr>
            <th>诊断编号</th>
            <th>触发方式</th>
            <th>覆盖范围</th>
            <th>关联告警</th>
            <th>风险等级</th>
            <th>版本</th>
            <th>生成时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in diagnoses" :key="item.id">
            <td>{{ item.reportNo }}</td>
            <td>{{ enumLabel("triggerType", item.triggerType) }}</td>
            <td>{{ item.scopeSummary }}</td>
            <td>{{ item.relatedAlertCount }}</td>
            <td><span class="tag" :class="riskClass(item.riskLevel)">{{ enumLabel("riskLevel", item.riskLevel) }}</span></td>
            <td>v{{ item.versionNo }}</td>
            <td>{{ formatDateTime(item.generatedAt) }}</td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click="loadDiagnosisDetail(item.id)">详情</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && diagnoses.length === 0">
            <td colspan="8" class="empty-cell">暂无诊断数据</td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="muted-text">正在加载 AI 诊断...</div>
    </section>

    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>诊断任务配置</h2>
          <span class="tag tag-p1">P1</span>
        </div>

        <form class="form-grid" @submit.prevent="submitDiagnosis">
          <label class="form-item">
            <span>触发方式</span>
            <select v-model="form.triggerType">
              <option value="manual">{{ enumLabel("triggerType", "manual") }}</option>
              <option value="event">{{ enumLabel("triggerType", "event") }}</option>
              <option value="schedule">{{ enumLabel("triggerType", "schedule") }}</option>
            </select>
          </label>
          <label class="form-item">
            <span>范围类型</span>
            <select v-model="form.scopeType">
              <option value="area">{{ enumLabel("scopeType", "area") }}</option>
              <option value="device">{{ enumLabel("scopeType", "device") }}</option>
              <option value="global">{{ enumLabel("scopeType", "global") }}</option>
            </select>
          </label>
          <label class="form-item">
            <span>范围 ID 列表</span>
            <input v-model="form.scopeIdsText" type="text" placeholder="如 1,2,3；global 可留空" />
          </label>
          <label class="form-item">
            <span>关联告警数</span>
            <input v-model="form.relatedAlertCount" type="number" min="0" />
          </label>
          <label class="form-item form-span">
            <span>去重键</span>
            <input v-model="form.dedupeKey" type="text" placeholder="可选，如 area:1:diagnosis" />
          </label>
          <label class="form-item form-span">
            <span>诊断原因</span>
            <textarea v-model="form.reasonText" rows="4" placeholder="说明为什么触发此次诊断" />
          </label>
          <div class="form-actions form-span">
            <button class="ghost-button" type="button" @click="resetForm">清空</button>
            <button class="primary-button" :disabled="submitting || !canTrigger">
              {{ submitting ? "提交中..." : "发起诊断" }}
            </button>
          </div>
        </form>
      </div>

      <div>
        <div class="panel-header">
          <h2>诊断详情</h2>
          <span class="tag tag-p1">{{ selectedDiagnosis?.reportNo || "未选择" }}</span>
        </div>

        <div v-if="selectedDiagnosis" class="stack">
          <div class="detail-grid">
            <div>
              <div class="detail-label">覆盖范围</div>
              <div class="detail-value">{{ selectedDiagnosis.scopeSummary }}</div>
            </div>
            <div>
              <div class="detail-label">风险等级</div>
              <div class="detail-value">{{ enumLabel("riskLevel", selectedDiagnosis.riskLevel) }}</div>
            </div>
            <div>
              <div class="detail-label">关联告警</div>
              <div class="detail-value">{{ selectedDiagnosis.relatedAlertCount }}</div>
            </div>
            <div>
              <div class="detail-label">生成时间</div>
              <div class="detail-value">{{ formatDateTime(selectedDiagnosis.generatedAt) }}</div>
            </div>
          </div>
          <div class="metric-strip">
            <div v-for="metric in diagnosisMetricCards(selectedDiagnosis.metricsJson)" :key="metric.metricCode" class="metric-card">
              <small>{{ metric.metricName }}</small>
              <strong>{{ metricDisplayValue(metric) }}</strong>
            </div>
            <div class="metric-card">
              <small>在线网关</small>
              <strong>{{ selectedDiagnosis.metricsJson?.onlineGatewayCount || 0 }}/{{ selectedDiagnosis.metricsJson?.gatewayCount || 0 }}</strong>
            </div>
          </div>
          <div class="detail-span">
            <div class="detail-label">摘要</div>
            <div class="detail-value">{{ selectedDiagnosis.summaryText || "-" }}</div>
          </div>
          <div class="detail-span">
            <div class="detail-label">建议动作</div>
            <div class="detail-value">{{ joinList(selectedDiagnosis.metricsJson?.suggestedActions || []) }}</div>
          </div>
          <div class="detail-span">
            <div class="detail-label">Markdown 内容</div>
            <pre class="markdown-block">{{ selectedDiagnosis.contentMarkdown || "-" }}</pre>
          </div>
        </div>
        <div v-else class="empty-state">从列表选择一条诊断记录查看详情。</div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatDateTime, joinList } from "../lib/format";
import { DEFAULT_METRIC_OPTIONS, buildMetricSummaryList, loadMetricOptions, metricDisplayValue } from "../lib/metrics";
import { hasPermission } from "../lib/session";

const loading = ref(false);
const submitting = ref(false);
const message = ref("");
const errorMessage = ref("");
const diagnoses = ref([]);
const selectedDiagnosis = ref(null);
const metricOptions = ref(DEFAULT_METRIC_OPTIONS);

const filters = reactive({
  keyword: "",
  triggerType: "",
  status: ""
});

const form = reactive({
  triggerType: "manual",
  scopeType: "area",
  scopeIdsText: "1",
  relatedAlertCount: 1,
  dedupeKey: "",
  reasonText: "人工发起区域诊断"
});

const canTrigger = hasPermission("ai:trigger");

function riskClass(level) {
  if (level === "high") {
    return "tag-danger";
  }
  if (level === "medium") {
    return "tag-warning";
  }
  return "tag-success";
}

function diagnosisMetricCards(metricsJson) {
  return buildMetricSummaryList(metricsJson, metricOptions.value);
}

function parseScopeIds(text) {
  return String(text || "")
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item));
}

function resetFilters() {
  filters.keyword = "";
  filters.triggerType = "";
  filters.status = "";
  loadDiagnoses();
}

function resetForm() {
  form.triggerType = "manual";
  form.scopeType = "area";
  form.scopeIdsText = "1";
  form.relatedAlertCount = 1;
  form.dedupeKey = "";
  form.reasonText = "人工发起区域诊断";
}

async function loadDiagnoses() {
  loading.value = true;
  errorMessage.value = "";
  try {
    diagnoses.value = await apiRequest(`/api/v1/ai/diagnoses${buildQuery(filters)}`);
    if (!selectedDiagnosis.value && diagnoses.value[0]) {
      await loadDiagnosisDetail(diagnoses.value[0].id);
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function loadDiagnosisDetail(reportId) {
  errorMessage.value = "";
  try {
    selectedDiagnosis.value = await apiRequest(`/api/v1/ai/reports/${reportId}`);
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function submitDiagnosis() {
  submitting.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const payload = {
      taskType: "diagnosis",
      triggerType: form.triggerType,
      scopeType: form.scopeType,
      scopeIds: form.scopeType === "global" ? [] : parseScopeIds(form.scopeIdsText),
      relatedAlertCount: Number(form.relatedAlertCount) || 0,
      dedupeKey: form.dedupeKey,
      reasonText: form.reasonText
    };

    const result = await apiRequest("/api/v1/ai/tasks", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    message.value = result.task?.status === "deduped" ? "任务已去重合并" : "AI 诊断已生成";
    resetForm();
    await loadDiagnoses();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  metricOptions.value = await loadMetricOptions();
  await loadDiagnoses();
});
</script>
