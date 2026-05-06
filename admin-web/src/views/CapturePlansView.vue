<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>抓图计划</h2>
        <div class="inline-actions">
          <RouterLink
            v-if="canEdit"
            class="ghost-button mobile-only"
            :to="{ path: '/devices/capture-plans/edit', query: planQueryContext }"
          >
            新建计划
          </RouterLink>
          <button class="ghost-button" @click="loadPlans">刷新</button>
        </div>
      </div>

      <div class="context-strip">
        <div class="context-copy">
          <strong>当前上下文</strong>
          <span>{{ selectedPlanCameraName }} · {{ filters.status ? enumLabel("status", filters.status) : "全部状态" }} · {{ filters.scheduleType ? enumLabel("capturePlanScheduleType", filters.scheduleType) : "全部调度" }}</span>
        </div>
        <div class="context-actions">
          <RouterLink :to="dashboardLink" class="context-link">返回工作台</RouterLink>
          <RouterLink :to="camerasLink" class="context-link">摄像头管理</RouterLink>
          <RouterLink :to="timelineLink" class="context-link">图片时间轴</RouterLink>
        </div>
      </div>

      <div class="mobile-only mobile-filter-summary">
        <div class="mobile-filter-summary-copy">
          <strong>当前筛选</strong>
          <span>{{ selectedPlanCameraName }} · {{ filters.status ? enumLabel("status", filters.status) : "全部状态" }} · {{ filters.scheduleType ? enumLabel("capturePlanScheduleType", filters.scheduleType) : "全部调度" }}</span>
        </div>
        <button class="ghost-button" @click="mobileFiltersOpen = !mobileFiltersOpen">
          {{ mobileFiltersOpen ? "收起筛选" : "展开筛选" }}
        </button>
      </div>

      <div class="toolbar desktop-filter-toolbar mobile-filter-toolbar" :class="{ 'mobile-filter-toolbar-open': mobileFiltersOpen }">
        <label class="filter-item">
          <span>关键字</span>
          <input v-model="filters.keyword" type="text" placeholder="计划编号 / 计划名称 / 摄像头" />
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
          <span>状态</span>
          <select v-model="filters.status">
            <option value="">全部</option>
            <option value="enabled">{{ enumLabel("status", "enabled") }}</option>
            <option value="disabled">{{ enumLabel("status", "disabled") }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>调度类型</span>
          <select v-model="filters.scheduleType">
            <option value="">全部</option>
            <option value="interval">{{ enumLabel("capturePlanScheduleType", "interval") }}</option>
            <option value="daily">{{ enumLabel("capturePlanScheduleType", "daily") }}</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadPlans">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <section v-if="selectedPlan" class="mobile-only mobile-inline-detail-card">
        <div class="mobile-inline-detail-head">
          <div>
            <div class="mobile-field-kicker">当前计划</div>
            <strong class="mobile-inline-detail-title">{{ selectedPlan.planName }}</strong>
            <div class="mobile-inline-detail-subtitle">
              {{ selectedPlan.planNo }} · {{ selectedPlan.cameraName }}
            </div>
          </div>
          <div class="responsive-card-tags">
            <span class="tag" :class="selectedPlan.status === 'enabled' ? 'tag-success' : 'tag-warning'">
              {{ enumLabel("status", selectedPlan.status) }}
            </span>
          </div>
        </div>

        <div class="mobile-inline-detail-grid">
          <div class="responsive-card-field responsive-card-field-full">
            <span>调度方式</span>
            <strong>{{ selectedPlan.scheduleSummary }}</strong>
          </div>
          <div class="responsive-card-field">
            <span>下一次执行</span>
            <strong>{{ formatDateTime(selectedPlan.nextTriggerAt) }}</strong>
          </div>
          <div class="responsive-card-field">
            <span>最近成功</span>
            <strong>{{ formatDateTime(selectedPlan.lastSuccessAt) }}</strong>
          </div>
        </div>

        <div class="mobile-inline-detail-actions">
          <button class="primary-button" :disabled="runningNow || !canEdit" @click="runPlan">
            {{ runningNow ? "执行中..." : "立即执行" }}
          </button>
          <RouterLink
            v-if="isCompactViewport && canEdit && selectedPlan"
            class="ghost-button"
            :to="{ path: `/devices/capture-plans/edit/${selectedPlan.id}`, query: planQueryContext }"
          >
            编辑计划
          </RouterLink>
          <button v-else class="ghost-button" type="button" :disabled="!canEdit" @click="openEditor()">
            编辑计划
          </button>
          <RouterLink :to="timelineLink" class="mobile-field-shortcut">图片时间轴</RouterLink>
          <RouterLink :to="camerasLink" class="mobile-field-shortcut">当前摄像头</RouterLink>
        </div>

        <div class="mobile-inline-detail-copy">
          最近任务 {{ selectedPlan.lastJobId || "-" }} · 最近快照 {{ selectedPlan.lastSnapshotId || "-" }} · 最近错误 {{ selectedPlan.lastErrorMessage || "无" }}
        </div>

        <div class="detail-card mobile-camera-latest-card">
          <div class="mobile-camera-latest-head">
            <div>
              <div class="detail-label">当前计划最近图片</div>
              <div class="detail-value">
                {{ latestPlanSnapshot ? formatDateTime(latestPlanSnapshot.capturedAt || latestPlanSnapshot.receivedAt) : "当前还没有图片记录" }}
              </div>
            </div>
            <span v-if="latestPlanSnapshot" class="tag tag-p2">
              {{ enumLabel("snapshotSourceType", latestPlanSnapshot.sourceType) }}
            </span>
          </div>

          <div v-if="latestPlanSnapshotLoading" class="mobile-inline-detail-copy">正在加载最近图片...</div>
          <template v-else-if="latestPlanSnapshot">
            <img
              class="mobile-camera-latest-image"
              :src="latestPlanSnapshot.thumbnailUrl || latestPlanSnapshot.fileUrl"
              :alt="latestPlanSnapshot.previewText || selectedPlan.cameraName"
            />
            <div class="mobile-camera-latest-meta">
              <span>{{ latestPlanSnapshot.snapshotNo }}</span>
              <span>{{ latestPlanSnapshot.cameraName || selectedPlan.cameraName }}</span>
            </div>
            <div class="mobile-inline-detail-actions">
              <a
                v-if="latestPlanSnapshot.fileUrl"
                :href="latestPlanSnapshot.fileUrl"
                class="mobile-field-shortcut"
                target="_blank"
                rel="noreferrer"
              >
                查看原图
              </a>
              <RouterLink :to="timelineLink" class="mobile-field-shortcut">去图片时间轴</RouterLink>
            </div>
          </template>
          <div v-else class="mobile-inline-detail-copy">
            这台摄像头当前还没有图片，可先立即执行计划，或去摄像头页手动抓图。
          </div>
        </div>
      </section>

      <table class="simple-table desktop-table-only">
        <thead>
          <tr>
            <th>计划编号</th>
            <th>计划名称</th>
            <th>摄像头</th>
            <th>调度方式</th>
            <th>下一次执行</th>
            <th>最近成功</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in plans" :key="item.id" @click="selectPlan(item)">
            <td>{{ item.planNo }}</td>
            <td>{{ item.planName }}</td>
            <td>{{ item.cameraName }}</td>
            <td>{{ item.scheduleSummary }}</td>
            <td>{{ formatDateTime(item.nextTriggerAt) }}</td>
            <td>{{ formatDateTime(item.lastSuccessAt) }}</td>
            <td><span class="tag" :class="item.status === 'enabled' ? 'tag-success' : 'tag-warning'">{{ enumLabel("status", item.status) }}</span></td>
          </tr>
          <tr v-if="!loading && plans.length === 0">
            <td colspan="7" class="empty-cell">暂无抓图计划</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!loading && plans.length > 0" class="responsive-card-list tablet-card-list">
        <article
          v-for="item in plans"
          :key="item.id"
          class="responsive-entity-card"
          :class="{ active: selectedPlan?.id === item.id }"
          @click="selectPlan(item)"
        >
          <div class="responsive-card-head">
            <div class="table-primary-cell">
              <strong>{{ item.planName }}</strong>
              <span>{{ item.planNo }} · {{ item.cameraName }}</span>
            </div>
            <div class="responsive-card-tags">
              <span class="tag" :class="item.status === 'enabled' ? 'tag-success' : 'tag-warning'">
                {{ enumLabel("status", item.status) }}
              </span>
            </div>
          </div>
          <div class="responsive-card-grid">
            <div class="responsive-card-field responsive-card-field-full">
              <span>调度方式</span>
              <strong>{{ item.scheduleSummary }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>下一次执行</span>
              <strong>{{ formatDateTime(item.nextTriggerAt) }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>最近成功</span>
              <strong>{{ formatDateTime(item.lastSuccessAt) }}</strong>
            </div>
          </div>
          <div class="responsive-card-actions" @click.stop>
            <RouterLink
              v-if="isCompactViewport"
              class="ghost-button"
              :to="{ path: `/devices/capture-plans/edit/${item.id}`, query: item.cameraId ? { cameraId: String(item.cameraId) } : {} }"
            >
              编辑计划
            </RouterLink>
            <button v-else class="ghost-button" @click="openEditor(item)">右侧编辑</button>
            <button class="ghost-button" :disabled="runningNow || !canEdit" @click="runPlanFor(item)">
              {{ runningNow && selectedPlan?.id === item.id ? "执行中..." : "立即执行" }}
            </button>
          </div>
        </article>
      </div>
      <div v-if="!loading && plans.length === 0" class="empty-state tablet-card-empty">暂无抓图计划</div>
    </section>

    <section class="panel split-panel mobile-detail-panel">
      <div class="stack">
        <div class="panel-header">
          <h2>{{ selectedPlan ? "编辑计划" : "新建计划" }}</h2>
          <span class="tag tag-p1">{{ selectedPlan?.planNo || "new" }}</span>
        </div>

        <form class="form-grid" @submit.prevent="savePlan">
          <label class="form-item">
            <span>计划名称</span>
            <input v-model="form.planName" type="text" placeholder="例如：东棚晨间抓图" />
          </label>
          <label class="form-item">
            <span>摄像头</span>
            <select v-model="form.cameraId">
              <option value="">请选择摄像头</option>
              <option v-for="camera in cameras" :key="camera.id" :value="camera.id">
                {{ camera.cameraName }}
              </option>
            </select>
          </label>
          <label class="form-item">
            <span>调度类型</span>
            <select v-model="form.scheduleType">
              <option value="interval">{{ enumLabel("capturePlanScheduleType", "interval") }}</option>
              <option value="daily">{{ enumLabel("capturePlanScheduleType", "daily") }}</option>
            </select>
          </label>
          <label v-if="form.scheduleType === 'interval'" class="form-item">
            <span>间隔分钟</span>
            <input v-model="form.intervalMinutes" type="number" min="1" placeholder="例如 10" />
          </label>
          <label v-else class="form-item">
            <span>每日时间</span>
            <input v-model="form.dailyTime" type="time" />
          </label>
          <label class="form-item">
            <span>抓图用途</span>
            <select v-model="form.capturePurpose">
              <option value="preview">{{ enumLabel("capturePurpose", "preview") }}</option>
              <option value="evidence">{{ enumLabel("capturePurpose", "evidence") }}</option>
              <option value="analysis">{{ enumLabel("capturePurpose", "analysis") }}</option>
              <option value="report">{{ enumLabel("capturePurpose", "report") }}</option>
            </select>
          </label>
          <label class="form-item">
            <span>状态</span>
            <select v-model="form.status">
              <option value="enabled">{{ enumLabel("status", "enabled") }}</option>
              <option value="disabled">{{ enumLabel("status", "disabled") }}</option>
            </select>
          </label>
          <label class="form-item form-span">
            <span>备注</span>
            <textarea v-model="form.remark" rows="3" placeholder="例如：仅用于日报封面抓图" />
          </label>

          <div class="form-actions form-span">
            <button class="ghost-button" type="button" @click="resetForm">清空</button>
            <button class="ghost-button" type="button" :disabled="!selectedPlan || saving || !canEdit" @click="runPlan">
              {{ runningNow ? "执行中..." : "立即执行一次" }}
            </button>
            <button class="ghost-button danger-button" type="button" :disabled="!selectedPlan || saving || !canEdit" @click="removePlan">
              删除
            </button>
            <button class="primary-button" :disabled="saving || !canEdit">
              {{ saving ? "保存中..." : selectedPlan ? "保存计划" : "创建计划" }}
            </button>
          </div>
        </form>
      </div>

      <div>
        <div class="panel-header">
          <h2>计划详情</h2>
          <span class="tag tag-p2">{{ selectedPlan?.planName || "未选择" }}</span>
        </div>

        <div v-if="selectedPlan" class="detail-grid">
          <div>
            <div class="detail-label">计划编号</div>
            <div class="detail-value">{{ selectedPlan.planNo }}</div>
          </div>
          <div>
            <div class="detail-label">调度方式</div>
            <div class="detail-value">{{ selectedPlan.scheduleSummary }}</div>
          </div>
          <div>
            <div class="detail-label">下一次执行</div>
            <div class="detail-value">{{ formatDateTime(selectedPlan.nextTriggerAt) }}</div>
          </div>
          <div>
            <div class="detail-label">最近触发</div>
            <div class="detail-value">{{ formatDateTime(selectedPlan.lastTriggeredAt) }}</div>
          </div>
          <div>
            <div class="detail-label">最近成功</div>
            <div class="detail-value">{{ formatDateTime(selectedPlan.lastSuccessAt) }}</div>
          </div>
          <div>
            <div class="detail-label">最近失败</div>
            <div class="detail-value">{{ formatDateTime(selectedPlan.lastFailureAt) }}</div>
          </div>
          <div>
            <div class="detail-label">最近任务ID</div>
            <div class="detail-value">{{ selectedPlan.lastJobId || "-" }}</div>
          </div>
          <div>
            <div class="detail-label">最近快照ID</div>
            <div class="detail-value">{{ selectedPlan.lastSnapshotId || "-" }}</div>
          </div>
          <div class="detail-span">
            <div class="detail-label">最近错误</div>
            <div class="detail-value">{{ selectedPlan.lastErrorMessage || "-" }}</div>
          </div>
          <div class="detail-span">
            <div class="detail-label">备注</div>
            <div class="detail-value">{{ selectedPlan.remark || "-" }}</div>
          </div>
        </div>
        <div v-else class="empty-state">从列表选择一个抓图计划，或直接新建。</div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatDateTime } from "../lib/format";
import { hasPermission } from "../lib/session";

const loading = ref(false);
const saving = ref(false);
const runningNow = ref(false);
const errorMessage = ref("");
const message = ref("");
const plans = ref([]);
const cameras = ref([]);
const selectedPlan = ref(null);
const latestPlanSnapshot = ref(null);
const latestPlanSnapshotLoading = ref(false);
const mobileFiltersOpen = ref(false);
const isCompactViewport = ref(false);
const route = useRoute();
const router = useRouter();

const filters = reactive({
  keyword: "",
  cameraId: "",
  status: "",
  scheduleType: ""
});

const form = reactive({
  planName: "",
  cameraId: "",
  scheduleType: "interval",
  intervalMinutes: 10,
  dailyTime: "08:00",
  capturePurpose: "preview",
  status: "enabled",
  remark: ""
});

const canEdit = hasPermission("device:edit");
const selectedPlanCameraName = computed(() => {
  const cameraId = selectedPlan.value?.cameraId || filters.cameraId;
  return cameras.value.find((item) => String(item.id) === String(cameraId))?.cameraName || "全部摄像头";
});
const planQueryContext = computed(() => {
  const query = {};
  if (filters.cameraId) query.cameraId = String(filters.cameraId);
  return query;
});
const dashboardLink = computed(() => ({ path: "/dashboard/overview", query: {} }));
const camerasLink = computed(() => ({ path: "/devices/cameras", query: planQueryContext.value }));
const timelineLink = computed(() => ({ path: "/monitor/camera-timeline", query: planQueryContext.value }));

function syncViewportMode() {
  if (typeof window === "undefined") {
    return;
  }

  isCompactViewport.value = window.innerWidth <= 960;
}

function resetFilters() {
  filters.keyword = "";
  filters.cameraId = "";
  filters.status = "";
  filters.scheduleType = "";
  mobileFiltersOpen.value = false;
  loadPlans();
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
  filters.cameraId = readNumberQuery(route.query.cameraId);
  filters.status = firstQueryValue(route.query.status) || "";
  filters.scheduleType = firstQueryValue(route.query.scheduleType) || "";
}

function syncRouteQuery() {
  const query = {};
  if (filters.keyword) query.keyword = String(filters.keyword);
  if (filters.cameraId) query.cameraId = String(filters.cameraId);
  if (filters.status) query.status = String(filters.status);
  if (filters.scheduleType) query.scheduleType = String(filters.scheduleType);
  if (selectedPlan.value?.id) query.planId = String(selectedPlan.value.id);
  router.replace({ query }).catch(() => {});
}

function resetForm() {
  selectedPlan.value = null;
  form.planName = "";
  form.cameraId = "";
  form.scheduleType = "interval";
  form.intervalMinutes = 10;
  form.dailyTime = "08:00";
  form.capturePurpose = "preview";
  form.status = "enabled";
  form.remark = "";
  syncRouteQuery();
}

function openEditor(item = null) {
  if (item) {
    selectPlan(item);
  }
}

function selectPlan(item) {
  selectedPlan.value = item;
  form.planName = item.planName || "";
  form.cameraId = item.cameraId || "";
  form.scheduleType = item.scheduleType || "interval";
  form.intervalMinutes = item.intervalMinutes || 10;
  form.dailyTime = item.dailyTime || "08:00";
  form.capturePurpose = item.capturePurpose || "preview";
  form.status = item.status || "enabled";
  form.remark = item.remark || "";
  syncRouteQuery();
}

function buildPayload() {
  return {
    planName: form.planName,
    cameraId: form.cameraId ? Number(form.cameraId) : null,
    scheduleType: form.scheduleType,
    intervalMinutes: form.scheduleType === "interval" ? Number(form.intervalMinutes) : null,
    dailyTime: form.scheduleType === "daily" ? form.dailyTime : null,
    capturePurpose: form.capturePurpose,
    status: form.status,
    remark: form.remark
  };
}

async function loadCameras() {
  cameras.value = await apiRequest("/api/v1/cameras");
}

async function loadPlans() {
  loading.value = true;
  errorMessage.value = "";
  try {
    syncRouteQuery();
    plans.value = await apiRequest(`/api/v1/capture-plans${buildQuery(filters)}`);
    mobileFiltersOpen.value = false;
    const routePlanId = readNumberQuery(route.query.planId);
    if (routePlanId) {
      const routePlan = plans.value.find((item) => item.id === routePlanId) || null;
      if (routePlan) {
        selectPlan(routePlan);
      } else {
        selectedPlan.value = null;
      }
    } else if (selectedPlan.value) {
      const next = plans.value.find((item) => item.id === selectedPlan.value.id) || null;
      selectedPlan.value = next;
      if (next) {
        selectPlan(next);
      }
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function loadLatestPlanSnapshot() {
  if (!selectedPlan.value?.cameraId) {
    latestPlanSnapshot.value = null;
    return;
  }

  latestPlanSnapshotLoading.value = true;
  try {
    const rows = await apiRequest(`/api/v1/snapshots${buildQuery({ cameraId: selectedPlan.value.cameraId, limit: 1 })}`);
    latestPlanSnapshot.value = rows[0] || null;
  } catch {
    latestPlanSnapshot.value = null;
  } finally {
    latestPlanSnapshotLoading.value = false;
  }
}

async function savePlan() {
  if (!canEdit) {
    return;
  }

  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const url = selectedPlan.value ? `/api/v1/capture-plans/${selectedPlan.value.id}` : "/api/v1/capture-plans";
    const method = selectedPlan.value ? "PUT" : "POST";
    const result = await apiRequest(url, {
      method,
      body: JSON.stringify(buildPayload())
    });
    message.value = selectedPlan.value
      ? "抓图计划已保存"
      : `抓图计划已创建：${result.planNo}`;
    await loadPlans();
    if (!selectedPlan.value) {
      resetForm();
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

async function removePlan() {
  if (!selectedPlan.value || !canEdit) {
    return;
  }

  const confirmed = window.confirm(`确认删除抓图计划“${selectedPlan.value.planName}”吗？`);
  if (!confirmed) {
    return;
  }

  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/capture-plans/${selectedPlan.value.id}`, {
      method: "DELETE"
    });
    message.value = "抓图计划已删除";
    resetForm();
    await loadPlans();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

async function runPlan() {
  if (!selectedPlan.value || !canEdit) {
    return;
  }

  runningNow.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const result = await apiRequest(`/api/v1/capture-plans/${selectedPlan.value.id}/run`, {
      method: "POST",
      body: JSON.stringify({})
    });
    message.value = `抓图计划已执行：${result.jobNo}`;
    await loadPlans();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    runningNow.value = false;
  }
}

async function runPlanFor(item) {
  selectPlan(item);
  await runPlan();
}

onMounted(async () => {
  syncViewportMode();
  hydrateFiltersFromRoute();
  await loadCameras();
  await loadPlans();
});

watch(
  () => selectedPlan.value?.cameraId,
  async () => {
    await loadLatestPlanSnapshot();
  },
  { immediate: true }
);
</script>
