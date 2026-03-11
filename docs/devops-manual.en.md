# DevOps Manual - Fiber Audio Player

## Overview

This manual guides AI Agents (such as OpenClaw) on how to deploy, configure, and maintain the Fiber Audio Player system.

## System Architecture

```
Server
├── Next.js Frontend (Port: 3000)
├── Hono Backend (Port: 8787)
│   └── SQLite Database
├── Audio File Storage (uploads/)
└── Fiber Network Node
    ├── RPC: 127.0.0.1:8229
    └── P2P: 127.0.0.1:8228
```

## Deployment Checklist

### 0. Environment Preparation

The system requires the following dependencies:

**FFmpeg** (Required, for audio transcoding and HLS segmentation)

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg

# macOS
brew install ffmpeg

# Verify installation
ffmpeg -version
```

**Node.js** (>= 18)

```bash
# Recommended to install via nvm
nvm install 18
nvm use 18
```

**pnpm**

```bash
# Install pnpm
npm install -g pnpm
```

### 1. Environment Check

```bash
# Check Node.js (>= 18)
node --version

# Check pnpm
pnpm --version

# Check port usage
ss -tlnp | grep -E "(3000|8787|8228|8229)"

# Check disk space (at least 10GB)
df -h
```

### 2. Initial Setup

```bash
# Clone repository
cd /opt
git clone https://github.com/RetricSu/fiber-audio-player.git
cd fiber-audio-player
git checkout improve-backend

# Install dependencies
# When installing for the first time, you will be prompted to approve onlyBuiltDependencies, select "Yes" to allow
pnpm install
pnpm build
```

### 3. Configuration File

```bash
# Backend environment variables
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

### 4. Fiber Node Setup

```bash
# Install fiber-pay CLI
pnpm add -g @fiber-pay/cli

# Initialize node
fiber-pay config init --network testnet

# Start node
fiber-pay node start --daemon

# Get testnet CKB
fiber-pay wallet address
# Visit https://testnet.ckbapp.dev/ to claim test tokens

# Connect to public node
fiber-pay peer connect /ip4/18.162.235.225/tcp/8119/p2p/QmXen3eUHhywmutEzydCsW4hXBoeVmdET2FJvMX69XJ1Eo

# Open payment channel
fiber-pay channel open --peer-id QmXen3eUHhywmutEzydCsW4hXBoeVmdET2FJvMX69XJ1Eo --amount 1000
```

### 5. Deploy Backend Service

#### Using PM2 (Recommended)

PM2 configuration uses `node_args` mode to load environment variables:

```javascript
// ecosystem.config.js key configuration
node_args: "-r dotenv/config",
env: {
  DOTENV_CONFIG_PATH: "./backend/.env",
}
```

This allows environment variables to be stored in a separate file, avoiding exposure of sensitive information in startup commands.

```bash
# Install and start service
./scripts/pm2/install.sh
pm2 status fiber-audio-backend
```

#### Using systemd

```bash
./scripts/systemd/install.sh
systemctl status fiber-audio-backend
```

### 6. fap CLI Configuration

```bash
cd apps/cli
pnpm build
pnpm link --global

# fap is available
fap -h

# Login
fap login --api-key "YOUR_API_KEY" --backend-url "http://localhost:8787"

# Verify
fap doctor
```

## Daily Operations

### Daily Checks

```bash
# 1. Check service status
systemctl status fiber-audio-backend

# 2. Check Fiber node
fiber-pay node info
fiber-pay channel list

# 3. Check backend health
curl http://localhost:8787/healthz

# 4. Check logs
journalctl -u fiber-audio-backend --since "24 hours ago" | grep -i error
```

### Content Management

```bash
# Create podcast
fap podcast create --title "Podcast Name" --description "Description"

# Upload episode
fap episode create \
  --podcast-id "PODCAST_ID" \
  --title "Episode 1" \
  --file ./audio.mp3 \
  --price-per-second 10000 \
  --publish

# List existing content
fap podcast list
fap episode list --podcast-id "PODCAST_ID"
```

## Troubleshooting

### Backend Won't Start

```bash
# Check logs
pm2 logs fiber-audio-backend
# or
journalctl -u fiber-audio-backend --lines 100

# Check port usage
ss -tlnp | grep 8787

# Check database permissions
ls -la backend/data/
```

### Fiber Node Issues

```bash
# Check node status
fiber-pay node info

# Restart node
fiber-pay node stop
fiber-pay node start --daemon

# Check channel status
fiber-pay channel list
```

