<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>通知记录</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadNotifications">刷新</button>
        </div>
      </div>

      <div class="toolbar">
        <label class="filter-item">
          <span>发送状态</span>
          <select v-model="filters.status">
            <option value="">全部</option>
            <option value="pending">{{ enumLabel("notificationStatus", "pending") }}</option>
            <option value="sent">{{ enumLabel("notificationStatus", "sent") }}</option>
            <option value="failed">{{ enumLabel("notificationStatus", "failed") }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>通知渠道</span>
          <select v-model="filters.channelType">
            <option value="">全部</option>
            <option value="wechat">{{ enumLabel("channelType", "wechat") }}</option>
            <option value="sms">{{ enumLabel("channelType", "sms") }}</option>
            <option value="email">{{ enumLabel("channelType", "email") }}</option>
            <option value="in_app">{{ enumLabel("channelType", "in_app") }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>接收人关键字</span>
          <input v-model="filters.receiverKeyword" type="text" placeholder="手机号 / 用户标识 / 摘要" />
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadNotifications">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table compact-table">
        <thead>
          <tr>
            <th>通知编号</th>
            <th>渠道</th>
            <th>接收对象</th>
            <th>摘要</th>
            <th>发送状态</th>
            <th>重试次数</th>
            <th>关联告警</th>
            <th>发送时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in notifications" :key="item.id">
            <td>{{ item.notificationNo }}</td>
            <td>{{ enumLabel("channelType", item.channelType) }}</td>
            <td>{{ item.receiverValue }}</td>
            <td>{{ item.contentSummary }}</td>
            <td><span class="tag" :class="statusClass(item.sendStatus)">{{ enumLabel("notificationStatus", item.sendStatus) }}</span></td>
            <td>{{ item.retryCount }}</td>
            <td>{{ item.alertNo || "-" }}</td>
            <td>{{ formatDateTime(item.sentAt || item.createdAt) }}</td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click="selectNotification(item)">详情</button>
                <button v-if="canResend" class="table-link" @click="resendNotification(item)">重发</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && notifications.length === 0">
            <td colspan="9" class="empty-cell">暂无通知记录</td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="muted-text">正在加载通知记录...</div>
    </section>

    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>通知详情</h2>
          <span class="tag tag-p2">{{ selectedNotification?.notificationNo || "未选择" }}</span>
        </div>

        <div v-if="selectedNotification" class="stack">
          <div class="detail-grid">
            <div>
              <div class="detail-label">通知渠道</div>
              <div class="detail-value">{{ enumLabel("channelType", selectedNotification.channelType) }}</div>
            </div>
            <div>
              <div class="detail-label">接收类型</div>
              <div class="detail-value">{{ enumLabel("receiverType", selectedNotification.receiverType) }}</div>
            </div>
            <div>
              <div class="detail-label">接收对象</div>
              <div class="detail-value">{{ selectedNotification.receiverValue }}</div>
            </div>
            <div>
              <div class="detail-label">发送状态</div>
              <div class="detail-value">{{ enumLabel("notificationStatus", selectedNotification.sendStatus) }}</div>
            </div>
            <div>
              <div class="detail-label">创建时间</div>
              <div class="detail-value">{{ formatDateTime(selectedNotification.createdAt) }}</div>
            </div>
            <div>
              <div class="detail-label">发送时间</div>
              <div class="detail-value">{{ formatDateTime(selectedNotification.sentAt) }}</div>
            </div>
          </div>
          <div class="detail-span">
            <div class="detail-label">关联告警</div>
            <div class="detail-value">{{ selectedNotification.alertNo ? `${selectedNotification.alertNo} / ${selectedNotification.alertTitle || "-"}` : "-" }}</div>
          </div>
          <div class="detail-span">
            <div class="detail-label">内容摘要</div>
            <div class="detail-value">{{ selectedNotification.contentSummary || "-" }}</div>
          </div>
          <div class="detail-span">
            <div class="detail-label">响应信息</div>
            <div class="detail-value">{{ selectedNotification.responseText || "-" }}</div>
          </div>
        </div>
        <div v-else class="empty-state">从列表选择一条通知查看详情。</div>
      </div>

      <div>
        <div class="panel-header">
          <h2>运维建议</h2>
          <span class="tag tag-p2">ops</span>
        </div>

        <div class="stack">
          <div class="detail-card">
            <div class="detail-label">失败通知处理</div>
            <div class="detail-value">优先检查 `failed` 状态的短信或微信通知，必要时人工重发并记录重试结果。</div>
          </div>
          <div class="detail-card">
            <div class="detail-label">重发策略</div>
            <div class="detail-value">当前重发按钮会直接把状态写成 `sent` 并累计重试次数，适合开发演示和运维确认流。</div>
          </div>
          <div class="detail-card">
            <div class="detail-label">建议下一步</div>
            <div class="detail-value">后续可以继续补真实短信/微信通道适配和异步投递结果回写。</div>
          </div>
        </div>
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
const errorMessage = ref("");
const message = ref("");
const notifications = ref([]);
const selectedNotification = ref(null);

const filters = reactive({
  status: "",
  channelType: "",
  receiverKeyword: ""
});

const canResend = hasPermission("alert:assign");

function statusClass(status) {
  if (status === "sent") {
    return "tag-success";
  }
  if (status === "failed") {
    return "tag-danger";
  }
  return "tag-warning";
}

function resetFilters() {
  filters.status = "";
  filters.channelType = "";
  filters.receiverKeyword = "";
  loadNotifications();
}

function selectNotification(item) {
  selectedNotification.value = item;
}

async function loadNotifications() {
  loading.value = true;
  errorMessage.value = "";
  try {
    notifications.value = await apiRequest(`/api/v1/notifications${buildQuery(filters)}`);
    if (selectedNotification.value) {
      selectedNotification.value =
        notifications.value.find((item) => item.id === selectedNotification.value.id) || notifications.value[0] || null;
    } else if (notifications.value[0]) {
      selectedNotification.value = notifications.value[0];
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function resendNotification(item) {
  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/notifications/${item.id}/resend`, {
      method: "POST",
      body: JSON.stringify({})
    });
    message.value = `${item.notificationNo} 已重发`;
    await loadNotifications();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

onMounted(loadNotifications);
</script>
