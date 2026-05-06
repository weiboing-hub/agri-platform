<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>租户管理</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadTenants">刷新</button>
          <button class="primary-button" @click="startCreate">新增租户</button>
        </div>
      </div>

      <div class="settings-overview">
        <div class="settings-overview-card">
          <small>租户总数</small>
          <strong>{{ tenants.length }}</strong>
          <span>当前已具备租户主档、初始化和运行配置能力。</span>
        </div>
        <div class="settings-overview-card">
          <small>启用租户</small>
          <strong>{{ enabledTenantCount }}</strong>
          <span>启用租户会出现在登录页租户下拉和外部租户选项里。</span>
        </div>
        <div class="settings-overview-card">
          <small>默认租户</small>
          <strong>{{ defaultTenantName }}</strong>
          <span>未显式选择租户时，登录入口会回退到默认租户。</span>
        </div>
      </div>

      <div class="toolbar">
        <label class="filter-item">
          <span>关键字</span>
          <input v-model="filters.keyword" type="text" placeholder="租户编码 / 名称 / 标识 / 联系人" />
        </label>
        <label class="filter-item">
          <span>状态</span>
          <select v-model="filters.status">
            <option value="">全部</option>
            <option value="enabled">启用</option>
            <option value="disabled">停用</option>
            <option value="expired">已过期</option>
          </select>
        </label>
        <label class="filter-item">
          <span>类型</span>
          <select v-model="filters.tenantType">
            <option value="">全部</option>
            <option value="enterprise">企业</option>
            <option value="trial">试用</option>
            <option value="internal">内部</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadTenants">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table">
        <thead>
          <tr>
            <th>租户</th>
            <th>标识 / 类型</th>
            <th>状态</th>
            <th>联系人</th>
            <th>资源概览</th>
            <th>到期时间</th>
            <th>登录入口</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in tenants"
            :key="item.id"
            :class="{ 'selected-row': item.id === selectedTenantId }"
            @click="selectTenant(item)"
          >
            <td>
              <div>{{ item.tenantName }}</div>
              <div class="muted-text">{{ item.tenantCode }}</div>
            </td>
            <td>
              <div>{{ item.tenantSlug || "-" }}</div>
              <div class="muted-text">{{ tenantTypeLabel(item.tenantType) }}</div>
            </td>
            <td>
              <span class="tag" :class="tenantStatusTagClass(item.status)">{{ tenantStatusLabel(item.status) }}</span>
              <div v-if="item.isDefault" class="muted-text">默认租户</div>
            </td>
            <td>
              <div>{{ item.contactName || "-" }}</div>
              <div class="muted-text">{{ item.contactPhone || item.contactEmail || "-" }}</div>
            </td>
            <td>
              <div>用户 {{ item.userCount }}</div>
              <div class="muted-text">区域 {{ item.areaCount }} / 网关 {{ item.gatewayCount }}</div>
            </td>
            <td>{{ formatDateTime(item.expiresAt) }}</td>
            <td>
              <div v-if="item.loginEntry">{{ fullLoginEntry(item.loginEntry) }}</div>
              <div v-else class="muted-text">未生成</div>
            </td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click.stop="startEdit(item)">编辑</button>
                <button
                  v-if="item.status === 'enabled' && !item.isDefault"
                  class="table-link"
                  @click.stop="setAsDefault(item)"
                >
                  设为默认
                </button>
                <button
                  v-if="!item.isDefault"
                  class="table-link"
                  @click.stop="toggleStatus(item)"
                >
                  {{ item.status === "enabled" ? "停用" : "启用" }}
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && tenants.length === 0">
            <td colspan="8" class="empty-cell">暂无租户数据</td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="muted-text">正在加载租户列表...</div>
    </section>

    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>{{ editingTenantId ? "编辑租户" : "新增租户" }}</h2>
          <span class="tag tag-p0">P0</span>
        </div>

        <form class="form-grid" @submit.prevent="saveTenant">
          <label class="form-item">
            <span>租户编码</span>
            <input v-model="form.tenantCode" type="text" :disabled="Boolean(editingTenantId)" placeholder="例如 default / farm-east" />
          </label>
          <label class="form-item">
            <span>租户名称</span>
            <input v-model="form.tenantName" type="text" placeholder="租户显示名称" />
          </label>
          <label class="form-item">
            <span>租户标识</span>
            <input v-model="form.tenantSlug" type="text" placeholder="登录入口标识，例如 farm-east" />
          </label>
          <label class="form-item">
            <span>租户类型</span>
            <select v-model="form.tenantType">
              <option value="enterprise">企业</option>
              <option value="trial">试用</option>
              <option value="internal">内部</option>
            </select>
          </label>
          <label class="form-item">
            <span>状态</span>
            <select v-model="form.status">
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
              <option value="expired">已过期</option>
            </select>
          </label>
          <label class="form-item">
            <span>到期时间</span>
            <input v-model="form.expiresAt" type="datetime-local" />
          </label>
          <label class="form-item">
            <span>联系人</span>
            <input v-model="form.contactName" type="text" placeholder="联系人姓名" />
          </label>
          <label class="form-item">
            <span>联系电话</span>
            <input v-model="form.contactPhone" type="text" placeholder="手机号 / 固话" />
          </label>
          <label class="form-item">
            <span>联系邮箱</span>
            <input v-model="form.contactEmail" type="email" placeholder="联系人邮箱" />
          </label>
          <label class="form-item">
            <span>默认租户</span>
            <label class="switch-inline">
              <input v-model="form.isDefault" type="checkbox" />
              <span>{{ form.isDefault ? "作为默认租户" : "仅显式登录可用" }}</span>
            </label>
          </label>
          <label class="form-item form-span">
            <span>备注</span>
            <textarea v-model="form.remark" rows="3" placeholder="租户说明、交付阶段或内部备注"></textarea>
          </label>
          <div class="form-actions form-span">
            <button class="ghost-button" type="button" @click="resetForm">清空</button>
            <button class="primary-button" :disabled="saving">
              {{ saving ? "保存中..." : editingTenantId ? "保存租户" : "创建租户" }}
            </button>
          </div>
        </form>
      </div>

      <div class="stack">
        <div class="panel-header">
          <h2>租户交付工作台</h2>
          <span class="tag tag-p1">{{ selectedTenant?.tenantCode || "未选择租户" }}</span>
        </div>

        <div v-if="selectedTenant" class="stack">
          <div class="detail-card">
            <div class="detail-label">登录入口</div>
            <div class="detail-value">{{ fullLoginEntry(selectedTenant.loginEntry) }}</div>
          </div>

          <div class="detail-card">
            <div class="detail-label">初始化状态</div>
            <div class="detail-value">
              {{ bootstrapSummary?.bootstrapped ? "已完成基础初始化" : "尚未完成初始化" }}
            </div>
            <div class="muted-text">
              角色 {{ bootstrapSummary?.stats?.roleCount ?? 0 }} / 数据范围 {{ bootstrapSummary?.stats?.dataScopeCount ?? 0 }} /
              超管 {{ bootstrapSummary?.stats?.superAdminCount ?? 0 }}
            </div>
          </div>

          <div class="panel-header">
            <h3>套餐与订阅</h3>
            <div class="inline-actions">
              <button class="ghost-button" @click="loadSelectedTenantSubscription">刷新</button>
              <button class="primary-button" :disabled="subscriptionSaving || subscriptionLoading" @click="saveSubscription">
                {{ subscriptionSaving ? "保存中..." : "保存订阅" }}
              </button>
            </div>
          </div>

          <div v-if="subscriptionLoading" class="muted-text">正在加载套餐与订阅...</div>
          <div v-else class="stack">
            <div class="settings-overview">
              <div class="settings-overview-card">
                <small>生效套餐</small>
                <strong>{{ subscriptionSummary?.subscription?.plan?.planName || "未分配" }}</strong>
                <span>
                  {{ billingCycleLabel(subscriptionSummary?.subscription?.plan?.billingCycle) }} /
                  {{ subscriptionStatusLabel(subscriptionSummary?.subscription?.subscriptionStatus) }}
                </span>
              </div>
              <div class="settings-overview-card">
                <small>资源配额</small>
                <strong>用户 {{ quotaText(subscriptionSummary?.usage?.users, subscriptionSummary?.effectiveLimits?.max_users) }}</strong>
                <span>
                  网关 {{ quotaText(subscriptionSummary?.usage?.gateways, subscriptionSummary?.effectiveLimits?.max_gateways) }} /
                  摄像头 {{ quotaText(subscriptionSummary?.usage?.cameras, subscriptionSummary?.effectiveLimits?.max_cameras) }}
                </span>
              </div>
              <div class="settings-overview-card">
                <small>AI 每日任务</small>
                <strong>{{ quotaText(subscriptionSummary?.usage?.aiTasksToday, subscriptionSummary?.effectiveLimits?.max_ai_tasks_per_day) }}</strong>
                <span>{{ featureSummaryText(subscriptionSummary?.effectiveFeatures) }}</span>
              </div>
            </div>

            <form class="form-grid" @submit.prevent="saveSubscription">
              <label class="form-item">
                <span>套餐</span>
                <select v-model="subscriptionForm.planId">
                  <option value="">请选择套餐</option>
                  <option v-for="plan in tenantPlans" :key="plan.id" :value="String(plan.id)">
                    {{ plan.planName }}（{{ plan.planCode }}）
                  </option>
                </select>
              </label>
              <label class="form-item">
                <span>订阅状态</span>
                <select v-model="subscriptionForm.subscriptionStatus">
                  <option value="active">生效中</option>
                  <option value="paused">已暂停</option>
                  <option value="expired">已过期</option>
                  <option value="cancelled">已取消</option>
                </select>
              </label>
              <label class="form-item">
                <span>开始时间</span>
                <input v-model="subscriptionForm.startsAt" type="datetime-local" />
              </label>
              <label class="form-item">
                <span>到期时间</span>
                <input v-model="subscriptionForm.expiresAt" type="datetime-local" />
              </label>
              <label class="form-item form-span">
                <span>订阅备注</span>
                <textarea
                  v-model="subscriptionForm.remark"
                  rows="3"
                  placeholder="例如合同编号、试用期说明或商务备注"
                ></textarea>
              </label>
            </form>
          </div>

          <div class="panel-header">
            <h3>能力开关与配额</h3>
            <div class="inline-actions">
              <button class="ghost-button" @click="loadSelectedTenantRuntime">刷新</button>
              <button class="primary-button" :disabled="runtimeSaving" @click="saveRuntimeSettings">
                {{ runtimeSaving ? "保存中..." : "保存运行配置" }}
              </button>
            </div>
          </div>

          <div v-if="runtimeLoading" class="muted-text">正在加载租户运行配置...</div>
          <form v-else class="form-grid" @submit.prevent="saveRuntimeSettings">
            <label class="form-item">
              <span>启用 AI</span>
              <label class="switch-inline">
                <input v-model="runtimeForm.features.enable_ai" type="checkbox" />
                <span>{{ runtimeForm.features.enable_ai ? "已启用" : "已关闭" }}</span>
              </label>
            </label>
            <label class="form-item">
              <span>启用媒体能力</span>
              <label class="switch-inline">
                <input v-model="runtimeForm.features.enable_media" type="checkbox" />
                <span>{{ runtimeForm.features.enable_media ? "已启用" : "已关闭" }}</span>
              </label>
            </label>
            <label class="form-item">
              <span>启用 OpenClaw</span>
              <label class="switch-inline">
                <input v-model="runtimeForm.features.enable_openclaw" type="checkbox" />
                <span>{{ runtimeForm.features.enable_openclaw ? "已启用" : "已关闭" }}</span>
              </label>
            </label>
            <label class="form-item">
              <span>启用告警通知</span>
              <label class="switch-inline">
                <input v-model="runtimeForm.features.enable_alert_notifications" type="checkbox" />
                <span>{{ runtimeForm.features.enable_alert_notifications ? "已启用" : "已关闭" }}</span>
              </label>
            </label>
            <label class="form-item">
              <span>最大用户数</span>
              <input v-model="runtimeForm.limits.max_users" type="number" min="1" />
            </label>
            <label class="form-item">
              <span>最大网关数</span>
              <input v-model="runtimeForm.limits.max_gateways" type="number" min="1" />
            </label>
            <label class="form-item">
              <span>最大摄像头数</span>
              <input v-model="runtimeForm.limits.max_cameras" type="number" min="0" />
            </label>
            <label class="form-item">
              <span>AI 每日任务上限</span>
              <input v-model="runtimeForm.limits.max_ai_tasks_per_day" type="number" min="0" />
            </label>
          </form>

          <div class="panel-header">
            <h3>租户设备接入凭证</h3>
            <div class="inline-actions">
              <button class="ghost-button" @click="loadSelectedTenantCredential">刷新</button>
              <button class="ghost-button" @click="revealCredential" :disabled="credentialLoading">查看明文</button>
              <button class="primary-button" @click="rotateCredential" :disabled="credentialRotating">
                {{ credentialRotating ? "轮换中..." : "重新生成 Token" }}
              </button>
            </div>
          </div>
          <div class="detail-card">
            <div class="detail-label">当前凭证</div>
            <div class="detail-value">{{ credentialState.deviceIngestTokenMasked || "-" }}</div>
            <div class="muted-text">
              {{ credentialScopeLabel(credentialState.tokenScope) }} / {{ credentialSourceLabel(credentialState.tokenSource) }}
            </div>
            <div class="muted-text">更新时间：{{ formatDateTime(credentialState.updatedAt) }}</div>
          </div>
          <div v-if="revealedCredential" class="detail-card">
            <div class="detail-label">明文 Token</div>
            <div class="detail-value">{{ revealedCredential }}</div>
            <div class="inline-actions">
              <button class="ghost-button" @click="copyText(revealedCredential, '已复制租户设备 Token')">复制 Token</button>
              <button class="ghost-button" @click="copyText(firmwareSnippet, '已复制固件参数片段')">复制固件参数</button>
            </div>
            <pre class="json-block">{{ firmwareSnippet }}</pre>
          </div>

          <div class="panel-header">
            <h3>初始化租户管理员</h3>
            <div class="inline-actions">
              <button class="ghost-button" @click="loadBootstrapSummary">刷新状态</button>
              <button class="primary-button" :disabled="bootstrapLoading" @click="bootstrapTenant">
                {{ bootstrapLoading ? "初始化中..." : "执行初始化" }}
              </button>
            </div>
          </div>
          <form class="form-grid" @submit.prevent="bootstrapTenant">
            <label class="form-item">
              <span>管理员用户名</span>
              <input v-model="bootstrapForm.username" type="text" placeholder="例如 tenant_admin_east" />
            </label>
            <label class="form-item">
              <span>管理员姓名</span>
              <input v-model="bootstrapForm.realName" type="text" placeholder="例如 东区管理员" />
            </label>
            <label class="form-item">
              <span>初始密码</span>
              <input v-model="bootstrapForm.password" type="password" placeholder="初始化时必填" />
            </label>
            <label class="form-item">
              <span>手机号</span>
              <input v-model="bootstrapForm.phone" type="text" placeholder="可选" />
            </label>
            <label class="form-item">
              <span>邮箱</span>
              <input v-model="bootstrapForm.email" type="email" placeholder="可选" />
            </label>
            <label class="form-item form-span">
              <span>备注</span>
              <textarea v-model="bootstrapForm.remark" rows="3" placeholder="初始化说明或交付备注"></textarea>
            </label>
          </form>
        </div>

        <div v-else class="detail-card">
          <div class="detail-label">未选择租户</div>
          <div class="detail-value">先在上方列表选择一个租户，再管理它的运行配置、设备凭证和初始化状态。</div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { apiRequest, buildQuery } from "../lib/api";
