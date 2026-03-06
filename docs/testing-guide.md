# End-to-End Testing Guide

本文档介绍如何在本地运行完整的 Fiber Audio Player 支付流测试。

## 架构概览

```
┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
│   Next.js 前端   │  ──────▶ │   Hono 后端      │  ──────▶ │ 开发者 Fiber 节点 │
│  (用户浏览器)     │          │  :8787           │          │  RPC :28229       │
│                  │          │                  │          │  P2P :28228       │
│  管理用户 Fiber   │          │  创建 Hold Invoice│          │                  │
│  节点 (:8229)    │          │  验证支付 → 结算   │          │  收款方           │
└───────┬──────────┘          └──────────────────┘          └────────┬─────────┘
        │                                                           │
        │               ┌──────────────────┐                        │
        └──────────────▶│   公共节点       │◀───────────────────────┘
                        │  (公共中继节点)    │
                        │  Testnet         │
                        └──────────────────┘
```

**支付流程：**

1. 前端向后端请求创建 Session
2. 前端向后端请求创建 Hold Invoice（后端生成 preimage，只把 payment_hash 给 Fiber 节点）
3. 前端通过用户的 Fiber 节点向 invoice 付款（`sendPayment`）
4. 后端轮询 Fiber 节点，等待 invoice 状态变为 `Received`
5. 后端调用 `settleInvoice`（释放 preimage）完成支付
6. 后端返回 stream token，前端用此 token 请求 HLS 音频片段

---

## 前置条件

- **Node.js** ≥ 18
- **pnpm** ≥ 9
- **ffmpeg** + **openssl**（生成 HLS 音频）
- **fiber-pay CLI**（管理 Fiber 节点）

### 安装 fiber-pay CLI

```bash
# 使用 pnpm 全局安装（或 npm）
pnpm add -g @fiber-pay/cli

# 验证安装
fiber-pay --version
```

如果已安装，确认版本 ≥ 0.1.0-rc.5。

---

## 第一步：准备 HLS 音频资源

跳过此步如果 `media/hls/` 目录下已有 `playlist.m3u8` 和 `segment_*.ts` 文件。

```bash
# 放置一个音频源文件
cp /path/to/your/audio.mp3 media/source/episode.mp3

# 执行转码脚本（生成 AES-128 加密的 HLS 切片）
chmod +x scripts/prepare-hls.sh
./scripts/prepare-hls.sh
```

脚本基于 `HLS_SEGMENT_DURATION_SEC`（默认 6 秒）切割音频，输出到 `media/hls/`。

---

## 第二步：启动开发者 Fiber 节点（收款方）

这是后端连接的 Fiber 节点，负责收取用户的支付。

### 2.1 初始化默认 profile

如果从未使用过 fiber-pay，先初始化配置：

```bash
fiber-pay config init --network testnet
```

这将在 `~/.fiber-pay/config.yml` 生成默认配置：
- RPC 端口：8227
- P2P 端口：8228
- RPC 代理端口：8229
- 网络：testnet

### 2.2 启动节点

```bash
fiber-pay node start --daemon
```

验证节点运行：

```bash
fiber-pay node status
```

应该可以看到 `node_id`、`addresses` 等信息。

### 2.3 获取 CKB 测试币

查看节点地址：

```bash
fiber-pay node status
```

前往 CKB testnet faucet 获取测试币：

> https://testnet.ckbapp.dev/

把显示的 funding addr 粘贴过去，申请测试币。等待几分钟后可查看余额：

```bash
fiber-pay node status
```

### 2.4 连接 公共节点

确保开发者节点可通过 公共节点 被发现：

```bash
fiber-pay peer connect /ip4/18.162.235.225/tcp/8119/p2p/QmXen3eUHhywmutEzydCsW4hXBoeVmdET2FJvMX69XJ1Eo
```

---

## 第三步：启动用户 Fiber 节点（付款方）

使用 fiber-pay 的 `--profile` 功能在同一台机器上运行第二个节点。

### 3.1 创建 user profile

```bash
fiber-pay --profile user config init \
  --network testnet \
  --rpc-port 28227 \
  --p2p-port 28228 \
  --proxy-port 28229
```

### 3.2 启动 user 节点

```bash
fiber-pay --profile user node start --daemon
```

验证：

```bash
fiber-pay --profile user node status
```

### 3.3 给 user 节点充值

```bash
fiber-pay --profile user node status
```

同样前往 faucet 领取测试币并等待到账。

### 3.4 连接 公共节点

```bash
fiber-pay --profile user peer connect /ip4/18.162.235.225/tcp/8119/p2p/QmXen3eUHhywmutEzydCsW4hXBoeVmdET2FJvMX69XJ1Eo
```

