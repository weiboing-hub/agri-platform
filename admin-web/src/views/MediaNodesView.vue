<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>媒体节点管理</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadNodes">刷新</button>
          <button v-if="canCreate" class="primary-button" @click="startCreate">新增节点</button>
        </div>
      </div>

      <div class="toolbar">
        <label class="filter-item">
          <span>关键字</span>
          <input v-model="filters.keyword" type="text" placeholder="编号 / 名称 / 地址" />
        </label>
        <label class="filter-item">
          <span>状态</span>
          <select v-model="filters.status">
            <option value="">全部</option>
            <option value="enabled">{{ enumLabel("status", "enabled") }}</option>
            <option value="disabled">{{ enumLabel("status", "disabled") }}</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadNodes">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table">
        <thead>
          <tr>
            <th>节点编号</th>
            <th>节点名称</th>
            <th>类型</th>
            <th>主机地址</th>
            <th>API 地址</th>
            <th>健康状态</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in nodes" :key="item.id">
            <td>{{ item.nodeCode }}</td>
            <td>{{ item.nodeName }}</td>
            <td>{{ enumLabel("mediaNodeType", item.nodeType) }}</td>
            <td>{{ item.hostAddress }}</td>
            <td>{{ item.apiBaseUrl || "-" }}</td>
            <td><span class="tag" :class="healthClass(item.healthStatus)">{{ enumLabel("healthStatus", item.healthStatus) }}</span></td>
            <td>{{ enumLabel("status", item.status) }}</td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click="showDetail(item)">详情</button>
                <button v-if="canEdit" class="table-link" @click="startEdit(item)">编辑</button>
                <button v-if="canDelete" class="table-link" @click="deleteNode(item)">删除</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && nodes.length === 0">
            <td colspan="8" class="empty-cell">暂无媒体节点数据</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>{{ editingNodeId ? "编辑媒体节点" : "新增媒体节点" }}</h2>
          <span class="tag tag-p2">media</span>
        </div>

        <form class="form-grid" @submit.prevent="saveNode">
          <label class="form-item">
            <span>节点编号</span>
            <input v-model="form.nodeCode" type="text" :disabled="Boolean(editingNodeId)" placeholder="MEDIA-001" />
          </label>
          <label class="form-item">
            <span>节点名称</span>
            <input v-model="form.nodeName" type="text" />
          </label>
          <label class="form-item">
            <span>节点类型</span>
            <select v-model="form.nodeType">
              <option value="media_server">{{ enumLabel("mediaNodeType", "media_server") }}</option>
              <option value="storage_gateway">{{ enumLabel("mediaNodeType", "storage_gateway") }}</option>
              <option value="edge_gateway">{{ enumLabel("mediaNodeType", "edge_gateway") }}</option>
            </select>
          </label>
          <label class="form-item">
            <span>主机地址</span>
            <input v-model="form.hostAddress" type="text" placeholder="192.168.1.50" />
          </label>
          <label class="form-item form-span">
            <span>API 地址</span>
            <input v-model="form.apiBaseUrl" type="text" placeholder="http://192.168.1.50:8080/api" />
          </label>
          <label class="form-item form-span">
            <span>RTMP 基础地址</span>
            <input v-model="form.rtmpBaseUrl" type="text" placeholder="rtmp://192.168.1.50/live" />
          </label>
          <label class="form-item form-span">
            <span>HLS 基础地址</span>
            <input v-model="form.hlsBaseUrl" type="text" placeholder="http://192.168.1.50:8080/hls" />
          </label>
          <label class="form-item form-span">
            <span>FTP 根路径</span>
            <input v-model="form.ftpRootPath" type="text" placeholder="/data/camera-ftp" />
          </label>
          <label class="form-item">
            <span>健康状态</span>
            <select v-model="form.healthStatus">
              <option value="unknown">{{ enumLabel("healthStatus", "unknown") }}</option>
              <option value="healthy">{{ enumLabel("healthStatus", "healthy") }}</option>
              <option value="warning">{{ enumLabel("healthStatus", "warning") }}</option>
              <option value="error">{{ enumLabel("healthStatus", "error") }}</option>
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
            <textarea v-model="form.remark" rows="3" />
          </label>
          <div class="form-actions form-span">
            <button class="ghost-button" type="button" @click="resetForm">清空</button>
            <button class="primary-button" :disabled="saving || !(canCreate || canEdit)">
              {{ saving ? "保存中..." : editingNodeId ? "保存修改" : "创建节点" }}
            </button>
          </div>
        </form>
      </div>

      <div>
        <div class="panel-header">
          <h2>节点详情</h2>
          <span class="tag tag-p2">{{ selectedNode?.nodeCode || "未选择" }}</span>
        </div>
        <div v-if="selectedNode" class="detail-grid">
          <div>
            <div class="detail-label">类型</div>
            <div class="detail-value">{{ enumLabel("mediaNodeType", selectedNode.nodeType) }}</div>
          </div>
          <div>
            <div class="detail-label">最后心跳</div>
            <div class="detail-value">{{ formatDateTime(selectedNode.lastHeartbeatAt) }}</div>
          </div>
          <div class="detail-span">
            <div class="detail-label">RTMP</div>
            <div class="detail-value">{{ selectedNode.rtmpBaseUrl || "-" }}</div>
          </div>
          <div class="detail-span">
            <div class="detail-label">HLS</div>
            <div class="detail-value">{{ selectedNode.hlsBaseUrl || "-" }}</div>
          </div>
          <div class="detail-span">
            <div class="detail-label">FTP 根路径</div>
            <div class="detail-value">{{ selectedNode.ftpRootPath || "-" }}</div>
          </div>
          <div class="detail-span">
            <div class="detail-label">备注</div>
            <div class="detail-value">{{ selectedNode.remark || "-" }}</div>
          </div>
        </div>
        <div v-else class="empty-state">从列表选择一个媒体节点查看详情。</div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatDateTime } from "../lib/format";