import { formatDateTime } from "../lib/format";

const loading = ref(false);
const saving = ref(false);
const runtimeLoading = ref(false);
const runtimeSaving = ref(false);
const subscriptionLoading = ref(false);
const subscriptionSaving = ref(false);
const credentialLoading = ref(false);
const credentialRotating = ref(false);
const bootstrapLoading = ref(false);
const errorMessage = ref("");
const message = ref("");
const tenants = ref([]);
const tenantPlans = ref([]);
const subscriptionSummary = ref(null);
const selectedTenantId = ref(null);
const editingTenantId = ref(null);
const revealedCredential = ref("");
const credentialState = reactive({
  deviceIngestTokenMasked: "",
  tokenScope: "",
  tokenSource: "",
  updatedAt: null,
  updatedByName: ""
});
const bootstrapSummary = ref(null);

const filters = reactive({
  keyword: "",
  status: "",
  tenantType: ""
});

const form = reactive({
  tenantCode: "",
  tenantName: "",
  tenantSlug: "",
  tenantType: "enterprise",
  status: "enabled",
  isDefault: false,
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  expiresAt: "",
  remark: ""
});

const runtimeForm = reactive({
  features: {
    enable_ai: true,
    enable_media: true,
    enable_openclaw: false,
    enable_alert_notifications: true
  },
  limits: {
    max_users: 50,
    max_gateways: 30,
    max_cameras: 20,
    max_ai_tasks_per_day: 200
  }
});

