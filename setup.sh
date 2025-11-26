#!/bin/bash

# DIY ChatGPT Quick Setup Script
# This script automates the initial setup process

set -e  # Exit on error

echo "======================================"
echo "  DIY ChatGPT Assistant Setup Script  "
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Step 1: Check prerequisites
echo "Step 1: Checking prerequisites..."
echo "--------------------------------"

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    print_status "Node.js installed: $NODE_VERSION"
else
    print_error "Node.js not found. Installing..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Check Python
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    print_status "Python installed: $PYTHON_VERSION"
else
    print_error "Python3 not found. Installing..."
    sudo apt update
    sudo apt install -y python3 python3-pip python3-venv
fi

# Check Git
if command -v git &> /dev/null; then
    print_status "Git installed"
else
    print_error "Git not found. Installing..."
    sudo apt install -y git
fi

echo ""

# Step 2: Create directory structure
echo "Step 2: Creating project structure..."
echo "------------------------------------"

mkdir -p backend/services
mkdir -p config/prompts
mkdir -p data
mkdir -p exports
mkdir -p scripts
mkdir -p logs

print_status "Directory structure created"
echo ""

# Step 3: Check for .env file
echo "Step 3: Setting up environment variables..."
echo "-----------------------------------------"

if [ ! -f .env ]; then
    print_warning ".env file not found. Creating template..."
    
    cat > .env.example << 'EOF'
# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=2000
OPENAI_TEMPERATURE=0.7

# Search API Configuration
SEARCH_PROVIDER=duckduckgo  # Options: serpapi, bing, duckduckgo
SERPAPI_KEY=your-serpapi-key-if-using
BING_API_KEY=your-bing-key-if-using

# App Configuration
PORT=3001
NODE_ENV=development
LOG_LEVEL=info
SESSION_SECRET=change-this-to-random-string

# Memory/Database
CHROMA_HOST=localhost
CHROMA_PORT=8000

# Export Settings
EXPORT_DIR=./exports
MAX_EXPORT_SIZE_MB=50
EOF

    cp .env.example .env
    chmod 600 .env
    
    print_warning "Created .env file - PLEASE EDIT IT WITH YOUR API KEYS!"
    print_warning "Edit .env file and add your OpenAI API key"
    echo ""
    echo "To edit: nano .env"
    echo ""
else
    print_status ".env file exists"
fi

echo ""

# Step 4: Install dependencies
echo "Step 4: Installing dependencies..."
echo "---------------------------------"

# Install Node.js dependencies
if [ -f package.json ]; then
    print_status "Installing Node.js packages..."
    npm install
else
    print_warning "package.json not found, skipping Node.js dependencies"
fi

# Install Python dependencies
if [ -f requirements.txt ]; then
    print_status "Installing Python packages..."
    pip3 install -r requirements.txt --user
else
    print_warning "requirements.txt not found, skipping Python dependencies"
fi

# Install system dependencies for PDF export
print_status "Installing system dependencies for PDF export..."
sudo apt update
sudo apt install -y pandoc texlive-latex-base texlive-fonts-recommended wkhtmltopdf

echo ""

# Step 5: Clone Open WebUI (if not exists)
echo "Step 5: Setting up Open WebUI..."
echo "-------------------------------"

if [ ! -d "open-webui" ]; then
    print_status "Cloning Open WebUI repository..."
    git clone https://github.com/open-webui/open-webui.git
    cd open-webui
    npm install
    cp .env.example .env
    cd ..
    print_warning "Remember to add your OPENAI_API_KEY to open-webui/.env"
else
    print_status "Open WebUI directory exists"
fi

echo ""

# Step 6: Create test scripts
echo "Step 6: Creating utility scripts..."
echo "----------------------------------"

# Create OpenAI test script
cat > scripts/test-openai.js << 'EOF'
const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function testConnection() {
    try {
        console.log('Testing OpenAI connection...');
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'Say "Connection successful!" in 5 words or less.' }],
            max_tokens: 50
        });
        console.log('✅ Success:', response.choices[0].message.content);
        console.log('✅ OpenAI API is working correctly!');
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('Please check your API key in .env file');
    }
}

testConnection();
EOF

chmod +x scripts/test-openai.js
print_status "Test scripts created"

echo ""

# Step 7: Validate setup
echo "Step 7: Validating setup..."
echo "-------------------------"

# Check if API key is set
if grep -q "sk-your-openai-api-key-here" .env; then
    print_error "OpenAI API key not configured!"
    print_warning "Please edit .env and add your actual OpenAI API key"
else
    print_status "OpenAI API key appears to be configured"
    
    # Test the connection
    echo ""
    echo "Testing OpenAI connection..."
    node scripts/test-openai.js
fi

echo ""

# Step 8: Create start scripts
echo "Step 8: Creating start scripts..."
echo "-------------------------------"

# Create start script
cat > start.sh << 'EOF'
#!/bin/bash
echo "Starting DIY ChatGPT services..."

# Start backend
echo "Starting backend server..."
cd backend && node server.js &
BACKEND_PID=$!
echo "Backend started with PID: $BACKEND_PID"

# Start Open WebUI
echo "Starting Open WebUI..."
cd ../open-webui && npm run dev &
UI_PID=$!
echo "UI started with PID: $UI_PID"

echo ""
echo "======================================"
echo "Services started successfully!"
echo "Backend: http://localhost:3001"
echo "Web UI: http://localhost:3000"
echo "======================================"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for interrupt
trap "kill $BACKEND_PID $UI_PID; exit" INT
wait
EOF

chmod +x start.sh
print_status "Start script created"

echo ""

# Final summary
echo "======================================"
echo "        Setup Complete!               "
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your API keys:"
echo "   nano .env"
echo ""
echo "2. Test OpenAI connection:"
echo "   node scripts/test-openai.js"
echo ""
echo "3. Start the application:"
echo "   ./start.sh"
echo ""
echo "4. Access the application:"
echo "   - Backend API: http://localhost:3001"
echo "   - Web UI: http://localhost:3000"
echo ""
echo "For detailed instructions, see IMPLEMENTATION_PLAN.md"
echo ""

# Check if .env needs configuration
if grep -q "sk-your-openai-api-key-here" .env; then
    echo "⚠️  IMPORTANT: You must configure your OpenAI API key before starting!"
    echo "   Run: nano .env"
fi