import { hasPermission } from "../lib/session";

const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const message = ref("");
const nodes = ref([]);
const selectedNode = ref(null);
const editingNodeId = ref(null);

const filters = reactive({
  keyword: "",
  status: ""
});

const form = reactive({
  nodeCode: "",
  nodeName: "",
  nodeType: "media_server",
  hostAddress: "",
  apiBaseUrl: "",
  rtmpBaseUrl: "",
  hlsBaseUrl: "",
  ftpRootPath: "",
  status: "enabled",
  healthStatus: "unknown",
  remark: ""
});

const canCreate = hasPermission("device:add");
const canEdit = hasPermission("device:edit");
const canDelete = hasPermission("device:delete");

function healthClass(status) {
  if (status === "healthy") return "tag-success";
  if (status === "warning" || status === "unknown") return "tag-warning";
  return "tag-danger";
}

function resetForm() {
  editingNodeId.value = null;
  form.nodeCode = "";
  form.nodeName = "";
  form.nodeType = "media_server";
  form.hostAddress = "";
  form.apiBaseUrl = "";
  form.rtmpBaseUrl = "";
  form.hlsBaseUrl = "";
  form.ftpRootPath = "";
  form.status = "enabled";
  form.healthStatus = "unknown";
  form.remark = "";
}

function resetFilters() {
  filters.keyword = "";
  filters.status = "";
  loadNodes();
}

function showDetail(item) {
  selectedNode.value = item;
}

function startCreate() {
  resetForm();
  errorMessage.value = "";
  message.value = "";
}

function startEdit(item) {
  editingNodeId.value = item.id;
  form.nodeCode = item.nodeCode;
  form.nodeName = item.nodeName;
  form.nodeType = item.nodeType || "media_server";
  form.hostAddress = item.hostAddress || "";
  form.apiBaseUrl = item.apiBaseUrl || "";
  form.rtmpBaseUrl = item.rtmpBaseUrl || "";
  form.hlsBaseUrl = item.hlsBaseUrl || "";
  form.ftpRootPath = item.ftpRootPath || "";
  form.status = item.status || "enabled";
  form.healthStatus = item.healthStatus || "unknown";
  form.remark = item.remark || "";
  selectedNode.value = item;
}

async function loadNodes() {
  loading.value = true;
  errorMessage.value = "";
  try {
    nodes.value = await apiRequest(`/api/v1/media-nodes${buildQuery(filters)}`);
    if (selectedNode.value) {
      selectedNode.value = nodes.value.find((item) => item.id === selectedNode.value.id) || nodes.value[0] || null;
    } else if (nodes.value[0]) {
      selectedNode.value = nodes.value[0];
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function saveNode() {
  if (!(canCreate || canEdit)) {
    return;
  }

  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const payload = { ...form };
    if (editingNodeId.value) {
      await apiRequest(`/api/v1/media-nodes/${editingNodeId.value}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      message.value = "媒体节点更新成功";
    } else {
      await apiRequest("/api/v1/media-nodes", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      message.value = "媒体节点创建成功";
    }
    await loadNodes();
    resetForm();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

async function deleteNode(item) {
  if (!canDelete) {
    return;
  }
  if (!window.confirm(`确认删除媒体节点“${item.nodeName}”吗？`)) {
    return;
  }
  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/media-nodes/${item.id}`, {
      method: "DELETE"
    });
    message.value = "媒体节点删除成功";
    await loadNodes();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

onMounted(loadNodes);
</script>