const subscriptionForm = reactive({
  planId: "",
  subscriptionStatus: "active",
  startsAt: "",
  expiresAt: "",
  remark: ""
});

const bootstrapForm = reactive({
  username: "",
  realName: "",
  password: "",
  phone: "",
  email: "",
  remark: ""
});

const enabledTenantCount = computed(() =>
  tenants.value.filter((item) => item.status === "enabled").length
);

const defaultTenantName = computed(() =>
  tenants.value.find((item) => item.isDefault)?.tenantName || "未设置"
);

const selectedTenant = computed(() =>
  tenants.value.find((item) => item.id === selectedTenantId.value) || null
);

const previewLoginEntry = computed(() => {
  const slug = form.tenantSlug || form.tenantCode || "tenant-code";
  return `${window.location.origin}/login?tenant=${slug}`;
});

const firmwareSnippet = computed(() => {
  if (!revealedCredential.value) {
    return "";
  }
  return `const char* API_HOST = "${window.location.origin}";
const char* API_TOKEN = "${revealedCredential.value}";`;
});

function tenantStatusLabel(status) {
  return {
    enabled: "启用",
    disabled: "停用",
    expired: "已过期"
  }[status] || status;
}

function tenantStatusTagClass(status) {
  if (status === "enabled") {
    return "tag-success";
  }
  if (status === "expired") {
    return "tag-warning";
  }
  return "tag-error";
}

