# RTMP服务部署说明

## 当前线上状态

- 服务器：`82.156.45.208`
- RTMP服务：`SRS 6.0.48`
- 安装目录：`/usr/local/srs`
- 服务名：`srs`

当前已启用端口：

- `1935`：RTMP 推流
- `1985`：SRS HTTP API
- `8080`：HTTP Server，当前可用于 HLS 和 HTTP-FLV

## 当前可用地址

- RTMP 推流基础地址：`rtmp://82.156.45.208/live`
- SRS API：`http://82.156.45.208:1985/api/v1/versions`
- HLS 播放示例：`http://82.156.45.208:8080/live/<stream>.m3u8`
- HTTP-FLV 示例：`http://82.156.45.208:8080/live/<stream>.flv`

## 摄像头填写方式

如果摄像头界面分开填写“服务器地址”和“流名”：

- 服务器地址：`rtmp://82.156.45.208/live`
- 流名：`CAM-EAST-001`

最终推流地址等价于：

```text
rtmp://82.156.45.208/live/CAM-EAST-001
```

如果摄像头界面只给一个完整地址输入框，直接填写：

```text
rtmp://82.156.45.208/live/CAM-EAST-001
```

## 平台内推荐配置

媒体节点建议填写：

- 主机地址：`82.156.45.208`
- RTMP 基础地址：`rtmp://82.156.45.208/live`
- HLS 基础地址：`http://82.156.45.208:8080/live`
- API 地址：`http://82.156.45.208:1985`

摄像头建议填写：

- 主流协议：`RTMP`
- 源流地址：`rtmp://82.156.45.208/live/CAM-EAST-001`
- 转出地址：`http://82.156.45.208:8080/live/CAM-EAST-001.m3u8`

## 服务管理命令

```bash
systemctl status srs
systemctl restart srs
systemctl stop srs
journalctl -u srs -n 100 --no-pager
```

## 配置文件

- 主配置：`/usr/local/srs/conf/srs.conf`
- systemd：`/usr/lib/systemd/system/srs.service`

## 验证命令

检查 API：

```bash
curl http://82.156.45.208:1985/api/v1/versions
```

检查 HLS：

```bash
curl -I http://82.156.45.208:8080/live/codex-test.m3u8
```

本次已验证以下推流地址可用：

```text
rtmp://82.156.45.208/live/codex-test
```

## 说明

当前已经完成 RTMP 服务部署和对外端口验证，但平台本身仍然是“登记媒体节点和流地址”的模式，不负责复杂转码编排。后续如果需要更完整的视频能力，可以继续在 SRS 基础上补：

- 自动拉流
- 多路转码
- WebRTC
- 鉴权播放
- 录像归档
