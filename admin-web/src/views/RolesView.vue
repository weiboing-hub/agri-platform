<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>角色管理</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadRoles">刷新</button>
          <button class="primary-button" @click="startCreate">新增角色</button>
        </div>
      </div>

      <div class="muted-text">
        角色本身定义“谁是什么角色”；真正决定该角色能看到哪些菜单、能点哪些按钮的是角色权限模板。
      </div>

      <div class="metric-strip actuator-summary-strip">
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ roles.length }}</div>
          <div class="stat-desc">当前角色</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ enabledRoleCount }}</div>
          <div class="stat-desc">已启用</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ disabledRoleCount }}</div>
          <div class="stat-desc">已停用</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ totalAssignedUsers }}</div>
          <div class="stat-desc">关联用户</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ totalPermissionBindings }}</div>
          <div class="stat-desc">权限绑定</div>
        </article>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table">
        <thead>
          <tr>
            <th>角色</th>
            <th>层级</th>
            <th>状态</th>
            <th>用户数</th>
            <th>权限数</th>
            <th>描述</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in roles" :key="item.id">
            <td>
              <div class="table-primary-cell">
                <strong>{{ item.roleName }}</strong>
                <span>{{ item.roleCode }}</span>
              </div>
            </td>
            <td>{{ item.roleLevel }}</td>
            <td><span class="tag" :class="item.status === 'enabled' ? 'tag-success' : 'tag-warning'">{{ enumLabel("status", item.status) }}</span></td>
            <td>{{ item.userCount }}</td>
            <td>{{ item.permissionCount }}</td>
            <td>{{ item.description || "-" }}</td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click="selectedRole = item">查看</button>
                <button class="table-link" @click="startEdit(item)">编辑</button>
                <button class="table-link" @click="configurePermissions(item)">配置菜单/权限</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && roles.length === 0">
            <td colspan="7" class="empty-cell">暂无角色数据</td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="muted-text">正在加载角色列表...</div>
    </section>

    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>{{ editingRoleId ? "编辑角色" : "新增角色" }}</h2>
          <span class="tag tag-p1">P1</span>
        </div>

        <div class="detail-card actuator-form-tip">
          <div class="detail-label">表单说明</div>
          <div class="detail-value">角色定义的是职责边界和默认权限模板。真正的菜单、按钮、接口权限仍通过“配置菜单/权限”维护。</div>
        </div>

        <form class="form-grid" @submit.prevent="saveRole">
          <label class="form-item">
            <span>角色编码</span>
            <input v-model="form.roleCode" type="text" :disabled="Boolean(editingRoleId)" placeholder="role_code" />
          </label>
          <label class="form-item">
            <span>角色名称</span>
            <input v-model="form.roleName" type="text" placeholder="角色名称" />
          </label>
          <label class="form-item">
            <span>角色层级</span>
            <input v-model="form.roleLevel" type="number" min="1" />
          </label>
          <label class="form-item">
            <span>状态</span>
            <select v-model="form.status">
                <option value="enabled">{{ enumLabel("status", "enabled") }}</option>
                <option value="disabled">{{ enumLabel("status", "disabled") }}</option>
            </select>
          </label>
          <label class="form-item form-span">
            <span>描述</span>
            <textarea v-model="form.description" rows="3" placeholder="角色职责说明" />
          </label>
          <div class="form-actions form-span">
            <button class="ghost-button" type="button" @click="resetForm">清空</button>
            <button class="primary-button" :disabled="saving">
              {{ saving ? "保存中..." : editingRoleId ? "保存修改" : "创建角色" }}
            </button>
          </div>
        </form>
      </div>

      <div>
        <div class="panel-header">
          <h2>角色概览</h2>
          <span class="tag tag-p1">{{ selectedRole?.roleCode || "未选择角色" }}</span>
        </div>

        <div v-if="selectedRole" class="stack">
          <div class="shadow-highlight-grid user-highlight-grid">
            <article class="detail-card shadow-highlight-card">
              <div class="detail-label">角色名称</div>
              <div class="shadow-highlight-value">{{ selectedRole.roleName }}</div>
              <div class="shadow-highlight-copy">编码：{{ selectedRole.roleCode }}</div>
            </article>
            <article class="detail-card shadow-highlight-card">
              <div class="detail-label">当前状态</div>
              <div class="shadow-highlight-value">{{ enumLabel("status", selectedRole.status) }}</div>
              <div class="shadow-highlight-copy">层级 {{ selectedRole.roleLevel }}，建议越小代表越高权限。</div>
            </article>
            <article class="detail-card shadow-highlight-card">
              <div class="detail-label">关联用户</div>
              <div class="shadow-highlight-value">{{ selectedRole.userCount }}</div>
              <div class="shadow-highlight-copy">当前有多少用户继承该角色的默认权限。</div>
            </article>
            <article class="detail-card shadow-highlight-card">
              <div class="detail-label">权限模板</div>
              <div class="shadow-highlight-value">{{ selectedRole.permissionCount }}</div>
              <div class="shadow-highlight-copy">建议在“配置菜单/权限”里继续维护角色模板。</div>
            </article>
          </div>

          <div class="detail-card">
            <div class="detail-label">角色说明</div>
            <div class="detail-value">{{ selectedRole.description || "暂无说明" }}</div>
          </div>

          <div class="inline-actions">
            <button class="ghost-button" @click="startEdit(selectedRole)">编辑当前角色</button>
            <button class="primary-button" @click="configurePermissions(selectedRole)">配置菜单/权限</button>
          </div>
        </div>
        <div v-else class="empty-state">从列表选择一个角色查看职责概览。</div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { apiRequest } from "../lib/api";
