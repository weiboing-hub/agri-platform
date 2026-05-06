<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>抓图任务</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadJobs">刷新</button>
        </div>
      </div>

      <div class="toolbar">
        <label class="filter-item">
          <span>关键字</span>
          <input v-model="filters.keyword" type="text" placeholder="任务编号 / 摄像头" />
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
            <option value="pending">{{ enumLabel("captureJobStatus", "pending") }}</option>
            <option value="running">{{ enumLabel("captureJobStatus", "running") }}</option>
            <option value="success">{{ enumLabel("captureJobStatus", "success") }}</option>
            <option value="failed">{{ enumLabel("captureJobStatus", "failed") }}</option>
            <option value="cancelled">{{ enumLabel("captureJobStatus", "cancelled") }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>触发方式</span>
          <select v-model="filters.triggerType">
            <option value="">全部</option>
            <option value="manual">{{ enumLabel("triggerType", "manual") }}</option>
            <option value="schedule">{{ enumLabel("triggerType", "schedule") }}</option>
            <option value="event">{{ enumLabel("triggerType", "event") }}</option>
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
            <th>摄像头</th>
            <th>区域</th>
            <th>触发方式</th>
            <th>抓图用途</th>
            <th>状态</th>
            <th>执行时间</th>
            <th>创建人</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in jobs" :key="item.id" @click="selectedJob = item">
            <td>{{ item.jobNo }}</td>
            <td>{{ item.cameraName }}</td>
            <td>{{ item.areaName || "-" }}</td>
            <td>{{ enumLabel("triggerType", item.triggerType) }}</td>
            <td>{{ enumLabel("capturePurpose", item.capturePurpose) }}</td>
            <td><span class="tag" :class="jobClass(item.status)">{{ enumLabel("captureJobStatus", item.status) }}</span></td>
            <td>{{ formatDateTime(item.finishedAt || item.startedAt || item.createdAt) }}</td>
            <td>{{ item.createdByName || "-" }}</td>
          </tr>
          <tr v-if="!loading && jobs.length === 0">
            <td colspan="8" class="empty-cell">暂无抓图任务</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="panel split-panel">
      <div class="stack">
        <div class="panel-header">
          <h2>手动抓图</h2>
          <span class="tag tag-p1">capture</span>
        </div>
        <form class="form-grid" @submit.prevent="createCaptureJob">
          <label class="form-item">
            <span>摄像头</span>
            <select v-model="captureForm.cameraId">
              <option value="">请选择摄像头</option>
              <option v-for="camera in cameras" :key="camera.id" :value="camera.id">
                {{ camera.cameraName }}
              </option>
            </select>
          </label>
          <label class="form-item">
            <span>抓图用途</span>
            <select v-model="captureForm.capturePurpose">
              <option value="preview">{{ enumLabel("capturePurpose", "preview") }}</option>
              <option value="evidence">{{ enumLabel("capturePurpose", "evidence") }}</option>
              <option value="analysis">{{ enumLabel("capturePurpose", "analysis") }}</option>
              <option value="report">{{ enumLabel("capturePurpose", "report") }}</option>
            </select>
          </label>
          <label class="form-item form-span">
            <span>备注</span>
            <textarea v-model="captureForm.remark" rows="3" />
          </label>
          <div class="form-actions form-span">
            <button class="ghost-button" type="button" @click="resetCaptureForm">清空</button>
            <button class="primary-button" :disabled="savingCapture || !canEdit">
              {{ savingCapture ? "提交中..." : "立即抓图" }}
            </button>
          </div>
        </form>

        <div class="panel-header">
          <h2>模拟 FTP 接收</h2>
          <span class="tag tag-p2">ftp</span>
        </div>
        <form class="form-grid" @submit.prevent="submitFtpSnapshot">
          <label class="form-item">
            <span>摄像头</span>
            <select v-model="ftpForm.cameraId">
              <option value="">请选择摄像头</option>
              <option v-for="camera in cameras" :key="camera.id" :value="camera.id">
                {{ camera.cameraName }}
              </option>
            </select>
          </label>
          <label class="form-item">
            <span>拍摄时间</span>
            <input v-model="ftpForm.capturedAt" type="datetime-local" />
          </label>
          <label class="form-item form-span">
            <span>FTP 路径</span>
            <input v-model="ftpForm.ftpPath" type="text" placeholder="/camera/east-1/20260329-101000.jpg" />
          </label>
          <label class="form-item form-span">
            <span>落盘路径</span>
            <input v-model="ftpForm.filePath" type="text" placeholder="/data/ftp/east-1/20260329-101000.jpg" />
          </label>
          <label class="form-item">
            <span>宽度</span>
            <input v-model="ftpForm.imageWidth" type="number" min="0" />
          </label>
          <label class="form-item">
            <span>高度</span>
            <input v-model="ftpForm.imageHeight" type="number" min="0" />
          </label>
          <label class="form-item form-span">
            <span>备注</span>
            <textarea v-model="ftpForm.remark" rows="3" />
          </label>
          <div class="form-actions form-span">
            <button class="ghost-button" type="button" @click="resetFtpForm">清空</button>
            <button class="primary-button" :disabled="savingFtp || !canEdit">
              {{ savingFtp ? "提交中..." : "写入 FTP 抓图" }}
            </button>
          </div>
        </form>
      </div>

      <div>
        <div class="panel-header">
          <h2>任务详情</h2>
          <span class="tag tag-p2">{{ selectedJob?.jobNo || "未选择" }}</span>
        </div>
        <div v-if="selectedJob" class="detail-grid">
          <div>
            <div class="detail-label">触发方式</div>
            <div class="detail-value">{{ enumLabel("triggerType", selectedJob.triggerType) }}</div>
          </div>
          <div>
            <div class="detail-label">抓图用途</div>
            <div class="detail-value">{{ enumLabel("capturePurpose", selectedJob.capturePurpose) }}</div>
          </div>
          <div>
            <div class="detail-label">计划时间</div>
            <div class="detail-value">{{ formatDateTime(selectedJob.scheduledAt) }}</div>
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
            <div class="detail-label">重试次数</div>
            <div class="detail-value">{{ selectedJob.retryCount ?? 0 }}</div>
          </div>
          <div class="detail-span">
            <div class="detail-label">错误信息</div>
            <div class="detail-value">{{ selectedJob.errorMessage || "-" }}</div>
          </div>
          <div class="detail-span">
            <div class="detail-label">请求参数</div>
            <pre class="code-block">{{ formatJson(selectedJob.requestParamsJson) }}</pre>
          </div>
        </div>
        <div v-else class="empty-state">从列表选择一个抓图任务查看详情。</div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatDateTime, formatJson } from "../lib/format";
