export type ModulePriority = "P0" | "P1" | "P2";

export interface ModulePage {
  code: string;
  title: string;
  path: string;
  priority: ModulePriority;
  purpose: string;
  fields: string[];
  actions: string[];
  permissions: string[];
}

export interface ModuleGroup {
  code: string;
  title: string;
  pages: ModulePage[];
}

export interface NavigationDomain {
  code: string;
  title: string;
  shortTitle: string;
  summary: string;
  groupCodes: string[];
}

export interface DomainSummary {
  code: string;
  title: string;
  shortTitle: string;
  summary: string;
}

export interface FlatModule extends ModulePage {
  groupCode: string;
  groupTitle: string;
  domainCode: string;
  domainTitle: string;
  domainShortTitle: string;
  domainSummary: string;
}

export interface VisibleModuleGroup extends ModuleGroup {}

export interface VisibleNavigationDomain extends NavigationDomain {
  groups: VisibleModuleGroup[];
  pageCount: number;
  targetPath: string;
}

export const moduleGroups: ModuleGroup[] = [
  {
    code: "workspace",
    title: "运行态势",
    pages: [
      {
        code: "dashboard_overview",
        title: "总览大屏",
        path: "/dashboard/overview",
        priority: "P0",
        purpose: "展示系统整体运行状态、今日控制、告警与 AI 建议。",
        fields: ["在线设备数", "离线设备数", "未处理告警数", "今日控制次数", "补传批次数", "AI 今日建议"],
        actions: ["刷新", "区域筛选", "查看 AI 诊断", "导出总览报表"],
        permissions: ["dashboard:view"]
      },
      {
        code: "monitor_realtime",
        title: "实时监控",
        path: "/monitor/realtime",
        priority: "P0",
        purpose: "查看传感器与执行器当前状态，显式展示数据来源和时间可信度。",
        fields: ["当前值", "单位", "采集时间", "接收时间", "数据来源", "时间可信度", "阈值状态"],
        actions: ["自动刷新", "手动刷新", "区域筛选", "查看历史曲线", "导出当前数据"],
        permissions: ["monitor:view"]
      },
      {
        code: "monitor_history",
        title: "历史分析",
        path: "/monitor/history",
        priority: "P0",
        purpose: "分析长期趋势、补传情况和低可信数据。",
        fields: ["时间范围", "聚合粒度", "数据来源", "时间可信度", "平均值", "波动范围"],
        actions: ["查询", "导出 CSV", "导出 Excel", "仅看补传数据", "隐藏低可信数据"],
        permissions: ["history:view"]
      },
      {
        code: "camera_timeline",
        title: "历史图片时间轴",
        path: "/monitor/camera-timeline",
        priority: "P2",
        purpose: "查看手动抓图、定时抓图、事件抓图和 FTP 上传图片的时间轴。",
        fields: ["摄像头", "区域", "来源类型", "拍摄时间", "接收时间", "存储位置"],
        actions: ["筛选", "查看详情", "按时间轴浏览", "查看原始路径"],
        permissions: ["history:view"]
      }
    ]
  },
  {
    code: "field_assets",
    title: "设备档案",
    pages: [
      {
        code: "areas",
        title: "区域管理",
        path: "/devices/areas",
        priority: "P0",
        purpose: "管理农场、温室、地块、实验区等业务区域。",
        fields: ["区域编号", "区域名称", "面积", "作物类型", "生长阶段", "负责人"],
        actions: ["新增区域", "编辑区域", "删除区域", "绑定设备", "查看监控"],
        permissions: ["device:view", "area:add", "area:edit", "area:delete"]
      },
      {
        code: "gateways",
        title: "网关设备管理",
        path: "/devices/gateways",
        priority: "P0",
        purpose: "管理 ESP32 / 网关的接入、补传、控制可用性和固件状态。",
        fields: ["设备编号", "固件版本", "最近心跳时间", "WiFi 信号", "离线缓存条数", "补传状态"],
        actions: ["新增设备", "编辑设备", "远程重启", "参数下发", "触发立即补传", "固件升级"],
        permissions: ["device:view", "device:add", "device:edit", "gateway:reboot", "gateway:params_push", "gateway:backfill_trigger", "gateway:firmware_upgrade"]
      },
      {
        code: "firmware_packages",
        title: "固件包管理",
        path: "/devices/firmware/packages",
        priority: "P1",
        purpose: "维护 ESP32 固件版本、下载地址、摘要和发布状态，作为远程升级基线。",
        fields: ["固件包编号", "固件版本", "设备类型", "文件大小", "SHA256", "发布状态"],
        actions: ["新增固件包", "查看摘要", "复制下载地址", "按状态筛选"],
        permissions: ["device:view", "gateway:firmware_upgrade"]
      },
      {
        code: "firmware_jobs",
        title: "固件升级任务",
        path: "/devices/firmware/jobs",
        priority: "P1",
        purpose: "给网关下发升级任务，并查看下载、刷写和最终版本回报。",
        fields: ["任务编号", "网关设备", "当前版本", "目标版本", "任务状态", "最后回报时间"],
        actions: ["创建升级任务", "按网关筛选", "查看失败原因", "查看请求摘要"],
        permissions: ["device:view", "gateway:firmware_upgrade"]
      },
      {
        code: "gateway_templates",
        title: "设备模板",
        path: "/devices/templates",
        priority: "P1",
        purpose: "维护 ESP32 默认参数模板，为网关配置提供统一基线。",
        fields: ["模板编号", "模板名称", "云端地址", "采样周期", "RS485 参数", "GPIO 定义"],
        actions: ["新增模板", "编辑模板", "删除模板", "查看摘要"],
        permissions: ["device:view", "device:add", "device:edit", "device:delete"]
      },
      {
        code: "sensors",
        title: "传感器管理",
        path: "/devices/sensors",
        priority: "P0",
        purpose: "管理环境和土壤传感器，支持校准与测试读取。",
        fields: ["传感器编号", "类型", "Modbus 地址", "当前值", "校准状态", "数据质量评分"],
        actions: ["新增传感器", "编辑传感器", "手动校准", "测试读取", "查看曲线"],
        permissions: ["device:view", "sensor:edit", "sensor:calibrate", "sensor:test_read"]
      },
      {
        code: "actuators",
        title: "执行器管理",
        path: "/devices/actuators",
        priority: "P0",
        purpose: "管理执行器及其 Device Shadow 视图。",
        fields: ["执行器编号", "类型", "期望状态", "实际状态", "Shadow 状态", "最大运行时长"],
        actions: ["编辑执行器", "手动开启", "手动关闭", "紧急停止", "重新同步状态"],
        permissions: ["device:view", "actuator:control", "actuator:emergency_stop"]
      }
    ]
  },
  {
    code: "camera_ops",
    title: "摄像头与抓图",
    pages: [
      {
        code: "cameras",
        title: "摄像头管理",
        path: "/devices/cameras",
        priority: "P1",
        purpose: "管理 WiFi/IPC 摄像头、流地址、抓图开关和录像开关。",
        fields: ["摄像头编号", "所属区域", "所属网关", "主流协议", "在线状态", "抓图开关", "录像开关"],
        actions: ["新增摄像头", "编辑摄像头", "删除摄像头", "测试 RTSP", "查看图片时间轴"],
        permissions: ["device:view", "device:add", "device:edit", "device:delete"]
      },
      {
        code: "capture_plans",
        title: "抓图计划",
        path: "/devices/capture-plans",
        priority: "P1",
        purpose: "配置固定间隔和每日定时抓图计划，支持立即执行和状态回看。",
        fields: ["计划编号", "计划名称", "摄像头", "调度方式", "下一次执行", "最近成功", "最近错误"],
        actions: ["新建计划", "编辑计划", "启停计划", "立即执行一次", "删除计划"],
        permissions: ["device:view", "device:edit"]
      },
      {
        code: "capture_jobs",
        title: "抓图任务",
        path: "/devices/capture-jobs",
        priority: "P1",
        purpose: "管理手动抓图、模拟 FTP 接收和抓图结果闭环。",
        fields: ["任务编号", "摄像头", "触发方式", "抓图用途", "状态", "完成时间"],
        actions: ["手动抓图", "模拟 FTP 接收", "查看抓图结果", "刷新"],
        permissions: ["device:view", "device:edit", "history:view"]
      },
      {
        code: "media_nodes",
        title: "媒体节点管理",
        path: "/devices/media-nodes",
        priority: "P2",
        purpose: "管理 RTSP 拉流、RTMP/HLS 转发、FTP 接收等媒体服务节点。",
        fields: ["节点编号", "节点类型", "主机地址", "API 地址", "HLS 地址", "健康状态"],
        actions: ["新增节点", "编辑节点", "删除节点", "查看健康状态"],
        permissions: ["device:view", "device:add", "device:edit", "device:delete"]
      },
      {
        code: "device_shadow",
        title: "设备影子状态",
        path: "/devices/shadow",
        priority: "P2",
        purpose: "专门查看期望状态、实际状态和一致性偏差。",
        fields: ["期望状态", "实际状态", "Shadow 状态", "状态偏差持续时长", "最后状态回传时间"],
        actions: ["刷新状态", "重新同步", "导出状态差异记录"],
        permissions: ["device:view", "monitor:view"]
      }
    ]
  },
  {
    code: "control_center",
    title: "控制与联动",
    pages: [
      {
        code: "manual_control",
        title: "手动控制",
        path: "/controls/manual",
        priority: "P0",
        purpose: "对执行器进行人工控制，并显示回执、补传风险和 Shadow 偏差。",
        fields: ["控制可用性", "期望状态", "实际状态", "安全状态", "是否处于自动模式", "补传状态提示"],
        actions: ["开启", "关闭", "立即停止", "批量控制", "强制控制", "切换手动/自动"],
        permissions: ["actuator:control", "actuator:force_control", "actuator:emergency_stop", "control:batch", "mode:switch"]
      },
      {
        code: "automation_policy",
        title: "自动控制策略",
        path: "/controls/policies",
        priority: "P1",
        purpose: "定义自动控制编排逻辑和冷却策略。",
        fields: ["策略编号", "触发条件摘要", "动作摘要", "冷却时间", "每日最大执行次数", "优先级"],
        actions: ["新增策略", "编辑策略", "启用", "停用", "测试策略"],
        permissions: ["rule:view", "rule:edit"]
      },
      {
        code: "control_logs",
        title: "控制记录",
        path: "/controls/logs",
        priority: "P1",
        purpose: "审计每条控制指令的下发、执行与结果。",
        fields: ["指令编号", "来源", "期望状态", "实际状态", "执行结果", "失败原因", "完成时间"],
        actions: ["查询", "查看详情", "导出记录"],
        permissions: ["control:view", "actuator:control", "control:batch", "mode:switch"]
      }
    ]
  },
  {
    code: "alerts_rules",
    title: "规则与告警",
    pages: [
      {
        code: "rule_engine",
        title: "规则引擎",
        path: "/rules/engine",
        priority: "P1",
        purpose: "配置规则、恢复策略和联动动作，支持可视化构建器和高级模式。",
        fields: ["规则类型", "监测对象", "条件摘要", "动作摘要", "恢复策略", "优先级"],
        actions: ["新建规则", "编辑规则", "启用/停用", "模拟测试", "切换高级模式"],
        permissions: ["rule:view", "rule:edit", "rule:advanced_edit"]
      },
      {
        code: "alert_center",
        title: "告警中心",
        path: "/alerts/center",
        priority: "P0",
        purpose: "统一查看和处理告警，支持完整告警状态机。",
        fields: ["告警标题", "告警级别", "区域", "设备", "触发时间", "当前状态", "指派处理人"],
        actions: ["指派处理人", "确认告警", "开始处理", "挂起", "忽略", "关闭", "重新打开"],
        permissions: ["alert:view", "alert:assign", "alert:confirm", "alert:process", "alert:close", "alert:reopen"]
      },
      {
        code: "notification_logs",
        title: "通知记录",
        path: "/alerts/notifications",
        priority: "P2",
        purpose: "查看短信、邮件、微信和站内通知发送情况。",
        fields: ["通知类型", "接收人", "发送时间", "发送状态", "重试次数", "内容摘要"],
        actions: ["查看详情", "重发通知", "导出记录"],
        permissions: ["alert:view"]
      }
    ]
  },
  {
    code: "intelligence",
    title: "智能分析",
    pages: [
      {
        code: "ai_diagnosis",
        title: "AI诊断",
        path: "/ai/diagnosis",
        priority: "P1",
        purpose: "查看 AI 对异常和运行状态的诊断结论。",
        fields: ["触发方式", "覆盖区域", "关联设备数", "关联告警数", "AI 结论", "风险等级", "建议动作"],
        actions: ["发起分析", "重新分析", "采纳建议", "忽略建议", "导出分析结果"],
        permissions: ["ai:view", "ai:trigger"]
      },
      {
        code: "ai_reports",
        title: "AI日报/周报",
        path: "/ai/reports",
        priority: "P1",
        purpose: "展示 AI 自动生成的日报、周报和诊断报告版本。",
        fields: ["报告类型", "报告日期", "版本号", "生成状态", "指标摘要", "异常统计", "AI 总结"],
        actions: ["立即生成", "重新生成", "导出 PDF", "导出 Word", "发送报告"],
        permissions: ["ai:view", "ai:report_generate", "ai:report_export"]
      },
      {
        code: "crop_knowledge",
        title: "作物知识库",
        path: "/ai/crop-knowledge",
        priority: "P1",
        purpose: "维护作物、品种、生长阶段和目标区间，并按区域生成推荐建议。",
        fields: ["作物品类", "作物品种", "生长阶段", "推荐区间", "当前值", "建议摘要"],
        actions: ["查看区域建议", "维护知识库", "维护推荐目标", "绑定区域作物"],
        permissions: ["monitor:view", "device:view", "system:config"]
      },
      {
        code: "ai_tasks",
        title: "AI任务队列",
        path: "/ai/tasks",
        priority: "P2",
        purpose: "查看 AI 调度、去重、重试和排队情况。",
        fields: ["任务编号", "触发方式", "聚合键", "状态", "重试次数", "创建时间", "完成时间"],
        actions: ["查看详情", "手动重试", "取消任务", "查看去重原因"],
        permissions: ["ai:view"]
      }
    ]
  },
  {
    code: "platform_ops",
    title: "平台治理",
    pages: [
      {
        code: "tenants",
        title: "租户管理",
        path: "/system/tenants",
        priority: "P0",
        purpose: "管理 SaaS 租户主档、登录入口和默认租户指向。",
        fields: ["租户编码", "租户名称", "租户标识", "租户类型", "状态", "到期时间", "联系人"],
        actions: ["新增租户", "编辑租户", "启用/停用", "设为默认租户"],
        permissions: ["tenant:manage"]
      },
      {
        code: "device_credentials",
        title: "设备接入凭证",
        path: "/system/device-credentials",
        priority: "P1",
        purpose: "集中管理设备上报与控制轮询使用的接入令牌，支持查看、复制和重新生成。",
        fields: ["当前令牌掩码", "生效来源", "最近更新时间", "最近操作人"],
        actions: ["查看当前 Token", "复制 Token", "重新生成 Token"],
        permissions: ["system:config"]
      },
      {
        code: "system_health",
        title: "系统健康",
        path: "/system/health",
        priority: "P1",
        purpose: "查看 API、MySQL、磁盘、备份和关键业务链路状态，作为上线运维入口。",
        fields: ["总体状态", "API 运行时长", "MySQL 响应", "磁盘占用", "最近备份", "失败操作"],
        actions: ["刷新状态", "查看备份文件", "查看运行时信息"],
        permissions: ["system:config", "audit:view"]
      },
      {
        code: "settings",
        title: "系统设置",
        path: "/system/settings",
        priority: "P1",
        purpose: "管理平台级基础配置、告警配置、控制安全配置和 AI 调度配置。",
        fields: ["平台名称", "默认时区", "补传期间控制策略", "AI 最大并发任务数", "时间同步策略"],
        actions: ["保存设置", "恢复默认", "测试通知", "测试 AI 服务", "测试设备连接"],
        permissions: ["system:config"]
      },
      {
        code: "metrics_catalog",
        title: "指标字典",
        path: "/system/metrics",
        priority: "P1",
        purpose: "维护通用指标字典，供传感器、规则引擎、总览图表和 AI 摘要统一复用。",
        fields: ["指标编码", "指标名称", "分类", "单位", "正常范围", "预警范围", "图表颜色"],
        actions: ["新增指标", "编辑指标", "启用/禁用", "调整排序"],
        permissions: ["system:config"]
      },
      {
        code: "audit_logs",
        title: "操作日志",
        path: "/system/audit-logs",
        priority: "P0",
        purpose: "审计所有关键操作和控制行为。",
        fields: ["操作模块", "操作类型", "操作人", "IP", "目标对象", "结果", "详情"],
        actions: ["查询", "查看详情", "导出日志"],
        permissions: ["audit:view"]
      }
    ]
  },
  {
    code: "identity_security",
    title: "账号与权限",
    pages: [
      {
        code: "users",
        title: "用户管理",
        path: "/system/users",
        priority: "P0",
        purpose: "管理用户、角色、数据范围和特殊授权。",
        fields: ["用户名", "姓名", "手机号", "邮箱", "所属角色", "数据范围", "最后登录时间"],
        actions: ["新增用户", "编辑用户", "删除用户", "重置密码", "设置特殊授权"],
        permissions: ["user:manage"]
      },
      {
        code: "roles",
        title: "角色管理",
        path: "/system/roles",
        priority: "P1",
        purpose: "管理角色模板和默认权限集。",
        fields: ["角色名称", "角色编码", "描述", "状态", "创建时间"],
        actions: ["新增角色", "编辑角色", "分配页面权限", "分配按钮权限", "分配 API 权限"],
        permissions: ["role:manage"]
      },
      {
        code: "permissions",
        title: "权限管理",
        path: "/system/permissions",
        priority: "P0",
        purpose: "管理权限点、用户覆盖和临时授权，确保高危权限即时生效。",
        fields: ["角色权限", "用户特殊授权", "高危权限变更记录", "生效时间", "失效时间"],
        actions: ["配置角色权限", "设置临时授权", "取消授权", "导出权限记录"],
        permissions: ["permission:manage"]
      }
    ]
  }
];

