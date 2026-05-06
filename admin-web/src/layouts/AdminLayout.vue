<template>
  <div class="shell" :class="{ 'shell-mobile-mode': isFieldMobile }">
    <button v-if="sidebarOpen" type="button" class="sidebar-backdrop" @click="closeSidebar" />

    <aside class="sidebar" :class="{ 'sidebar-open': sidebarOpen }">
      <div class="brand">
        <div class="brand-badge">WB</div>
        <div>
          <div class="brand-title">智能农业后台</div>
        </div>
        <button type="button" class="ghost-button sidebar-close-button" @click="closeSidebar">关闭</button>
      </div>

      <div v-if="visibleDomains.length > 0" class="sidebar-domain-switcher sidebar-animate-block">
        <div class="sidebar-section-label">导航分域</div>
        <div class="domain-tabs">
          <button
            v-for="domain in visibleDomains"
            :key="domain.code"
            type="button"
            class="domain-tab"
            :class="{ 'domain-tab-active': activeDomain?.code === domain.code }"
            @click="navigateToDomain(domain)"
          >
            <strong>
              <component :is="getDomainIcon(domain.code)" class="nav-inline-icon" />
              <span>{{ domain.shortTitle }}</span>
            </strong>
            <small>{{ domain.pageCount }} 项</small>
          </button>
        </div>
      </div>

      <nav class="nav-groups sidebar-animate-block">
        <section v-for="group in activeDomainGroups" :key="group.code" class="nav-group">
          <div class="nav-group-head">
            <div class="nav-group-title">{{ group.title }}</div>
            <div class="nav-group-count">{{ group.pages.length }}</div>
          </div>
          <RouterLink
            v-for="page in group.pages"
            :key="page.code"
            :to="page.path"
            class="nav-link"
            active-class="nav-link-active"
          >
            <component :is="getPageIcon(page.code)" class="nav-link-icon" />
            <span>{{ page.title }}</span>
          </RouterLink>
        </section>
        <div v-if="activeDomainGroups.length === 0" class="empty-sidebar-tip">
          当前账号还没有任何可见菜单。
        </div>
      </nav>
    </aside>

    <main class="content" :class="{ 'content-mobile-mode': isFieldMobile }">
      <header class="topbar">
        <div class="topbar-main">
          <button type="button" class="ghost-button sidebar-toggle" @click="toggleNavigationPanel">
            <Menu class="button-inline-icon" />
            {{ isFieldMobile ? "现场" : "菜单" }}
          </button>
          <div class="topbar-heading">
            <h1 class="page-title">{{ currentPageTitle }}</h1>
            <p class="page-subtitle">{{ currentPageSubtitle }}</p>
          </div>
        </div>
        <div class="topbar-actions">
          <div class="topbar-clock-badge">北京时间 · {{ currentDateTimeLabel }}</div>

          <div v-if="!isFieldMobile" ref="toolsMenuRef" class="topbar-menu-wrap">
            <button class="ghost-button topbar-menu-trigger" @click.stop="toggleToolsMenu">
              <Wrench class="button-inline-icon" />
              <span>工具</span>
              <small>Ctrl/Cmd + K</small>
            </button>
            <div v-if="toolsMenuOpen" class="topbar-menu-panel topbar-tools-panel">
              <section class="topbar-menu-section">
                <div class="topbar-menu-label">页面工具</div>
                <button v-if="currentModule" type="button" class="topbar-menu-button" @click="toggleCurrentFavorite">
                  <Star class="button-inline-icon" />
                  {{ isCurrentFavorite ? "取消固定当前页" : "固定当前页" }}
                </button>
                <button type="button" class="topbar-menu-button" @click="openPaletteFromMenu">
                  <Search class="button-inline-icon" />
                  快速打开页面
                </button>
              </section>

              <section v-if="favoriteItems.length > 0" class="topbar-menu-section">
                <div class="topbar-menu-label">固定入口</div>
                <div class="topbar-menu-list">
                  <button
                    v-for="item in favoriteItems"
                    :key="item.path"
                    type="button"
                    class="topbar-menu-link"
                    @click="goToPath(item.path)"
                  >
                    <div class="topbar-menu-link-main">
                      <strong>
                        <component :is="getPageIcon(item.code)" class="nav-inline-icon" />
                        <span>{{ item.title }}</span>
                      </strong>
                      <span>{{ item.groupTitle }}</span>
                    </div>
                    <small>{{ item.domainTitle }}</small>
                  </button>
                </div>
              </section>

              <section class="topbar-menu-section">
                <div class="topbar-menu-label">主题外观</div>
                <div class="theme-chip-list">
                  <button
                    v-for="item in THEME_OPTIONS"
                    :key="item.value"
                    type="button"
                    class="theme-chip"
                    :class="{ 'theme-chip-active': themePreset === item.value }"
                    @click="applyThemeOption(item.value)"
                  >
                    {{ item.label }}
                  </button>
                </div>
              </section>
            </div>
          </div>

          <div v-if="!isFieldMobile" ref="profileMenuRef" class="topbar-menu-wrap">
            <button class="ghost-button topbar-profile-trigger" @click.stop="toggleProfileMenu">
              <CircleUserRound class="button-inline-icon topbar-profile-icon" />
              <span>{{ session?.user?.realName || "未登录" }}</span>
              <small>{{ session?.tenant?.tenantName || "未选择租户" }}</small>
            </button>
            <div v-if="profileMenuOpen" class="topbar-menu-panel topbar-profile-panel">
              <section class="topbar-menu-section">
                <div class="topbar-menu-label">当前账号</div>
                <div class="topbar-profile-summary">
                  <strong>{{ session?.user?.realName || "未登录" }}</strong>
                  <span>{{ session?.user?.username || "anonymous" }}</span>
                  <small>{{ session?.tenant?.tenantName || "未选择租户" }}</small>
                </div>
              </section>
              <section class="topbar-menu-section">
                <button type="button" class="topbar-menu-button danger-text" @click="logout">
                  <LogOut class="button-inline-icon" />
                  退出登录
                </button>
              </section>
            </div>
          </div>
        </div>
      </header>

      <section class="page-body">
        <RouterView v-slot="{ Component, route: currentRoute }">
          <RouteErrorBoundary :reset-key="currentRoute.name || currentRoute.path">
            <component :is="Component" :key="currentRoute.name || currentRoute.path" />
          </RouteErrorBoundary>
        </RouterView>
      </section>

      <nav v-if="isFieldMobile" class="mobile-bottom-nav" aria-label="手机现场导航">
        <RouterLink
          v-for="item in mobileVisibleNavItems"
          :key="item.key"
          :to="buildMobileFieldRoute(item.path)"
          class="mobile-bottom-nav-link"
          :class="{ 'mobile-bottom-nav-link-active': route.path === item.path }"
        >
          <component :is="item.icon" class="mobile-bottom-nav-icon" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
    </main>
  </div>

  <Teleport to="body">
    <Transition name="mobile-sheet-transition">
      <div v-if="isFieldMobile && mobileMenuOpen" class="mobile-menu-sheet-wrap">
        <button type="button" class="mobile-menu-sheet-backdrop" @click="closeMobileMenu" />
        <section class="mobile-menu-sheet">
          <div class="mobile-menu-sheet-head">
            <div>
              <div class="mobile-menu-sheet-kicker">现场模式</div>
              <div class="mobile-menu-sheet-title">现场流程</div>
            </div>
            <button type="button" class="ghost-button" @click="closeMobileMenu">关闭</button>
          </div>

          <div class="mobile-menu-sheet-meta">
            <div class="mobile-menu-sheet-meta-card">
              <span>当前账号</span>
              <strong>{{ session?.user?.realName || "未登录" }}</strong>
              <small>{{ session?.tenant?.tenantName || "未选择租户" }}</small>
            </div>
            <div class="mobile-menu-sheet-meta-card">
              <span>当前时间</span>
              <strong>{{ currentDateTimeLabel }}</strong>
              <small>{{ activeDomain?.title || "智能农业后台" }}</small>
            </div>
          </div>

          <section class="mobile-menu-sheet-section">
            <div class="mobile-menu-sheet-label">现场高频入口</div>
            <div class="mobile-field-flow-list">
              <button
                v-for="(item, index) in mobileVisibleNavItems"
                :key="item.key"
                type="button"
                class="mobile-field-flow-card"
                :class="{ 'mobile-field-flow-card-active': route.path === item.path }"
                @click="goToMobileFieldPath(item.path)"
              >
                <span class="mobile-field-flow-number">{{ index + 1 }}</span>
                <component :is="item.icon" class="mobile-field-flow-icon" />
                <span class="mobile-field-flow-copy">
                  <strong>{{ item.label }}</strong>
                  <small>{{ item.description }}</small>
                </span>
              </button>
            </div>
          </section>

          <section v-if="mobileSecondaryItems.length > 0" class="mobile-menu-sheet-section">
            <div class="mobile-menu-sheet-label">最近数据</div>
            <div class="mobile-menu-shortcut-list">
              <button
                v-for="item in mobileSecondaryItems"
                :key="item.path"
                type="button"
                class="mobile-menu-shortcut"
                @click="goToMobileFieldPath(item.path)"
              >
                <component :is="getPageIcon(item.code)" class="mobile-menu-shortcut-icon" />
                <div class="mobile-menu-shortcut-copy">
                  <strong>{{ item.label }}</strong>
                  <span>{{ item.description }}</span>
                </div>
              </button>
            </div>
          </section>

          <section class="mobile-menu-sheet-section">
            <div class="mobile-menu-sheet-label">账号动作</div>
            <div class="mobile-menu-actions">
              <button type="button" class="mobile-menu-action" @click="goToPath('/mobile/me')">
                <CircleUserRound class="button-inline-icon" />
                打开我的
              </button>
              <button type="button" class="mobile-menu-action danger-text" @click="logout">
                <LogOut class="button-inline-icon" />
                退出登录
              </button>
            </div>
          </section>

          <section class="mobile-menu-sheet-section">
            <div class="mobile-menu-sheet-label">主题外观</div>
            <div class="theme-chip-list mobile-theme-chip-list">
              <button
                v-for="item in THEME_OPTIONS"
                :key="item.value"
                type="button"
                class="theme-chip"
                :class="{ 'theme-chip-active': themePreset === item.value }"
                @click="applyThemeOption(item.value)"
              >
                {{ item.label }}
              </button>
            </div>
          </section>
        </section>
      </div>
    </Transition>
  </Teleport>

  <Teleport to="body">
    <Transition name="palette-transition">
      <div v-if="paletteOpen" class="command-palette-overlay" @click.self="closePalette">
        <div class="command-palette">
          <div class="command-palette-head">
            <div>
              <div class="command-palette-title">快速打开</div>
              <div class="command-palette-subtitle">输入页面名、分组名或业务词，回车直达。</div>
            </div>
            <button type="button" class="ghost-button" @click="closePalette">关闭</button>
          </div>

          <input
            ref="paletteInputRef"
            v-model="paletteQuery"
            class="command-palette-input"
            type="text"
            placeholder="例如：实时、告警、租户、摄像头、凭证"
          />

          <div class="command-palette-results">
            <button
              v-for="(item, index) in paletteResults"
              :key="item.path"
              type="button"
              class="command-palette-item"
              :class="{ 'command-palette-item-active': index === paletteActiveIndex }"
              @click="navigateFromPalette(item)"
            >
              <div class="command-palette-item-main">
                <strong>
                  <component :is="getPageIcon(item.code)" class="nav-inline-icon" />
                  <span>{{ item.title }}</span>
                </strong>
                <span>{{ item.groupTitle }}</span>
              </div>
              <small>{{ item.domainTitle }}</small>
            </button>
            <div v-if="paletteResults.length === 0" class="command-palette-empty">
              没有匹配到可访问页面。
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import { Activity, CircleUserRound, LayoutDashboard, LogOut, Menu, Power, Search, Siren, Star, Wrench } from "lucide-vue-next";
import RouteErrorBoundary from "../components/RouteErrorBoundary.vue";
import { findDomainByPath, findModuleByPath, getVisibleNavigationDomains } from "../config/modules";
import { loadFavoriteNavigation, rememberRecentModule, loadRecentNavigation, toggleFavoriteModule } from "../lib/navigation";
import { domainIcons, pageIcons } from "../lib/navigation-icons";
import { logout as logoutRequest } from "../lib/api";
import { getStoredThemePreset, syncThemePreference, THEME_CHANGE_EVENT, THEME_OPTIONS, updateThemePreference } from "../lib/theme";
import { useSessionStore } from "../stores/session";

