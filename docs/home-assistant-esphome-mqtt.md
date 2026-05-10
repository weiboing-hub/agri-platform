# Home Assistant + ESPHome + MQTT 接入说明

本文记录 `liuwb` 测试 ESP32 通过 MQTT 接入云端 Home Assistant 的当前方案。

## 1. 当前结论

- Home Assistant 地址：`http://82.156.45.208:666`
- ESPHome Dashboard 地址：`http://82.156.45.208:6052`
- MQTT Broker：`82.156.45.208:1883`
- ESP32 设备名：`liuwb`
- ESP32 局域网 IP：`192.168.1.18`
- 控制方式：ESP32 主动连接公网 MQTT Broker，Home Assistant 通过 MQTT discovery 自动生成实体

说明：

- 云服务器无法直接访问家里局域网地址 `192.168.1.18:6053`
- 因此不要用 Home Assistant 的 ESPHome 原生 API 去连这块家里内网 ESP32
- 当前可用链路是 `ESP32 -> MQTT Broker -> Home Assistant`

## 2. Home Assistant 登录信息

Home Assistant 当前管理员账号已改为英文用户名，避免中文用户名在登录页输入时出错。

- 用户名：`admin`
- 密码：只保存在服务器本地 `/root/homeassistant-info.txt`

不要把 Home Assistant 密码提交到 GitHub。

## 3. ESPHome Dashboard 登录信息

- 用户名：`admin`
- 密码：只保存在服务器本地 `/root/esphome-info.txt`

不要把 ESPHome Dashboard 密码提交到 GitHub。

## 4. MQTT Broker 信息

- Host：`82.156.45.208`
- Port：`1883`
- Username：`esp32`
- Password：只保存在服务器本地 `/root/mqtt-broker-info.txt`

Mosquitto 服务端文件：

- 主配置：`/etc/mosquitto/mosquitto.conf`
- 附加配置：`/etc/mosquitto/conf.d/10-esp32-broker.conf`
- 密码文件：`/etc/mosquitto/passwd`

常用命令：

```bash
systemctl status mosquitto
systemctl restart mosquitto
journalctl -u mosquitto -n 200 --no-pager
```

## 5. ESP32 实体

Home Assistant 已通过 MQTT discovery 识别到以下实体：

- `switch.liuwb_gpio2_led`
- `button.liuwb_gpio2_blink`

用途：

- `switch.liuwb_gpio2_led`：控制 GPIO2 板载 LED 开关
- `button.liuwb_gpio2_blink`：触发 GPIO2 LED 闪烁

## 6. MQTT Topic

ESPHome 自动 discovery topic：

- `homeassistant/switch/liuwb/gpio2_led/config`
- `homeassistant/button/liuwb/gpio2_blink/config`

手动控制 topic：

- `liuwb/gpio2/set`
  - payload：`ON`
  - payload：`OFF`
- `liuwb/gpio2/blink`
  - payload：`1`

状态 topic：

- `liuwb/status`
  - payload：`online`
  - payload：`offline`
- `liuwb/gpio2/state`
  - payload：`ON`
  - payload：`OFF`

服务器测试命令：

```bash
mosquitto_pub -h 127.0.0.1 -u esp32 -P '<MQTT_PASSWORD>' -t 'liuwb/gpio2/set' -m 'ON'
mosquitto_pub -h 127.0.0.1 -u esp32 -P '<MQTT_PASSWORD>' -t 'liuwb/gpio2/set' -m 'OFF'
mosquitto_pub -h 127.0.0.1 -u esp32 -P '<MQTT_PASSWORD>' -t 'liuwb/gpio2/blink' -m '1'
```

## 7. Home Assistant MQTT 配置方式

当前 Home Assistant 版本不再接受旧式 YAML：

```yaml
mqtt:
  broker: 127.0.0.1
  username: esp32
  password: xxx
```

实际已改为 Home Assistant 的 MQTT config entry。  
因为 Home Assistant 运行在 Docker 容器里，Broker 地址不能写 `127.0.0.1`，应使用宿主机桥接地址：

```text
172.17.0.1:1883
```

配置存储位置：

- `/opt/homeassistant/config/.storage/core.config_entries`

## 8. ESPHome 示例配置

脱敏示例文件：

- `examples/esphome/liuwb-mqtt-gpio2.example.yaml`
- `examples/esphome/secrets.example.yaml`

真实运行配置在：

- 本地调试目录：`/Users/mac/Documents/New project/tmp/esphome-liuwb/liuwb.yaml`
- 服务器配置目录：`/opt/esphome/config/liuwb.yaml`

真实配置里包含 Wi-Fi、MQTT、API、OTA 等敏感信息，不提交到 GitHub。

## 9. 已验证结果

- ESP32 已连接家庭 Wi-Fi
- ESP32 可通过 `http://192.168.1.18/` 在局域网本地控制
- ESP32 已连接公网 MQTT Broker
- 服务器通过 MQTT topic 可控制 GPIO2
- Home Assistant 已注册 `liuwb` 的 MQTT 实体