export const navigationDomains: NavigationDomain[] = [
  {
    code: "operations",
    title: "运行中心",
    shortTitle: "运行",
    summary: "聚焦总览、实时态势、历史趋势和图片时间轴。",
    groupCodes: ["workspace"]
  },
  {
    code: "field",
    title: "现场设备",
    shortTitle: "设备",
    summary: "管理现场资源、设备档案、控制动作和运行回执。",
    groupCodes: ["field_assets", "camera_ops", "control_center"]
  },
  {
    code: "intelligence_ops",
    title: "智能与告警",
    shortTitle: "智能",
    summary: "统一收敛规则、告警、通知和 AI 分析闭环。",
    groupCodes: ["alerts_rules", "intelligence"]
  },
  {
    code: "platform",
    title: "平台管理",
    shortTitle: "平台",
    summary: "处理租户、权限、凭证、设置和平台级治理能力。",
    groupCodes: ["platform_ops", "identity_security"]
  }
];

const domainByGroupCode = new Map<string, DomainSummary>(
  navigationDomains.flatMap((domain) =>
    domain.groupCodes.map((groupCode) => [
      groupCode,
      {
        code: domain.code,
        title: domain.title,
        shortTitle: domain.shortTitle,
        summary: domain.summary
      }
    ])
  )
);

