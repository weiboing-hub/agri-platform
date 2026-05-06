<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>AI日报 / 周报</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadReports">刷新</button>
          <button v-if="canGenerate" class="primary-button" @click="generateReport" :disabled="submitting">
            {{ submitting ? "生成中..." : "立即生成" }}
          </button>
        </div>
      </div>

      <div class="toolbar">
        <label class="filter-item">
          <span>报告类型</span>
          <select v-model="filters.reportType">
            <option value="">全部</option>
            <option value="daily">{{ enumLabel("reportType", "daily") }}</option>
            <option value="weekly">{{ enumLabel("reportType", "weekly") }}</option>
            <option value="monthly">{{ enumLabel("reportType", "monthly") }}</option>
            <option value="diagnosis">{{ enumLabel("reportType", "diagnosis") }}</option>
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
        <label class="filter-item">
          <span>范围类型</span>
          <select v-model="filters.scopeType">
            <option value="">全部</option>
            <option value="global">{{ enumLabel("scopeType", "global") }}</option>
            <option value="area">{{ enumLabel("scopeType", "area") }}</option>
            <option value="device">{{ enumLabel("scopeType", "device") }}</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadReports">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table compact-table">
        <thead>
          <tr>
            <th>报告编号</th>
            <th>类型</th>
            <th>日期</th>
            <th>范围</th>
            <th>版本</th>
            <th>当前版本</th>
            <th>生成时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in reports" :key="item.id">
            <td>{{ item.reportNo }}</td>
            <td>{{ enumLabel("reportType", item.reportType) }}</td>
            <td>{{ item.reportDate }}</td>
            <td>{{ item.scopeSummary }}</td>
            <td>v{{ item.versionNo }}</td>
            <td><span class="tag" :class="item.isCurrentVersion ? 'tag-success' : 'tag-warning'">{{ item.isCurrentVersion ? "当前版本" : "历史版本" }}</span></td>
            <td>{{ formatDateTime(item.generatedAt) }}</td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click="loadReportDetail(item.id)">详情</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && reports.length === 0">
            <td colspan="8" class="empty-cell">暂无报告数据</td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="muted-text">正在加载 AI 报告...</div>
    </section>

    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>生成配置</h2>
          <span class="tag tag-p1">P1</span>
        </div>

        <div
          v-if="schedulerStatus"
          class="ai-scheduler-status-panel"
          :class="schedulerStatus.mode === 'manual_only' ? 'ai-scheduler-status-manual' : 'ai-scheduler-status-auto'"
        >
          <div class="ai-scheduler-status-head">
            <div>
              <small>自动生成状态</small>
              <strong>{{ schedulerStatus.mode === "manual_only" ? "仅手动生成" : "自动生成已开启" }}</strong>
              <span>{{ schedulerStatus.effectiveSummary }}</span>
            </div>
            <a v-if="canConfigureSystem" class="ghost-button" href="/system/settings">去系统设置</a>
          </div>
          <div class="ai-scheduler-status-grid">
            <div>
              <small>自动日报</small>
              <strong>{{ schedulerStatus.autoDailyReportEnabled ? "开启" : "关闭" }}</strong>
              <span>{{ schedulerStatus.dailyReportTime }}</span>
            </div>
            <div>
              <small>自动周报</small>
              <strong>{{ schedulerStatus.autoWeeklyReportEnabled ? "开启" : "关闭" }}</strong>
              <span>{{ schedulerStatus.weeklyReportTime }}</span>
            </div>
            <div>
              <small>事件诊断</small>
              <strong>{{ schedulerStatus.eventDiagnosisEnabled ? "开启" : "关闭" }}</strong>
              <span>冷却 {{ schedulerStatus.cooldownMinutes }} 分钟</span>
            </div>
          </div>
        </div>

        <form class="form-grid" @submit.prevent="generateReport">
          <label class="form-item">
            <span>报告类型</span>
            <select v-model="form.reportType">
              <option value="daily">{{ enumLabel("reportType", "daily") }}</option>
              <option value="weekly">{{ enumLabel("reportType", "weekly") }}</option>
              <option value="monthly">{{ enumLabel("reportType", "monthly") }}</option>
            </select>
          </label>
          <label class="form-item">
            <span>触发方式</span>
            <select v-model="form.triggerType">
              <option value="manual">{{ enumLabel("triggerType", "manual") }}</option>
              <option value="schedule">{{ enumLabel("triggerType", "schedule") }}</option>
              <option value="event">{{ enumLabel("triggerType", "event") }}</option>
            </select>
          </label>
          <label class="form-item">
            <span>范围类型</span>
            <select v-model="form.scopeType">
              <option value="global">{{ enumLabel("scopeType", "global") }}</option>
              <option value="area">{{ enumLabel("scopeType", "area") }}</option>
              <option value="device">{{ enumLabel("scopeType", "device") }}</option>
            </select>
          </label>
          <label class="form-item">
            <span>报告日期</span>
            <input v-model="form.reportDate" type="date" />
          </label>
          <label class="form-item form-span">
            <span>范围 ID 列表</span>
            <input v-model="form.scopeIdsText" type="text" placeholder="如 1,2,3；global 可留空" />
          </label>
          <label class="form-item form-span">
            <span>去重键</span>
            <input v-model="form.dedupeKey" type="text" placeholder="可选，如 global:daily:2026-03-29" />
          </label>
          <label class="form-item form-span">
            <span>报告说明</span>
            <textarea v-model="form.reasonText" rows="4" placeholder="说明本次生成目的" />
          </label>
          <div class="form-actions form-span">
            <button class="ghost-button" type="button" @click="resetForm">清空</button>
            <button class="primary-button" :disabled="submitting || !canGenerate">
              {{ submitting ? "生成中..." : "立即生成" }}
            </button>
          </div>
        </form>
      </div>

      <div>
        <div class="panel-header">
          <h2>报告详情</h2>
          <span class="tag tag-p1">{{ selectedReport?.reportNo || "未选择" }}</span>
        </div>

        <div v-if="selectedReport" class="stack">
          <div class="detail-grid">
            <div>
              <div class="detail-label">报告类型</div>
              <div class="detail-value">{{ enumLabel("reportType", selectedReport.reportType) }}</div>
            </div>
            <div>
              <div class="detail-label">报告日期</div>
              <div class="detail-value">{{ selectedReport.reportDate }}</div>
            </div>
            <div>
              <div class="detail-label">版本信息</div>
              <div class="detail-value">v{{ selectedReport.versionNo }}</div>
            </div>
            <div>
              <div class="detail-label">生成时间</div>
              <div class="detail-value">{{ formatDateTime(selectedReport.generatedAt) }}</div>
            </div>
          </div>
          <div class="detail-span">
            <div class="detail-label">摘要</div>
            <div class="detail-value">{{ selectedReport.summaryText || "-" }}</div>
          </div>
          <div class="metric-strip">
            <div v-for="metric in reportMetricCards(selectedReport.metricsJson)" :key="metric.metricCode" class="metric-card">
              <small>{{ metric.metricName }}</small>
              <strong>{{ metricDisplayValue(metric) }}</strong>
            </div>
            <div class="metric-card">
              <small>风险等级</small>
              <strong>{{ enumLabel("riskLevel", selectedReport.riskLevel) }}</strong>
            </div>
            <div class="metric-card">
              <small>活动告警</small>
              <strong>{{ selectedReport.relatedAlertCount }}</strong>
            </div>
            <div class="metric-card">
              <small>覆盖范围</small>
              <strong>{{ selectedReport.scopeSummary }}</strong>
            </div>
            <div class="metric-card">
              <small>种植快照</small>
              <strong>{{ cropRecommendationSummary(selectedReport.metricsJson).count || 0 }} 条</strong>
            </div>
          </div>
          <div v-if="cropRecommendationSummary(selectedReport.metricsJson).count" class="ai-crop-summary-panel">
            <div class="ai-crop-summary-head">
              <div>
                <h3>种植建议依据</h3>
                <p>来自作物知识库保存的建议快照，用于支撑日报、周报和后续 AI 报告。</p>
              </div>
              <span class="tag" :class="cropRecommendationLevelClass(cropRecommendationSummary(selectedReport.metricsJson).overallLevel)">
                {{ cropRecommendationLevelLabel(cropRecommendationSummary(selectedReport.metricsJson).overallLevel) }}
              </span>
            </div>
            <div class="ai-crop-summary-grid">
              <div>
                <small>报告周期</small>
                <strong>{{ cropRecommendationSummary(selectedReport.metricsJson).window?.label || "-" }}</strong>
              </div>
              <div>
                <small>最新快照</small>
                <strong>{{ latestCropSnapshotText(cropRecommendationSummary(selectedReport.metricsJson).latest) }}</strong>
              </div>
              <div>
                <small>异常/待补数</small>
                <strong>
                  {{ cropRecommendationSummary(selectedReport.metricsJson).needsActionCount || 0 }}
                  /
                  {{ cropRecommendationSummary(selectedReport.metricsJson).dataGapCount || 0 }}
                </strong>
              </div>
            </div>
            <div v-if="cropRecommendationSummary(selectedReport.metricsJson).actions?.length" class="ai-crop-action-list">
              <article v-for="action in cropRecommendationSummary(selectedReport.metricsJson).actions" :key="`${action.snapshotNo}-${action.title}`">
                <span>{{ action.label }}</span>
                <strong>{{ action.title }}</strong>
                <p>{{ action.text || "按当前作物建议继续观察。" }}</p>
              </article>
            </div>
          </div>
          <div class="detail-span">
            <div class="detail-label">版本历史</div>
            <div class="detail-value">
              {{ selectedReport.versions?.length ? selectedReport.versions.map((item) => `v${item.versionNo}`).join("、") : "-" }}
            </div>
          </div>
          <div class="detail-span">
            <div class="detail-label">Markdown 内容</div>
            <pre class="markdown-block">{{ selectedReport.contentMarkdown || "-" }}</pre>
          </div>
        </div>
        <div v-else class="empty-state">从列表选择一份报告查看详情。</div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatDateTime } from "../lib/format";
