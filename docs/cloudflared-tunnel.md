# Cloudflared Tunnel 部署指南 - Fiber Audio Player

## 概述

本指南指导 AI Agent 配置 [Cloudflare Tunnel](https://www.cloudflare.com/products/tunnel/)，将 Fiber Audio Player 后端服务安全地暴露到公网。通过使用 Cloudflare Tunnel，无需开放服务器端口或配置防火墙规则，即可让外部用户访问部署在内网或受限环境中的后端 API。

**解决的问题：**
- 服务器位于内网或没有公网 IP
- 不想暴露服务器端口到公网
- 需要简单的 HTTPS 和 DDoS 保护
- 避免配置复杂的反向代理和 SSL 证书

## 前置条件

在开始前，请确保满足以下条件：

**域名要求：**
- 拥有一个已在 Cloudflare 管理的域名
- 域名的 DNS 记录指向 Cloudflare 的 nameserver

**系统要求：**
- 服务器可以访问互联网（出站连接）
- 后端服务已部署并运行在本地端口（默认 8787）
- 具有 sudo 权限的用户账户

**网络要求：**
- 出站访问 Cloudflare 的边缘网络（端口 7844 TCP/UDP）
- 能够解析 `region1.v2.argotunnel.com` 和 `region2.v2.argotunnel.com`

## 部署步骤

### 0. 环境验证

在执行部署前，验证环境是否满足要求：

```bash
# 检查域名是否已添加到 Cloudflare
# 登录 Cloudflare Dashboard 确认域名状态为 "Active"

# 验证网络连通性
nc -uvz -w 3 198.41.192.167 7844

# 检查后端服务是否运行
curl http://localhost:8787/healthz

# 确认 cloudflared 未安装
which cloudflared || echo "cloudflared 未安装，继续部署"
```

### 1. 安装 cloudflared

根据服务器操作系统选择对应的安装方式：

**Ubuntu/Debian：**

```bash
# 添加 Cloudflare GPG 密钥
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null

# 添加软件源
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list

# 安装 cloudflared
sudo apt-get update && sudo apt-get install -y cloudflared

# 验证安装
cloudflared --version
```

**macOS（开发环境）：**

```bash
brew install cloudflared
cloudflared --version
```

### 2. 认证

首次使用需要在浏览器中完成 Cloudflare 账户认证：

```bash
# 执行登录命令，会自动打开浏览器
cloudflared tunnel login
```

**认证过程：**
1. 命令会输出一个 URL，在浏览器中打开
2. 登录 Cloudflare 账户
3. 选择要授权的根域名
4. 浏览器显示 "Success" 后，回到终端

**验证认证结果：**

```bash
# 检查凭证文件是否生成
ls -la ~/.cloudflared/cert.pem

# 设置正确的权限
chmod 600 ~/.cloudflared/cert.pem
```

### 3. 创建 Tunnel

创建一个新的 tunnel 用于 Fiber Audio Player：

```bash
# 创建名为 fiber-audio-player 的 tunnel
cloudflared tunnel create fiber-audio-player

# 记录输出的 Tunnel UUID，后续配置需要用到
# 示例输出：Tunnel credentials written to /root/.cloudflared/6ff42ae2-765d-4adf-8112-31c55c1551ef.json
```

**获取 Tunnel UUID：**

```bash
# 列出所有 tunnels
cloudflared tunnel list

# 查看 tunnel 详情
cloudflared tunnel info fiber-audio-player
```

### 4. 配置 DNS 路由

为后端服务配置域名指向 tunnel：

```bash
# 假设你的域名是 example.com，子域名 api.example.com 用于后端
cloudflared tunnel route dns fiber-audio-player api.example.com

# 如果需要前端也通过 tunnel 暴露（可选）
cloudflared tunnel route dns fiber-audio-player app.example.com
```

**验证 DNS 记录：**

```bash
# 检查 DNS 记录是否创建成功
dig A api.example.com

# 应该返回 CNAME 记录指向 <UUID>.cfargotunnel.com
```

### 5. 创建配置文件

创建 tunnel 的配置文件：

```bash
# 获取 Tunnel UUID
TUNNEL_UUID=$(cloudflared tunnel list --output=json 2>/dev/null | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Tunnel UUID: $TUNNEL_UUID"

# 创建配置文件目录
sudo mkdir -p /etc/cloudflared

# 创建配置文件
sudo tee /etc/cloudflared/config.yml << EOF
tunnel: ${TUNNEL_UUID}
credentials-file: /root/.cloudflared/${TUNNEL_UUID}.json

# 连接参数
protocol: auto

# 日志设置
logfile: /var/log/cloudflared/cloudflared.log
loglevel: info

# 后端服务路由配置
ingress:
  # Fiber Audio Player 后端 API
  - hostname: api.example.com
    service: http://localhost:8787
    originRequest:
      connectTimeout: 30s
      tlsTimeout: 10s
      keepAliveTimeout: 1m30s
  
  # 可选：前端应用
  # - hostname: app.example.com
  #   service: http://localhost:3000
  
  # 健康检查端点
  - hostname: health.example.com
    service: http://localhost:8787/healthz
  
  # 必须的 catch-all 规则
  - service: http_status:404
EOF

# 创建日志目录
sudo mkdir -p /var/log/cloudflared
```

**配置文件说明：**

| 配置项 | 说明 | 推荐值 |
|--------|------|--------|
| `tunnel` | Tunnel UUID | 从创建步骤获取 |
| `credentials-file` | 凭证文件路径 | `/root/.cloudflared/<UUID>.json` |
| `protocol` | 连接协议 | `auto`（自动选择）或 `http2` |
| `ingress` | 路由规则 | 根据服务配置 |

**更新配置中的域名：**

将 `api.example.com` 和 `health.example.com` 替换为实际的域名：

```bash
# 设置实际域名
DOMAIN="your-domain.com"
sudo sed -i "s/api.example.com/api.${DOMAIN}/g" /etc/cloudflared/config.yml
sudo sed -i "s/health.example.com/health.${DOMAIN}/g" /etc/cloudflared/config.yml
```

### 6. 安装为系统服务

将 cloudflared 配置为 systemd 服务，实现开机自启：

```bash
# 安装服务（使用配置文件 /etc/cloudflared/config.yml）
sudo cloudflared service install

# 验证服务文件
ls -la /etc/systemd/system/cloudflared.service
```

**服务管理命令：**

```bash
# 启动服务
sudo systemctl start cloudflared

# 查看服务状态
sudo systemctl status cloudflared

# 设置开机自启
sudo systemctl enable cloudflared

# 查看日志
sudo journalctl -u cloudflared -f
```

### 7. 验证部署

部署完成后，验证 tunnel 是否正常工作：

```bash
# 1. 检查服务状态
sudo systemctl status cloudflared

# 2. 查看 tunnel 连接状态
cloudflared tunnel info fiber-audio-player

# 3. 测试公网访问（替换为实际域名）
curl -I https://api.example.com/healthz

# 4. 查看实时日志
sudo journalctl -u cloudflared --since "5 minutes ago" -f
```

**期望的输出：**
- 服务状态显示 `active (running)`
- Tunnel 状态显示 `Healthy`（4 个活跃连接）
- HTTP 请求返回 200 OK

## 日常运维

### 检查 Tunnel 状态

```bash
# 查看所有 tunnels
cloudflared tunnel list

# 查看特定 tunnel 详情
cloudflared tunnel info fiber-audio-player

# 检查服务状态
sudo systemctl status cloudflared

# 查看最近日志
sudo journalctl -u cloudflared --since "1 hour ago"
```

### 更新配置

修改配置后需要重启服务：

```bash
# 编辑配置
sudo nano /etc/cloudflared/config.yml

# 验证配置语法
sudo cloudflared tunnel ingress validate /etc/cloudflared/config.yml

# 测试特定 URL 匹配哪个规则
sudo cloudflared tunnel ingress rule https://api.example.com/healthz

# 重启服务
sudo systemctl restart cloudflared

# 验证重启成功
sudo systemctl status cloudflared
curl -I https://api.example.com/healthz
```

### 监控和日志

```bash
# 实时查看日志
sudo journalctl -u cloudflared -f

# 查看特定时间段的日志
sudo journalctl -u cloudflared --since "1 hour ago" --until "30 minutes ago"

# 按日志级别过滤
sudo journalctl -u cloudflared | grep -i error

# 查看 cloudflared 专用日志文件
sudo tail -f /var/log/cloudflared/cloudflared.log
```

## 故障排除

### Tunnel 无法启动

**现象：** `systemctl status cloudflared` 显示 failed

```bash
# 检查日志获取详细错误
sudo journalctl -u cloudflared --no-pager --lines=50

# 常见原因 1：凭证文件不存在
ls -la /root/.cloudflared/*.json

# 常见原因 2：配置文件语法错误
sudo cloudflared tunnel ingress validate /etc/cloudflared/config.yml

# 手动测试运行（查看详细错误）
sudo cloudflared tunnel run fiber-audio-player
```

### Error 1033: Tunnel 未连接

**现象：** 浏览器访问域名显示 "Error 1033: Argo Tunnel error"

```bash
# 检查服务是否运行
sudo systemctl status cloudflared

# 检查网络连通性
nc -vz 198.41.192.167 7844

# 重启服务
sudo systemctl restart cloudflared

# 如果 UDP 被防火墙阻止，强制使用 HTTP/2
# 在 config.yml 中添加：protocol: http2
```

### Error 502: Bad Gateway

**现象：** 浏览器显示 "502 Bad Gateway"

```bash
# 检查后端服务是否运行
curl http://localhost:8787/healthz

# 检查端口绑定
ss -tlnp | grep 8787

# 确认配置中的 service 地址正确
# 如果后端使用 HTTPS，需要配置 originRequest
```

**修复 HTTPS 后端：**

```yaml
# 在 config.yml 中修改
ingress:
  - hostname: api.example.com
    service: https://localhost:8787
    originRequest:
      noTLSVerify: true  # 如果是自签名证书
      # 或者指定 CA
      # caPool: /path/to/ca.pem
```

### DNS 记录已存在

**现象：** 执行 `tunnel route dns` 时报错 "An A, AAAA, or CNAME record already exists"

```bash
# 方法 1：在 Cloudflare Dashboard 手动删除现有 DNS 记录
# 然后重新执行 route dns

# 方法 2：使用强制覆盖（-f 标志）
cloudflared tunnel route dns -f fiber-audio-player api.example.com
```

### Tunnel 连接不稳定

**现象：** Tunnel 经常断开或重连

```bash
# 检查网络稳定性
ping 198.41.192.167

# 查看重连日志
sudo journalctl -u cloudflared | grep -i "reconnect\|retry"

# 强制使用 HTTP/2 协议（如果 UDP 不稳定）
# 在 config.yml 中添加：
# protocol: http2

# 增加重连参数（可选）
# 在 config.yml 中添加：
# retries: 10
```

### 证书过期

**现象：** 认证失败，提示证书问题

```bash
# 重新登录获取新证书
cloudflared tunnel login

# 更新配置文件中的凭证路径
# 如果 UUID 变化，需要更新 config.yml
```

## 高级配置

### 多服务路由

如果同时暴露前端和后端：

```yaml
ingress:
  # API 后端
  - hostname: api.example.com
    service: http://localhost:8787
  
  # 前端应用
  - hostname: app.example.com
    service: http://localhost:3000
  
  # 静态资源（可选）
  - hostname: assets.example.com
    service: http://localhost:3000
    path: "\\.(js|css|png|jpg)$"
  
  - service: http_status:404
```

### 使用环境变量

```bash
# 在 systemd 服务中设置环境变量
sudo systemctl edit cloudflared

# 添加：
[Service]
Environment="TUNNEL_UUID=your-uuid-here"
Environment="DOMAIN=example.com"
```

### 配置日志轮转

```bash
# 创建 logrotate 配置
sudo tee /etc/logrotate.d/cloudflared << 'EOF'
/var/log/cloudflared/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0600 root root
    postrotate
        systemctl reload cloudflared
    endscript
}
EOF
```

## 安全建议

1. **限制凭证文件权限：**
   ```bash
   chmod 600 /root/.cloudflared/*.json
   chmod 600 /root/.cloudflared/cert.pem
   ```

2. **使用专用服务账户（可选）：**
   ```bash
   # 创建专用用户
   sudo useradd -r -s /bin/false cloudflared
   
   # 修改服务文件以使用该用户
   sudo systemctl edit cloudflared
   # 添加：
   # [Service]
   # User=cloudflared
   # Group=cloudflared
   ```

3. **启用 Cloudflare 安全功能：**
   - 在 Cloudflare Dashboard 中启用 "Always Use HTTPS"
   - 配置适当的防火墙规则
   - 启用 DDoS 保护（默认启用）

## 参考资源

- [Cloudflare Tunnel 官方文档](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)
- [配置文件参考](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/)
- [故障排除指南](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/troubleshoot-tunnels/common-errors/)
- [Fiber Audio Player DevOps 手册](./devops-manual.md)

---

**版本：** 1.0  
**更新日期：** 2024-03-09  
**维护者：** AI Agent
