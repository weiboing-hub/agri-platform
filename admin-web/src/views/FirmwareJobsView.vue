<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>固件升级任务</h2>
          <p class="muted-text">为网关下发 OTA 任务，并跟踪下载、刷写和设备回报。</p>
        </div>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadJobs">刷新</button>
          <RouterLink class="ghost-button" to="/devices/firmware/packages">固件包</RouterLink>
          <button v-if="canCreate" class="primary-button" @click="startCreate">创建升级任务</button>
        </div>
      </div>

      <div class="stats-grid">
        <article class="stat-card">
          <div class="stat-label">任务总数</div>
          <strong>{{ jobs.length }}</strong>
        </article>
        <article class="stat-card">
          <div class="stat-label">处理中</div>
          <strong>{{ activeJobCount }}</strong>
        </article>
        <article class="stat-card">
          <div class="stat-label">成功</div>
          <strong>{{ successJobCount }}</strong>
        </article>
        <article class="stat-card">
          <div class="stat-label">失败</div>
          <strong>{{ failedJobCount }}</strong>
        </article>
      </div>

      <div class="toolbar">
        <label class="filter-item">
          <span>网关</span>
          <select v-model="filters.gatewayId">
            <option value="">全部</option>
            <option v-for="gateway in gateways" :key="gateway.id" :value="gateway.id">
              {{ gateway.gatewayCode }} · {{ gateway.gatewayName }}
            </option>
          </select>
        </label>
        <label class="filter-item">
          <span>状态</span>
          <select v-model="filters.status">
            <option value="">全部</option>
            <option value="pending">待执行</option>
            <option value="downloading">下载中</option>
            <option value="upgrading">刷写中</option>
            <option value="success">成功</option>
            <option value="failed">失败</option>
            <option value="cancelled">已取消</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadJobs">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table">
        <thead>
          <tr>
            <th>任务编号</th>
            <th>网关</th>
            <th>当前版本</th>
            <th>目标版本</th>
            <th>固件包</th>
            <th>状态</th>
            <th>进度</th>
            <th>上报版本</th>
            <th>最后回报</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in jobs" :key="item.id">
            <td>{{ item.jobNo }}</td>
            <td>{{ item.gatewayCode }} · {{ item.gatewayName }}</td>
            <td>{{ item.currentVersion || "-" }}</td>
            <td>{{ item.targetVersion || "-" }}</td>
            <td>{{ item.packageNo || item.packageName || "-" }}</td>
            <td><span class="tag" :class="jobStatusClass(item.status)">{{ jobStatusLabel(item.status) }}</span></td>
            <td>{{ item.progressPercent ?? 0 }}%</td>
            <td>{{ item.reportedVersion || "-" }}</td>
            <td>{{ formatDateTime(item.lastReportedAt) }}</td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click="selectJob(item)">详情</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && jobs.length === 0">
            <td colspan="10" class="empty-cell">暂无升级任务</td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="muted-text">正在加载升级任务...</div>
    </section>

    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>创建升级任务</h2>
          <span class="tag tag-p1">P1</span>
        </div>

        <form class="form-grid" @submit.prevent="saveJob">
          <label class="form-item form-span">
            <span>目标网关</span>
            <select v-model="form.gatewayId">
              <option value="">请选择网关</option>
              <option v-for="gateway in gateways" :key="gateway.id" :value="gateway.id">
                {{ gateway.gatewayCode }} · {{ gateway.gatewayName }}
              </option>
            </select>
          </label>
          <label class="form-item form-span">
            <span>固件包</span>
            <select v-model="form.firmwarePackageId">
              <option value="">请选择固件包</option>
              <option v-for="item in releasedPackages" :key="item.id" :value="item.id">
                {{ item.firmwareVersion }} · {{ item.packageName || item.packageNo }}
              </option>
            </select>
          </label>
          <div class="detail-card detail-span">
            <div class="detail-grid">
              <div>
                <div class="detail-label">当前设备版本</div>
                <div class="detail-value">{{ selectedGatewayOption?.firmwareVersion || "-" }}</div>
              </div>
              <div>
                <div class="detail-label">目标固件版本</div>
                <div class="detail-value">{{ selectedPackageOption?.firmwareVersion || "-" }}</div>
              </div>
              <div>
                <div class="detail-label">下载地址</div>
                <div class="detail-value">{{ selectedPackageOption?.downloadUrl || "-" }}</div>
              </div>
              <div>
                <div class="detail-label">文件大小</div>
                <div class="detail-value">{{ formatFileSize(selectedPackageOption?.fileSizeBytes) }}</div>
              </div>
            </div>
          </div>
          <label class="form-item form-span">
            <span>备注</span>
            <textarea v-model="form.remark" rows="4" placeholder="例如：夜间空闲窗口升级，升级后观察 10 分钟。" />
          </label>
          <div class="form-actions form-span">
            <button class="ghost-button" type="button" @click="resetForm">清空</button>
            <button class="primary-button" :disabled="saving || !canCreate">
              {{ saving ? "创建中..." : "创建升级任务" }}
            </button>
          </div>
        </form>
      </div>

      <div>
        <div class="panel-header">
          <h2>任务详情</h2>
          <span class="tag tag-p1">{{ selectedJob?.jobNo || "未选择" }}</span>
        </div>
        <div v-if="selectedJob" class="stack">
          <div class="detail-grid">
            <div>
              <div class="detail-label">网关</div>
              <div class="detail-value">{{ selectedJob.gatewayCode }} · {{ selectedJob.gatewayName }}</div>
            </div>
            <div>
              <div class="detail-label">状态</div>
              <div class="detail-value">
                <span class="tag" :class="jobStatusClass(selectedJob.status)">{{ jobStatusLabel(selectedJob.status) }}</span>
              </div>
            </div>
            <div>
              <div class="detail-label">当前 / 目标版本</div>
              <div class="detail-value">{{ selectedJob.currentVersion || "-" }} → {{ selectedJob.targetVersion || "-" }}</div>
            </div>
            <div>
              <div class="detail-label">设备回报版本</div>
              <div class="detail-value">{{ selectedJob.reportedVersion || "-" }}</div>
            </div>
            <div>
              <div class="detail-label">开始时间</div>
              <div class="detail-value">{{ formatDateTime(selectedJob.startedAt) }}</div>
            </div>
            <div>
              <div class="detail-label">完成时间</div>
              <div class="detail-value">{{ formatDateTime(selectedJob.finishedAt) }}</div>
            </div>
            <div>
              <div class="detail-label">最后回报</div>
              <div class="detail-value">{{ formatDateTime(selectedJob.lastReportedAt) }}</div>
            </div>
            <div>
              <div class="detail-label">重试次数</div>
              <div class="detail-value">{{ selectedJob.retryCount ?? 0 }}</div>
            </div>
          </div>

          <div class="detail-card">
            <div class="panel-header">
              <h3>任务请求</h3>
              <span class="tag" :class="jobStatusClass(selectedJob.status)">{{ selectedJob.progressPercent ?? 0 }}%</span>
            </div>
            <pre class="json-block">{{ formatJson(selectedJob.requestJson) }}</pre>
          </div>

          <div v-if="selectedJob.errorMessage" class="detail-card">
            <div class="panel-header">
              <h3>失败原因</h3>
              <span class="tag tag-danger">error</span>
            </div>
            <div class="error-text">{{ selectedJob.errorMessage }}</div>
          </div>
        </div>
        <div v-else class="empty-state">从列表选择一条升级任务查看详情。</div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { apiRequest, buildQuery } from "../lib/api";
