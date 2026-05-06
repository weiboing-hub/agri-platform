<template>
  <div class="stack">
    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>设备接入凭证</h2>
          <span class="tag tag-p1">credential</span>
        </div>

        <div v-if="message" class="success-text">{{ message }}</div>
        <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

        <div class="detail-card">
          <div class="detail-label">当前接入令牌</div>
          <div class="detail-value credential-mask">{{ credential.deviceIngestTokenMasked || "-" }}</div>
        </div>

        <div class="detail-grid">
          <div class="detail-card">
            <div class="detail-label">生效来源</div>
            <div class="detail-value">{{ credential.tokenSource === "database" ? "平台已托管" : "环境变量兜底" }}</div>
          </div>
          <div class="detail-card">
            <div class="detail-label">最近更新</div>
            <div class="detail-value">{{ formatDateTime(credential.updatedAt) }}</div>
          </div>
          <div class="detail-card detail-span">
            <div class="detail-label">最后操作人</div>
            <div class="detail-value">{{ credential.updatedByName || "环境配置 / 未记录" }}</div>
          </div>
        </div>

        <div class="inline-actions">
          <button class="ghost-button" @click="loadCredential">刷新</button>
          <button class="ghost-button" @click="revealCredential" :disabled="loading || revealing">
            {{ revealing ? "读取中..." : "查看当前 Token" }}
          </button>
          <button class="primary-button" @click="rotateCredential" :disabled="loading || rotating">
            {{ rotating ? "生成中..." : "重新生成 Token" }}
          </button>
          <button class="ghost-button" @click="copyToken" :disabled="!revealedToken">
            复制当前 Token
          </button>
          <button class="ghost-button" @click="copyFirmwareSnippet">
            复制固件片段
          </button>
        </div>

        <div class="config-disclosure" v-if="revealedToken">
          <div class="detail-label">当前明文 Token</div>
          <pre class="code-block">{{ revealedToken }}</pre>
        </div>
      </div>

      <div class="stack">
        <div class="detail-card">
          <div class="detail-label">使用方式</div>
          <div class="detail-value">ESP32 / 网关需要在 `Authorization: Bearer &lt;token&gt;` 中携带该令牌。</div>
        </div>
        <div class="detail-card">
          <div class="detail-label">对应固件参数</div>
          <pre class="code-block">{{ firmwareSnippet }}</pre>
        </div>
        <div class="detail-card">
          <div class="detail-label">轮换说明</div>
          <div class="detail-value">重新生成后新令牌立即生效，旧设备如果没有同步更新，会立刻收到 `401`。</div>
        </div>
        <div class="detail-card">
          <div class="detail-label">安全建议</div>
          <div class="detail-value">建议只在需要下发固件或排障时查看明文，平时保持掩码展示即可。</div>
        </div>
      </div>
    </section>

    <section class="panel device-ingest-panel">
      <div class="panel-header">
        <div>
          <h2>设备接入联调</h2>
          <p class="panel-subtitle">用于 ESP32 / 网关现场联调：确认地址、上报格式、最近上报和配置同步状态。</p>
        </div>
        <span class="tag" :class="statusTagClass(diagnostics.status)">
          {{ statusLabel(diagnostics.status) }}
        </span>
      </div>

      <div class="inline-actions device-ingest-actions">
        <button class="ghost-button" @click="loadDiagnostics" :disabled="diagnosticsLoading">
          {{ diagnosticsLoading ? "刷新中..." : "刷新联调状态" }}
        </button>
        <button class="primary-button" @click="sendTestIngest" :disabled="testingIngest">
          {{ testingIngest ? "上报中..." : "发送测试上报" }}
        </button>
        <RouterLink class="ghost-button device-ingest-link" to="/monitor/realtime">查看实时监控</RouterLink>
        <button class="ghost-button" @click="copySamplePayload">复制上报 JSON</button>
        <button class="ghost-button" @click="copyCurlSnippet">复制 curl 命令</button>
      </div>

      <div v-if="diagnosticsError" class="error-text inline-error">{{ diagnosticsError }}</div>
      <div v-if="testResult" class="success-text">
        测试上报成功：{{ testResult.deviceId }} / 写入 {{ testResult.acceptedMetricCount }} 个指标
      </div>

      <div class="device-ingest-metrics">
        <div class="detail-card">
          <div class="detail-label">平台接入地址</div>
          <div class="detail-value">{{ effectiveApiHost }}</div>
        </div>
        <div class="detail-card">
          <div class="detail-label">在线设备</div>
          <div class="detail-value">{{ diagnostics.stats.onlineGateways }} / {{ diagnostics.stats.totalGateways }}</div>
        </div>
        <div class="detail-card">
          <div class="detail-label">24小时上报</div>
          <div class="detail-value">{{ diagnostics.stats.readingCount24h }} 条</div>
        </div>
        <div class="detail-card">
          <div class="detail-label">最近上报</div>
          <div class="detail-value">{{ formatDateTime(diagnostics.stats.lastReadingAt) }}</div>
        </div>
      </div>

      <div class="device-ingest-risk-card">
        <div class="device-ingest-risk-head">
          <div>
            <h3>接入风险检查</h3>
            <p>自动检查离线、心跳过旧、24 小时无上报、弱信号和配置未同步。</p>
          </div>
          <span class="tag" :class="diagnostics.healthIssues.length ? 'tag-warning' : 'tag-success'">
            {{ diagnostics.healthIssues.length ? `${diagnostics.healthIssues.length} 项` : "正常" }}
          </span>
        </div>

        <div v-if="diagnostics.healthIssues.length" class="device-ingest-risk-list">
          <div
            v-for="item in diagnostics.healthIssues"
            :key="item.code"
            class="device-ingest-risk-item"
            :class="`device-ingest-risk-${item.severity}`"
          >
            <span class="tag" :class="issueTagClass(item.severity)">{{ issueSeverityLabel(item.severity) }}</span>
            <div>
              <strong>{{ item.title }}</strong>
              <p>{{ item.detail }}</p>
              <small>{{ item.action }}</small>
            </div>
          </div>
        </div>
        <div v-else class="device-ingest-risk-ok">
          当前未发现明显接入风险，设备上报链路处于可用状态。
        </div>

        <div v-if="diagnostics.riskGateways.length" class="device-ingest-risk-gateways">
          <div class="device-ingest-risk-toolbar">
            <div>
              <div class="detail-label">风险设备清单</div>
              <p>{{ selectedRiskDescription }}</p>
            </div>
            <span class="tag tag-warning">{{ selectedRiskSummary }}</span>
          </div>
          <div class="device-ingest-risk-filter-bar">
            <button
              class="device-ingest-risk-filter"
              :class="{ 'device-ingest-risk-filter-active': selectedRiskCode === '' }"
              type="button"
              @click="setRiskFilter('')"
            >
              <span>全部</span>
              <strong>{{ diagnostics.riskGateways.length }}</strong>
            </button>
            <button
              v-for="option in riskCodeOptions"
              :key="option.code"
              class="device-ingest-risk-filter"
              :class="{ 'device-ingest-risk-filter-active': selectedRiskCode === option.code }"
              type="button"
              @click="setRiskFilter(option.code)"
            >
              <span>{{ option.label }}</span>
              <strong>{{ option.count }}</strong>
            </button>
          </div>
          <div class="device-ingest-risk-gateway-list">
            <div v-for="item in filteredRiskGateways" :key="item.id" class="device-ingest-risk-gateway-row">
              <div>
                <strong>{{ item.gatewayName || item.gatewayCode }}</strong>
                <span>{{ item.gatewayCode }} / {{ item.areaName || "未绑定区域" }}</span>
              </div>
              <div>
                <strong>{{ item.onlineStatus || "-" }}</strong>
                <span>心跳 {{ formatDuration(item.heartbeatAgeSeconds) }}</span>
              </div>
              <div>
                <strong>{{ item.readingCount24h }} 条</strong>
                <span>最近读数 {{ formatDateTime(item.lastReadingAt) }}</span>
              </div>
              <div class="device-ingest-risk-tags">
                <span v-for="code in item.riskCodes" :key="code" class="tag" :class="gatewayRiskTagClass(code)">
                  {{ gatewayRiskLabel(code) }}
                </span>
              </div>
              <div class="device-ingest-risk-actions">
                <RouterLink class="device-ingest-risk-action-link" :to="gatewayManagementLink(item)">
                  网关管理
                </RouterLink>
                <RouterLink class="device-ingest-risk-action-link" :to="gatewayRealtimeLink(item)">
                  实时监控
                </RouterLink>
                <button class="ghost-button" type="button" @click="copyGatewayTroubleshooting(item)">
                  复制排查
                </button>
                <button
                  class="ghost-button"
                  type="button"
                  :disabled="recordingTroubleshootingCode === item.gatewayCode"
                  @click="recordGatewayTroubleshooting(item)"
                >
                  {{ recordingTroubleshootingCode === item.gatewayCode ? "记录中" : "记录排查" }}
                </button>
                <button class="ghost-button" type="button" @click="useGatewayAsTestDevice(item)">
                  设为测试
                </button>
              </div>
            </div>
          </div>
          <div v-if="filteredRiskGateways.length === 0" class="device-ingest-risk-empty">
            当前筛选下没有风险设备。
          </div>
        </div>

        <div class="device-ingest-troubleshoot-log-card">
          <div class="device-ingest-troubleshoot-log-head">
            <div>
              <h3>最近排查记录</h3>
              <p>记录谁在什么时候处理过哪台设备，方便后续复盘和交接。</p>
            </div>
            <button class="ghost-button" type="button" @click="loadTroubleshootingLogs" :disabled="troubleshootingLoading">
              {{ troubleshootingLoading ? "刷新中" : "刷新记录" }}
            </button>
          </div>
          <div v-if="troubleshootingLogs.length" class="device-ingest-troubleshoot-log-list">
            <article v-for="item in troubleshootingLogs" :key="item.id" class="device-ingest-troubleshoot-log-item">
              <div>
                <strong>{{ item.gatewayName || item.gatewayCode || item.targetId }}</strong>
                <span>{{ item.gatewayCode || item.targetId }} / {{ item.areaName || "未绑定区域" }}</span>
              </div>
              <p>{{ item.summary || item.note || item.resultMessage || "已记录一次排查" }}</p>
              <div class="device-ingest-troubleshoot-log-meta">
                <span>{{ item.operatorName || "系统用户" }}</span>
                <span>{{ formatDateTime(item.createdAt) }}</span>
                <span v-if="item.riskCodes?.length">{{ item.riskCodes.map(gatewayRiskLabel).join("、") }}</span>
              </div>
            </article>
          </div>
          <div v-else class="device-ingest-risk-empty">
            暂无排查记录。点击风险设备行里的“记录排查”后会出现在这里。
          </div>
        </div>
      </div>

      <form class="device-ingest-test-card" @submit.prevent="sendTestIngest">
        <div class="device-ingest-test-head">
          <div>
            <h3>后台模拟上报</h3>
            <p>用于没有 ESP32 在身边时验证 token、HTTP 接入、自动建档和实时读数链路。</p>
          </div>
          <span class="tag tag-p1">test</span>
        </div>
        <div class="device-ingest-test-grid">
          <label class="form-item">
            <span>测试设备编号</span>
            <input v-model="testForm.deviceId" type="text" placeholder="SIM-ESP32-001" />
          </label>
          <label class="form-item">
            <span>设备名称</span>
            <input v-model="testForm.deviceName" type="text" placeholder="后台联调 ESP32" />
          </label>
          <label class="form-item">
            <span>温度 ℃</span>
            <input v-model="testForm.temperature" type="number" step="0.1" />
          </label>
          <label class="form-item">
            <span>湿度 %</span>
            <input v-model="testForm.humidity" type="number" step="0.1" />
          </label>
          <label class="form-item">
            <span>WiFi RSSI</span>
            <input v-model="testForm.rssi" type="number" step="1" />
          </label>
          <label class="form-item">
            <span>采样状态</span>
            <select v-model="testForm.samplingStatus">
              <option value="running">running</option>
              <option value="paused">paused</option>
            </select>
          </label>
        </div>
      </form>

      <div class="device-ingest-grid">
        <div class="detail-card">
          <div class="detail-label">HTTP 上报地址</div>
          <pre class="code-block">{{ ingestUrl }}</pre>
        </div>
        <div class="detail-card">
          <div class="detail-label">固件参数</div>
          <pre class="code-block">{{ firmwareSnippet }}</pre>
        </div>
        <div class="detail-card">
          <div class="detail-label">上报 JSON 示例</div>
          <pre class="code-block">{{ samplePayloadText }}</pre>
        </div>
        <div class="detail-card">
          <div class="detail-label">curl 联调命令</div>
          <pre class="code-block">{{ curlSnippet }}</pre>
        </div>
      </div>

      <div class="device-ingest-endpoints">
        <div v-for="item in endpointRows" :key="item.label" class="device-ingest-endpoint">
          <span class="tag tag-p2">{{ item.method }}</span>
          <strong>{{ item.label }}</strong>
          <code>{{ item.url }}</code>
        </div>
      </div>

      <div class="device-ingest-recent">
        <div class="detail-card">
          <div class="detail-label">最近活跃设备</div>
          <div v-if="diagnostics.latestGateway" class="device-ingest-record">
            <strong>{{ diagnostics.latestGateway.gatewayName || diagnostics.latestGateway.gatewayCode }}</strong>
            <span>{{ diagnostics.latestGateway.gatewayCode }} / {{ diagnostics.latestGateway.areaName || "未绑定区域" }}</span>
            <span>心跳：{{ formatDateTime(diagnostics.latestGateway.lastHeartbeatAt) }}</span>
            <span>WiFi：{{ diagnostics.latestGateway.wifiRssi ?? "-" }} dBm</span>
          </div>
          <div v-else class="muted-text">暂无设备心跳。</div>
        </div>

        <div class="detail-card">
          <div class="detail-label">最近传感器读数</div>
          <div v-if="diagnostics.latestReading" class="device-ingest-record">
            <strong>
              {{ diagnostics.latestReading.metricName }}
              {{ formatNumber(diagnostics.latestReading.metricValue, 2) }}{{ diagnostics.latestReading.unitName || "" }}
            </strong>
            <span>{{ diagnostics.latestReading.sensorName || diagnostics.latestReading.sensorCode }}</span>
            <span>接收：{{ formatDateTime(diagnostics.latestReading.receivedAt) }}</span>
            <span>延迟：{{ formatDelayMs(diagnostics.latestReading.delayMs) }} / {{ diagnostics.latestReading.timeQuality || "-" }}</span>
          </div>
          <div v-else class="muted-text">暂无传感器读数。</div>
        </div>

        <div class="detail-card">
          <div class="detail-label">最近配置同步</div>
          <div v-if="diagnostics.latestConfigLog" class="device-ingest-record">
            <strong>{{ diagnostics.latestConfigLog.gatewayName || diagnostics.latestConfigLog.gatewayCode || "网关配置" }}</strong>
            <span>版本：{{ diagnostics.latestConfigLog.configVersion }} / {{ diagnostics.latestConfigLog.syncStatus }}</span>
            <span>{{ diagnostics.latestConfigLog.messageText || diagnostics.latestConfigLog.actionType }}</span>
            <span>{{ formatDateTime(diagnostics.latestConfigLog.createdAt) }}</span>
          </div>
          <div v-else class="muted-text">暂无配置同步记录。</div>
        </div>
      </div>

      <div class="device-ingest-history-card">
        <div class="device-ingest-history-head">
          <div>
            <h3>最近设备与上报明细</h3>
            <p>按接收时间倒序展示最近设备和读数，用于确认设备是否持续上报、指标值是否符合预期。</p>
          </div>
          <span class="tag tag-p2">{{ diagnostics.recentReadings.length }} 条</span>
        </div>

        <div v-if="diagnostics.recentGateways.length" class="device-ingest-gateway-strip">
          <button
            v-for="item in diagnostics.recentGateways"
            :key="item.id"
            class="device-ingest-gateway-pill"
            type="button"
            @click="useGatewayAsTestDevice(item)"
          >
            <strong>{{ item.gatewayCode }}</strong>
            <span>{{ formatDateTime(item.lastHeartbeatAt) }}</span>
          </button>
        </div>

        <div v-if="diagnostics.recentReadings.length" class="device-ingest-reading-list">
          <div v-for="item in diagnostics.recentReadings" :key="item.id" class="device-ingest-reading-row">
            <div>
              <strong>{{ item.gatewayCode || item.sensorCode }}</strong>
              <span>{{ item.gatewayName || item.areaName || "未绑定区域" }}</span>
            </div>
            <div>
              <strong>{{ item.metricName || item.metricCode }}</strong>
              <span>{{ item.metricCode }}</span>
            </div>
            <div>
              <strong>{{ formatNumber(item.metricValue, 2) }}{{ item.unitName || "" }}</strong>
              <span>{{ item.dataSource || "-" }} / {{ item.timeQuality || "-" }}</span>
            </div>
            <div>
              <strong>{{ formatDateTime(item.receivedAt) }}</strong>
              <span>延迟 {{ formatDelayMs(item.delayMs) }}</span>
            </div>
            <button class="ghost-button" type="button" @click="useReadingAsTestDevice(item)">
              设为测试设备
            </button>
          </div>
        </div>
        <div v-else class="muted-text">暂无最近上报明细。</div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { apiRequest } from "../lib/api";
