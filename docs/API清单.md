# API 清单

## 1. 约定

- Base Path：`/api/v1`
- 认证方式：`Bearer Token`
- 响应格式：

```json
{
  "ok": true,
  "message": "success",
  "data": {}
}
```

## 2. 认证与权限

### 登录

- `POST /auth/login`
- 页面：登录页
- 表：
  - `sys_users`
  - `sys_refresh_tokens`
  - `sys_user_roles`
  - `sys_role_permissions`
  - `sys_user_permission_overrides`
  - `sys_role_data_scopes`
  - `sys_user_data_scope_overrides`

请求字段：

- `loginType`
- `username`
- `password`
- `phone`
- `captchaCode`

返回字段：

- `accessToken`
- `refreshToken`
- `userInfo`
- `roleCodes`
- `permissionCodes`
- `dataScopes`

### 当前用户信息

- `GET /auth/me`
- 页面：头部个人信息、权限初始化

返回字段：

- `user`
- `roles`
- `permissions`
- `dataScopes`

### 刷新访问令牌

- `POST /auth/refresh`
- 页面：前端请求层自动续期
- 表：
  - `sys_refresh_tokens`
  - `sys_users`

### 登出

- `POST /auth/logout`
- 页面：右上角退出登录
- 表：`sys_refresh_tokens`

### 用户选项

- `GET /system/user-options`
- 页面：区域管理、告警中心、通用指派人下拉
- 表：`sys_users`

### 角色选项

- `GET /system/role-options`
- 页面：用户管理
- 表：`sys_roles`

## 3. 工作台

### 总览统计

- `GET /dashboard/summary`
- 页面：总览大屏
- 表：
  - `iot_gateways`
  - `iot_sensors`
  - `iot_actuators`
  - `ops_alerts`
  - `ops_control_commands`
  - `iot_gateway_backfill_batches`

查询参数：

- `areaId`
- `date`

返回字段：

- `onlineGatewayCount`
- `offlineGatewayCount`
- `sensorCount`
- `actuatorCount`
- `pendingAlertCount`
- `todayControlCount`
- `todayAutoControlCount`
- `todayBackfillBatchCount`

### 总览趋势

- `GET /dashboard/trends`
- 页面：总览大屏
- 表：`iot_sensor_readings`

查询参数：

- `areaId`
- `metricCodes[]`
- `range`
- `granularity`

## 4. 实时监控与历史分析

### 实时监控列表

- `GET /monitor/realtime`
- 页面：实时监控
- 表：
  - `iot_sensors`
  - `iot_gateways`
  - `biz_areas`

查询参数：

- `areaId`
- `gatewayId`
- `sensorType`
- `status`

返回字段：

- `sensorId`
- `sensorName`
- `sensorType`
- `currentValue`
- `unitName`
- `dataSource`
- `timeQuality`
- `lastCollectedAt`
- `lastReceivedAt`
- `delayMs`
- `gatewayName`
- `areaName`

### 历史曲线

- `GET /monitor/history`
- 页面：历史分析、实时监控弹窗
- 表：`iot_sensor_readings`

查询参数：

- `sensorId`
- `metricCode`
- `from`
- `to`
- `granularity`
- `dataSource`
- `timeQuality`

### 传感器详情

- `GET /monitor/sensors/:id`
- 页面：传感器详情
- 表：
  - `iot_sensors`
  - `iot_sensor_readings`
  - `rule_definitions`

### 指标字典列表

- `GET /metrics`
- 页面：系统管理 / 指标字典、规则引擎、自动控制策略、总览大屏
- 表：
  - `iot_metric_defs`
  - `iot_sensor_channels`

查询参数：

- `enabled`
- `keyword`
- `categoryCode`

### 新增指标字典

- `POST /metrics`
- 页面：系统管理 / 指标字典
- 表：`iot_metric_defs`

### 编辑指标字典

- `PUT /metrics/:id`
- 页面：系统管理 / 指标字典
- 表：`iot_metric_defs`

### 设备上报接入

