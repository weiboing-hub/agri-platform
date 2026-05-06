<template>
  <div class="login-shell">
    <div class="login-card">
      <div class="login-head">
        <div class="login-badge">WB</div>
        <div>
          <h1>智能农业后台</h1>
        </div>
      </div>

      <form class="login-form" @submit.prevent="submitLogin">
        <label v-if="tenantOptions.length > 0" class="form-item">
          <span>租户</span>
          <select v-model="form.tenantIdentifier">
            <option v-for="tenant in tenantOptions" :key="tenant.tenantCode || tenant.id" :value="tenant.tenantCode">
              {{ tenant.tenantName }}{{ tenant.isDefault ? "（默认）" : "" }}
            </option>
          </select>
        </label>

        <label class="form-item">
          <span>用户名</span>
          <input v-model="form.username" type="text" placeholder="请输入当前管理员账号" />
        </label>

        <label class="form-item">
          <span>密码</span>
          <input v-model="form.password" type="password" placeholder="请输入当前密码" />
        </label>

        <button class="primary-button" :disabled="submitting">
          {{ submitting ? "登录中..." : "登录" }}
        </button>
      </form>

      <div v-if="errorMessage" class="error-text">{{ errorMessage }}</div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ApiError, listLoginTenants, loginWithTenant } from "../lib/api";
import { saveSession } from "../lib/session";
import { canAccessModule, findModuleByPath, getFirstAccessiblePath } from "../config/modules";
import { syncThemePreference } from "../lib/theme";

const route = useRoute();
const router = useRouter();
const submitting = ref(false);
const errorMessage = ref("");
const tenantOptions = ref([]);
const form = reactive({
  tenantIdentifier: "",
  username: "",
  password: ""
});

onMounted(async () => {
  try {
    const tenants = await listLoginTenants();
    tenantOptions.value = Array.isArray(tenants) ? tenants : [];
    const queryTenant = String(route.query?.tenant || "").trim();
    const defaultTenant = tenantOptions.value.find((item) => item.isDefault) || tenantOptions.value[0] || null;
    form.tenantIdentifier = queryTenant || defaultTenant?.tenantCode || "";
  } catch {
    tenantOptions.value = [];
    form.tenantIdentifier = String(route.query?.tenant || "").trim();
  }
});

function resolvePostLoginPath(permissionCodes = []) {
  const fallbackPath = getFirstAccessiblePath(permissionCodes);
  const isMobileViewport = typeof window !== "undefined" && window.innerWidth <= 720;
  const dashboardModule = findModuleByPath("/dashboard/overview");

  if (isMobileViewport && dashboardModule && canAccessModule(dashboardModule, permissionCodes)) {
    return "/dashboard/overview";
  }

  return fallbackPath;
}

async function submitLogin() {
  submitting.value = true;
  errorMessage.value = "";
  try {
    const session = await loginWithTenant(form.username, form.password, form.tenantIdentifier);
    saveSession(session);
    await syncThemePreference();
    router.push(resolvePostLoginPath(session.permissionCodes || []));
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.code === "account_locked") {
        errorMessage.value = "登录失败次数过多，账号已临时锁定，请稍后再试。";
      } else if (error.code === "rate_limited") {
        errorMessage.value = "登录尝试过于频繁，请稍后再试。";
      } else if (error.code === "account_disabled") {
        errorMessage.value = "账号已被禁用，请联系管理员。";
      } else {
        errorMessage.value = error.message;
      }
      return;
    }
    errorMessage.value = error.message;
  } finally {
    submitting.value = false;
  }
}
</script>
