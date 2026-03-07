#!/bin/bash
# Install and run the backend with PM2
set -e

# verify prerequisites
command -v node >/dev/null 2>&1 || { echo "node not found"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "pnpm not found"; exit 1; }
command -v pm2 >/dev/null 2>&1 || { echo "pm2 not found; install with npm install -g pm2"; exit 1; }

ROOT=$(pwd)
cd "$ROOT/backend"
pnpm install
pnpm build:api

cd "$ROOT"
pm2 start ./scripts/pm2/ecosystem.config.js
pm2 save
pm2 startup -u $(whoami) --hp "$HOME" >/dev/null

echo "PM2 service installed and started."