import { formatDateTime, formatJson } from "../lib/format";
import { hasPermission } from "../lib/session";

interface GatewayOptionRecord {
  id: number;
  gatewayCode: string;
  gatewayName: string;
  firmwareVersion?: string | null;
}

interface FirmwarePackageRecord {
  id: number;
  packageNo?: string | null;
  packageName?: string | null;
  deviceType?: string | null;
  firmwareVersion?: string | null;
  downloadUrl?: string | null;
  fileSizeBytes?: number | null;
  status?: string | null;
}

interface FirmwareJobRecord {
  id: number;
  jobNo?: string | null;
  gatewayId?: number | null;
  gatewayCode?: string | null;
  gatewayName?: string | null;
  firmwarePackageId?: number | null;
  packageNo?: string | null;
  packageName?: string | null;
  currentVersion?: string | null;
  targetVersion?: string | null;
  reportedVersion?: string | null;
  triggerSource?: string | null;
  status?: string | null;
  progressPercent?: number | null;
  errorMessage?: string | null;
  requestJson?: unknown;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastReportedAt?: string | null;
  retryCount?: number | null;
}

const route = useRoute();
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const message = ref("");
const jobs = ref<FirmwareJobRecord[]>([]);
const gateways = ref<GatewayOptionRecord[]>([]);
const packages = ref<FirmwarePackageRecord[]>([]);
const selectedJob = ref<FirmwareJobRecord | null>(null);

