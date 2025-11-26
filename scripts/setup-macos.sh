#!/bin/bash
# DIY ChatGPT - macOS Setup Script
# Requires: Homebrew (will be installed if missing)

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

# Install Homebrew
install_homebrew() {
    if command -v brew &> /dev/null; then
        log_success "Homebrew already installed"
        return
    fi
    
    log_info "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add to path for Apple Silicon
    if [ -f /opt/homebrew/bin/brew ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
    
    log_success "Homebrew installed"
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
    brew install node@20
    brew link node@20 --overwrite --force 2>/dev/null || true
    log_success "Node.js $(node -v) installed"
}

# Install PostgreSQL
install_postgresql() {
    if command -v psql &> /dev/null; then
        log_success "PostgreSQL already installed"
    else
        log_info "Installing PostgreSQL..."
        brew install postgresql@16
        brew link postgresql@16 --force 2>/dev/null || true
    fi
    
    # Start PostgreSQL
    brew services start postgresql@16 2>/dev/null || brew services start postgresql
    sleep 2
    log_success "PostgreSQL started"
}

# Setup database
setup_database() {
    log_info "Setting up database..."
    
    DB_NAME="${POSTGRES_DB:-diy_chatgpt}"
    DB_USER="${POSTGRES_USER:-$(whoami)}"
    DB_PASS="${POSTGRES_PASSWORD:-postgres}"
    
    # Create database if it doesn't exist
    psql postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
        createdb "$DB_NAME" 2>/dev/null || psql postgres -c "CREATE DATABASE $DB_NAME"
    
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
        
        # Update default user for macOS
        if [ "$(uname)" == "Darwin" ]; then
            sed -i '' "s/POSTGRES_USER=postgres/POSTGRES_USER=$(whoami)/" .env 2>/dev/null || true
        fi
        
        log_warn "Please edit .env and add your OPENAI_API_KEY"
    else
        log_success ".env file already exists"
    fi
    
    # Create data directory
    mkdir -p data/sessions
    log_success "Data directory created"
}

# Create launchd service (macOS equivalent of systemd)
create_launchd_service() {
    if [ "$1" == "--launchd" ]; then
        log_info "Creating launchd service..."
        
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
        PLIST_PATH="$HOME/Library/LaunchAgents/com.diy-chatgpt.plist"
        
        mkdir -p "$HOME/Library/LaunchAgents"
        
        cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.diy-chatgpt</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>${SCRIPT_DIR}/backend/server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${SCRIPT_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${SCRIPT_DIR}/logs/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${SCRIPT_DIR}/logs/stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
</dict>
</plist>
EOF
        
        mkdir -p "$SCRIPT_DIR/logs"
        launchctl unload "$PLIST_PATH" 2>/dev/null || true
        launchctl load "$PLIST_PATH"
        
        log_success "Launchd service created and started"
        log_info "Manage with: launchctl start/stop com.diy-chatgpt"
    fi
}

# Main
main() {
    echo ""
    echo "╔══════════════════════════════════════╗"
    echo "║   DIY ChatGPT - macOS Setup          ║"
    echo "╚══════════════════════════════════════╝"
    echo ""
    
    cd "$(dirname "${BASH_SOURCE[0]}")/.."
    
    install_homebrew
    install_nodejs
    install_postgresql
    setup_database
    install_dependencies
    setup_environment
    create_launchd_service "$1"
    
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
