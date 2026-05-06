<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>设备模板</h2>
          <p class="muted-text">统一维护 ESP32 默认参数，后续在网关详情里套用或覆盖。</p>
        </div>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadTemplates">刷新</button>
          <button v-if="canEdit" class="primary-button" @click="startCreate">新增模板</button>
        </div>
      </div>

      <div class="stats-grid">
        <article class="stat-card">
          <div class="stat-label">模板总数</div>
          <strong>{{ templates.length }}</strong>
        </article>
        <article class="stat-card">
          <div class="stat-label">已启用</div>
          <strong>{{ enabledTemplateCount }}</strong>
        </article>
        <article class="stat-card">
          <div class="stat-label">ESP32 模板</div>
          <strong>{{ esp32TemplateCount }}</strong>
        </article>
        <article class="stat-card">
          <div class="stat-label">已关联网关</div>
          <strong>{{ gatewayUsageCount }}</strong>
        </article>
      </div>

      <div class="toolbar">
        <label class="filter-item">
          <span>关键字</span>
          <input v-model="filters.keyword" type="text" placeholder="模板编号 / 模板名称" />
        </label>
        <label class="filter-item">
          <span>类型</span>
          <select v-model="filters.gatewayType">
            <option value="">全部</option>
            <option value="esp32">ESP32</option>
            <option value="linux_gateway">Linux 网关</option>
          </select>
        </label>
        <label class="filter-item">
          <span>状态</span>
          <select v-model="filters.status">
            <option value="">全部</option>
            <option value="enabled">启用</option>
            <option value="disabled">停用</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadTemplates">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table">
        <thead>
          <tr>
            <th>模板编号</th>
            <th>模板名称</th>
            <th>适用类型</th>
            <th>已关联网关</th>
            <th>核心摘要</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in templates" :key="item.id">
            <td>{{ item.templateCode }}</td>
            <td>{{ item.templateName }}</td>
            <td>{{ item.gatewayType }}</td>
            <td>{{ item.gatewayUsageCount ?? 0 }}</td>
            <td>
              <div class="muted-text">
                {{ item.configSummary.reportIntervalMs }}ms / Modbus {{ item.configSummary.modbusAddress }} / GPIO {{ item.configSummary.pumpGpio }} / {{ item.configSummary.autonomyEnabled ? "自治开" : "自治关" }}
              </div>
            </td>
            <td><span class="tag" :class="item.status === 'enabled' ? 'tag-success' : 'tag-warning'">{{ item.status === "enabled" ? "启用" : "停用" }}</span></td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click="showDetail(item)">详情</button>
                <button v-if="canEdit" class="table-link" @click="startEdit(item)">编辑</button>
                <button v-if="canDelete" class="table-link" @click="deleteTemplate(item)">删除</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && templates.length === 0">
            <td colspan="7" class="empty-cell">暂无设备模板</td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="muted-text">正在加载模板数据...</div>
    </section>

    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>{{ editingTemplateId ? "编辑模板" : "新增模板" }}</h2>
          <span class="tag tag-p1">P1</span>
        </div>

        <form class="form-grid" @submit.prevent="saveTemplate">
          <label class="form-item">
            <span>模板编号</span>
            <input v-model="form.templateCode" type="text" :disabled="Boolean(editingTemplateId)" placeholder="TPL-ESP32-SOIL-GW" />
          </label>
          <label class="form-item">
            <span>模板名称</span>
            <input v-model="form.templateName" type="text" placeholder="ESP32 土壤监测网关模板" />
          </label>
          <label class="form-item">
            <span>适用类型</span>
            <select v-model="form.gatewayType">
              <option value="esp32">ESP32</option>
              <option value="linux_gateway">Linux 网关</option>
            </select>
          </label>
          <label class="form-item">
            <span>状态</span>
            <select v-model="form.status">
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </select>
          </label>

          <div class="form-span gateway-config-sections">
            <article class="detail-card">
              <h3>云端通信</h3>
              <div class="form-grid">
                <label class="form-item form-span">
                  <span>API 地址</span>
                  <input v-model="form.config.cloud.apiHost" type="text" placeholder="http://82.156.45.208" />
                </label>
                <label class="form-item">
                  <span>上报周期（ms）</span>
                  <input v-model.number="form.config.cloud.reportIntervalMs" type="number" min="1000" step="1000" />
                </label>
                <label class="form-item">
                  <span>控制轮询（ms）</span>
                  <input v-model.number="form.config.cloud.controlPollIntervalMs" type="number" min="1000" step="1000" />
                </label>
              </div>
            </article>

            <article class="detail-card">
              <h3>RS485 / Modbus</h3>
              <div class="form-grid">
                <label class="form-item">
                  <span>波特率</span>
                  <input v-model.number="form.config.rs485.baudrate" type="number" min="1200" step="1200" />
                </label>
                <label class="form-item">
                  <span>Modbus 地址</span>
                  <input v-model.number="form.config.rs485.modbusAddress" type="number" min="1" step="1" />
                </label>
                <label class="form-item">
                  <span>起始寄存器</span>
                  <input v-model.number="form.config.rs485.registerStart" type="number" min="0" step="1" />
                </label>
                <label class="form-item">
                  <span>寄存器长度</span>
                  <input v-model.number="form.config.rs485.registerCount" type="number" min="1" step="1" />
                </label>
                <label class="form-item">
                  <span>温度索引</span>
                  <input v-model.number="form.config.rs485.tempRegisterIndex" type="number" min="0" step="1" />
                </label>
                <label class="form-item">
                  <span>湿度索引</span>
                  <input v-model.number="form.config.rs485.humRegisterIndex" type="number" min="0" step="1" />
                </label>
              </div>
            </article>

            <article class="detail-card">
              <h3>控制与能力</h3>
              <div class="form-grid">
                <label class="form-item">
                  <span>水泵 GPIO</span>
                  <input v-model.number="form.config.control.pumpGpio" type="number" min="0" step="1" />
                </label>
                <label class="form-item">
                  <span>高电平有效</span>
                  <select v-model="activeHighSelect">
                    <option value="true">是</option>
                    <option value="false">否</option>
                  </select>
                </label>
                <label class="form-item">
                  <span>最大运行（秒）</span>
                  <input v-model.number="form.config.control.maxRunSeconds" type="number" min="0" step="10" />
                </label>
                <label class="form-item">
                  <span>最小停止（秒）</span>
                  <input v-model.number="form.config.control.minOffSeconds" type="number" min="0" step="5" />
                </label>
                <label class="form-item">
                  <span>日累计上限（秒）</span>
                  <input v-model.number="form.config.control.maxDailyRunSeconds" type="number" min="0" step="30" />
                </label>
                <label class="form-item">
                  <span>本地网页</span>
                  <select v-model="localWebSelect">
                    <option value="true">启用</option>
                    <option value="false">停用</option>
                  </select>
                </label>
                <label class="form-item">
                  <span>OTA</span>
                  <select v-model="otaSelect">
                    <option value="true">启用</option>
                    <option value="false">停用</option>
                  </select>
                </label>
                <label class="form-item">
                  <span>4G 兜底</span>
                  <select v-model="cellularSelect">
                    <option value="true">启用</option>
                    <option value="false">停用</option>
                  </select>
                </label>
              </div>
            </article>

            <article class="detail-card">
              <h3>本地自治</h3>
              <div class="form-grid">
                <label class="form-item">
                  <span>断网自治</span>
                  <select v-model="autonomyEnabledSelect">
                    <option value="true">启用</option>
                    <option value="false">停用</option>
                  </select>
                </label>
                <label class="form-item">
                  <span>启动阈值（湿度 %）</span>
                  <input v-model.number="form.config.autonomy.startHumidityBelow" type="number" min="0" max="100" step="1" />
                </label>
                <label class="form-item">
                  <span>停止阈值（湿度 %）</span>
                  <input v-model.number="form.config.autonomy.stopHumidityAbove" type="number" min="0" max="100" step="1" />
                </label>
                <label class="form-item">
                  <span>单次脉冲（秒）</span>
                  <input v-model.number="form.config.autonomy.pulseSeconds" type="number" min="1" step="1" />
                </label>
                <label class="form-item">
                  <span>复检间隔（秒）</span>
                  <input v-model.number="form.config.autonomy.minRecheckSeconds" type="number" min="10" step="10" />
                </label>
                <label class="form-item">
                  <span>要求有效传感器</span>
                  <select v-model="autonomyRequireValidSensorSelect">
                    <option value="true">是</option>
                    <option value="false">否</option>
                  </select>
                </label>
                <label class="form-item">
                  <span>云端命令优先</span>
                  <select v-model="autonomyDisableWhenCloudCommandPendingSelect">
                    <option value="true">是</option>
                    <option value="false">否</option>
                  </select>
                </label>
              </div>
            </article>
          </div>

          <label class="form-item form-span">
            <span>备注</span>
            <textarea v-model="form.remark" rows="3" />
          </label>
          <div class="form-actions form-span">
            <button class="ghost-button" type="button" @click="resetForm">清空</button>
            <button class="primary-button" :disabled="saving || !canEdit">
              {{ saving ? "保存中..." : editingTemplateId ? "保存修改" : "创建模板" }}
            </button>
          </div>
        </form>
      </div>

      <div>
        <div class="panel-header">
          <h2>模板摘要</h2>
          <span class="tag tag-p1">{{ selectedTemplate?.templateCode || "未选择" }}</span>
        </div>
        <div v-if="selectedTemplate" class="detail-grid">
          <div>
            <div class="detail-label">模板名称</div>
            <div class="detail-value">{{ selectedTemplate.templateName }}</div>
          </div>
          <div>
            <div class="detail-label">已关联网关</div>
            <div class="detail-value">{{ selectedTemplate.gatewayUsageCount ?? 0 }}</div>
          </div>
          <div>
            <div class="detail-label">API 地址</div>
            <div class="detail-value">{{ selectedTemplate.configSummary.apiHost || "-" }}</div>
          </div>
          <div>
            <div class="detail-label">上报 / 轮询</div>
            <div class="detail-value">{{ selectedTemplate.configSummary.reportIntervalMs }} / {{ selectedTemplate.configSummary.controlPollIntervalMs }} ms</div>
          </div>
          <div>
            <div class="detail-label">Modbus / 波特率</div>
            <div class="detail-value">{{ selectedTemplate.configSummary.modbusAddress }} / {{ selectedTemplate.configSummary.baudrate }}</div>
          </div>
          <div>
            <div class="detail-label">GPIO / 能力</div>
            <div class="detail-value">GPIO {{ selectedTemplate.configSummary.pumpGpio }} · 本地网页 {{ selectedTemplate.configSummary.localWebEnabled ? "开" : "关" }} · OTA {{ selectedTemplate.configSummary.otaEnabled ? "开" : "关" }}</div>
          </div>
          <div>
            <div class="detail-label">运行保护</div>
            <div class="detail-value">
              单次 {{ selectedTemplate.configSummary.maxRunSeconds }}s / 停机 {{ selectedTemplate.configSummary.minOffSeconds }}s / 日累计 {{ selectedTemplate.configSummary.maxDailyRunSeconds }}s
            </div>
          </div>
          <div class="detail-span">
            <div class="detail-label">本地自治</div>
            <div class="detail-value">
              {{ selectedTemplate.configSummary.autonomyEnabled ? "启用" : "停用" }}
              <template v-if="selectedTemplate.configSummary.autonomyEnabled">
                · {{ selectedTemplate.configSummary.autonomyStartHumidityBelow }}% 启动
                · {{ selectedTemplate.configSummary.autonomyStopHumidityAbove }}% 停止
                · {{ selectedTemplate.configSummary.autonomyPulseSeconds }}s 脉冲
                · {{ selectedTemplate.configSummary.autonomyMinRecheckSeconds }}s 复检
              </template>
            </div>
          </div>
          <div class="detail-span">
            <div class="detail-label">产品建议</div>
            <div class="detail-value muted-text">模板负责平台默认值，单设备配置负责现场覆盖。第一版先做模板绑定、版本和同步状态，不在系统设置堆 ESP32 细节。</div>
          </div>
        </div>
        <div v-else class="empty-state">从列表选择一个模板查看摘要。</div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { apiRequest, buildQuery } from "../lib/api";
