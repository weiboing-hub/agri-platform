# API 调用详细文档

## 1. 说明

- Base URL：`http://127.0.0.1:3001/api/v1`
- 认证方式：`Authorization: Bearer <accessToken>`
- 登录成功后会记录真实来源 IP，优先取 `X-Forwarded-For` / `X-Real-IP`
- `GET/HEAD` 请求在前端网络异常时默认重试 1 次，默认超时 30 秒
- OpenClaw 只读模式可直接使用专用 Bearer Token，不需要先登录
- 响应格式：

```json
{
  "ok": true,
  "message": "success",
  "data": {}
}
```

### OpenClaw 只读 Token

- Header：`Authorization: Bearer OCLAW_READONLY_20260329_W7xP3L8Q`
- 权限范围：
  - `dashboard:view`
  - `monitor:view`
  - `history:view`
  - `alert:view`
  - `ai:view`
  - `rule:view`
- 适合只读查询：
  - `/dashboard/*`
  - `/monitor/*`
  - `/alerts/*`
  - `/ai/diagnoses`
  - `/ai/reports`
  - `/device-shadow`
  - `/areas`
  - `/gateways`
  - `/sensors`
  - `/actuators`
  - `/metrics`
  - `/cameras`
  - `/media-nodes`
  - `/capture-jobs`
  - `/snapshots`

## 2. 登录

### 请求

```bash
curl -X POST 'http://127.0.0.1:3001/api/v1/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{
    "username": "admin",
    "password": "Admin@123456"
  }'
```

### 返回重点字段

- `accessToken`
- `refreshToken`
- `user`
- `roles`
- `permissionCodes`
- `dataScopes`

### 限流说明

- 登录接口启用基础限流
- 默认按“来源 IP + 用户名”计数
- 超过阈值时返回 `429`
- 响应头会带 `Retry-After`
- 登录失败达到阈值后会返回 `423 account_locked`

常见错误码：

- `invalid_credentials`：用户名或密码错误
- `account_locked`：账号临时锁定
- `account_disabled`：账号已禁用
- `rate_limited`：请求过于频繁

### 刷新访问令牌

```bash
curl -X POST 'http://127.0.0.1:3001/api/v1/auth/refresh' \
  -H 'Content-Type: application/json' \
  -d '{
    "refreshToken": "<refreshToken>"
  }'
```

说明：

- 默认采用 `Access Token 15 分钟 + Refresh Token 7 天`
- 刷新成功后会轮换新的 `refreshToken`
- 旧 `refreshToken` 会立即失效

### 登出

```bash
curl -X POST 'http://127.0.0.1:3001/api/v1/auth/logout' \
  -H 'Content-Type: application/json' \
  -d '{
    "refreshToken": "<refreshToken>"
  }'
```

### Swagger 文档

- UI：`http://127.0.0.1:3001/docs`
- OpenAPI JSON：`http://127.0.0.1:3001/docs/json`

## 3. 设备影子状态

### 查询设备影子状态列表

```bash
curl 'http://127.0.0.1:3001/api/v1/device-shadow?shadowStatus=drift' \
  -H 'Authorization: Bearer <accessToken>'
```

### 关键返回字段

- `actuatorId`
- `actuatorName`
- `desiredStateText`
- `reportedStateText`
- `shadowStatus`
- `lastCommandId`
- `lastCommandResult`
- `driftSeconds`
- `stateOffsetSeconds`

### 触发重同步

```bash
curl -X POST 'http://127.0.0.1:3001/api/v1/device-shadow/1/resync' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### 返回示例

```json
{
  "ok": true,
  "message": "已触发影子状态重同步",
  "data": {
    "actuatorId": 1,
    "actuatorName": "灌溉水泵 1 号",
    "shadowStatus": "pending"
  }
}
```

## 4. 通知记录

### 查询通知记录列表

```bash
curl 'http://127.0.0.1:3001/api/v1/notifications?status=failed&channelType=sms' \
  -H 'Authorization: Bearer <accessToken>'
```

### 关键返回字段

- `notificationNo`
- `channelType`
- `receiverValue`
- `contentSummary`
- `sendStatus`
- `retryCount`
- `responseText`
- `alertNo`

### 手动重发通知

```bash
curl -X POST 'http://127.0.0.1:3001/api/v1/notifications/2/resend' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

## 5. AI 诊断

### 查询诊断列表

```bash
curl 'http://127.0.0.1:3001/api/v1/ai/diagnoses' \
  -H 'Authorization: Bearer <accessToken>'
```

### 发起诊断

```bash
curl -X POST 'http://127.0.0.1:3001/api/v1/ai/tasks' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "taskType": "diagnosis",
    "triggerType": "manual",
    "scopeType": "area",
    "scopeIds": [1],
    "relatedAlertCount": 2,
    "dedupeKey": "area:1:diagnosis",
    "reasonText": "联调验证"
  }'
```

