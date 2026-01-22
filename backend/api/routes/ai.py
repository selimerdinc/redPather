import logging
from flask import Blueprint, request, jsonify
from backend.core.context import config_mgr, cache_mgr, gemini_service
from backend.api.services.gemini_service import GeminiService
from backend.api.middleware import create_success_response, create_error_response
import base64

logger = logging.getLogger(__name__)
ai_bp = Blueprint('ai', __name__)

def get_gemini_service():
    """Get fresh GeminiService with latest config (for when API key changes)."""
    api_key = config_mgr.get('GEMINI_API_KEY')
    custom_prompt = config_mgr.get('AI_CUSTOM_PROMPT', "")
    return GeminiService(api_key, custom_prompt)

@ai_bp.route('/ai/recognize-page', methods=['POST'])
def recognize_page():
    try:
        data = request.json
        screenshot_b64 = data.get('screenshot')
        
        if not screenshot_b64:
            return jsonify(create_error_response("Screenshot missing", "Please provide screenshot in base64")), 400
            
        screenshot_bytes = base64.b64decode(screenshot_b64)
        gemini = get_gemini_service()
        
        page_name = gemini.recognize_page(screenshot_bytes)
        
        return jsonify(create_success_response(data={"page_name": page_name}))
    except Exception as e:
        logger.error(f"AI Recognize Page Error: {e}")
        return jsonify(create_error_response("AI Error", str(e))), 500

@ai_bp.route('/ai/suggest-xpath', methods=['POST'])
def suggest_xpath():
    try:
        data = request.json
        element_data = data.get('element')
        
        if not element_data:
            return jsonify(create_error_response("Element data missing")), 400
            
        gemini = get_gemini_service()
        xpath = gemini.suggest_xpath(element_data)
        
        return jsonify(create_success_response(data={"xpath": xpath}))
    except Exception as e:
        logger.error(f"AI Suggest XPath Error: {e}")
        return jsonify(create_error_response("AI Error", str(e))), 500

@ai_bp.route('/ai/generate-script', methods=['POST'])
def generate_script():
    try:
        data = request.json
        steps = data.get('steps')
        format = data.get('format', 'robot')
        
        if not steps:
            return jsonify(create_error_response("Steps missing")), 400
            
        gemini = get_gemini_service()
        script = gemini.generate_script(steps, format)
        
        return jsonify(create_success_response(data={"script": script}))
    except Exception as e:
        logger.error(f"AI Generate Script Error: {e}")
        return jsonify(create_error_response("AI Error", str(e))), 500
@ai_bp.route('/ai/audit', methods=['POST'])
def visual_audit():
    try:
        data = request.json
        screenshot_b64 = data.get('screenshot')
        
        if not screenshot_b64:
            return jsonify(create_error_response("Screenshot missing")), 400
            
        screenshot_bytes = base64.b64decode(screenshot_b64)
        gemini = get_gemini_service()
        
        # Frontend'den gelen özel talimatlar (dil vb.)
        custom_prompt = data.get('prompt')
        
        report = gemini.visual_audit(screenshot_bytes, custom_instructions=custom_prompt)
        
        if not report:
            return jsonify(create_error_response("AI failed to generate report")), 500
            
        return jsonify(create_success_response(data={"report": report}))
    except Exception as e:
        logger.error(f"AI Visual Audit Error: {e}")
        return jsonify(create_error_response("AI Error", str(e))), 500

@ai_bp.route('/ai/generate-bug-description', methods=['POST'])
def generate_bug_description():
    """AI ile Jira bug için detaylı description oluşturur."""
    try:
        data = request.json
        screenshot_b64 = data.get('screenshot')
        element_info = data.get('element_info')
        platform = data.get('platform', 'ANDROID')
        
        if not screenshot_b64:
            return jsonify(create_error_response("Screenshot missing")), 400
            
        # Base64 prefix'i varsa temizle
        if ',' in screenshot_b64:
            screenshot_b64 = screenshot_b64.split(',')[1]
            
        screenshot_bytes = base64.b64decode(screenshot_b64)
        gemini = get_gemini_service()
        
        description = gemini.generate_bug_description(screenshot_bytes, element_info, platform)
        
        if not description:
            return jsonify(create_error_response("AI failed to generate description")), 500
            
        return jsonify(create_success_response(data={"description": description}))
    except Exception as e:
        logger.error(f"AI Generate Bug Description Error: {e}")
        return jsonify(create_error_response("AI Error", str(e))), 500


@ai_bp.route('/ai/generate-keywords', methods=['POST'])
def generate_keywords():
    """AI ile Robot Framework keywords ve variables üretir."""
    try:
        data = request.json
        elements = data.get('elements', [])
        screenshot_b64 = data.get('screenshot')
        
        if not elements:
            return jsonify(create_error_response("Elements missing", "Please provide elements list")), 400
        
        # Screenshot opsiyonel
        screenshot_bytes = None
        if screenshot_b64:
            if ',' in screenshot_b64:
                screenshot_b64 = screenshot_b64.split(',')[1]
            screenshot_bytes = base64.b64decode(screenshot_b64)
        
        gemini = get_gemini_service()
        custom_prompt = config_mgr.get('AI_CUSTOM_PROMPT', "")
        
        result = gemini.generate_keywords(elements, screenshot_bytes, custom_prompt)
        
        if not result:
            return jsonify(create_error_response("AI failed to generate keywords")), 500
        
        # Boşluklu accessibility_id locator'ları XPath'e dönüştür
        if result.get('variables'):
            def convert_acc_id_to_xpath(line):
                if 'accessibility_id=' in line:
                    import re
                    match = re.search(r'accessibility_id=(.+)$', line)
                    if match:
                        acc_value = match.group(1).strip()
                        if ' ' in acc_value:
                            # Virgülden veya uzunluktan kes
                            if ',' in acc_value:
                                acc_value = acc_value.split(',')[0].strip()
                            elif len(acc_value) > 50:
                                acc_value = ' '.join(acc_value.split()[:4])
                            # XPath formatına dönüştür
                            prefix = line[:match.start()]
                            return f"{prefix}xpath=//*[@label='{acc_value}']"
                return line
            
            lines = result['variables'].split('\n')
            converted_lines = [convert_acc_id_to_xpath(line) for line in lines]
            result['variables'] = '\n'.join(converted_lines)
            
            # full_output da güncelle
            if result.get('full_output'):
                full_lines = result['full_output'].split('\n')
                result['full_output'] = '\n'.join([convert_acc_id_to_xpath(line) for line in full_lines])
        
        return jsonify(create_success_response(data=result))
    except Exception as e:
        logger.error(f"AI Generate Keywords Error: {e}")
        return jsonify(create_error_response("AI Error", str(e))), 500


@ai_bp.route('/ai/translate-names', methods=['POST'])
def translate_variable_names():
    """AI ile değişken isimlerini İngilizceye çevirir ve optimize eder."""
    try:
        data = request.json
        variable_names = data.get('names', [])
        
        if not variable_names:
            return jsonify(create_error_response("Variable names missing")), 400
        
        gemini = get_gemini_service()
        
        if not gemini.is_ready():
            return jsonify(create_error_response("AI not configured", "Please add Gemini API key in settings")), 400
        
        result = gemini.translate_variable_names(variable_names)
        
        if not result:
            return jsonify(create_error_response("AI failed to translate names")), 500
        
        return jsonify(create_success_response(data={"translations": result}))
    except Exception as e:
        logger.error(f"AI Translate Names Error: {e}")
        return jsonify(create_error_response("AI Error", str(e))), 500