- `POST /iot/ingest`
- `POST /soil/ingest`（兼容旧固件）
- 页面：设备接入链路、ESP32 / 网关采集上报
- 表：
  - `biz_areas`
  - `iot_gateways`
  - `iot_sensors`
  - `iot_sensor_channels`
  - `iot_sensor_readings`

说明：

- 接口支持当前温湿度简版 payload
- 也支持未来通用 `metrics[]` payload
- 若设备未建档，会自动创建默认区域、网关、传感器和通道

### 设备控制拉取

- `GET /iot/device-control`
- 页面：ESP32 / 网关固件轮询
- 表：`iot_gateways`

### 设备控制状态回报

- `POST /iot/device-control/report`
- 页面：ESP32 / 网关固件状态回报
- 表：`iot_gateways`

### 历史图片时间轴

- `GET /snapshots`
- 页面：历史图片时间轴
- 表：
  - `iot_camera_snapshots`
  - `iot_cameras`
  - `biz_areas`
  - `iot_gateways`

查询参数：

- `keyword`
- `cameraId`
- `areaId`
- `sourceType`
- `dateFrom`
- `dateTo`
- `limit`

## 5. 区域与设备

### 区域列表

- `GET /areas`
- 页面：区域管理
- 表：`biz_areas`

### 新增区域

- `POST /areas`
- 页面：区域管理
- 表：`biz_areas`

### 编辑区域

- `PUT /areas/:id`
- 页面：区域管理
- 表：`biz_areas`

### 网关列表

- `GET /gateways`
- 页面：网关设备管理
- 表：
  - `iot_gateways`
  - `biz_areas`

### 网关详情

- `GET /gateways/:id`
- 页面：网关设备管理详情
- 表：
  - `iot_gateways`
  - `iot_gateway_backfill_batches`
  - `iot_sensors`
  - `iot_actuators`

### 远程重启网关

- `POST /gateways/:id/reboot`
- 页面：网关设备管理
- 表：
  - `iot_gateways`
  - `sys_operation_logs`

### 触发立即补传

- `POST /gateways/:id/backfill`
- 页面：网关设备管理
- 表：
  - `iot_gateways`
  - `iot_gateway_backfill_batches`
  - `sys_operation_logs`

### 下发暂停检测 / 恢复检测

- `POST /gateways/:id/sampling-state`
- 页面：网关设备管理
- 表：
  - `iot_gateways`
  - `sys_operation_logs`

### 传感器列表

- `GET /sensors`
- 页面：传感器管理
- 表：`iot_sensors`

### 新增传感器

- `POST /sensors`
- 页面：传感器管理
- 表：`iot_sensors`

### 编辑传感器

- `PUT /sensors/:id`
- 页面：传感器管理
- 表：`iot_sensors`

### 校准传感器

- `POST /sensors/:id/calibrate`
- 页面：传感器管理
- 表：
  - `iot_sensors`
  - `sys_operation_logs`

### 执行器列表

- `GET /actuators`
- 页面：执行器管理、手动控制
- 表：
  - `iot_actuators`
  - `iot_device_shadow`
  - `iot_gateways`

### 执行器影子状态

- `GET /actuators/:id/shadow`
- 页面：执行器管理、设备影子状态页
- 表：`iot_device_shadow`

### 设备影子状态列表

- `GET /device-shadow`
- 页面：设备影子状态
- 表：
  - `iot_device_shadow`
  - `iot_actuators`
  - `iot_gateways`
  - `biz_areas`

### 设备影子重同步

- `POST /device-shadow/:actuatorId/resync`
- 页面：设备影子状态
- 表：
  - `iot_device_shadow`
  - `iot_actuators`
  - `sys_operation_logs`

### 新增执行器

- `POST /actuators`
- 页面：执行器管理
- 表：
  - `iot_actuators`
  - `iot_device_shadow`

### 编辑执行器

- `PUT /actuators/:id`
- 页面：执行器管理
- 表：
  - `iot_actuators`
  - `iot_device_shadow`

### 媒体节点列表

- `GET /media-nodes`
- 页面：媒体节点管理
- 表：`iot_media_nodes`

### 新增媒体节点

