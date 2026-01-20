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
            
        # Parse: ${variable_name}    locator_value
        match = re.match(r'(\$\{[^}]+\})\s+(.+)', line)
        if match:
            variable = match.group(1).strip()
            locator = match.group(2).strip()
            
            # Extract text hint from variable name
            text_hint = variable.replace('${', '').replace('}', '').replace('selector_', '').replace('_', ' ')
            
            locators.append({
                "variable": variable,
                "locator": locator,
                "text_hint": text_hint
            })
    
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


def format_rf_variables(mappings: list) -> str:
    """
    Mapping sonuçlarını RF Variables formatına dönüştürür.
    """
    lines = ["*** Variables ***"]
    
    for m in mappings:
        if m.get("target_locator"):
            # Variable name ve locator arasında tab kullan
            lines.append(f"{m['variable']}    {m['target_locator']}")
        else:
            # Match bulunamadıysa yorum ekle
            lines.append(f"# {m['variable']}    NO MATCH FOUND (confidence: 0)")
    
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
        
        logger.info(f"📥 Parsed {len(source_locators)} source locators from {source_platform}")
        
        # 2. Start target platform driver and scan
        try:
            driver = driver_mgr.start_driver(target_platform)
        except Exception as e:
            return jsonify(create_error_response(
                f"{target_platform} Connection Failed",
                f"Could not connect to {target_platform} device. Make sure device is connected and Appium is running."
            )), 500
        
        # 3. Get target screen info
        source_xml = driver_mgr.get_page_source()
        screenshot = driver_mgr.take_screenshot()
        win_size = driver_mgr.get_window_size()
        
        if not source_xml:
            return jsonify(create_error_response("Failed to get target screen", "Could not retrieve page source from target device")), 500
        
        # 4. Analyze target screen elements
        analyzer = PageAnalyzer(driver)
        target_result = analyzer.analyze(source_xml, target_platform, verify=False, prefix="target", window_size=win_size)
        target_elements = target_result.get("elements", [])
        
        logger.info(f"🎯 Found {len(target_elements)} elements on {target_platform}")
        
        # 5. Use AI to map locators
        gemini = get_gemini_service()
        
        if not gemini.is_ready():
            return jsonify(create_error_response("AI not configured", "Gemini API key is required for cross-platform mapping")), 400
        
        # Prepare screenshot bytes for AI
        import base64
        screenshot_bytes = base64.b64decode(screenshot) if screenshot else None
        
        mappings = gemini.map_locators_cross_platform(
            source_locators=source_locators,
            target_elements=target_elements,
            source_platform=source_platform,
            target_platform=target_platform,
            screenshot_bytes=screenshot_bytes
        )
        
        if not mappings:
            return jsonify(create_error_response("AI mapping failed", "Could not generate cross-platform mappings")), 500
        
        # 6. Calculate stats
        matched = sum(1 for m in mappings if m.get("target_locator"))
        failed = len(mappings) - matched
        avg_confidence = sum(m.get("confidence", 0) for m in mappings) / len(mappings) if mappings else 0
        
        # 7. Format output
        if output_format == "json":
            output_text = format_json_output(mappings)
        elif output_format == "keyvalue":
            output_text = format_keyvalue_output(mappings)
        else:  # rf_variables
            output_text = format_rf_variables(mappings)
        
        logger.info(f"✅ Mapping complete: {matched}/{len(mappings)} matched, avg confidence: {avg_confidence:.1f}%")
        
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
        logger.error(f"Locator mapping error: {e}", exc_info=True)
        return jsonify(create_error_response("Mapping failed", str(e))), 500


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
