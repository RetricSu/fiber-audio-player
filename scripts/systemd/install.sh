#!/bin/bash
#
# Fiber Audio Player Backend - Systemd Service Installer
# Usage: sudo ./scripts/systemd/install.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Service configuration
SERVICE_NAME="fiber-audio-backend"
SERVICE_FILE="fiber-audio-backend.service"
LOGROTATE_FILE="fiber-audio-backend"

# Function to print colored messages
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

# Function to check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root (use sudo)"
        exit 1
    fi
    print_success "Running as root"
}

# Function to check if systemd is available
check_systemd() {
    if ! command -v systemctl &> /dev/null; then
        print_error "systemctl not found. This script requires systemd."
        exit 1
    fi
    if ! systemctl --version &> /dev/null; then
        print_error "systemd is not running or not properly installed"
        exit 1
    fi
    print_success "Systemd is available"
}

# Function to check if pnpm is installed
check_pnpm() {
    if ! command -v pnpm &> /dev/null; then
        print_error "pnpm not found. Please install pnpm first:"
        print_error "  npm install -g pnpm"
        exit 1
    fi
    print_success "pnpm is installed ($(pnpm --version))"
}

# Function to check if Node.js is installed
check_node() {
    if ! command -v node &> /dev/null; then
        print_error "Node.js not found. Please install Node.js 18+ first"
        exit 1
    fi
    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ "$node_version" -lt 18 ]]; then
        print_error "Node.js version $node_version found, but 18+ is required"
        exit 1
    fi
    print_success "Node.js is installed ($(node --version))"
}

# Function to detect project root
detect_project_root() {
    # Get the directory where this script is located
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    # Go up one level (from scripts/systemd to project root)
    PROJECT_ROOT="$(cd "$script_dir/../.." && pwd)"
    
    # Verify this looks like the right project
    if [[ ! -d "$PROJECT_ROOT/backend" ]]; then
        print_error "Cannot find backend directory at $PROJECT_ROOT/backend"
        print_error "Please run this script from the project root"
        exit 1
    fi
    
    if [[ ! -f "$PROJECT_ROOT/backend/package.json" ]]; then
        print_error "Cannot find backend/package.json at $PROJECT_ROOT/backend/package.json"
        exit 1
    fi
    
    print_success "Project root detected: $PROJECT_ROOT"
}

# Function to backup existing service
backup_existing_service() {
    if [[ -f "/etc/systemd/system/$SERVICE_FILE" ]]; then
        local backup_name="/etc/systemd/system/$SERVICE_FILE.backup.$(date +%Y%m%d%H%M%S)"
        print_warning "Existing service file found, backing up to $backup_name"
        cp "/etc/systemd/system/$SERVICE_FILE" "$backup_name"
    fi
}

# Function to install service file
install_service_file() {
    local source_file="$PROJECT_ROOT/scripts/systemd/$SERVICE_FILE"
    local target_file="/etc/systemd/system/$SERVICE_FILE"
    
    print_info "Installing service file..."
    
    if [[ ! -f "$source_file" ]]; then
        print_error "Service file not found: $source_file"
        exit 1
    fi
    
    # Replace placeholder with actual project root
    sed "s|%PROJECT_ROOT%|$PROJECT_ROOT|g" "$source_file" > "$target_file"
    
    # Set proper permissions
    chmod 644 "$target_file"
    
    print_success "Service file installed to $target_file"
}

# Function to install logrotate config
install_logrotate_config() {
    local source_file="$PROJECT_ROOT/scripts/systemd/logrotate.conf"
    local target_file="/etc/logrotate.d/$LOGROTATE_FILE"
    
    if [[ -f "$source_file" ]]; then
        print_info "Installing logrotate configuration..."
        cp "$source_file" "$target_file"
        chmod 644 "$target_file"
        print_success "Logrotate config installed to $target_file"
        
        # Create log directory
        mkdir -p /var/log/fiber-audio-backend
        chmod 755 /var/log/fiber-audio-backend
        print_success "Log directory created: /var/log/fiber-audio-backend"
    else
        print_warning "Logrotate config not found, skipping..."
    fi
}

# Function to reload systemd
reload_systemd() {
    print_info "Reloading systemd daemon..."
    systemctl daemon-reload
    print_success "Systemd daemon reloaded"
}

# Function to install and build backend
build_backend() {
    print_info "Installing backend dependencies..."
    cd "$PROJECT_ROOT"
    pnpm install
    print_success "Dependencies installed"
    
    print_info "Building backend..."
    pnpm build:api
    print_success "Backend built successfully"
}

# Function to enable service
enable_service() {
    print_info "Enabling service to start on boot..."
    systemctl enable "$SERVICE_NAME"
    print_success "Service enabled"
}

# Function to start service
start_service() {
    print_info "Starting service..."
    systemctl start "$SERVICE_NAME"
    
    # Wait a moment and check status
    sleep 2
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        print_success "Service started successfully"
    else
        print_error "Service failed to start. Check logs with: sudo journalctl -u $SERVICE_NAME -n 50"
        exit 1
    fi
}

# Function to display service status
show_status() {
    print_info "Service status:"
    systemctl status "$SERVICE_NAME" --no-pager || true
}

# Function to print next steps
print_next_steps() {
    echo ""
    echo -e "${GREEN}==============================================${NC}"
    echo -e "${GREEN}  Installation Complete!${NC}"
    echo -e "${GREEN}==============================================${NC}"
    echo ""
    echo "The Fiber Audio Player backend has been installed as a systemd service."
    echo ""
    echo "Useful commands:"
    echo "  sudo systemctl start $SERVICE_NAME    # Start the service"
    echo "  sudo systemctl stop $SERVICE_NAME     # Stop the service"
    echo "  sudo systemctl restart $SERVICE_NAME  # Restart the service"
    echo "  sudo systemctl status $SERVICE_NAME   # Check service status"
    echo ""
    echo "View logs:"
    echo "  sudo journalctl -u $SERVICE_NAME -f   # Follow logs"
    echo "  sudo journalctl -u $SERVICE_NAME -n 100 # Last 100 lines"
    echo ""
    echo "Health check:"
    echo "  ./scripts/systemd/health-check.sh"
    echo ""
    echo "Uninstall:"
    echo "  sudo ./scripts/systemd/uninstall.sh"
    echo ""
}

# Main installation flow
main() {
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Fiber Audio Player Backend Installer${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    
    check_root
    check_systemd
    check_node
    check_pnpm
    detect_project_root
    backup_existing_service
    install_service_file
    install_logrotate_config
    reload_systemd
    build_backend
    enable_service
    start_service
    show_status
    print_next_steps
}

# Run main function
main "$@"
