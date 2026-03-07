# Fiber Audio Player - PM2 Service Setup

This directory contains PM2 configuration and helper scripts for running the Fiber Audio Player backend using PM2 process manager.

## Overview

PM2 is a popular Node.js process manager that can keep the backend running, restart on crashes, and manage logs. These scripts provide a quick way to install, manage, and monitor the backend with PM2 instead of systemd.

## Prerequisites

- Linux distribution with Node.js 18+ and pnpm installed
- PM2 globally installed (`npm install -g pm2`)
- Fiber Audio Player project cloned to the server

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

Check PM2 logs:

```bash
pm2 logs fiber-audio-backend --lines 100
```

Ensure PM2 is installed and your Node version is correct.