function tenantTypeLabel(type) {
  return {
    enterprise: "企业",
    trial: "试用",
    internal: "内部"
  }[type] || type;
}

function subscriptionStatusLabel(status) {
  return {
    active: "生效中",
    paused: "已暂停",
    expired: "已过期",
    cancelled: "已取消"
  }[status] || status || "-";
}

function billingCycleLabel(cycle) {
  return {
    trial: "试用",
    monthly: "月付",
    quarterly: "季付",
    annual: "年付",
    custom: "自定义"
  }[cycle] || cycle || "-";
}

function quotaText(usage, limit) {
  const safeUsage = Number(usage || 0);
  if (limit === undefined || limit === null || limit === "") {
    return `${safeUsage} / -`;
  }
  return `${safeUsage} / ${Number(limit || 0)}`;
}

function featureSummaryText(features = {}) {
  return [
    `AI ${features?.enable_ai ? "开" : "关"}`,
    `媒体 ${features?.enable_media ? "开" : "关"}`,
    `OpenClaw ${features?.enable_openclaw ? "开" : "关"}`,
    `通知 ${features?.enable_alert_notifications ? "开" : "关"}`
  ].join(" / ");
}

function credentialScopeLabel(scope) {
  return scope === "tenant" ? "租户专属 Token" : "继承默认 Token";
}

