// @ts-check

const menuCatalog = [
  {
    code: "workspace",
    title: "工作台",
    children: [
      { code: "dashboard", title: "总览大屏", path: "/dashboard/overview", priority: "P0" },
      { code: "monitor", title: "实时监控", path: "/monitor/realtime", priority: "P0" },
      { code: "history", title: "历史分析", path: "/monitor/history", priority: "P0" },
      { code: "camera_timeline", title: "历史图片时间轴", path: "/monitor/camera-timeline", priority: "P2" }
    ]
  },
  {
    code: "device_center",
    title: "设备中心",
    children: [
      { code: "areas", title: "区域管理", path: "/devices/areas", priority: "P0" },
      { code: "gateways", title: "网关设备管理", path: "/devices/gateways", priority: "P0" },
      { code: "sensors", title: "传感器管理", path: "/devices/sensors", priority: "P0" },
      { code: "actuators", title: "执行器管理", path: "/devices/actuators", priority: "P0" },
      { code: "media_nodes", title: "媒体节点管理", path: "/devices/media-nodes", priority: "P2" },
      { code: "cameras", title: "摄像头管理", path: "/devices/cameras", priority: "P2" },
      { code: "capture_plans", title: "抓图计划", path: "/devices/capture-plans", priority: "P1" },
      { code: "capture_jobs", title: "抓图任务", path: "/devices/capture-jobs", priority: "P2" },
      { code: "device_shadow", title: "设备影子状态", path: "/devices/shadow", priority: "P2" }
    ]
  },
  {
    code: "control_center",
    title: "控制中心",
    children: [
      { code: "manual_control", title: "手动控制", path: "/controls/manual", priority: "P0" },
      { code: "automation_policy", title: "自动控制策略", path: "/controls/policies", priority: "P1" },
      { code: "control_logs", title: "控制记录", path: "/controls/logs", priority: "P1" }
    ]
  },
  {
    code: "rules_alerts",
    title: "规则与告警",
    children: [
      { code: "rule_engine", title: "规则引擎", path: "/rules/engine", priority: "P1" },
      { code: "alert_center", title: "告警中心", path: "/alerts/center", priority: "P0" },
      { code: "notification_logs", title: "通知记录", path: "/alerts/notifications", priority: "P2" }
    ]
  },
  {
    code: "intelligence",
    title: "智能分析",
    children: [
      { code: "ai_diagnosis", title: "AI诊断", path: "/ai/diagnosis", priority: "P1" },
      { code: "ai_reports", title: "AI日报/周报", path: "/ai/reports", priority: "P1" },
      { code: "ai_tasks", title: "AI任务队列", path: "/ai/tasks", priority: "P2" }
    ]
  },
  {
    code: "system",
    title: "系统管理",
    children: [
      { code: "tenants", title: "租户管理", path: "/system/tenants", priority: "P0" },
      { code: "users", title: "用户管理", path: "/system/users", priority: "P0" },
      { code: "roles", title: "角色管理", path: "/system/roles", priority: "P1" },
      { code: "permissions", title: "权限管理", path: "/system/permissions", priority: "P0" },
      { code: "audit_logs", title: "操作日志", path: "/system/audit-logs", priority: "P0" },
      { code: "device_credentials", title: "设备接入凭证", path: "/system/device-credentials", priority: "P1" },
      { code: "system_health", title: "系统健康", path: "/system/health", priority: "P1" },
      { code: "settings", title: "系统设置", path: "/system/settings", priority: "P1" },
      { code: "metrics_catalog", title: "指标字典", path: "/system/metrics", priority: "P1" }
    ]
  }
];

const permissionCatalog = [
  "dashboard:view",
  "monitor:view",
  "history:view",
  "alert:view",
  "ai:view",
  "device:view",
  "control:view",
  "area:add",
  "area:edit",
  "area:delete",
  "device:add",
  "device:edit",
  "device:delete",
  "sensor:edit",
  "sensor:calibrate",
  "sensor:test_read",
  "actuator:control",
  "actuator:force_control",
  "actuator:emergency_stop",
  "control:batch",
  "mode:switch",
  "gateway:reboot",
  "gateway:params_push",
  "gateway:backfill_trigger",
  "gateway:cache_clear",
  "gateway:firmware_upgrade",
  "alert:assign",
  "alert:confirm",
  "alert:process",
  "alert:close",
  "alert:reopen",
  "rule:view",
  "rule:edit",
  "rule:advanced_edit",
  "ai:trigger",
  "ai:report_generate",
  "ai:report_export",
  "tenant:manage",
  "user:manage",
  "role:manage",
  "permission:manage",
  "system:config",
  "audit:view"
];

module.exports = {
  menuCatalog,
  permissionCatalog
};
