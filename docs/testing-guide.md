# End-to-End Testing Guide

This guide covers complete testing of Fiber Audio Player with multi-podcast backend.

## Architecture Overview

```
┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
│   Next.js Frontend│  ──────▶ │   Hono Backend   │  ──────▶ │  Developer Node  │
│  (User Browser)   │          │  :8787           │          │  RPC :8229       │
│                   │          │                  │          │  P2P :8228       │
│  User Node (:8229)│          │  - Podcast CRUD  │          │                  │
│                   │          │  - Episode Mgmt  │          │  (Payment        │
│                   │          │  - Payments      │          │   Recipient)     │
└───────┬───────────┘          └──────────────────┘          └────────┬─────────┘
        │                                                             │
        │               ┌──────────────────┐                          │
        └──────────────▶│   Public Node    │◀─────────────────────────┘
                        │  (Relay)         │
                        │  Testnet         │
                        └──────────────────┘
```

**Payment Flow:**

1. User selects episode and clicks play
2. Frontend creates payment session via backend
3. Backend creates hold invoice on developer node
4. Frontend pays invoice via user's Fiber node
5. Backend verifies payment and settles invoice
6. Backend returns stream token for authorized playback

---

## Prerequisites

- **Node.js** ≥ 18
- **pnpm** ≥ 9
- **fiber-pay CLI** (manage Fiber nodes)

### Install fiber-pay CLI

```bash
pnpm add -g @fiber-pay/cli
fiber-pay --version
```

---

## Step 1: Start Developer Fiber Node (Payment Recipient)

This node receives payments from users.

### 1.1 Initialize and Start

```bash
# Initialize default profile
fiber-pay config init --network testnet

# Start node
fiber-pay node start --daemon

# Verify
fiber-pay node info
```

### 1.2 Get Testnet CKB

```bash
# Get address
fiber-pay wallet address

# Visit https://testnet.ckbapp.dev/ and request test tokens
# Check balance
fiber-pay wallet balance
```

### 1.3 Connect to Public Node

```bash
fiber-pay peer connect /ip4/18.162.235.225/tcp/8119/p2p/QmXen3eUHhywmutEzydCsW4hXBoeVmdET2FJvMX69XJ1Eo
```

---

## Step 2: Start User Fiber Node (Payment Sender)

Run a second node for making payments.

### 2.1 Create User Profile

```bash
fiber-pay --profile user config init \
  --network testnet \
  --rpc-port 28227 \
  --p2p-port 28228 \
  --proxy-port 28229
```

### 2.2 Start and Fund

```bash
# Start node
fiber-pay --profile user node start --daemon

# Get address and fund
fiber-pay --profile user wallet address
# Visit faucet and request tokens
```

### 2.3 Connect to Public Node

```bash
fiber-pay --profile user peer connect /ip4/18.162.235.225/tcp/8119/p2p/QmXen3eUHhywmutEzydCsW4hXBoeVmdET2FJvMX69XJ1Eo
```

---

## Step 3: Open Payment Channels

For multi-hop routing through public nodes:

```bash
# Developer node → Public node
fiber-pay channel open \
  --peer-id QmXen3eUHhywmutEzydCsW4hXBoeVmdET2FJvMX69XJ1Eo \
  --amount 1000

# User node → Public node
fiber-pay --profile user channel open \
  --peer-id QmXen3eUHhywmutEzydCsW4hXBoeVmdET2FJvMX69XJ1Eo \
  --amount 1000

# Wait for ChannelReady status
fiber-pay channel list
fiber-pay --profile user channel list
```

---

## Step 4: Setup Backend

### 4.1 Configure Environment

Create `backend/.env`:

```env
PORT=8787
FIBER_RPC_URL=http://127.0.0.1:8229
PRICE_PER_SECOND_SHANNON=10000
INVOICE_CURRENCY=Fibt
INVOICE_EXPIRY_SEC=600
HLS_SEGMENT_DURATION_SEC=6
STREAM_AUTH_TTL_SEC=300
ADMIN_API_KEY=your-secret-key
```

### 4.2 Install and Start

```bash
# From project root
pnpm install

# Start backend
pnpm dev:api

# Or start both frontend and backend
pnpm dev
```

---

## Step 5: Create Test Content (Optional)

You can create test content using either the **CLI** (faster and easier) or direct **API calls**.

### Option A: Using the CLI (Recommended)

```bash
# 1. Build and authenticate
 cd apps/cli && pnpm build
 fap auth login --api-key "your-secret-key"

 # 2. Create podcast
 PODCAST=$(fap podcast create --title "Test Podcast" --description "For testing" --format json)
 PODCAST_ID=$(echo $PODCAST | jq -r '.id')

 # 3. Create episode with audio upload
 fap episode create \
   --podcast-id "$PODCAST_ID" \
   --title "Test Episode" \
   --description "Test" \
   --price-per-second 10000 \
   --file /path/to/audio.mp3 \
   --wait \
   --publish
```