import { hasPermission } from "../lib/session";

const loading = ref(false);
const savingCapture = ref(false);
const savingFtp = ref(false);
const errorMessage = ref("");
const message = ref("");
const jobs = ref([]);
const cameras = ref([]);
const selectedJob = ref(null);

const filters = reactive({
  keyword: "",
  cameraId: "",
  status: "",
  triggerType: ""
});

const captureForm = reactive({
  cameraId: "",
  capturePurpose: "preview",
  remark: ""
});

const ftpForm = reactive({
  cameraId: "",
  capturedAt: "",
  ftpPath: "",
  filePath: "",
  imageWidth: "",
  imageHeight: "",
  remark: ""
});

const canEdit = hasPermission("device:edit");

function jobClass(status) {
  if (status === "success") return "tag-success";
  if (status === "failed" || status === "cancelled") return "tag-danger";
  return "tag-warning";
}

function resetFilters() {
  filters.keyword = "";
  filters.cameraId = "";
  filters.status = "";
  filters.triggerType = "";
  loadJobs();
}

function resetCaptureForm() {
  captureForm.cameraId = "";
  captureForm.capturePurpose = "preview";
  captureForm.remark = "";
}

function resetFtpForm() {
  ftpForm.cameraId = "";
  ftpForm.capturedAt = "";
  ftpForm.ftpPath = "";
  ftpForm.filePath = "";
  ftpForm.imageWidth = "";
  ftpForm.imageHeight = "";
  ftpForm.remark = "";
}

function normalizeDateTimeInput(value) {
  return value ? value.replace("T", " ") : null;
}

async function loadCameras() {
  cameras.value = await apiRequest("/api/v1/cameras");
}

async function loadJobs() {
  loading.value = true;
  errorMessage.value = "";
  try {
    jobs.value = await apiRequest(`/api/v1/capture-jobs${buildQuery(filters)}`);
    if (selectedJob.value) {
      selectedJob.value = jobs.value.find((item) => item.id === selectedJob.value.id) || jobs.value[0] || null;
    } else {
      selectedJob.value = jobs.value[0] || null;
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function createCaptureJob() {
  if (!canEdit || !captureForm.cameraId) {
    return;
  }

  savingCapture.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const result = await apiRequest(`/api/v1/cameras/${captureForm.cameraId}/capture`, {
      method: "POST",
      body: JSON.stringify({
        capturePurpose: captureForm.capturePurpose,
        remark: captureForm.remark
      })
    });
    message.value = `抓图任务已创建：${result.jobNo}`;
    await loadJobs();
    resetCaptureForm();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    savingCapture.value = false;
  }
}

async function submitFtpSnapshot() {
  if (!canEdit || !ftpForm.cameraId || !ftpForm.ftpPath) {
    return;
  }

  savingFtp.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const result = await apiRequest(`/api/v1/cameras/${ftpForm.cameraId}/ftp-receive`, {
      method: "POST",
      body: JSON.stringify({
        capturedAt: normalizeDateTimeInput(ftpForm.capturedAt),
        ftpPath: ftpForm.ftpPath,
        filePath: ftpForm.filePath,
        imageWidth: ftpForm.imageWidth || null,
        imageHeight: ftpForm.imageHeight || null,
        remark: ftpForm.remark
      })
    });
    message.value = `FTP 抓图已入库：${result.snapshotNo}`;
    await loadJobs();
    resetFtpForm();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    savingFtp.value = false;
  }
}

onMounted(async () => {
  await loadCameras();
  await loadJobs();
});
</script>