import { cloneGatewayConfig, DEFAULT_ESP32_GATEWAY_CONFIG, normalizeGatewayConfig, type GatewayTemplateRecord } from "../lib/gateway-config";
import { hasPermission } from "../lib/session";

const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const message = ref("");
const templates = ref<GatewayTemplateRecord[]>([]);
const selectedTemplate = ref<GatewayTemplateRecord | null>(null);
const editingTemplateId = ref<number | null>(null);

const filters = reactive({
  keyword: "",
  gatewayType: "esp32",
  status: ""
});

const form = reactive({
  templateCode: "",
  templateName: "",
  gatewayType: "esp32",
  status: "enabled",
  remark: "",
  config: cloneGatewayConfig(DEFAULT_ESP32_GATEWAY_CONFIG)
});

const canEdit = hasPermission("device:edit") || hasPermission("device:add");
const canDelete = hasPermission("device:delete");

const enabledTemplateCount = computed(() => templates.value.filter((item) => item.status === "enabled").length);
const esp32TemplateCount = computed(() => templates.value.filter((item) => item.gatewayType === "esp32").length);
const gatewayUsageCount = computed(() => templates.value.reduce((sum, item) => sum + Number(item.gatewayUsageCount || 0), 0));

const activeHighSelect = computed({
  get: () => String(Boolean(form.config.control.activeHigh)),
  set: (value: string) => {
    form.config.control.activeHigh = value === "true";
  }
});

