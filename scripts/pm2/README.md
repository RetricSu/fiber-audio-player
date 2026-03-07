# Fiber Audio Player - PM2 Service Setup

This directory contains PM2 configuration and helper scripts for running the Fiber Audio Player backend using PM2 process manager.

## Overview

PM2 is a popular Node.js process manager that can keep the backend running, restart on crashes, and manage logs. These scripts provide a quick way to install, manage, and monitor the backend with PM2 instead of systemd.

## Prerequisites

- Linux distribution with Node.js 18+ and pnpm installed
- PM2 globally installed (`npm install -g pm2`)
- Fiber Audio Player project cloned to the server

## Environment Variables

Create a `.env` file in the `backend/` directory with these variables:

**Required:**
- `ADMIN_API_KEY` - Secret key for admin API access (generate a strong random string)
- `FIBER_RPC_URL` - URL to your Fiber node RPC (default: http://127.0.0.1:8227)

**Optional:**
- `PORT` - Server port (default: 8787)
- `PRICE_PER_SECOND_SHANNON` - Default price per second in Shannon (default: 10000)
- `INVOICE_CURRENCY` - Invoice currency (default: Fibd)
- `INVOICE_EXPIRY_SEC` - Invoice expiry time in seconds (default: 600)
- `UPLOADS_DIR` - Directory for audio file uploads (default: ./uploads)

Example `.env` file:
```
ADMIN_API_KEY=your-secret-admin-key-here
FIBER_RPC_URL=http://127.0.0.1:8227
PORT=8787
```

## Database Migrations

The backend uses SQLite with automatic migrations. On first startup:

1. Database file is created at `backend/data/podcast.db`
2. Schema migrations run automatically
3. No manual migration steps required

The database persists across restarts and contains:
- Podcasts and episodes metadata
- Payment sessions and invoices
- Stream grants

## Quick Start

### Installation

```bash
cd /path/to/fiber-audio-player
./scripts/pm2/install.sh
```

The installer will:
1. Check for Node.js, pnpm, and PM2
2. Install backend dependencies and build
3. Start the application using a PM2 ecosystem file
4. Configure PM2 to start on system boot

### Verification

```bash
pm2 status fiber-audio-backend
```

Health can also be checked with:

```bash
./scripts/pm2/health-check.sh
```

## Process Management Commands

```bash
pm2 start ecosystem.config.js          # start or restart app
pm2 stop fiber-audio-backend            # stop the process
pm2 restart fiber-audio-backend         # restart
pm2 delete fiber-audio-backend          # remove from PM2
```

## File Reference

| File | Description |
|------|-------------|
| `ecosystem.config.js` | PM2 ecosystem configuration for the backend |
| `install.sh` | Setup script (no sudo required) |
| `uninstall.sh` | Teardown script |
| `health-check.sh` | Health check utility |
| `README.md` | This documentation file |

## Customization

Edit `ecosystem.config.js` to change environment variables, port, or other PM2 options.

## Uninstallation

```bash
./scripts/pm2/uninstall.sh
```

This will stop and delete the PM2 process and remove the startup configuration.

## Troubleshooting

### Service fails to start

1. Check if ADMIN_API_KEY is set in backend/.env
2. Verify Fiber node is accessible at FIBER_RPC_URL
3. Check PM2 logs: `pm2 logs fiber-audio-backend --lines 100`
4. Ensure port 8787 is not in use: `ss -tlnp | grep 8787`

### Database permission errors

Ensure PM2 has write access to:
- `backend/data/` directory (for SQLite database)
- `backend/uploads/` directory (for audio file storage)

### Port already in use

Change the port in ecosystem.config.js or set PORT environment variable.

### General debugging

Check PM2 logs:

```bash
pm2 logs fiber-audio-backend --lines 100
```

Ensure PM2 is installed and your Node version is correct.