import { formatDateTime, formatNumber } from "../lib/format";

const loading = ref(false);
const revealing = ref(false);
const rotating = ref(false);
const diagnosticsLoading = ref(false);
const testingIngest = ref(false);
const troubleshootingLoading = ref(false);
const message = ref("");
const errorMessage = ref("");
const diagnosticsError = ref("");
const revealedToken = ref("");
const testResult = ref(null);
const selectedRiskCode = ref("");
const troubleshootingLogs = ref([]);
const recordingTroubleshootingCode = ref("");
const credential = reactive({
  deviceIngestTokenMasked: "",
  tokenSource: "environment",
  updatedAt: null,
  updatedByName: ""
});
const diagnostics = reactive({
  apiHost: "",
  tokenMasked: "",
  tokenSource: "environment",
  status: "empty",
  endpoints: {
    ingest: "/api/v1/iot/ingest",
    legacyIngest: "/api/soil/ingest",
    controlPoll: "/api/v1/iot/device-control?deviceId=<deviceId>",
    configPoll: "/api/v1/iot/device-config?deviceId=<deviceId>"
  },
  samplePayload: null,
  stats: {
    totalGateways: 0,
    onlineGateways: 0,
    offlineGateways: 0,
    lastHeartbeatAt: null,
    readingCount24h: 0,
    reportingGateways24h: 0,
    lastReadingAt: null,
    avgDelayMs: 0
  },
  healthIssues: [],
  latestGateway: null,
  latestReading: null,
  latestConfigLog: null,
  recentGateways: [],
  recentReadings: [],
  recentConfigLogs: [],
  riskGateways: []
});
const testForm = reactive({
  deviceId: "SIM-ESP32-001",
  deviceName: "后台联调 ESP32",
  temperature: "22.5",
  humidity: "61.2",
  rssi: "-58",
  samplingStatus: "running"
});