### Option B: Using cURL

```bash
API_KEY="your-secret-key"
BASE_URL="http://localhost:8787"

# Create podcast
PODCAST=$(curl -s -X POST "$BASE_URL/admin/podcasts" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Podcast", "description": "For testing"}')
PODCAST_ID=$(echo $PODCAST | jq -r '.podcast.id')

# Create episode
EPISODE=$(curl -s -X POST "$BASE_URL/admin/episodes" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"podcast_id\": \"$PODCAST_ID\", \"title\": \"Test Episode\", \"description\": \"Test\", \"price_per_second\": \"10000\"}")
EPISODE_ID=$(echo $EPISODE | jq -r '.episode.id')

# Upload audio
curl -X POST "$BASE_URL/admin/episodes/$EPISODE_ID/upload" \
  -H "Authorization: Bearer $API_KEY" \
  -F "file=@/path/to/audio.mp3;type=audio/mpeg"

# Wait for transcoding (check status), then publish
curl -X POST "$BASE_URL/admin/episodes/$EPISODE_ID/publish" \
  -H "Authorization: Bearer $API_KEY"
```

See the [CLI Reference](./cli.md) and [Admin Guide](./admin-guide.md) for more details.

---

## Step 6: Frontend Testing

### 6.1 Configure Frontend

Create `.env` in project root:

```env
NEXT_PUBLIC_BACKEND_BASE_URL=http://localhost:8787
NEXT_PUBLIC_BOOTNODE_MULTIADDR=/ip4/18.162.235.225/tcp/8119/p2p/QmXen3eUHhywmutEzydCsW4hXBoeVmdET2FJvMX69XJ1Eo
```

### 6.2 Start Frontend

```bash
pnpm dev:web
# Opens http://localhost:3000
```

### 6.3 Test Flow

1. **Connect Node**: Click "Connect Node" in header dropdown, enter RPC URL
2. **Browse Content**: Select podcast and episode from sidebar
3. **Play**: Click play button
4. **Watch Payments**: See real-time micropayments in payment history
5. **Listen**: Audio plays seamlessly as payments process

---

## Manual API Testing

### Health Check

```bash
curl http://localhost:8787/healthz
```

### Get Backend Node Info

```bash
curl http://localhost:8787/node-info
```

### Create Session

```bash
curl -X POST http://localhost:8787/api/sessions/create \
  -H "Content-Type: application/json" \
  -d '{"episodeId": "your-episode-id"}'
```

### Create Invoice

```bash
curl -X POST http://localhost:8787/api/invoices/create \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "session-id", "seconds": 30}'
```

### Pay Invoice (CLI)

```bash
fiber-pay --profile user payment send <invoice-address> --wait
```

### Claim Invoice

```bash
curl -X POST http://localhost:8787/api/invoices/claim \
  -H "Content-Type: application/json" \
  -d '{"paymentHash": "0x..."}'
```

---

## Troubleshooting

### "No path found" Error

- Ensure both nodes connected to same public node
- Check channel status is `ChannelReady`
- Verify sufficient outbound liquidity

### Audio Not Playing

- Check episode status is `published`
- Verify transcoding completed (status: `ready`)
- Check browser console for CORS errors

### Payment Timeouts

- Verify invoice created successfully
- Check user node has sufficient balance
- Ensure payment route exists through public node

### Backend Connection Failed

- Verify backend running: `curl http://localhost:8787/healthz`
- Check `FIBER_RPC_URL` points to correct developer node port
- With CLI: `fap auth doctor` to diagnose connection issues

### CLI Authentication Errors

**Problem:** "Not authenticated" or "Invalid API key" errors.

**Solution:**
```bash
# Check current config
fap auth config

# Re-authenticate
fap auth login --api-key "your-key" --backend-url "http://localhost:8787"

# Run diagnostics
fap auth doctor
```

---

## Port Reference

| Service | Default Port | Description |
|---------|-------------|-------------|
| Next.js Frontend | 3000 | Browser access |
| Hono Backend | 8787 | API server |
| Developer Fiber RPC | 8229 | Backend invoice operations |
| Developer Fiber P2P | 8228 | Node communication |
| User Fiber RPC | 28229 | Frontend payment operations |
| User Fiber P2P | 28228 | Node communication |

---

## Quick Checklist

- [ ] Developer node running (`fiber-pay node info`)
- [ ] User node running (`fiber-pay --profile user node info`)
- [ ] Both nodes connected to public node
- [ ] Payment channels open and ready
- [ ] Backend `.env` configured
- [ ] Frontend `.env` configured
- [ ] Dependencies installed (`pnpm install`)
- [ ] Backend started (`pnpm dev:api`)
- [ ] Frontend started (`pnpm dev:web`)
- [ ] Test content created (or existing content available)
- [ ] CLI authenticated (`fap auth doctor`)
