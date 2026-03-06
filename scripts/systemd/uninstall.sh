#!/bin/bash
#
# Fiber Audio Player Backend - Systemd Service Uninstaller
# Usage: sudo ./scripts/systemd/uninstall.sh
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
SERVICE_FILE="/etc/systemd/system/fiber-audio-backend.service"
LOGROTATE_FILE="/etc/logrotate.d/fiber-audio-backend"
LOG_DIR="/var/log/fiber-audio-backend"

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Function to confirm action
confirm() {
    read -r -p "${1:-Are you sure? [y/N]} " response
    case "$response" in
        [yY][eE][sS]|[yY])
            true
            ;;
        *)
            false
            ;;
    esac
}

# Function to stop service
stop_service() {
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        print_info "Stopping $SERVICE_NAME service..."
        systemctl stop "$SERVICE_NAME"
        print_success "Service stopped"
    else
        print_warning "Service is not running"
    fi
}

# Function to disable service
disable_service() {
    if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
        print_info "Disabling $SERVICE_NAME service..."
        systemctl disable "$SERVICE_NAME"
        print_success "Service disabled"
    else
        print_warning "Service is not enabled"
    fi
}

# Function to remove service file
remove_service_file() {
    if [[ -f "$SERVICE_FILE" ]]; then
        print_info "Removing service file..."
        rm -f "$SERVICE_FILE"
        print_success "Service file removed"
    else
        print_warning "Service file not found: $SERVICE_FILE"
    fi
}

# Function to remove logrotate config
remove_logrotate_config() {
    if [[ -f "$LOGROTATE_FILE" ]]; then
        print_info "Removing logrotate configuration..."
        rm -f "$LOGROTATE_FILE"
        print_success "Logrotate config removed"
    else
        print_warning "Logrotate config not found"
    fi
}

# Function to remove log directory
remove_log_directory() {
    if [[ -d "$LOG_DIR" ]]; then
        print_info "Log directory found: $LOG_DIR"
        local log_count=$(find "$LOG_DIR" -type f 2>/dev/null | wc -l)
        
        if [[ $log_count -gt 0 ]]; then
            print_warning "Found $log_count log files in $LOG_DIR"
            if confirm "Remove log directory and all log files? [y/N]"; then
                rm -rf "$LOG_DIR"
                print_success "Log directory removed"
            else
                print_info "Log directory preserved at $LOG_DIR"
            fi
        else
            rm -rf "$LOG_DIR"
            print_success "Empty log directory removed"
        fi
    else
        print_warning "Log directory not found: $LOG_DIR"
    fi
}

# Function to reload systemd
reload_systemd() {
    print_info "Reloading systemd daemon..."
    systemctl daemon-reload
    print_success "Systemd daemon reloaded"
}

# Function to reset failed state if any
reset_failed() {
    if systemctl is-failed --quiet "$SERVICE_NAME" 2>/dev/null; then
        print_info "Resetting failed service state..."
        systemctl reset-failed "$SERVICE_NAME" 2>/dev/null || true
    fi
}

# Main uninstallation flow
main() {
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}  Fiber Audio Player Backend Uninstaller${NC}"
    echo -e "${YELLOW}========================================${NC}"
    echo ""
    
    check_root
    
    print_warning "This will uninstall the $SERVICE_NAME systemd service"
    echo ""
    
    if ! confirm "Continue with uninstallation? [y/N]"; then
        print_info "Uninstallation cancelled"
        exit 0
    fi
    
    echo ""
    stop_service
    disable_service
    reset_failed
    remove_service_file
    remove_logrotate_config
    remove_log_directory
    reload_systemd
    
    echo ""
    echo -e "${GREEN}==============================================${NC}"
    echo -e "${GREEN}  Uninstallation Complete!${NC}"
    echo -e "${GREEN}==============================================${NC}"
    echo ""
    echo "The Fiber Audio Player backend service has been removed."
    echo ""
    echo "Note: Project source code and data are preserved."
    echo "      To reinstall, run: sudo ./scripts/systemd/install.sh"
    echo ""
}

main "$@"