function credentialSourceLabel(source) {
  return source === "database" ? "数据库配置" : "环境变量兜底";
}

function fullLoginEntry(loginEntry) {
  return `${window.location.origin}${loginEntry || ""}`;
}

function toDateTimeLocal(value) {
  if (!value) {
    return "";
  }
  const normalized = String(value).replace(" ", "T");
  return normalized.length >= 16 ? normalized.slice(0, 16) : normalized;
}

function toDateTimePayload(value) {
  if (!value) {
    return "";
  }
  return value.length === 16 ? `${value}:00` : value.replace("T", " ");
}

async function copyText(value, successText) {
  if (!value) {
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "readonly");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    message.value = successText;
  } catch (error) {
    errorMessage.value = "复制失败，请手动复制页面内容";
  }
}

function resetForm() {
  editingTenantId.value = null;
  form.tenantCode = "";
  form.tenantName = "";
  form.tenantSlug = "";
  form.tenantType = "enterprise";
  form.status = "enabled";
  form.isDefault = false;
  form.contactName = "";
  form.contactPhone = "";
  form.contactEmail = "";
  form.expiresAt = "";
  form.remark = "";
  errorMessage.value = "";
}

function startCreate() {
  message.value = "";
  resetForm();
}

function fillTenantForm(item) {
  editingTenantId.value = item.id;
  form.tenantCode = item.tenantCode;
  form.tenantName = item.tenantName;
  form.tenantSlug = item.tenantSlug || "";
  form.tenantType = item.tenantType;
  form.status = item.status;
  form.isDefault = Boolean(item.isDefault);
  form.contactName = item.contactName || "";
  form.contactPhone = item.contactPhone || "";
  form.contactEmail = item.contactEmail || "";
  form.expiresAt = toDateTimeLocal(item.expiresAt);
  form.remark = item.remark || "";
}