const fallbackPayload = {
  deviceId: "soil-001",
  deviceName: "ESP32 土壤监测网关",
  rssi: -58,
  collectedAt: "2026-04-11T08:30:00+08:00",
  samplingStatus: "running",
  metrics: [
    { metricCode: "temperature", metricName: "温度", value: 22.5, unitName: "℃" },
    { metricCode: "humidity", metricName: "湿度", value: 61.2, unitName: "%" }
  ]
};

const effectiveApiHost = computed(() => diagnostics.apiHost || window.location.origin);
const ingestUrl = computed(() => `${effectiveApiHost.value}${diagnostics.endpoints.ingest}`);
const samplePayloadText = computed(() => JSON.stringify(diagnostics.samplePayload || fallbackPayload, null, 2));
const curlSnippet = computed(() => {
  const token = revealedToken.value || "<点击查看当前 Token 后替换>";
  return `curl -X POST "${ingestUrl.value}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${token}" \\
  -d '${JSON.stringify(diagnostics.samplePayload || fallbackPayload)}'`;
});
const endpointRows = computed(() => [
  { label: "数据上报", method: "POST", url: ingestUrl.value },
  { label: "兼容上报", method: "POST", url: `${effectiveApiHost.value}${diagnostics.endpoints.legacyIngest}` },
  { label: "控制轮询", method: "GET", url: `${effectiveApiHost.value}${diagnostics.endpoints.controlPoll}` },
  { label: "配置轮询", method: "GET", url: `${effectiveApiHost.value}${diagnostics.endpoints.configPoll}` }
]);
const riskCodeOptions = computed(() => {
  const counts = new Map();
  for (const item of diagnostics.riskGateways) {
    const riskCodes = Array.isArray(item.riskCodes) ? item.riskCodes : [];
    for (const code of riskCodes) {
      counts.set(code, (counts.get(code) || 0) + 1);
    }
  }

  const orderedCodes = ["offline", "no_reading_24h", "stale_heartbeat", "weak_signal", "pending_config"];
  const sortedCodes = [
    ...orderedCodes.filter((code) => counts.has(code)),
    ...Array.from(counts.keys()).filter((code) => !orderedCodes.includes(code)).sort()
  ];

  return sortedCodes.map((code) => ({
    code,
    label: gatewayRiskLabel(code),
    count: counts.get(code) || 0
  }));
});
const filteredRiskGateways = computed(() => {
  if (!selectedRiskCode.value) {
    return diagnostics.riskGateways;
  }
  return diagnostics.riskGateways.filter((item) => Array.isArray(item.riskCodes) && item.riskCodes.includes(selectedRiskCode.value));
});
const selectedRiskSummary = computed(() => {
  if (!selectedRiskCode.value) {
    return `全部 ${diagnostics.riskGateways.length} 台`;
  }
  const option = riskCodeOptions.value.find((item) => item.code === selectedRiskCode.value);
  return `${option?.label || selectedRiskCode.value} ${option?.count || 0} 台`;
});
const selectedRiskDescription = computed(() => gatewayRiskDescription(selectedRiskCode.value));

