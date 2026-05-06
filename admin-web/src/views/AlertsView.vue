<template>
  <div class="stack">
    <section class="panel mobile-only mobile-field-panel">
      <div class="mobile-field-panel-head">
        <div>
          <div class="mobile-field-kicker">现场模式</div>
          <h2>告警中心</h2>
          <p class="panel-subtitle">{{ alertFocusSummary }}</p>
        </div>
      </div>

      <div class="mobile-field-stat-grid">
        <article class="mobile-field-stat-card">
          <span class="mobile-field-stat-label">当前告警</span>
          <strong class="mobile-field-stat-value">{{ alerts.length }}</strong>
          <small>{{ alertScopeName }}</small>
        </article>
        <article class="mobile-field-stat-card">
          <span class="mobile-field-stat-label">待确认</span>
          <strong class="mobile-field-stat-value">{{ pendingAlertCount }}</strong>
          <small>待确认/重开</small>
        </article>
        <article class="mobile-field-stat-card">
          <span class="mobile-field-stat-label">处理中</span>
          <strong class="mobile-field-stat-value">{{ processingAlertCount }}</strong>
          <small>需要持续跟进</small>
        </article>
        <article class="mobile-field-stat-card">
          <span class="mobile-field-stat-label">高危</span>
          <strong class="mobile-field-stat-value">{{ criticalAlertCount }}</strong>
          <small>优先处理</small>
        </article>
      </div>

      <div class="mobile-field-shortcuts">
        <RouterLink :to="realtimeLink" class="mobile-field-shortcut">实时监控</RouterLink>
        <RouterLink :to="historyLink" class="mobile-field-shortcut">历史分析</RouterLink>
        <RouterLink :to="dashboardLink" class="mobile-field-shortcut">返回工作台</RouterLink>
        <RouterLink :to="manualControlLink" class="mobile-field-shortcut mobile-field-shortcut-strong">手动控制</RouterLink>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2>告警中心</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadAlerts">刷新</button>
        </div>
      </div>

      <div class="metric-strip actuator-summary-strip">
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ alerts.length }}</div>
          <div class="stat-desc">当前告警</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ pendingAlertCount }}</div>
          <div class="stat-desc">待确认/重开</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ processingAlertCount }}</div>
          <div class="stat-desc">处理中</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ criticalAlertCount }}</div>
          <div class="stat-desc">高危告警</div>
        </article>
      </div>

      <div class="context-strip">
        <div class="context-copy">
          <strong>当前上下文</strong>
          <span>{{ alertScopeName }} · {{ filters.status ? enumLabel("alertStatus", filters.status) : "全部状态" }} · {{ filters.severity ? enumLabel("severity", filters.severity) : "全部级别" }}</span>
        </div>
        <div class="context-actions">
          <RouterLink :to="dashboardLink" class="context-link">返回工作台</RouterLink>
          <RouterLink :to="realtimeLink" class="context-link">实时监控</RouterLink>
          <RouterLink :to="historyLink" class="context-link">历史分析</RouterLink>
          <RouterLink :to="manualControlLink" class="context-link">手动控制</RouterLink>
        </div>
      </div>

      <div class="mobile-only mobile-filter-summary">
        <div class="mobile-filter-summary-copy">
          <strong>当前筛选</strong>
          <span>{{ alertScopeName }} · {{ filters.status ? enumLabel("alertStatus", filters.status) : "全部状态" }} · {{ filters.severity ? enumLabel("severity", filters.severity) : "全部级别" }}</span>
        </div>
        <button class="ghost-button" @click="mobileFiltersOpen = !mobileFiltersOpen">
          {{ mobileFiltersOpen ? "收起筛选" : "展开筛选" }}
        </button>
      </div>

      <div class="toolbar desktop-filter-toolbar mobile-filter-toolbar" :class="{ 'mobile-filter-toolbar-open': mobileFiltersOpen }">
        <label class="filter-item">
          <span>状态</span>
          <select v-model="filters.status">
            <option value="">全部</option>
            <option value="pending">{{ enumLabel("alertStatus", "pending") }}</option>
            <option value="acknowledged">{{ enumLabel("alertStatus", "acknowledged") }}</option>
            <option value="in_progress">{{ enumLabel("alertStatus", "in_progress") }}</option>
            <option value="on_hold">{{ enumLabel("alertStatus", "on_hold") }}</option>
            <option value="ignored">{{ enumLabel("alertStatus", "ignored") }}</option>
            <option value="closed">{{ enumLabel("alertStatus", "closed") }}</option>
            <option value="reopened">{{ enumLabel("alertStatus", "reopened") }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>级别</span>
          <select v-model="filters.severity">
            <option value="">全部</option>
            <option value="critical">{{ enumLabel("severity", "critical") }}</option>
            <option value="high">{{ enumLabel("severity", "high") }}</option>
            <option value="medium">{{ enumLabel("severity", "medium") }}</option>
            <option value="low">{{ enumLabel("severity", "low") }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>区域</span>
          <select v-model="filters.areaId">
            <option value="">全部</option>
            <option v-for="area in areas" :key="area.id" :value="area.id">
              {{ area.areaName }}
            </option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadAlerts">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <section v-if="alertDetail" class="mobile-only mobile-inline-detail-card">
        <div class="mobile-inline-detail-head">
          <div>
            <div class="mobile-field-kicker">当前告警</div>
            <strong class="mobile-inline-detail-title">{{ alertDetail.title }}</strong>
            <div class="mobile-inline-detail-subtitle">
              {{ enumLabel("alertStatus", alertDetail.status) }} · {{ alertDetail.areaName || alertScopeName }}
            </div>
          </div>
          <div class="responsive-card-tags">
            <span class="tag" :class="severityClass(alertDetail.severity)">{{ enumLabel("severity", alertDetail.severity) }}</span>
            <span class="tag" :class="statusClass(alertDetail.status)">{{ enumLabel("alertStatus", alertDetail.status) }}</span>
          </div>
        </div>

        <div class="mobile-inline-detail-grid">
          <div class="responsive-card-field">
            <span>设备/传感器</span>
            <strong>{{ alertDetail.sensorName || alertDetail.gatewayName || "-" }}</strong>
          </div>
          <div class="responsive-card-field">
            <span>触发时间</span>
            <strong>{{ formatDateTime(alertDetail.triggeredAt) }}</strong>
          </div>
          <div class="responsive-card-field">
            <span>当前值</span>
            <strong>{{ alertDetail.current_value_decimal ?? alertDetail.currentValueDecimal ?? "-" }} {{ alertDetail.unit_name || alertDetail.unitName || "" }}</strong>
          </div>
          <div class="responsive-card-field">
            <span>处理人</span>
            <strong>{{ alertDetail.assignedToName || "-" }}</strong>
          </div>
        </div>

        <div class="mobile-inline-detail-copy">
          {{ alertDetail.content_text || alertDetail.contentText || "当前告警暂无补充说明。" }}
        </div>

        <div class="mobile-inline-detail-actions">
          <button class="ghost-button" :disabled="!previousAlert" @click="selectPreviousAlert">上一条</button>
          <button class="ghost-button" :disabled="!nextAlert" @click="selectNextAlert">下一条</button>
          <button v-if="canApplyAction('confirm', alertDetail)" class="ghost-button" @click="applyAction('confirm', alertDetail)">确认</button>
          <button v-if="canApplyAction('process', alertDetail)" class="ghost-button" @click="applyAction('process', alertDetail)">处理</button>
          <button v-if="canApplyAction('close', alertDetail)" class="primary-button" @click="applyAction('close', alertDetail)">关闭</button>
          <button v-if="canApplyAction('reopen', alertDetail)" class="primary-button" @click="applyAction('reopen', alertDetail)">重新打开</button>
        </div>
      </section>

      <div class="dashboard-workspace-grid ops-workspace-grid">
        <article class="detail-card dashboard-workspace-card">
          <div class="detail-label">当前聚焦</div>
          <div class="dashboard-workspace-value">{{ alertScopeName }}</div>
          <div class="dashboard-workspace-copy">
            <span>状态筛选：{{ filters.status ? enumLabel("alertStatus", filters.status) : "全部状态" }}</span>
            <span>级别筛选：{{ filters.severity ? enumLabel("severity", filters.severity) : "全部级别" }}</span>
            <span>{{ alertFocusSummary }}</span>
          </div>
        </article>

        <article class="detail-card dashboard-workspace-card">
          <div class="detail-label">下一步建议</div>
          <div class="dashboard-workspace-copy">
            <span>先处理待确认和处理中告警，再决定是否进入实时监控、历史分析或手动控制。</span>
            <span v-if="unassignedAlertCount > 0">当前还有 {{ unassignedAlertCount }} 条未指派告警，建议先补处理人。</span>
          </div>
        </article>

        <article class="detail-card dashboard-workspace-card">
          <div class="detail-label">联动入口</div>
          <div class="dashboard-workspace-actions">
            <RouterLink :to="realtimeLink" class="dashboard-mini-link">实时监控</RouterLink>
            <RouterLink :to="historyLink" class="dashboard-mini-link">历史分析</RouterLink>
            <RouterLink :to="dashboardLink" class="dashboard-mini-link">返回工作台</RouterLink>
            <RouterLink :to="manualControlLink" class="dashboard-mini-link dashboard-mini-link-strong">手动控制</RouterLink>
          </div>
        </article>
      </div>

      <table class="simple-table desktop-table-only">
        <thead>
          <tr>
            <th>编号</th>
            <th>标题</th>
            <th>级别</th>
            <th>状态</th>
            <th>区域</th>
            <th>设备/传感器</th>
            <th>触发时间</th>
            <th>处理人</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in alerts" :key="item.id">
            <td>{{ item.alertNo }}</td>
            <td>{{ item.title }}</td>
            <td><span class="tag" :class="severityClass(item.severity)">{{ enumLabel("severity", item.severity) }}</span></td>
            <td><span class="tag" :class="statusClass(item.status)">{{ enumLabel("alertStatus", item.status) }}</span></td>
            <td>{{ item.areaName || "-" }}</td>
            <td>{{ item.sensorName || item.gatewayName || "-" }}</td>
            <td>{{ formatDateTime(item.triggeredAt) }}</td>
            <td>{{ item.assignedToName || "-" }}</td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click="selectAlert(item)">详情</button>
                <button v-if="canApplyAction('confirm', item)" class="table-link" @click="applyAction('confirm', item)">确认</button>
                <button v-if="canApplyAction('process', item)" class="table-link" @click="applyAction('process', item)">处理</button>
                <button v-if="canApplyAction('close', item)" class="table-link" @click="applyAction('close', item)">关闭</button>
                <button v-if="canApplyAction('reopen', item)" class="table-link" @click="applyAction('reopen', item)">重开</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && alerts.length === 0">
            <td colspan="9" class="empty-cell">暂无告警数据</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!loading && alerts.length > 0" class="responsive-card-list tablet-card-list">
        <article
          v-for="item in alerts"
          :key="item.id"
          class="responsive-entity-card"
          :class="{ active: alertDetail?.id === item.id }"
          @click="selectAlert(item)"
        >
          <div class="responsive-card-head">
            <div class="table-primary-cell">
              <strong>{{ item.title }}</strong>
              <span>{{ item.alertNo }}</span>
            </div>
            <div class="responsive-card-tags">
              <span class="tag" :class="severityClass(item.severity)">{{ enumLabel("severity", item.severity) }}</span>
              <span class="tag" :class="statusClass(item.status)">{{ enumLabel("alertStatus", item.status) }}</span>
            </div>
          </div>
          <div class="responsive-card-grid">
            <div class="responsive-card-field">
              <span>区域</span>
              <strong>{{ item.areaName || "-" }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>设备/传感器</span>
              <strong>{{ item.sensorName || item.gatewayName || "-" }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>触发时间</span>
              <strong>{{ formatDateTime(item.triggeredAt) }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>处理人</span>
              <strong>{{ item.assignedToName || "-" }}</strong>
            </div>
          </div>
          <div class="responsive-card-actions" @click.stop>
            <button class="ghost-button" @click="selectAlert(item)">查看详情</button>
            <button v-if="canApplyAction('confirm', item)" class="ghost-button" @click="applyAction('confirm', item)">确认</button>
            <button v-if="canApplyAction('process', item)" class="ghost-button" @click="applyAction('process', item)">处理</button>
            <button v-if="canApplyAction('close', item)" class="ghost-button" @click="applyAction('close', item)">关闭</button>
            <button v-if="canApplyAction('reopen', item)" class="ghost-button" @click="applyAction('reopen', item)">重开</button>
          </div>
        </article>
      </div>
      <div v-if="!loading && alerts.length === 0" class="empty-state tablet-card-empty">暂无告警数据</div>
      <div v-if="loading" class="muted-text">正在加载告警数据...</div>
    </section>

    <section class="panel split-panel mobile-detail-panel">
      <div>
        <div class="panel-header">
          <div>
            <h2>告警详情</h2>
            <p v-if="alertDetail" class="panel-subtitle">
              当前第 {{ selectedAlertOrder }} 条，共 {{ alerts.length }} 条，可连续查看相邻告警。
            </p>
          </div>
          <div class="inline-actions detail-nav-actions">
            <button class="ghost-button" :disabled="!previousAlert" @click="selectPreviousAlert">上一条</button>
            <button class="ghost-button" :disabled="!nextAlert" @click="selectNextAlert">下一条</button>
            <span class="tag tag-p0">{{ alertDetail?.alertNo || "未选择" }}</span>
          </div>
        </div>
        <div v-if="alertDetail" class="stack">
          <div class="detail-card alert-flow-card">
            <div class="alert-flow-head">
              <div>
                <div class="detail-label">处理进度</div>
                <div class="detail-value">{{ alertActionHint }}</div>
              </div>
              <span class="tag" :class="statusClass(alertDetail.status)">{{ enumLabel("alertStatus", alertDetail.status) }}</span>
            </div>
            <div class="alert-flow-steps">
              <span
                v-for="step in alertFlowItems"
                :key="step.key"
                class="alert-flow-step"
                :class="{ 'alert-flow-step-active': step.active, 'alert-flow-step-done': step.done }"
              >
                {{ step.label }}
              </span>
            </div>
          </div>

          <div class="detail-grid">
            <div>
              <div class="detail-label">标题</div>
              <div class="detail-value">{{ alertDetail.title }}</div>
            </div>
            <div>
              <div class="detail-label">当前状态</div>
              <div class="detail-value">{{ enumLabel("alertStatus", alertDetail.status) }}</div>
            </div>
            <div>
              <div class="detail-label">当前值</div>
              <div class="detail-value">{{ alertDetail.current_value_decimal ?? alertDetail.currentValueDecimal ?? "-" }} {{ alertDetail.unit_name || alertDetail.unitName || "" }}</div>
            </div>
            <div>
              <div class="detail-label">重开次数</div>
              <div class="detail-value">{{ alertDetail.reopen_count ?? alertDetail.reopenCount ?? 0 }}</div>
            </div>
            <div class="detail-span">
              <div class="detail-label">告警内容</div>
              <div class="detail-value">{{ alertDetail.content_text || alertDetail.contentText || "-" }}</div>
            </div>
          </div>

          <form class="form-grid" @submit.prevent="submitTransition">
            <label class="form-item">
              <span>动作</span>
              <select v-model="transitionForm.actionType">
                <option v-for="item in availableTransitionActions" :key="item" :value="item">
                  {{ enumLabel("alertAction", item) }}
                </option>
              </select>
            </label>
            <label class="form-item">
              <span>指派处理人</span>
              <select v-model="transitionForm.assignedTo">
                <option value="">不变更</option>
                <option v-for="user in userOptions" :key="user.id" :value="user.id">
                  {{ user.realName }} / {{ user.username }}
                </option>
              </select>
            </label>
            <label class="form-item form-span">
              <span>备注</span>
              <textarea v-model="transitionForm.remarkText" rows="3" placeholder="处理说明 / 关闭原因" />
            </label>
            <div class="form-actions form-span">
              <button class="primary-button" :disabled="transitionSaving || availableTransitionActions.length === 0">
                {{ transitionSaving ? "提交中..." : availableTransitionActions.length === 0 ? "当前无可执行动作" : "提交流转" }}
              </button>
            </div>
          </form>
        </div>
        <div v-else class="empty-state">从列表选择一个告警查看详情。</div>
      </div>

      <div>
        <div class="panel-header">
          <h2>流转记录</h2>
          <span class="tag tag-p1">{{ alertDetail?.transitions?.length || 0 }} 条</span>
        </div>
        <table class="simple-table compact-table">
          <thead>
            <tr>
              <th>动作</th>
              <th>状态变化</th>
              <th>操作人</th>
              <th>备注</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in alertDetail?.transitions || []" :key="item.id">
              <td>{{ enumLabel("alertAction", item.actionType) }}</td>
              <td>{{ item.fromStatus ? enumLabel("alertStatus", item.fromStatus) : "-" }} → {{ enumLabel("alertStatus", item.toStatus) }}</td>
              <td>{{ item.actorName || "-" }}</td>
              <td>{{ item.remarkText || "-" }}</td>
              <td>{{ formatDateTime(item.createdAt) }}</td>
            </tr>
            <tr v-if="alertDetail && (alertDetail.transitions || []).length === 0">
              <td colspan="5" class="empty-cell">暂无流转记录</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatDateTime } from "../lib/format";
import { hasPermission } from "../lib/session";

const loading = ref(false);
const transitionSaving = ref(false);
const errorMessage = ref("");
const message = ref("");
const alerts = ref([]);
const areas = ref([]);
const userOptions = ref([]);
const alertDetail = ref(null);
const mobileFiltersOpen = ref(false);

const filters = reactive({
  status: "",
  severity: "",
  areaId: ""
});
const route = useRoute();
const router = useRouter();

const transitionForm = reactive({
  actionType: "assign",
  assignedTo: "",
  remarkText: ""
});

const ALERT_ACTIONS = ["assign", "confirm", "process", "hold", "ignore", "close", "reopen"];
const ACTION_ALLOWED_STATUSES = {
  assign: ["pending", "acknowledged", "in_progress", "on_hold", "reopened"],
  confirm: ["pending", "reopened"],
  process: ["pending", "acknowledged", "on_hold", "reopened"],
  hold: ["acknowledged", "in_progress"],
  ignore: ["pending", "acknowledged", "in_progress", "on_hold", "reopened"],
  close: ["pending", "acknowledged", "in_progress", "on_hold", "reopened"],
  reopen: ["closed", "ignored"]
};
const ACTION_PERMISSIONS = {
  assign: "alert:assign",
  confirm: "alert:confirm",
  process: "alert:process",
  hold: "alert:process",
  ignore: "alert:close",
  close: "alert:close",
  reopen: "alert:reopen"
};
const FLOW_ORDER = ["pending", "acknowledged", "in_progress", "closed"];

const canConfirm = computed(() => hasPermission("alert:confirm"));
const canProcess = computed(() => hasPermission("alert:process"));
const canClose = computed(() => hasPermission("alert:close"));
const availableTransitionActions = computed(() =>
  ALERT_ACTIONS.filter((actionType) => canApplyAction(actionType, alertDetail.value))
);
const alertFlowItems = computed(() => {
  const status = normalizeFlowStatus(alertDetail.value?.status);
  const activeIndex = FLOW_ORDER.indexOf(status);
  return FLOW_ORDER.map((item, index) => ({
    key: item,
    label: enumLabel("alertStatus", item),
    active: item === status,
    done: activeIndex >= 0 && index < activeIndex
  }));
});
const alertActionHint = computed(() => {
  if (!alertDetail.value) {
    return "请选择告警后查看可执行动作。";
  }
  if (availableTransitionActions.value.length === 0) {
    return "当前状态暂无可执行动作，通常表示告警已结束或账号权限不足。";
  }
  return `可执行：${availableTransitionActions.value.map((item) => enumLabel("alertAction", item)).join("、")}`;
});
const pendingAlertCount = computed(() => alerts.value.filter((item) => ["pending", "reopened"].includes(item.status)).length);
const processingAlertCount = computed(() => alerts.value.filter((item) => ["acknowledged", "in_progress", "on_hold"].includes(item.status)).length);
const criticalAlertCount = computed(() => alerts.value.filter((item) => ["critical", "high"].includes(item.severity)).length);
const unassignedAlertCount = computed(() => alerts.value.filter((item) => !item.assignedToName).length);
const alertScopeName = computed(() => areas.value.find((item) => String(item.id) === String(filters.areaId))?.areaName || "全部区域");
const dashboardLink = computed(() => ({ path: "/dashboard/overview", query: filters.areaId ? { areaId: String(filters.areaId) } : {} }));
const realtimeLink = computed(() => ({ path: "/monitor/realtime", query: filters.areaId ? { areaId: String(filters.areaId) } : {} }));
const historyLink = computed(() => ({ path: "/monitor/history", query: filters.areaId ? { areaId: String(filters.areaId) } : {} }));
const manualControlLink = computed(() => ({ path: "/controls/manual", query: filters.areaId ? { areaId: String(filters.areaId) } : {} }));
const selectedAlertIndex = computed(() =>
  alertDetail.value?.id ? alerts.value.findIndex((item) => item.id === alertDetail.value.id) : -1
);
const selectedAlertOrder = computed(() => (selectedAlertIndex.value >= 0 ? selectedAlertIndex.value + 1 : 0));
const previousAlert = computed(() =>
  selectedAlertIndex.value > 0 ? alerts.value[selectedAlertIndex.value - 1] : null
);
const nextAlert = computed(() =>
  selectedAlertIndex.value >= 0 && selectedAlertIndex.value < alerts.value.length - 1
    ? alerts.value[selectedAlertIndex.value + 1]
    : null
);
const alertFocusSummary = computed(() => {
  if (pendingAlertCount.value > 0) {
    return `当前有 ${pendingAlertCount.value} 条待确认或重开的告警需要优先处理。`;
  }
  if (processingAlertCount.value > 0) {
    return `当前有 ${processingAlertCount.value} 条告警处于处理中，建议跟进处理说明和关闭条件。`;
  }
  if (criticalAlertCount.value > 0) {
    return `当前高危告警较多，建议回看规则与现场监测是否需要降噪或加联动动作。`;
  }
  return "当前告警压力较低，可以回看历史数据或继续关注实时监控。";
});

function severityClass(severity) {
  if (severity === "critical") return "tag-danger";
  if (severity === "high") return "tag-warning";
  if (severity === "medium") return "tag-p1";
  return "tag-success";
}

function statusClass(status) {
  if (["pending", "reopened"].includes(status)) return "tag-warning";
  if (["closed", "ignored"].includes(status)) return "tag-success";
  if (status === "in_progress") return "tag-p1";
  return "tag-danger";
}

function normalizeFlowStatus(status) {
  if (status === "reopened") return "pending";
  if (status === "on_hold") return "in_progress";
  if (status === "ignored") return "closed";
  return status || "pending";
}

function canApplyAction(actionType, item) {
  if (!item?.status) {
    return false;
  }
  const permission = ACTION_PERMISSIONS[actionType];
  if (permission && !hasPermission(permission)) {
    return false;
  }
  return (ACTION_ALLOWED_STATUSES[actionType] || []).includes(item.status);
}

function syncTransitionAction() {
  if (!availableTransitionActions.value.includes(transitionForm.actionType)) {
    transitionForm.actionType = availableTransitionActions.value[0] || "";
  }
}

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
  filters.status = firstQueryValue(route.query.status) || "";
  filters.severity = firstQueryValue(route.query.severity) || "";
  filters.areaId = readNumberQuery(route.query.areaId);
}

function syncRouteQuery() {
  const query = {};
  if (filters.status) query.status = String(filters.status);
  if (filters.severity) query.severity = String(filters.severity);
  if (filters.areaId) query.areaId = String(filters.areaId);
  router.replace({ query }).catch(() => {});
}

function resetFilters() {
  filters.status = "";
  filters.severity = "";
  filters.areaId = "";
  mobileFiltersOpen.value = false;
  loadAlerts();
}

async function loadLookups() {
  const [areaRows, userRows] = await Promise.all([
    apiRequest("/api/v1/areas"),
    apiRequest("/api/v1/system/user-options")
  ]);
  areas.value = areaRows;
  userOptions.value = userRows;
}

async function loadAlerts() {
  loading.value = true;
  errorMessage.value = "";
  try {
    syncRouteQuery();
    alerts.value = await apiRequest(`/api/v1/alerts${buildQuery(filters)}`);
    mobileFiltersOpen.value = false;
    if (!alertDetail.value && alerts.value[0]) {
      await selectAlert(alerts.value[0]);
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function selectAlert(item) {
  if (!item?.id) {
    return;
  }
  errorMessage.value = "";
  try {
    alertDetail.value = await apiRequest(`/api/v1/alerts/${item.id}`);
    syncTransitionAction();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

function selectPreviousAlert() {
  if (!previousAlert.value) {
    return;
  }
  selectAlert(previousAlert.value);
}

function selectNextAlert() {
  if (!nextAlert.value) {
    return;
  }
  selectAlert(nextAlert.value);
}

async function submitTransition(targetAlertId = alertDetail.value?.id) {
  if (!targetAlertId) {
    return;
  }
  if (!transitionForm.actionType) {
    errorMessage.value = "当前告警没有可执行动作";
    return;
  }
  transitionSaving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/alerts/${targetAlertId}/transitions`, {
      method: "POST",
      body: JSON.stringify({
        actionType: transitionForm.actionType,
        assignedTo: transitionForm.assignedTo || null,
        remarkText: transitionForm.remarkText
      })
    });
    message.value = "告警流转成功";
    transitionForm.remarkText = "";
    if (transitionForm.actionType !== "assign") {
      transitionForm.assignedTo = "";
    }
    await loadAlerts();
    const targetAlert = alerts.value.find((item) => item.id === targetAlertId);
    if (targetAlert) {
      await selectAlert(targetAlert);
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    transitionSaving.value = false;
  }
}

async function applyAction(actionType, item) {
  if (!canApplyAction(actionType, item)) {
    errorMessage.value = "当前告警状态不支持该动作";
    return;
  }
  transitionForm.actionType = actionType;
  await selectAlert(item);
  transitionForm.actionType = actionType;
  if (["confirm", "process", "close", "reopen"].includes(actionType)) {
    await submitTransition(item.id);
  }
}

onMounted(async () => {
  await loadLookups();
  hydrateFiltersFromRoute();
  await loadAlerts();
});
</script>
