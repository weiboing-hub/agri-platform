<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>系统设置</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadConfigs">刷新</button>
          <button class="ghost-button" @click="restoreDefaults">恢复默认</button>
          <button class="primary-button" @click="saveConfigs" :disabled="saving || !canEdit">
            {{ saving ? "保存中..." : hasUnsavedChanges ? `保存设置（${changedFieldCount} 项变更）` : "保存设置" }}
          </button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <div class="settings-overview">
        <div class="settings-overview-card">
          <small>配置分组</small>
          <strong>{{ CONFIG_SECTIONS.length }}</strong>
          <span>已归类为安全、平台、AI、通知、设备与媒体存储能力。</span>
        </div>
        <div class="settings-overview-card">
          <small>字段总数</small>
          <strong>{{ totalFieldCount }}</strong>
          <span>支持批量保存，未识别字段不会覆盖已有系统配置。</span>
        </div>
        <div class="settings-overview-card">
          <small>当前定位</small>
          <strong>{{ activeSectionTitle }}</strong>
          <span>左侧支持搜索和滚动联动，适合上线后日常运维调整。</span>
        </div>
        <div class="settings-overview-card">
          <small>保存状态</small>
          <strong>{{ hasUnsavedChanges ? "待保存" : "已同步" }}</strong>
          <span>{{ hasUnsavedChanges ? `当前还有 ${changedFieldCount} 项修改未写入数据库。` : "当前表单和数据库配置一致。" }}</span>
        </div>
      </div>

      <div v-if="filteredSections.length > 0" class="chip-list settings-quick-jump">
        <button
          v-for="section in filteredSections"
          :key="`quick-${section.code}`"
          type="button"
          class="chip chip-button settings-quick-chip"
          :class="{ 'chip-button-active': activeSectionCode === section.code }"
          @click="focusSection(section.code)"
        >
          {{ section.title }}
        </button>
      </div>

      <div class="settings-layout">
        <aside class="settings-sidebar">
          <div class="settings-sidebar-title">配置导航</div>
          <input
            v-model="searchQuery"
            class="settings-search"
            type="text"
            placeholder="搜索分组 / 字段"
          />
          <div class="settings-sidebar-meta">
            <span>当前 {{ activeSectionPositionText }}</span>
            <span>可见 {{ filteredSections.length }} 组 / {{ visibleFieldCount }} 项</span>
          </div>
          <div class="settings-nav">
            <button
              v-for="section in filteredSections"
              :key="section.code"
              type="button"
              class="settings-nav-button"
              :class="{ 'settings-nav-button-active': activeSectionCode === section.code }"
              @click="focusSection(section.code)"
            >
              <span>{{ section.title }}</span>
              <small>{{ section.fields.length }} 项</small>
            </button>
            <div v-if="filteredSections.length === 0" class="settings-nav-empty">
              没有匹配的配置分组
            </div>
          </div>
        </aside>

        <div class="settings-content" v-if="filteredSections.length > 0">
          <section
            v-for="section in filteredSections"
            :id="`settings-section-${section.code}`"
            :key="section.code"
            class="settings-group"
            :class="{ 'settings-group-active': activeSectionCode === section.code }"
          >
            <div class="settings-group-head">
              <div>
                <div class="panel-header">
                  <h3>{{ section.title }}</h3>
                  <span class="tag tag-p1">{{ section.code }}</span>
                </div>
                <p class="settings-group-desc">{{ sectionLead(section) }}</p>
              </div>
              <div class="settings-group-count">{{ section.fields.length }} 项</div>
            </div>

            <div class="settings-subgroup-stack">
              <section
                v-for="subgroup in section.subgroups"
                :key="`${section.code}-${subgroup.code}`"
                class="settings-subgroup"
              >
                <div v-if="section.subgroups.length > 1" class="settings-subgroup-head">
                  <div class="settings-subgroup-title">{{ subgroup.title }}</div>
                  <div v-if="subgroup.description" class="settings-subgroup-desc">{{ subgroup.description }}</div>
                </div>

                <div class="form-grid settings-subgroup-grid">
                  <div
                    v-for="field in subgroup.fields"
                    :key="field.key"
                    class="form-item settings-field-card"
                    :class="{ 'form-span': field.span, 'settings-field-card-boolean': field.type === 'boolean' }"
                  >
                    <span class="field-label">{{ field.label }}</span>

                    <input
                      v-if="['text', 'time', 'password'].includes(field.type)"
                      v-model="formValues[field.formKey]"
                      :type="field.type === 'password' ? 'password' : 'text'"
                      :placeholder="field.placeholder || ''"
                    />

                    <input
                      v-else-if="field.type === 'number'"
                      v-model="formValues[field.formKey]"
                      type="number"
                      min="0"
                      :step="field.step || 1"
                    />

                    <select
                      v-else-if="field.type === 'select'"
                      v-model="formValues[field.formKey]"
                    >
                      <option v-for="option in field.options" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </option>
                    </select>

                    <label v-else-if="field.type === 'boolean'" class="settings-boolean-card">
                      <div class="settings-boolean-copy">
                        <span class="settings-boolean-title">{{ field.label }}</span>
                        <small class="settings-boolean-state">{{ formValues[field.formKey] ? "已启用" : "未启用" }}</small>
                      </div>
                      <span class="toggle-switch">
                        <input
                          v-model="formValues[field.formKey]"
                          type="checkbox"
                        />
                        <span class="toggle-switch-track" />
                      </span>
                    </label>

                    <textarea
                      v-else-if="['list', 'textarea'].includes(field.type)"
                      v-model="formValues[field.formKey]"
                      :rows="field.type === 'textarea' ? 4 : 3"
                      :placeholder="field.type === 'textarea' ? field.placeholder || '' : '多个值用逗号分隔'"
                    />

                    <small class="field-note">{{ field.description }}</small>
                  </div>
                </div>
              </section>
            </div>
          </section>
        </div>
        <div v-else class="detail-card">
          <div class="detail-label">没有匹配结果</div>
          <div class="detail-value">换个关键词试试，例如“登录”“AI”“通知”“网关”。</div>
        </div>
      </div>
    </section>

    <section class="panel settings-helper-panel">
      <div class="panel-header">
        <h2>运维助手</h2>
        <span class="tag tag-p1">ops</span>
      </div>

      <div class="settings-helper-grid">
        <div class="detail-card settings-helper-card">
          <div class="settings-helper-head">
            <div>
              <div class="detail-label">联调测试</div>
              <div class="detail-value">快速检查通知、AI 和设备连接链路。</div>
            </div>
          </div>
          <div class="inline-actions settings-helper-actions">
            <button class="ghost-button" @click="runTest('notification')">测试通知</button>
            <button class="ghost-button" @click="runTest('ai-service')">测试 AI 服务</button>
            <button class="ghost-button" @click="runTest('device-connection')">测试设备连接</button>
          </div>

          <div v-if="testResult" class="settings-test-result">
            <div class="detail-label">最近一次测试</div>
            <div class="detail-value">{{ testResult.target }} / {{ testResult.status }}</div>
            <details class="config-disclosure settings-test-disclosure">
              <summary class="config-disclosure-summary">查看原始返回</summary>
              <pre class="json-block">{{ formatJson(testResult) }}</pre>
            </details>
          </div>
          <div v-else class="empty-state">还没有执行任何联调测试。</div>
        </div>

        <div class="settings-guide-grid">
          <div class="detail-card settings-helper-card">
            <div class="detail-label">保存与恢复</div>
            <div class="detail-value">恢复默认只重置当前表单，点击“保存设置”后才会正式写入配置表。</div>
          </div>
          <div class="detail-card settings-helper-card">
            <div class="detail-label">AI 与通知</div>
            <div class="detail-value">AI 先保持轻量并发，通知优先配置 webhook；远程模型关闭时会回退到本地摘要。</div>
          </div>
          <div class="detail-card settings-helper-card">
            <div class="detail-label">主题与上线</div>
            <div class="detail-value">主题入口在右上角；生产环境调整参数前，建议先在当前页面做一次联调测试。</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { apiRequest } from "../lib/api";
