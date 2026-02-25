# 🚀 Red Pather - Ultimate Mobile Automation Tool

**Red Pather**, Appium tabanlı, modern ve reaktif bir mobil test otomasyon aracıdır. Elementleri otomatik algılar, akıllı locator üretir, manuel test senaryolarınızı kaydeder ve bunları çalıştırılabilir test kodlarına dönüştürür.

![Python](https://img.shields.io/badge/Python-3.8%2B-blue)
![Appium](https://img.shields.io/badge/Appium-2.0%2B-purple)
![License](https://img.shields.io/badge/License-MIT-green)
![Status](https://img.shields.io/badge/Status-Active-success)

## ✨ Temel Özellikler

### 🎯 Akıllı Tarama & Analiz
- **Otomatik Element Algılama:** Ekran görüntüsü ve XML kaynağını birleştirerek tıklanabilir alanları belirler.
- **Akıllı Locator Üretimi:** `ID`, `Accessibility ID`, `XPath` stratejilerini otomatik dener ve en kararlı olanı seçer.
- **Relative Locator (Anchor):** Input alanları için, yanındaki etiketlere göre konum belirler.
- **Self-Healing XPath:** Elementin yeri değişse bile bulabilen sağlam XPath'ler üretir.

### ⚡ Gelişmiş Etkileşim
- **Context Menu:** Elementlere sağ tıklayarak Send Keys, Verify Visibility, Verify Text aksiyonları
- **Nav Mode (Tap & Rescan):** Tıkladığınız yere cihazda dokunur ve ekranı otomatik yeniler
- **Smart Tap:** Koordinat yerine locator olarak kaydeder

### 🔍 Crash Detective (YENİ!)
- **Otomatik Crash Tespiti:** Uygulama kapandığında anında tespit
- **Action Buffer:** Son 10 aksiyonunuzu kaydeder
- **Jira Entegrasyonu:** Crash tespit edilince otomatik bug raporu oluşturur
- **AI Destekli Açıklama:** Gemini ile Türkçe bug description üretir

### 🤖 AI Entegrasyonları
- **Sayfa Tanıma:** AI ile sayfa adı önerisi
- **XPath Önerisi:** AI ile akıllı locator önerisi
- **Visual Audit:** Ekran görüntüsü analizi
- **Bug Description:** Jira için AI destekli hata açıklaması

### 🎥 Test Kaydedici (Recorder)
- 🤖 **Robot Framework** (`.robot`)
- 🐍 **Python (Pytest + Appium)** (`.py`)

### ⌨️ Keyboard Shortcuts
| Kısayol | İşlev |
|---------|-------|
| `Cmd+S` | Scan |
| `Cmd+Shift+R` | Refresh |
| `Cmd+F` | Element ara |
| `Esc` | Modal kapat |

## 📦 Kurulum

### 1. Ön Gereksinimler
- **Python 3.8+**
- **Node.js** & **Appium**
- **Android SDK** (Android testleri için)
- **Xcode** (iOS testleri için - Sadece macOS)

### 2. Appium Kurulumu

```bash
# Appium global kurulum
npm install -g appium

# Sürücülerin yüklenmesi
appium driver install uiautomator2  # Android
appium driver install xcuitest      # iOS (macOS)
```

### 3. Red Pather Kurulumu

```bash
# Repoyu klonlayın
git clone https://github.com/username/redpather.git
cd redpather

# Sanal ortam oluşturun
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Bağımlılıkları yükleyin
pip install -r requirements.txt
```

### 4. Homebrew (Önerilen)
Eğer macOS kullanıyorsanız, Red Pather'ı Homebrew üzerinden kurabilirsiniz:

```bash
brew tap selimerdinc/redpather
brew install redpather
```

---

## 🚀 Kullanım


### 1. Sunucuları Başlatın

```bash
# Appium sunucusunu başlatın
appium --base-path /wd/hub

# Red Pather sunucusunu başlatın
./start.sh        # Linux/macOS
start.bat         # Windows
python app.py     # Manuel
```

### 2. Arayüz
Tarayıcınızda `http://127.0.0.1:5005` adresine gidin.

### 3. Konfigürasyon

`.env` dosyasını düzenleyin:

```properties
# Android
ANDROID_DEVICE=emulator-5554
ANDROID_PKG=com.example.app
ANDROID_ACT=com.example.app.MainActivity

# iOS
IOS_DEVICE=iPhone 14
IOS_BUNDLE=com.example.app

# Jira (Opsiyonel)
JIRA_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your@email.com
JIRA_PROJECT=PROJECT_KEY
JIRA_TOKEN=your_api_token

# AI (Opsiyonel)
GEMINI_API_KEY=your_gemini_api_key

# Server (Opsiyonel)
PORT=5005
HOST=127.0.0.1
```

## 🏗️ Mimari

```
redpather/
├── backend/
│   ├── api/
│   │   ├── routes/          # Flask endpoints
│   │   └── services/        # Business logic
│   └── core/                # Driver & Cache management
├── static/
│   ├── js/
│   │   ├── components/      # UI bileşenleri
│   │   └── services/        # API & State
│   └── css/
├── templates/               # HTML
├── app.py                   # Entry point
└── requirements.txt
```

**Teknolojiler:**
- Backend: Flask, Appium Python Client, Lxml
- Frontend: Vanilla JS (ES6+), Tailwind CSS
- AI: Google Gemini
- Entegrasyonlar: Jira API

## 📄 Lisans

Bu proje MIT Lisansı ile lisanslanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına bakın.
