# Cloudflared Tunnel Deployment Guide - Fiber Audio Player

## Overview

This guide instructs AI Agents on configuring [Cloudflare Tunnel](https://www.cloudflare.com/products/tunnel/) to securely expose the Fiber Audio Player backend service to the public internet. By using Cloudflare Tunnel, external users can access backend APIs deployed in internal networks or restricted environments without opening server ports or configuring firewall rules.

**Problems Solved:**
- Server is on internal network or has no public IP
- Don't want to expose server ports to public internet
- Need simple HTTPS and DDoS protection
- Avoid configuring complex reverse proxies and SSL certificates

## Prerequisites

Before starting, ensure the following conditions are met:

**Domain Requirements:**
- Own a domain managed by Cloudflare
- Domain's DNS records point to Cloudflare's nameserver

**System Requirements:**
- Server has internet access (outbound connections)
- Backend service is deployed and running on local port (default 8787)
- User account with sudo privileges

**Network Requirements:**
- Outbound access to Cloudflare's edge network (port 7844 TCP/UDP)
- Can resolve `region1.v2.argotunnel.com` and `region2.v2.argotunnel.com`

## Deployment Steps

### 0. Environment Verification

Before executing deployment, verify the environment meets requirements:

```bash
# Check if domain is added to Cloudflare
# Log in to Cloudflare Dashboard and confirm domain status is "Active"

# Verify network connectivity
nc -uvz -w 3 198.41.192.167 7844

# Check if backend service is running
curl http://localhost:8787/healthz

# Confirm cloudflared is not installed
which cloudflared || echo "cloudflared not installed, continue deployment"
```

### 1. Install cloudflared

Choose the appropriate installation method based on your server operating system:

**Ubuntu/Debian:**

```bash
# Add Cloudflare GPG key
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null

# Add repository
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list

# Install cloudflared
sudo apt-get update && sudo apt-get install -y cloudflared

# Verify installation
cloudflared --version
```

**macOS (Development Environment):**

```bash
brew install cloudflared
cloudflared --version
```

### 2. Authentication

First-time use requires completing Cloudflare account authentication in the browser:

```bash
# Execute login command, will automatically open browser
cloudflared tunnel login
```

**Authentication Process:**
1. Command will output a URL, open it in browser
2. Log in to Cloudflare account
3. Select the root domain to authorize
4. Browser shows "Success", return to terminal

**Verify Authentication Result:**

```bash
# Check if credential file is generated
ls -la ~/.cloudflared/cert.pem

# Set correct permissions
chmod 600 ~/.cloudflared/cert.pem
```

### 3. Create Tunnel

Create a new tunnel for Fiber Audio Player:

```bash
# Create tunnel named fiber-audio-player
cloudflared tunnel create fiber-audio-player

# Record the output Tunnel UUID, needed for subsequent configuration
# Example output: Tunnel credentials written to /root/.cloudflared/6ff42ae2-765d-4adf-8112-31c55c1551ef.json
```

**Get Tunnel UUID:**

```bash
# List all tunnels
cloudflared tunnel list

# View tunnel details
cloudflared tunnel info fiber-audio-player
```

### 4. Configure DNS Routing

Configure domain name to point to tunnel for backend service:

```bash
# Assume your domain is example.com, subdomain api.example.com for backend
cloudflared tunnel route dns fiber-audio-player api.example.com

# If frontend also needs to be exposed via tunnel (optional)
cloudflared tunnel route dns fiber-audio-player app.example.com
```

**Verify DNS Records:**

```bash
# Check if DNS record is created successfully
dig A api.example.com

# Should return CNAME record pointing to <UUID>.cfargotunnel.com
```

### 5. Create Configuration File

Create the tunnel configuration file:

```bash
# Get Tunnel UUID
TUNNEL_UUID=$(cloudflared tunnel list --output=json 2>/dev/null | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Tunnel UUID: $TUNNEL_UUID"

# Create configuration file directory
sudo mkdir -p /etc/cloudflared

# Create configuration file
sudo tee /etc/cloudflared/config.yml << EOF
tunnel: ${TUNNEL_UUID}
credentials-file: /root/.cloudflared/${TUNNEL_UUID}.json

# Connection parameters
protocol: auto

# Log settings
logfile: /var/log/cloudflared/cloudflared.log
loglevel: info

# Backend service routing configuration
ingress:
  # Fiber Audio Player backend API
  - hostname: api.example.com
    service: http://localhost:8787
    originRequest:
      connectTimeout: 30s
      tlsTimeout: 10s
      keepAliveTimeout: 1m30s
  
  # Optional: Frontend application
  # - hostname: app.example.com
  #   service: http://localhost:3000
  
  # Health check endpoint
  - hostname: health.example.com
    service: http://localhost:8787/healthz
  
  # Required catch-all rule
  - service: http_status:404
EOF

# Create log directory
sudo mkdir -p /var/log/cloudflared
```

**Configuration File Reference:**

| Configuration Item | Description | Recommended Value |
|-------------------|-------------|-------------------|
| `tunnel` | Tunnel UUID | Obtained from creation step |
| `credentials-file` | Credential file path | `/root/.cloudflared/<UUID>.json` |
| `protocol` | Connection protocol | `auto` (auto-select) or `http2` |
| `ingress` | Routing rules | Configure according to services |

**Update Domain Names in Configuration:**

Replace `api.example.com` and `health.example.com` with actual domain names:

```bash
# Set actual domain
DOMAIN="your-domain.com"
sudo sed -i "s/api.example.com/api.${DOMAIN}/g" /etc/cloudflared/config.yml
sudo sed -i "s/health.example.com/health.${DOMAIN}/g" /etc/cloudflared/config.yml
```

### 6. Install as System Service

Configure cloudflared as a systemd service for automatic startup:

```bash
# Install service (using configuration file /etc/cloudflared/config.yml)
sudo cloudflared service install

# Verify service file
ls -la /etc/systemd/system/cloudflared.service
```

**Service Management Commands:**

```bash
# Start service
sudo systemctl start cloudflared

# View service status
sudo systemctl status cloudflared

# Enable auto-start on boot
sudo systemctl enable cloudflared

# View logs
sudo journalctl -u cloudflared -f
```

### 7. Verify Deployment

After deployment, verify tunnel is working properly:

```bash
# 1. Check service status
sudo systemctl status cloudflared

# 2. View tunnel connection status
cloudflared tunnel info fiber-audio-player

# 3. Test public access (replace with actual domain)
curl -I https://api.example.com/healthz

# 4. View real-time logs
sudo journalctl -u cloudflared --since "5 minutes ago" -f
```

**Expected Output:**
- Service status shows `active (running)`
- Tunnel status shows `Healthy` (4 active connections)
- HTTP request returns 200 OK

## Daily Operations

### Check Tunnel Status

```bash
# View all tunnels
cloudflared tunnel list

# View specific tunnel details
cloudflared tunnel info fiber-audio-player

# Check service status
sudo systemctl status cloudflared

# View recent logs
sudo journalctl -u cloudflared --since "1 hour ago"
```

### Update Configuration

After modifying configuration, restart service:

```bash
# Edit configuration
sudo nano /etc/cloudflared/config.yml

# Verify configuration syntax
sudo cloudflared tunnel ingress validate /etc/cloudflared/config.yml

# Test which rule matches specific URL
sudo cloudflared tunnel ingress rule https://api.example.com/healthz

# Restart service
sudo systemctl restart cloudflared

# Verify restart successful
sudo systemctl status cloudflared
curl -I https://api.example.com/healthz
```

### Monitoring and Logs

```bash
# View real-time logs
sudo journalctl -u cloudflared -f

# View logs for specific time period
sudo journalctl -u cloudflared --since "1 hour ago" --until "30 minutes ago"

# Filter by log level
sudo journalctl -u cloudflared | grep -i error

# View cloudflared dedicated log file
sudo tail -f /var/log/cloudflared/cloudflared.log
```

## Troubleshooting

### Tunnel Won't Start

**Symptom:** `systemctl status cloudflared` shows failed

```bash
# Check logs for detailed errors
sudo journalctl -u cloudflared --no-pager --lines=50

# Common cause 1: Credential file doesn't exist
ls -la /root/.cloudflared/*.json

# Common cause 2: Configuration file syntax error
sudo cloudflared tunnel ingress validate /etc/cloudflared/config.yml

# Manual test run (view detailed errors)
sudo cloudflared tunnel run fiber-audio-player
```

### Error 1033: Tunnel Not Connected

**Symptom:** Browser shows "Error 1033: Argo Tunnel error" when accessing domain

```bash
# Check if service is running
sudo systemctl status cloudflared

# Check network connectivity
nc -vz 198.41.192.167 7844

# Restart service
sudo systemctl restart cloudflared

# If UDP is blocked by firewall, force HTTP/2
# Add to config.yml: protocol: http2
```

### Error 502: Bad Gateway

**Symptom:** Browser shows "502 Bad Gateway"

```bash
# Check if backend service is running
curl http://localhost:8787/healthz

# Check port binding
ss -tlnp | grep 8787

# Confirm service address in configuration is correct
# If backend uses HTTPS, originRequest needs configuration
```

**Fix HTTPS Backend:**

```yaml
# Modify in config.yml
ingress:
  - hostname: api.example.com
    service: https://localhost:8787
    originRequest:
      noTLSVerify: true  # If using self-signed certificate
      # Or specify CA
      # caPool: /path/to/ca.pem
```

### DNS Record Already Exists

**Symptom:** Error "An A, AAAA, or CNAME record already exists" when executing `tunnel route dns`

```bash
# Method 1: Manually delete existing DNS record in Cloudflare Dashboard
# Then re-execute route dns

# Method 2: Use force overwrite (-f flag)
cloudflared tunnel route dns -f fiber-audio-player api.example.com
```

### Unstable Tunnel Connection

**Symptom:** Tunnel frequently disconnects or reconnects

```bash
# Check network stability
ping 198.41.192.167

# View reconnection logs
sudo journalctl -u cloudflared | grep -i "reconnect\|retry"

# Force HTTP/2 protocol (if UDP is unstable)
# Add to config.yml:
# protocol: http2

# Increase retry parameters (optional)
# Add to config.yml:
# retries: 10
```

### Certificate Expired

**Symptom:** Authentication failure, certificate issue prompt

```bash
# Re-login to get new certificate
cloudflared tunnel login

# Update credential path in configuration file
# If UUID changes, config.yml needs to be updated
```

## Advanced Configuration

### Multi-Service Routing

If exposing both frontend and backend:

```yaml
ingress:
  # API backend
  - hostname: api.example.com
    service: http://localhost:8787
  
  # Frontend application
  - hostname: app.example.com
    service: http://localhost:3000
  
  # Static resources (optional)
  - hostname: assets.example.com
    service: http://localhost:3000
    path: "\\.(js|css|png|jpg)$"
  
  - service: http_status:404
```

### Using Environment Variables

```bash
# Set environment variables in systemd service
sudo systemctl edit cloudflared

# Add:
[Service]
Environment="TUNNEL_UUID=your-uuid-here"
Environment="DOMAIN=example.com"
```

### Configure Log Rotation

```bash
# Create logrotate configuration
sudo tee /etc/logrotate.d/cloudflared << 'EOF'
/var/log/cloudflared/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0600 root root
    postrotate
        systemctl reload cloudflared
    endscript
}
EOF
```

## Security Recommendations

1. **Restrict credential file permissions:**
   ```bash
   chmod 600 /root/.cloudflared/*.json
   chmod 600 /root/.cloudflared/cert.pem
   ```

2. **Use dedicated service account (optional):**
   ```bash
   # Create dedicated user
   sudo useradd -r -s /bin/false cloudflared
   
   # Modify service file to use that user
   sudo systemctl edit cloudflared
   # Add:
   # [Service]
   # User=cloudflared
   # Group=cloudflared
   ```

3. **Enable Cloudflare security features:**
   - Enable "Always Use HTTPS" in Cloudflare Dashboard
   - Configure appropriate firewall rules
   - Enable DDoS protection (enabled by default)

## Reference Resources

- [Cloudflare Tunnel Official Documentation](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)
- [Configuration File Reference](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/)
- [Troubleshooting Guide](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/troubleshoot-tunnels/common-errors/)
- [Fiber Audio Player DevOps Manual](./devops-manual.md)

---

**Version:** 1.0  
**Last Updated:** 2024-03-09  
**Maintained By:** AI Agent
