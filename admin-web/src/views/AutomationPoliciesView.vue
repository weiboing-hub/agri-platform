<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>自动控制策略</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadPolicies">刷新</button>
          <button v-if="canEdit" class="primary-button" @click="startCreate">新增策略</button>
        </div>
      </div>

      <div class="toolbar">
        <label class="filter-item">
          <span>关键字</span>
          <input v-model="filters.keyword" type="text" placeholder="策略编号 / 名称" />
        </label>
        <label class="filter-item">
          <span>启用状态</span>
          <select v-model="filters.enabled">
            <option value="">全部</option>
            <option value="true">{{ enumLabel("status", "enabled") }}</option>
            <option value="false">{{ enumLabel("status", "disabled") }}</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadPolicies">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table">
        <thead>
          <tr>
            <th>策略编号</th>
            <th>策略名称</th>
            <th>区域</th>
            <th>执行器</th>
            <th>触发条件</th>
            <th>动作</th>
            <th>冷却</th>
            <th>每日上限</th>
            <th>启用</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in policies" :key="item.id">
            <td>{{ item.ruleCode }}</td>
            <td>{{ item.ruleName }}</td>
            <td>{{ item.areaName || "-" }}</td>
            <td>{{ item.actuatorName || "-" }}</td>
            <td>{{ policyConditionSummary(item) }}</td>
            <td>{{ policyActionSummary(item) }}</td>
            <td>{{ item.cooldownSeconds }}s</td>
            <td>{{ item.dailyMaxExecutions }}</td>
            <td><span class="tag" :class="item.enabled ? 'tag-success' : 'tag-warning'">{{ item.enabled ? enumLabel("status", "enabled") : enumLabel("status", "disabled") }}</span></td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click="selectPolicy(item)">详情</button>
                <button v-if="canEdit" class="table-link" @click="startEdit(item)">编辑</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && policies.length === 0">
            <td colspan="10" class="empty-cell">暂无自动控制策略</td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="muted-text">正在加载自动控制策略...</div>
    </section>

    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>{{ editingPolicyId ? "编辑自动策略" : "新增自动策略" }}</h2>
          <span class="tag tag-p1">P1</span>
        </div>
        <form class="form-grid" @submit.prevent="savePolicy">
          <label class="form-item">
            <span>策略编号</span>
            <input v-model="form.ruleCode" type="text" :disabled="Boolean(editingPolicyId)" />
          </label>
          <label class="form-item">
            <span>策略名称</span>
            <input v-model="form.ruleName" type="text" />
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
            <span>目标执行器</span>
            <select v-model="form.actuatorId">
              <option value="">请选择执行器</option>
              <option v-for="actuator in actuatorOptions" :key="actuator.id" :value="actuator.id">
                {{ actuator.actuatorName }}
              </option>
            </select>
          </label>
          <label class="form-item">
            <span>触发指标</span>
            <select v-model="form.metric">
              <option v-for="metric in metricOptions" :key="metric.metricCode" :value="metric.metricCode">
                {{ formatMetricOption(metric) }}
              </option>
            </select>
          </label>
          <label class="form-item">
            <span>运算符</span>
            <select v-model="form.operator">
              <option value="<">&lt;</option>
              <option value="<=">&lt;=</option>
              <option value=">">&gt;</option>
              <option value=">=">&gt;=</option>
            </select>
          </label>
          <label class="form-item">
            <span>阈值</span>
            <input v-model="form.threshold" type="number" step="0.1" />
          </label>
          <label class="form-item">
            <span>持续判断秒数</span>
            <input v-model="form.stableSeconds" type="number" min="0" />
          </label>
          <label class="form-item">
            <span>联动第二条件</span>
            <select v-model="form.secondaryEnabled">
              <option :value="false">关闭</option>
              <option :value="true">开启</option>
            </select>
          </label>
          <label v-if="form.secondaryEnabled" class="form-item">
            <span>第二条件指标</span>
            <select v-model="form.secondaryMetric">
              <option v-for="metric in metricOptions" :key="`secondary-${metric.metricCode}`" :value="metric.metricCode">
                {{ formatMetricOption(metric) }}
              </option>
            </select>
          </label>
          <label v-if="form.secondaryEnabled" class="form-item">
            <span>第二条件运算符</span>
            <select v-model="form.secondaryOperator">
              <option value="<">&lt;</option>
              <option value="<=">&lt;=</option>
              <option value=">">&gt;</option>
              <option value=">=">&gt;=</option>
            </select>
          </label>
          <label v-if="form.secondaryEnabled" class="form-item">
            <span>第二条件阈值</span>
            <input v-model="form.secondaryThreshold" type="number" step="0.1" />
          </label>
          <label v-if="form.secondaryEnabled" class="form-item">
            <span>第二条件持续秒数</span>
            <input v-model="form.secondaryStableSeconds" type="number" min="0" />
          </label>
          <label class="form-item">
            <span>数据保护</span>
            <select v-model="form.guardEnabled">
              <option :value="false">关闭</option>
              <option :value="true">开启</option>
            </select>
          </label>
          <label v-if="form.guardEnabled" class="form-item">
            <span>最小有效值</span>
            <input v-model="form.guardMinValid" type="number" step="0.1" />
          </label>
          <label v-if="form.guardEnabled" class="form-item">
            <span>最大有效值</span>
            <input v-model="form.guardMaxValid" type="number" step="0.1" />
          </label>
          <label v-if="form.guardEnabled" class="form-item">
            <span>最近正样本最少数</span>
            <input v-model="form.guardMinRecentPositiveCount" type="number" min="0" />
          </label>
          <label v-if="form.guardEnabled" class="form-item">
            <span>正样本统计秒数</span>
            <input v-model="form.guardRecentPositiveWindowSeconds" type="number" min="0" />
          </label>
          <label v-if="form.guardEnabled" class="form-item">
            <span>正样本阈值</span>
            <input v-model="form.guardRecentPositiveThreshold" type="number" step="0.1" />
          </label>
          <label v-if="form.guardEnabled" class="form-item">
            <span>异常样本触发数</span>
            <input v-model="form.guardInvalidSampleCount" type="number" min="0" />
          </label>
          <label v-if="form.guardEnabled" class="form-item">
            <span>异常样本统计秒数</span>
            <input v-model="form.guardInvalidWindowSeconds" type="number" min="0" />
          </label>
          <label v-if="form.guardEnabled" class="form-item">
            <span>保护告警</span>
            <select v-model="form.guardCreateAlert">
              <option :value="true">开启</option>
              <option :value="false">关闭</option>
            </select>
          </label>
          <label v-if="form.guardEnabled && form.guardCreateAlert" class="form-item">
            <span>保护告警级别</span>
            <select v-model="form.guardAlertSeverity">
              <option value="critical">{{ enumLabel("severity", "critical") }}</option>
              <option value="high">{{ enumLabel("severity", "high") }}</option>
              <option value="medium">{{ enumLabel("severity", "medium") }}</option>
              <option value="low">{{ enumLabel("severity", "low") }}</option>
            </select>
          </label>
          <label class="form-item">
            <span>控制动作</span>
            <select v-model="form.controlType">
              <option value="on">{{ enumLabel("controlType", "on") }}</option>
              <option value="off">{{ enumLabel("controlType", "off") }}</option>
              <option value="stop">{{ enumLabel("controlType", "stop") }}</option>
            </select>
          </label>
          <label class="form-item">
            <span>动作持续秒数</span>
            <input v-model="form.controlDurationSeconds" type="number" min="0" />
          </label>
          <label class="form-item">
            <span>恢复策略</span>
            <select v-model="form.recoveryPolicy">
              <option value="manual_close">{{ enumLabel("recoveryPolicy", "manual_close") }}</option>
              <option value="auto_close">{{ enumLabel("recoveryPolicy", "auto_close") }}</option>
              <option value="auto_downgrade">{{ enumLabel("recoveryPolicy", "auto_downgrade") }}</option>
            </select>
          </label>
          <label class="form-item">
            <span>冷却秒数</span>
            <input v-model="form.cooldownSeconds" type="number" min="0" />
          </label>
          <label class="form-item">
            <span>每日最大执行次数</span>
            <input v-model="form.dailyMaxExecutions" type="number" min="0" />
          </label>
          <label class="form-item">
            <span>优先级</span>
            <input v-model="form.priority" type="number" min="1" />
          </label>
          <label class="form-item">
            <span>启用</span>
            <select v-model="form.enabled">
              <option :value="true">{{ enumLabel("status", "enabled") }}</option>
              <option :value="false">{{ enumLabel("status", "disabled") }}</option>
            </select>
          </label>
          <label class="form-item form-span">
            <span>说明</span>
            <textarea v-model="form.note" rows="3" placeholder="策略说明 / 触发背景" />
          </label>
          <div class="form-actions form-span">
            <button class="ghost-button" type="button" @click="resetForm">清空</button>
            <button class="primary-button" :disabled="saving || !canEdit">
              {{ saving ? "保存中..." : editingPolicyId ? "保存修改" : "创建策略" }}
            </button>
          </div>
        </form>
      </div>

      <div>
        <div class="panel-header">
          <h2>策略详情</h2>
          <span class="tag tag-p1">{{ selectedPolicy?.ruleCode || "未选择" }}</span>
        </div>
        <div v-if="selectedPolicy" class="stack">
          <div class="detail-grid">
            <div class="detail-card">
              <div class="detail-label">策略名称</div>
              <div class="detail-value">{{ selectedPolicy.ruleName || "-" }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">当前状态</div>
              <div class="detail-value">{{ selectedPolicy.enabled ? enumLabel("status", "enabled") : enumLabel("status", "disabled") }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">作用区域</div>
              <div class="detail-value">{{ selectedPolicy.areaName || "-" }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">目标执行器</div>
              <div class="detail-value">{{ selectedPolicy.actuatorName || "-" }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">触发指标</div>
              <div class="detail-value">{{ displayMetricLabel(automationCondition.metric) }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">触发条件</div>
              <div class="detail-value">{{ automationConditionText }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">持续判断</div>
              <div class="detail-value">{{ automationStableText }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">联动第二条件</div>
              <div class="detail-value">{{ automationSecondaryText }}</div>
            </div>
            <div class="detail-card detail-span">
              <div class="detail-label">数据保护</div>
              <div class="detail-value">{{ automationGuardText }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">控制动作</div>
              <div class="detail-value">{{ automationActionText }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">动作时长</div>
              <div class="detail-value">{{ automationDurationText }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">恢复策略</div>
              <div class="detail-value">{{ enumLabel("recoveryPolicy", selectedPolicy.recoveryPolicy) }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">冷却时间</div>
              <div class="detail-value">{{ selectedPolicy.cooldownSeconds || 0 }} 秒</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">每日上限</div>
              <div class="detail-value">{{ selectedPolicy.dailyMaxExecutions || 0 }} 次</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">优先级</div>
              <div class="detail-value">{{ selectedPolicy.priority || "-" }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">更新人</div>
              <div class="detail-value">{{ selectedPolicy.updatedByName || "-" }}</div>
            </div>
            <div class="detail-card detail-span">
              <div class="detail-label">策略说明</div>
              <div class="detail-value">{{ automationCondition.note || "-" }}</div>
            </div>
          </div>

          <details class="config-disclosure">
            <summary class="config-disclosure-summary">原始配置</summary>
            <div class="stack">
              <div class="detail-span">
                <div class="detail-label">条件 JSON</div>
                <pre class="json-block">{{ formatJson(selectedPolicy.conditionJson) }}</pre>
              </div>
              <div class="detail-span">
                <div class="detail-label">动作 JSON</div>
                <pre class="json-block">{{ formatJson(selectedPolicy.actionJson) }}</pre>
              </div>
            </div>
          </details>
        </div>
        <div v-else class="empty-state">从列表选择一条自动策略查看详情。</div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatJson } from "../lib/format";
import { DEFAULT_METRIC_OPTIONS, loadMetricOptions, metricLabel, metricUnit } from "../lib/metrics";
import {
  buildMetricConditionText,
  buildRuleConditionSummary,
  buildValueGuardSummary,
  normalizeSecondaryMetricCondition,
  normalizeValueGuardCondition
} from "../lib/rule-conditions";
import { hasPermission } from "../lib/session";

const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const message = ref("");
const areas = ref([]);
const actuators = ref([]);
const metricOptions = ref(DEFAULT_METRIC_OPTIONS);
const policies = ref([]);
const selectedPolicy = ref(null);
const editingPolicyId = ref(null);

const filters = reactive({
  keyword: "",
  enabled: ""
});

const form = reactive({
  ruleCode: "",
  ruleName: "",
  areaId: "",
  actuatorId: "",
  metric: "temperature",
  operator: "<",
  threshold: 30,
  stableSeconds: 300,
  secondaryEnabled: false,
  secondaryMetric: "temperature",
  secondaryOperator: ">",
  secondaryThreshold: 35,
  secondaryStableSeconds: 300,
  guardEnabled: true,
  guardMinValid: 0.1,
  guardMaxValid: 100,
  guardMinRecentPositiveCount: 1,
  guardRecentPositiveWindowSeconds: 300,
  guardRecentPositiveThreshold: 0,
  guardInvalidSampleCount: 3,
  guardInvalidWindowSeconds: 300,
  guardCreateAlert: true,
  guardAlertSeverity: "high",
  controlType: "on",
  controlDurationSeconds: 120,
  recoveryPolicy: "manual_close",
  cooldownSeconds: 1800,
  dailyMaxExecutions: 6,
  priority: 50,
  enabled: true,
  note: ""
});

const canEdit = hasPermission("rule:edit");

function displayMetricLabel(metricCode) {
  return metricLabel(metricOptions.value, metricCode);
}

function formatMetricOption(metric) {
  return metric.unitName ? `${metric.metricName} (${metric.unitName})` : metric.metricName;
}

const actuatorOptions = computed(() => {
  if (!form.areaId) {
    return actuators.value;
  }
  return actuators.value.filter((item) => String(item.areaId) === String(form.areaId));
});

const automationCondition = computed(() => selectedPolicy.value?.conditionJson || {});

const automationControlAction = computed(() => {
  const action = selectedPolicy.value?.actionJson || {};
  if (Array.isArray(action.actions)) {
    return action.actions.find((item) => item.type === "control") || {};
  }
  return action;
});

const automationConditionText = computed(() => {
  if (!selectedPolicy.value) {
    return "-";
  }
  return buildRuleConditionSummary(automationCondition.value, "threshold", displayMetricLabel)
    || selectedPolicy.value.conditionSummary
    || "-";
});

const automationStableText = computed(() => {
  const stableSeconds = automationCondition.value?.stableSeconds;
  return Number.isFinite(Number(stableSeconds)) ? `${stableSeconds} 秒` : "-";
});

const automationSecondaryText = computed(() =>
  buildMetricConditionText(automationCondition.value?.secondaryCondition, displayMetricLabel)
);

const automationGuardText = computed(() => buildValueGuardSummary(automationCondition.value?.valueGuard));

const automationActionText = computed(() => {
  const controlAction = automationControlAction.value;
  if (controlAction?.controlType) {
    return `${enumLabel("controlType", controlAction.controlType)} ${selectedPolicy.value?.actuatorName || "目标执行器"}`;
  }
  return selectedPolicy.value?.actionSummary || "-";
});

const automationDurationText = computed(() => {
  const durationSeconds = automationControlAction.value?.durationSeconds;
  return Number.isFinite(Number(durationSeconds)) ? `${durationSeconds} 秒` : "-";
});

function parseMaybeJson(value) {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

function isAutomationPolicy(rule) {
  const action = parseMaybeJson(rule.actionJson);
  if (!action) {
    return false;
  }
  if (Array.isArray(action.actions)) {
    return action.actions.some((item) => item.type === "control");
  }
  return action.type === "control";
}

function enrichPolicy(rule) {
  const action = parseMaybeJson(rule.actionJson) || {};
  const condition = parseMaybeJson(rule.conditionJson) || {};
  const targetIds = parseMaybeJson(rule.targetIdsJson) || [];
  const actuatorId = Array.isArray(targetIds) ? targetIds[0] : targetIds;
  const actuator = actuators.value.find((item) => String(item.id) === String(actuatorId));
  const area = areas.value.find((item) => String(item.id) === String(condition.areaId || actuator?.areaId || ""));
  return {
    ...rule,
    actionJson: action,
    conditionJson: condition,
    actuatorId,
    actuatorName: actuator?.actuatorName || "-",
    areaName: area?.areaName || "-"
  };
}

function policyConditionSummary(item) {
  const condition = item?.conditionJson || {};
  const summary = buildRuleConditionSummary(condition, "threshold", displayMetricLabel);
  if (summary && summary !== "-") {
    return summary;
  }
  return item?.conditionSummary || "-";
}

function policyActionSummary(item) {
  const action = item?.actionJson || {};
  const controlAction = Array.isArray(action.actions) ? action.actions.find((entry) => entry.type === "control") : action;
  if (controlAction?.controlType) {
    const durationPart = Number.isFinite(Number(controlAction.durationSeconds)) ? ` ${controlAction.durationSeconds} 秒` : "";
    return `${enumLabel("controlType", controlAction.controlType)} ${item?.actuatorName || "目标执行器"}${durationPart}`;
  }
  return item?.actionSummary || "-";
}

function resetFilters() {
  filters.keyword = "";
  filters.enabled = "";
  loadPolicies();
}

function resetForm() {
  editingPolicyId.value = null;
  form.ruleCode = "";
  form.ruleName = "";
  form.areaId = "";
  form.actuatorId = "";
  form.metric = metricOptions.value[0]?.metricCode || "temperature";
  form.operator = "<";
  form.threshold = 30;
  form.stableSeconds = 300;
  form.secondaryEnabled = false;
  form.secondaryMetric = metricOptions.value[0]?.metricCode || "temperature";
  form.secondaryOperator = ">";
  form.secondaryThreshold = 35;
  form.secondaryStableSeconds = 300;
  form.guardEnabled = true;
  form.guardMinValid = 0.1;
  form.guardMaxValid = 100;
  form.guardMinRecentPositiveCount = 1;
  form.guardRecentPositiveWindowSeconds = 300;
  form.guardRecentPositiveThreshold = 0;
  form.guardInvalidSampleCount = 3;
  form.guardInvalidWindowSeconds = 300;
  form.guardCreateAlert = true;
  form.guardAlertSeverity = "high";
  form.controlType = "on";
  form.controlDurationSeconds = 120;
  form.recoveryPolicy = "manual_close";
  form.cooldownSeconds = 1800;
  form.dailyMaxExecutions = 6;
  form.priority = 50;
  form.enabled = true;
  form.note = "";
}

function startCreate() {
  resetForm();
  message.value = "";
  errorMessage.value = "";
}

async function loadLookups() {
  const [areaRows, actuatorRows, metricRows] = await Promise.all([
    apiRequest("/api/v1/areas"),
    apiRequest("/api/v1/actuators"),
    loadMetricOptions()
  ]);
  areas.value = areaRows;
  actuators.value = actuatorRows;
  metricOptions.value = metricRows;
  if (!metricOptions.value.some((item) => item.metricCode === form.metric)) {
    form.metric = metricOptions.value[0]?.metricCode || "temperature";
  }
}

async function loadPolicies() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const rows = await apiRequest(
      `/api/v1/rules${buildQuery({
        keyword: filters.keyword,
        enabled: filters.enabled,
        ruleType: "threshold"
      })}`
    );
    policies.value = rows.filter(isAutomationPolicy).map(enrichPolicy);
    if (selectedPolicy.value) {
      selectedPolicy.value = policies.value.find((item) => item.id === selectedPolicy.value.id) || policies.value[0] || null;
    } else if (policies.value[0]) {
      selectedPolicy.value = policies.value[0];
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

function selectPolicy(item) {
  selectedPolicy.value = item;
}

function startEdit(item) {
  selectedPolicy.value = item;
  editingPolicyId.value = item.id;
  const action = parseMaybeJson(item.actionJson) || {};
  const condition = parseMaybeJson(item.conditionJson) || {};
  const controlAction = Array.isArray(action.actions) ? action.actions.find((entry) => entry.type === "control") : action;
  const secondaryCondition = normalizeSecondaryMetricCondition(condition.secondaryCondition, Number(condition.stableSeconds || 0));
  const valueGuard = normalizeValueGuardCondition(condition.valueGuard, Number(condition.stableSeconds || 0));

  form.ruleCode = item.ruleCode;
  form.ruleName = item.ruleName;
  form.areaId = condition.areaId || item.areaId || "";
  form.actuatorId = item.actuatorId || "";
  form.metric = condition.metric || metricOptions.value[0]?.metricCode || "temperature";
  form.operator = condition.operator || "<";
  form.threshold = condition.threshold ?? 30;
  form.stableSeconds = condition.stableSeconds ?? 300;
  form.secondaryEnabled = Boolean(secondaryCondition);
  form.secondaryMetric = secondaryCondition?.metric || metricOptions.value[0]?.metricCode || "temperature";
  form.secondaryOperator = secondaryCondition?.operator || ">";
  form.secondaryThreshold = secondaryCondition?.threshold ?? 35;
  form.secondaryStableSeconds = secondaryCondition?.stableSeconds ?? form.stableSeconds;
  form.guardEnabled = Boolean(valueGuard);
  form.guardMinValid = valueGuard?.minValid ?? 0.1;
  form.guardMaxValid = valueGuard?.maxValid ?? 100;
  form.guardMinRecentPositiveCount = valueGuard?.minRecentPositiveCount ?? 1;
  form.guardRecentPositiveWindowSeconds = valueGuard?.recentPositiveWindowSeconds ?? form.stableSeconds;
  form.guardRecentPositiveThreshold = valueGuard?.recentPositiveThreshold ?? 0;
  form.guardInvalidSampleCount = valueGuard?.invalidSampleCount ?? 3;
  form.guardInvalidWindowSeconds = valueGuard?.invalidWindowSeconds ?? form.stableSeconds;
  form.guardCreateAlert = valueGuard?.createAlert !== false;
  form.guardAlertSeverity = valueGuard?.alertSeverity || "high";
  form.controlType = controlAction?.controlType || "on";
  form.controlDurationSeconds = controlAction?.durationSeconds ?? 120;
  form.recoveryPolicy = item.recoveryPolicy || "manual_close";
  form.cooldownSeconds = item.cooldownSeconds || 0;
  form.dailyMaxExecutions = item.dailyMaxExecutions || 0;
  form.priority = item.priority || 100;
  form.enabled = Boolean(item.enabled);
  form.note = condition.note || "";
}

async function savePolicy() {
  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const selectedActuator = actuators.value.find((item) => String(item.id) === String(form.actuatorId));
    const secondaryCondition = form.secondaryEnabled
      ? normalizeSecondaryMetricCondition({
          metric: form.secondaryMetric,
          operator: form.secondaryOperator,
          threshold: Number(form.secondaryThreshold),
          stableSeconds: Number(form.secondaryStableSeconds) || Number(form.stableSeconds) || 0
        }, Number(form.stableSeconds) || 0)
      : null;
    const valueGuard = form.guardEnabled
      ? normalizeValueGuardCondition({
          minValid: form.guardMinValid,
          maxValid: form.guardMaxValid,
          minRecentPositiveCount: Number(form.guardMinRecentPositiveCount) || 0,
          recentPositiveWindowSeconds: Number(form.guardRecentPositiveWindowSeconds) || Number(form.stableSeconds) || 0,
          recentPositiveThreshold: Number(form.guardRecentPositiveThreshold) || 0,
          invalidSampleCount: Number(form.guardInvalidSampleCount) || 0,
          invalidWindowSeconds: Number(form.guardInvalidWindowSeconds) || Number(form.stableSeconds) || 0,
          createAlert: form.guardCreateAlert,
          alertSeverity: form.guardAlertSeverity
        }, Number(form.stableSeconds) || 0)
      : null;
    const conditionJson = {
      metric: form.metric,
      operator: form.operator,
      threshold: Number(form.threshold),
      stableSeconds: Number(form.stableSeconds),
      areaId: form.areaId ? Number(form.areaId) : null,
      note: form.note
    };
    if (secondaryCondition) {
      conditionJson.secondaryCondition = secondaryCondition;
    }
    if (valueGuard) {
      conditionJson.valueGuard = valueGuard;
    }
    conditionJson.summary = buildRuleConditionSummary(conditionJson, "threshold", displayMetricLabel);
    const actionJson = {
      summary: `${enumLabel("controlType", form.controlType)} ${selectedActuator?.actuatorName || `执行器 ${form.actuatorId}`} ${form.controlDurationSeconds} 秒`,
      actions: [
        {
          type: "control",
          actuatorId: Number(form.actuatorId),
          controlType: form.controlType,
          durationSeconds: Number(form.controlDurationSeconds)
        }
      ]
    };

    const payload = {
      ruleCode: form.ruleCode,
      ruleName: form.ruleName,
      ruleType: "threshold",
      targetType: "actuator",
      builderMode: "visual",
      enabled: form.enabled,
      recoveryPolicy: form.recoveryPolicy,
      recoveryStableSeconds: 0,
      cooldownSeconds: Number(form.cooldownSeconds) || 0,
      dailyMaxExecutions: Number(form.dailyMaxExecutions) || 0,
      priority: Number(form.priority) || 100,
      targetIdsJson: JSON.stringify([Number(form.actuatorId)]),
      conditionJson: JSON.stringify(conditionJson),
      actionJson: JSON.stringify(actionJson)
    };

    if (editingPolicyId.value) {
      await apiRequest(`/api/v1/rules/${editingPolicyId.value}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      message.value = "自动策略已更新";
    } else {
      await apiRequest("/api/v1/rules", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      message.value = "自动策略已创建";
    }

    resetForm();
    await loadPolicies();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await loadLookups();
  await loadPolicies();
});
</script>
