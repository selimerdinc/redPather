#!/bin/bash

# Red Pather - Startup Script (Smart Python Detection)
# Usage: ./start.sh [android|ios]

set -e

PLATFORM=${1:-android}
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. PYTHON VERSİYONUNU BUL (python vs python3)
if command -v python3 &>/dev/null; then
    PYTHON_CMD=python3
elif command -v python &>/dev/null; then
    PYTHON_CMD=python
else
    echo -e "${RED}❌ Python not found! Please install Python 3.8+${NC}"
    exit 1
fi

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}🚀 Red Pather Startup${NC}"
echo -e "${BLUE}================================${NC}"
echo -e "${GREEN}✓ Using: $($PYTHON_CMD --version)${NC}"
echo ""

# 2. SANAL ORTAM KONTROLÜ
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}⚠️  Virtual environment not found!${NC}"
    echo -e "${GREEN}Creating virtual environment...${NC}"
    $PYTHON_CMD -m venv venv
    echo -e "${GREEN}✓ Virtual environment created${NC}"
fi

# 3. AKTİVASYON
echo -e "${GREEN}🔧 Activating virtual environment...${NC}"
source venv/bin/activate

# 4. BAĞIMLILIK KONTROLÜ
if ! python -c "import flask" 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Dependencies not installed!${NC}"
    echo -e "${GREEN}Installing dependencies...${NC}"
    pip install -r requirements.txt
    echo -e "${GREEN}✓ Dependencies installed${NC}"
fi

# 5. APPIUM KONTROLÜ
if ! command -v appium &> /dev/null; then
    echo -e "${RED}❌ Appium not found!${NC}"
    echo -e "${YELLOW}Install: npm install -g appium${NC}"
    exit 1
fi

# Appium Sunucusunu Kontrol Et / Başlat
if curl -s http://127.0.0.1:4723/wd/hub/status > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Appium server is running${NC}"
else
    echo -e "${YELLOW}Starting Appium in background...${NC}"
    appium --base-path /wd/hub > appium.log 2>&1 &
    APPIUM_PID=$!
    echo -e "${GREEN}✓ Appium started (PID: $APPIUM_PID)${NC}"
    sleep 3
fi

echo ""
echo -e "${GREEN}🌟 Starting Red Pather...${NC}"
echo -e "${YELLOW}Server: ${NC}http://127.0.0.1:5000"

# UYGULAMAYI BAŞLAT
python app.py

# ÇIKIŞTA TEMİZLİK
trap "echo ''; echo -e '${YELLOW}Stopping Appium...${NC}'; kill $APPIUM_PID 2>/dev/null || true; deactivate" EXIT