<template>
  <div class="stack">
    <section class="panel system-health-hero">
      <div class="system-health-hero-copy">
        <div class="mobile-field-kicker">平台运维</div>
        <h2>系统健康</h2>
        <p>集中查看 API、MySQL、磁盘、备份和关键业务链路状态，先保证平台自身稳定可交付。</p>
      </div>
      <div class="system-health-hero-actions">
        <span class="tag" :class="healthStatusClass(summary?.status)">{{ healthStatusLabel(summary?.status) }}</span>
        <button class="primary-button" type="button" @click="loadSummary" :disabled="loading">
          {{ loading ? "刷新中..." : "刷新状态" }}
        </button>
      </div>
    </section>

    <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

    <section class="metric-strip actuator-summary-strip">
      <article class="roadmap-card timeline-summary-card">
        <div class="stat-value">{{ healthStatusLabel(summary?.status) }}</div>
        <div class="stat-desc">总体状态</div>
      </article>
      <article class="roadmap-card timeline-summary-card">
        <div class="stat-value">{{ formatDuration(summary?.api?.uptimeSeconds) }}</div>
        <div class="stat-desc">API 运行时长</div>
      </article>
      <article class="roadmap-card timeline-summary-card">
        <div class="stat-value">{{ summary?.database?.latencyMs ?? "-" }}ms</div>
        <div class="stat-desc">MySQL 响应</div>
      </article>
      <article class="roadmap-card timeline-summary-card">
        <div class="stat-value">{{ summary?.storage?.usedPercent ?? "-" }}%</div>
        <div class="stat-desc">磁盘已用</div>
      </article>
      <article class="roadmap-card timeline-summary-card">
        <div class="stat-value">{{ summary?.backup?.latestAgeHours ?? "-" }}h</div>
        <div class="stat-desc">最近备份距今</div>
      </article>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>健康检查项</h2>
          <p class="panel-subtitle">这些是上线后最需要持续关注的基础项。</p>
        </div>
        <span class="tag tag-p2">{{ formatDateTime(summary?.generatedAt) }}</span>
      </div>
      <div class="system-health-check-grid">
        <article
          v-for="item in summary?.checks || []"
          :key="item.code"
          class="detail-card system-health-check-card"
          :class="`system-health-check-${item.status}`"
        >
          <span class="tag" :class="healthStatusClass(item.status)">{{ healthStatusLabel(item.status) }}</span>
          <div>
            <strong>{{ item.label }}</strong>
            <p>{{ item.detail }}</p>
          </div>
        </article>
      </div>
    </section>

    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>业务运行概览</h2>
          <span class="tag tag-p2">tenant scoped</span>
        </div>
        <div class="system-health-business-grid">
          <article v-for="item in businessCards" :key="item.label" class="detail-card system-health-business-card">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </article>
        </div>
      </div>

      <div>
        <div class="panel-header">
          <h2>备份状态</h2>
          <span class="tag" :class="healthStatusClass(summary?.backup?.status)">
            {{ healthStatusLabel(summary?.backup?.status) }}
          </span>
        </div>
        <div class="detail-grid">
          <div class="detail-span">
            <div class="detail-label">备份目录</div>
            <div class="detail-value">{{ summary?.backup?.directory || "-" }}</div>
          </div>
          <div>
            <div class="detail-label">保留天数</div>
            <div class="detail-value">{{ summary?.backup?.retentionDays ?? "-" }} 天</div>
          </div>
          <div>
            <div class="detail-label">备份数量</div>
            <div class="detail-value">{{ summary?.backup?.fileCount ?? "-" }}</div>
          </div>
          <div class="detail-span">
            <div class="detail-label">最近备份</div>
            <div class="detail-value">{{ summary?.backup?.latestFile || summary?.backup?.errorMessage || "-" }}</div>
          </div>
        </div>
        <div class="system-health-backup-list">
          <article v-for="file in summary?.backup?.files || []" :key="file.fileName" class="detail-card system-health-backup-item">
            <strong>{{ file.fileName }}</strong>
            <span>{{ formatBytes(file.sizeBytes) }} · {{ formatDateTime(file.modifiedAt) }}</span>
          </article>
          <div v-if="!summary?.backup?.files?.length" class="empty-state">暂无备份文件记录。</div>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2>运行时信息</h2>
        <span class="tag tag-p2">no secrets</span>
      </div>
      <div class="detail-grid">
        <div>
          <div class="detail-label">主机</div>
          <div class="detail-value">{{ summary?.api?.hostname || "-" }}</div>
        </div>
        <div>
          <div class="detail-label">Node</div>
          <div class="detail-value">{{ summary?.api?.nodeVersion || "-" }}</div>
        </div>
        <div>
          <div class="detail-label">系统</div>
          <div class="detail-value">{{ summary?.api?.platform || "-" }}</div>
        </div>
        <div>
          <div class="detail-label">CPU / Load</div>
          <div class="detail-value">{{ summary?.api?.cpuCount || "-" }} 核 / {{ summary?.api?.loadAverage?.join(", ") || "-" }}</div>
        </div>
        <div>
          <div class="detail-label">内存 RSS</div>
          <div class="detail-value">{{ formatBytes(summary?.api?.memory?.rssBytes) }}</div>
        </div>
        <div>
          <div class="detail-label">堆内存</div>
          <div class="detail-value">{{ summary?.api?.memory?.heapUsedPercent ?? "-" }}%</div>
        </div>
        <div>
          <div class="detail-label">数据库</div>
          <div class="detail-value">{{ summary?.database?.databaseName || "-" }}</div>
        </div>
        <div>
          <div class="detail-label">MySQL 版本</div>
          <div class="detail-value">{{ summary?.database?.version || "-" }}</div>
        </div>
        <div class="detail-span">
          <div class="detail-label">磁盘路径</div>
          <div class="detail-value">{{ summary?.storage?.mountPath || "-" }}</div>
        </div>
        <div>
          <div class="detail-label">磁盘总量</div>
          <div class="detail-value">{{ formatBytes(summary?.storage?.totalBytes) }}</div>
        </div>
        <div>
          <div class="detail-label">磁盘剩余</div>
          <div class="detail-value">{{ formatBytes(summary?.storage?.freeBytes) }}</div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { apiRequest } from "../lib/api";