import { DEFAULT_METRIC_OPTIONS, buildMetricSummaryList, loadMetricOptions, metricDisplayValue } from "../lib/metrics";
import { hasPermission } from "../lib/session";

const loading = ref(false);
const submitting = ref(false);
const message = ref("");
const errorMessage = ref("");
const reports = ref([]);
const selectedReport = ref(null);
const metricOptions = ref(DEFAULT_METRIC_OPTIONS);
const schedulerStatus = ref(null);

const filters = reactive({
  reportType: "",
  status: "",
  scopeType: ""
});

const form = reactive({
  reportType: "daily",
  triggerType: "manual",
  scopeType: "global",
  scopeIdsText: "",
  reportDate: new Date().toISOString().slice(0, 10),
  dedupeKey: "",
  reasonText: "人工生成业务报告"
});

const canGenerate = hasPermission("ai:report_generate");
const canConfigureSystem = hasPermission("system:config");

function reportMetricCards(metricsJson) {
  return buildMetricSummaryList(metricsJson, metricOptions.value);
}

function cropRecommendationSummary(metricsJson) {
  return metricsJson?.cropRecommendationSnapshot || {
    count: 0,
    overallLevel: "none",
    needsActionCount: 0,
    dataGapCount: 0,
    latest: null,
    actions: []
  };
}