---

## 第四步：建立支付通道

用户节点需要与开发者节点之间存在支付路径。最简方式是通过 公共节点 中继。

### 通过 公共节点 中继

分别向 公共节点 开通道：

```bash
# 开发者节点开通道到 公共节点
fiber-pay channel open \
  --peer-id QmXen3eUHhywmutEzydCsW4hXBoeVmdET2FJvMX69XJ1Eo \
  --amount 1000

# 用户节点开通道到 公共节点
fiber-pay --profile user channel open \
  --peer-id QmXen3eUHhywmutEzydCsW4hXBoeVmdET2FJvMX69XJ1Eo \
  --amount 1000
```

注意：bootnode 通道自动接收为 1000 CKB，低于这个数字会被拒绝。

等待两个通道都变为 `ChannelReady`。这样用户支付时会自动路由：user → 公共节点 → developer。

---

## 第五步：配置环境变量

### 5.1 后端 `.env`

在 `backend/` 目录下创建 `.env`（可参考 `backend/.env.example`）：

```env
PORT=8787
FIBER_RPC_URL=http://127.0.0.1:28229
PRICE_PER_SECOND_SHANNON=10000
INVOICE_CURRENCY=Fibt
INVOICE_EXPIRY_SEC=600
HLS_DIR=../media/hls
HLS_SEGMENT_DURATION_SEC=6
STREAM_AUTH_TTL_SEC=300
```

> **注意**：`INVOICE_CURRENCY` 在 testnet 使用 `Fibt`。

### 5.2 前端 `.env`

在项目根目录创建/修改 `.env`：

```env
NEXT_PUBLIC_BACKEND_BASE_URL=http://localhost:8787
NEXT_PUBLIC_BOOTNODE_MULTIADDR=/ip4/18.162.235.225/tcp/8119/p2p/QmXen3eUHhywmutEzydCsW4hXBoeVmdET2FJvMX69XJ1Eo
NEXT_PUBLIC_STREAM_CHUNK_SECONDS=30
```

> 前端不需要手动配置收款方公钥。收款方信息会在页面加载时自动从后端 `/node-info` 接口获取。

---

## 第六步：安装依赖并启动

```bash
# 在项目根目录
pnpm install

# 同时启动前端和后端（一个命令）
pnpm dev
```

这会并行启动：
- Next.js 前端 — 默认 http://localhost:3000
- Hono 后端 — http://localhost:8787

也可以分别启动：

```bash
# 终端 1 — 后端
pnpm dev:api

# 终端 2 — 前端
pnpm dev:web
```

---

## 第七步：在浏览器中测试

### 7.1 打开页面

浏览器访问 http://localhost:3000

### 7.2 配置用户节点 RPC

页面顶部的 Node Status 区域应显示用户节点 RPC URL（默认 `http://127.0.0.1:8229`）。

如果用户节点 RPC 不是 8229 端口，在页面上修改。

### 7.3 测试连接

页面加载后应该能看到：
- Node Status 显示连接状态（绿色 = 已连接）
- 底部显示开发者节点信息（自动从后端获取）

### 7.4 播放音频

1. 点击 **Play** 按钮
2. 前端会自动：
   - 请求后端创建 Session
   - 请求后端创建 Hold Invoice（默认 30 秒）
   - 通过用户 Fiber 节点发送支付
   - 等待后端确认并结算
   - 获取 stream token，开始播放 HLS 音频
3. Payment History 面板可以看到支付记录

---

## 手动 API 测试（curl）

可以用 curl 单独测试后端各接口，不依赖前端。

### 检查后端健康

```bash
curl http://localhost:8787/healthz
# {"ok":true,"service":"fiber-audio-backend"}
```

### 获取开发者节点信息

```bash
curl http://localhost:8787/node-info
# {"ok":true,"node":{"nodeName":"...","nodeId":"0x...","addresses":[...]}}
```

### 创建 Session

```bash
curl -X POST http://localhost:8787/sessions/create \
  -H "Content-Type: application/json"
# {"ok":true,"session":{"sessionId":"...","pricePerSecondShannon":"0x2710","segmentDurationSec":6}}
```

### 创建 Invoice

```bash
curl -X POST http://localhost:8787/invoices/create \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<上一步的sessionId>","seconds":30}'
# {"ok":true,"invoice":{"invoiceAddress":"fibt...","paymentHash":"0x...","amountShannon":"0x...","seconds":30}}
```

### 通过用户节点付款

使用 fiber-pay CLI 发送支付：