export const flatModules: FlatModule[] = moduleGroups.flatMap((group) =>
  group.pages.map((page) => ({
    ...page,
    groupCode: group.code,
    groupTitle: group.title,
    domainCode: domainByGroupCode.get(group.code)?.code || "operations",
    domainTitle: domainByGroupCode.get(group.code)?.title || "运行中心",
    domainShortTitle: domainByGroupCode.get(group.code)?.shortTitle || "运行",
    domainSummary: domainByGroupCode.get(group.code)?.summary || ""
  }))
);

export function findModuleByPath(path: string): FlatModule | null {
  return flatModules.find((item) => item.path === path) || null;
}

export function canAccessModule(module: { permissions?: string[] } | null, permissionCodes: string[] = []): boolean {
  if (!module) {
    return false;
  }
  if (!Array.isArray(module.permissions) || module.permissions.length === 0) {
    return true;
  }

  const granted = new Set(permissionCodes || []);
  return module.permissions.some((permissionCode) => granted.has(permissionCode));
}

export function getVisibleModuleGroups(permissionCodes: string[] = []): VisibleModuleGroup[] {
  return moduleGroups
    .map((group) => ({
      ...group,
      pages: group.pages.filter((page) => canAccessModule(page, permissionCodes))
    }))
    .filter((group) => group.pages.length > 0);
}

