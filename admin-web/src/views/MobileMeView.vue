<template>
  <div class="stack">
    <section class="panel mobile-me-hero">
      <div class="panel-header">
        <div>
          <h2>我的</h2>
          <p class="panel-subtitle">手机端只保留现场高频动作，后台配置仍放在 PC 端处理。</p>
        </div>
      </div>

      <div class="mobile-me-summary-grid">
        <article class="detail-card">
          <span class="detail-label">当前账号</span>
          <strong>{{ session?.user?.realName || "未登录" }}</strong>
          <small>{{ session?.user?.username || "anonymous" }}</small>
        </article>
        <article class="detail-card">
          <span class="detail-label">当前租户</span>
          <strong>{{ session?.tenant?.tenantName || "未选择租户" }}</strong>
          <small>{{ session?.tenant?.tenantCode || "default" }}</small>
        </article>
        <article class="detail-card">
          <span class="detail-label">现场流程</span>
          <strong>5 个入口</strong>
          <small>看状态、收告警、点控制、查数据</small>
        </article>
      </div>

      <div class="mobile-me-status-strip">
        <article class="detail-card">
          <span class="detail-label">当前区域</span>
          <strong>{{ currentAreaLabel }}</strong>
          <small>{{ currentCameraLabel }}</small>
        </article>
        <article class="detail-card">
          <span class="detail-label">现场入口</span>
          <strong>{{ currentModuleLabel }}</strong>
          <small>当前正在查看的页面</small>
        </article>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>现场快捷动作</h2>
          <p class="panel-subtitle">把现场人员最常用的几个动作固定下来，减少跳转。</p>
        </div>
      </div>

      <div class="mobile-me-actions-grid">
        <button
          v-for="item in fieldActionItems"
          :key="item.path"
          type="button"
          class="mobile-me-action-card"
          @click="router.push(item.path)"
        >
          <strong>{{ item.title }}</strong>
          <span>{{ item.description }}</span>
        </button>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>主题外观</h2>
          <p class="panel-subtitle">在手机现场模式里也能快速切换主题。</p>
        </div>
      </div>

      <div class="theme-chip-list mobile-theme-chip-list">
        <button
          v-for="item in themeOptions"
          :key="item.value"
          type="button"
          class="theme-chip"
          :class="{ 'theme-chip-active': themePreset === item.value }"
          @click="applyTheme(item.value)"
        >
          {{ item.label }}
        </button>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>固定入口</h2>
          <p class="panel-subtitle">优先保留现场高频页，减少来回找菜单。</p>
        </div>
      </div>

      <div v-if="favoriteItems.length > 0" class="mobile-me-link-list">
        <button
          v-for="item in favoriteItems"
          :key="item.path"
          type="button"
          class="mobile-me-link-card"
          @click="router.push(item.path)"
        >
          <div class="mobile-me-link-main">
            <strong>{{ item.title }}</strong>
            <span>{{ item.groupTitle }}</span>
          </div>
          <small>{{ item.domainTitle }}</small>
        </button>
      </div>
      <div v-else class="empty-sidebar-tip">当前还没有现场固定入口，手机端只展示工作台、实时、告警、控制和历史数据。</div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>最近访问</h2>
          <p class="panel-subtitle">快速回到刚刚看过的现场页面。</p>
        </div>
      </div>

      <div v-if="recentItems.length > 0" class="mobile-me-link-list">
        <button
          v-for="item in recentItems"
          :key="item.path"
          type="button"
          class="mobile-me-link-card"
          @click="router.push(item.path)"
        >
          <div class="mobile-me-link-main">
            <strong>{{ item.title }}</strong>
            <span>{{ item.groupTitle }}</span>
          </div>
          <small>{{ item.domainTitle }}</small>
        </button>
      </div>
      <div v-else class="empty-sidebar-tip">最近还没有现场访问记录。</div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>账号动作</h2>
          <p class="panel-subtitle">手机端保留最常用的账号动作，复杂设置仍建议桌面端处理。</p>
        </div>
      </div>

      <div class="mobile-me-admin-note">
        <strong>后台管理入口已从手机端收起</strong>
        <span>系统设置、租户管理、权限管理建议在 PC 端操作，避免现场误触高危配置。</span>
      </div>

      <div class="mobile-me-actions">
        <button type="button" class="ghost-button" @click="router.push('/dashboard/overview')">回工作台</button>
        <button type="button" class="ghost-button danger-text" @click="logout">退出登录</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { logout as logoutRequest } from "../lib/api";
import { loadFavoriteNavigation, loadRecentNavigation } from "../lib/navigation";
import { THEME_CHANGE_EVENT, THEME_OPTIONS, getStoredThemePreset, updateThemePreference, type ThemePresetKey } from "../lib/theme";
import { useSessionStore } from "../stores/session";
import { flatModules } from "../config/modules";

const router = useRouter();
const route = useRoute();
const sessionStore = useSessionStore();
const { session } = storeToRefs(sessionStore);
const themePreset = ref(getStoredThemePreset());
const rawFavoriteItems = ref(loadFavoriteNavigation());
const rawRecentItems = ref(loadRecentNavigation());
const themeOptions = THEME_OPTIONS as Array<{ value: ThemePresetKey; label: string }>;
let removeThemeListener: (() => void) | null = null;

const fieldActionItems = [
  { title: "回工作台", path: "/dashboard/overview", description: "查看区域概况、天气和现场状态" },
  { title: "实时数据", path: "/monitor/realtime", description: "优先处理异常、低可信和补传数据" },
  { title: "告警处理", path: "/alerts/center", description: "确认、处理、关闭当前告警" },
  { title: "手动控制", path: "/controls/manual", description: "执行人工控制、强制控制和紧急停止" },
  { title: "最近数据", path: "/monitor/history", description: "查看近期趋势和历史采集记录" }
];
const fieldPathSet = new Set(fieldActionItems.map((item) => item.path));
const favoriteItems = computed(() => rawFavoriteItems.value.filter((item) => fieldPathSet.has(item.path)).slice(0, 5));
const recentItems = computed(() => rawRecentItems.value.filter((item) => fieldPathSet.has(item.path)).slice(0, 6));
const currentAreaLabel = computed(() => String(route.query.areaId || "未锁定区域"));
const currentCameraLabel = computed(() =>
  route.query.cameraId ? `当前摄像头 ${String(route.query.cameraId)}` : "未锁定摄像头"
);
const currentModuleLabel = computed(() => {
  const current = flatModules.find((item) => item.path === route.path);
  return current?.title || String(route.meta?.title || "现场模式");
});

async function applyTheme(nextThemePreset: ThemePresetKey) {
  themePreset.value = nextThemePreset;
  await updateThemePreference(nextThemePreset, { persistRemote: true });
}

async function logout() {
  const refreshToken = session.value?.refreshToken;
  if (refreshToken) {
    try {
      await logoutRequest(refreshToken);
    } catch {
      // ignore remote logout failure
    }
  }
  sessionStore.clearSession();
  router.push("/login");
}

onMounted(() => {
  const handleThemeChange = () => {
    themePreset.value = getStoredThemePreset();
  };
  window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  removeThemeListener = () => {
    window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  };
});

onBeforeUnmount(() => {
  removeThemeListener?.();
});
</script>
