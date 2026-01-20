"""
Locator Mapper - Cross-Platform Locator Mapping API
Android locator'larını iOS'a (veya tersi) dönüştürür.
"""
import re
import logging
from flask import Blueprint, request, jsonify

from backend.core.context import driver_mgr, config_mgr, cache_mgr
from backend.api.services.gemini_service import GeminiService
from backend.api.services.page_analyzer import PageAnalyzer
from backend.api.middleware import create_error_response, create_success_response

logger = logging.getLogger(__name__)
locator_mapper_bp = Blueprint('locator_mapper', __name__)


def get_gemini_service():
    """GeminiService instance döndürür."""
    api_key = config_mgr.get('GEMINI_API_KEY')
    custom_prompt = config_mgr.get('AI_CUSTOM_PROMPT', "")
    return GeminiService(api_key, custom_prompt)


def parse_rf_variables(content: str) -> list:
    """
    Robot Framework Variables formatını parse eder.
    
    Input:
    *** Variables ***
    ${selector_login_email}    id=com.app:id/email
    ${selector_login_password}    xpath=//EditText[@hint='Password']
    
    Returns:
    [{variable: "${selector_login_email}", locator: "id=com.app:id/email", text_hint: "email"}, ...]
    """
    locators = []
    lines = content.strip().split('\n')
    
    for line in lines:
        line = line.strip()
        # Skip headers and empty lines
        if not line or line.startswith('***') or line.startswith('#'):
            continue
            
        # Parse: ${variable_name}    locator_value OR $(variable_name)    locator_value
        # Indentation handle: re.match usually starts from beginning, so we allow optional leading space
        # Also handles leading $ and brackets more flexibly
        match = re.search(r'([\$|@|&]\{[^}]+\})\s*=?\s*(.+)', line)
        if not match:
            # Try $(...) format as well
            match = re.search(r'([\$|@|&]\([^)]+\))\s*=?\s*(.+)', line)
            
        if match:
            variable = match.group(1).strip()
            locator = match.group(2).strip()
        else:
            # ✅ YENİ: Ham locator desteği (Değişken ismi yoksa otomatik üret)
            # Satırda '=' veya locator stratejisi varsa ham locator kabul et
            if any(strat in line for strat in ['id=', 'xpath=', 'accessibility_id=', 'name=', 'label=', 'class=']):
                variable = f"${{locator_{len(locators) + 1}}}"
                locator = line
            else:
                logger.debug(f"⏭️ Skipping invalid line: {line}")
                continue
            
        # Extract text hint from variable name or locator
        text_hint = variable.replace('${', '').replace('}', '').replace('(', '').replace(')', '').replace('selector_', '').replace('_', ' ')
        if text_hint.startswith('locator_'):
            # Ham locator ise locator içinden anlamlı bir kelime çekmeye çalış
            text_hint = locator.split('=')[-1].split('/')[-1].split('.')[-1]
            
        locators.append({
            "variable": variable,
            "locator": locator,
            "text_hint": text_hint.strip() or "element"
        })
    
    logger.info(f"📝 Parsed {len(locators)} locators from input content")
    return locators


def parse_json_format(content: str) -> list:
    """
    JSON formatını parse eder.
    
    Input:
    {"selector_login_email": "id=com.app:id/email", ...}
    
    Returns:
    [{variable: "${selector_login_email}", locator: "id=com.app:id/email", text_hint: "..."}, ...]
    """
    import json
    locators = []
    
    try:
        data = json.loads(content)
        for key, value in data.items():
            variable = f"${{{key}}}" if not key.startswith('${') else key
            text_hint = key.replace('selector_', '').replace('_', ' ')
            locators.append({
                "variable": variable,
                "locator": value,
                "text_hint": text_hint
            })
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error: {e}")
        return []
    
    return locators