const filters = reactive({
  gatewayId: "",
  status: ""
});

const form = reactive({
  gatewayId: "",
  firmwarePackageId: "",
  remark: ""
});

const canCreate = hasPermission("gateway:firmware_upgrade");
const releasedPackages = computed(() => packages.value.filter((item) => item.status === "released"));
const selectedGatewayOption = computed(() => gateways.value.find((item) => String(item.id) === String(form.gatewayId)) || null);
const selectedPackageOption = computed(() => releasedPackages.value.find((item) => String(item.id) === String(form.firmwarePackageId)) || null);
const activeJobCount = computed(() => jobs.value.filter((item) => ["pending", "downloading", "upgrading"].includes(String(item.status || ""))).length);
const successJobCount = computed(() => jobs.value.filter((item) => item.status === "success").length);
const failedJobCount = computed(() => jobs.value.filter((item) => item.status === "failed").length);

function firstQueryValue(value: unknown) {
  if (Array.isArray(value)) {
    return value[0] ? String(value[0]) : "";
  }
  return value ? String(value) : "";
}

function hydrateFiltersFromRoute() {
  const gatewayId = firstQueryValue(route.query.gatewayId);
  if (gatewayId) {
    filters.gatewayId = gatewayId;
    form.gatewayId = gatewayId;
  }
}

function jobStatusLabel(status?: string | null) {
  switch (status) {
    case "pending":
      return "待执行";
    case "downloading":
      return "下载中";
    case "upgrading":
      return "刷写中";
    case "success":
      return "成功";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    default:
      return "未知";
  }
}

function jobStatusClass(status?: string | null) {
  if (status === "success") return "tag-success";
  if (status === "failed" || status === "cancelled") return "tag-danger";
  if (status === "downloading" || status === "upgrading" || status === "pending") return "tag-warning";
  return "";
}

function formatFileSize(value?: number | null) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) {
    return "-";
  }
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(2)} KB`;
  }
  return `${size} B`;
}

function resetFilters() {
  filters.gatewayId = "";
  filters.status = "";
  void loadJobs();
}

function resetForm() {
  form.gatewayId = filters.gatewayId || "";
  form.firmwarePackageId = "";
  form.remark = "";
}

function startCreate() {
  resetForm();
  message.value = "";
  errorMessage.value = "";
}

function selectJob(item: FirmwareJobRecord) {
  selectedJob.value = item;
}

async function loadGateways() {
  const rows = await apiRequest<GatewayOptionRecord[]>("/api/v1/gateways");
  gateways.value = rows;
}

async function loadPackages() {
  const rows = await apiRequest<FirmwarePackageRecord[]>("/api/v1/firmware/packages?deviceType=esp32");
  packages.value = rows;
}

async function loadJobs() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const rows = await apiRequest<FirmwareJobRecord[]>(`/api/v1/firmware/jobs${buildQuery(filters)}`);
    jobs.value = rows;
    if (selectedJob.value) {
      selectedJob.value = rows.find((item) => item.id === selectedJob.value?.id) || rows[0] || null;
    } else {
      selectedJob.value = rows[0] || null;
    }
  } catch (error: any) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function saveJob() {
  if (!canCreate) {
    return;
  }

  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest("/api/v1/firmware/jobs", {
      method: "POST",
      body: JSON.stringify({
        gatewayId: Number(form.gatewayId),
        firmwarePackageId: Number(form.firmwarePackageId),
        remark: form.remark || null
      })
    });
    message.value = "升级任务已创建";
    resetForm();
    await loadJobs();
  } catch (error: any) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  hydrateFiltersFromRoute();
  try {
    await Promise.all([
      loadGateways(),
      loadPackages()
    ]);
    await loadJobs();
  } catch (error: any) {
    errorMessage.value = error.message;
  }
});
</script>