export function getVisibleNavigationDomains(permissionCodes: string[] = []): VisibleNavigationDomain[] {
  const visibleGroups = getVisibleModuleGroups(permissionCodes);

  return navigationDomains
    .map((domain) => {
      const groups = domain.groupCodes
        .map((groupCode) => visibleGroups.find((group) => group.code === groupCode))
        .filter(Boolean)
        .map((group) => ({ ...group }));

      const pages = groups.flatMap((group) => group.pages);

      return {
        ...domain,
        groups,
        pageCount: pages.length,
        targetPath: pages[0]?.path || "/forbidden"
      };
    })
    .filter((domain) => domain.pageCount > 0);
}

export function getPreferredDomainCode(permissionCodes: string[] = []): string {
  const granted = new Set(permissionCodes || []);

  const hasAny = (codes: string[]) => codes.some((code) => granted.has(code));

  if (hasAny(["tenant:manage", "user:manage", "role:manage", "permission:manage", "system:config", "audit:view"])) {
    return "platform";
  }

  if (hasAny(["dashboard:view", "monitor:view", "history:view"])) {
    return "operations";
  }

  if (hasAny(["device:view", "actuator:control", "control:view", "mode:switch"])) {
    return "field";
  }

  if (hasAny(["alert:view", "rule:view", "ai:view"])) {
    return "intelligence_ops";
  }

  return "operations";
}

export function findDomainByPath(path: string, permissionCodes: string[] = []): VisibleNavigationDomain | null {
  const module = findModuleByPath(path);
  if (!module) {
    return getVisibleNavigationDomains(permissionCodes)[0] || null;
  }

  return getVisibleNavigationDomains(permissionCodes).find((domain) => domain.code === module.domainCode) || null;
}

export function getFirstAccessiblePath(
  permissionCodes: string[] = [],
  options: string | { domainCode?: string } = {}
): string {
  const domainCode = typeof options === "string" ? options : options?.domainCode;
  const resolvedDomainCode = domainCode || getPreferredDomainCode(permissionCodes);
  if (resolvedDomainCode) {
    return getVisibleNavigationDomains(permissionCodes).find((domain) => domain.code === resolvedDomainCode)?.targetPath || "/forbidden";
  }

  return getVisibleModuleGroups(permissionCodes)[0]?.pages[0]?.path || "/forbidden";
}
