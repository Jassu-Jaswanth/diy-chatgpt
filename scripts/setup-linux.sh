#!/bin/bash
# DIY ChatGPT - Linux Setup Script
# Supports: Ubuntu/Debian, Fedora/RHEL, Arch Linux

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Detect package manager
detect_package_manager() {
    if command -v apt-get &> /dev/null; then
        echo "apt"
    elif command -v dnf &> /dev/null; then
        echo "dnf"
    elif command -v yum &> /dev/null; then
        echo "yum"
    elif command -v pacman &> /dev/null; then
        echo "pacman"
    else
        echo "unknown"
    fi
}

# Install Node.js
install_nodejs() {
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 18 ]; then
            log_success "Node.js $(node -v) already installed"
            return
        fi
    fi

    log_info "Installing Node.js..."
    
    PKG_MANAGER=$(detect_package_manager)
    
    case $PKG_MANAGER in
        apt)
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        dnf|yum)
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
            sudo $PKG_MANAGER install -y nodejs
            ;;
        pacman)
            sudo pacman -S --noconfirm nodejs npm
            ;;
        *)
            log_error "Unsupported package manager. Please install Node.js 18+ manually."
            exit 1
            ;;
    esac
    
    log_success "Node.js $(node -v) installed"
}

# Install PostgreSQL
install_postgresql() {
    if command -v psql &> /dev/null; then
        log_success "PostgreSQL already installed"
        return
    fi

    log_info "Installing PostgreSQL..."
    
    PKG_MANAGER=$(detect_package_manager)
    
    case $PKG_MANAGER in
        apt)
            sudo apt-get update
            sudo apt-get install -y postgresql postgresql-contrib
            ;;
        dnf|yum)
            sudo $PKG_MANAGER install -y postgresql-server postgresql-contrib
            sudo postgresql-setup --initdb 2>/dev/null || true
            ;;
        pacman)
            sudo pacman -S --noconfirm postgresql
            sudo -u postgres initdb -D /var/lib/postgres/data 2>/dev/null || true
            ;;
        *)
            log_error "Unsupported package manager. Please install PostgreSQL manually."
            exit 1
            ;;
    esac
    
    # Start PostgreSQL
    sudo systemctl enable postgresql
    sudo systemctl start postgresql
    
    log_success "PostgreSQL installed and started"
}

# Setup database
setup_database() {
    log_info "Setting up database..."
    
    # Read credentials from .env or use defaults
    DB_NAME="${POSTGRES_DB:-diy_chatgpt}"
    DB_USER="${POSTGRES_USER:-postgres}"
    DB_PASS="${POSTGRES_PASSWORD:-postgres}"
    
    # Create database if it doesn't exist
    sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
        sudo -u postgres psql -c "CREATE DATABASE $DB_NAME"
    
    # Create user if not postgres
    if [ "$DB_USER" != "postgres" ]; then
        sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER'" | grep -q 1 || \
            sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS'"
        sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER"
    fi
    
    log_success "Database '$DB_NAME' ready"
}

# Install dependencies
install_dependencies() {
    log_info "Installing Node.js dependencies..."
    npm ci
    log_success "Dependencies installed"
}

# Setup environment
setup_environment() {
    if [ ! -f .env ]; then
        log_info "Creating .env file from template..."
        cp .env.example .env
        log_warn "Please edit .env and add your OPENAI_API_KEY"
    else
        log_success ".env file already exists"
    fi
    
    # Create data directory
    mkdir -p data/sessions
    log_success "Data directory created"
}

# Create systemd service
create_systemd_service() {
    if [ "$1" == "--systemd" ]; then
        log_info "Creating systemd service..."
        
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
        
        sudo tee /etc/systemd/system/diy-chatgpt.service > /dev/null << EOF
[Unit]
Description=DIY ChatGPT Server
After=network.target postgresql.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$SCRIPT_DIR
ExecStart=/usr/bin/node backend/server.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
        
        sudo systemctl daemon-reload
        sudo systemctl enable diy-chatgpt
        log_success "Systemd service created. Start with: sudo systemctl start diy-chatgpt"
    fi
}

# Main
main() {
    echo ""
    echo "╔══════════════════════════════════════╗"
    echo "║   DIY ChatGPT - Linux Setup          ║"
    echo "╚══════════════════════════════════════╝"
    echo ""
    
    cd "$(dirname "${BASH_SOURCE[0]}")/.."
    
    install_nodejs
    install_postgresql
    setup_database
    install_dependencies
    setup_environment
    create_systemd_service "$1"
    
    echo ""
    log_success "Setup complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Edit .env and add your OPENAI_API_KEY"
    echo "  2. Run: node backend/server.js"
    echo "  3. Open: http://localhost:3001"
    echo ""
}

main "$@"