```bash
fiber-pay --profile user payment send --invoice <invoiceAddress>
```

### Claim Invoice（后端验证+结算）

```bash
curl -X POST http://localhost:8787/invoices/claim \
  -H "Content-Type: application/json" \
  -d '{"paymentHash":"<创建invoice时返回的paymentHash>"}'
# 此接口会阻塞等待最多60秒，直到支付被确认并结算
# {"ok":true,"stream":{"token":"...","playlistUrl":"/stream/hls/playlist.m3u8?token=...","grantedSeconds":30,...}}
```

> **注意**：`/invoices/claim` 是长轮询接口。你需要先发起支付（上一步），然后调用 claim。
> 实际使用时前端会并行调用 `sendPayment` 和 `claimInvoice`。

### 请求 HLS 播放列表

```bash
curl "http://localhost:8787/stream/hls/playlist.m3u8?token=<上一步返回的token>"
```

### 请求音频片段

```bash
curl "http://localhost:8787/stream/hls/segment_000.ts?token=<token>" --output segment_000.ts
```

未授权的片段（超过 `maxSegmentIndex`）会返回 403。

---

## 常见问题排查

### 后端启动报错 "Failed to reach Fiber node"

- 确认开发者 Fiber 节点正在运行：`fiber-pay node info`
- 确认 `FIBER_RPC_URL` 端口正确（默认 8227）

### 前端页面报 "Failed to reach backend"

- 确认后端正在运行：`curl http://localhost:8787/healthz`
- 确认 `NEXT_PUBLIC_BACKEND_BASE_URL` 配置正确

### 支付超时 / Invoice claim 失败

- 确认用户节点和开发者节点之间有可用的支付通道
- 检查通道状态：`fiber-pay --profile user channel list`
- 确认通道余额充足
- 如果通过 公共节点 中继，确保两条通道都是 `ChannelReady`

### FNN 日志出现 `HoldTlcTimeout` 但后端显示 `Paid`

- 若后端日志已出现 `got status=Paid` 和 `SUCCESS: unlocking ...`，通常表示业务支付已成功。
- `HoldTlcTimeout` 在某些节点版本中可能是同一 `payment_hash` 的重试/清理路径日志，不一定代表最终支付失败。
- 可结合前端支付结果判断：当前实现会等待 payer 侧终态（`waitForPayment`），若最终失败会直接报错。

### Invoice 状态一直是 Open，没有变成 Received

- 支付可能没有发出去，检查用户节点日志
- 确认 `INVOICE_CURRENCY` 与节点网络匹配（testnet 用 `Fibt`，dev 用 `Fibd`）
- 确认路由可达（两个节点都连上了 公共节点 或直接有通道）

### HLS 播放失败

- 确认 `media/hls/` 下有 `playlist.m3u8` 和 `segment_*.ts` 文件
- 确认后端 `HLS_DIR` 指向正确路径
- 检查浏览器控制台是否有 CORS 或 401/403 错误

### 通道开通后一直 Pending

- 链上确认需要时间，testnet 出块间隔约 10 秒
- 可通过 `fiber-pay channel list` 查看状态变化
- 确认钱包余额足够（开通道需要锁定 CKB）

---

## 关键端口一览

| 服务 | 默认端口 | 说明 |
|------|---------|------|
| Next.js 前端 | 3000 | 浏览器访问入口 |
| Hono 后端 | 8787 | API 服务器 |
| 开发者 Fiber RPC | 8229 | 后端连接此节点创建/结算 invoice |
| 开发者 Fiber P2P | 8228 | 节点间通信 |
| 用户 Fiber RPC | 28229 | 前端连接此节点发送支付 |
| 用户 Fiber P2P | 28228 | 节点间通信 |

---

## 测试检查清单

- [ ] HLS 音频资源已生成（`media/hls/playlist.m3u8` 存在）
- [ ] 开发者 Fiber 节点运行中（`fiber-pay node info` 正常）
- [ ] 用户 Fiber 节点运行中（`fiber-pay --profile user node info` 正常）
- [ ] 两个节点都连接了 公共节点
- [ ] 支付通道已建立且状态为 `ChannelReady`
- [ ] 后端 `.env` 配置正确（`FIBER_RPC_URL`、`INVOICE_CURRENCY`）
- [ ] 前端 `.env` 配置正确（`BACKEND_BASE_URL`、`BOOTNODE_MULTIADDR`）
- [ ] `pnpm install` 已执行
- [ ] `pnpm dev` 启动无报错
- [ ] 浏览器访问 http://localhost:3000 页面正常加载
- [ ] 点击 Play 后支付成功、音频播放
