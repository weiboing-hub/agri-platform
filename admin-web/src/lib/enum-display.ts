const ENUM_LABELS = {
  status: {
    enabled: "启用",
    disabled: "禁用",
    locked: "锁定"
  },
  onlineStatus: {
    online: "在线",
    offline: "离线"
  },
  runtimeMode: {
    manual: "手动",
    auto: "自动",
    maintenance: "维护"
  },
  samplingStatus: {
    running: "检测中",
    paused: "已暂停"
  },
  backfillStatus: {
    idle: "空闲",
    queued: "排队中",
    running: "补传中",
    success: "成功",
    failed: "失败"
  },
  gatewayType: {
    esp32: "ESP32",
    linux_gateway: "Linux 网关"
  },
  mediaNodeType: {
    media_server: "媒体服务",
    storage_gateway: "存储网关",
    edge_gateway: "边缘节点"
  },
  cameraType: {
    ip_camera: "IPC 摄像头",
    wifi_camera: "WiFi 摄像头",
    thermal_camera: "热成像摄像头"
  },
  captureMode: {
    manual: "手动",
    schedule: "定时",
    event: "事件联动"
  },
  capturePurpose: {
    preview: "预览",
    evidence: "证据",
    analysis: "分析",
    report: "报告"
  },
  snapshotSourceType: {
    manual: "手动抓图",
    schedule: "定时抓图",
    event: "事件抓图",
    ftp_upload: "FTP 上传",
    http_upload: "HTTP 上传"
  },
  streamProtocol: {
    rtsp: "RTSP",
    rtmp: "RTMP",
    http: "HTTP",
    ftp: "FTP",
    hls: "HLS",
    webrtc: "WebRTC",
    flv: "FLV"
  },
  areaType: {
    greenhouse: "温室",
    open_field: "露天",
    experiment: "实验区"
  },
  sensorType: {
    temperature: "温度",
    humidity: "湿度",
    ec: "电导率",
    ph: "酸碱度",
    co2: "二氧化碳",
    lux: "光照",
    soil_n: "土壤氮",
    soil_p: "土壤磷",
    soil_k: "土壤钾"
  },
  protocolType: {
    modbus: "Modbus",
    uart: "串口"
  },
  calibrationStatus: {
    pending: "待校准",
    calibrated: "已校准",
    expired: "已过期"
  },
  actuatorType: {
    water_pump: "水泵",
    valve: "阀门",
    fan: "风机"
  },
  shadowStatus: {
    unknown: "未知",
    sync: "同步",
    pending: "待同步",
    drift: "不一致"
  },
  controlType: {
    on: "开启",
    off: "关闭",
    stop: "停止"
  },
  recoveryPolicy: {
    manual_close: "人工关闭",
    auto_close: "自动关闭",
    auto_downgrade: "自动降级"
  },
  ruleType: {
    threshold: "阈值",
    trend: "趋势",
    anomaly: "异常"
  },
  builderMode: {
    visual: "可视化",
    advanced: "高级表达式"
  },
  targetType: {
    sensor: "传感器",
    actuator: "执行器",
    area: "区域"
  },
  alertStatus: {
    pending: "未处理",
    acknowledged: "已确认",
    in_progress: "处理中",
    on_hold: "挂起",
    ignored: "已忽略",
    closed: "已关闭",
    reopened: "重新打开"
  },
  severity: {
    critical: "紧急",
    high: "高",
    medium: "中",
    low: "低"
  },
  alertAction: {
    assign: "指派",
    confirm: "确认",
    process: "处理",
    hold: "挂起",
    ignore: "忽略",
    close: "关闭",
    reopen: "重新打开"
  },
  taskType: {
    diagnosis: "诊断",
    report: "报告"
  },
  taskStatus: {
    pending: "待执行",
    queued: "排队中",
    running: "运行中",
    success: "成功",
    failed: "失败",
    deduped: "已去重",
    cancelled: "已取消"
  },
  captureJobStatus: {
    pending: "待执行",
    running: "执行中",
    success: "成功",
    failed: "失败",
    cancelled: "已取消"
  },
  capturePlanScheduleType: {
    interval: "固定间隔",
    daily: "每日定时"
  },
  reportStatus: {
    generated: "已生成",
    failed: "失败",
    cancelled: "已取消"
  },
  triggerType: {
    manual: "手动",
    event: "事件触发",
    schedule: "定时"
  },
  scopeType: {
    global: "全局",
    area: "区域",
    device: "设备"
  },
  reportType: {
    daily: "日报",
    weekly: "周报",
    monthly: "月报",
    diagnosis: "诊断报告"
  },
  notificationStatus: {
    pending: "待发送",
    sent: "已发送",
    failed: "发送失败"
  },
  channelType: {
    wechat: "微信",
    sms: "短信",
    email: "邮件",
    in_app: "站内消息",
    dingtalk: "钉钉",
    webhook: "Webhook"
  },
  receiverType: {
    user: "用户",
    phone: "手机号",
    email: "邮箱",
    webhook: "Webhook"
  },
  dataSource: {
    realtime: "实时",
    backfill: "补传",
    manual: "手动"
  },
  timeQuality: {
    high: "高",
    medium: "中",
    low: "低"
  },
  commandStatus: {
    queued: "排队中",
    executed: "已执行",
    failed: "失败",
    cancelled: "已取消",
    sent: "已发送",
    acknowledged: "已确认"
  },
  resultStatus: {
    success: "成功",
    failed: "失败"
  },
  effectType: {
    grant: "授予",
    revoke: "撤销"
  },
  approvalStatus: {
    approved: "已批准",
    pending: "待审批",
    rejected: "已拒绝"
  },
  riskLevel: {
    critical: "紧急",
    high: "高",
    medium: "中",
    low: "低"
  },
  healthStatus: {
    healthy: "健康",
    warning: "警告",
    unknown: "未知",
    error: "异常"
  },
  controlPolicy: {
    warn: "提示后允许",
    block: "禁止控制",
    allow: "直接允许"
  },
  mutexPolicy: {
    reject: "拒绝执行",
    queue: "排队执行",
    override: "覆盖执行"
  }
} as const;

export type EnumLabelType = keyof typeof ENUM_LABELS;

export function enumLabel(type: EnumLabelType, value: string | number | null | undefined): string {
  if (value === undefined || value === null || value === "") {
    return "-";
  }

  const textValue = String(value);
  return ENUM_LABELS[type]?.[textValue as keyof (typeof ENUM_LABELS)[typeof type]] || textValue;
}
