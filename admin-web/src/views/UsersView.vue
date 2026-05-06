<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>用户列表</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadUsers">刷新</button>
          <button class="primary-button" @click="startCreate">新增用户</button>
        </div>
      </div>

      <div class="metric-strip actuator-summary-strip">
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ users.length }}</div>
          <div class="stat-desc">当前用户</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ enabledUserCount }}</div>
          <div class="stat-desc">已启用</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ lockedUserCount }}</div>
          <div class="stat-desc">待解锁</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ disabledUserCount }}</div>
          <div class="stat-desc">已禁用</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ assignedRoleUserCount }}</div>
          <div class="stat-desc">已分配角色</div>
        </article>
      </div>

      <div class="toolbar">
        <label class="filter-item">
          <span>关键字</span>
          <input v-model="filters.keyword" type="text" placeholder="用户名 / 姓名 / 手机号" />
        </label>
        <label class="filter-item">
          <span>状态</span>
          <select v-model="filters.status">
            <option value="">全部</option>
            <option value="enabled">启用</option>
            <option value="disabled">禁用</option>
            <option value="locked">锁定</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadUsers">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table desktop-table-only">
        <thead>
          <tr>
            <th>账号</th>
            <th>联系方式</th>
            <th>角色</th>
            <th>状态</th>
            <th>最后登录</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in users" :key="item.id">
            <td>
              <div class="table-primary-cell">
                <strong>{{ item.realName || item.username }}</strong>
                <span>{{ item.username }}</span>
              </div>
            </td>
            <td>
              <div class="table-primary-cell">
                <strong>{{ item.phone || "-" }}</strong>
                <span>{{ item.email || "未填写邮箱" }}</span>
              </div>
            </td>
            <td>{{ joinList(item.roleNames) || "未分配角色" }}</td>
            <td>
              <span class="tag" :class="statusTagClass(item.status)">{{ enumLabel("status", item.status) }}</span>
              <div v-if="lockHint(item)" class="muted-text">{{ lockHint(item) }}</div>
            </td>
            <td>{{ formatDateTime(item.lastLoginAt) }}</td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click="startEdit(item)">编辑</button>
                <button
                  v-if="canUnlockUser(item)"
                  class="table-link"
                  @click="unlockUser(item)"
                >
                  解锁
                </button>
                <button
                  v-if="canManageOverrides"
                  class="table-link"
                  @click="selectOverrideUser(item)"
                >
                  特殊授权
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && users.length === 0">
            <td colspan="6" class="empty-cell">暂无用户数据</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!loading && users.length > 0" class="responsive-card-list tablet-card-list">
        <article
          v-for="item in users"
          :key="item.id"
          class="responsive-entity-card"
          :class="{ active: editingUserId === item.id || selectedOverrideUser?.id === item.id }"
        >
          <div class="responsive-card-head">
            <div class="table-primary-cell">
              <strong>{{ item.realName || item.username }}</strong>
              <span>{{ item.username }}</span>
            </div>
            <div class="responsive-card-tags">
              <span class="tag" :class="statusTagClass(item.status)">{{ enumLabel("status", item.status) }}</span>
            </div>
          </div>
          <div class="responsive-card-grid">
            <div class="responsive-card-field">
              <span>手机号</span>
              <strong>{{ item.phone || "-" }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>邮箱</span>
              <strong>{{ item.email || "未填写邮箱" }}</strong>
            </div>
            <div class="responsive-card-field responsive-card-field-full">
              <span>角色</span>
              <strong>{{ joinList(item.roleNames) || "未分配角色" }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>最后登录</span>
              <strong>{{ formatDateTime(item.lastLoginAt) }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>账号状态</span>
              <strong>{{ lockHint(item) || "正常" }}</strong>
            </div>
          </div>
          <div class="responsive-card-actions">
            <button class="ghost-button" @click="startEdit(item)">编辑</button>
            <button v-if="canUnlockUser(item)" class="ghost-button" @click="unlockUser(item)">解锁</button>
            <button v-if="canManageOverrides" class="ghost-button" @click="selectOverrideUser(item)">特殊授权</button>
          </div>
        </article>
      </div>
      <div v-if="!loading && users.length === 0" class="empty-state tablet-card-empty">暂无用户数据</div>
      <div v-if="loading" class="muted-text">正在加载用户列表...</div>
    </section>

    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>{{ editingUserId ? "编辑用户" : "新增用户" }}</h2>
          <span class="tag tag-p0">P0</span>
        </div>
        <div class="detail-card actuator-form-tip">
          <div class="detail-label">表单说明</div>
          <div class="detail-value">这里维护账号基础资料与角色归属。临时提权、到期权限等特殊场景放在右侧“特殊授权”里单独处理。</div>
        </div>
        <form class="form-grid" @submit.prevent="saveUser">
          <label class="form-item">
            <span>用户名</span>
            <input v-model="form.username" type="text" :disabled="Boolean(editingUserId)" placeholder="登录用户名" />
          </label>
          <label class="form-item">
            <span>姓名</span>
            <input v-model="form.realName" type="text" placeholder="真实姓名" />
          </label>
          <label class="form-item">
            <span>手机号</span>
            <input v-model="form.phone" type="text" placeholder="可选" />
          </label>
          <label class="form-item">
            <span>邮箱</span>
            <input v-model="form.email" type="email" placeholder="可选" />
          </label>
          <label v-if="!editingUserId" class="form-item">
            <span>初始密码</span>
            <input v-model="form.password" type="password" placeholder="新建用户必填" />
          </label>
          <label class="form-item">
            <span>状态</span>
            <select v-model="form.status">
              <option value="enabled">启用</option>
              <option value="disabled">禁用</option>
              <option value="locked">锁定</option>
            </select>
          </label>
          <label class="form-item form-span">
            <span>角色</span>
            <select v-model="form.roleIds" multiple size="5">
              <option v-for="role in roles" :key="role.id" :value="role.id">
                {{ role.roleName }} ({{ role.roleCode }})
              </option>
            </select>
          </label>
          <label class="form-item form-span">
            <span>备注</span>
            <textarea v-model="form.remark" rows="3" placeholder="备注信息"></textarea>
          </label>
          <div class="form-actions form-span">
            <button class="ghost-button" type="button" @click="resetForm">清空</button>
            <button class="primary-button" :disabled="saving">
              {{ saving ? "保存中..." : editingUserId ? "保存修改" : "创建用户" }}
            </button>
          </div>
        </form>
      </div>

      <div v-if="canManageOverrides">
        <div class="panel-header">
          <h2>特殊授权</h2>
          <span class="tag tag-p1">{{ selectedOverrideUser?.username || "未选择用户" }}</span>
        </div>
        <div class="shadow-highlight-grid user-highlight-grid" v-if="selectedOverrideUser">
          <article class="detail-card shadow-highlight-card">
            <div class="detail-label">当前目标</div>
            <div class="shadow-highlight-value">{{ userPrimaryLabel(selectedOverrideUser) }}</div>
            <div class="shadow-highlight-copy">右侧新增的特殊授权只会作用在当前选中的用户上。</div>
          </article>
          <article class="detail-card shadow-highlight-card">
            <div class="detail-label">当前状态</div>
            <div class="shadow-highlight-value">{{ enumLabel("status", selectedOverrideUser.status) }}</div>
            <div class="shadow-highlight-copy">{{ lockHint(selectedOverrideUser) || "账号状态正常，可按需追加临时授权。" }}</div>
          </article>
        </div>
        <div class="detail-card">
          <div class="detail-label">当前目标用户</div>
          <div class="detail-value">
            {{ selectedOverrideUser ? `${selectedOverrideUser.realName} / ${selectedOverrideUser.username}` : "先在列表中选择用户" }}
          </div>
        </div>

        <form class="form-grid" @submit.prevent="saveOverride">
          <label class="form-item form-span">
            <span>权限点</span>
            <select v-model="overrideForm.permissionId" :disabled="!selectedOverrideUser">
              <option value="">请选择权限点</option>
              <option v-for="permission in permissions" :key="permission.id" :value="permission.id">
                {{ permission.permissionCode }} - {{ permission.permissionName }}
              </option>
            </select>
          </label>
          <label class="form-item">
            <span>生效方式</span>
            <select v-model="overrideForm.effectType" :disabled="!selectedOverrideUser">
              <option value="grant">授予</option>
              <option value="revoke">撤销</option>
            </select>
          </label>
          <label class="form-item">
            <span>临时授权</span>
            <select v-model="overrideForm.isTemporary" :disabled="!selectedOverrideUser">
              <option :value="false">否</option>
              <option :value="true">是</option>
            </select>
          </label>
          <label class="form-item">
            <span>生效时间</span>
            <input v-model="overrideForm.effectiveFrom" type="datetime-local" :disabled="!selectedOverrideUser" />
          </label>
          <label class="form-item">
            <span>失效时间</span>
            <input v-model="overrideForm.effectiveTo" type="datetime-local" :disabled="!selectedOverrideUser" />
          </label>
          <label class="form-item form-span">
            <span>原因说明</span>
            <textarea v-model="overrideForm.reasonText" rows="3" :disabled="!selectedOverrideUser" />
          </label>
          <div class="form-actions form-span">
            <button class="primary-button" :disabled="overrideSaving || !selectedOverrideUser">
              {{ overrideSaving ? "提交中..." : "新增特殊授权" }}
            </button>
          </div>
        </form>

        <table class="simple-table compact-table">
          <thead>
            <tr>
              <th>权限点</th>
              <th>类型</th>
              <th>生效时间</th>
              <th>失效时间</th>
              <th>临时</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in overrides" :key="item.id">
              <td>{{ item.permissionCode }}</td>
              <td>{{ enumLabel("effectType", item.effectType) }}</td>
              <td>{{ formatDateTime(item.effectiveFrom) }}</td>
              <td>{{ formatDateTime(item.effectiveTo) }}</td>
              <td>{{ item.isTemporary ? "是" : "否" }}</td>
            </tr>
            <tr v-if="selectedOverrideUser && overrides.length === 0">
              <td colspan="5" class="empty-cell">该用户暂无特殊授权</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { joinList, formatDateTime } from "../lib/format";
import { hasPermission } from "../lib/session";

const loading = ref(false);
const saving = ref(false);
const overrideSaving = ref(false);
const errorMessage = ref("");
const message = ref("");
const users = ref([]);
const roles = ref([]);
const permissions = ref([]);
const overrides = ref([]);
const editingUserId = ref(null);
const selectedOverrideUser = ref(null);

const filters = reactive({
  keyword: "",
  status: ""
});

const form = reactive({
  username: "",
  realName: "",
  phone: "",
  email: "",
  password: "",
  status: "enabled",
  roleIds: [],
  remark: ""
});

const overrideForm = reactive({
  permissionId: "",
  effectType: "grant",
  effectiveFrom: "",
  effectiveTo: "",
  isTemporary: false,
  reasonText: ""
});

const canManageOverrides = computed(() => hasPermission("permission:manage"));
const enabledUserCount = computed(() => users.value.filter((item) => item.status === "enabled").length);
const lockedUserCount = computed(() => users.value.filter((item) => canUnlockUser(item)).length);
const disabledUserCount = computed(() => users.value.filter((item) => item.status === "disabled").length);
const assignedRoleUserCount = computed(() => users.value.filter((item) => Array.isArray(item.roleNames) && item.roleNames.length > 0).length);

function statusTagClass(status) {
  if (status === "enabled") {
    return "tag-success";
  }
  if (status === "disabled") {
    return "tag-warning";
  }
  return "tag-danger";
}

function canUnlockUser(item) {
  return item.status === "locked" || Number(item.loginFailedAttempts || 0) > 0 || Boolean(item.lockedUntil);
}

function lockHint(item) {
  const hints = [];
  const failedAttempts = Number(item.loginFailedAttempts || 0);
  if (failedAttempts > 0) {
    hints.push(`失败 ${failedAttempts} 次`);
  }
  if (item.lockedUntil) {
    hints.push(`锁定至 ${formatDateTime(item.lockedUntil)}`);
  }
  return hints.join(" / ");
}

function userPrimaryLabel(item) {
  return item?.realName ? `${item.realName} / ${item.username}` : item?.username || "-";
}

function resetFilters() {
  filters.keyword = "";
  filters.status = "";
  loadUsers();
}

function resetForm() {
  editingUserId.value = null;
  form.username = "";
  form.realName = "";
  form.phone = "";
  form.email = "";
  form.password = "";
  form.status = "enabled";
  form.roleIds = [];
  form.remark = "";
}

function resetOverrideForm() {
  overrideForm.permissionId = "";
  overrideForm.effectType = "grant";
  overrideForm.effectiveFrom = "";
  overrideForm.effectiveTo = "";
  overrideForm.isTemporary = false;
  overrideForm.reasonText = "";
}

function startCreate() {
  message.value = "";
  errorMessage.value = "";
  resetForm();
}

function startEdit(item) {
  editingUserId.value = item.id;
  form.username = item.username;
  form.realName = item.realName;
  form.phone = item.phone || "";
  form.email = item.email || "";
  form.password = "";
  form.status = item.status || "enabled";
  form.roleIds = item.roleCodes
    .map((roleCode) => roles.value.find((role) => role.roleCode === roleCode)?.id)
    .filter(Boolean);
  form.remark = item.remark || "";
  message.value = "";
  errorMessage.value = "";
}

async function loadBaseData() {
  const roleRows = await apiRequest("/api/v1/system/role-options");
  roles.value = roleRows;

  if (canManageOverrides.value) {
    permissions.value = await apiRequest("/api/v1/system/permissions");
  }
}

async function loadUsers() {
  loading.value = true;
  errorMessage.value = "";
  try {
    users.value = await apiRequest(`/api/v1/system/users${buildQuery(filters)}`);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function saveUser() {
  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const payload = {
      username: form.username,
      realName: form.realName,
      phone: form.phone,
      email: form.email,
      password: form.password,
      status: form.status,
      roleIds: form.roleIds,
      remark: form.remark
    };

    if (editingUserId.value) {
      delete payload.password;
      await apiRequest(`/api/v1/system/users/${editingUserId.value}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      message.value = "用户已更新";
    } else {
      await apiRequest("/api/v1/system/users", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      message.value = "用户已创建";
    }
    resetForm();
    await loadUsers();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

async function unlockUser(item) {
  if (!window.confirm(`确认解锁账号 ${item.username} 吗？`)) {
    return;
  }

  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const result = await apiRequest(`/api/v1/system/users/${item.id}/unlock`, {
      method: "POST",
      body: JSON.stringify({})
    });
    if (editingUserId.value === item.id) {
      form.status = result.status || "enabled";
    }
    message.value = `账号 ${item.username} 已解锁`;
    await loadUsers();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

async function selectOverrideUser(item) {
  selectedOverrideUser.value = item;
  resetOverrideForm();
  errorMessage.value = "";
  try {
    overrides.value = await apiRequest(`/api/v1/system/users/${item.id}/permission-overrides`);
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function saveOverride() {
  if (!selectedOverrideUser.value) {
    return;
  }
  overrideSaving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/system/users/${selectedOverrideUser.value.id}/permission-overrides`, {
      method: "POST",
      body: JSON.stringify({
        permissionId: Number(overrideForm.permissionId),
        effectType: overrideForm.effectType,
        effectiveFrom: overrideForm.effectiveFrom || null,
        effectiveTo: overrideForm.effectiveTo || null,
        isTemporary: overrideForm.isTemporary,
        reasonText: overrideForm.reasonText
      })
    });
    message.value = "特殊授权已创建";
    await selectOverrideUser(selectedOverrideUser.value);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    overrideSaving.value = false;
  }
}

onMounted(async () => {
  await loadBaseData();
  await loadUsers();
});
</script>