async function startEdit(item) {
  selectTenant(item);
  fillTenantForm(item);
  message.value = "";
  errorMessage.value = "";
}

function resetFilters() {
  filters.keyword = "";
  filters.status = "";
  filters.tenantType = "";
}

function hydrateSelectedTenant() {
  if (tenants.value.length === 0) {
    selectedTenantId.value = null;
    return;
  }
  if (selectedTenantId.value && tenants.value.some((item) => item.id === selectedTenantId.value)) {
    return;
  }
  selectedTenantId.value = tenants.value.find((item) => item.isDefault)?.id || tenants.value[0].id;
}

async function loadTenants() {
  loading.value = true;
  errorMessage.value = "";
  try {
    tenants.value = await apiRequest(`/api/v1/system/tenants${buildQuery(filters)}`);
    hydrateSelectedTenant();
    if (selectedTenant.value && !editingTenantId.value) {
      fillTenantForm(selectedTenant.value);
    }
    await loadSelectedTenantWorkbench();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

function hydrateSubscriptionForm(summary) {
  const subscription = summary?.subscription || null;
  subscriptionForm.planId = subscription?.planId ? String(subscription.planId) : "";
  subscriptionForm.subscriptionStatus = subscription?.subscriptionStatus || "active";
  subscriptionForm.startsAt = toDateTimeLocal(subscription?.startsAt);
  subscriptionForm.expiresAt = toDateTimeLocal(subscription?.expiresAt);
  subscriptionForm.remark = subscription?.remark || "";
}

async function loadTenantPlans() {
  tenantPlans.value = await apiRequest("/api/v1/system/tenant-plans?includeDisabled=true");
}

function buildPayload(overrides = {}) {
  return {
    tenantCode: form.tenantCode,
    tenantName: form.tenantName,
    tenantSlug: form.tenantSlug,
    tenantType: form.tenantType,
    status: form.status,
    isDefault: form.isDefault,
    contactName: form.contactName,
    contactPhone: form.contactPhone,
    contactEmail: form.contactEmail,
    expiresAt: toDateTimePayload(form.expiresAt),
    remark: form.remark,
    ...overrides
  };
}

async function saveTenant() {
  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const payload = buildPayload();
    if (editingTenantId.value) {
      await apiRequest(`/api/v1/system/tenants/${editingTenantId.value}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      message.value = "租户已更新";
    } else {
      await apiRequest("/api/v1/system/tenants", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      message.value = "租户已创建";
    }
    resetForm();
    await loadTenants();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

async function setAsDefault(item) {
  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/system/tenants/${item.id}`, {
      method: "PUT",
      body: JSON.stringify({
        tenantCode: item.tenantCode,
        tenantName: item.tenantName,
        tenantSlug: item.tenantSlug,
        tenantType: item.tenantType,
        status: "enabled",
        isDefault: true,
        contactName: item.contactName,
        contactPhone: item.contactPhone,
        contactEmail: item.contactEmail,
        expiresAt: toDateTimePayload(toDateTimeLocal(item.expiresAt)),
        remark: item.remark
      })
    });
    message.value = `默认租户已切换为 ${item.tenantName}`;
    await loadTenants();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function toggleStatus(item) {
  const nextStatus = item.status === "enabled" ? "disabled" : "enabled";
  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/system/tenants/${item.id}`, {
      method: "PUT",
      body: JSON.stringify({
        tenantCode: item.tenantCode,
        tenantName: item.tenantName,
        tenantSlug: item.tenantSlug,
        tenantType: item.tenantType,
        status: nextStatus,
        isDefault: item.isDefault,
        contactName: item.contactName,
        contactPhone: item.contactPhone,
        contactEmail: item.contactEmail,
        expiresAt: toDateTimePayload(toDateTimeLocal(item.expiresAt)),
        remark: item.remark
      })
    });
    message.value = `${item.tenantName} 已${nextStatus === "enabled" ? "启用" : "停用"}`;
    await loadTenants();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

function selectTenant(item) {
  selectedTenantId.value = item.id;
  if (!editingTenantId.value || editingTenantId.value === item.id) {
    fillTenantForm(item);
  }
  revealedCredential.value = "";
  bootstrapForm.username = bootstrapForm.username || `${item.tenantCode}_admin`;
  bootstrapForm.realName = bootstrapForm.realName || `${item.tenantName}管理员`;
  loadSelectedTenantWorkbench();
}

async function loadSelectedTenantRuntime() {
  if (!selectedTenant.value) {
    return;
  }
  runtimeLoading.value = true;
  try {
    const data = await apiRequest(`/api/v1/system/tenants/${selectedTenant.value.id}/runtime-settings`);
    runtimeForm.features.enable_ai = Boolean(data.features.enable_ai);
    runtimeForm.features.enable_media = Boolean(data.features.enable_media);
    runtimeForm.features.enable_openclaw = Boolean(data.features.enable_openclaw);
    runtimeForm.features.enable_alert_notifications = Boolean(data.features.enable_alert_notifications);
    runtimeForm.limits.max_users = Number(data.limits.max_users || 0);
    runtimeForm.limits.max_gateways = Number(data.limits.max_gateways || 0);
    runtimeForm.limits.max_cameras = Number(data.limits.max_cameras || 0);
    runtimeForm.limits.max_ai_tasks_per_day = Number(data.limits.max_ai_tasks_per_day || 0);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    runtimeLoading.value = false;
  }
}

async function saveRuntimeSettings() {
  if (!selectedTenant.value) {
    return;
  }
  runtimeSaving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/system/tenants/${selectedTenant.value.id}/runtime-settings`, {
      method: "PUT",
      body: JSON.stringify({
        features: runtimeForm.features,
        limits: runtimeForm.limits
      })
    });
    message.value = `${selectedTenant.value.tenantName} 的运行配置已保存`;
    await loadSelectedTenantRuntime();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    runtimeSaving.value = false;
  }
}

async function loadSelectedTenantSubscription() {
  if (!selectedTenant.value) {
    return;
  }
  subscriptionLoading.value = true;
  try {
    if (tenantPlans.value.length === 0) {
      await loadTenantPlans();
    }
    const data = await apiRequest(`/api/v1/system/tenants/${selectedTenant.value.id}/subscription`);
    subscriptionSummary.value = data;
    hydrateSubscriptionForm(data);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    subscriptionLoading.value = false;
  }
}

async function saveSubscription() {
  if (!selectedTenant.value) {
    return;
  }
  subscriptionSaving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/system/tenants/${selectedTenant.value.id}/subscription`, {
      method: "PUT",
      body: JSON.stringify({
        planId: subscriptionForm.planId ? Number(subscriptionForm.planId) : null,
        subscriptionStatus: subscriptionForm.subscriptionStatus,
        startsAt: toDateTimePayload(subscriptionForm.startsAt),
        expiresAt: toDateTimePayload(subscriptionForm.expiresAt),
        remark: subscriptionForm.remark
      })
    });
    message.value = `${selectedTenant.value.tenantName} 的套餐订阅已保存`;
    await loadSelectedTenantSubscription();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    subscriptionSaving.value = false;
  }
}

async function loadSelectedTenantCredential() {
  if (!selectedTenant.value) {
    return;
  }
  credentialLoading.value = true;
  try {
    const data = await apiRequest(`/api/v1/system/tenants/${selectedTenant.value.id}/device-credentials`);
    credentialState.deviceIngestTokenMasked = data.deviceIngestTokenMasked || "";
    credentialState.tokenScope = data.tokenScope || "";
    credentialState.tokenSource = data.tokenSource || "";
    credentialState.updatedAt = data.updatedAt || null;
    credentialState.updatedByName = data.updatedByName || "";
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    credentialLoading.value = false;
  }
}

async function revealCredential() {
  if (!selectedTenant.value) {
    return;
  }
  credentialLoading.value = true;
  errorMessage.value = "";
  try {
    const data = await apiRequest(`/api/v1/system/tenants/${selectedTenant.value.id}/device-credentials/reveal`, {
      method: "POST"
    });
    credentialState.deviceIngestTokenMasked = data.deviceIngestTokenMasked || "";
    credentialState.tokenScope = data.tokenScope || "";
    credentialState.tokenSource = data.tokenSource || "";
    credentialState.updatedAt = data.updatedAt || null;
    credentialState.updatedByName = data.updatedByName || "";
    revealedCredential.value = data.deviceIngestToken || "";
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    credentialLoading.value = false;
  }
}

async function rotateCredential() {
  if (!selectedTenant.value) {
    return;
  }
  credentialRotating.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const data = await apiRequest(`/api/v1/system/tenants/${selectedTenant.value.id}/device-credentials/rotate`, {
      method: "POST"
    });
    credentialState.deviceIngestTokenMasked = data.deviceIngestTokenMasked || "";
    credentialState.tokenScope = "tenant";
    credentialState.tokenSource = data.tokenSource || "";
    credentialState.updatedAt = data.updatedAt || null;
    credentialState.updatedByName = data.updatedByName || "";
    revealedCredential.value = data.deviceIngestToken || "";
    message.value = `${selectedTenant.value.tenantName} 的设备 Token 已轮换`;
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    credentialRotating.value = false;
  }
}

async function loadBootstrapSummary() {
  if (!selectedTenant.value) {
    return;
  }
  try {
    bootstrapSummary.value = await apiRequest(`/api/v1/system/tenants/${selectedTenant.value.id}/bootstrap-summary`);
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function bootstrapTenant() {
  if (!selectedTenant.value) {
    return;
  }
  bootstrapLoading.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const data = await apiRequest(`/api/v1/system/tenants/${selectedTenant.value.id}/bootstrap`, {
      method: "POST",
      body: JSON.stringify({
        username: bootstrapForm.username,
        realName: bootstrapForm.realName,
        password: bootstrapForm.password,
        phone: bootstrapForm.phone,
        email: bootstrapForm.email,
        remark: bootstrapForm.remark,
        features: runtimeForm.features,
        limits: runtimeForm.limits
      })
    });
    message.value = `${selectedTenant.value.tenantName} 初始化完成，管理员账号 ${data.adminUser?.username || bootstrapForm.username}`;
    await loadSelectedTenantWorkbench();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    bootstrapLoading.value = false;
  }
}

async function loadSelectedTenantWorkbench() {
  if (!selectedTenant.value) {
    return;
  }
  await Promise.all([
    loadSelectedTenantSubscription(),
    loadSelectedTenantRuntime(),
    loadSelectedTenantCredential(),
    loadBootstrapSummary()
  ]);
}

onMounted(async () => {
  await loadTenantPlans();
  await loadTenants();
});
</script>