const route = useRoute();
const router = useRouter();
const sessionStore = useSessionStore();
const { session } = storeToRefs(sessionStore);

const themePreset = ref(getStoredThemePreset());
const recentNavigation = ref(loadRecentNavigation());
const favoriteNavigation = ref(loadFavoriteNavigation());
const paletteOpen = ref(false);
const paletteQuery = ref("");
const paletteActiveIndex = ref(0);
const paletteInputRef = ref(null);
const nowTick = ref(Date.now());
const selectedDomainCode = ref("");
const sidebarOpen = ref(false);
const mobileMenuOpen = ref(false);
const toolsMenuOpen = ref(false);
const profileMenuOpen = ref(false);
const toolsMenuRef = ref(null);
const profileMenuRef = ref(null);
let dateTimer = null;
let removeThemeListener = null;
const viewportWidth = ref(typeof window === "undefined" ? 1440 : window.innerWidth);

const currentModule = computed(() => findModuleByPath(route.path));
const currentPageTitle = computed(() => currentModule.value?.title || String(route.meta?.title || "智能农业后台"));
const currentPageSubtitle = computed(
  () => currentModule.value?.purpose || String(route.meta?.purpose || "先固化结构，再逐页替换为真实业务组件。")
);
const currentDateTimeLabel = computed(() =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(nowTick.value)
);
const visibleDomains = computed(() => getVisibleNavigationDomains(session.value?.permissionCodes || []));
const routeDomain = computed(
  () => findDomainByPath(route.path, session.value?.permissionCodes || []) || visibleDomains.value[0] || null
);
const activeDomain = computed(() => {
  const preferred = visibleDomains.value.find((domain) => domain.code === selectedDomainCode.value);
  return preferred || routeDomain.value || null;
});
const activeDomainGroups = computed(() => activeDomain.value?.groups || []);
const visiblePages = computed(() =>
  visibleDomains.value.flatMap((domain) =>
    domain.groups.flatMap((group) =>
      group.pages.map((page) => ({
        ...page,
        groupTitle: group.title,
        groupCode: group.code,
        domainTitle: domain.title,
        domainCode: domain.code
      }))
    )
  )
);
const visiblePathSet = computed(() => new Set(visiblePages.value.map((item) => item.path)));
const favoriteItems = computed(() =>
  favoriteNavigation.value.filter((item) => visiblePathSet.value.has(item.path)).slice(0, 6)
);
const isCurrentFavorite = computed(() =>
  favoriteNavigation.value.some((item) => item.path === currentModule.value?.path)
);
const paletteResults = computed(() => {
  const keyword = paletteQuery.value.trim().toLowerCase();
  if (!keyword) {
    return visiblePages.value.slice(0, 12);
  }

  return visiblePages.value
    .filter((item) =>
      [item.title, item.groupTitle, item.domainTitle, item.purpose]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(keyword))
    )
    .slice(0, 12);
});
const isFieldMobile = computed(() => viewportWidth.value <= 720);
const mobileNavItems = [
  { key: "dashboard", path: "/dashboard/overview", label: "工作台", description: "先看区域状态和今日概况", icon: LayoutDashboard },
  { key: "realtime", path: "/monitor/realtime", label: "实时", description: "查看温湿度、传感器和异常点", icon: Activity },
  { key: "alerts", path: "/alerts/center", label: "告警", description: "确认、处理、关闭现场告警", icon: Siren },
  { key: "control", path: "/controls/manual", label: "控制", description: "现场手动开关和紧急停止", icon: Power },
  { key: "me", path: "/mobile/me", label: "我的", description: "账号、主题和现场快捷入口", icon: CircleUserRound }
];
const mobileSecondaryNavItems = [
  { key: "history", code: "monitor_history", path: "/monitor/history", label: "历史数据", description: "查看最近趋势和采集记录" }
];
const mobileVisibleNavItems = computed(() =>
  mobileNavItems.filter((item) => item.path.startsWith("/mobile/") || visiblePathSet.value.has(item.path))
);
const mobileSecondaryItems = computed(() =>
  mobileSecondaryNavItems.filter((item) => visiblePathSet.value.has(item.path)).slice(0, 2)
);

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function getDomainIcon(domainCode) {
  return domainIcons[domainCode] || Wrench;
}

