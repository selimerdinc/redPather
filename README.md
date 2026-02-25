# 🚀 Red Pather - Ultimate Mobile Automation Tool

**Red Pather**, Appium tabanlı, modern ve reaktif bir mobil test otomasyon aracıdır. Elementleri otomatik algılar, akıllı locator üretir, manuel test senaryolarınızı kaydeder ve AI desteğiyle bunları saniyeler içinde çalıştırılabilir test kodlarına dönüştürür.

![Python](https://img.shields.io/badge/Python-3.10%2B-blue)
![Appium](https://img.shields.io/badge/Appium-2.0%2B-purple)
![Gemini AI](https://img.shields.io/badge/AI-Gemini_2.5_Flash-orange)
![License](https://img.shields.io/badge/License-MIT-green)
![Status](https://img.shields.io/badge/Status-Active-success)

---

## ✨ Ana Özellikler (Core Features)

### 🎯 Akıllı Tarama & Analiz (Smart Scanning)
- **TrueScan™ Engine:** Ekran görüntüsü ve XML hiyerarşisini milisaniyeler içinde birleştirerek tüm tıklanabilir alanları haritalandırır.
- **Akıllı Locator Üretimi:** `ID`, `Accessibility ID`, `XPath` ve `Relative Locator` stratejilerini otomatik dener, en kararlı (stable) olanı sağlık skoruyla (`Health Score`) sunar.
- **DeepScan (Experimental):** Otomatik kaydırma (auto-scroll) yaparak sayfalardaki tüm elementleri tek bir taramada birleştirir.
- **Self-Healing XPath:** Uygulama güncellense bile elementin yeni yerini otomatik bulabilen esnek XPath algoritmaları.

### 🤖 AI Destekli Zeka (AI Intelligence)
Google Gemini 2.5 Flash ile entegre çalışan Red Pather şunları sunar:
- **Semantic Naming:** Elementlere (buton, input, text vb.) bağlamına göre otomatik ve anlamlı değişken isimleri verir.
- **AI Visual Audit:** Ekran görüntüsünü analiz ederek UI/UX hatalarını, hizalama problemlerini veya crash emarelerini raporlar.
- **Cross-Platform Mapper:** Android'de yazdığınız bir testi iOS'a (veya tam tersi) otomatik eşleme yaparak taşınabilirliği artırır.
- **Page Recognition:** Hangi sayfada olduğunuzu otomatik algılar ve sayfa bazlı prefix yönetimi yapar.

### 🎥 Test Kaydedici & Jeneratör (Recorder & Generator)
- **Live Recording:** Gerçek zamanlı etkileşimlerinizi (tap, swipe, input) kaydeder.
- **AI Scripting:** Kaydedilen adımları anında **Robot Framework** (`.robot`) veya **Python (Pytest)** (`.py`) formatına dönüştürür.
- **Keyword Generation:** Robot Framework için okunabilir ve modüler Keyword'ler üretir.

### 🔍 Crash Detective (Safety First)
- **Instant Detection:** Uygulama kilitlendiği veya kapandığı anda otomatik tespit.
- **Jira Automation:** Crash anında son 10 aksiyonu, ekran görüntüsünü ve AI tarafından üretilen detaylı teknik açıklamayı içeren bir Jira bug ticket'ı oluşturur.

---

## 🏗️ Teknik Mimari (Architecture)

Red Pather, performans ve kararlılık için modüler bir yapıda tasarlanmıştır:
- **Backend:** Flask tabanlı, çoklu işlemci yeteneğine sahip (parallel processing) asenkron engine.
- **TrueAttach™:** Appium session'larını kaybetmeden, mevcut oturumlara anında bağlanabilme (re-connect) yeteneği.
- **Frontend:** Vanilla JS (ES6+) ve Tailwind CSS ile hazırlanan, framework yükü taşımayan ultra hızlı ve premium arayüz.
- **CI/CD:** GitHub Actions entegrasyonu ile her yeni sürümde otomatik build ve release süreci.

---

## 📦 Kurulum (Installation)

### 1. Homebrew (macOS - Tavsiye Edilen)
En hızlı ve sorunsuz kurulum yöntemi budur:
```bash
brew tap selimerdinc/redpather
brew install redpather
```

### 2. Manuel Kurulum (Python)
```bash
# Repoyu klonlayın
git clone https://github.com/selimerdinc/redpather.git
cd redpather

# Bağımlılıkları yükleyin
pip install -r requirements.txt

# Çalıştırın
python app.py
```

---

## 🚀 Başlarken (Quick Start)

1. **Appium Sunucusunu Başlatın:** `appium --base-path /wd/hub`
2. **Uygulamayı Açın:** Red Pather'ı başlatın (`redpather` komutu veya `python app.py`).
3. **Ayarlar:** `.env` dosyanıza veya UI üzerindeki settings kısmına cihaz bilgilerinizi ve Gemini API key'inizi girin.
4. **Scan:** `Cmd+S` ile ilk taramanızı yapın ve elementleri yakalamaya başlayın!

---

## ⌨️ Kısayollar (Shortcuts)
| Kısayol | İşlev |
|---------|-------|
| `Cmd+S` | Hemen Tara (Quick Scan) |
| `Cmd+Shift+R` | Cihaz Ekranını Yenile |
| `Cmd+F` | Element Ara |
| `Esc` | Modalları Kapat |

---

## 📄 Lisans
Bu proje **MIT** lisansı ile sunulmaktadır. Detaylar için `LICENSE` dosyasına göz atabilirsiniz.

---
**Red Pather** - *Built for testers who value their time.* 🦅🖤🤍
