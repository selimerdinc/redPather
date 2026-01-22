"""
AI Prompt Templates - All prompt templates for Gemini AI service
Centralized location for maintainable, reusable prompts
"""


class PromptTemplates:
    """All prompt templates used by GeminiService"""

    @staticmethod
    def page_recognition(user_instructions: str = "") -> str:
        """Prompt for recognizing page name from screenshot"""
        return f"""
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

    @staticmethod
    def xpath_suggestion(element_data: str, user_instructions: str = "") -> str:
        """Prompt for suggesting XPath for an element"""
        return f"""
Based on the following mobile element data, suggest the most robust and shortest XPath.
Element Data: {element_data}

Return ONLY the XPath string.
{user_instructions}
"""

    @staticmethod
    def script_generation(steps: str, format_desc: str, user_rules: str = "") -> str:
        """Prompt for generating test scripts"""
        return f"""
Generate a test script in {format_desc} based on the following recorded steps:
Steps: {steps}

{user_rules}

Instructions:
1. Return ONLY the code.
2. Do not include markdown code blocks (no ```).
3. Follow the user formatting rules strictly.
4. If the user specified a custom keyword (like 'utils.click' instead of 'Click Element'), use it.
"""

    @staticmethod
    def element_analysis(platform: str, page_prefix: str, elements_data: str, 
                         user_instructions: str = "") -> str:
        """Prompt for analyzing elements and generating locators"""
        return f"""
You are a mobile test automation expert. Analyze these UI elements and generate the best locators.

Platform: {platform}
Page Name: {page_prefix}
Elements: {elements_data}

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

    @staticmethod
    def translate_variable_names(variable_names: str) -> str:
        """Prompt for translating and optimizing variable names"""
        return f"""
You are a test automation naming expert. Optimize these variable names.

Input names: {variable_names}

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

    @staticmethod
    def visual_audit(extra_context: str = "") -> str:
        """Prompt for visual UI/UX audit"""
        return f"""
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

    @staticmethod
    def heal_locator(broken_locator: str, element_info: str, xml_source: str) -> str:
        """Prompt for healing broken locators"""
        return f"""
Sen uzman bir Test Otomasyon Mühendisisin. Bir test adımı şu locator yüzünden başarısız oldu: "{broken_locator}"

Görevin:
1. Mevcut ekran görüntüsü ve XML yapısını inceleyerek bu elementin yeni yerini bul.
2. Eğer element hala oradaysa ama özellikleri değişmişse (ID değişimi, hiyerarşi değişimi vb.), en sağlam (robust) yeni locator'ı (mümkünse XPath veya ID) öner.
3. Element artık mevcut değilse bunu bildir.

Ek Bilgi: {element_info}
XML Kaynağı (Kısaltılmış): {xml_source}...

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

    @staticmethod
    def bug_description(platform: str, element_context: str = "") -> str:
        """Prompt for generating Jira bug descriptions"""
        return f"""
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

    @staticmethod
    def generate_keywords(elements_summary: str, user_instructions: str = "") -> str:
        """Prompt for generating Robot Framework keywords"""
        return f"""
Sen bir Robot Framework test otomasyon uzmanısın. Verilen UI elementleri için:
1. Variables bölümü oluştur
2. Her element için uygun Keywords oluştur

Element Verileri:
{elements_summary}
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

    @staticmethod
    def cross_platform_mapping(source_platform: str, target_platform: str,
                                source_locators: str, target_elements: str) -> str:
        """Prompt for cross-platform locator mapping"""
        return f"""
You are a cross-platform mobile test automation expert. Your task is to map locators from {source_platform} to {target_platform}.

SOURCE PLATFORM: {source_platform}
TARGET PLATFORM: {target_platform}

SOURCE LOCATORS (keep these variable names exactly):
{source_locators}

TARGET ELEMENTS (available on {target_platform} screen):
{target_elements}

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
  }}
]

Return ONLY valid JSON array, no markdown or explanation.
"""

    @staticmethod
    def semantic_names(platform: str, elements_json: str) -> str:
        """Prompt for generating semantic names for elements"""
        return f"""
You are a mobile app test automation expert. Your task is to generate SEMANTIC NAMES for UI elements.

PLATFORM: {platform}
ELEMENTS TO NAME:
{elements_json}

NAMING RULES:
1. Use snake_case (e.g., empty_state_message, search_button, alarm_title)
2. Names should be ENGLISH and descriptive
3. Focus on element PURPOSE not implementation
4. Common patterns:
   - Empty states → empty_[feature]_[type] (empty_alarms_message)
   - Buttons → [action]_btn (create_alarm_btn, search_btn)
   - Labels → [content]_lbl (title_lbl, subtitle_lbl)
   - Inputs → [field]_input (search_input, email_input)
   - Lists → [items]_list (alarms_list, notifications_list)

Return JSON object mapping index to semantic name:
{{"0": "semantic_name_1", "1": "semantic_name_2", ...}}

Return ONLY valid JSON, no explanation.
"""