import { formatJson } from "../lib/format";
import { hasPermission } from "../lib/session";
import { applyThemePreset, getStoredThemePreset, THEME_CHANGE_EVENT, THEME_OPTIONS } from "../lib/theme";

const RAW_CONFIG_SECTIONS = [
  {
    code: "login_security",
    title: "登录安全配置",
    fields: [
      { key: "rate_limit_enabled", label: "启用登录限流", type: "boolean", defaultValue: true, description: "限制同账号在窗口期内的登录尝试次数。" },
      { key: "rate_limit_login_window_ms", label: "限流窗口(ms)", type: "number", defaultValue: 900000, description: "默认 15 分钟，可按需放宽。" },
      { key: "rate_limit_login_max", label: "窗口内最大尝试次数", type: "number", defaultValue: 5, description: "超过后返回“登录尝试过于频繁”。" },
      { key: "login_lock_enabled", label: "启用失败锁定", type: "boolean", defaultValue: true, description: "连续输错密码后临时锁定账号。" },
      { key: "login_failure_threshold", label: "锁定阈值(次)", type: "number", defaultValue: 5, description: "连续失败达到该次数后锁定。" },
      { key: "login_lock_minutes", label: "锁定时长(分钟)", type: "number", defaultValue: 15, description: "账号临时锁定的持续时间。" }
    ]
  },
  {
    code: "base",
    title: "基础配置",
    fields: [
      { key: "platform_name", label: "平台名称", type: "text", defaultValue: "智能农业环境监测平台", description: "后台系统顶部显示名称。", span: true },
      { key: "default_timezone", label: "默认时区", type: "text", defaultValue: "Asia/Shanghai", description: "建议保持北京时间。" },
      { key: "data_retention_days", label: "数据保留周期(天)", type: "number", defaultValue: 365, description: "历史数据清理和归档参考值。" }
    ]
  },
  {
    code: "appearance",
    title: "外观主题",
    fields: [
      {
        key: "theme_preset",
        label: "主题颜色",
        type: "select",
        defaultValue: "forest",
        description: "控制整个后台的主视觉颜色，需与顶栏主题保持一致。",
        options: THEME_OPTIONS.map((item) => ({
          label: item.label,
          value: item.value
        }))
      }
    ]
  },
  {
    code: "alerts",
    title: "告警配置",
    fields: [
      {
        key: "default_severity",
        label: "默认告警级别",
        type: "select",
        defaultValue: "medium",
        description: "新建规则默认使用的告警级别。",
        options: [
          { label: "低", value: "low" },
          { label: "中", value: "medium" },
          { label: "高", value: "high" },
          { label: "紧急", value: "critical" }
        ]
      },
      { key: "reopen_upgrade_threshold", label: "重开升级阈值", type: "number", defaultValue: 3, description: "超过该次数可升级提醒。" },
      {
        key: "default_recovery_policy",
        label: "默认恢复策略",
        type: "select",
        defaultValue: "manual_close",
        description: "规则默认恢复行为。",
        options: [
          { label: "人工关闭", value: "manual_close" },
          { label: "自动关闭", value: "auto_close" },
          { label: "自动降级", value: "auto_downgrade" }
        ]
      }
    ]
  },
  {
    code: "control_safety",
    title: "控制安全配置",
    fields: [
      { key: "max_run_seconds", label: "单次最大运行时长(秒)", type: "number", defaultValue: 1800, description: "执行器单次动作上限。" },
      {
        key: "backfill_control_policy",
        label: "补传期间控制策略",
        type: "select",
        defaultValue: "warn",
        description: "控制与补传冲突时的处理方式。",
        options: [
          { label: "提示后允许", value: "warn" },
          { label: "禁止控制", value: "block" },
          { label: "直接允许", value: "allow" }
        ]
      },
      { key: "allow_force_control", label: "允许强制控制", type: "boolean", defaultValue: true, description: "是否对高危操作开放强制执行。" },
      {
        key: "mutex_conflict_policy",
        label: "互斥冲突策略",
        type: "select",
        defaultValue: "reject",
        description: "互斥资源冲突的默认处理方式。",
        options: [
          { label: "拒绝执行", value: "reject" },
          { label: "排队执行", value: "queue" },
          { label: "覆盖执行", value: "override" }
        ]
      }
    ]
  },
  {
    code: "ai_scheduler",
    title: "AI 调度配置",
    fields: [
      { key: "auto_daily_report_enabled", label: "启用自动日报", type: "boolean", defaultValue: false, description: "测试阶段建议关闭；关闭后只允许手动生成日报。" },
      { key: "daily_report_time", label: "日报生成时间", type: "time", defaultValue: "08:30", description: "格式建议 HH:mm。" },
      { key: "auto_weekly_report_enabled", label: "启用自动周报", type: "boolean", defaultValue: false, description: "测试阶段建议关闭；关闭后只允许手动生成周报。" },
      { key: "weekly_report_time", label: "周报生成时间", type: "text", defaultValue: "MON 08:30", description: "格式示例 MON 08:30。" },
      { key: "event_diagnosis_enabled", label: "启用事件触发诊断", type: "boolean", defaultValue: false, description: "测试阶段建议关闭，避免告警事件自动创建诊断任务。" },
      { key: "cooldown_minutes", label: "诊断冷却时间(分钟)", type: "number", defaultValue: 30, description: "避免重复触发。" },
      { key: "max_concurrency", label: "最大并发任务数", type: "number", defaultValue: 3, description: "AI 任务并发上限。" },
      { key: "max_queue_size", label: "最大排队任务数", type: "number", defaultValue: 100, description: "超出后可拒绝新任务。" },
      { key: "retry_count", label: "失败重试次数", type: "number", defaultValue: 2, description: "AI 任务失败后的重试次数。" },
      { key: "retry_interval_minutes", label: "重试间隔(分钟)", type: "number", defaultValue: 15, description: "两次重试之间的最小间隔。" }
    ]
  },
  {
    code: "ai_provider",
    title: "AI 模型服务",
    fields: [
      { key: "enabled", label: "启用远程模型", type: "boolean", defaultValue: false, description: "关闭时继续使用本地规则摘要。" },
      {
        key: "provider_type",
        label: "服务类型",
        type: "select",
        defaultValue: "local_mock",
        description: "当前支持本地摘要和 OpenAI 兼容接口。",
        options: [
          { label: "本地摘要", value: "local_mock" },
          { label: "OpenAI兼容接口", value: "openai_compatible" }
        ]
      },
      { key: "base_url", label: "Base URL", type: "text", defaultValue: "", description: "例如 https://api.openai.com/v1", span: true },
      { key: "api_key", label: "API Key", type: "password", defaultValue: "", description: "用于远程模型鉴权。", span: true },
      { key: "model", label: "模型名称", type: "text", defaultValue: "", description: "例如 gpt-5.4 / gpt-4.1。" },
      { key: "timeout_ms", label: "超时(ms)", type: "number", defaultValue: 10000, description: "单次模型请求的超时阈值。" },
      { key: "temperature", label: "Temperature", type: "number", defaultValue: 0.2, step: 0.1, description: "建议低温度，避免报告漂移。" },
      { key: "max_tokens", label: "Max Tokens", type: "number", defaultValue: 1200, description: "报告生成最大返回长度。" },
      {
        key: "system_prompt",
        label: "系统提示词",
        type: "textarea",
        defaultValue: "你是智能农业环境监测平台的分析助手，请输出严谨、简洁、可执行的中文结果。",
        description: "用于约束 AI 报告和诊断的风格与边界。",
        span: true,
        placeholder: "请输入系统提示词"
      }
    ]
  },
  {
    code: "notification_channel",
    title: "通知通道配置",
    fields: [
      { key: "sender_name", label: "发送方名称", type: "text", defaultValue: "智能农业监测平台", description: "通知正文展示的发送方名称。" },
      {
        key: "default_test_channel",
        label: "默认测试通道",
        type: "select",
        defaultValue: "webhook",
        description: "点击“测试通知”时优先使用的通道。",
        options: [
          { label: "通用Webhook", value: "webhook" },
          { label: "企业微信", value: "wechat" },
          { label: "钉钉", value: "dingtalk" },
          { label: "短信Webhook", value: "sms" },
          { label: "邮件Webhook", value: "email" }
        ]
      },
      { key: "test_receiver", label: "测试接收对象", type: "text", defaultValue: "system-test", description: "联调消息里附带的接收对象标识。" },
      { key: "timeout_ms", label: "超时(ms)", type: "number", defaultValue: 10000, description: "外部通知接口超时阈值。" },
      { key: "webhook_url", label: "通用 Webhook URL", type: "text", defaultValue: "", description: "未匹配到专用通道时的兜底 webhook。", span: true },
      { key: "wecom_webhook_url", label: "企业微信机器人 URL", type: "text", defaultValue: "", description: "用于 wechat 通道真实发送。", span: true },
      { key: "dingtalk_webhook_url", label: "钉钉机器人 URL", type: "text", defaultValue: "", description: "用于 dingtalk 通道真实发送。", span: true },
      { key: "sms_webhook_url", label: "短信 Webhook URL", type: "text", defaultValue: "", description: "对接短信发送网关。", span: true },
      { key: "email_webhook_url", label: "邮件 Webhook URL", type: "text", defaultValue: "", description: "对接邮件发送网关。", span: true }
    ]
  },
  {
    code: "permission_security",
    title: "权限安全配置",
    fields: [
      { key: "force_logout_on_sensitive_change", label: "高危权限变更强制下线", type: "boolean", defaultValue: true, description: "高危权限修改后立即失效旧会话。" },
      { key: "temporary_permission_notice_hours", label: "临时授权到期提醒(小时)", type: "number", defaultValue: 24, description: "提前多少小时提醒。" },
      { key: "expiry_notice_targets", label: "到期提醒对象", type: "list", defaultValue: ["admin", "ops"], description: "多个对象用逗号分隔。", span: true }
    ]
  },
  {
    code: "gateway",
    title: "网关配置",
    fields: [
      { key: "backfill_batch_size", label: "补传批量大小", type: "number", defaultValue: 200, description: "单批补传记录数。" },
      { key: "heartbeat_interval_seconds", label: "心跳间隔(秒)", type: "number", defaultValue: 60, description: "网关心跳上报周期。" },
      { key: "cache_upper_limit", label: "缓存上限", type: "number", defaultValue: 500, description: "离线缓存条数上限。" },
      {
        key: "time_sync_policy",
        label: "时间同步策略",
        type: "select",
        defaultValue: "ntp_preferred",
        description: "设备时间同步默认策略。",
        options: [
          { label: "优先 NTP", value: "ntp_preferred" },
          { label: "仅网关同步", value: "gateway_only" },
          { label: "手动维护", value: "manual" }
        ]
      }
    ]
  },
  {
    code: "media_storage",
    title: "媒体存储",
    fields: [
      {
        key: "storage_provider",
        label: "存储提供方",
        type: "select",
        defaultValue: "local",
        description: "建议后续切到对象存储，数据库只保留元数据和对象键。",
        options: [
          { label: "本地磁盘", value: "local" },
          { label: "腾讯云 COS", value: "cos" },
          { label: "阿里云 OSS", value: "oss" },
          { label: "MinIO", value: "minio" }
        ]
      },
      { key: "public_base_url", label: "公网访问前缀", type: "text", defaultValue: "", description: "例如 https://cdn.example.com，用于拼接对象键得到可访问 URL。", span: true },
      { key: "bucket_name", label: "Bucket 名称", type: "text", defaultValue: "", description: "对象存储 Bucket 名称，便于后续迁移和运维登记。" },
      { key: "region", label: "区域", type: "text", defaultValue: "", description: "例如 ap-shanghai / ap-guangzhou。" },
      { key: "path_prefix", label: "对象键前缀", type: "text", defaultValue: "tenant", description: "建议保持 tenant，统一形成 tenant/{tenantCode}/... 路径。" },
      { key: "local_root_path", label: "本地根目录", type: "text", defaultValue: "/data/agri-media", description: "本地兼容模式下的文件存放根目录。" },
      { key: "local_public_base_url", label: "本地公开前缀", type: "text", defaultValue: "", description: "如果后续用 Nginx 挂本地目录，可填写例如 https://domain/media。", span: true }
    ]
  },
  {
    code: "weather_provider",
    title: "天气服务",
    fields: [
      { key: "enabled", label: "启用天气服务", type: "boolean", defaultValue: true, description: "首页天气卡是否尝试拉取真实天气。" },
      {
        key: "provider_type",
        label: "服务提供方",
        type: "select",
        defaultValue: "open_meteo",
        description: "当前优先使用无需单独购买 key 的公共天气服务。",
        options: [
          { label: "Open-Meteo", value: "open_meteo" }
        ]
      },
      { key: "timeout_ms", label: "请求超时(ms)", type: "number", defaultValue: 8000, description: "天气接口单次请求超时阈值。" },
      { key: "current_cache_ttl_seconds", label: "实时天气缓存(秒)", type: "number", defaultValue: 900, description: "建议 10 到 30 分钟，减少第三方请求频率。" },
      { key: "stale_cache_ttl_seconds", label: "陈旧缓存保留(秒)", type: "number", defaultValue: 21600, description: "天气服务异常时允许展示的缓存有效期。" },
      { key: "geocoding_enabled", label: "启用地名解析", type: "boolean", defaultValue: true, description: "未配置经纬度时，尝试用天气定位名称解析坐标。" },
      { key: "geocoding_language", label: "地名解析语言", type: "text", defaultValue: "zh", description: "建议保持 zh，便于中文区域名解析。" },
      { key: "timezone", label: "天气服务时区", type: "text", defaultValue: "Asia/Shanghai", description: "建议与平台保持一致，统一为北京时间。" },
      {
        key: "temperature_unit",
        label: "温度单位",
        type: "select",
        defaultValue: "celsius",
        description: "决定天气卡的温度展示单位。",
        options: [
          { label: "摄氏度", value: "celsius" },
          { label: "华氏度", value: "fahrenheit" }
        ]
      },
      {
        key: "wind_speed_unit",
        label: "风速单位",
        type: "select",
        defaultValue: "kmh",
        description: "建议默认 km/h，便于统一阅读。",
        options: [
          { label: "km/h", value: "kmh" },
          { label: "m/s", value: "ms" },
          { label: "mph", value: "mph" },
          { label: "kn", value: "kn" }
        ]
      },
      {
        key: "precipitation_unit",
        label: "降水单位",
        type: "select",
        defaultValue: "mm",
        description: "建议默认毫米。",
        options: [
          { label: "毫米", value: "mm" },
          { label: "英寸", value: "inch" }
        ]
      }
    ]
  }
];

