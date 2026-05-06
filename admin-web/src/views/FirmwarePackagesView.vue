<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>固件包管理</h2>
          <p class="muted-text">维护 OTA 固件版本、下载地址和发布状态，供升级任务直接引用。</p>
        </div>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadPackages">刷新</button>
          <RouterLink class="ghost-button" to="/devices/firmware/jobs">升级任务</RouterLink>
          <button v-if="canCreate" class="primary-button" @click="startCreate">新增固件包</button>
        </div>
      </div>

      <div class="stats-grid">
        <article class="stat-card">
          <div class="stat-label">固件包总数</div>
          <strong>{{ packages.length }}</strong>
        </article>
        <article class="stat-card">
          <div class="stat-label">已发布</div>
          <strong>{{ releasedPackageCount }}</strong>
        </article>
        <article class="stat-card">
          <div class="stat-label">草稿</div>
          <strong>{{ draftPackageCount }}</strong>
        </article>
        <article class="stat-card">
          <div class="stat-label">禁用</div>
          <strong>{{ disabledPackageCount }}</strong>
        </article>
      </div>

      <div class="toolbar">
        <label class="filter-item">
          <span>关键字</span>
          <input v-model="filters.keyword" type="text" placeholder="固件包编号 / 名称 / 版本" />
        </label>
        <label class="filter-item">
          <span>状态</span>
          <select v-model="filters.status">
            <option value="">全部</option>
            <option value="draft">草稿</option>
            <option value="released">已发布</option>
            <option value="disabled">已禁用</option>
          </select>
        </label>
        <label class="filter-item">
          <span>设备类型</span>
          <select v-model="filters.deviceType">
            <option value="">全部</option>
            <option value="esp32">ESP32</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadPackages">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table">
        <thead>
          <tr>
            <th>固件包编号</th>
            <th>包名称</th>
            <th>版本</th>
            <th>设备类型</th>
            <th>文件大小</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in packages" :key="item.id">
            <td>{{ item.packageNo }}</td>
            <td>{{ item.packageName }}</td>
            <td>{{ item.firmwareVersion }}</td>
            <td>{{ item.deviceType || "esp32" }}</td>
            <td>{{ formatFileSize(item.fileSizeBytes) }}</td>
            <td><span class="tag" :class="packageStatusClass(item.status)">{{ packageStatusLabel(item.status) }}</span></td>
            <td>{{ formatDateTime(item.createdAt) }}</td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click="selectPackage(item)">详情</button>
                <button class="table-link" @click="copyDownloadUrl(item)">复制链接</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && packages.length === 0">
            <td colspan="8" class="empty-cell">暂无固件包</td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="muted-text">正在加载固件包...</div>
    </section>

    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>新增固件包</h2>
          <span class="tag tag-p1">P1</span>
        </div>

        <form class="form-grid" @submit.prevent="savePackage">
          <label class="form-item">
            <span>包名称</span>
            <input v-model="form.packageName" type="text" placeholder="soil-001 OTA 包" />
          </label>
          <label class="form-item">
            <span>固件版本</span>
            <input v-model="form.firmwareVersion" type="text" placeholder="1.0.3" />
          </label>
          <label class="form-item">
            <span>设备类型</span>
            <select v-model="form.deviceType">
              <option value="esp32">ESP32</option>
            </select>
          </label>
          <label class="form-item">
            <span>发布状态</span>
            <select v-model="form.status">
              <option value="draft">草稿</option>
              <option value="released">已发布</option>
              <option value="disabled">已禁用</option>
            </select>
          </label>
          <label class="form-item form-span">
            <span>下载地址</span>
            <input v-model="form.downloadUrl" type="url" placeholder="http://82.156.45.208/media/.../soil_sensor_reporter-1.0.3.bin" />
          </label>
          <label class="form-item">
            <span>文件名</span>
            <input v-model="form.fileName" type="text" placeholder="soil_sensor_reporter-1.0.3.bin" />
          </label>
          <label class="form-item">
            <span>文件大小（字节）</span>
            <input v-model="form.fileSizeBytes" type="number" min="1" step="1" placeholder="1131392" />
          </label>
          <label class="form-item">
            <span>硬件版本</span>
            <input v-model="form.hardwareVersion" type="text" placeholder="ESP32 DevKit 32E" />
          </label>
          <label class="form-item form-span">
            <span>SHA256</span>
            <input v-model="form.sha256" type="text" placeholder="9a443b..." />
          </label>
          <label class="form-item form-span">
            <span>发布说明</span>
            <textarea v-model="form.releaseNote" rows="4" placeholder="描述本次修复、配置变更和回退注意点。" />
          </label>
          <div class="form-actions form-span">
            <button class="ghost-button" type="button" @click="resetForm">清空</button>
            <button class="primary-button" :disabled="saving || !canCreate">
              {{ saving ? "保存中..." : "创建固件包" }}
            </button>
          </div>
        </form>
      </div>

      <div>
        <div class="panel-header">
          <h2>固件摘要</h2>
          <span class="tag tag-p1">{{ selectedPackage?.packageNo || "未选择" }}</span>
        </div>
        <div v-if="selectedPackage" class="stack">
          <div class="detail-grid">
            <div>
              <div class="detail-label">包名称</div>
              <div class="detail-value">{{ selectedPackage.packageName || "-" }}</div>
            </div>
            <div>
              <div class="detail-label">固件版本</div>
              <div class="detail-value">{{ selectedPackage.firmwareVersion || "-" }}</div>
            </div>
            <div>
              <div class="detail-label">设备类型</div>
              <div class="detail-value">{{ selectedPackage.deviceType || "esp32" }}</div>
            </div>
            <div>
              <div class="detail-label">硬件版本</div>
              <div class="detail-value">{{ selectedPackage.hardwareVersion || "-" }}</div>
            </div>
            <div>
              <div class="detail-label">文件名</div>
              <div class="detail-value">{{ selectedPackage.fileName || "-" }}</div>
            </div>
            <div>
              <div class="detail-label">文件大小</div>
              <div class="detail-value">{{ formatFileSize(selectedPackage.fileSizeBytes) }}</div>
            </div>
            <div class="detail-span">
              <div class="detail-label">下载地址</div>
              <div class="detail-value">{{ selectedPackage.downloadUrl || "-" }}</div>
            </div>
            <div class="detail-span">
              <div class="detail-label">SHA256</div>
              <div class="detail-value">{{ selectedPackage.sha256 || "-" }}</div>
            </div>
          </div>

          <div class="detail-card">
            <div class="panel-header">
              <h3>发布说明</h3>
              <span class="tag" :class="packageStatusClass(selectedPackage.status)">{{ packageStatusLabel(selectedPackage.status) }}</span>
            </div>
            <div class="muted-text">{{ selectedPackage.releaseNote || "当前未填写发布说明。" }}</div>
          </div>
        </div>
        <div v-else class="empty-state">从列表选择一个固件包查看摘要。</div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { RouterLink } from "vue-router";
