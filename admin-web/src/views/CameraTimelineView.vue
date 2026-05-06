<template>
  <div class="stack">
    <section class="panel mobile-only mobile-field-panel">
      <div class="mobile-field-panel-head">
        <div>
          <div class="mobile-field-kicker">现场模式</div>
          <h2>图片时间轴</h2>
          <p class="panel-subtitle">{{ selectedTimelineAreaName }} · {{ selectedTimelineCameraName }}</p>
        </div>
      </div>

      <div class="mobile-field-stat-grid">
        <article class="mobile-field-stat-card">
          <span class="mobile-field-stat-label">当前结果</span>
          <strong class="mobile-field-stat-value">{{ snapshots.length }}</strong>
          <small>最近 {{ latestSnapshot ? formatDateTime(latestSnapshot.capturedAt) : "-" }}</small>
        </article>
        <article class="mobile-field-stat-card">
          <span class="mobile-field-stat-label">手动</span>
          <strong class="mobile-field-stat-value">{{ manualCount }}</strong>
          <small>人工抓图</small>
        </article>
        <article class="mobile-field-stat-card">
          <span class="mobile-field-stat-label">定时</span>
          <strong class="mobile-field-stat-value">{{ scheduleCount }}</strong>
          <small>计划执行</small>
        </article>
        <article class="mobile-field-stat-card">
          <span class="mobile-field-stat-label">上传</span>
          <strong class="mobile-field-stat-value">{{ uploadCount }}</strong>
          <small>FTP / HTTP</small>
        </article>
      </div>

      <div class="mobile-field-shortcuts">
        <RouterLink :to="dashboardLink" class="mobile-field-shortcut">返回工作台</RouterLink>
        <RouterLink :to="capturePlansLink" class="mobile-field-shortcut">抓图计划</RouterLink>
        <RouterLink :to="camerasLink" class="mobile-field-shortcut">当前摄像头</RouterLink>
        <RouterLink :to="alertsLink" class="mobile-field-shortcut mobile-field-shortcut-strong">告警中心</RouterLink>
      </div>
    </section>

    <div class="timeline-workspace">
      <section class="panel timeline-primary-panel">
        <div class="panel-header">
          <h2>历史图片时间轴</h2>
          <div class="inline-actions">
            <button
              v-if="canDeleteSnapshots && snapshots.length > 0"
              class="ghost-button"
              @click="toggleSelectAllSnapshots"
            >
              {{ isAllSnapshotsSelected ? "取消全选" : "全选当前结果" }}
            </button>
            <button class="ghost-button" @click="loadSnapshots">刷新</button>
          </div>
        </div>

        <div class="metric-strip timeline-summary-strip">
          <article class="roadmap-card timeline-summary-card">
            <div class="stat-value">{{ snapshots.length }}</div>
            <div class="stat-desc">当前结果</div>
          </article>
          <article class="roadmap-card timeline-summary-card">
            <div class="stat-value">{{ latestSnapshot ? formatDateTime(latestSnapshot.capturedAt) : "-" }}</div>
            <div class="stat-desc">最近抓图时间</div>
          </article>
          <article class="roadmap-card timeline-summary-card">
            <div class="stat-value">{{ manualCount }}</div>
            <div class="stat-desc">手动抓图</div>
          </article>
          <article class="roadmap-card timeline-summary-card">
            <div class="stat-value">{{ scheduleCount }}</div>
            <div class="stat-desc">定时抓图</div>
          </article>
          <article class="roadmap-card timeline-summary-card">
            <div class="stat-value">{{ uploadCount }}</div>
            <div class="stat-desc">上传图片</div>
          </article>
        </div>

        <div class="context-strip">
          <div class="context-copy">
            <strong>当前上下文</strong>
            <span>{{ selectedTimelineAreaName }} · {{ selectedTimelineCameraName }} · {{ filters.sourceType ? enumLabel("snapshotSourceType", filters.sourceType) : "全部来源" }}</span>
          </div>
          <div class="context-actions">
            <RouterLink :to="dashboardLink" class="context-link">返回工作台</RouterLink>
            <RouterLink :to="realtimeLink" class="context-link">实时监控</RouterLink>
            <RouterLink :to="alertsLink" class="context-link">告警中心</RouterLink>
            <RouterLink :to="capturePlansLink" class="context-link">抓图计划</RouterLink>
            <RouterLink :to="camerasLink" class="context-link">摄像头管理</RouterLink>
          </div>
        </div>

        <div class="mobile-only mobile-filter-summary">
          <div class="mobile-filter-summary-copy">
            <strong>当前筛选</strong>
            <span>{{ selectedTimelineAreaName }} · {{ selectedTimelineCameraName }} · {{ filters.sourceType ? enumLabel("snapshotSourceType", filters.sourceType) : "全部来源" }}</span>
          </div>
          <button class="ghost-button" @click="mobileFiltersOpen = !mobileFiltersOpen">
            {{ mobileFiltersOpen ? "收起筛选" : "展开筛选" }}
          </button>
        </div>

        <div class="toolbar desktop-filter-toolbar mobile-filter-toolbar" :class="{ 'mobile-filter-toolbar-open': mobileFiltersOpen }">
          <label class="filter-item">
            <span>关键字</span>
            <input v-model="filters.keyword" type="text" placeholder="抓图编号 / 摄像头 / 文件路径" />
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
          <label class="filter-item">
            <span>摄像头</span>
            <select v-model="filters.cameraId">
              <option value="">全部</option>
              <option v-for="camera in cameras" :key="camera.id" :value="camera.id">
                {{ camera.cameraName }}
              </option>
            </select>
          </label>
          <label class="filter-item">
            <span>来源</span>
            <select v-model="filters.sourceType">
              <option value="">全部</option>
              <option value="manual">{{ enumLabel("snapshotSourceType", "manual") }}</option>
              <option value="schedule">{{ enumLabel("snapshotSourceType", "schedule") }}</option>
              <option value="event">{{ enumLabel("snapshotSourceType", "event") }}</option>
              <option value="ftp_upload">{{ enumLabel("snapshotSourceType", "ftp_upload") }}</option>
              <option value="http_upload">{{ enumLabel("snapshotSourceType", "http_upload") }}</option>
            </select>
          </label>
          <div class="toolbar-actions">
            <button class="ghost-button" @click="resetFilters">重置</button>
            <button class="primary-button" @click="loadSnapshots">查询</button>
          </div>
        </div>

        <div class="chip-list timeline-filter-chips">
          <button
            v-for="option in sourceQuickFilters"
            :key="option.value || 'all'"
            type="button"
            class="chip chip-button"
            :class="{ 'chip-button-active': filters.sourceType === option.value }"
            @click="applySourceQuickFilter(option.value)"
          >
            {{ option.label }}
          </button>
        </div>

        <div
          v-if="canDeleteSnapshots"
          class="timeline-selection-bar"
          :class="{ 'timeline-selection-bar-active': selectedSnapshotIds.length > 0 }"
        >
          <div class="timeline-selection-copy">
            <strong>{{ selectedSnapshotIds.length }}</strong>
            <span>{{ selectedSnapshotIds.length > 0 ? "张图片已加入多选" : "点击卡片底部按钮，可把图片加入多选" }}</span>
          </div>
          <div class="inline-actions">
            <button
              v-if="selectedSnapshotIds.length > 0"
              class="ghost-button"
              @click="selectedSnapshotIds = []"
            >
              清空选择
            </button>
            <button
              v-if="selectedSnapshotIds.length > 0"
              class="primary-button"
              :disabled="deleteLoading"
              @click="deleteSelectedSnapshots"
            >
              {{ deleteLoading ? "正在删除..." : `批量删除（${selectedSnapshotIds.length}）` }}
            </button>
          </div>
        </div>

        <details class="config-disclosure timeline-disclosure">
          <summary class="config-disclosure-summary">高级筛选</summary>
          <div class="toolbar timeline-toolbar-secondary">
            <label class="filter-item">
              <span>开始时间</span>
              <input v-model="filters.dateFrom" type="datetime-local" />
            </label>
            <label class="filter-item">
              <span>结束时间</span>
              <input v-model="filters.dateTo" type="datetime-local" />
            </label>
          </div>
        </details>

        <div v-if="message" class="success-text">{{ message }}</div>
        <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

        <div v-if="loading" class="muted-text">正在加载时间轴图片…</div>

        <div v-if="selectedSnapshot" class="mobile-only mobile-inline-preview-card">
          <img
            class="mobile-inline-preview-image"
            :src="getSnapshotPreviewUrl(selectedSnapshot)"
            :alt="selectedSnapshot.snapshotNo"
            @click="openFullscreenPreview(selectedSnapshot)"
          />
          <div class="mobile-inline-preview-meta">
            <strong>{{ selectedSnapshot.cameraName || selectedSnapshot.snapshotNo }}</strong>
            <span>{{ formatDateTime(selectedSnapshot.capturedAt) }}</span>
            <small>{{ enumLabel("snapshotSourceType", selectedSnapshot.sourceType) }} · {{ selectedSnapshot.areaName || "未绑定区域" }}</small>
          </div>
          <div class="mobile-inline-preview-actions">
            <button class="ghost-button" :disabled="!previousSnapshot" @click="selectPreviousSnapshot">上一张</button>
            <button class="ghost-button" :disabled="!nextSnapshot" @click="selectNextSnapshot">下一张</button>
            <RouterLink :to="camerasLink" class="ghost-button mobile-inline-preview-link">当前摄像头</RouterLink>
            <RouterLink :to="capturePlansLink" class="ghost-button mobile-inline-preview-link">抓图计划</RouterLink>
            <button v-if="getRawPreviewUrl(selectedSnapshot)" class="ghost-button" @click="openFullscreenPreview(selectedSnapshot)">全屏</button>
          </div>
        </div>

        <div class="timeline-day-stack">
          <section v-for="group in timelineGroups" :key="group.key" class="timeline-day-group">
            <header class="timeline-day-head">
              <div>
                <div class="timeline-day-title">{{ group.label }}</div>
                <div class="timeline-day-subtitle">共 {{ group.items.length }} 张 · 最近 {{ formatDateTime(group.items[0]?.capturedAt) }}</div>
              </div>
              <div class="chip-list">
                <span v-if="group.manualCount" class="chip">手动 {{ group.manualCount }}</span>
                <span v-if="group.scheduleCount" class="chip">定时 {{ group.scheduleCount }}</span>
                <span v-if="group.uploadCount" class="chip">上传 {{ group.uploadCount }}</span>
              </div>
            </header>

            <div class="snapshot-grid">
              <article
                v-for="item in group.items"
                :key="item.id"
                class="snapshot-card"
                :class="{ active: selectedSnapshot?.id === item.id, selected: isSnapshotSelected(item.id) }"
                @click="selectedSnapshot = item"
              >
                <div class="snapshot-image-shell">
                  <img class="snapshot-image" :src="getSnapshotPreviewUrl(item)" :alt="item.snapshotNo" />
                  <div class="snapshot-overlay-top">
                    <span class="tag tag-p2">{{ enumLabel("snapshotSourceType", item.sourceType) }}</span>
                    <span v-if="isSnapshotSelected(item.id)" class="snapshot-selected-pill">已加入多选</span>
                  </div>
                </div>
                <div class="snapshot-meta">
                  <div class="snapshot-meta-head">
                    <strong>{{ item.cameraName || item.snapshotNo }}</strong>
                    <span class="snapshot-meta-time">{{ formatDateTime(item.capturedAt) }}</span>
                  </div>
                  <div class="snapshot-meta-code">{{ item.snapshotNo }}</div>
                  <div>{{ item.areaName || "未绑定区域" }}</div>
                </div>
                <div v-if="canDeleteSnapshots" class="snapshot-card-actions" @click.stop>
                  <button
                    type="button"
                    class="snapshot-select-toggle"
                    :class="{ 'snapshot-select-toggle-active': isSnapshotSelected(item.id) }"
                    @click="toggleSnapshotSelection(item.id)"
                  >
                    {{ isSnapshotSelected(item.id) ? "已选中" : "加入多选" }}
                  </button>
                  <button
                    v-if="selectedSnapshot?.id !== item.id"
                    type="button"
                    class="ghost-button snapshot-preview-trigger"
                    @click="selectedSnapshot = item"
                  >
                    右侧查看
                  </button>
                </div>
              </article>
            </div>
          </section>
        </div>

        <div v-if="!loading && snapshots.length === 0" class="empty-state">暂无图片时间轴数据。</div>
      </section>

      <section class="panel timeline-detail-panel">
        <div class="panel-header">
          <div>
            <h2>图片详情</h2>
            <p v-if="selectedSnapshot" class="panel-subtitle">
              当前第 {{ selectedSnapshotOrder }} 张，共 {{ snapshots.length }} 张，可连续回看相邻图片。
            </p>
          </div>
          <div class="inline-actions detail-nav-actions">
            <button class="ghost-button" :disabled="!previousSnapshot" @click="selectPreviousSnapshot">上一张</button>
            <button class="ghost-button" :disabled="!nextSnapshot" @click="selectNextSnapshot">下一张</button>
            <span class="tag tag-p2">{{ selectedSnapshot?.snapshotNo || "未选择" }}</span>
          </div>
        </div>
        <div v-if="selectedSnapshot" class="preview-panel">
          <img
            class="preview-panel-image"
            :src="getSnapshotPreviewUrl(selectedSnapshot)"
            :alt="selectedSnapshot.snapshotNo"
            @click="openFullscreenPreview(selectedSnapshot)"
          />
          <div class="preview-panel-actions">
            <div class="preview-panel-summary">
              <div class="chip-list">
                <span class="chip">{{ selectedSnapshot.cameraName }}</span>
                <span class="chip">{{ selectedSnapshot.areaName || "未绑定区域" }}</span>
                <span class="chip chip-permission">{{ enumLabel("snapshotSourceType", selectedSnapshot.sourceType) }}</span>
              </div>
              <div class="preview-panel-caption">
                {{ formatDateTime(selectedSnapshot.capturedAt) }}
              </div>
            </div>
            <div class="preview-panel-cta">
              <a
                v-if="getRawPreviewUrl(selectedSnapshot)"
                class="table-link"
                :href="getRawPreviewUrl(selectedSnapshot)"
                target="_blank"
                rel="noreferrer"
              >
                打开原图
              </a>
              <button v-if="getRawPreviewUrl(selectedSnapshot)" class="ghost-button" @click="openFullscreenPreview(selectedSnapshot)">
                全屏预览
              </button>
              <button
                v-if="canDeleteSnapshots"
                class="ghost-button"
                :disabled="deleteLoading"
                @click="deleteSnapshot(selectedSnapshot)"
              >
                {{ deleteLoading ? "正在删除..." : "删除照片" }}
              </button>
            </div>
          </div>
          <div v-if="!getRawPreviewUrl(selectedSnapshot)" class="preview-panel-placeholder-tip">
            当前为占位预览，接入真实文件服务后会自动显示原图。
          </div>
        </div>
        <div v-if="selectedSnapshot" class="detail-grid">
          <div>
            <div class="detail-label">摄像头</div>
            <div class="detail-value">{{ selectedSnapshot.cameraName }}</div>
          </div>
          <div>
            <div class="detail-label">区域</div>
            <div class="detail-value">{{ selectedSnapshot.areaName || "-" }}</div>
          </div>
          <div>
            <div class="detail-label">来源类型</div>
            <div class="detail-value">{{ enumLabel("snapshotSourceType", selectedSnapshot.sourceType) }}</div>
          </div>
          <div>
            <div class="detail-label">存储类型</div>
            <div class="detail-value">{{ selectedSnapshot.storageProvider || "-" }}</div>
          </div>
          <div>
            <div class="detail-label">拍摄时间</div>
            <div class="detail-value">{{ formatDateTime(selectedSnapshot.capturedAt) }}</div>
          </div>
          <div>
            <div class="detail-label">接收时间</div>
            <div class="detail-value">{{ formatDateTime(selectedSnapshot.receivedAt) }}</div>
          </div>
          <div>
            <div class="detail-label">宽高</div>
            <div class="detail-value">
              {{ selectedSnapshot.imageWidth || "-" }} x {{ selectedSnapshot.imageHeight || "-" }}
            </div>
          </div>
          <div>
            <div class="detail-label">大小</div>
            <div class="detail-value">{{ formatFileSize(selectedSnapshot.fileSizeBytes) }}</div>
          </div>
          <div class="detail-span">
            <div class="detail-label">备注</div>
            <div class="detail-value">{{ selectedSnapshot.remark || "-" }}</div>
          </div>
        </div>
        <details v-if="selectedSnapshot" class="config-disclosure timeline-disclosure">
          <summary class="config-disclosure-summary">原始路径与文件信息</summary>
          <div class="detail-grid">
            <div class="detail-span">
              <div class="detail-label">文件路径</div>
              <div class="detail-value">{{ selectedSnapshot.filePath || "-" }}</div>
            </div>
            <div class="detail-span">
              <div class="detail-label">缩略图路径</div>
              <div class="detail-value">{{ selectedSnapshot.thumbnailPath || "-" }}</div>
            </div>
            <div class="detail-span">
              <div class="detail-label">FTP 路径</div>
              <div class="detail-value">{{ selectedSnapshot.ftpPath || "-" }}</div>
            </div>
          </div>
        </details>
        <div v-else class="empty-state">从时间轴选择一条图片记录查看详情。</div>
        <div class="timeline-detail-summary">
          <div class="panel-header">
            <h2>时间轴摘要</h2>
            <span class="tag tag-p2">summary</span>
          </div>
          <div class="detail-grid">
            <div>
              <div class="detail-label">图片总数</div>
              <div class="detail-value">{{ snapshots.length }}</div>
            </div>
            <div>
              <div class="detail-label">手动抓图</div>
              <div class="detail-value">{{ manualCount }}</div>
            </div>
            <div>
              <div class="detail-label">定时抓图</div>
              <div class="detail-value">{{ scheduleCount }}</div>
            </div>
            <div>
              <div class="detail-label">上传图片</div>
              <div class="detail-value">{{ uploadCount }}</div>
            </div>
            <div>
              <div class="detail-label">最近图片</div>
              <div class="detail-value">{{ formatDateTime(latestSnapshot?.capturedAt) }}</div>
            </div>
            <div class="detail-span">
              <div class="detail-label">说明</div>
              <div class="detail-value">
                左侧专注筛选与回看，右侧固定预览当前图片。多选操作改成卡片底部按钮，避免点选和看图互相抢操作。
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>

  <Teleport to="body">
    <Transition name="palette-transition">
      <div v-if="fullscreenPreviewUrl" class="command-palette-overlay" @click.self="closeFullscreenPreview">
        <div class="command-palette timeline-lightbox">
          <div class="command-palette-head">
            <div>
              <div class="command-palette-title">{{ selectedSnapshot?.cameraName || "图片预览" }}</div>
              <div class="command-palette-subtitle">{{ selectedSnapshot?.snapshotNo || "" }}</div>
            </div>
            <button type="button" class="ghost-button" @click="closeFullscreenPreview">关闭</button>
          </div>
          <div class="timeline-lightbox-body">
            <img class="timeline-lightbox-image" :src="fullscreenPreviewUrl" :alt="selectedSnapshot?.snapshotNo || '预览图'" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatDateTime } from "../lib/format";