def parse_keyvalue_format(content: str) -> list:
    """
    Key=Value formatını parse eder.
    
    Input:
    selector_login_email=id=com.app:id/email
    selector_login_password=xpath=//EditText[@hint='Password']
    
    Returns:
    [{variable: "${selector_login_email}", locator: "...", text_hint: "..."}, ...]
    """
    locators = []
    lines = content.strip().split('\n')
    
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
            
        # Find first = and split there
        eq_idx = line.find('=')
        if eq_idx > 0:
            key = line[:eq_idx].strip()
            value = line[eq_idx + 1:].strip()
            
            variable = f"${{{key}}}" if not key.startswith('${') else key
            text_hint = key.replace('selector_', '').replace('_', ' ')
            
            locators.append({
                "variable": variable,
                "locator": value,
                "text_hint": text_hint
            })
    
    return locators


def convert_accessibility_id_to_xpath(locator: str) -> str:
    """
    Boşluk içeren accessibility_id locator'ları XPath formatına dönüştürür.
    
    Örnek:
        accessibility_id=Alarm Bulunmuyor, Her hisse...
        → xpath=//*[@label='Alarm Bulunmuyor']
    """
    if not locator or not locator.startswith("accessibility_id="):
        return locator
    
    # accessibility_id= kısmını çıkar
    acc_id_value = locator.replace("accessibility_id=", "", 1).strip()
    
    # Boşluk içeriyorsa XPath'e dönüştür
    if " " in acc_id_value:
        # Uzun metinleri kısalt - ilk anlamlı kısmı al
        # Örn: "Alarm Bulunmuyor, Her hisse senedi..." → "Alarm Bulunmuyor"
        if "," in acc_id_value:
            acc_id_value = acc_id_value.split(",")[0].strip()
        elif len(acc_id_value) > 50:
            # Çok uzunsa ilk 3-4 kelimeyi al
            words = acc_id_value.split()[:4]
            acc_id_value = " ".join(words)
        
        # XPath'e dönüştür
        return f"xpath=//*[@label='{acc_id_value}']"
    
    # Boşluk yoksa olduğu gibi bırak
    return locator


def format_rf_variables(mappings: list) -> str:
    """
    Mapping sonuçlarını RF Variables formatına dönüştürür.
    """
    lines = ["*** Variables ***"]
    
    for m in mappings:
        if m.get("target_locator"):
            # Locator'ı gerekirse XPath'e dönüştür
            locator = convert_accessibility_id_to_xpath(m['target_locator'])
            # Variable name ve locator arasında tab kullan
            lines.append(f"{m['variable']}    {locator}")
        else:
            # Match bulunamadıysa yorum ekle
            lines.append(f"# {m['variable']}    NO MATCH FOUND")
    
    if len(lines) == 1:
        lines.append("# Kaynak locator'lar için eşleşen bir element bulunamadı.")
        lines.append("# Lütfen hedef ekranın (iOS/Android) doğru yüklendiğinden emin olun.")
        
    return '\n'.join(lines)


def format_json_output(mappings: list) -> str:
    """
    Mapping sonuçlarını JSON formatına dönüştürür.
    """
    import json
    result = {}
    
    for m in mappings:
        key = m.get("variable", "").replace("${", "").replace("}", "")
        if m.get("target_locator"):
            result[key] = m["target_locator"]
    
    return json.dumps(result, indent=2, ensure_ascii=False)


def format_keyvalue_output(mappings: list) -> str:
    """
    Mapping sonuçlarını Key=Value formatına dönüştürür.
    """
    lines = []
    
    for m in mappings:
        key = m.get("variable", "").replace("${", "").replace("}", "")
        if m.get("target_locator"):
            lines.append(f"{key}={m['target_locator']}")
    
    return '\n'.join(lines)