function getPageIcon(pageCode) {
  return pageIcons[pageCode] || Search;
}

async function logout() {
  const refreshToken = session.value?.refreshToken;
  if (refreshToken) {
    try {
      await logoutRequest(refreshToken);
    } catch {
      // Ignore remote logout failures and still clear local session.
    }
  }
  sessionStore.clearSession();
  closeMenus();
  router.push("/login");
}

async function applyThemeOption(nextThemePreset) {
  themePreset.value = nextThemePreset;
  await updateThemePreference(themePreset.value, { persistRemote: true });
}

function toggleCurrentFavorite() {
  if (!currentModule.value) {
    return;
  }
  favoriteNavigation.value = toggleFavoriteModule(currentModule.value);
}

function closeMenus() {
  toolsMenuOpen.value = false;
  profileMenuOpen.value = false;
}

function closeSidebar() {
  sidebarOpen.value = false;
  mobileMenuOpen.value = false;
}

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
}

function closeMobileMenu() {
  mobileMenuOpen.value = false;
}

function toggleNavigationPanel() {
  if (isFieldMobile.value) {
    mobileMenuOpen.value = !mobileMenuOpen.value;
    sidebarOpen.value = false;
    closeMenus();
    return;
  }
  toggleSidebar();
}

function goToPath(path) {
  closeSidebar();
  closeMenus();
  if (!path || path === route.path) {
    return;
  }
  router.push(path);
}