import { enumLabel } from "../lib/enum-display";

const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const message = ref("");
const roles = ref([]);
const editingRoleId = ref(null);
const selectedRole = ref(null);

const form = reactive({
  roleCode: "",
  roleName: "",
  roleLevel: 100,
  status: "enabled",
  description: ""
});

const enabledRoleCount = computed(() => roles.value.filter((item) => item.status === "enabled").length);
const disabledRoleCount = computed(() => roles.value.filter((item) => item.status === "disabled").length);
const totalAssignedUsers = computed(() => roles.value.reduce((sum, item) => sum + Number(item.userCount || 0), 0));
const totalPermissionBindings = computed(() => roles.value.reduce((sum, item) => sum + Number(item.permissionCount || 0), 0));

function resetForm() {
  editingRoleId.value = null;
  form.roleCode = "";
  form.roleName = "";
  form.roleLevel = 100;
  form.status = "enabled";
  form.description = "";
}

function startCreate() {
  resetForm();
  selectedRole.value = null;
  message.value = "";
  errorMessage.value = "";
}

function startEdit(item) {
  selectedRole.value = item;
  editingRoleId.value = item.id;
  form.roleCode = item.roleCode;
  form.roleName = item.roleName;
  form.roleLevel = item.roleLevel;
  form.status = item.status;
  form.description = item.description || "";
}

function configurePermissions(item) {
  router.push({
    path: "/system/permissions",
    query: {
      roleId: String(item.id)
    }
  });
}

async function loadRoles() {
  loading.value = true;
  errorMessage.value = "";
  try {
    roles.value = await apiRequest("/api/v1/system/roles");
    if (selectedRole.value) {
      selectedRole.value = roles.value.find((item) => item.id === selectedRole.value.id) || roles.value[0] || null;
    } else {
      selectedRole.value = roles.value[0] || null;
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function saveRole() {
  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const payload = {
      roleCode: form.roleCode,
      roleName: form.roleName,
      roleLevel: Number(form.roleLevel) || 100,
      status: form.status,
      description: form.description
    };

    if (editingRoleId.value) {
      await apiRequest(`/api/v1/system/roles/${editingRoleId.value}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      message.value = "角色已更新";
    } else {
      await apiRequest("/api/v1/system/roles", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      message.value = "角色已创建";
    }

    resetForm();
    await loadRoles();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

onMounted(loadRoles);
</script>
