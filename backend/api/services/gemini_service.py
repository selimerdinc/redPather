import os
import google.generativeai as genai
import logging
from PIL import Image
import io
import json

logger = logging.getLogger(__name__)

class GeminiService:
    def __init__(self, api_key=None, custom_prompt=""):
        self.api_key = api_key
        self.custom_prompt = custom_prompt
        if self.api_key:
            genai.configure(api_key=self.api_key)
            # Güncel model kullan
            self.model = genai.GenerativeModel('gemini-2.0-flash-exp')
        else:
            self.model = None

    def is_ready(self):
        return self.model is not None

    def _prepare_image(self, screenshot_bytes):
        return Image.open(io.BytesIO(screenshot_bytes))

    def _clean_json_response(self, text):
        """AI yanıtındaki markdown bloklarını ve gereksiz metinleri temizleyerek JSON döner."""
        if not text:
            return None
            
        cleaned = text.strip()
        
        # Markdown kod bloklarını temizle
        if "```json" in cleaned:
            cleaned = cleaned.split("```json")[1].split("```")[0].strip()
        elif "```" in cleaned:
            parts = cleaned.split("```")
            if len(parts) >= 3:
                cleaned = parts[1].strip()
            else:
                cleaned = parts[0].strip()
                
        # Başındaki/sonundaki boşlukları ve olası "json" kelimesini temizle
        cleaned = cleaned.strip()
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
            
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI JSON response: {e}\nOriginal text: {text[:200]}...")
            return None

    def recognize_page(self, screenshot_bytes, xml_content=None):
        if not self.model:
            return "unknown"
        
        try:
            img = self._prepare_image(screenshot_bytes)
            user_instructions = f"\nUser Additional Instructions: {self.custom_prompt}" if self.custom_prompt else ""
            
            prompt = f"""
            Sen bir mobil uygulama test uzmanısın. Bu ekran görüntüsüne bak ve bu sayfanın ne olduğunu belirle.
            
            Görevin:
            1. Ekrandaki UI elementlerini analiz et (butonlar, yazılar, ikonlar, listeler)
            2. Bu sayfanın hangi özellik/fonksiyon için kullanıldığını anla
            3. Sayfa için kısa, açıklayıcı bir isim ver
            
            Kurallar:
            - İsim İngilizce olmalı
            - 1-3 kelime olmalı
            - Küçük harf ve alt çizgi kullan (örnek: home_dashboard, login_screen, settings_menu)
            - SADECE sayfa ismini döndür, başka açıklama yapma
            
            Örnekler:
            - Ana sayfa/Dashboard → "home" veya "dashboard"
            - Giriş ekranı → "login" 
            - Ayarlar → "settings"
            - Profil → "profile"
            - Liste ekranı → "list" veya içeriğe göre "products_list"
            {user_instructions}
            """
            
            response = self.model.generate_content([prompt, img])
            result = response.text.strip().lower().replace(" ", "_").replace("-", "_")
            # Temizle: sadece harf, rakam ve alt çizgi kalsın
            result = ''.join(c for c in result if c.isalnum() or c == '_')
            return result if result else "page"
        except Exception as e:
            logger.error(f"Gemini page recognition error: {e}")
            return "unknown"

    def suggest_xpath(self, element_data, xml_context=None):
        if not self.model:
            return None
        
        try:
            user_instructions = f"\nUser Additional Instructions: {self.custom_prompt}" if self.custom_prompt else ""
            
            prompt = f"""
            Based on the following mobile element data, suggest the most robust and shortest XPath.
            Element Data: {json.dumps(element_data)}
            
            Return ONLY the XPath string.
            {user_instructions}
            """
            response = self.model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            logger.error(f"Gemini XPath suggestion error: {e}")
            return None

    def generate_script(self, steps, format="robot"):
        if not self.model:
            return None
            
        try:
            user_rules = f"\nUser Formatting Rules/Prompt: {self.custom_prompt}" if self.custom_prompt else ""
            
            format_desc = "Robot Framework" if format == "robot" else "Python (Pytest + Appium)"
            
            prompt = f"""
            Generate a test script in {format_desc} based on the following recorded steps:
            Steps: {json.dumps(steps)}
            
            {user_rules}
            
            Instructions:
            1. Return ONLY the code.
            2. Do not include markdown code blocks (no ```).
            3. Follow the user formatting rules strictly.
            4. If the user specified a custom keyword (like 'utils.click' instead of 'Click Element'), use it.
            """
            
            response = self.model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            logger.error(f"Gemini script generation error: {e}")
            return None

    def analyze_elements(self, elements_data, platform, page_prefix="page"):
        """
        AI ile tüm elementler için locator oluşturur.
        
        Args:
            elements_data: Element listesi (coords, class, text, resource-id vb.)
            platform: ANDROID veya IOS
            page_prefix: Sayfa ön eki
            
        Returns:
            list: Her element için {locator, variable, strategy} içeren liste
        """
        if not self.model:
            return None
            
        try:
            user_instructions = f"\nUser Additional Instructions: {self.custom_prompt}" if self.custom_prompt else ""
            
            prompt = f"""
            You are a mobile test automation expert. Analyze these UI elements and generate the best locators.
            
            Platform: {platform}
            Page Name: {page_prefix}
            Elements: {json.dumps(elements_data, ensure_ascii=False)}
            
            {user_instructions}
            
            For each element, return a JSON array with objects containing:
            - "index": original element index
            - "locator": the best locator string (e.g., "id=com.app/button1" or "xpath=//Button[@text='OK']")
            - "variable": a SHORT, ENGLISH-ONLY variable name like "${{selector_home_login_btn}}"
            - "strategy": one of "AI_ID", "AI_XPATH", "AI_ACC_ID", "AI_TEXT"
            
            CRITICAL NAMING RULES:
            1. Variable names MUST be in ENGLISH only
            2. Translate any Turkish/non-English words to English (e.g., "bakiye" → "balance", "giris" → "login")
            3. Keep names SHORT: max 3-4 words after "selector_page_"
            4. Use abbreviations: "button" → "btn", "label" → "lbl", "input" → "inp"
            5. Remove redundant words like "dashboard", "screen", "view", "container"
            6. Remove duplicate words (e.g., "home_home" → "home")
            
            LOCATOR PRIORITY:
            1. Prefer shorter, more stable locators (ID > accessibility_id > text > xpath)
            
            Return ONLY valid JSON array, no markdown or explanation.
            
            Example output:
            [
              {{"index": 0, "locator": "id=com.app/loginBtn", "variable": "${{selector_login_submit_btn}}", "strategy": "AI_ID"}},
              {{"index": 1, "locator": "accessibility_id=Username", "variable": "${{selector_login_username_inp}}", "strategy": "AI_ACC_ID"}}
            ]
            """
            
            response = self.model.generate_content(prompt)
            return self._clean_json_response(response.text)
        except Exception as e:
            logger.error(f"Gemini element analysis error: {e}")
            return None

    def translate_variable_names(self, variable_names):
        """
        AI ile değişken isimlerini İngilizceye çevirir ve optimize eder.
        
        Args:
            variable_names: Değişken isimleri listesi (str list)
            
        Returns:
            dict: {original_name: optimized_name} mapping
        """
        if not self.model:
            return None
            
        try:
            prompt = f"""
            You are a test automation naming expert. Optimize these variable names.
            
            Input names: {json.dumps(variable_names, ensure_ascii=False)}
            
            For each name, return an optimized version following these rules:
            1. ENGLISH ONLY - translate any Turkish/foreign words
            2. SHORT - maximum 30 characters
            3. MEANINGFUL - keep the semantic meaning
            4. NO REDUNDANCY - remove words like "dashboard", "screen", "view", "container", "wrapper"
            5. NO DUPLICATES - remove repeated consecutive words
            6. USE ABBREVIATIONS: button→btn, label→lbl, input→inp, image→img
            
            Common translations:
            - sirket → company, varlik → asset, ara → search
            - toplam → total, bakiye → balance, giris → login
            - kullanici → user, hesap → account, ayarlar → settings
            
            Return JSON object mapping original → optimized names.
            Example: {{"selector_home_sirket_ara": "selector_home_company_search"}}
            
            Return ONLY JSON, no explanation.
            """
            
            response = self.model.generate_content(prompt)
            return self._clean_json_response(response.text)
        except Exception as e:
            logger.error(f"Translate variable names error: {e}")
            return None

    def visual_audit(self, screenshot_bytes, custom_instructions=None):
        """
        AI ile görsel denetim yapar. UI hataları, hizalama sorunları ve 
        kullanıcı deneyimi açıklarını bulur.
        """
        if not self.model:
            return None
            
        try:
            img = self._prepare_image(screenshot_bytes)
            
            # Kullanıcıdan gelen özel talimatlar (dil seçimi vb.)
            extra_context = ""
            if custom_instructions:
                extra_context = f"\nKRİTİK TALİMAT: {custom_instructions}"
            elif self.custom_prompt:
                extra_context = f"\nEk Talimat: {self.custom_prompt}"

            prompt = f"""
            Sen uzman bir UI/UX ve Mobil Test mühendisisin. Bu ekran görüntüsünü analiz et ve bir denetim raporu (QA Audit) hazırla.
            
            Görevin şunları bulmak:
            1. UI Hataları: Bozuk görseller, taşan yazılar, eksik ikonlar.
            2. Tasarım Hataları: Uyumsuz renkler, kötü hizalama, küçük fontlar.
            3. Erişilebilirlik: Okunması zor metinler, birbirine çok yakın butonlar.
            4. İyileştirme Önerileri: Bu ekran nasıl daha premium ve kullanışlı olabilir?
            
            {extra_context}
            
            Yanıtı şu JSON formatında ver (başka açıklama yapma):
            {{
              "status": "warning" | "error" | "ok",
              "overall_score": 1-100,
              "findings": [
                {{
                  "type": "UI" | "UX" | "Design" | "Accessibility",
                  "severity": "high" | "medium" | "low",
                  "title": "Hata başlığı",
                  "description": "Detaylı açıklama",
                  "recommendation": "Nasıl düzeltilir?"
                }}
              ],
              "summary": "Genel özet cümlesi"
            }}
            """
            
            response = self.model.generate_content([prompt, img])
            return self._clean_json_response(response.text)
        except Exception as e:
            logger.error(f"Gemini visual audit error: {e}")
            return None

    def heal_locator(self, screenshot_bytes, xml_source, broken_locator, element_info=None):
        """
        AI ile bozulan locator'ı onarır.
        """
        if not self.model:
            return None
            
        try:
            img = self._prepare_image(screenshot_bytes)
            
            prompt = f"""
            Sen uzman bir Test Otomasyon Mühendisisin. Bir test adımı şu locator yüzünden başarısız oldu: "{broken_locator}"
            
            Görevin:
            1. Mevcut ekran görüntüsü ve XML yapısını inceleyerek bu elementin yeni yerini bul.
            2. Eğer element hala oradaysa ama özellikleri değişmişse (ID değişimi, hiyerarşi değişimi vb.), en sağlam (robust) yeni locator'ı (mümkünse XPath veya ID) öner.
            3. Element artık mevcut değilse bunu bildir.
            
            Ek Bilgi: {element_info if element_info else "Bilgi yok"}
            XML Kaynağı (Kısaltılmış): {xml_source[:5000]}...
            
            Yanıtı şu JSON formatında ver (başka açıklama yapma):
            {{
              "status": "healed" | "not_found",
              "reason": "Neden bozulduğuna dair kısa açıklama",
              "old_locator": "{broken_locator}",
              "new_locator": "önerilen_yeni_locator",
              "confidence": 1-100,
              "explanation": "Detaylı açıklama ve farklar"
            }}
            """
            
            response = self.model.generate_content([prompt, img])
            result_text = response.text.strip()

            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0].strip()
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0].strip()

            return json.loads(result_text)
        except Exception as e:
            logger.error(f"Heal locator error: {e}")
            return None

    def generate_bug_description(self, screenshot_bytes, element_info=None, platform="ANDROID"):
        """
        AI ile Jira bug için detaylı description oluşturur.
        """
        if not self.model:
            return None
            
        try:
            img = self._prepare_image(screenshot_bytes)
            
            element_context = ""
            if element_info:
                element_context = f"""
Element Details:
- Locator: {element_info.get('locator', 'N/A')}
- Type: {element_info.get('class_name', 'N/A')}
- Text: {element_info.get('text', 'N/A')}
"""
            
            prompt = f"""
            Sen bir QA uzmanısın ve Jira için hata raporu yazıyorsun. Bu mobil uygulama ekran görüntüsünü analiz et ve detaylı bir hata açıklaması oluştur.
            
            Platform: {platform}
            {element_context}
            
            Profesyonel bir hata raporu oluştur. TÜRKÇE yaz:
            1. **Açıklama**: Sorun nedir? Spesifik ol.
            2. **Yeniden Üretme Adımları**: Bu duruma ulaşmak için numaralı adımlar.
            3. **Beklenen Sonuç**: Ne olması gerekiyor?
            4. **Gerçekleşen Sonuç**: Bunun yerine ne oluyor?
            
            Yanıtını Jira'ya uygun düz metin olarak formatla (markdown başlıkları kullanma).
            Kısa ama profesyonel tut.
            SADECE hata açıklama metnini döndür, JSON veya ekstra formatlama yapma.
            TÜM YANITINI TÜRKÇE YAZMALSIN.
            """
            
            response = self.model.generate_content([prompt, img])
            return response.text.strip()
        except Exception as e:
            logger.error(f"Generate bug description error: {e}")
            return None

    def generate_keywords(self, elements_data, screenshot_bytes=None, custom_prompt=""):
        """
        AI ile Robot Framework keywords ve variables üretir.
        
        Args:
            elements_data: Element listesi (variable, locator, class_name bilgileri)
            screenshot_bytes: Opsiyonel ekran görüntüsü
            custom_prompt: Kullanıcının özel prompt'u
            
        Returns:
            dict: {variables: str, keywords: str, full_output: str}
        """
        if not self.model:
            return None
            
        try:
            # Element verilerini hazırla
            elements_summary = []
            for el in elements_data:
                elements_summary.append({
                    "variable": el.get("variable", ""),
                    "locator": el.get("locator", ""),
                    "type": el.get("class_name", ""),
                    "text": el.get("text", "")[:50] if el.get("text") else ""
                })
            
            user_instructions = f"\n\nKullanıcı Özel Talimatları:\n{custom_prompt}" if custom_prompt else ""
            
            prompt = f"""
Sen bir Robot Framework test otomasyon uzmanısın. Verilen UI elementleri için:
1. Variables bölümü oluştur
2. Her element için uygun Keywords oluştur

Element Verileri:
{json.dumps(elements_summary, ensure_ascii=False, indent=2)}
{user_instructions}

KURALLAR:
1. Button/Clickable elementler için "Click [Element Adı]" keyword'ü oluştur
2. Input/TextField elementler için "[Arguments] ${{text}}" alan "Fill [Element Adı]" keyword'ü oluştur  
3. Checkbox için "Toggle [Element Adı]" kullan
4. Variable isimleri açık ve anlaşılır olsun
5. Keyword isimleri İngilizce, okunabilir olsun (örn: "Click Login Button", "Fill Username Field")
6. Her keyword'ün tek satır açıklaması olsun ([Documentation])

ÇIKTI FORMATI (TAM OLARAK BU ŞEKİLDE):
*** Variables ***
${{selector_element_name}}    locator_value

*** Keywords ***
Click Element Name
    [Documentation]    Clicks the element name button
    Click Element    ${{selector_element_name}}

Fill Element Name
    [Arguments]    ${{text}}
    [Documentation]    Fills the element name input field
    Input Text    ${{selector_element_name}}    ${{text}}

SADECE ROBOT FRAMEWORK KODU DÖNDÜR, BAŞKA BİR ŞEY YAZMA.
"""
            
            # Eğer screenshot varsa görsel analiz de yap
            if screenshot_bytes:
                img = self._prepare_image(screenshot_bytes)
                response = self.model.generate_content([prompt, img])
            else:
                response = self.model.generate_content(prompt)
            
            result_text = response.text.strip()
            
            # Markdown code block temizle
            if result_text.startswith("```"):
                lines = result_text.split("\n")
                lines = [l for l in lines if not l.startswith("```")]
                result_text = "\n".join(lines)
            
            # Variables ve Keywords bölümlerini ayır
            variables = ""
            keywords = ""
            
            if "*** Variables ***" in result_text:
                parts = result_text.split("*** Keywords ***")
                variables = parts[0].strip()
                if len(parts) > 1:
                    keywords = "*** Keywords ***" + parts[1].strip()
            
            return {
                "variables": variables,
                "keywords": keywords,
                "full_output": result_text
            }
            
        except Exception as e:
            logger.error(f"Generate keywords error: {e}")
            return None

    def map_locators_cross_platform(self, source_locators: list, target_elements: list, 
                                     source_platform: str = "ANDROID", target_platform: str = "IOS",
                                     screenshot_bytes=None):
        """
        Android locator'larını iOS'a (veya tersi) dönüştürür.
        
        Args:
            source_locators: Kaynak locator listesi [{variable, locator, text_hint}, ...]
            target_elements: Hedef platformdaki elementler (scan sonucu)
            source_platform: Kaynak platform (ANDROID veya IOS)
            target_platform: Hedef platform (ANDROID veya IOS)
            screenshot_bytes: Hedef ekran görüntüsü (opsiyonel, daha iyi eşleşme için)
            
        Returns:
            list: [{variable, source_locator, target_locator, confidence, match_reason}, ...]
        """
        if not self.model:
            return None
            
        try:
            # Screenshot varsa image olarak hazırla
            img = self._prepare_image(screenshot_bytes) if screenshot_bytes else None
            
            prompt = f"""
You are a cross-platform mobile test automation expert. Your task is to map locators from {source_platform} to {target_platform}.

SOURCE PLATFORM: {source_platform}
TARGET PLATFORM: {target_platform}

SOURCE LOCATORS (keep these variable names exactly):
{json.dumps(source_locators, ensure_ascii=False, indent=2)}

TARGET ELEMENTS (available on {target_platform} screen):
{json.dumps(target_elements[:50], ensure_ascii=False, indent=2)}

MATCHING RULES:
1. Match by SEMANTIC MEANING - same functionality, same purpose
2. Match by TEXT when available - buttons with same/similar text
3. Match by POSITION if text differs - same relative position on screen
4. Match by TYPE - button→button, input→input, label→label
5. PRESERVE the original variable name exactly

For each source locator, find the best matching target element and return:
- variable: EXACT same variable name from source
- source_locator: original locator from source
- target_locator: best locator for target platform (prefer accessibility_id > id > xpath)
- confidence: 1-100 (how confident are you in this match)
- match_reason: brief explanation why this is a match

Return JSON array. If no match found for an element, set target_locator to null and confidence to 0.

Example output:
[
  {{
    "variable": "${{selector_login_email_inp}}",
    "source_locator": "id=com.app:id/email_field",
    "target_locator": "accessibility_id=emailTextField",
    "confidence": 95,
    "match_reason": "Same email input field by text and position"
  }},
  {{
    "variable": "${{selector_login_submit_btn}}",
    "source_locator": "xpath=//Button[@text='Login']",
    "target_locator": "accessibility_id=loginButton",
    "confidence": 90,
    "match_reason": "Login button matched by text 'Login'"
  }}
]

Return ONLY valid JSON array, no markdown or explanation.
"""
            
            if img:
                response = self.model.generate_content([prompt, img])
            else:
                response = self.model.generate_content(prompt)
            
            return self._clean_json_response(response.text)
            
        except Exception as e:
            logger.error(f"Map locators cross-platform error: {e}")
            return None