const firmwareSnippet = computed(() => {
  const token = revealedToken.value || "<请先点击“查看当前 Token”>";
  return `const char* API_HOST = "${effectiveApiHost.value}";
const char* API_TOKEN = "${token}";`;
});

async function loadCredential() {
  loading.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const result = await apiRequest("/api/v1/system/device-credentials");
    credential.deviceIngestTokenMasked = result.deviceIngestTokenMasked || "";
    credential.tokenSource = result.tokenSource || "environment";
    credential.updatedAt = result.updatedAt || null;
    credential.updatedByName = result.updatedByName || "";
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function loadDiagnostics() {
  diagnosticsLoading.value = true;
  diagnosticsError.value = "";
  try {
    const result = await apiRequest("/api/v1/system/device-ingest-diagnostics");
    diagnostics.apiHost = result.apiHost || diagnostics.apiHost;
    diagnostics.tokenMasked = result.tokenMasked || "";
    diagnostics.tokenSource = result.tokenSource || "environment";
    diagnostics.status = result.status || "empty";
    diagnostics.endpoints = {
      ...diagnostics.endpoints,
      ...(result.endpoints || {})
    };
    diagnostics.samplePayload = result.samplePayload || null;
    diagnostics.stats = {
      ...diagnostics.stats,
      ...(result.stats || {})
    };
    diagnostics.healthIssues = Array.isArray(result.healthIssues) ? result.healthIssues : [];
    diagnostics.latestGateway = result.latestGateway || null;
    diagnostics.latestReading = result.latestReading || null;
    diagnostics.latestConfigLog = result.latestConfigLog || null;
    diagnostics.recentGateways = Array.isArray(result.recentGateways) ? result.recentGateways : [];
    diagnostics.recentReadings = Array.isArray(result.recentReadings) ? result.recentReadings : [];
    diagnostics.recentConfigLogs = Array.isArray(result.recentConfigLogs) ? result.recentConfigLogs : [];
    diagnostics.riskGateways = Array.isArray(result.riskGateways) ? result.riskGateways : [];
    if (selectedRiskCode.value && !diagnostics.riskGateways.some((item) => Array.isArray(item.riskCodes) && item.riskCodes.includes(selectedRiskCode.value))) {
      selectedRiskCode.value = "";
    }
    await loadTroubleshootingLogs();
  } catch (error) {
    diagnosticsError.value = error.message;
  } finally {
    diagnosticsLoading.value = false;
  }
}

async function loadTroubleshootingLogs() {
  troubleshootingLoading.value = true;
  try {
    troubleshootingLogs.value = await apiRequest("/api/v1/system/device-ingest-troubleshooting-logs?limit=12");
  } catch (error) {
    diagnosticsError.value = error.message;
  } finally {
    troubleshootingLoading.value = false;
  }
}

async function sendTestIngest() {
  testingIngest.value = true;
  diagnosticsError.value = "";
  errorMessage.value = "";
  message.value = "";
  testResult.value = null;
  try {
    const result = await apiRequest("/api/v1/system/device-ingest-test", {
      method: "POST",
      body: JSON.stringify({
        deviceId: testForm.deviceId,
        deviceName: testForm.deviceName,
        temperature: testForm.temperature,
        humidity: testForm.humidity,
        rssi: testForm.rssi,
        samplingStatus: testForm.samplingStatus
      })
    });
    testResult.value = result.ingestResult || null;
    message.value = "模拟设备上报已写入，最近读数已刷新";
    await loadDiagnostics();
  } catch (error) {
    diagnosticsError.value = error.message;
  } finally {
    testingIngest.value = false;
  }
}

function useReadingAsTestDevice(item) {
  if (!item?.gatewayCode) {
    return;
  }
  useGatewayAsTestDevice(item);
}

function useGatewayAsTestDevice(item) {
  if (!item?.gatewayCode) {
    return;
  }
  testForm.deviceId = item.gatewayCode;
  testForm.deviceName = item.gatewayName || item.gatewayCode;
}

async function recordGatewayTroubleshooting(item) {
  if (!item?.gatewayCode) {
    return;
  }
  recordingTroubleshootingCode.value = item.gatewayCode;
  diagnosticsError.value = "";
  message.value = "";
  try {
    await apiRequest("/api/v1/system/device-ingest-troubleshooting-logs", {
      method: "POST",
      body: JSON.stringify({
        gatewayId: item.id || null,
        gatewayCode: item.gatewayCode,
        gatewayName: item.gatewayName || item.gatewayCode,
        areaName: item.areaName || "",
        riskCodes: Array.isArray(item.riskCodes) ? item.riskCodes : [],
        note: buildTroubleshootingNote(item),
        summary: buildTroubleshootingSummary(item)
      })
    });
    message.value = `已记录 ${item.gatewayCode} 的接入排查`;
    await loadTroubleshootingLogs();
  } catch (error) {
    diagnosticsError.value = error.message;
  } finally {
    recordingTroubleshootingCode.value = "";
  }
}

function buildTroubleshootingSummary(item) {
  const riskLabels = Array.isArray(item?.riskCodes) && item.riskCodes.length
    ? item.riskCodes.map((code) => gatewayRiskLabel(code)).join("、")
    : "接入风险";
  return `已排查 ${item?.gatewayName || item?.gatewayCode || "设备"}：${riskLabels}`;
}

function buildTroubleshootingNote(item) {
  return buildGatewayTroubleshootingActions(item).join("；");
}

function setRiskFilter(code) {
  selectedRiskCode.value = code || "";
}

function gatewayManagementLink(item) {
  return {
    path: "/devices/gateways",
    query: {
      source: "ingestDiagnostics",
      keyword: item?.gatewayCode || "",
      gatewayCode: item?.gatewayCode || ""
    }
  };
}

function gatewayRealtimeLink(item) {
  return {
    path: "/monitor/realtime",
    query: item?.id ? { source: "ingestDiagnostics", gatewayId: String(item.id) } : {}
  };
}

function buildGatewayTroubleshootingText(item) {
  const risks = Array.isArray(item?.riskCodes) && item.riskCodes.length
    ? item.riskCodes.map((code) => gatewayRiskLabel(code)).join("、")
    : "无";
  const actions = buildGatewayTroubleshootingActions(item);
  return [
    "设备接入风险排查",
    `设备：${item?.gatewayName || item?.gatewayCode || "-"}`,
    `编号：${item?.gatewayCode || "-"}`,
    `区域：${item?.areaName || "未绑定区域"}`,
    `在线状态：${item?.onlineStatus || "-"}`,
    `最近心跳：${formatDateTime(item?.lastHeartbeatAt)}（${formatDuration(item?.heartbeatAgeSeconds)}）`,
    `24小时读数：${item?.readingCount24h ?? 0} 条`,
    `最近读数：${formatDateTime(item?.lastReadingAt)}`,
    `WiFi RSSI：${item?.wifiRssi ?? "-"} dBm`,
    `配置状态：${item?.deviceConfigSyncStatus || "-"}`,
    `风险：${risks}`,
    "建议处理：",
    ...actions.map((action, index) => `${index + 1}. ${action}`)
  ].join("\n");
}

function buildGatewayTroubleshootingActions(item) {
  const riskCodes = Array.isArray(item?.riskCodes) ? item.riskCodes : [];
  const actions = [];
  if (riskCodes.includes("offline") || riskCodes.includes("stale_heartbeat")) {
    actions.push("检查 ESP32 / 网关供电、WiFi/4G 网络、API_HOST 和 API_TOKEN 是否正确。");
  }
  if (riskCodes.includes("no_reading_24h")) {
    actions.push("确认传感器接线、RS485 地址、采样任务是否运行，并检查上报接口是否返回 200。");
  }
  if (riskCodes.includes("weak_signal")) {
    actions.push("调整天线/路由器位置，RSSI 建议尽量高于 -70 dBm。");
  }
  if (riskCodes.includes("pending_config")) {
    actions.push("进入网关管理查看 ESP32 参数配置，确认设备是否已拉取并回报新版本。");
  }
  if (!actions.length) {
    actions.push("进入实时监控确认最近读数，再结合网关管理查看心跳和配置状态。");
  }
  return actions;
}

async function copyGatewayTroubleshooting(item) {
  try {
    await copyText(buildGatewayTroubleshootingText(item));
    message.value = "风险设备排查信息已复制";
  } catch {
    errorMessage.value = "复制失败，请手动复制风险设备信息";
  }
}

async function revealCredential() {
  revealing.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const result = await apiRequest("/api/v1/system/device-credentials/reveal", {
      method: "POST",
      body: JSON.stringify({})
    });
    revealedToken.value = result.deviceIngestToken || "";
    credential.deviceIngestTokenMasked = result.deviceIngestTokenMasked || credential.deviceIngestTokenMasked;
    credential.tokenSource = result.tokenSource || credential.tokenSource;
    credential.updatedAt = result.updatedAt || credential.updatedAt;
    credential.updatedByName = result.updatedByName || credential.updatedByName;
    message.value = "当前设备接入 Token 已加载到页面";
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    revealing.value = false;
  }
}