import { hasPermission } from "../lib/session";

const loading = ref(false);
const errorMessage = ref("");
const message = ref("");
const snapshots = ref([]);
const selectedSnapshot = ref(null);
const areas = ref([]);
const cameras = ref([]);
const fullscreenPreviewUrl = ref("");
const deleteLoading = ref(false);
const selectedSnapshotIds = ref([]);
const mobileFiltersOpen = ref(false);
const routeContextFallbackPending = ref(false);
const route = useRoute();
const router = useRouter();

const filters = reactive({
  keyword: "",
  areaId: "",
  cameraId: "",
  sourceType: "",
  dateFrom: "",
  dateTo: ""
});

const ftpCount = computed(() => snapshots.value.filter((item) => item.sourceType === "ftp_upload").length);
const manualCount = computed(() => snapshots.value.filter((item) => item.sourceType === "manual").length);
const scheduleCount = computed(() => snapshots.value.filter((item) => item.sourceType === "schedule").length);
const uploadCount = computed(() =>
  snapshots.value.filter((item) => ["ftp_upload", "http_upload"].includes(item.sourceType)).length
);
const latestSnapshot = computed(() => snapshots.value[0] || null);
const timelineGroups = computed(() => {
  const groups = [];
  const byKey = new Map();

  snapshots.value.forEach((item) => {
    const key = toDateKey(item.capturedAt || item.receivedAt);
    if (!byKey.has(key)) {
      const group = {
        key,
        label: formatDayHeading(key),
        items: [],
        manualCount: 0,
        scheduleCount: 0,
        uploadCount: 0
      };
      byKey.set(key, group);
      groups.push(group);
    }

    const group = byKey.get(key);
    group.items.push(item);

    if (item.sourceType === "manual") {
      group.manualCount += 1;
    } else if (item.sourceType === "schedule") {
      group.scheduleCount += 1;
    } else if (["ftp_upload", "http_upload"].includes(item.sourceType)) {
      group.uploadCount += 1;
    }
  });

  return groups;
});
const sourceQuickFilters = computed(() => [
  { value: "", label: "全部来源" },
  { value: "manual", label: `手动 ${manualCount.value}` },
  { value: "schedule", label: `定时 ${scheduleCount.value}` },
  { value: "ftp_upload", label: `FTP ${ftpCount.value}` },
  { value: "http_upload", label: `HTTP ${snapshots.value.filter((item) => item.sourceType === "http_upload").length}` }
]);
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const canDeleteSnapshots = hasPermission("device:delete");
const isAllSnapshotsSelected = computed(
  () => snapshots.value.length > 0 && selectedSnapshotIds.value.length === snapshots.value.length
);
const selectedTimelineAreaName = computed(() => areas.value.find((item) => String(item.id) === String(filters.areaId))?.areaName || "全部区域");
const selectedTimelineCameraName = computed(() => cameras.value.find((item) => String(item.id) === String(filters.cameraId))?.cameraName || "全部摄像头");
const selectedSnapshotIndex = computed(() =>
  selectedSnapshot.value?.id ? snapshots.value.findIndex((item) => item.id === selectedSnapshot.value.id) : -1
);
const selectedSnapshotOrder = computed(() => (selectedSnapshotIndex.value >= 0 ? selectedSnapshotIndex.value + 1 : 0));
const previousSnapshot = computed(() =>
  selectedSnapshotIndex.value > 0 ? snapshots.value[selectedSnapshotIndex.value - 1] : null
);
const nextSnapshot = computed(() =>
  selectedSnapshotIndex.value >= 0 && selectedSnapshotIndex.value < snapshots.value.length - 1
    ? snapshots.value[selectedSnapshotIndex.value + 1]
    : null
);
const timelineQueryContext = computed(() => {
  const query = {};
  if (filters.areaId) query.areaId = String(filters.areaId);
  if (filters.cameraId) query.cameraId = String(filters.cameraId);
  return query;
});
const dashboardLink = computed(() => ({ path: "/dashboard/overview", query: filters.areaId ? { areaId: String(filters.areaId) } : {} }));
const realtimeLink = computed(() => ({ path: "/monitor/realtime", query: timelineQueryContext.value }));
const alertsLink = computed(() => ({ path: "/alerts/center", query: filters.areaId ? { areaId: String(filters.areaId) } : {} }));
const capturePlansLink = computed(() => ({ path: "/devices/capture-plans", query: timelineQueryContext.value }));
const camerasLink = computed(() => ({ path: "/devices/cameras", query: timelineQueryContext.value }));