function goToMobileFieldPath(path) {
  closeSidebar();
  closeMenus();
  if (!path) {
    return;
  }
  router.push(buildMobileFieldRoute(path));
}

function navigateToDomain(domain) {
  if (!domain?.code) {
    selectedDomainCode.value = routeDomain.value?.code || visibleDomains.value[0]?.code || "";
    return;
  }
  selectedDomainCode.value = domain.code;
}

function buildMobileFieldRoute(path) {
  const query = {};
  const areaId = firstQueryValue(route.query.areaId);
  if (areaId) {
    query.areaId = String(areaId);
  }
  if (path === "/monitor/camera-timeline") {
    const cameraId = firstQueryValue(route.query.cameraId);
    if (cameraId) {
      query.cameraId = String(cameraId);
    }
  }
  return { path, query };
}

function closePalette() {
  paletteOpen.value = false;
  paletteQuery.value = "";
  paletteActiveIndex.value = 0;
}

function openPalette() {
  closeMobileMenu();
  closeMenus();
  paletteOpen.value = true;
  paletteActiveIndex.value = 0;
  nextTick(() => {
    paletteInputRef.value?.focus();
    paletteInputRef.value?.select?.();
  });
}

function openPaletteFromMenu() {
  openPalette();
}

function navigateFromPalette(item) {
  closePalette();
  goToPath(item?.path);
}