import { apiRequest, buildQuery } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { hasPermission } from "../lib/session";

interface FirmwarePackageRecord {
  id: number;
  tenantId?: number | null;
  packageNo?: string | null;
  deviceType?: string | null;
  packageName?: string | null;
  firmwareVersion?: string | null;
  hardwareVersion?: string | null;
  downloadUrl?: string | null;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  sha256?: string | null;
  releaseNote?: string | null;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const message = ref("");
const packages = ref<FirmwarePackageRecord[]>([]);
const selectedPackage = ref<FirmwarePackageRecord | null>(null);

const filters = reactive({
  keyword: "",
  status: "",
  deviceType: "esp32"
});

const form = reactive({
  packageName: "",
  firmwareVersion: "",
  deviceType: "esp32",
  hardwareVersion: "",
  downloadUrl: "",
  fileName: "",
  fileSizeBytes: "",
  sha256: "",
  releaseNote: "",
  status: "released"
});

const canCreate = hasPermission("gateway:firmware_upgrade");
const releasedPackageCount = computed(() => packages.value.filter((item) => item.status === "released").length);
const draftPackageCount = computed(() => packages.value.filter((item) => item.status === "draft").length);
const disabledPackageCount = computed(() => packages.value.filter((item) => item.status === "disabled").length);

function packageStatusLabel(status?: string | null) {
  switch (status) {
    case "released":
      return "已发布";
    case "disabled":
      return "已禁用";
    default:
      return "草稿";
  }
}

function packageStatusClass(status?: string | null) {
  if (status === "released") return "tag-success";
  if (status === "disabled") return "tag-danger";
  return "tag-warning";
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
  filters.keyword = "";
  filters.status = "";
  filters.deviceType = "esp32";
  void loadPackages();
}

function resetForm() {
  form.packageName = "";
  form.firmwareVersion = "";
  form.deviceType = "esp32";
  form.hardwareVersion = "";
  form.downloadUrl = "";
  form.fileName = "";
  form.fileSizeBytes = "";
  form.sha256 = "";
  form.releaseNote = "";
  form.status = "released";
}

function startCreate() {
  resetForm();
  message.value = "";
  errorMessage.value = "";
}

function selectPackage(item: FirmwarePackageRecord) {
  selectedPackage.value = item;
}

async function copyText(value: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("copy_failed");
  }
}

async function copyDownloadUrl(item: FirmwarePackageRecord) {
  if (!item.downloadUrl) {
    errorMessage.value = "当前固件包没有下载地址";
    return;
  }
  try {
    await copyText(item.downloadUrl);
    message.value = `已复制 ${item.packageNo || item.packageName || "固件包"} 下载地址`;
    errorMessage.value = "";
  } catch (error: any) {
    errorMessage.value = error.message || "复制失败";
  }
}

async function loadPackages() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const rows = await apiRequest<FirmwarePackageRecord[]>(`/api/v1/firmware/packages${buildQuery(filters)}`);
    packages.value = rows;
    if (selectedPackage.value) {
      selectedPackage.value = rows.find((item) => item.id === selectedPackage.value?.id) || rows[0] || null;
    } else {
      selectedPackage.value = rows[0] || null;
    }
  } catch (error: any) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function savePackage() {
  if (!canCreate) {
    return;
  }

  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest("/api/v1/firmware/packages", {
      method: "POST",
      body: JSON.stringify({
        packageName: form.packageName,
        firmwareVersion: form.firmwareVersion,
        deviceType: form.deviceType,
        hardwareVersion: form.hardwareVersion || null,
        downloadUrl: form.downloadUrl,
        fileName: form.fileName || null,
        fileSizeBytes: form.fileSizeBytes ? Number(form.fileSizeBytes) : null,
        sha256: form.sha256,
        releaseNote: form.releaseNote || null,
        status: form.status
      })
    });
    message.value = "固件包已创建";
    resetForm();
    await loadPackages();
  } catch (error: any) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadPackages();
});
</script>
