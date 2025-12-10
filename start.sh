#!/bin/bash

# QA Red Pather - Startup Script
# Usage: ./start.sh [android|ios]

set -e

PLATFORM=${1:-android}
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}🚀 QA Red Pather Startup${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}⚠️  Virtual environment not found!${NC}"
    echo -e "${GREEN}Creating virtual environment...${NC}"
    python3 -m venv venv
    echo -e "${GREEN}✓ Virtual environment created${NC}"
    echo ""
fi

# Activate virtual environment
echo -e "${GREEN}🔧 Activating virtual environment...${NC}"
source venv/bin/activate

# Check if requirements are installed
if ! python -c "import flask" 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Dependencies not installed!${NC}"
    echo -e "${GREEN}Installing dependencies...${NC}"
    pip install -r requirements.txt
    echo -e "${GREEN}✓ Dependencies installed${NC}"
    echo ""
fi

# Check Appium
echo -e "${GREEN}🔍 Checking Appium...${NC}"
if ! command -v appium &> /dev/null; then
    echo -e "${RED}❌ Appium not found!${NC}"
    echo -e "${YELLOW}Install: npm install -g appium${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Appium found${NC}"

# Check Appium server
echo -e "${GREEN}🔍 Checking Appium server...${NC}"
if curl -s http://127.0.0.1:4723/wd/hub/status > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Appium server is running${NC}"
else
    echo -e "${YELLOW}⚠️  Appium server not running!${NC}"
    echo -e "${YELLOW}Starting Appium in background...${NC}"
    appium --base-path /wd/hub > appium.log 2>&1 &
    APPIUM_PID=$!
    echo -e "${GREEN}✓ Appium started (PID: $APPIUM_PID)${NC}"
    sleep 3
fi
echo ""

# Platform specific checks
if [ "$PLATFORM" == "android" ]; then
    echo -e "${GREEN}🤖 Android platform selected${NC}"

    # Check ADB
    if ! command -v adb &> /dev/null; then
        echo -e "${RED}❌ ADB not found!${NC}"
        echo -e "${YELLOW}Install Android SDK and add to PATH${NC}"
        exit 1
    fi

    # Check devices
    DEVICE_COUNT=$(adb devices | grep -v "List" | grep -c "device$" || true)
    if [ "$DEVICE_COUNT" -eq 0 ]; then
        echo -e "${YELLOW}⚠️  No Android devices connected!${NC}"
        echo -e "${YELLOW}Connect a device or start an emulator${NC}"
    else
        echo -e "${GREEN}✓ Found $DEVICE_COUNT Android device(s)${NC}"
        adb devices | grep -v "List"
    fi

elif [ "$PLATFORM" == "ios" ]; then
    echo -e "${GREEN}📱 iOS platform selected${NC}"

    # Check if on macOS
    if [[ "$OSTYPE" != "darwin"* ]]; then
        echo -e "${RED}❌ iOS testing requires macOS!${NC}"
        exit 1
    fi

    # Check simulator
    if ! command -v xcrun &> /dev/null; then
        echo -e "${RED}❌ Xcode not found!${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ Xcode tools found${NC}"
fi
echo ""

# Start Flask app
echo -e "${BLUE}================================${NC}"
echo -e "${GREEN}🌟 Starting QA Red Pather...${NC}"
echo -e "${BLUE}================================${NC}"
echo -e "${YELLOW}Server: ${NC}http://127.0.0.1:5000"
echo -e "${YELLOW}Logs: ${NC}redpather.log"
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Run app
python app.py

# Cleanup on exit
trap "echo ''; echo -e '${YELLOW}Cleaning up...${NC}'; kill $APPIUM_PID 2>/dev/null || true; deactivate" EXIT