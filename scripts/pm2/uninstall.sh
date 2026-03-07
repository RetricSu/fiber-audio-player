#!/bin/bash
# Stop and remove the PM2 process and startup config
set -e

echo "Stopping pm2 process..."
pm2 delete fiber-audio-backend || true

echo "Saving pm2 state..."
pm2 save

echo "Removing PM2 startup configuration..."
pm2 unstartup || true

echo "PM2 service uninstalled."