function toggleToolsMenu() {
  toolsMenuOpen.value = !toolsMenuOpen.value;
  if (toolsMenuOpen.value) {
    profileMenuOpen.value = false;
  }
}

function toggleProfileMenu() {
  profileMenuOpen.value = !profileMenuOpen.value;
  if (profileMenuOpen.value) {
    toolsMenuOpen.value = false;
  }
}

function movePaletteSelection(offset) {
  if (paletteResults.value.length === 0) {
    paletteActiveIndex.value = 0;
    return;
  }
  const nextIndex = paletteActiveIndex.value + offset;
  const maxIndex = paletteResults.value.length - 1;
  if (nextIndex < 0) {
    paletteActiveIndex.value = maxIndex;
    return;
  }
  if (nextIndex > maxIndex) {
    paletteActiveIndex.value = 0;
    return;
  }
  paletteActiveIndex.value = nextIndex;
}

function handleGlobalClick(event) {
  if (!toolsMenuRef.value?.contains(event.target)) {
    toolsMenuOpen.value = false;
  }
  if (!profileMenuRef.value?.contains(event.target)) {
    profileMenuOpen.value = false;
  }
}

function syncSidebarForViewport() {
  viewportWidth.value = window.innerWidth;
  if (window.innerWidth > 1180) {
    sidebarOpen.value = false;
  }
  if (window.innerWidth > 720) {
    mobileMenuOpen.value = false;
  }
}