const SECTION_SUBGROUPS = {
  login_security: [
    {
      code: "rate_limit",
      title: "访问频率限制",
      description: "控制登录窗口期和最大尝试次数。",
      keys: ["rate_limit_enabled", "rate_limit_login_window_ms", "rate_limit_login_max"]
    },
    {
      code: "account_lock",
      title: "账号锁定",
      description: "连续输错密码后的临时锁定策略。",
      keys: ["login_lock_enabled", "login_failure_threshold", "login_lock_minutes"]
    }
  ],
  appearance: [
    {
      code: "theme",
      title: "主题样式",
      description: "统一后台主视觉颜色，与顶栏和移动端主题选择保持一致。",
      keys: ["theme_preset"]
    }
  ],
  control_safety: [
    {
      code: "runtime_guard",
      title: "执行限制",
      description: "限制单次执行时长和高危操作开关。",
      keys: ["max_run_seconds", "allow_force_control"]
    },
    {
      code: "conflict_policy",
      title: "冲突与补传",
      description: "控制补传阶段和互斥资源冲突时的默认处理方式。",
      keys: ["backfill_control_policy", "mutex_conflict_policy"]
    }
  ],
  ai_scheduler: [
    {
      code: "report_schedule",
      title: "自动报告",
      description: "控制日报、周报和事件诊断是否自动触发。",
      keys: ["auto_daily_report_enabled", "daily_report_time", "auto_weekly_report_enabled", "weekly_report_time", "event_diagnosis_enabled", "cooldown_minutes"]
    },
    {
      code: "queue_control",
      title: "任务队列",
      description: "控制 AI 并发、排队和失败重试。",
      keys: ["max_concurrency", "max_queue_size", "retry_count", "retry_interval_minutes"]
    }
  ],
  ai_provider: [
    {
      code: "provider_switch",
      title: "服务接入",
      description: "配置是否启用远程模型以及访问入口。",
      keys: ["enabled", "provider_type", "base_url", "api_key", "model"]
    },
    {
      code: "request_limits",
      title: "请求参数",
      description: "控制单次请求超时、随机性和长度。",
      keys: ["timeout_ms", "temperature", "max_tokens"]
    },
    {
      code: "prompting",
      title: "提示词",
      description: "定义 AI 分析输出风格和边界。",
      keys: ["system_prompt"]
    }
  ],
  notification_channel: [
    {
      code: "channel_base",
      title: "基础发送",
      description: "定义默认测试通道、接收对象和超时。",
      keys: ["sender_name", "default_test_channel", "test_receiver", "timeout_ms"]
    },
    {
      code: "webhook_targets",
      title: "Webhook 地址",
      description: "维护各类通知通道实际调用的 webhook 地址。",
      keys: ["webhook_url", "wecom_webhook_url", "dingtalk_webhook_url", "sms_webhook_url", "email_webhook_url"]
    }
  ],
  media_storage: [
    {
      code: "storage_base",
      title: "存储接入",
      description: "选择存储提供方和对象存储基本信息。",
      keys: ["storage_provider", "bucket_name", "region", "path_prefix"]
    },
    {
      code: "access_path",
      title: "访问与路径",
      description: "配置公网访问前缀和本地兼容模式目录。",
      keys: ["public_base_url", "local_root_path", "local_public_base_url"]
    }
  ],
  weather_provider: [
    {
      code: "weather_base",
      title: "基础接入",
      description: "控制天气功能是否启用以及服务提供方。",
      keys: ["enabled", "provider_type", "timeout_ms"]
    },
    {
      code: "weather_cache",
      title: "缓存与解析",
      description: "控制缓存、地名解析和时区。",
      keys: ["current_cache_ttl_seconds", "stale_cache_ttl_seconds", "geocoding_enabled", "geocoding_language", "timezone"]
    },
    {
      code: "weather_units",
      title: "展示单位",
      description: "统一天气卡温度、风速、降水的展示单位。",
      keys: ["temperature_unit", "wind_speed_unit", "precipitation_unit"]
    }
  ]
};