const localWebSelect = computed({
  get: () => String(Boolean(form.config.capabilities.localWebEnabled)),
  set: (value: string) => {
    form.config.capabilities.localWebEnabled = value === "true";
  }
});

const otaSelect = computed({
  get: () => String(Boolean(form.config.capabilities.otaEnabled)),
  set: (value: string) => {
    form.config.capabilities.otaEnabled = value === "true";
  }
});

const cellularSelect = computed({
  get: () => String(Boolean(form.config.capabilities.cellularEnabled)),
  set: (value: string) => {
    form.config.capabilities.cellularEnabled = value === "true";
  }
});
const autonomyEnabledSelect = computed({
  get: () => String(Boolean(form.config.autonomy.enabled)),
  set: (value: string) => {
    form.config.autonomy.enabled = value === "true";
  }
});
const autonomyRequireValidSensorSelect = computed({
  get: () => String(Boolean(form.config.autonomy.requireValidSensor)),
  set: (value: string) => {
    form.config.autonomy.requireValidSensor = value === "true";
  }
});
const autonomyDisableWhenCloudCommandPendingSelect = computed({
  get: () => String(Boolean(form.config.autonomy.disableWhenCloudCommandPending)),
  set: (value: string) => {
    form.config.autonomy.disableWhenCloudCommandPending = value === "true";
  }
});

