"""
Locator Mapper - Cross-Platform Locator Mapping API
Android locator'larını iOS'a (veya tersi) dönüştürür.
Uses modular parsers and formatters for input/output handling.
"""
import re
import base64
import difflib
import logging
import threading
from flask import Blueprint, request, jsonify

from backend.core.context import driver_mgr, config_mgr, cache_mgr
from backend.api.services.gemini_service import GeminiService
from backend.api.services.page_analyzer import PageAnalyzer
from backend.api.services.mapping import LocatorParsers, OutputFormatters
from backend.api.middleware import create_error_response, create_success_response

logger = logging.getLogger(__name__)
locator_mapper_bp = Blueprint('locator_mapper', __name__)


def get_gemini_service():
    """Get fresh GeminiService with latest config (for when API key changes)."""
    api_key = config_mgr.get('GEMINI_API_KEY')
    custom_prompt = config_mgr.get('AI_CUSTOM_PROMPT', "")
    return GeminiService(api_key, custom_prompt)


class HeuristicMatcher:
    """Fallback heuristic matching engine when AI is not available"""
    
    # Semantic equivalents (Turkish-English and UI patterns)
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
    
    @classmethod
    def extract_keywords(cls, text: str) -> set:
        """Extract keywords from text"""
        text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
        words = re.split(r'[_.\-\s]+', text.lower())
        return set(w for w in words if len(w) > 2)
    
    @classmethod
    def keyword_overlap_score(cls, src_words: set, target_words: set) -> float:
        """Calculate keyword overlap score"""
        if not src_words or not target_words:
            return 0
        
        direct_overlap = len(src_words & target_words)
        
        # Check semantic equivalents
        semantic_matches = 0
        for src_word in src_words:
            for key, equivalents in cls.SEMANTIC_EQUIVALENTS.items():
                if src_word == key or src_word in equivalents:
                    for target_word in target_words:
                        if target_word == key or target_word in equivalents:
                            semantic_matches += 0.5
                            break
        
        total_overlap = direct_overlap + semantic_matches
        max_possible = min(len(src_words), len(target_words))
        return total_overlap / max_possible if max_possible > 0 else 0
    
    @classmethod
    def match(cls, source_locators: list, target_elements: list) -> list:
        """Match source locators to target elements using heuristics"""
        mappings = []
        
        for src in source_locators:
            src_var = src.get("variable", "").replace("${", "").replace("}", "").replace("selector_", "")
            src_keywords = cls.extract_keywords(src_var)
            
            best_match = None
            best_score = 0
            best_reason = ""
            
            for target in target_elements:
                target_var = target.get("variable", "").replace("${", "").replace("}", "").replace("selector_", "")
                target_keywords = cls.extract_keywords(target_var)
                
                # Extract keywords from locator
                locator = target.get("locator", "")
                if "accessibility_id=" in locator:
                    acc_id = locator.split("accessibility_id=")[-1].split("'")[0]
                    target_keywords.update(cls.extract_keywords(acc_id))
                
                # Keyword overlap score
                kw_score = cls.keyword_overlap_score(src_keywords, target_keywords)
                
                # Sequence matcher score (backup)
                seq_score = difflib.SequenceMatcher(None, src_var.lower(), target_var.lower()).ratio()
                
                # Combined score: keyword priority
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
        
        return mappings
    
    @classmethod
    def fallback_match(cls, source_locators: list, target_elements: list) -> list:
        """Simple text-based fallback matching"""
        mappings = []
        
        for src in source_locators:
            src_hint = src.get("text_hint", "").lower()
            best_match = None
            best_score = 0
            
            for target in target_elements:
                target_text = (target.get("text") or target.get("content_desc") or "").lower()
                if not target_text:
                    continue
                
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
        
        return mappings


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
        
        # 1. Parse input using LocatorParsers
        source_locators = LocatorParsers.parse(content, input_format)
        
        if not source_locators:
            return jsonify(create_error_response("No locators found", "Could not parse any locators from input")), 400
        
        logger.info(f"📥 Parsed {len(source_locators)} source locators. Target: {target_platform}")
        
        # 2. Start target platform driver
        try:
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
        
        if len(target_elements) == 0:
            logger.warning("⚠️ TARGET ELEMENTS BOŞ! Hedef ekranda hiç element bulunamadı.")
        
        # 5. Mapping Engine (AI or Fallback)
        gemini = get_gemini_service()
        screenshot_bytes = base64.b64decode(screenshot) if screenshot else None
        
        if gemini.is_ready():
            logger.info("🤖 Using AI-Powered Mapping Engine (Gemini)")
            
            # Generate semantic names for target elements
            target_semantic_names = gemini.generate_semantic_names(
                elements=target_elements,
                platform=target_platform,
                screenshot_bytes=screenshot_bytes
            )
            logger.info(f"✅ Got {len(target_semantic_names)} semantic names from AI")
            
            mappings = gemini.map_locators_cross_platform(
                source_locators=source_locators,
                target_elements=target_elements,
                source_platform=source_platform,
                target_platform=target_platform,
                screenshot_bytes=screenshot_bytes
            )
            
            if mappings:
                logger.info(f"📥 AI returned {len(mappings)} mappings")
        else:
            logger.warning("⚠️ AI not ready. Falling back to Heuristic Engine.")
            mappings = HeuristicMatcher.match(source_locators, target_elements)
        
        # Fallback if AI returned None
        if mappings is None:
            logger.warning("⚠️ AI returned None, using fallback matcher...")
            mappings = HeuristicMatcher.fallback_match(source_locators, target_elements)
        
        # Generate empty mappings if still empty
        if not mappings:
            logger.warning("⚠️ No mappings generated, creating empty entries")
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
        
        # 7. Format output using OutputFormatters
        output_text = OutputFormatters.format(mappings, output_format)
        
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
        error_detail = f"{type(e).__name__}: {str(e)}"
        return jsonify(create_error_response("Mapping failed", error_detail)), 500
    finally:
        # 8. Restore original platform in background
        if original_platform and original_platform != driver_mgr.get_platform():
            logger.info(f"🔄 Launching background restoration to {original_platform}")
            threading.Thread(
                target=driver_mgr.start_driver, 
                args=(original_platform,),
                daemon=True
            ).start()


@locator_mapper_bp.route('/locator-mapper/parse', methods=['POST'])
def parse_locators():
    """
    Parse locators only (without mapping).
    Useful for format validation.
    """
    try:
        req = request.json or {}
        content = req.get("content", "").strip()
        input_format = req.get("format", "rf_variables")
        
        if not content:
            return jsonify(create_error_response("Content is required")), 400
        
        locators = LocatorParsers.parse(content, input_format)
        
        return jsonify(create_success_response(data={
            "locators": locators,
            "count": len(locators)
        }))
        
    except Exception as e:
        logger.error(f"Parse error: {e}")
        return jsonify(create_error_response("Parse failed", str(e))), 500
