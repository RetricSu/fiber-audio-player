# DevOps 操作手册 - Fiber Audio Player

## 概述

本手册指导 AI Agent（如 OpenClaw）如何部署、配置和维护 Fiber Audio Player 系统。

## 系统架构

```
服务器
├── Next.js 前端 (Port: 3000)
├── Hono 后端 (Port: 8787)
│   └── SQLite 数据库
├── 音频文件存储 (uploads/)
└── Fiber Network 节点
    ├── RPC: 127.0.0.1:8229
    └── P2P: 127.0.0.1:8228
```

## 部署清单

### 1. 环境检查

```bash
# 检查 Node.js (>= 18)
node --version

# 检查 pnpm
pnpm --version

# 检查端口占用
ss -tlnp | grep -E "(3000|8787|8228|8229)"

# 检查磁盘空间 (至少 10GB)
df -h
```

### 2. 初始设置

```bash
# 克隆仓库
cd /opt
git clone https://github.com/RetricSu/fiber-audio-player.git
cd fiber-audio-player
git checkout improve-backend

# 安装依赖
pnpm install
cd backend && pnpm install && cd ..
cd apps/cli && pnpm install && cd ../..
pnpm build
```

### 3. 配置文件

```bash
# 后端环境变量
cat > backend/.env << 'ENV'
PORT=8787
ADMIN_API_KEY=$(openssl rand -hex 32)
FIBER_RPC_URL=http://127.0.0.1:8229
PRICE_PER_SECOND_SHANNON=10000
INVOICE_CURRENCY=Fibt
INVOICE_EXPIRY_SEC=600
HLS_SEGMENT_DURATION_SEC=6
STREAM_AUTH_TTL_SEC=300
UPLOADS_DIR=./uploads
NODE_ENV=production
ENV
```

### 4. Fiber 节点设置

```bash
# 安装 fiber-pay CLI
pnpm add -g @fiber-pay/cli

# 初始化节点
fiber-pay config init --network testnet

# 启动节点
fiber-pay node start --daemon

# 获取测试网 CKB
fiber-pay wallet address
# 访问 https://testnet.ckbapp.dev/ 领取测试币

# 连接到公共节点
fiber-pay peer connect /ip4/18.162.235.225/tcp/8119/p2p/QmXen3eUHhywmutEzydCsW4hXBoeVmdET2FJvMX69XJ1Eo

# 打开支付通道
fiber-pay channel open --peer-id QmXen3eUHhywmutEzydCsW4hXBoeVmdET2FJvMX69XJ1Eo --amount 1000
```

### 5. 部署后端服务

```bash
# 使用 systemd
./scripts/systemd/install.sh
systemctl status fiber-audio-backend

# 或使用 PM2
./scripts/pm2/install.sh
pm2 status fiber-audio-backend
```

### 6. fap CLI 配置

```bash
cd apps/cli
pnpm build

# 登录
./bin/fap login --api-key "YOUR_API_KEY" --backend-url "http://localhost:8787"

# 验证
./bin/fap doctor
```

## 日常运维

### 每日检查

```bash
# 1. 检查服务状态
systemctl status fiber-audio-backend

# 2. 检查 Fiber 节点
fiber-pay node info
fiber-pay channel list

# 3. 检查后端健康
curl http://localhost:8787/healthz

# 4. 检查日志
journalctl -u fiber-audio-backend --since "24 hours ago" | grep -i error
```

### 内容管理

```bash
# 创建播客
./apps/cli/bin/fap podcast create --title "播客名称" --description "描述"

# 上传剧集
./apps/cli/bin/fap episode create \
  --podcast-id "PODCAST_ID" \
  --title "第1集" \
  --file ./audio.mp3 \
  --price-per-second 10000 \
  --publish

# 列出现有内容
./apps/cli/bin/fap podcast list
./apps/cli/bin/fap episode list --podcast-id "PODCAST_ID"
```

## 故障排除

### 后端无法启动

```bash
# 检查日志
journalctl -u fiber-audio-backend --lines 100

# 检查端口占用
ss -tlnp | grep 8787

# 检查数据库权限
ls -la backend/data/
```

### Fiber 节点问题

```bash
# 检查节点状态
fiber-pay node info

# 重启节点
fiber-pay node stop
fiber-pay node start --daemon

# 检查通道状态
fiber-pay channel list
```

### 支付问题

```bash
# 测试发票创建
fiber-pay invoice create --amount 100 --description "测试"

# 检查余额
fiber-pay wallet balance
```

## 紧急程序

### 完全重启

```bash
#!/bin/bash
systemctl stop fiber-audio-backend
fiber-pay node stop
sleep 10
fiber-pay node start --daemon
sleep 30
systemctl start fiber-audio-backend
```

### 数据库恢复

```bash
# 停止服务
systemctl stop fiber-audio-backend

# 备份损坏的数据库
mv backend/data/podcast.db backend/data/podcast.db.corrupted

# 从备份恢复
LATEST=$(ls -t /backups/podcast-*.db | head -1)
cp "$LATEST" backend/data/podcast.db

# 启动服务
systemctl start fiber-audio-backend
```

## 快速参考

### 状态检查
```bash
systemctl status fiber-audio-backend
fiber-pay node info
./apps/cli/bin/fap doctor
curl http://localhost:8787/healthz
```

### 内容操作
```bash
./apps/cli/bin/fap podcast create --title "名称" --description "描述"
./apps/cli/bin/fap episode create --podcast-id "ID" --title "标题" --file audio.mp3 --publish
./apps/cli/bin/fap episode list --podcast-id "ID"
```

### 节点操作
```bash
fiber-pay node info
fiber-pay wallet balance
fiber-pay channel list
fiber-pay peer list
```

## 支持资源

- 项目仓库: https://github.com/RetricSu/fiber-audio-player
- API 文档: docs/API.md
- CLI 文档: docs/cli.md
- Fiber Network: https://github.com/nervosnetwork/fiber

---

**版本:** 1.0  
**更新日期:** 2024-03-08  
**维护者:** AI Agent