## 6. AI 报告

### 查询报告列表

```bash
curl 'http://127.0.0.1:3001/api/v1/ai/reports?reportType=daily' \
  -H 'Authorization: Bearer <accessToken>'
```

### 查询报告详情

```bash
curl 'http://127.0.0.1:3001/api/v1/ai/reports/1' \
  -H 'Authorization: Bearer <accessToken>'
```

### 立即生成报告

```bash
curl -X POST 'http://127.0.0.1:3001/api/v1/ai/reports/generate' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "reportType": "daily",
    "triggerType": "manual",
    "scopeType": "global",
    "scopeIds": [],
    "reportDate": "2026-03-29",
    "dedupeKey": "global:daily:2026-03-29",
    "reasonText": "手动补生成"
  }'
```

## 7. AI 任务队列

### 查询任务列表

```bash
curl 'http://127.0.0.1:3001/api/v1/ai/tasks?status=failed' \
  -H 'Authorization: Bearer <accessToken>'
```

### 查询任务详情

```bash
curl 'http://127.0.0.1:3001/api/v1/ai/tasks/3' \
  -H 'Authorization: Bearer <accessToken>'
```

### 重试任务

```bash
curl -X POST 'http://127.0.0.1:3001/api/v1/ai/tasks/3/retry' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### 取消任务

```bash
curl -X POST 'http://127.0.0.1:3001/api/v1/ai/tasks/2/cancel' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

## 8. 系统设置

### 查询系统配置

```bash
curl 'http://127.0.0.1:3001/api/v1/system/configs' \
  -H 'Authorization: Bearer <accessToken>'
```

### 保存系统配置

```bash
curl -X PUT 'http://127.0.0.1:3001/api/v1/system/configs' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "items": [

## 9. 摄像头与抓图

### 查询媒体节点

```bash
curl 'http://127.0.0.1:3001/api/v1/media-nodes' \
  -H 'Authorization: Bearer <accessToken>'
```

### 查询摄像头列表

```bash
curl 'http://127.0.0.1:3001/api/v1/cameras?onlineStatus=online' \
  -H 'Authorization: Bearer <accessToken>'
```

### 手动发起抓图

```bash
curl -X POST 'http://127.0.0.1:3001/api/v1/cameras/1/capture' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "capturePurpose": "analysis",
    "remark": "联调手动抓图"
  }'
```

### 查询抓图任务

```bash
curl 'http://127.0.0.1:3001/api/v1/capture-jobs?cameraId=1' \
  -H 'Authorization: Bearer <accessToken>'
```

### 查询历史图片时间轴

```bash
curl 'http://127.0.0.1:3001/api/v1/snapshots?cameraId=1&sourceType=ftp_upload' \
  -H 'Authorization: Bearer <accessToken>'
```

### 接收 FTP 抓图元数据

```bash
curl -X POST 'http://127.0.0.1:3001/api/v1/cameras/1/ftp-receive' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "ftpPath": "/camera/east/20260329-101500.jpg",
    "filePath": "/ftp-import/cam-east-001/20260329-101500.jpg",
    "imageWidth": 1280,
    "imageHeight": 720,
    "remark": "FTP 抓图入库"
  }'
```
      {
        "configGroup": "base",
        "configKey": "platform_name",
        "configName": "平台名称",
        "configValueJson": "智能农业环境监测平台",
        "description": "后台平台显示名称"
      }
    ]
  }'
```

### 联调测试接口

```bash
curl -X POST 'http://127.0.0.1:3001/api/v1/system/test/ai-service' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

可选目标：

- `ai-service`
- `notification`
- `device-connection`

配置建议：

- `ai_provider.base_url`：填写到 `/v1`
- `ai_provider.provider_type`：`openai_compatible`
- `notification_channel.wecom_webhook_url`：企业微信机器人地址
- `notification_channel.webhook_url`：通用 webhook 兜底地址

### 通知重发

```bash
curl -X POST 'http://127.0.0.1:3001/api/v1/notifications/2/resend' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

说明：

- 会按通知记录的 `channelType` 选择真实发送通道
- 若对应专用通道未配置，会尝试走通用 `webhook_url`

### AI 报告生成

```bash
curl -X POST 'http://127.0.0.1:3001/api/v1/ai/reports/generate' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "triggerType": "manual",
    "scopeType": "global",
    "reportType": "daily",
    "reasonText": "模型服务联调测试"
  }'
```

## 9. 指标字典

### 查询指标字典列表

```bash
curl 'http://127.0.0.1:3001/api/v1/metrics?enabled=true&categoryCode=environment' \
  -H 'Authorization: Bearer <accessToken>'
```

### 新增指标