function buildSectionSubgroups(section) {
  const definitions = SECTION_SUBGROUPS[section.code];
  if (!definitions?.length) {
    return [
      {
        code: "default",
        title: section.title,
        description: "",
        fields: section.fields
      }
    ];
  }

  const usedKeys = new Set();
  const subgroups = definitions
    .map((definition) => {
      const fields = definition.keys
        .map((key) => section.fields.find((field) => field.key === key))
        .filter(Boolean);
      fields.forEach((field) => usedKeys.add(field.key));
      return fields.length
        ? {
          code: definition.code,
          title: definition.title,
          description: definition.description,
          fields
        }
        : null;
    })
    .filter(Boolean);

  const remainingFields = section.fields.filter((field) => !usedKeys.has(field.key));
  if (remainingFields.length > 0) {
    subgroups.push({
      code: "misc",
      title: "其他配置",
      description: "当前分组下未归类的补充项。",
      fields: remainingFields
    });
  }

  return subgroups;
}

const CONFIG_SECTIONS = RAW_CONFIG_SECTIONS.map((section) => ({
  ...section,
  fields: section.fields.map((field) => ({
    ...field,
    formKey: `${section.code}.${field.key}`
  })),
  subgroups: []
}));

CONFIG_SECTIONS.forEach((section) => {
  section.subgroups = buildSectionSubgroups(section);
});