@locator_mapper_bp.route('/locator-mapper/map', methods=['POST'])
def map_locators():
    """
    Cross-platform locator mapping.
    
    Request Body:
    {
        "content": "*** Variables ***\n${selector_login}...",
        "format": "rf_variables" | "json" | "keyvalue",
        "source_platform": "ANDROID",
        "target_platform": "IOS",
        "output_format": "rf_variables" | "json" | "keyvalue"
    }
    
    Response:
    {
        "success": true,
        "data": {
            "mappings": [...],
            "output": "*** Variables ***\n...",
            "stats": {"total": 10, "matched": 8, "failed": 2}
        }
    }
    """
    original_platform = driver_mgr.get_platform()
    try:
        req = request.json or {}
        content = req.get("content", "").strip()
        input_format = req.get("format", "rf_variables")
        source_platform = req.get("source_platform", "ANDROID").upper()
        target_platform = req.get("target_platform", "IOS").upper()
        output_format = req.get("output_format", "rf_variables")
        
        if not content:
            return jsonify(create_error_response("Content is required", "Please provide locators to map")), 400
        
        # 1. Parse input based on format
        if input_format == "json":
            source_locators = parse_json_format(content)
        elif input_format == "keyvalue":
            source_locators = parse_keyvalue_format(content)
        else:  # rf_variables (default)
            source_locators = parse_rf_variables(content)
        
        if not source_locators:
            return jsonify(create_error_response("No locators found", "Could not parse any locators from input")), 400
        
        logger.info(f"📥 Parsed {len(source_locators)} source locators. Target: {target_platform}")
        
        # 2. Start target platform driver and scan
        try:
            # Önce hedef platforma geç ve driver'ı al
            driver = driver_mgr.start_driver(target_platform)
        except Exception as e:
            logger.error(f"❌ Failed to reach {target_platform}: {e}")
            return jsonify(create_error_response(
                f"{target_platform} Connection Failed",
                f"Could not connect to {target_platform} device. Make sure device is connected and Appium is running."
            )), 500
        
        # 3. Get target screen info
        try:
            source_xml = driver_mgr.get_page_source()
            screenshot = driver_mgr.take_screenshot()
            win_size = driver_mgr.get_window_size()
            
            if not source_xml:
                raise Exception("Empty page source received")
                
        except Exception as e:
            logger.error(f"❌ Failed to capture screen on {target_platform}: {e}")
            return jsonify(create_error_response(
                "Screen Capture Failed", 
                f"Could not retrieve UI metadata from {target_platform}. Session might have dropped."
            )), 500
        
        # 4. Analyze target screen elements
        analyzer = PageAnalyzer(driver)
        target_result = analyzer.analyze(source_xml, target_platform, should_verify=False, user_prefix="target", win_size=win_size)
        target_elements = target_result.get("elements", [])
        
        logger.info(f"🎯 Found {len(target_elements)} elements on {target_platform}")
        
        # 🔍 DEBUG: Detaylı log
        if len(target_elements) == 0:
            logger.warning("⚠️ TARGET ELEMENTS BOŞ! Hedef ekranda hiç element bulunamadı.")
        else:
            logger.debug(f"📝 İlk 3 target element: {[e.get('variable', 'N/A') for e in target_elements[:3]]}")
        
        # 5. AI ile target elementleri semantik olarak isimlendir (daha iyi eşleştirme için)
        gemini = get_gemini_service()
        mappings = []
        
        import base64
        screenshot_bytes = base64.b64decode(screenshot) if screenshot else None
        
        # Target elementler için AI semantik isimleri üret
        target_semantic_names = {}
        if gemini.is_ready():
            logger.info("🏷️ Generating semantic names for target elements...")
            target_semantic_names = gemini.generate_semantic_names(
                elements=target_elements,
                platform=target_platform,
                screenshot_bytes=screenshot_bytes
            )
            logger.info(f"✅ Got {len(target_semantic_names)} semantic names from AI")
        
        # 6. Eşleştirme Motoru (AI veya Fallback)
        if gemini.is_ready():
            logger.info("🤖 Using AI-Powered Mapping Engine (Gemini)")
            logger.info(f"📤 AI'a gönderiliyor: {len(source_locators)} kaynak, {len(target_elements)} hedef")
            
            mappings = gemini.map_locators_cross_platform(
                source_locators=source_locators,
                target_elements=target_elements,
                source_platform=source_platform,
                target_platform=target_platform,
                screenshot_bytes=screenshot_bytes
            )
            
            logger.info(f"📥 AI'dan dönen: {type(mappings).__name__}, len={len(mappings) if mappings else 0}")
            if mappings:
                logger.debug(f"📝 İlk mapping: {mappings[0] if len(mappings) > 0 else 'BOŞ'}")
        else:
            logger.warning("⚠️ AI not ready. Falling back to Enhanced Keyword Heuristic Engine.")
            import difflib
            import re
            
            # Semantik eşdeğerler (Türkçe-İngilizce ve UI pattern'leri)
            SEMANTIC_EQUIVALENTS = {
                'empty': ['bos', 'bulunmuyor', 'yok', 'none'],
                'text': ['label', 'mesaj', 'message', 'title', 'desc'],
                'button': ['btn', 'buton', 'button'],
                'input': ['field', 'textfield', 'alan'],
                'search': ['ara', 'arama'],
                'list': ['liste', 'table', 'view'],
                'delete': ['sil', 'remove', 'erase'],
                'alarm': ['alarum', 'alarms'],
            }
            
            def extract_keywords(text):
                """String'den anahtar kelimeleri çıkar"""
                # CamelCase'i ayır + alt çizgi/nokta ile böl
                text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
                words = re.split(r'[_.\-\s]+', text.lower())
                # 2 karakterden kısa kelimeleri at
                return set(w for w in words if len(w) > 2)
            
            def keyword_overlap_score(src_words, target_words):
                """Anahtar kelime örtüşme skoru hesapla"""
                if not src_words or not target_words:
                    return 0
                
                direct_overlap = len(src_words & target_words)
                
                # Semantik eşdeğerleri kontrol et
                semantic_matches = 0
                for src_word in src_words:
                    for key, equivalents in SEMANTIC_EQUIVALENTS.items():
                        if src_word == key or src_word in equivalents:
                            for target_word in target_words:
                                if target_word == key or target_word in equivalents:
                                    semantic_matches += 0.5
                                    break
                
                total_overlap = direct_overlap + semantic_matches
                max_possible = min(len(src_words), len(target_words))
                return total_overlap / max_possible if max_possible > 0 else 0
            
            for src in source_locators:
                # Source'dan keyword çıkar
                src_var = src.get("variable", "").replace("${", "").replace("}", "").replace("selector_", "")
                src_keywords = extract_keywords(src_var)
                
                best_match = None
                best_score = 0
                best_reason = ""
                
                for target in target_elements:
                    # Target'tan keyword çıkar (variable + locator)
                    target_var = target.get("variable", "").replace("${", "").replace("}", "").replace("selector_", "")
                    target_keywords = extract_keywords(target_var)
                    
                    # Locator'dan da keyword çıkar
                    locator = target.get("locator", "")
                    if "accessibility_id=" in locator:
                        acc_id = locator.split("accessibility_id=")[-1].split("'")[0]
                        target_keywords.update(extract_keywords(acc_id))
                    
                    # 1. Keyword overlap skoru
                    kw_score = keyword_overlap_score(src_keywords, target_keywords)
                    
                    # 2. Sequence matcher skoru (yedek olarak)
                    seq_score = difflib.SequenceMatcher(None, src_var.lower(), target_var.lower()).ratio()
                    
                    # Kombine skor: Keyword öncelikli
                    combined_score = max(kw_score * 1.2, seq_score, (kw_score + seq_score) / 2)
                    
                    if combined_score > best_score and combined_score > 0.25:
                        best_score = combined_score
                        best_match = target
                        common = src_keywords & target_keywords
                        best_reason = f"Ortak: {', '.join(common) if common else 'benzer yapı'}"
                
                if best_match:
                    mappings.append({
                        "variable": src["variable"],
                        "source_locator": src["locator"],
                        "target_locator": best_match["locator"],
                        "confidence": min(int(best_score * 100), 100),
                        "match_reason": f"Keyword: {best_reason}"
                    })
                else:
                    mappings.append({
                        "variable": src["variable"],
                        "source_locator": src["locator"],
                        "target_locator": None,
                        "confidence": 0,
                        "match_reason": "Eşleşme bulunamadı"
                    })
        
        if mappings is None:
            logger.warning("⚠️ AI returned None, falling back to heuristic engine...")
            import difflib
            mappings = []
            for src in source_locators:
                src_hint = src.get("text_hint", "").lower()
                best_match = None
                best_score = 0
                
                for target in target_elements:
                    target_text = (target.get("text") or target.get("content_desc") or "").lower()
                    if not target_text: continue
                    
                    score = difflib.SequenceMatcher(None, src_hint, target_text).ratio()
                    
                    if score > best_score and score > 0.3:
                        best_score = score
                        best_match = target
                
                mappings.append({
                    "variable": src["variable"],
                    "source_locator": src["locator"],
                    "target_locator": best_match.get("locator") if best_match else None,
                    "confidence": int(best_score * 100),
                    "match_reason": f"Heuristic: {int(best_score*100)}%" if best_match else "No match"
                })
        
        # Eğer hala boşsa, en azından boş mapping üret
        if not mappings:
            logger.warning("⚠️ No mappings generated, creating empty entries for all source locators")
            mappings = [
                {
                    "variable": src["variable"],
                    "source_locator": src["locator"],
                    "target_locator": None,
                    "confidence": 0,
                    "match_reason": "No matching element found on target screen"
                }
                for src in source_locators
            ]
        
        # 6. Calculate stats
        matched = sum(1 for m in mappings if m.get("target_locator"))
        failed = len(mappings) - matched
        avg_confidence = sum(m.get("confidence", 0) for m in mappings) / len(mappings) if mappings else 0
        
        logger.info(f"📊 Mapping Stats: Total={len(mappings)}, Matched={matched}, Conf={avg_confidence:.1f}%")
        
        # 7. Format output
        if output_format == "json":
            output_text = format_json_output(mappings)
        elif output_format == "keyvalue":
            output_text = format_keyvalue_output(mappings)
        else:  # rf_variables
            output_text = format_rf_variables(mappings)
        
        logger.info(f"✅ Mapping complete. Output length: {len(output_text)} chars")
        
        return jsonify(create_success_response(data={
            "mappings": mappings,
            "output": output_text,
            "screenshot": screenshot,
            "stats": {
                "total": len(mappings),
                "matched": matched,
                "failed": failed,
                "avg_confidence": round(avg_confidence, 1)
            }
        }))
        
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        logger.error(f"Locator mapping error: {e}\n{tb}")
        # Hata mesajını TAM olarak döndür
        error_detail = f"{type(e).__name__}: {str(e)}"
        return jsonify(create_error_response("Mapping failed", error_detail)), 500
    finally:
        # 8. RESTORATION: Orijinal platforma geri dön (Background thread ile)
        # Bu, Mapping bittikten sonra ana ekranın (refresh vb.) bozulmamasını sağlar
        # Thread kullanıyoruz çünkü driver başlatma işlemi ana yanıtı geciktirmemeli (timeout risk)
        if original_platform and original_platform != driver_mgr.get_platform():
            import threading
            logger.info(f"🔄 Launching background restoration to {original_platform}")
            threading.Thread(
                target=driver_mgr.start_driver, 
                args=(original_platform,),
                daemon=True
            ).start()


@locator_mapper_bp.route('/locator-mapper/parse', methods=['POST'])
def parse_locators():
    """
    Sadece locator'ları parse eder (mapping yapmadan).
    Format kontrolü için kullanılabilir.
    """
    try:
        req = request.json or {}
        content = req.get("content", "").strip()
        input_format = req.get("format", "rf_variables")
        
        if not content:
            return jsonify(create_error_response("Content is required")), 400
        
        if input_format == "json":
            locators = parse_json_format(content)
        elif input_format == "keyvalue":
            locators = parse_keyvalue_format(content)
        else:
            locators = parse_rf_variables(content)
        
        return jsonify(create_success_response(data={
            "locators": locators,
            "count": len(locators)
        }))
        
    except Exception as e:
        logger.error(f"Parse error: {e}")
        return jsonify(create_error_response("Parse failed", str(e))), 500