function handleGlobalKeydown(event) {
  const isQuickOpen = (event.metaKey || event.ctrlKey) && String(event.key || "").toLowerCase() === "k";
  if (isQuickOpen) {
    event.preventDefault();
    if (paletteOpen.value) {
      closePalette();
    } else {
      openPalette();
    }
    return;
  }

  if (!paletteOpen.value) {
    if (event.key === "Escape" && (sidebarOpen.value || mobileMenuOpen.value)) {
      event.preventDefault();
      closeSidebar();
    }
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closePalette();
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    movePaletteSelection(1);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    movePaletteSelection(-1);
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    navigateFromPalette(paletteResults.value[paletteActiveIndex.value]);
  }
}

watch(
  () => route.path,
  () => {
    selectedDomainCode.value = routeDomain.value?.code || visibleDomains.value[0]?.code || "";
    if (currentModule.value) {
      recentNavigation.value = rememberRecentModule(currentModule.value);
      favoriteNavigation.value = loadFavoriteNavigation();
    }
    if (paletteOpen.value) {
      closePalette();
    }
    closeSidebar();
    closeMenus();
  },
  { immediate: true }
);

watch(
  visibleDomains,
  (domains) => {
    if (domains.length === 0) {
      selectedDomainCode.value = "";
      return;
    }
    if (!domains.some((domain) => domain.code === selectedDomainCode.value)) {
      selectedDomainCode.value = routeDomain.value?.code || domains[0].code;
    }
  },
  { immediate: true }
);

watch(
  paletteResults,
  (items) => {
    if (items.length === 0) {
      paletteActiveIndex.value = 0;
      return;
    }
    if (paletteActiveIndex.value > items.length - 1) {
      paletteActiveIndex.value = 0;
    }
  },
  { immediate: true }
);

watch(paletteQuery, () => {
  paletteActiveIndex.value = 0;
});

onMounted(() => {
  sessionStore.hydrate();
  syncThemePreference().then((result) => {
    themePreset.value = result?.themePreset || getStoredThemePreset();
  });
  const handleThemeChange = () => {
    themePreset.value = getStoredThemePreset();
  };
  window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  removeThemeListener = () => {
    window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  };
  syncSidebarForViewport();
  window.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("click", handleGlobalClick);
  window.addEventListener("resize", syncSidebarForViewport);
  dateTimer = window.setInterval(() => {
    nowTick.value = Date.now();
  }, 30 * 1000);
});

onBeforeUnmount(() => {
  removeThemeListener?.();
  window.removeEventListener("keydown", handleGlobalKeydown);
  window.removeEventListener("click", handleGlobalClick);
  window.removeEventListener("resize", syncSidebarForViewport);
  if (dateTimer) {
    window.clearInterval(dateTimer);
  }
});
</script>
