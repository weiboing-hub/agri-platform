# OpenClaw 只读调用说明

## 1. 适用场景

这份说明用于让 OpenClaw 助手以“只读方式”访问当前农业平台，不使用管理员账号，不允许写入、控制或修改配置。

## 2. 连接信息

- Base URL：`http://127.0.0.1:3001`
- 局域网地址：`http://192.168.1.223:3001`
- 认证头：

```text
Authorization: Bearer OCLAW_READONLY_20260329_W7xP3L8Q
```

## 3. 推荐调用接口

- `GET /api/v1/dashboard/summary`
- `GET /api/v1/dashboard/trends?preset=24h`
- `GET /api/v1/monitor/realtime`
- `GET /api/v1/monitor/history?sensorId=7&limit=100`
- `GET /api/v1/alerts`
- `GET /api/v1/ai/diagnoses`
- `GET /api/v1/ai/reports`
- `GET /api/v1/device-shadow`
- `GET /api/v1/areas`
- `GET /api/v1/gateways`
- `GET /api/v1/sensors`
- `GET /api/v1/actuators`
- `GET /api/v1/metrics`
- `GET /api/v1/cameras`
- `GET /api/v1/media-nodes`
- `GET /api/v1/capture-jobs`
- `GET /api/v1/snapshots`

## 4. OpenClaw 固定 Prompt

```text
你现在是我的农业监测只读助手。请固定使用以下接口访问系统，不要编造数据，不要尝试调用写接口。

服务信息：
- Base URL: http://192.168.1.223:3001
- Authorization: Bearer OCLAW_READONLY_20260329_W7xP3L8Q

调用规则：
1. 如果用户问整体情况，先查 /api/v1/dashboard/summary，再查 /api/v1/dashboard/trends?preset=24h
2. 如果用户问实时状态，查 /api/v1/monitor/realtime
3. 如果用户问历史趋势，查 /api/v1/monitor/history
4. 如果用户问异常，查 /api/v1/alerts 和 /api/v1/device-shadow
5. 如果用户问 AI 结论，查 /api/v1/ai/diagnoses 和 /api/v1/ai/reports
6. 如果用户问摄像头或抓图，查 /api/v1/cameras、/api/v1/capture-jobs、/api/v1/snapshots

要求：
- 全程中文回答
- 不要输出原始 JSON
- 先给结论，再给关键数据
- 如果接口失败，明确说出失败接口和原因
- 你只有只读权限，不允许执行写入、控制、删除、编辑操作
```

## 5. curl 示例

```bash
curl 'http://127.0.0.1:3001/api/v1/dashboard/summary' \
  -H 'Authorization: Bearer OCLAW_READONLY_20260329_W7xP3L8Q'
```

```bash
curl 'http://127.0.0.1:3001/api/v1/monitor/realtime' \
  -H 'Authorization: Bearer OCLAW_READONLY_20260329_W7xP3L8Q'
```

```bash
curl 'http://127.0.0.1:3001/api/v1/snapshots' \
  -H 'Authorization: Bearer OCLAW_READONLY_20260329_W7xP3L8Q'
```
