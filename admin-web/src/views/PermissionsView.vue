<template>
  <div class="stack">
    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>角色权限模板</h2>
          <button class="ghost-button" @click="loadRoles">刷新角色</button>
        </div>
        <table class="simple-table compact-table">
          <thead>
            <tr>
              <th>角色</th>
              <th>层级</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="role in roles"
              :key="role.id"
              :class="{ 'table-row-active': selectedRole?.id === role.id }"
              @click="selectRole(role)"
            >
              <td>{{ role.roleName }}</td>
              <td>{{ role.roleLevel }}</td>
              <td>{{ enumLabel("status", role.status) }}</td>
            </tr>
            <tr v-if="!loading && roles.length === 0">
              <td colspan="3" class="empty-cell">暂无角色数据</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <div class="panel-header">
          <h2>权限配置</h2>
          <div class="inline-actions">
            <span class="tag tag-p0">{{ selectedRole?.roleName || "未选择角色" }}</span>
            <button class="primary-button" :disabled="saving || !selectedRole" @click="savePermissions">
              {{ saving ? "保存中..." : "保存角色权限" }}
            </button>
          </div>
        </div>

        <div v-if="message" class="success-text">{{ message }}</div>
        <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

        <div v-if="selectedRole" class="stack">
          <div class="detail-card">
            <div class="detail-label">当前角色可见菜单</div>
            <div class="chip-list">
              <span v-for="item in visibleModules" :key="item.code" class="chip chip-permission">
                {{ item.groupTitle }} / {{ item.title }}
              </span>
              <span v-if="visibleModules.length === 0" class="muted-text">当前未分配任何可见菜单</span>
            </div>
          </div>
          <div
            v-for="[moduleCode, items] in groupedPermissions"
            :key="moduleCode"
            class="permission-group"
          >
            <div class="permission-group-title">{{ moduleCode }}</div>
            <div class="permission-grid">
              <label v-for="item in items" :key="item.id" class="checkbox-card">
                <input
                  v-model="checkedPermissionIds"
                  type="checkbox"
                  :value="item.id"
                />
                <div>
                  <div class="checkbox-title">{{ item.permissionCode }}</div>
                  <div class="checkbox-desc">{{ item.permissionName }}</div>
                </div>
              </label>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">先从左侧选择一个角色。</div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { apiRequest } from "../lib/api";
import { flatModules } from "../config/modules";
import { enumLabel } from "../lib/enum-display";

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const message = ref("");
const roles = ref([]);
const selectedRole = ref(null);
const permissions = ref([]);
const checkedPermissionIds = ref([]);

const groupedPermissions = computed(() => {
  const groups = new Map();
  for (const item of permissions.value) {
    if (!groups.has(item.moduleCode)) {
      groups.set(item.moduleCode, []);
    }
    groups.get(item.moduleCode).push(item);
  }
  return Array.from(groups.entries());
});

const visibleModules = computed(() => {
  const granted = new Set(
    permissions.value
      .filter((item) => checkedPermissionIds.value.includes(item.id))
      .map((item) => item.permissionCode)
  );

  return flatModules.filter((module) => {
    if (!Array.isArray(module.permissions) || module.permissions.length === 0) {
      return true;
    }
    return module.permissions.some((permissionCode) => granted.has(permissionCode));
  });
});

async function loadRoles() {
  loading.value = true;
  errorMessage.value = "";
  try {
    roles.value = await apiRequest("/api/v1/system/role-options");
    const queryRoleId = Number(route.query.roleId || 0);
    const matchedRole = roles.value.find((item) => item.id === queryRoleId);
    const targetRole = matchedRole || selectedRole.value || roles.value[0];
    if (targetRole) {
      await selectRole(targetRole);
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function selectRole(role) {
  selectedRole.value = role;
  if (String(route.query.roleId || "") !== String(role.id)) {
    router.replace({
      path: route.path,
      query: {
        ...route.query,
        roleId: String(role.id)
      }
    });
  }
  message.value = "";
  errorMessage.value = "";
  try {
    permissions.value = await apiRequest(`/api/v1/system/roles/${role.id}/permissions`);
    checkedPermissionIds.value = permissions.value
      .filter((item) => item.checked)
      .map((item) => item.id);
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function savePermissions() {
  if (!selectedRole.value) {
    return;
  }
  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/system/roles/${selectedRole.value.id}/permissions`, {
      method: "PUT",
      body: JSON.stringify({
        permissionIds: checkedPermissionIds.value
      })
    });
    message.value = "角色权限已更新";
    await selectRole(selectedRole.value);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

onMounted(loadRoles);
</script>