async function rotateCredential() {
  if (!window.confirm("确认重新生成设备接入 Token 吗？旧 Token 会立即失效。")) {
    return;
  }

  rotating.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const result = await apiRequest("/api/v1/system/device-credentials/rotate", {
      method: "POST",
      body: JSON.stringify({})
    });
    revealedToken.value = result.deviceIngestToken || "";
    credential.deviceIngestTokenMasked = result.deviceIngestTokenMasked || "";
    credential.tokenSource = result.tokenSource || "database";
    credential.updatedAt = result.updatedAt || null;
    credential.updatedByName = result.updatedByName || "";
    message.value = "设备接入 Token 已重新生成，记得同步更新固件";
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    rotating.value = false;
  }
}

async function copyToken() {
  if (!revealedToken.value) {
    return;
  }

  try {
    await copyText(revealedToken.value);
    message.value = "Token 已复制到剪贴板";
  } catch {
    errorMessage.value = "复制失败，请手动复制页面中的明文 Token";
  }
}

async function copyFirmwareSnippet() {
  try {
    await copyText(firmwareSnippet.value);
    message.value = "固件参数片段已复制到剪贴板";
  } catch {
    errorMessage.value = "复制失败，请手动复制页面中的固件参数片段";
  }
}

async function copySamplePayload() {
  try {
    await copyText(samplePayloadText.value);
    message.value = "上报 JSON 示例已复制到剪贴板";
  } catch {
    errorMessage.value = "复制失败，请手动复制页面中的上报 JSON";
  }
}

