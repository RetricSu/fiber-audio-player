# Fiber Audio Player - Systemd Service Setup

This directory contains systemd service configuration files for running the Fiber Audio Player backend as a system service on Ubuntu/Debian Linux.

## Overview

The Fiber Audio Player backend is a Node.js application built with Hono that provides APIs for streaming payments and audio content. These scripts make it easy to install, manage, and monitor the backend as a systemd service.

## Prerequisites

- Ubuntu 18.04+ or Debian 9+ with systemd
- Root access (sudo)
- Node.js 18+ installed
- pnpm installed (`npm install -g pnpm`)
- The Fiber Audio Player project cloned to your server

## Quick Start

### Installation

```bash
cd /path/to/fiber-audio-player
sudo ./scripts/systemd/install.sh
```

This single command will:
1. Check all dependencies (Node.js, pnpm, systemd)
2. Auto-detect the project directory
3. Copy and configure the service file
4. Install backend dependencies
5. Build the backend
6. Start and enable the service

### Verification

Check if the service is running:

```bash
sudo systemctl status fiber-audio-backend
```

Or use the health check script:

```bash
./scripts/systemd/health-check.sh
```

## Service Management Commands

### Start/Stop/Restart

```bash
sudo systemctl start fiber-audio-backend    # Start the service
sudo systemctl stop fiber-audio-backend     # Stop the service
sudo systemctl restart fiber-audio-backend  # Restart the service
```

### Status and Logs

```bash
sudo systemctl status fiber-audio-backend   # Check service status
sudo journalctl -u fiber-audio-backend -f   # Follow logs in real-time
sudo journalctl -u fiber-audio-backend -n 100 # View last 100 log lines
```

### Enable/Disable Autostart

```bash
sudo systemctl enable fiber-audio-backend   # Start on boot
sudo systemctl disable fiber-audio-backend  # Don't start on boot
```

## File Reference

| File | Description |
|------|-------------|
| `fiber-audio-backend.service` | Systemd service unit file |
| `install.sh` | Installation script (run with sudo) |
| `uninstall.sh` | Uninstallation script (run with sudo) |
| `health-check.sh` | Health check utility |
| `logrotate.conf` | Log rotation configuration |
| `README.md` | This documentation file |

## Service Configuration

The service is configured with the following settings:

- **User**: root (runs as root user)
- **Port**: 8787 (default backend port)
- **Working Directory**: Auto-detected project root
- **Restart Policy**: Restart on failure with 5-second delay
- **Start Limit**: Max 3 restart attempts in 60 seconds
- **Environment**: NODE_ENV=production

### Customization

If you need to customize the service (e.g., change port, user, or environment variables), edit the service file before installation:

```bash
nano scripts/systemd/fiber-audio-backend.service
```

Key directives to modify:
- `User=`: Change the user the service runs as
- `Environment="PORT=8080"`: Change the port
- `Environment=`: Add additional environment variables

Then reinstall:

```bash
sudo ./scripts/systemd/install.sh
```

## Health Monitoring

The `health-check.sh` script performs comprehensive checks:

- Service active status
- Service enabled status
- Process existence and resource usage
- Port listening status
- HTTP endpoint response
- Recent error log count

Run it anytime to verify the service health:

```bash
./scripts/systemd/health-check.sh
```

Exit codes:
- `0` - Service is healthy
- `1` - Service has issues

## Log Management

Logs are handled by systemd's journald. View them with:

```bash
# Follow logs in real-time
sudo journalctl -u fiber-audio-backend -f

# View logs since last boot
sudo journalctl -u fiber-audio-backend -b

# View logs from last hour
sudo journalctl -u fiber-audio-backend --since "1 hour ago"

# View logs with specific priority
sudo journalctl -u fiber-audio-backend -p err
```

### Log Rotation

Log rotation is configured via logrotate:
- Rotates daily
- Keeps 7 days of logs
- Compresses old logs
- Creates new logs with proper permissions

## Database

The backend uses SQLite with automatic migrations.

- Database file: `backend/data/podcast.db`
- Migrations run automatically on service startup
- No manual database setup required

The database directory is automatically created on first run. Ensure the service user has write permissions to:
- `backend/data/` (SQLite database and WAL files)
- `backend/uploads/` (audio file storage)

## Uninstallation

To completely remove the service:

```bash
sudo ./scripts/systemd/uninstall.sh
```

This will:
1. Stop the service
2. Disable autostart
3. Remove the service file
4. Remove logrotate configuration
5. Optionally remove log files (you'll be asked)

**Note**: Your project source code and data will NOT be removed.

## Troubleshooting

### Service fails to start

1. Check logs for errors:
   ```bash
   sudo journalctl -u fiber-audio-backend -n 50
   ```

2. Verify Node.js and pnpm are installed:
   ```bash
   node --version
   pnpm --version
   ```

3. Try building manually:
   ```bash
   cd backend
   pnpm install
   pnpm build:api
   ```

4. Check if port 8787 is already in use:
   ```bash
   sudo ss -tlnp | grep 8787
   ```

### Permission denied errors

Make sure you're running commands with `sudo`:

```bash
sudo systemctl start fiber-audio-backend
```

### Service not found after installation

Reload systemd and try again:

```bash
sudo systemctl daemon-reload
sudo systemctl start fiber-audio-backend
```

### Build fails during installation

Check if all dependencies are installed:

```bash
cd backend
pnpm install
pnpm build:api
```

If it builds successfully manually, there might be an environment issue. Check the logs:

```bash
sudo journalctl -u fiber-audio-backend -n 100
```

## Security Considerations

- The service currently runs as root. For production, consider creating a dedicated user
- Environment variables are set in the service file. Sensitive values should be managed via proper secrets management
- The service listens on all interfaces by default. Use a reverse proxy (nginx/Apache) for external access
- Consider enabling the security directives in the service file (currently commented)

## Updating the Service

To update the backend after code changes:

```bash
# Pull latest code
git pull

# Restart the service (this will rebuild automatically)
sudo systemctl restart fiber-audio-backend

# Or manually rebuild and restart
cd backend
pnpm install
pnpm build:api
sudo systemctl restart fiber-audio-backend
```

## Support

For issues related to:
- **Service setup**: Check this README and the troubleshooting section
- **Fiber Network**: See the main project README and Fiber documentation
- **Backend errors**: Check `sudo journalctl -u fiber-audio-backend`

## License

Same as the Fiber Audio Player project (MIT)