### Payment Issues

```bash
# Test invoice creation
fiber-pay invoice create --amount 100 --description "Test"

# Check balance
fiber-pay channel list --json
```

## Emergency Procedures

### Complete Restart

```bash
#!/bin/bash
pm2 stop fiber-audio-backend # systemctl stop fiber-audio-backend
fiber-pay node stop
sleep 10
fiber-pay node start --daemon
sleep 30
pm2 start fiber-audio-backend #systemctl start fiber-audio-backend
```

### Database Recovery

```bash
# Stop service
pm2 stop fiber-audio-backend # systemctl stop fiber-audio-backend

# Backup corrupted database
mv backend/data/podcast.db backend/data/podcast.db.corrupted

# Restore from backup
LATEST=$(ls -t /backups/podcast-*.db | head -1)
cp "$LATEST" backend/data/podcast.db

# Start service
pm2 start fiber-audio-backend #systemctl start fiber-audio-backend
```

### Manual Transcoding Workflow

When automatic transcoding fails or re-transcoding is needed, use the following steps:

```bash
# 1. Prepare environment
cd /opt/fiber-audio-player
source backend/.env

# 2. Confirm original file exists (note the Podcast ID directory level)
ls -la backend/uploads/${PODCAST_ID}/${EPISODE_ID}/original.*

# 3. Use API to retry transcoding
curl -X POST http://localhost:8787/admin/episodes/${EPISODE_ID}/retry-transcode \
  -H "Authorization: Bearer ${ADMIN_API_KEY}"

# 4. Verify transcoding results
ls -la backend/uploads/${PODCAST_ID}/${EPISODE_ID}/hls/

# 5. After successful transcoding, the episode status will automatically update to ready, but publishing must be done separately via admin panel or by calling POST /admin/episodes/:id/publish
```

### Episode Recovery Procedure

When episode files are corrupted or lost:

```bash
# 1. Identify the episode ID that needs recovery
fap episode list --podcast-id ${PODCAST_ID}

# 2. Find original file backup
# Check the following locations:
# - /backups/episodes/
# - Local backup directory
# - Temporary directory during upload

# 3. If original file backup is found (note the Podcast ID directory level)
mkdir -p backend/uploads/${PODCAST_ID}/${EPISODE_ID}/
cp /path/to/backup/original.mp3 backend/uploads/${PODCAST_ID}/${EPISODE_ID}/original.mp3

# 4. Use API to retry transcoding
curl -X POST http://localhost:8787/admin/episodes/${EPISODE_ID}/retry-transcode \
  -H "Authorization: Bearer ${ADMIN_API_KEY}"

# 5. Verify recovery results
# Check if HLS files are generated
ls backend/uploads/${PODCAST_ID}/${EPISODE_ID}/hls/
# Should see playlist.m3u8 and multiple .ts segment files

# 6. Update database status (if needed)
# After successful transcoding, status automatically becomes ready, to publish use:
curl -X POST http://localhost:8787/admin/episodes/${EPISODE_ID}/publish \
  -H "Authorization: Bearer ${ADMIN_API_KEY}"
```

If the original file is completely lost:

```bash
# 1. Mark episode as failed status (using admin API)
curl -X POST http://localhost:8787/admin/episodes/${EPISODE_ID}/status \
  -H "Authorization: Bearer ${ADMIN_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"status": "failed"}'

# 2. Notify podcast administrator to re-upload
# Or recreate episode using CLI
fap episode create \
  --podcast-id ${PODCAST_ID} \
  --title "${EPISODE_TITLE}" \
  --file ./new-audio.mp3 \
  --price-per-second ${PRICE} \
  --publish
```

## Quick Reference

### Status Checks
```bash
pm2 status fiber-audio-backend #systemctl status fiber-audio-backend
fiber-pay node info
fap doctor
curl http://localhost:8787/healthz
```

### Content Operations
```bash
fap podcast create --title "Name" --description "Description"
fap episode create --podcast-id "ID" --title "Title" --file audio.mp3 --publish
fap episode list --podcast-id "ID"
```

### Node Operations
```bash
fiber-pay node info
fiber-pay node network
fiber-pay channel list
fiber-pay peer list
```

## Support Resources

- Project Repository: https://github.com/RetricSu/fiber-audio-player
- API Documentation: docs/API.md
- CLI Documentation: docs/cli.md
- Fiber Network: https://github.com/nervosnetwork/fiber

---

**Version:** 1.0  
**Updated:** 2024-03-08  
**Maintainer:** AI Agent
