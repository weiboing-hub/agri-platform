# ESP32 智能灌溉系统操作手册

## 1. 适用范围

本文档用于当前这套基于 `ESP32 + RS485 土壤温湿度传感器 + MOS 水泵驱动 + 云端平台` 的智能灌溉系统日常使用与维护。

当前现场对应对象：

- 网关设备：`soil-001`
- 水泵执行器：`A-PUMP-001`
- 固件版本：`1.0.4-safety`

## 2. 常用访问入口

### 2.1 云端平台

- 首页：[http://82.156.45.208/](http://82.156.45.208/)
- 健康检查：[http://82.156.45.208/healthz](http://82.156.45.208/healthz)
- API 文档：[http://82.156.45.208/docs/](http://82.156.45.208/docs/)

### 2.2 关键业务页面

- 网关设备管理：[http://82.156.45.208/devices/gateways](http://82.156.45.208/devices/gateways)
- 设备模板：[http://82.156.45.208/devices/templates](http://82.156.45.208/devices/templates)
- 实时监控：[http://82.156.45.208/monitor/realtime](http://82.156.45.208/monitor/realtime)
- 手动控制：[http://82.156.45.208/controls/manual](http://82.156.45.208/controls/manual)
- 自动控制策略：[http://82.156.45.208/controls/policies](http://82.156.45.208/controls/policies)
- 控制记录：`/controls/logs`
- 固件包管理：[http://82.156.45.208/devices/firmware/packages](http://82.156.45.208/devices/firmware/packages)
- 固件升级任务：[http://82.156.45.208/devices/firmware/jobs](http://82.156.45.208/devices/firmware/jobs)

### 2.3 设备本地面板

设备连入局域网后，在同一网络内访问：

- `http://设备IP/`
- `http://设备IP/status`

## 3. 日常检查步骤

每天或每次现场维护前，建议先做下面四步。

### 3.1 看设备是否在线

进入“网关设备管理”，确认：

- `soil-001` 状态为在线
- 最近心跳时间持续更新
- Wi-Fi 信号正常
- 配置同步状态为 `applied`

### 3.2 看土壤数据是否正常

进入“实时监控”，确认：

- 温度有值
- 湿度有值
- 采集时间持续刷新
- 湿度不是长期固定 `0%` 或 `100%`

判断经验：

- 长期 `0%` 多见于探头在空气中、接触不良或数据异常
- 长期 `100%` 多见于探头在水中或极湿环境

### 3.3 看水泵是否处于关闭态

进入“手动控制”或“执行器管理”，确认：

- 期望状态：`off`
- 实际状态：`off`
- Shadow 状态：`sync`

### 3.4 看本地网页状态

访问 `http://设备IP/`，确认：

- 当前湿度正常显示
- 最近浇水时间可见
- 固件版本正确
- OTA 状态无异常

## 4. 手动开泵操作

适用于现场调试、点动测试和临时人工浇水。

### 4.1 云端页面操作

1. 打开“手动控制”页面。
2. 选择执行器 `A-PUMP-001`。
3. 选择控制动作：
   - 开启
   - 关闭
   - 停止
4. 填写持续秒数。
5. 提交命令。
6. 到控制记录查看执行结果。

### 4.2 现场要点

当前固件已接入本地保护，以下情况可能导致开泵失败：

- 最小停机间隔未到
- 当日累计运行时间已达上限
- 本地自治或保护逻辑阻止启动

如果平台显示命令失败，应先看失败原因，不要连续重复点击。

### 4.3 本地网页点动

如果云端不可用，或者只想做短脉冲测试：

1. 打开 `http://设备IP/`
2. 点击“水泵点动 1 秒”
3. 观察水泵动作
4. 如需停止，点击“关闭水泵”

## 5. 自动灌溉策略操作

### 5.1 查看当前策略

打开“自动控制策略”页面，确认策略已绑定到真实设备与执行器。

重点查看：

- 阈值
- 稳定时间
- 单次运行时长
- 冷却时间
- 每日次数限制
- 异常值保护

### 5.2 当前本地自治默认参数

`soil-001` 目前已下发椰糠盆保守默认值：

- 启用本地自治：`true`
- 启动阈值：`40`
- 停止阈值：`55`
- 单次脉冲：`8 秒`
- 复检等待：`300 秒`
- 需有效传感器：`true`
- 云端命令优先：`true`

### 5.3 调整建议

如果后续需要微调，不建议一次改太多。建议按这个顺序调：

1. 先记录干土、正常湿土、偏湿土的稳定值。
2. 先调整启动阈值 `startHumidityBelow`。
3. 再调整停止阈值 `stopHumidityAbove`。
4. 最后再调整单次脉冲时间 `pulseSeconds`。

## 6. 网关参数下发

### 6.1 在哪里改

入口有两处：

- “网关设备管理”：改单台设备
- “设备模板”：改模板基线

### 6.2 重点参数说明

#### 云端通讯参数

- `apiHost`
- `reportIntervalMs`
- `controlPollIntervalMs`

#### RS485 参数

- `baudrate`
- `modbusAddress`
- `registerStart`
- `registerCount`
- `tempRegisterIndex`
- `humRegisterIndex`

#### 控制参数

- `pumpGpio`
- `activeHigh`
- `maxRunSeconds`
- `minOffSeconds`
- `maxDailyRunSeconds`

#### 本地自治参数

- `enabled`
- `startHumidityBelow`
- `stopHumidityAbove`
- `pulseSeconds`
- `minRecheckSeconds`
- `requireValidSensor`
- `disableWhenCloudCommandPending`

#### 能力开关

- `localWebEnabled`
- `otaEnabled`
- `cellularEnabled`

### 6.3 参数下发后的确认方式

参数保存后，回到“网关设备管理”确认：

- `device_config_version` 已增加
- 同步状态变为 `pending_push`
- 等设备下一次拉取后变为 `applied`

## 7. OTA 固件升级操作

### 7.1 生成固件包

在本地工程目录执行：

```bash
cd "/Users/mac/Documents/New project/firmware/soil_sensor_reporter"
./build_ota.sh 1.0.5
```

生成产物通常位于：

- `/Users/mac/Documents/New project/release/ota-1.0.5/soil_sensor_reporter-1.0.5.bin`
- `/Users/mac/Documents/New project/release/ota-1.0.5/soil_sensor_reporter-1.0.5.merged.bin`
- `/Users/mac/Documents/New project/release/ota-1.0.5/manifest.json`

说明：

- `.bin` 用于 OTA 升级
- `.merged.bin` 用于串口整包烧录

### 7.2 在平台录入固件包

1. 打开“固件包管理”。
2. 新增固件包。
3. 填写：
   - 包名称
   - 固件版本
   - 下载地址
   - 文件大小
   - SHA256
4. 保存。

### 7.3 创建升级任务

1. 打开“固件升级任务”。
2. 选择目标网关 `soil-001`。
3. 选择目标固件包。
4. 创建任务。
5. 观察任务状态变化：
   - `pending`
   - `downloading`
   - `upgrading`
   - `success` 或 `failed`

### 7.4 升级后验收

升级完成后至少确认这几项：

1. 网关页显示新版本。
2. 设备仍在线。
3. 湿度与温度还能继续上报。
4. 本地网页能正常打开。
5. OTA 状态无异常。

## 8. 本地网页维护操作

### 8.1 修改 Wi-Fi

1. 打开 `http://设备IP/`
2. 输入新的 Wi-Fi 名称和密码
3. 点击“保存并重启”
4. 等待设备重启并重新连网

### 8.2 清除 Wi-Fi

如果现场需要重新配网：

1. 打开本地网页
2. 点击“清除已保存 WiFi”
3. 设备重启后重新进入配网流程

### 8.3 读取状态 JSON

如需调试或做二次接入，可以访问：

`http://设备IP/status`

当前会返回：

- `deviceId`
- `deviceMode`
- `pumpStatus`
- `pumpGuardStatus`
- `pumpGuardMessage`
- `dailyPumpRunSeconds`
- `dailyPumpRunBudgetSeconds`
- `onlineStatus`
- `firmwareVersion`
- `otaStatus`
- `otaMessage`
- `lastWateringTime`
- `lastCloudReport`
- `humidity`
- `temperature`

## 9. 异常处理指南

### 9.1 湿度一直是 0

优先排查：

1. 探头是否在空气中
2. 探头是否插入土壤足够深
3. RS485 线序是否正确
4. 传感器供电是否正常
5. Modbus 地址和寄存器配置是否正确

### 9.2 湿度一直是 100

优先排查：

1. 探头是否直接在水中
2. 土壤是否过湿或积水
3. 传感器是否受污染或短路

### 9.3 水泵不启动

按这个顺序查：

1. 本地网页看“水泵保护”提示
2. 查看是否还在最小停机间隔内
3. 查看当天累计运行是否已达上限
4. 检查 12V 电源是否正常
5. 检查 MOS 模块接线是否松动
6. 检查 GPIO26 配置是否被改动

### 9.4 设备在线但不执行云端命令

优先检查：

1. 控制轮询周期是否正常
2. 是否存在本地保护拦截
3. 是否有 OTA 校验期在运行
4. 平台控制记录中的失败原因

### 9.5 OTA 升级失败

先看：

1. 固件包下载地址是否可访问
2. 文件大小是否正确
3. SHA256 是否匹配
4. 设备是否有稳定 Wi-Fi
5. 本地网页 OTA 状态提示
6. 升级任务页失败原因

## 10. 当前默认维护基线

截至 2026-05-04，建议把下面这套作为现场默认基线：

### 10.1 现场基线

- 电源：12V 主电源稳定供电
- 降压：12V -> 5V
- 传感器：RS485 地址 `2`
- 水泵控制：GPIO26
- 本地网页：保持开启
- OTA：保持开启

### 10.2 椰糠盆保守默认值

- `maxRunSeconds = 15`
- `minOffSeconds = 120`
- `maxDailyRunSeconds = 180`
- `startHumidityBelow = 40`
- `stopHumidityAbove = 55`
- `pulseSeconds = 8`
- `minRecheckSeconds = 300`

## 11. 运维建议

1. 首周建议每天观察湿度曲线和自动灌溉触发情况。
2. 阈值调整只改一项，观察至少半天到一天。
3. OTA 升级优先先在单设备演练，再扩到更多设备。
4. 若后续要更高安全等级，应补液位、流量或电流保护。

## 12. 相关文件

- 功能说明：[ESP32智能灌溉系统功能说明.md](/Users/mac/Documents/New%20project/agri-platform/docs/ESP32%E6%99%BA%E8%83%BD%E7%81%8C%E6%BA%89%E7%B3%BB%E7%BB%9F%E5%8A%9F%E8%83%BD%E8%AF%B4%E6%98%8E.md)
- 平台操作手册：[平台操作手册.md](/Users/mac/Documents/New%20project/agri-platform/docs/%E5%B9%B3%E5%8F%B0%E6%93%8D%E4%BD%9C%E6%89%8B%E5%86%8C.md)
- 交付操作手册：[交付操作手册.md](/Users/mac/Documents/New%20project/agri-platform/docs/%E4%BA%A4%E4%BB%98%E6%93%8D%E4%BD%9C%E6%89%8B%E5%86%8C.md)
