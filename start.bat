@echo off
REM QA Red Pather - Windows Startup Script

color 0B
echo ================================
echo 🚀 QA Red Pather Startup
echo ================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo ❌ Python not found!
    echo Install Python 3.8+ from python.org
    pause
    exit /b 1
)
echo ✓ Python found
echo.

REM Check virtual environment
if not exist "venv\" (
    echo ⚠️  Virtual environment not found!
    echo Creating virtual environment...
    python -m venv venv
    echo ✓ Virtual environment created
    echo.
)

REM Activate virtual environment
echo 🔧 Activating virtual environment...
call venv\Scripts\activate.bat

REM Install dependencies
python -c "import flask" 2>nul
if errorlevel 1 (
    echo ⚠️  Dependencies not installed!
    echo Installing dependencies...
    pip install -r requirements.txt
    echo ✓ Dependencies installed
    echo.
)

REM Check Appium
where appium >nul 2>&1
if errorlevel 1 (
    color 0C
    echo ❌ Appium not found!
    echo Install: npm install -g appium
    pause
    exit /b 1
)
echo ✓ Appium found
echo.

REM Check Appium server
curl -s http://127.0.0.1:4723/wd/hub/status >nul 2>&1
if errorlevel 1 (
    echo ⚠️  Appium server not running!
    echo Please start Appium manually in another terminal:
    echo   appium --base-path /wd/hub
    echo.
    pause
)

REM Check ADB
where adb >nul 2>&1
if errorlevel 1 (
    color 0E
    echo ⚠️  ADB not found!
    echo Install Android SDK and add to PATH
    echo.
) else (
    echo ✓ ADB found
    adb devices
    echo.
)

REM Start Flask app
echo ================================
echo 🌟 Starting QA Red Pather...
echo ================================
echo Server: http://127.0.0.1:5000
echo Logs: redpather.log
echo Press Ctrl+C to stop
echo ================================
echo.

python app.py

pause