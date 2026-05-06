# 智能农业前后端分离项目骨架

这个子项目用于承接你当前这套“智能农业环境监测与自动控制平台”后台。

目录结构：

- `sql/`
  - `001_create_database.sql`：创建开发数据库
  - `010_core_schema.sql`：核心业务表结构
  - `020_seed_rbac.sql`：角色、权限和默认授权种子数据
- `docs/`
  - `数据库设计说明.md`
  - `API清单.md`
  - `实施路线图.md`
- `admin-api/`
  - Fastify 风格后端骨架
- `admin-web/`
  - Vue 3 + Vite 风格前端骨架

## 推荐开发顺序

1. 执行 `sql/` 目录脚本，先把库结构定死。
2. 对照 `docs/API清单.md` 拆后端模块。
3. 对照 `admin-web` 菜单骨架开始做页面。
4. 先实现 P0 页面与接口，再补规则、AI、系统配置。

## 本地 MySQL 初始化

```bash
MYSQL_PWD=123456 mysql -uroot < agri-platform/sql/001_create_database.sql
MYSQL_PWD=123456 mysql -uroot < agri-platform/sql/010_core_schema.sql
MYSQL_PWD=123456 mysql -uroot < agri-platform/sql/020_seed_rbac.sql
MYSQL_PWD=123456 mysql -uroot < agri-platform/sql/030_seed_demo_data.sql
MYSQL_PWD=123456 mysql -uroot agri_iot_platform_dev < agri-platform/sql/060_camera_media_extension.sql
MYSQL_PWD=123456 mysql -uroot agri_iot_platform_dev < agri-platform/sql/070_refresh_token_sessions.sql
```

默认数据库名：

- `agri_iot_platform_dev`

## 默认开发管理员

- 用户名：`admin`
- 密码：`Admin@123456`

说明：

- 后端启动时会自动确保默认管理员存在
- 即使数据库最开始是空的，也能直接登录

## 启动后端

```bash
cd "/Users/mac/Documents/New project/agri-platform/admin-api"
npm install
PORT=3001 MYSQL_PASSWORD=123456 MYSQL_DATABASE=agri_iot_platform_dev npm start
```

常用环境变量：

- `APP_TOKEN_SECRET`：登录 token 签名密钥
- `APP_REFRESH_TOKEN_SECRET`：刷新 token 签名密钥
- `DEVICE_INGEST_TOKEN`：设备上报 token
- `OPENCLAW_READONLY_TOKEN`：OpenClaw 专用只读访问 token
- `ACCESS_TOKEN_EXPIRES_MINUTES`：访问令牌有效期，默认 `15`
- `REFRESH_TOKEN_EXPIRES_DAYS`：刷新令牌有效期，默认 `7`
- `AUTH_CACHE_TTL_MS`：鉴权上下文内存缓存时长，默认 `300000`
- `RATE_LIMIT_ENABLED`：是否启用基础限流，默认 `true`
- `LOGIN_RATE_LIMIT_WINDOW_MS` / `LOGIN_RATE_LIMIT_MAX`
- `INGEST_RATE_LIMIT_WINDOW_MS` / `INGEST_RATE_LIMIT_MAX`
- `LOGIN_LOCK_ENABLED`
- `LOGIN_FAILURE_THRESHOLD`
- `LOGIN_LOCK_MINUTES`

设备上报专用 token：

- 默认 `DEVICE_INGEST_TOKEN`：`DgQHl5VE1HpU7ab0AxAvRgMuIOOXrA_I`
- 可通过环境变量覆盖

OpenClaw 只读 token：

- 默认 `OPENCLAW_READONLY_TOKEN`：`OCLAW_READONLY_20260329_W7xP3L8Q`
- 适合 OpenClaw / 外部只读助手调用查询接口
- 不需要先登录，不具备写权限

健康检查：

```bash
curl http://127.0.0.1:3001/healthz
```

Swagger 文档：

- UI：`http://127.0.0.1:3001/docs`
- OpenAPI JSON：`http://127.0.0.1:3001/docs/json`

生产环境约束：