const loading = ref(false);
const saving = ref(false);
const message = ref("");
const errorMessage = ref("");
const testResult = ref(null);
const formValues = reactive({});
const baselineSnapshot = ref("{}");
const activeSectionCode = ref(CONFIG_SECTIONS[0]?.code || "");
const searchQuery = ref("");
let scrollTicking = false;

const canEdit = hasPermission("system:config");
const totalFieldCount = CONFIG_SECTIONS.reduce((sum, section) => sum + section.fields.length, 0);
const filteredSections = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase();
  if (!keyword) {
    return CONFIG_SECTIONS;
  }

  return CONFIG_SECTIONS.filter((section) => {
    const haystack = [
      section.code,
      section.title,
      ...section.fields.flatMap((field) => [field.key, field.label, field.description || ""])
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(keyword);
  });
});
const visibleFieldCount = computed(() =>
  filteredSections.value.reduce((sum, section) => sum + section.fields.length, 0)
);
const changedFieldCount = computed(() => {
  const baseline = JSON.parse(baselineSnapshot.value || "{}");
  let count = 0;
  CONFIG_SECTIONS.forEach((section) => {
    section.fields.forEach((field) => {
      const currentValue = encodeFieldValue(field, formValues[field.formKey]);
      const baselineValue = baseline[field.formKey];
      if (JSON.stringify(currentValue) !== JSON.stringify(baselineValue)) {
        count += 1;
      }
    });
  });
  return count;
});
let removeThemeListener = null;
const hasUnsavedChanges = computed(() => changedFieldCount.value > 0);