function cropRecommendationLevelLabel(level) {
  return {
    stable: "整体平稳",
    needs_action: "需要处理",
    data_gap: "数据待补齐",
    unconfigured: "区域待绑定作物",
    no_targets: "推荐目标待配置",
    none: "暂无快照"
  }[level] || "建议快照";
}

function cropRecommendationLevelClass(level) {
  if (level === "stable") {
    return "tag-success";
  }
  if (level === "needs_action") {
    return "tag-danger";
  }
  return "tag-warning";
}

function latestCropSnapshotText(snapshot) {
  if (!snapshot) {
    return "-";
  }
  const areaText = snapshot.areaName || "未知区域";
  const cropText = [snapshot.cropText, snapshot.stageText].filter(Boolean).join(" / ");
  const timeText = snapshot.createdAt ? formatDateTime(snapshot.createdAt) : "";
  return [areaText, cropText, timeText].filter(Boolean).join(" · ");
}

function parseScopeIds(text) {
  return String(text || "")
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item));
}

function resetFilters() {
  filters.reportType = "";
  filters.status = "";
  filters.scopeType = "";
  loadReports();
}

function resetForm() {
  form.reportType = "daily";
  form.triggerType = "manual";
  form.scopeType = "global";
  form.scopeIdsText = "";
  form.reportDate = new Date().toISOString().slice(0, 10);
  form.dedupeKey = "";
  form.reasonText = "人工生成业务报告";
}

async function loadReports() {
  loading.value = true;
  errorMessage.value = "";
  try {
    reports.value = await apiRequest(`/api/v1/ai/reports${buildQuery(filters)}`);
    if (!selectedReport.value && reports.value[0]) {
      await loadReportDetail(reports.value[0].id);
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function loadSchedulerStatus() {
  try {
    schedulerStatus.value = await apiRequest("/api/v1/ai/report-scheduler/status");
  } catch {
    schedulerStatus.value = null;
  }
}

async function loadReportDetail(reportId) {
  errorMessage.value = "";
  try {
    selectedReport.value = await apiRequest(`/api/v1/ai/reports/${reportId}`);
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function generateReport() {
  submitting.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const payload = {
      reportType: form.reportType,
      triggerType: form.triggerType,
      scopeType: form.scopeType,
      scopeIds: form.scopeType === "global" ? [] : parseScopeIds(form.scopeIdsText),
      reportDate: form.reportDate,
      dedupeKey: form.dedupeKey,
      reasonText: form.reasonText
    };

    const result = await apiRequest("/api/v1/ai/reports/generate", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    message.value = result.report?.reportNo ? `报告 ${result.report.reportNo} 已生成` : "AI 报告已生成";
    resetForm();
    await loadReports();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  metricOptions.value = await loadMetricOptions();
  await loadSchedulerStatus();
  await loadReports();
});
</script>