- `NODE_ENV=production` 时，必须显式设置 `APP_TOKEN_SECRET`
- `NODE_ENV=production` 时，必须显式设置 `APP_REFRESH_TOKEN_SECRET`
- `NODE_ENV=production` 时，必须显式设置 `DEVICE_INGEST_TOKEN`
- `NODE_ENV=production` 时，若开启默认管理员初始化，不能继续使用默认密码 `Admin@123456`
- MySQL 连接池会按 CPU 自动放大，且已启用 `keepAlive` 与有限排队

## 启动前端

```bash
cd "/Users/mac/Documents/New project/agri-platform/admin-web"
npm install
npm run dev
```

默认地址：

- 前端：`http://127.0.0.1:5174`
- 后端：`http://127.0.0.1:3001`

前端请求策略：

- 默认请求超时 `30s`
- `GET/HEAD` 在网络错误时默认重试 `1` 次
- 超时会统一显示“请求超时，请稍后重试”

## 为什么第一版不强依赖 Redis

- 当前是管理后台，不是超高并发读写系统
- 先把 MySQL 模型、索引、状态机和审计链路做稳，收益最大
- 后续需要时，可以把 Redis 用在热点统计、权限缓存、任务去重、分布式锁

## 当前阶段已落地的核心决策

- 前后端分离
- MySQL 作为主数据源
- 鉴权上下文采用短时内存缓存，权限变更后主动失效
- 权限模型采用“角色默认权限 + 用户覆盖权限 + 数据范围”
- 控制链路采用“控制指令 + 执行结果 + Device Shadow”
- 告警链路采用“主表 + 流转表 + 通知表”
- AI 链路采用“任务表 + 报告表”

## 当前已实现的页面

- 登录页：真实可登录
- 总览大屏：真实接口联动
- 实时监控：真实接口联动
- 历史分析：真实接口联动
- 区域管理：列表 + 新增 + 编辑
- 网关设备管理：列表 + 新增 + 编辑
- 传感器管理：列表 + 新增 + 编辑
- 执行器管理：列表 + 新增 + 编辑 + 影子状态查看
- 手动控制：执行器选择 + 控制命令入队 + 记录查看
- 告警中心：列表 + 详情 + 状态流转
- 用户管理：列表 + 新增 + 编辑 + 用户特殊授权
- 角色管理：列表 + 新增 + 编辑
- 权限管理：按角色分配权限模板
- 操作日志：查询系统写操作审计日志
- 规则引擎：基于指标字典的可视化编辑器 + 高级模式
- 自动控制策略：按业务表单创建和编辑控制型规则
- 控制记录：查询控制指令与执行结果
- AI 诊断：列表 + 详情 + 手动发起诊断
- AI 日报 / 周报：列表 + 详情 + 手动生成报告
- AI 任务队列：列表 + 详情 + 重试 / 取消
- 系统设置：读取 / 保存 `sys_configs` + 联调测试入口
- 设备影子状态：全量列表 + 详情 + 重同步
- 通知记录：列表筛选 + 详情 + 手动重发
- 指标字典：维护指标编码、单位、范围、图表颜色、启停状态
- 媒体节点管理：列表 + 新增 + 编辑 + 删除
- 摄像头管理：列表 + 新增 + 编辑 + 删除 + 主码流配置
- 抓图任务：手动抓图 + 模拟 FTP 接收 + 抓图任务列表
- 历史图片时间轴：图片索引浏览 + 时间过滤 + 详情查看
- 总览大屏：多指标趋势卡片 + 主图切换 + 补传占比可视化
- 网关暂停检测：支持从“网关设备管理”下发暂停 / 恢复检测指令
- AI 模型服务：支持 OpenAI 兼容 `/chat/completions` 接口，可在系统设置中配置 `ai_provider`
- 真实通知通道：支持企业微信机器人、钉钉机器人、通用 Webhook，可在系统设置中配置 `notification_channel`

## 当前已实现的后端接口补充

