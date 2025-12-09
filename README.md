# 🚀 QA Red Pather - Complete Setup Guide

Modern mobil test otomasyonu aracı. Appium tabanlı, akıllı element algılama ve locator üretimi.

## 📋 İçindekiler

- [Özellikler](#özellikler)
- [Kurulum](#kurulum)
- [Kullanım](#kullanım)
- [Mimari](#mimari)
- [API Dokümantasyonu](#api-dokümantasyonu)
- [Sorun Giderme](#sorun-giderme)

## ✨ Özellikler

### 🎯 Temel Özellikler
- ✅ Android & iOS desteği
- ✅ Otomatik element algılama
- ✅ Akıllı locator üretimi (ID, XPath, Accessibility ID)
- ✅ Görsel element highlighter
- ✅ XML source viewer
- ✅ Locator doğrulama
- ✅ Hot-reload configuration
- ✅ Screenshot optimizasyonu

### 🧠 Akıllı Özellikler
- Relative locator üretimi (input field'lar için)
- Hierarchical XPath fallback
- Page name tahmini
- Element type detection
- Multi-strategy locator generation

## 📦 Kurulum

### 1. Gereksinimler

```bash
# Python 3.8+
python --version

# Node.js (Appium için)
node --version
npm --version
```

### 2. Appium Kurulumu

```bash
# Appium global kurulum
npm install -g appium

# UiAutomator2 driver (Android)
appium driver install uiautomator2

# XCUITest driver (iOS - sadece macOS)
appium driver install xcuitest

# Appium başlatma
appium --base-path /wd/hub
```

### 3. Android SDK Kurulumu

```bash
# macOS için örnek
export ANDROID_HOME=/Users/$USER/Library/Android/sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH=$PATH:$ANDROID_HOME/platform-tools

# Test
adb devices
```

### 4. Python Bağımlılıkları

```bash
# Virtual environment oluştur
python -m venv venv

# Aktive et
# macOS/Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate

# Bağımlılıkları yükle
pip install -r requirements.txt
```

### 5. Proje Yapısı

```
redPather/
├── backend/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── __init__.py      ✅ Blueprint registration
│   │   │   ├── main.py          ✅ Health & UI routes
│   │   │   ├── config.py        ✅ Configuration
│   │   │   ├── scan.py          ✅ Screen analysis
│   │   │   └── actions.py       ✅ Device actions
│   │   ├── services/
│   │   │   ├── config_manager.py
│   │   │   └── page_analyzer.py
│   │   └── middleware.py        ✅ Error handlers
│   ├── core/
│   │   ├── constants.py         ✅ App constants
│   │   ├── context.py           ✅ Singletons
│   │   ├── exceptions.py        ✅ Custom errors
│   │   └── driver_manager.py    ✅ Appium driver
│   └── services/
│       ├── config_manager.py    ✅ Re-export
│       └── page_analyzer.py     ✅ Re-export
├── static/
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── services/
│       │   ├── api.service.js   ✅ API client
│       │   └── state.service.js ✅ State management
│       └── app.js               ✅ Main app
├── templates/
│   └── index.html
├── .env                         ✅ Configuration
├── .gitignore
├── app.py                       ✅ Flask app
└── requirements.txt
```

## 🚀 Kullanım

### 1. Appium Sunucusunu Başlat

```bash
# Terminal 1
appium --base-path /wd/hub
```

### 2. Cihazı Hazırla

**Android Emulator:**
```bash
# Emulator listesi
emulator -list-avds

# Emulator başlat
emulator -avd Pixel_5_API_30

# Cihaz kontrolü
adb devices
```

**Android Gerçek Cihaz:**
```bash
# USB debugging aktif olmalı
adb devices

# Paket ve Activity bul
adb shell dumpsys window | grep -E 'mCurrentFocus'
```

**iOS Simulator:**
```bash
# Simulator listesi
xcrun simctl list devices

# Simulator başlat
open -a Simulator
```

### 3. Uygulamayı Yapılandır

`.env` dosyasını düzenle:

```bash
# ANDROID CONFIG
ANDROID_DEVICE="emulator-5554"
ANDROID_PKG="com.example.app"
ANDROID_ACT="com.example.app.MainActivity"
ANDROID_NO_RESET=True
ANDROID_FULL_RESET=False

# IOS CONFIG
IOS_DEVICE="iPhone 14"
IOS_BUNDLE="com.example.app"
IOS_UDID=""
IOS_PLATFORM_VER="16.0"
IOS_ORG_ID=""
IOS_SIGN_ID="iPhone Developer"
```

### 4. Sunucuyu Başlat

```bash
# Terminal 2
python app.py
```

### 5. Tarayıcıda Aç

```
http://127.0.0.1:5000
```

## 🎮 Kullanım Kılavuzu

### Temel İşlemler

1. **SCAN**: Ekranı analiz et ve elementleri algıla
2. **NAV MODE**: Tap & auto-rescan modu
3. **VERIFY**: Locator'ları otomatik doğrula
4. **Scroll Up/Down**: Sayfa kaydırma
5. **Back**: Geri git
6. **Hide Keyboard**: Klavyeyi kapat

### Kısayollar

- `Ctrl/Cmd + S`: Scan
- `Ctrl/Cmd + C`: Copy all variables
- `Hover`: Element highlight
- `Click`: Element select
- `Shift + Click`: Tap element (NAV MODE)

### Element İşlemleri

- 🔍 **Verify**: Locator'ı doğrula
- 📋 **Copy**: Elementi kopyala
- ✕ **Delete**: Elementi kaldır
- ✏️ **Edit**: Variable adını düzenle (çift tıkla)

## 🏗️ Mimari

### Backend (Flask + Appium)

```
┌─────────────────────────────────────────┐
│          Flask Application               │
│  ┌────────────────────────────────────┐ │
│  │         Blueprints                  │ │
│  │  - main_bp    (/, /health)         │ │
│  │  - config_bp  (/api/config)        │ │
│  │  - scan_bp    (/api/scan)          │ │
│  │  - actions_bp (/api/tap, /scroll)  │ │
│  └────────────────────────────────────┘ │
│  ┌────────────────────────────────────┐ │
│  │      Middleware & Handlers          │ │
│  │  - Error handlers                   │ │
│  │  - Response formatters              │ │
│  └────────────────────────────────────┘ │
│  ┌────────────────────────────────────┐ │
│  │         Core Services               │ │
│  │  - ConfigManager (singleton)        │ │
│  │  - DriverManager (singleton)        │ │
│  │  - PageAnalyzer                     │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
              ↓
        Appium Server
```

### Frontend (Vanilla JS)

```
┌─────────────────────────────────────────┐
│         RedPatherApp                     │
│  ┌────────────────────────────────────┐ │
│  │       API Service                   │ │
│  │  - HTTP client                      │ │
│  │  - Retry logic                      │ │
│  │  - Error handling                   │ │
│  └────────────────────────────────────┘ │
│  ┌────────────────────────────────────┐ │
│  │      State Service                  │ │
│  │  - Reactive state                   │ │
│  │  - Subscriptions                    │ │
│  │  - UI sync                          │ │
│  └────────────────────────────────────┘ │
│  ┌────────────────────────────────────┐ │
│  │         UI Components               │ │
│  │  - Element list                     │ │
│  │  - Screenshot overlay               │ │
│  │  - XML tree viewer                  │ │
│  │  - Modals & Toasts                  │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

## 📡 API Dokümantasyonu

### Configuration Endpoints

#### GET /api/config
Mevcut konfigürasyonu getir.

**Response:**
```json
{
  "success": true,
  "data": {
    "ANDROID_DEVICE": "emulator-5554",
    "ANDROID_PKG": "com.example.app",
    "ANDROID_ACT": "com.example.app.MainActivity",
    ...
  }
}
```

#### POST /api/config
Konfigürasyonu güncelle.

**Request Body:**
```json
{
  "ANDROID_PKG": "com.newapp.package",
  "ANDROID_ACT": "com.newapp.MainActivity"
}
```

### Scan Endpoint

#### POST /api/scan
Ekranı analiz et ve elementleri algıla.

**Request Body:**
```json
{
  "platform": "ANDROID",
  "verify": true,
  "prefix": "login"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "image": "base64...",
    "elements": [...],
    "page_name": "login",
    "window_w": 1080,
    "window_h": 2340,
    "raw_source": "<?xml..."
  }
}
```

### Action Endpoints

#### POST /api/tap
Cihazda tap işlemi yap.

**Request Body:**
```json
{
  "x": 540,
  "y": 1200,
  "img_w": 360,
  "img_h": 780,
  "platform": "ANDROID"
}
```

#### POST /api/scroll
Scroll işlemi yap.

**Request Body:**
```json
{
  "direction": "down",
  "platform": "ANDROID"
}
```

#### POST /api/back
Geri tuşuna bas.

#### POST /api/hide-keyboard
Klavyeyi kapat.

#### POST /api/verify
Locator doğrula.

**Request Body:**
```json
{
  "locator": "id=com.example:id/button"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "count": 1,
    "locator": "id=com.example:id/button"
  }
}
```

## 🐛 Sorun Giderme

### Appium Bağlantı Hatası

```bash
# Appium çalışıyor mu?
curl http://127.0.0.1:4723/wd/hub/status

# Port kullanımda mı?
lsof -i :4723

# Appium logları
appium --log-level debug
```

### Android Cihaz Bulunamıyor

```bash
# ADB kontrol
adb devices

# ADB server restart
adb kill-server
adb start-server

# USB debugging açık mı?
# Ayarlar > Geliştirici Seçenekleri > USB Debugging
```

### iOS Simulator Sorunu

```bash
# Simulator reset
xcrun simctl erase all

# Simulator listesi
xcrun simctl list devices

# WebDriverAgent yükleme
cd /path/to/WebDriverAgent
xcodebuild -project WebDriverAgent.xcodeproj -scheme WebDriverAgentRunner -destination 'platform=iOS Simulator,name=iPhone 14' test
```

### Python Import Hatası

```bash
# Virtual environment aktif mi?
which python

# Bağımlılıkları tekrar yükle
pip install --force-reinstall -r requirements.txt
```

### Screenshot Alamıyor

- Ekran kilidi açık olabilir
- Uygulama çalışıyor mu kontrol et
- Appium loglarını incele

### Element Bulunamıyor

- Page source alınıyor mu kontrol et
- XML parse hatası var mı?
- Element ignore listesinde mi?

## 🔧 Geliştirme

### Debug Mode

```python
# app.py
app.run(debug=True, port=5000)
```

### Frontend Debug

```javascript
// Browser console
debugState()  // State'i göster
window.appState.logState()  // Detaylı state log
```

### Backend Loglama

```python
import logging
logging.getLogger('appium').setLevel(logging.DEBUG)
```

## 📝 TODO

- [ ] Element edit özelliği
- [ ] Locator öneri sistemi
- [ ] Test case export (Robot Framework, Pytest)
- [ ] Element grupları
- [ ] Screenshot history
- [ ] Multi-device support
- [ ] Cloud Appium support

## 📄 Lisans

MIT License - Detaylar için LICENSE dosyasına bakın.

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push yapın (`git push origin feature/amazing`)
5. Pull Request açın

## 📧 İletişim

Sorular ve öneriler için issue açabilirsiniz.

---

**Made with ❤️ for QA Engineers**