async function copyCurlSnippet() {
  try {
    await copyText(curlSnippet.value);
    message.value = "curl 联调命令已复制到剪贴板";
  } catch {
    errorMessage.value = "复制失败，请手动复制页面中的 curl 命令";
  }
}

async function copyText(value) {
  const text = String(value || "");
  if (!text) {
    throw new Error("empty_text");
  }

  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
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

function statusLabel(status) {
  if (status === "healthy") return "已接入";
  if (status === "warning") return "待上报";
  if (status === "error") return "异常";
  return "未接入";
}

function statusTagClass(status) {
  if (status === "healthy") return "tag-success";
  if (status === "warning") return "tag-warning";
  if (status === "error") return "tag-danger";
  return "tag-p2";
}

function issueSeverityLabel(severity) {
  if (severity === "error") return "异常";
  if (severity === "warning") return "关注";
  return "提示";
}

function issueTagClass(severity) {
  if (severity === "error") return "tag-danger";
  if (severity === "warning") return "tag-warning";
  return "tag-p2";
}

function gatewayRiskLabel(code) {
  const labels = {
    offline: "离线",
    stale_heartbeat: "心跳旧",
    no_reading_24h: "无上报",
    weak_signal: "弱信号",
    pending_config: "配置待同步"
  };
  return labels[code] || code;
}

function gatewayRiskDescription(code) {
  const descriptions = {
    offline: "当前只看离线设备，优先检查供电、WiFi/4G 网络、API_HOST 和 API_TOKEN。",
    stale_heartbeat: "当前只看心跳过旧设备，优先确认设备进程是否还在运行、网络是否间歇性断开。",
    no_reading_24h: "当前只看 24 小时无上报设备，优先检查传感器接线、RS485 地址、采样任务和上报接口返回。",
    weak_signal: "当前只看弱信号设备，优先调整天线、路由器或 4G 位置，RSSI 建议尽量高于 -70 dBm。",
    pending_config: "当前只看配置待同步设备，优先进入网关管理确认 ESP32 是否已拉取并回报新配置版本。"
  };
  return descriptions[code] || "按风险原因筛选设备，先处理离线和无上报，再处理心跳旧、弱信号和配置同步。";
}

function gatewayRiskTagClass(code) {
  if (code === "offline" || code === "no_reading_24h") return "tag-danger";
  if (code === "stale_heartbeat" || code === "weak_signal") return "tag-warning";
  return "tag-p2";
}

function formatDelayMs(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) {
    return "-";
  }
  if (number >= 1000) {
    return `${formatNumber(number / 1000, 1)} 秒`;
  }
  return `${Math.round(number)} ms`;
}

function formatDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) {
    return "-";
  }
  if (value >= 86400) {
    return `${Math.round(value / 86400)} 天前`;
  }
  if (value >= 3600) {
    return `${Math.round(value / 3600)} 小时前`;
  }
  if (value >= 60) {
    return `${Math.round(value / 60)} 分钟前`;
  }
  return `${Math.round(value)} 秒前`;
}

onMounted(() => {
  loadCredential();
  loadDiagnostics();
  loadTroubleshootingLogs();
});
</script>
