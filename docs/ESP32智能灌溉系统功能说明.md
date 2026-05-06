# ESP32 智能灌溉系统功能说明

## 1. 文档范围

本文档整理 2026-05-03 至 2026-05-04 期间围绕 `soil-001` 现场设备、ESP32 固件、云端平台和 OTA 升级链路完成的主要功能，用于交付说明、后续维护和现场复盘。

当前现场主设备与关键标识：

- 网关设备：`soil-001`
- 水泵执行器：`A-PUMP-001`
- 现场主控：`ESP32 DevKit 32E`
- 土壤传感器：`RS485 土壤温湿度传感器`
- 水泵驱动：`MOS 驱动模块`
- 当前固件版本：`1.0.4-safety`

当前线上访问地址：

- 前端平台：[http://82.156.45.208/](http://82.156.45.208/)
- 健康检查：[http://82.156.45.208/healthz](http://82.156.45.208/healthz)
- 接口文档：[http://82.156.45.208/docs/](http://82.156.45.208/docs/)

## 2. 本次交付的核心结果

本轮已经把系统从“硬件能通、代码能跑”推进到“可远程管理、可远程升级、具备基础安全保护、断网可自治”的状态。

已落地的结果可以概括为：

1. 现场设备接线与控制闭环跑通。
2. 云端后台可查看设备、传感器、水泵和控制记录。
3. 手动控制链路已打通，云端可下发开泵/关泵命令。
4. 自动灌溉规则已可运行，并补了异常值保护。
5. OTA 固件包管理、升级任务管理、设备端下载刷写链路已打通。
6. 固件已支持 OTA 健康检查、延迟确认与回滚逻辑。
7. ESP32 本地网页已升级为简易设备面板。
8. 固件已接入水泵运行安全策略。
9. 固件已接入断网本地自治浇水能力。
10. 线上 `soil-001` 已使用椰糠盆保守默认参数运行。

## 3. 系统架构概览

### 3.1 现场设备链路

```text
12V 电源
├─ 直接供电给 12V 水泵
├─ 直接供电给 MOS 水泵驱动模块
└─ 进入降压模块，转换为 5V
   ├─ 供电给 ESP32 DevKit 32E
   └─ 供电给 TTL-RS485 模块

ESP32
├─ GPIO26 -> MOS 模块 HIGH/PWM 控制脚
├─ RX2/TX2 -> TTL-RS485 模块 RXD/TXD
└─ Wi-Fi -> 云端平台

TTL-RS485 模块
└─ A/B -> RS485 土壤温湿度传感器

MOS 模块
└─ 低端开关控制水泵负极
```

### 3.2 云端软件链路

```text
ESP32
├─ 周期上报：温度、湿度、心跳、水泵状态、配置状态
├─ 周期拉取：云端配置、控制命令、OTA 目标版本
└─ 回报结果：控制执行结果、OTA 升级状态

Agri Platform
├─ 实时监控
├─ 网关/模板配置
├─ 手动控制
├─ 自动控制策略
├─ 固件包管理
└─ 固件升级任务管理
```

## 4. 设备端功能说明

### 4.1 RS485 土壤温湿度采集

当前固件通过 Modbus 读取土壤温湿度，现场已验证：

- 空气中：湿度可接近 `0%`
- 潮湿环境：湿度会明显上升
- 水中：湿度可到 `100%`

这说明以下链路已打通：

- 传感器供电
- RS485 通讯
- TTL-RS485 转换
- ESP32 寄存器读取
- 平台入库与展示

当前线上默认参数：

- 波特率：`9600`
- Modbus 地址：`2`
- 起始寄存器：`0`
- 读取数量：`2`
- 温度索引：`0`
- 湿度索引：`1`

### 4.2 水泵控制

当前水泵采用 MOS 低端开关方式控制，GPIO 为：

- `pumpGpio = 26`
- `activeHigh = true`

已打通的控制入口：

- 云端手动控制
- 云端自动灌溉
- 本地网页点动/关闭
- 断网本地自治浇水

### 4.3 ESP32 本地网页

设备在启用本地网页且已连入 Wi-Fi 后，会保留本地面板，不再只是配网页。

本地面板地址：

- `http://设备IP/`
- `http://设备IP/status`

当前本地面板展示字段：

- 设备在线状态
- 设备模式
- 当前湿度
- 最近浇水时间
- 固件版本
- OTA 状态
- 水泵保护状态
- 今日累计运行量
- 最近云端上报时间

当前本地面板支持操作：

- 修改 Wi-Fi
- 清除 Wi-Fi
- 水泵点动 1 秒
- 关闭水泵

### 4.4 设备模式

固件已增加轻量状态模式，便于现场判断运行阶段。

当前模式包括：

- `boot`
- `idle`
- `sampling`
- `watering`
- `paused`
- `ota_verify`
- `error`

## 5. 云端平台功能说明

### 5.1 网关设备管理

页面入口：

- [http://82.156.45.208/devices/gateways](http://82.156.45.208/devices/gateways)

当前可查看或配置：

- 设备编号
- 固件版本
- 在线状态
- 最近心跳
- Wi-Fi 信号
- 配置下发状态
- 远程参数
- 本地自治参数

### 5.2 手动控制

页面入口：

- [http://82.156.45.208/controls/manual](http://82.156.45.208/controls/manual)

当前能力：

- 选择执行器
- 开启/关闭/停止
- 设置持续时间
- 提交控制命令
- 查看设备执行回执

### 5.3 自动控制策略

页面入口：

- [http://82.156.45.208/controls/policies](http://82.156.45.208/controls/policies)

当前已支持：

- 按湿度阈值控制水泵
- 稳定时间判断
- 单次持续时间
- 冷却时间
- 每日触发次数限制
- 异常值保护

当前系统中与 `soil-001` 相关的自动灌溉规则已经绑定到真实设备，不再是演示数据。

### 5.4 固件包管理

页面入口：

- [http://82.156.45.208/devices/firmware/packages](http://82.156.45.208/devices/firmware/packages)

当前能力：

- 录入 OTA 固件包
- 维护版本号
- 维护下载地址
- 记录文件大小
- 记录 SHA256

### 5.5 固件升级任务

页面入口：

- [http://82.156.45.208/devices/firmware/jobs](http://82.156.45.208/devices/firmware/jobs)

当前能力：

- 给指定网关创建升级任务
- 查看目标版本
- 查看任务状态
- 查看最后回报
- 查看失败原因

## 6. OTA 升级功能说明

### 6.1 当前已实现能力

平台侧：

- 固件包表
- 升级任务表
- 固件包管理页
- 升级任务页
- 设备配置接口返回 OTA 目标字段
- 设备回报 OTA 状态接口

设备侧：

- 轮询 OTA 任务
- 下载固件
- 校验文件大小
- 校验 SHA256
- 写入 OTA 分区
- 刷写后重启
- 启动后进入健康检查
- 健康通过后确认新固件有效
- 健康失败时执行回滚逻辑

### 6.2 当前 OTA 保护逻辑

OTA 不再是“刷完即成功”，而是：

```text
发现新版本
-> 下载并写入 OTA 分区
-> 重启进入新固件
-> 健康检查期
-> Wi-Fi 连通 + 传感器读取成功 + 云端上报成功
-> 标记新固件有效
```

如果在健康检查窗口内未满足条件，则会进入回滚处理流程。

### 6.3 已验证状态

已完成验证：

- OTA 固件包生成
- 云端任务创建
- 设备下载与刷写
- 设备升级成功
- 固件版本回报成功

当前线上真实设备版本：

- `soil-001`
- 固件版本：`1.0.4-safety`

需要注意：

- 成功升级闭环已验证
- “故障注入式失败回滚演练”建议后续专门做一次测试，以补齐现场实测证据

## 7. 水泵安全策略说明

本轮已把原先单一的“最大运行时长”扩展为一套基础安全守卫。

当前固件已接入：

- 单次最大运行时长 `maxRunSeconds`
- 最小停机间隔 `minOffSeconds`
- 每日累计运行上限 `maxDailyRunSeconds`
- 传感器无效时禁止本地自治启动
- 云端命令待执行时，本地自治不抢占

如果远程开泵命令被本地保护拦截，设备会向云端回报失败，而不是假装执行成功。

## 8. 断网本地自治功能说明

当前系统不再完全依赖云端。

设备侧已新增本地自治参数：

- `enabled`
- `startHumidityBelow`
- `stopHumidityAbove`
- `pulseSeconds`
- `minRecheckSeconds`
- `requireValidSensor`
- `disableWhenCloudCommandPending`

自治逻辑要点：

1. 湿度低于启动阈值才允许启动。
2. 湿度高于停止阈值时保持待命。
3. 每次只做脉冲式浇水，不做无限持续浇水。
4. 浇水后会等待复检窗口，不会连续抖动开关。
5. 有待执行云端命令时，本地自治让位于云端控制。

## 9. 当前线上默认参数

截至 2026-05-04，`soil-001` 已使用椰糠盆保守默认参数：

### 9.1 控制参数

- `pumpGpio = 26`
- `activeHigh = true`
- `maxRunSeconds = 15`
- `minOffSeconds = 120`
- `maxDailyRunSeconds = 180`

### 9.2 本地自治参数

- `enabled = true`
- `startHumidityBelow = 40`
- `stopHumidityAbove = 55`
- `pulseSeconds = 8`
- `minRecheckSeconds = 300`
- `requireValidSensor = true`
- `disableWhenCloudCommandPending = true`

### 9.3 云端与能力参数

- `apiHost = http://82.156.45.208`
- `reportIntervalMs = 20000`
- `controlPollIntervalMs = 10000`
- `localWebEnabled = true`
- `otaEnabled = true`

## 10. 当前已解决的问题

本轮已解决的典型问题包括：

- MOS 水泵驱动接线与控制闭环
- RS485 土壤传感器读取
- 设备测试数据清理
- 自动灌溉规则绑定真实设备
- 异常湿度 `0` 值误触发开泵风险
- 固件 OTA 升级链路
- 本地网页字段不足
- 云端参数和固件运行时参数未闭环
- 远程控制被本地保护拦截后仍显示成功的问题

## 11. 当前限制与后续建议

当前系统已经可用，但还存在明确的后续项：

1. 现场仍建议补一次 OTA 失败回滚演练。
2. 若要进一步提升水泵保护等级，建议补液位、流量或电流检测，单靠湿度不能解决空转风险。
3. 当前椰糠盆阈值为保守默认值，后续应根据实际盆土湿度区间做二次标定。
4. 摄像头链路与本文件无直接关联，若后续要恢复视频闭环，需要单独排查摄像头在线与推流状态。

## 12. 相关源码与文档位置

- 固件主文件：[soil_sensor_reporter.ino](/Users/mac/Documents/New%20project/firmware/soil_sensor_reporter/soil_sensor_reporter.ino)
- OTA 构建脚本：[build_ota.sh](/Users/mac/Documents/New%20project/firmware/soil_sensor_reporter/build_ota.sh)
- 网关配置模型（后端）：[gateway-config.js](/Users/mac/Documents/New%20project/agri-platform/admin-api/src/lib/gateway-config.js)
- 网关配置模型（前端）：[gateway-config.ts](/Users/mac/Documents/New%20project/agri-platform/admin-web/src/lib/gateway-config.ts)
- 固件包管理页：[FirmwarePackagesView.vue](/Users/mac/Documents/New%20project/agri-platform/admin-web/src/views/FirmwarePackagesView.vue)
- 固件升级任务页：[FirmwareJobsView.vue](/Users/mac/Documents/New%20project/agri-platform/admin-web/src/views/FirmwareJobsView.vue)
- 网关设备管理页：[GatewaysView.vue](/Users/mac/Documents/New%20project/agri-platform/admin-web/src/views/GatewaysView.vue)
- 设备模板页：[DeviceTemplatesView.vue](/Users/mac/Documents/New%20project/agri-platform/admin-web/src/views/DeviceTemplatesView.vue)
