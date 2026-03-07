#!/bin/bash
# Basic health check for pm2-managed backend
set -e

if pm2 status fiber-audio-backend 2>/dev/null | grep -q online; then
  echo "PM2 process is online"
  exit 0
else
  echo "PM2 process is not running"
  exit 1
fi