function resetFilters() {
  filters.keyword = "";
  filters.gatewayType = "esp32";
  filters.status = "";
  void loadTemplates();
}

function resetForm() {
  editingTemplateId.value = null;
  form.templateCode = "";
  form.templateName = "";
  form.gatewayType = "esp32";
  form.status = "enabled";
  form.remark = "";
  form.config = cloneGatewayConfig(DEFAULT_ESP32_GATEWAY_CONFIG);
}

function showDetail(item: GatewayTemplateRecord) {
  selectedTemplate.value = item;
}

function startCreate() {
  resetForm();
  errorMessage.value = "";
  message.value = "";
}

function startEdit(item: GatewayTemplateRecord) {
  editingTemplateId.value = item.id;
  form.templateCode = item.templateCode;
  form.templateName = item.templateName;
  form.gatewayType = item.gatewayType || "esp32";
  form.status = item.status || "enabled";
  form.remark = item.remark || "";
  form.config = cloneGatewayConfig(normalizeGatewayConfig(item.config));
  selectedTemplate.value = item;
}

async function loadTemplates() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const rows = await apiRequest<GatewayTemplateRecord[]>(`/api/v1/gateway-templates${buildQuery(filters)}`);
    templates.value = rows;
    if (!selectedTemplate.value && rows[0]) {
      selectedTemplate.value = rows[0];
    }
  } catch (error: any) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function saveTemplate() {
  if (!canEdit) {
    return;
  }
  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const payload = {
      templateCode: form.templateCode,
      templateName: form.templateName,
      gatewayType: form.gatewayType,
      status: form.status,
      remark: form.remark,
      config: form.config
    };
    if (editingTemplateId.value) {
      await apiRequest(`/api/v1/gateway-templates/${editingTemplateId.value}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      message.value = "模板已更新";
    } else {
      await apiRequest("/api/v1/gateway-templates", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      message.value = "模板已创建";
    }
    resetForm();
    await loadTemplates();
  } catch (error: any) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

async function deleteTemplate(item: GatewayTemplateRecord) {
  if (!canDelete) {
    return;
  }
  if (!window.confirm(`确认删除模板“${item.templateName}”吗？`)) {
    return;
  }

  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/gateway-templates/${item.id}`, {
      method: "DELETE"
    });
    if (selectedTemplate.value?.id === item.id) {
      selectedTemplate.value = null;
    }
    if (editingTemplateId.value === item.id) {
      resetForm();
    }
    message.value = "模板已删除";
    await loadTemplates();
  } catch (error: any) {
    errorMessage.value = error.message;
  }
}

onMounted(() => {
  void loadTemplates();
});
</script>
