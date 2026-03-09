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

### 0. 环境准备

系统需要安装以下依赖：

**FFmpeg** (必需，用于音频转码和 HLS 切片)

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg

# macOS
brew install ffmpeg

# 验证安装
ffmpeg -version
```

**Node.js** (>= 18)

```bash
# 推荐使用 nvm 安装
nvm install 18
nvm use 18
```

**pnpm**

```bash
# 安装 pnpm
npm install -g pnpm
```

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
# 首次安装时会提示批准 onlyBuiltDependencies，选择 "Yes" 允许
pnpm install
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

#### 使用 PM2 (推荐)

PM2 配置使用 `node_args` 模式加载环境变量：

```javascript
// ecosystem.config.js 关键配置
node_args: "-r dotenv/config",
env: {
  DOTENV_CONFIG_PATH: "./backend/.env",
}
```

这样可以将环境变量保存在单独的文件中，避免在启动命令中暴露敏感信息。

```bash
# 安装并启动服务
./scripts/pm2/install.sh
pm2 status fiber-audio-backend
```

#### 使用 systemd

```bash
./scripts/systemd/install.sh
systemctl status fiber-audio-backend
```

### 6. fap CLI 配置

```bash
cd apps/cli
pnpm build
pnpm link --global

# fap 可用
fap -h

# 登录
fap login --api-key "YOUR_API_KEY" --backend-url "http://localhost:8787"

# 验证
fap doctor
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
fap podcast create --title "播客名称" --description "描述"

# 上传剧集
fap episode create \
  --podcast-id "PODCAST_ID" \
  --title "第1集" \
  --file ./audio.mp3 \
  --price-per-second 10000 \
  --publish

# 列出现有内容
fap podcast list
fap episode list --podcast-id "PODCAST_ID"
```

## 故障排除

### 后端无法启动

```bash
# 检查日志
pm2 logs fiber-audio-backend
# 或者
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
fiber-pay channel list --json
```

## 紧急程序

### 完全重启

```bash
#!/bin/bash
pm2 stop fiber-audio-backend # systemctl stop fiber-audio-backend
fiber-pay node stop
sleep 10
fiber-pay node start --daemon
sleep 30
pm2 start fiber-audio-backend #systemctl start fiber-audio-backend
```

### 数据库恢复

```bash
# 停止服务
pm2 stop fiber-audio-backend # systemctl stop fiber-audio-backend

# 备份损坏的数据库
mv backend/data/podcast.db backend/data/podcast.db.corrupted

# 从备份恢复
LATEST=$(ls -t /backups/podcast-*.db | head -1)
cp "$LATEST" backend/data/podcast.db

# 启动服务
pm2 start fiber-audio-backend #systemctl start fiber-audio-backend
```

### 手动转码工作流

当自动转码失败或需要重新转码时，使用以下步骤：

```bash
# 1. 准备环境
cd /opt/fiber-audio-player
source backend/.env

# 2. 确认原始文件存在（注意包含 Podcast ID 目录层级）
ls -la backend/uploads/${PODCAST_ID}/${EPISODE_ID}/original.*

# 3. 使用 API 重试转码
curl -X POST http://localhost:8787/admin/episodes/${EPISODE_ID}/retry-transcode \
  -H "Authorization: Bearer ${ADMIN_API_KEY}"

# 4. 验证转码结果
ls -la backend/uploads/${PODCAST_ID}/${EPISODE_ID}/hls/

# 5. 转码成功后，剧集状态会自动更新为 ready，需通过管理后台或调用 POST /admin/episodes/:id/publish 单独发布
```

### 剧集恢复程序

当剧集文件损坏或丢失时：

```bash
# 1. 确定需要恢复的剧集 ID
fap episode list --podcast-id ${PODCAST_ID}

# 2. 查找原始文件备份
# 检查以下位置：
# - /backups/episodes/
# - 本地备份目录
# - 上传时的临时目录

# 3. 如果找到原始文件备份（注意包含 Podcast ID 目录层级）
mkdir -p backend/uploads/${PODCAST_ID}/${EPISODE_ID}/
cp /path/to/backup/original.mp3 backend/uploads/${PODCAST_ID}/${EPISODE_ID}/original.mp3

# 4. 使用 API 重试转码
curl -X POST http://localhost:8787/admin/episodes/${EPISODE_ID}/retry-transcode \
  -H "Authorization: Bearer ${ADMIN_API_KEY}"

# 5. 验证恢复结果
# 检查 HLS 文件是否生成
ls backend/uploads/${PODCAST_ID}/${EPISODE_ID}/hls/
# 应该看到 playlist.m3u8 和多个 .ts 片段文件

# 6. 更新数据库状态（如需要）
# 转码成功后状态自动变为 ready，如需发布使用：
curl -X POST http://localhost:8787/admin/episodes/${EPISODE_ID}/publish \
  -H "Authorization: Bearer ${ADMIN_API_KEY}"
```

如果原始文件完全丢失：

```bash
# 1. 标记剧集为失效状态（使用管理 API）
curl -X POST http://localhost:8787/admin/episodes/${EPISODE_ID}/status \
  -H "Authorization: Bearer ${ADMIN_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"status": "failed"}'

# 2. 通知播客管理员重新上传
# 或使用 CLI 重新创建剧集
fap episode create \
  --podcast-id ${PODCAST_ID} \
  --title "${EPISODE_TITLE}" \
  --file ./new-audio.mp3 \
  --price-per-second ${PRICE} \
  --publish
```

## 快速参考

### 状态检查
```bash
pm2 status fiber-audio-backend #systemctl status fiber-audio-backend
fiber-pay node info
fap doctor
curl http://localhost:8787/healthz
```

### 内容操作
```bash
fap podcast create --title "名称" --description "描述"
fap episode create --podcast-id "ID" --title "标题" --file audio.mp3 --publish
fap episode list --podcast-id "ID"
```

### 节点操作
```bash
fiber-pay node info
fiber-pay node network
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