```bash
curl -X POST 'http://127.0.0.1:3001/api/v1/metrics' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "metricCode": "soil_temp",
    "metricName": "土壤温度",
    "categoryCode": "soil",
    "unitName": "℃",
    "valueType": "decimal",
    "precisionScale": 1,
    "normalMin": 12,
    "normalMax": 30,
    "warnMin": 8,
    "warnMax": 35,
    "chartColor": "#B66A3C",
    "sortOrder": 35,
    "enabled": true,
    "remark": "土壤探头温度指标"
  }'
```

### 编辑指标

```bash
curl -X PUT 'http://127.0.0.1:3001/api/v1/metrics/1' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "metricName": "环境温度",
    "categoryCode": "environment",
    "unitName": "℃",
    "valueType": "decimal",
    "precisionScale": 1,
    "normalMin": 10,
    "normalMax": 35,
    "warnMin": 5,
    "warnMax": 40,
    "chartColor": "#D96C4A",
    "sortOrder": 10,
    "enabled": true,
    "remark": "环境温度指标"
  }'
```

## 10. 设备接入上报

### 兼容当前 ESP32 温湿度 payload

```bash
curl -X POST 'http://127.0.0.1:3001/api/v1/iot/ingest' \
  -H 'Authorization: Bearer DgQHl5VE1HpU7ab0AxAvRgMuIOOXrA_I' \
  -H 'Content-Type: application/json' \
  -d '{
    "device_id": "soil-001",
    "name": "greenhouse-east-1",
    "temp": 22.3,
    "hum": 48.6,
    "rssi": -67
  }'
```

### 兼容旧 soil-api 地址

```bash
curl -X POST 'http://127.0.0.1:3001/api/soil/ingest' \
  -H 'Authorization: Bearer DgQHl5VE1HpU7ab0AxAvRgMuIOOXrA_I' \
  -H 'Content-Type: application/json' \
  -d '{
    "device_id": "soil-001",
    "name": "greenhouse-east-1",
    "temp": 22.3,
    "hum": 48.6,
    "rssi": -67
  }'
```

### 通用多指标 payload

```bash
curl -X POST 'http://127.0.0.1:3001/api/v1/iot/ingest' \
  -H 'Authorization: Bearer DgQHl5VE1HpU7ab0AxAvRgMuIOOXrA_I' \
  -H 'Content-Type: application/json' \
  -d '{
    "deviceId": "soil-001",
    "deviceName": "greenhouse-east-1",
    "collectedAt": "2026-03-29T13:58:00+08:00",
    "rssi": -67,
    "metrics": [
      { "metricCode": "temperature", "metricName": "温度", "value": 22.3, "unitName": "℃" },
      { "metricCode": "humidity", "metricName": "湿度", "value": 48.6, "unitName": "%" }
    ]
  }'
```

### 上报限流说明

- 设备上报接口启用按 `deviceId` 的基础限流
- 默认超过阈值时返回 `429`
- 建议设备端收到 `429` 后按退避策略重试，不要立即重放

### 设备拉取暂停 / 恢复指令

```bash
curl 'http://127.0.0.1:3001/api/v1/iot/device-control?deviceId=soil-001' \
  -H 'Authorization: Bearer DgQHl5VE1HpU7ab0AxAvRgMuIOOXrA_I'
```

### 设备回报当前检测状态

```bash
curl -X POST 'http://127.0.0.1:3001/api/v1/iot/device-control/report' \
  -H 'Authorization: Bearer DgQHl5VE1HpU7ab0AxAvRgMuIOOXrA_I' \
  -H 'Content-Type: application/json' \
  -d '{
    "deviceId": "soil-001",
    "samplingStatus": "paused",
    "appliedCommandVersion": 3,
    "rssi": -68
  }'
```

### 后台下发暂停检测

```bash
curl -X POST 'http://127.0.0.1:3001/api/v1/gateways/4/sampling-state' \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "desiredSamplingStatus": "paused"
  }'
```

返回重点字段：

- `gatewayId`
- `gatewayCode`
- `acceptedMetricCount`
- `metrics[].sensorId`
- `metrics[].readingId`

## 11. 典型联调顺序

建议按以下顺序调用：

1. `/auth/login`
2. `/metrics`
3. `/iot/ingest`
4. `/dashboard/summary`
5. `/monitor/realtime`
6. `/alerts`
7. `/notifications`
8. `/device-shadow`
9. `/ai/diagnoses`
10. `/ai/reports`
11. `/system/configs`

这样可以快速验证：

- 登录鉴权是否正常
- 主数据是否存在
- 告警与通知链路是否正常
- Device Shadow 是否正常
- AI 模块是否正常
- 系统配置是否可读写

## 12. 当前运行保护补充

- 鉴权上下文采用短时内存缓存，权限或角色变更后会主动清理相关用户缓存
- Dashboard 趋势接口只接受固定预设粒度，不接受任意 SQL 时间单位
- 生产环境必须显式设置 `APP_TOKEN_SECRET` 与 `DEVICE_INGEST_TOKEN`
- 当前统一错误响应格式包含 `error/message/details`，前端可按 `error` 做分层提示
