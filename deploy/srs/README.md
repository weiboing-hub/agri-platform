# SRS RTMP 部署记录

当前线上使用 `SRS 6.0.48` 作为 RTMP 服务，部署目标机：

- `82.156.45.208`

官方预编译包来源：

- `https://gitee.com/ossrs/srs/releases/download/v6.0.48/SRS-CentOS7-x86_64-6.0.48.zip`

线上安装步骤：

```bash
cd /usr/local/src
curl -L --fail -o srs6.0.48.zip https://gitee.com/ossrs/srs/releases/download/v6.0.48/SRS-CentOS7-x86_64-6.0.48.zip
unzip -oq srs6.0.48.zip -d /usr/local/src/srs6
cd /usr/local/src/srs6/SRS-CentOS7-x86_64-6.0.48
yum install -y redhat-lsb-core
bash ./INSTALL
systemctl start srs
systemctl enable srs
```

默认启用端口：

- `1935` RTMP
- `1985` API
- `8080` HLS/HTTP-FLV

推荐平台配置：

- RTMP 基础地址：`rtmp://82.156.45.208/live`
- HLS 基础地址：`http://82.156.45.208:8080/live`
- API 地址：`http://82.156.45.208:1985`