function normalizeDateTimeInput(value) {
  return value ? value.replace("T", " ") : "";
}

function toDateKey(value) {
  if (!value) {
    return "unknown";
  }

  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatDayHeading(dateKey) {
  if (!dateKey || dateKey === "unknown") {
    return "未标注日期";
  }

  const date = new Date(`${dateKey}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(date);
}

function isAbsoluteAssetUrl(value) {
  return typeof value === "string" && /^(https?:|data:|blob:)/.test(value);
}

function normalizeAssetUrl(candidate) {
  if (!candidate) {
    return "";
  }
  if (isAbsoluteAssetUrl(candidate)) {
    return candidate;
  }
  if (typeof candidate === "string" && candidate.startsWith("/")) {
    return API_BASE_URL ? `${API_BASE_URL}${candidate}` : candidate;
  }
  return "";
}

function getRawPreviewUrl(item) {
  if (!item) {
    return "";
  }
  const candidate = item.thumbnailUrl || item.fileUrl || item.thumbnailPath || item.filePath || "";
  return normalizeAssetUrl(candidate);
}

function getSnapshotPreviewUrl(item) {
  const rawUrl = getRawPreviewUrl(item);
  if (rawUrl) {
    return rawUrl;
  }

  const title = item?.cameraName || item?.cameraCode || "未命名摄像头";
  const subtitle = `${enumLabel("snapshotSourceType", item?.sourceType)} · ${item?.snapshotNo || "-"}`;
  const timestamp = formatDateTime(item?.capturedAt);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#edf6ee"/>
          <stop offset="50%" stop-color="#d8eadb"/>
          <stop offset="100%" stop-color="#f8f3df"/>
        </linearGradient>
      </defs>
      <rect width="960" height="540" fill="url(#bg)"/>
      <circle cx="774" cy="108" r="86" fill="rgba(245, 187, 95, 0.32)"/>
      <circle cx="194" cy="416" r="128" fill="rgba(76, 132, 92, 0.12)"/>
      <rect x="84" y="72" width="792" height="396" rx="28" fill="rgba(255,255,255,0.72)" stroke="rgba(45,85,53,0.14)"/>
      <text x="120" y="180" font-size="42" fill="#284332" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-weight="700">${escapeSvgText(title)}</text>
      <text x="120" y="236" font-size="24" fill="#5b7162" font-family="PingFang SC, Microsoft YaHei, sans-serif">${escapeSvgText(subtitle)}</text>
      <text x="120" y="290" font-size="20" fill="#7a8d80" font-family="PingFang SC, Microsoft YaHei, sans-serif">${escapeSvgText(timestamp)}</text>
      <text x="120" y="402" font-size="22" fill="#355440" font-family="PingFang SC, Microsoft YaHei, sans-serif">预览图占位</text>
      <text x="120" y="438" font-size="18" fill="#6e8175" font-family="PingFang SC, Microsoft YaHei, sans-serif">文件服务未接入时使用系统自动生成预览。</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeSvgText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resetFilters() {
  message.value = "";
  selectedSnapshotIds.value = [];
  filters.keyword = "";
  filters.areaId = "";
  filters.cameraId = "";
  filters.sourceType = "";
  filters.dateFrom = "";
  filters.dateTo = "";
  mobileFiltersOpen.value = false;
  loadSnapshots();
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
  filters.keyword = firstQueryValue(route.query.keyword) || "";
  filters.areaId = readNumberQuery(route.query.areaId);
  filters.cameraId = readNumberQuery(route.query.cameraId);
  filters.sourceType = firstQueryValue(route.query.sourceType) || "";
  filters.dateFrom = firstQueryValue(route.query.dateFrom) || "";
  filters.dateTo = firstQueryValue(route.query.dateTo) || "";
  routeContextFallbackPending.value = Boolean(filters.areaId || filters.cameraId);
}

function syncRouteQuery() {
  const query = {};
  if (filters.keyword) query.keyword = String(filters.keyword);
  if (filters.areaId) query.areaId = String(filters.areaId);
  if (filters.cameraId) query.cameraId = String(filters.cameraId);
  if (filters.sourceType) query.sourceType = String(filters.sourceType);
  if (filters.dateFrom) query.dateFrom = String(filters.dateFrom);
  if (filters.dateTo) query.dateTo = String(filters.dateTo);
  router.replace({ query }).catch(() => {});
}

function applySourceQuickFilter(value) {
  filters.sourceType = value;
  mobileFiltersOpen.value = false;
  loadSnapshots();
}

function openFullscreenPreview(item) {
  const url = getRawPreviewUrl(item);
  if (!url) {
    return;
  }
  fullscreenPreviewUrl.value = url;
}

function selectPreviousSnapshot() {
  if (!previousSnapshot.value) {
    return;
  }
  selectedSnapshot.value = previousSnapshot.value;
}

function selectNextSnapshot() {
  if (!nextSnapshot.value) {
    return;
  }
  selectedSnapshot.value = nextSnapshot.value;
}

function isSnapshotSelected(snapshotId) {
  return selectedSnapshotIds.value.includes(snapshotId);
}

function toggleSnapshotSelection(snapshotId) {
  if (!snapshotId) {
    return;
  }
  if (isSnapshotSelected(snapshotId)) {
    selectedSnapshotIds.value = selectedSnapshotIds.value.filter((item) => item !== snapshotId);
    return;
  }
  selectedSnapshotIds.value = [...selectedSnapshotIds.value, snapshotId];
}

function toggleSelectAllSnapshots() {
  if (isAllSnapshotsSelected.value) {
    selectedSnapshotIds.value = [];
    return;
  }
  selectedSnapshotIds.value = snapshots.value.map((item) => item.id);
}

function closeFullscreenPreview() {
  fullscreenPreviewUrl.value = "";
}

function formatFileSize(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) {
    return "-";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

async function loadLookups() {
  const [areaRows, cameraRows] = await Promise.all([
    apiRequest("/api/v1/areas"),
    apiRequest("/api/v1/cameras")
  ]);
  areas.value = areaRows;
  cameras.value = cameraRows;
}

async function loadSnapshots() {
  loading.value = true;
  errorMessage.value = "";
  try {
    syncRouteQuery();
    let nextSnapshots = await apiRequest(
      `/api/v1/snapshots${buildQuery({
        ...filters,
        dateFrom: normalizeDateTimeInput(filters.dateFrom),
        dateTo: normalizeDateTimeInput(filters.dateTo)
      })}`
    );

    if (
      nextSnapshots.length === 0 &&
      routeContextFallbackPending.value &&
      (filters.areaId || filters.cameraId)
    ) {
      const fallbackSnapshots = await apiRequest(
        `/api/v1/snapshots${buildQuery({
          ...filters,
          areaId: "",
          cameraId: "",
          dateFrom: normalizeDateTimeInput(filters.dateFrom),
          dateTo: normalizeDateTimeInput(filters.dateTo)
        })}`
      );

      if (fallbackSnapshots.length > 0) {
        filters.areaId = "";
        filters.cameraId = "";
        syncRouteQuery();
        message.value = "当前上下文没有图片，已自动切换到全部区域。";
        nextSnapshots = fallbackSnapshots;
      }
    }

    routeContextFallbackPending.value = false;
    snapshots.value = nextSnapshots;
    const visibleIds = new Set(snapshots.value.map((item) => item.id));
    selectedSnapshotIds.value = selectedSnapshotIds.value.filter((item) => visibleIds.has(item));
    mobileFiltersOpen.value = false;
    if (selectedSnapshot.value) {
      selectedSnapshot.value =
        snapshots.value.find((item) => item.id === selectedSnapshot.value.id) || snapshots.value[0] || null;
    } else {
      selectedSnapshot.value = snapshots.value[0] || null;
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function deleteSnapshot(item) {
  if (!item?.id || deleteLoading.value) {
    return;
  }

  if (!window.confirm(`确认删除图片“${item.snapshotNo}”吗？此操作会同步移除原图和缩略图。`)) {
    return;
  }

  deleteLoading.value = true;
  errorMessage.value = "";
  message.value = "";

  try {
    const result = await apiRequest(`/api/v1/snapshots/${item.id}`, {
      method: "DELETE"
    });
    message.value = result?.cleanupWarnings?.length
      ? `图片记录已删除，但有 ${result.cleanupWarnings.length} 个文件清理失败。`
      : "图片记录删除成功";
    selectedSnapshotIds.value = selectedSnapshotIds.value.filter((snapshotId) => snapshotId !== item.id);
    if (selectedSnapshot.value?.id === item.id) {
      selectedSnapshot.value = null;
    }
    await loadSnapshots();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    deleteLoading.value = false;
  }
}

async function deleteSelectedSnapshots() {
  if (selectedSnapshotIds.value.length === 0 || deleteLoading.value) {
    return;
  }

  if (!window.confirm(`确认批量删除已选中的 ${selectedSnapshotIds.value.length} 张图片吗？`)) {
    return;
  }

  deleteLoading.value = true;
  errorMessage.value = "";
  message.value = "";

  try {
    const result = await apiRequest("/api/v1/snapshots/batch-delete", {
      method: "POST",
      body: JSON.stringify({
        ids: selectedSnapshotIds.value
      })
    });
    const deletedCount = Number(result?.deletedCount || 0);
    const skippedCount = Array.isArray(result?.skipped) ? result.skipped.length : 0;
    const warningCount = Array.isArray(result?.cleanupWarnings) ? result.cleanupWarnings.length : 0;
    message.value = [
      deletedCount > 0 ? `已删除 ${deletedCount} 张` : "",
      skippedCount > 0 ? `跳过 ${skippedCount} 张` : "",
      warningCount > 0 ? `文件清理异常 ${warningCount} 条` : ""
    ].filter(Boolean).join("，") || "批量删除已完成";
    const deletedIdSet = new Set(result?.deletedIds || []);
    selectedSnapshotIds.value = selectedSnapshotIds.value.filter((id) => !deletedIdSet.has(id));
    if (selectedSnapshot.value?.id && deletedIdSet.has(selectedSnapshot.value.id)) {
      selectedSnapshot.value = null;
    }
    await loadSnapshots();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    deleteLoading.value = false;
  }
}

onMounted(async () => {
  await loadLookups();
  hydrateFiltersFromRoute();
  await loadSnapshots();
});
</script>