- `POST /media-nodes`
- 页面：媒体节点管理
- 表：
  - `iot_media_nodes`
  - `sys_operation_logs`

### 编辑媒体节点

- `PUT /media-nodes/:id`
- 页面：媒体节点管理
- 表：
  - `iot_media_nodes`
  - `sys_operation_logs`

### 删除媒体节点

- `DELETE /media-nodes/:id`
- 页面：媒体节点管理
- 表：
  - `iot_media_nodes`
  - `sys_operation_logs`

### 媒体节点下拉选项

- `GET /media-node-options`
- 页面：摄像头管理
- 表：`iot_media_nodes`

### 摄像头列表

- `GET /cameras`
- 页面：摄像头管理
- 表：
  - `iot_cameras`
  - `iot_camera_streams`
  - `iot_media_nodes`
  - `iot_gateways`
  - `biz_areas`

### 新增摄像头

- `POST /cameras`
- 页面：摄像头管理
- 表：
  - `iot_cameras`
  - `iot_camera_streams`
  - `sys_operation_logs`

### 编辑摄像头

- `PUT /cameras/:id`
- 页面：摄像头管理
- 表：
  - `iot_cameras`
  - `iot_camera_streams`
  - `sys_operation_logs`

### 删除摄像头

- `DELETE /cameras/:id`
- 页面：摄像头管理
- 表：
  - `iot_cameras`
  - `iot_camera_streams`
  - `sys_operation_logs`

### 抓图任务列表

- `GET /capture-jobs`
- 页面：抓图任务
- 表：
  - `iot_camera_capture_jobs`
  - `iot_cameras`
  - `biz_areas`
  - `sys_users`

### 手动创建抓图任务

- `POST /cameras/:id/capture`
- 页面：抓图任务
- 表：
  - `iot_camera_capture_jobs`
  - `iot_camera_snapshots`
  - `iot_cameras`
  - `sys_operation_logs`

### 接收 FTP 抓图元数据

- `POST /cameras/:id/ftp-receive`
- 页面：抓图任务
- 表：
  - `iot_camera_snapshots`
  - `iot_cameras`
  - `sys_operation_logs`

## 6. 手动控制与自动控制

### 手动控制执行器

- `POST /controls/commands`
- 页面：手动控制页
- 表：
  - `ops_control_commands`
  - `iot_device_shadow`
  - `sys_operation_logs`

请求字段：

- `actuatorId`
- `controlType`
- `durationSeconds`
- `forceExecute`
- `reasonText`

### 控制记录列表

- `GET /controls/commands`
- 页面：控制记录页
- 表：
  - `ops_control_commands`
  - `ops_control_executions`

### 控制执行详情

- `GET /controls/commands/:id`
- 页面：控制记录详情
- 表：
  - `ops_control_commands`
  - `ops_control_executions`

### 自动控制策略列表

- `GET /rules/automation-policies`
- 页面：自动控制策略页
- 实际表：`rule_definitions`

## 7. 规则与告警

### 规则列表

- `GET /rules`
- 页面：规则引擎
- 表：`rule_definitions`

### 规则详情

- `GET /rules/:id`
- 页面：规则引擎
- 表：`rule_definitions`

### 保存规则

- `POST /rules`
- 页面：规则引擎
- 表：`rule_definitions`

### 更新规则

- `PUT /rules/:id`
- 页面：规则引擎
- 表：`rule_definitions`

### 告警列表

- `GET /alerts`
- 页面：告警中心
- 表：
  - `ops_alerts`
  - `biz_areas`
  - `iot_sensors`
  - `iot_gateways`

查询参数：

- `status`
- `severity`
- `areaId`
- `assignedTo`
- `from`
- `to`

### 告警详情

- `GET /alerts/:id`
- 页面：告警详情
- 表：
  - `ops_alerts`
  - `ops_alert_transitions`
  - `rule_definitions`
  - `ops_control_commands`

### 告警流转操作

- `POST /alerts/:id/transitions`
- 页面：告警中心
- 表：
  - `ops_alerts`
  - `ops_alert_transitions`

请求字段：

- `actionType`
- `assignedTo`
- `remarkText`

### 通知记录列表

