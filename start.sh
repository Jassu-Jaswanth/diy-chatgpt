#!/bin/bash

# DIY ChatGPT Startup Script

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     DIY ChatGPT Assistant            ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# Check if .env is configured
if grep -q "sk-your-openai-api-key-here" .env 2>/dev/null; then
    echo -e "${RED}❌ Error: OpenAI API key not configured!${NC}"
    echo -e "${YELLOW}Please edit .env and add your OpenAI API key${NC}"
    echo -e "${YELLOW}Run: nano .env${NC}"
    exit 1
fi

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down services...${NC}"
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    if [ ! -z "$UI_PID" ]; then
        kill $UI_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}Services stopped.${NC}"
    exit 0
}

trap cleanup INT TERM

# Start backend server
echo -e "${BLUE}Starting backend server...${NC}"
cd backend
node server.js &
BACKEND_PID=$!
cd ..

# Give backend time to start
sleep 2

# Check if backend is running
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${RED}❌ Backend failed to start${NC}"
    echo -e "${YELLOW}Check logs above for errors${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Backend server started (PID: $BACKEND_PID)${NC}"
echo ""

# Check if Open WebUI exists
if [ -d "open-webui" ]; then
    echo -e "${BLUE}Starting Open WebUI...${NC}"
    cd open-webui
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing Open WebUI dependencies...${NC}"
        npm install
    fi
    
    # Copy our API key to Open WebUI if needed
    if [ -f ".env.example" ] && [ ! -f ".env" ]; then
        cp .env.example .env
    fi
    
    npm run dev 2>&1 | sed 's/^/[WebUI] /' &
    UI_PID=$!
    cd ..
    
    sleep 3
    echo -e "${GREEN}✅ Open WebUI started (PID: $UI_PID)${NC}"
else
    echo -e "${YELLOW}⚠️  Open WebUI not installed yet${NC}"
    echo -e "${YELLOW}   The backend API is running at http://localhost:3001${NC}"
    echo -e "${YELLOW}   To install Open WebUI, run: git clone https://github.com/open-webui/open-webui.git${NC}"
fi

echo ""
echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     Services Running                 ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  Backend API:  http://localhost:3001 ║${NC}"
if [ ! -z "$UI_PID" ]; then
    echo -e "${CYAN}║  Web UI:       http://localhost:3000 ║${NC}"
fi
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Keep script running
wait
