<template>
  <div class="stack">
    <section class="panel mobile-plan-editor-page">
      <div class="panel-header">
        <div>
          <div class="mobile-field-kicker">抓图计划编辑</div>
          <h2>{{ selectedPlan ? "编辑抓图计划" : "新建抓图计划" }}</h2>
          <p class="panel-subtitle">
            {{ selectedPlan ? `${selectedPlan.planNo} · ${selectedPlan.cameraName}` : "手机端可直接创建、保存、执行和删除计划。" }}
          </p>
        </div>
        <div class="inline-actions">
          <button class="ghost-button" type="button" @click="goBack">返回列表</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <div v-if="selectedPlan" class="mobile-inline-detail-card">
        <div class="mobile-inline-detail-head">
          <div>
            <strong class="mobile-inline-detail-title">{{ selectedPlan.planName }}</strong>
            <div class="mobile-inline-detail-subtitle">{{ selectedPlan.scheduleSummary }}</div>
          </div>
          <span class="tag" :class="selectedPlan.status === 'enabled' ? 'tag-success' : 'tag-warning'">
            {{ enumLabel("status", selectedPlan.status) }}
          </span>
        </div>
        <div class="mobile-inline-detail-grid">
          <div class="responsive-card-field">
            <span>下一次执行</span>
            <strong>{{ formatDateTime(selectedPlan.nextTriggerAt) }}</strong>
          </div>
          <div class="responsive-card-field">
            <span>最近成功</span>
            <strong>{{ formatDateTime(selectedPlan.lastSuccessAt) }}</strong>
          </div>
        </div>
      </div>

      <form class="form-grid mobile-plan-editor-form" @submit.prevent="savePlan">
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

        <div class="form-actions form-span mobile-plan-editor-actions">
          <button class="ghost-button" type="button" @click="resetForm">清空</button>
          <button class="ghost-button" type="button" :disabled="!selectedPlan || saving || !canEdit" @click="runPlan">
            {{ runningNow ? "执行中..." : "立即执行" }}
          </button>
          <button class="ghost-button danger-button" type="button" :disabled="!selectedPlan || saving || !canEdit" @click="removePlan">
            删除
          </button>
          <button class="primary-button" :disabled="saving || !canEdit">
            {{ saving ? "保存中..." : selectedPlan ? "保存计划" : "创建计划" }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { apiRequest } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatDateTime } from "../lib/format";
import { hasPermission } from "../lib/session";

type CameraOption = { id: number; cameraName: string };
type CapturePlanDetail = {
  id: number;
  planNo: string;
  cameraId: number;
  planName: string;
  scheduleType: string;
  intervalMinutes: number | null;
  dailyTime: string | null;
  capturePurpose: string;
  status: string;
  nextTriggerAt: string | null;
  lastSuccessAt: string | null;
  cameraName: string;
  scheduleSummary: string;
  remark: string | null;
};

const route = useRoute();
const router = useRouter();
const cameras = ref<CameraOption[]>([]);
const selectedPlan = ref<CapturePlanDetail | null>(null);
const saving = ref(false);
const runningNow = ref(false);
const errorMessage = ref("");
const message = ref("");
const canEdit = hasPermission("device:edit");

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

const listLink = computed(() => ({
  path: "/devices/capture-plans",
  query: route.query.cameraId ? { cameraId: String(route.query.cameraId) } : {}
}));

function parsePlanId(): number | null {
  const raw = Array.isArray(route.params.planId) ? route.params.planId[0] : route.params.planId;
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function resetForm() {
  if (!selectedPlan.value) {
    form.planName = "";
    form.cameraId = "";
    form.scheduleType = "interval";
    form.intervalMinutes = 10;
    form.dailyTime = "08:00";
    form.capturePurpose = "preview";
    form.status = "enabled";
    form.remark = "";
  }
}

function hydrateForm(plan: CapturePlanDetail | null) {
  if (!plan) {
    resetForm();
    return;
  }

  form.planName = plan.planName || "";
  form.cameraId = plan.cameraId ? String(plan.cameraId) : "";
  form.scheduleType = plan.scheduleType || "interval";
  form.intervalMinutes = plan.intervalMinutes || 10;
  form.dailyTime = plan.dailyTime || "08:00";
  form.capturePurpose = plan.capturePurpose || "preview";
  form.status = plan.status || "enabled";
  form.remark = plan.remark || "";
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

async function loadPlan() {
  const planId = parsePlanId();
  if (!planId) {
    selectedPlan.value = null;
    hydrateForm(null);
    return;
  }

  selectedPlan.value = await apiRequest(`/api/v1/capture-plans/${planId}`);
  hydrateForm(selectedPlan.value);
}

async function savePlan() {
  if (!canEdit) {
    return;
  }

  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const planId = parsePlanId();
    const url = planId ? `/api/v1/capture-plans/${planId}` : "/api/v1/capture-plans";
    const method = planId ? "PUT" : "POST";
    const result = (await apiRequest(url, {
      method,
      body: JSON.stringify(buildPayload())
    })) as { id: number; planNo: string };
    message.value = planId ? "抓图计划已保存" : `抓图计划已创建：${result.planNo}`;
    if (planId) {
      await loadPlan();
    } else {
      router.replace({
        path: `/devices/capture-plans/edit/${result.id}`,
        query: route.query
      }).catch(() => {});
      selectedPlan.value = (await apiRequest(`/api/v1/capture-plans/${result.id}`)) as CapturePlanDetail;
      hydrateForm(selectedPlan.value);
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

async function runPlan() {
  const planId = parsePlanId();
  if (!planId || !canEdit) {
    return;
  }

  runningNow.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const result = (await apiRequest(`/api/v1/capture-plans/${planId}/run`, {
      method: "POST",
      body: JSON.stringify({})
    })) as { jobNo: string };
    message.value = `抓图计划已执行：${result.jobNo}`;
    await loadPlan();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "执行失败";
  } finally {
    runningNow.value = false;
  }
}

async function removePlan() {
  const planId = parsePlanId();
  if (!planId || !selectedPlan.value || !canEdit) {
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
    await apiRequest(`/api/v1/capture-plans/${planId}`, {
      method: "DELETE"
    });
    router.push(listLink.value).catch(() => {});
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "删除失败";
  } finally {
    saving.value = false;
  }
}

function goBack() {
  router.push(listLink.value).catch(() => {});
}

onMounted(async () => {
  await loadCameras();
  await loadPlan();
});
</script>