- `GET /notifications`
- 页面：通知记录
- 表：`ops_notifications`

### 通知重发

- `POST /notifications/:id/resend`
- 页面：通知记录
- 说明：会按 `notification_channel` 配置真实调用企业微信 / 钉钉 / Webhook 通道
- 表：
  - `ops_notifications`
  - `sys_operation_logs`

## 8. AI

### AI 诊断列表

- `GET /ai/diagnoses`
- 页面：AI诊断
- 表：
  - `ai_tasks`
  - `ai_reports`

### 发起 AI 分析

- `POST /ai/tasks`
- 页面：AI诊断、AI日报/周报
- 说明：若 `ai_provider.enabled=true`，会真实调用 OpenAI 兼容模型；失败时回退本地规则摘要
- 表：
  - `ai_tasks`
  - `sys_operation_logs`

### AI 任务详情

- `GET /ai/tasks/:id`
- 页面：AI任务队列详情
- 表：
  - `ai_tasks`
  - `ai_reports`

### AI 任务重试

- `POST /ai/tasks/:id/retry`
- 页面：AI任务队列
- 表：
  - `ai_tasks`
  - `ai_reports`
  - `sys_operation_logs`

### AI 任务取消

- `POST /ai/tasks/:id/cancel`
- 页面：AI任务队列
- 表：
  - `ai_tasks`
  - `sys_operation_logs`

### AI 任务队列

- `GET /ai/tasks`
- 页面：AI任务队列
- 表：`ai_tasks`

### AI 报告列表

- `GET /ai/reports`
- 页面：AI日报/周报
- 表：`ai_reports`

### AI 报告详情

- `GET /ai/reports/:id`
- 页面：AI日报/周报详情
- 表：`ai_reports`

### 立即生成 AI 报告

- `POST /ai/reports/generate`
- 页面：AI日报/周报
- 表：
  - `ai_tasks`
  - `ai_reports`
  - `sys_operation_logs`

## 9. 系统管理

### 用户列表

- `GET /system/users`
- 页面：用户管理
- 表：
  - `sys_users`
  - `sys_user_roles`
  - `sys_roles`

### 新增用户

- `POST /system/users`
- 页面：用户管理
- 表：`sys_users`

### 编辑用户

- `PUT /system/users/:id`
- 页面：用户管理
- 表：
  - `sys_users`
  - `sys_user_roles`

### 角色列表

- `GET /system/roles`
- 页面：角色管理
- 表：`sys_roles`

### 新增角色

- `POST /system/roles`
- 页面：角色管理
- 表：`sys_roles`

### 编辑角色

- `PUT /system/roles/:id`
- 页面：角色管理
- 表：`sys_roles`

### 权限树

- `GET /system/permissions`
- 页面：权限管理
- 表：`sys_permissions`

### 角色权限模板

- `GET /system/roles/:id/permissions`
- 页面：权限管理
- 表：
  - `sys_permissions`
  - `sys_role_permissions`

### 保存角色权限模板

- `PUT /system/roles/:id/permissions`
- 页面：权限管理
- 表：
  - `sys_permissions`
  - `sys_role_permissions`

### 用户权限覆盖列表

- `GET /system/users/:id/permission-overrides`
- 页面：权限管理
- 表：`sys_user_permission_overrides`

### 保存用户权限覆盖

- `POST /system/users/:id/permission-overrides`
- 页面：权限管理
- 表：`sys_user_permission_overrides`

### 系统配置

- `GET /system/configs`
- 页面：系统设置
- 表：`sys_configs`

### 保存系统配置

- `PUT /system/configs`
- 页面：系统设置
- 表：`sys_configs`

### 系统联调测试

- `POST /system/test/:target`
- 页面：系统设置
- 支持目标：
  - `ai-service`
  - `notification`
  - `device-connection`
- 配置分组：
  - `ai_provider`
  - `notification_channel`
- 表：
  - `ai_tasks`
  - `ai_reports`
  - `ops_notifications`
  - `iot_gateways`

### 操作日志

- `GET /system/audit-logs`
- 页面：操作日志
- 表：`sys_operation_logs`
