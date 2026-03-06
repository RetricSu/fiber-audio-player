#!/bin/bash
#
# Fiber Audio Player Backend - Health Check Script
# Usage: ./scripts/systemd/health-check.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Service configuration
SERVICE_NAME="fiber-audio-backend"
HOST="localhost"
PORT="8787"
TIMEOUT=5

# Track overall health
OVERALL_HEALTHY=true

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Fiber Audio Backend Health Check${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

print_success() {
    echo -e "  ${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "  ${YELLOW}⚠${NC} $1"
    OVERALL_HEALTHY=false
}

print_error() {
    echo -e "  ${RED}✗${NC} $1"
    OVERALL_HEALTHY=false
}

print_info() {
    echo -e "  ${BLUE}ℹ${NC} $1"
}

# Check if service is active
check_service_active() {
    echo "Service Status:"
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        local status=$(systemctl show "$SERVICE_NAME" --property=ActiveState --value 2>/dev/null)
        local since=$(systemctl show "$SERVICE_NAME" --property=ActiveEnterTimestamp --value 2>/dev/null)
        print_success "Running (Status: $status)"
        print_info "Active since: $since"
        return 0
    else
        print_error "Not running"
        return 1
    fi
}

# Check if service is enabled
check_service_enabled() {
    echo ""
    echo "Service Enabled:"
    if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
        print_success "Yes (will start on boot)"
        return 0
    else
        print_warning "No (won't start automatically)"
        return 1
    fi
}

# Check if process exists
check_process() {
    echo ""
    echo "Process:"
    local pid=$(pgrep -f "node.*dist/index.js" | head -1)
    if [[ -n "$pid" ]]; then
        local cpu=$(ps -p "$pid" -o %cpu= 2>/dev/null | tr -d ' ')
        local mem=$(ps -p "$pid" -o %mem= 2>/dev/null | tr -d ' ')
        print_success "Found (PID: $pid, CPU: ${cpu}%, MEM: ${mem}%)"
        return 0
    else
        print_error "Not found"
        return 1
    fi
}

# Check if port is listening
check_port() {
    echo ""
    echo "Port $PORT:"
    if command -v ss > /dev/null 2>&1; then
        if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
            print_success "Listening"
            return 0
        else
            print_error "Not listening"
            return 1
        fi
    elif command -v netstat > /dev/null 2>&1; then
        if netstat -tlnp 2>/dev/null | grep -q ":$PORT "; then
            print_success "Listening"
            return 0
        else
            print_error "Not listening"
            return 1
        fi
    else
        print_warning "Cannot check (ss or netstat not available)"
        return 1
    fi
}

# Check HTTP response
check_http() {
    echo ""
    echo "HTTP Response:"
    local url="http://$HOST:$PORT"
    
    if command -v curl > /dev/null 2>&1; then
        local http_code
        http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "000")
        
        if [[ "$http_code" == "200" ]]; then
            print_success "200 OK"
            return 0
        elif [[ "$http_code" == "000" ]]; then
            print_error "Connection failed (timeout or refused)"
            return 1
        else
            print_warning "HTTP $http_code"
            return 1
        fi
    elif command -v wget > /dev/null 2>&1; then
        if wget -q --timeout="$TIMEOUT" --spider "$url" 2>/dev/null; then
            print_success "OK"
            return 0
        else
            print_error "Connection failed"
            return 1
        fi
    else
        print_warning "Cannot check (curl or wget not available)"
        return 1
    fi
}

# Check recent logs for errors
check_logs() {
    echo ""
    echo "Recent Logs:"
    if command -v journalctl > /dev/null 2>&1; then
        local recent_errors
        recent_errors=$(journalctl -u "$SERVICE_NAME" --since "5 minutes ago" --no-pager -q 2>/dev/null | grep -i "error\|exception\|fatal" | wc -l)
        
        if [[ "$recent_errors" -eq 0 ]]; then
            print_success "No errors in last 5 minutes"
        else
            print_warning "$recent_errors error(s) in last 5 minutes"
            print_info "View logs: sudo journalctl -u $SERVICE_NAME -n 50"
        fi
    else
        print_info "journalctl not available"
    fi
}

# Print final status
print_final_status() {
    echo ""
    echo -e "${BLUE}----------------------------------------${NC}"
    
    if [[ "$OVERALL_HEALTHY" == true ]]; then
        echo -e "${GREEN}Overall: HEALTHY ✓${NC}"
        echo ""
        echo "The Fiber Audio Player backend is running normally."
        return 0
    else
        echo -e "${RED}Overall: UNHEALTHY ✗${NC}"
        echo ""
        echo "The service has issues. Try:"
        echo "  sudo systemctl restart $SERVICE_NAME"
        echo "  sudo journalctl -u $SERVICE_NAME -n 50"
        return 1
    fi
}

# Main health check flow
main() {
    print_header
    
    check_service_active
    check_service_enabled
    check_process
    check_port
    check_http
    check_logs
    
    print_final_status
}

# Run main function and exit with appropriate code
main "$@"
exit $?