- `GET /api/v1/system/user-options`
- `GET /api/v1/system/role-options`
- `PUT /api/v1/system/users/:id`
- `POST /api/v1/system/roles`
- `PUT /api/v1/system/roles/:id`
- `GET /api/v1/system/roles/:id/permissions`
- `PUT /api/v1/system/roles/:id/permissions`
- `GET /api/v1/rules`
- `GET /api/v1/rules/:id`
- `POST /api/v1/rules`
- `PUT /api/v1/rules/:id`
- `GET /api/v1/ai/diagnoses`
- `GET /api/v1/ai/tasks`
- `GET /api/v1/ai/tasks/:id`
- `POST /api/v1/ai/tasks`
- `POST /api/v1/ai/tasks/:id/retry`
- `POST /api/v1/ai/tasks/:id/cancel`
- `GET /api/v1/ai/reports`
- `GET /api/v1/ai/reports/:id`
- `POST /api/v1/ai/reports/generate`
- `GET /api/v1/system/configs`
- `PUT /api/v1/system/configs`
- `POST /api/v1/system/test/:target`
- `GET /api/v1/device-shadow`
- `POST /api/v1/device-shadow/:actuatorId/resync`
- `GET /api/v1/notifications`
- `POST /api/v1/notifications/:id/resend`
- `GET /api/v1/metrics`
- `POST /api/v1/metrics`
- `PUT /api/v1/metrics/:id`
- `POST /api/v1/iot/ingest`
- `POST /api/soil/ingest` 兼容旧 ESP32 固件上报地址
- `GET /api/v1/iot/device-control`
- `POST /api/v1/iot/device-control/report`
- `GET /api/v1/media-nodes`
- `POST /api/v1/media-nodes`
- `PUT /api/v1/media-nodes/:id`
- `DELETE /api/v1/media-nodes/:id`
- `GET /api/v1/cameras`
- `POST /api/v1/cameras`
- `PUT /api/v1/cameras/:id`
- `DELETE /api/v1/cameras/:id`
- `GET /api/v1/capture-jobs`
- `POST /api/v1/cameras/:id/capture`
- `GET /api/v1/snapshots`
- `POST /api/v1/cameras/:id/ftp-receive`
- `POST /api/v1/gateways/:id/sampling-state`
- `POST /api/v1/alerts/:id/transitions`
- `GET /api/v1/system/audit-logs`
- `POST /api/v1/controls/commands` 已支持真实落库和 Device Shadow 期望状态更新

## 真实接入说明

- `系统设置 -> AI 模型服务`
  - `provider_type=openai_compatible`
  - `base_url` 填到 `/v1`
  - `api_key`、`model` 必填
- `系统设置 -> 通知通道配置`
  - `wecom_webhook_url` 用于企业微信机器人
  - `dingtalk_webhook_url` 用于钉钉机器人
  - `webhook_url` 可作为邮件/短信/第三方网关的统一转发入口
- `POST /api/v1/system/test/ai-service`
  - 现在会真实请求远程模型；未配置时返回 `warning`
- `POST /api/v1/system/test/notification`
  - 现在会真实推送测试消息到已配置通道
- `POST /api/v1/notifications/:id/resend`
  - 现在会真实重发通知，并写回发送结果与响应摘要
- `POST /api/v1/gateways/:id/sampling-state`
  - 用于下发“暂停检测 / 恢复检测”命令
- ESP32 固件
  - 需要使用最新版 [soil_sensor_reporter.ino](/Users/mac/Documents/New%20project/firmware/soil_sensor_reporter/soil_sensor_reporter.ino)
  - 固件会轮询 `/api/v1/iot/device-control` 并在暂停状态下继续回报心跳

## 当前基础防护

- 登录接口启用基础限流，默认同一来源同一账号窗口期内超过阈值返回 `429`
- 登录失败达到阈值后账号会临时锁定，默认 `5` 次失败锁定 `15` 分钟
- 设备上报接口启用按 `deviceId` 的基础限流，默认超过阈值返回 `429`
- 登录成功时会记录真实来源 IP，优先读取 `X-Forwarded-For` / `X-Real-IP`
- 登录链路已支持 `Access Token + Refresh Token` 轮换，前端会在访问令牌即将过期时自动续期
- Dashboard 趋势预设已使用固定白名单校验，不接受任意时间粒度拼接

## 当前仍是占位的页面

- 固件升级
- 高级权限审计
