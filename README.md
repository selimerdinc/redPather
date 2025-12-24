# 🚀 QA Red Pather - Ultimate Mobile Automation Tool

**QA Red Pather**, Appium tabanlı, modern ve reaktif bir mobil test otomasyon aracıdır. Elementleri otomatik algılar, akıllı locator (konumlandırıcı) üretir, manuel test senaryolarınızı kaydeder ve bunları çalıştırılabilir test kodlarına (Robot Framework / Python) dönüştürür.

![Python](https://img.shields.io/badge/Python-3.8%2B-blue)
![Appium](https://img.shields.io/badge/Appium-2.0%2B-purple)
![License](https://img.shields.io/badge/License-MIT-green)
![Status](https://img.shields.io/badge/Status-Active-success)

## ✨ Temel Özellikler

### 🎯 Akıllı Tarama & Analiz
- **Otomatik Element Algılama:** Ekran görüntüsü ve XML kaynağını birleştirerek tıklanabilir alanları belirler.
- **Akıllı Locator Üretimi:** `ID`, `Accessibility ID`, `XPath` stratejilerini otomatik dener ve en kararlı olanı seçer.
- **Relative Locator (Anchor):** Input alanları için, yanındaki etiketlere (Label) göre konum belirler (`Anchor Strategy`).
- **Self-Healing XPath:** Elementin yeri değişse bile bulabilen sağlam (robust) XPath'ler üretir.

### ⚡ Gelişmiş Etkileşim (Yeni)
- **Sağ Tık Menüsü (Context Menu):** Elementlere sağ tıklayarak hızlı aksiyonlar alın:
  - ✍️ **Send Keys:** Metin girişi yapın ve doğrulayın.
  - 👁️ **Verify Visibility:** Elementin görünürlüğünü test senaryosuna ekleyin.
  - 📝 **Verify Text:** Element metnini assert (doğrulama) adımı olarak ekleyin.
- **Nav Mode (Tap & Rescan):** Cihazı doğrudan tarayıcıdan yönetin. Tıkladığınız yere cihazda dokunur ve ekranı otomatik yeniler.
- **Smart Tap:** Koordinat bazlı tıklamalarda, tıklanan noktanın altındaki XML elementini analiz eder ve koda koordinat yerine `locator` olarak yazar.

### 🎥 Test Kaydedici (Recorder)
Yaptığınız işlemleri (Tıklama, Scroll, Metin Girişi, Assertion) kaydeder ve aşağıdaki formatlarda dışa aktarır:
- 🤖 **Robot Framework** (`.robot`)
- 🐍 **Python (Pytest + Appium)** (`.py`)

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


# Repoyu klonlayın
git clone [https://github.com/username/redpather.git](https://github.com/username/redpather.git)
cd redpather

# Sanal ortam oluşturun (Önerilen)
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Bağımlılıkları yükleyin
pip install -r requirements.txt


🚀 Kullanım
1. Sunucuları Başlatın
- Önce Appium sunucusunu başlatın:

appium --base-path /wd/hub

- Ardından Red Pather sunucusunu başlatın:


# Linux/macOS
./start.sh

# Windows
start.bat
Veya manuel olarak: python app.py.

2. Arayüz 
- Tarayıcınızda http://127.0.0.1:5000 adresine gidin.

3. Konfigürasyon
Sol üstteki Ayarlar ikonuna tıklayarak veya .env dosyasını düzenleyerek cihaz bilgilerinizi girin:

Properties

# .env örneği
ANDROID_DEVICE=emulator-5554
ANDROID_PKG=com.example.app
ANDROID_ACT=com.example.app.MainActivity
IOS_DEVICE=iPhone 14
IOS_BUNDLE=com.example.app

🏗️ Mimari
Proje modüler bir yapıya sahiptir:

Backend: Flask, Appium Python Client, Lxml (XML Parsing).

Frontend: Vanilla JS (ES6+), Tailwind CSS.

State Management: StateService (Pub/Sub pattern).

Core: PageAnalyzer sınıfı, ekranı analiz eden gelişmiş algoritmaları barındırır.


.

📄 Lisans
Bu proje MIT Lisansı ile lisanslanmıştır. Detaylar için LICENSE dosyasına bakın.