import { formatDateTime } from "../lib/format";

type HealthStatus = "healthy" | "warning" | "error";

interface HealthCheckItem {
  code: string;
  label: string;
  status: HealthStatus;
  detail: string;
}

interface BackupFile {
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
}

interface SystemHealthSummary {
  status: HealthStatus;
  generatedAt: string;
  checks: HealthCheckItem[];
  api: {
    hostname: string;
    nodeVersion: string;
    platform: string;
    cpuCount: number;
    loadAverage: number[];
    uptimeSeconds: number;
    memory: {
      rssBytes: number;
      heapUsedPercent: number;
    };
  };
  database: {
    status: HealthStatus;
    latencyMs: number;
    databaseName: string;
    version: string;
  };
  storage: {
    status: HealthStatus;
    mountPath: string;
    totalBytes: number;
    freeBytes: number;
    usedPercent: number;
  };
  backup: {
    status: HealthStatus;
    directory: string;
    retentionDays: number;
    fileCount: number;
    latestFile: string;
    latestAgeHours: number | null;
    errorMessage: string | null;
    files: BackupFile[];
  };
  business: Record<string, number>;
}

const loading = ref(false);
const errorMessage = ref("");
const summary = ref<SystemHealthSummary | null>(null);

const businessCards = computed(() => {
  const business = summary.value?.business || {};
  return [
    { label: "租户", value: business.tenantCount ?? "-" },
    { label: "用户", value: business.userCount ?? "-" },
    { label: "区域", value: business.areaCount ?? "-" },
    { label: "网关", value: business.gatewayCount ?? "-" },
    { label: "传感器", value: business.sensorCount ?? "-" },
    { label: "执行器", value: business.actuatorCount ?? "-" },
    { label: "活跃告警", value: business.activeAlertCount ?? "-" },
    { label: "今日控制", value: business.todayCommandCount ?? "-" },
    { label: "AI 待处理", value: business.aiPendingTaskCount ?? "-" }
  ];
});

function healthStatusLabel(status?: string | null) {
  if (status === "healthy") return "正常";
  if (status === "error") return "异常";
  if (status === "warning") return "预警";
  return "未检查";
}

function healthStatusClass(status?: string | null) {
  if (status === "healthy") return "tag-success";
  if (status === "error") return "tag-danger";
  if (status === "warning") return "tag-warning";
  return "tag-p2";
}

function formatDuration(seconds?: number | null) {
  const total = Number(seconds || 0);
  if (!total) return "-";
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}天${hours}小时`;
  if (hours > 0) return `${hours}小时${minutes}分钟`;
  return `${minutes}分钟`;
}

function formatBytes(value?: number | null) {
  const bytes = Number(value || 0);
  if (!bytes) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

async function loadSummary() {
  loading.value = true;
  errorMessage.value = "";
  try {
    summary.value = await apiRequest<SystemHealthSummary>("/api/v1/system/health-summary");
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "系统健康状态加载失败";
  } finally {
    loading.value = false;
  }
}

onMounted(loadSummary);
</script>