function sectionLead(section) {
  const leads = {
    login_security: "控制后台登录限流、失败锁定和管理员解锁时的实际生效策略。",
    base: "维护平台基础名称、时区和数据生命周期等全局运行参数。",
    appearance: "统一后台主题颜色，系统设置、顶栏和移动端应始终保持同一个主题值。",
    alerts: "定义规则默认告警级别、恢复策略和重开升级阈值。",
    control_safety: "约束执行器控制风险、互斥冲突和补传期间的安全行为。",
    ai_scheduler: "配置 AI 日报、周报、诊断调度与任务并发策略。",
    ai_provider: "维护远程模型服务接入参数与提示词边界。",
    notification_channel: "配置企业微信、钉钉和 Webhook 等真实通知通道。",
    permission_security: "设置权限变更后的会话处理和临时授权提醒策略。",
    gateway: "维护网关心跳、补传和时间同步等现场接入参数。",
    media_storage: "统一定义图片、抓图和后续录像的存储提供方、访问前缀和对象键规范。",
    weather_provider: "配置首页天气卡的真实天气源、缓存时长和地名解析行为。"
  };
  return leads[section.code] || "维护该模块的默认运行参数。";
}

function focusSection(sectionCode) {
  activeSectionCode.value = sectionCode;
  document.getElementById(`settings-section-${sectionCode}`)?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function updateActiveSectionByScroll() {
  const offsetTop = 150;
  let nextActiveSectionCode = filteredSections.value[0]?.code || "";

  for (const section of filteredSections.value) {
    const element = document.getElementById(`settings-section-${section.code}`);
    if (!element) {
      continue;
    }
    const { top } = element.getBoundingClientRect();
    if (top <= offsetTop) {
      nextActiveSectionCode = section.code;
    } else {
      break;
    }
  }

  activeSectionCode.value = nextActiveSectionCode;
}

function handleScroll() {
  if (scrollTicking) {
    return;
  }

  scrollTicking = true;
  window.requestAnimationFrame(() => {
    updateActiveSectionByScroll();
    scrollTicking = false;
  });
}

const activeSectionTitle = computed(() => {
  const section = filteredSections.value.find((item) => item.code === activeSectionCode.value)
    || CONFIG_SECTIONS.find((item) => item.code === activeSectionCode.value);
  return section?.title || (filteredSections.value[0]?.title || "系统设置");
});
const activeSectionPositionText = computed(() => {
  if (filteredSections.value.length === 0) {
    return "0 / 0";
  }
  const index = filteredSections.value.findIndex((item) => item.code === activeSectionCode.value);
  return `${index >= 0 ? index + 1 : 1} / ${filteredSections.value.length}`;
});

function normalizeFieldValue(field, value) {
  if (field.type === "boolean") {
    return Boolean(value);
  }
  if (field.type === "number") {
    return Number(value ?? field.defaultValue) || 0;
  }
  if (field.type === "list") {
    return Array.isArray(value) ? value.join(", ") : Array.isArray(field.defaultValue) ? field.defaultValue.join(", ") : "";
  }
  return value ?? field.defaultValue ?? "";
}

function encodeFieldValue(field, value) {
  if (field.type === "boolean") {
    return Boolean(value);
  }
  if (field.type === "number") {
    return Number(value) || 0;
  }
  if (field.type === "list") {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value ?? "";
}

function applyDefaults() {
  CONFIG_SECTIONS.forEach((section) => {
    section.fields.forEach((field) => {
      formValues[field.formKey] = normalizeFieldValue(field, field.defaultValue);
    });
  });
}

function captureConfigSnapshot() {
  const snapshot = {};
  CONFIG_SECTIONS.forEach((section) => {
    section.fields.forEach((field) => {
      snapshot[field.formKey] = encodeFieldValue(field, formValues[field.formKey]);
    });
  });
  return snapshot;
}

function restoreDefaults() {
  applyDefaults();
  message.value = "已恢复到默认表单值，保存后才会写入数据库";
}

async function loadConfigs() {
  loading.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    applyDefaults();
    const rows = await apiRequest("/api/v1/system/configs");
    rows.forEach((row) => {
      const section = CONFIG_SECTIONS.find((item) => item.code === row.configGroup);
      const field = section?.fields.find((item) => item.key === row.configKey);
      if (!field) {
        return;
      }
      formValues[field.formKey] = normalizeFieldValue(field, row.configValueJson);
    });
    const resolvedThemePreset = formValues["appearance.theme_preset"];
    if (resolvedThemePreset) {
      applyThemePreset(resolvedThemePreset);
    }
    baselineSnapshot.value = JSON.stringify(captureConfigSnapshot());
    await nextTick();
    updateActiveSectionByScroll();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function saveConfigs() {
  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const items = CONFIG_SECTIONS.flatMap((section) =>
      section.fields.map((field) => ({
        configGroup: section.code,
        configKey: field.key,
        configName: field.label,
        configValueJson: encodeFieldValue(field, formValues[field.formKey]),
        description: field.description
      }))
    );

    await apiRequest("/api/v1/system/configs", {
      method: "PUT",
      body: JSON.stringify({ items })
    });

    const resolvedThemePreset = formValues["appearance.theme_preset"];
    if (resolvedThemePreset) {
      applyThemePreset(resolvedThemePreset);
    }
    message.value = "系统设置已保存";
    await loadConfigs();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

async function runTest(target) {
  errorMessage.value = "";
  message.value = "";
  try {
    testResult.value = await apiRequest(`/api/v1/system/test/${target}`, {
      method: "POST",
      body: JSON.stringify({})
    });
    message.value = "联调测试已完成";
  } catch (error) {
    errorMessage.value = error.message;
  }
}

watch(
  () => formValues["appearance.theme_preset"],
  (value) => {
    if (value) {
      applyThemePreset(value);
    }
  }
);

watch(filteredSections, async (sections) => {
  if (sections.length === 0) {
    activeSectionCode.value = "";
    return;
  }
  if (!sections.some((item) => item.code === activeSectionCode.value)) {
    activeSectionCode.value = sections[0].code;
  }
  await nextTick();
  updateActiveSectionByScroll();
});

onMounted(loadConfigs);

onMounted(async () => {
  const handleThemeChange = () => {
    const currentThemePreset = getStoredThemePreset();
    if (formValues["appearance.theme_preset"] !== currentThemePreset) {
      formValues["appearance.theme_preset"] = currentThemePreset;
    }
  };
  window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  removeThemeListener = () => {
    window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  };
  await nextTick();
  updateActiveSectionByScroll();
  window.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("resize", handleScroll);
});

onBeforeUnmount(() => {
  removeThemeListener?.();
  window.removeEventListener("scroll", handleScroll);
  window.removeEventListener("resize", handleScroll);
});
</script>
