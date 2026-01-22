"""
Gemini AI Service - Main AI integration for Red Pather
Uses the new google.genai SDK (replacing deprecated google.generativeai)
Delegates to PromptTemplates for prompts and ResponseParser for parsing
"""
import os
import logging
from PIL import Image
import io
import json
from typing import Optional, Any, List, Dict

from google import genai
from google.genai import types

from .ai import PromptTemplates, ResponseParser

logger = logging.getLogger(__name__)


class GeminiService:
    """
    Main AI service integrating with Google Gemini API.
    Uses the new google.genai SDK with Client-based architecture.
    """
    
    def __init__(self, api_key: str = None, custom_prompt: str = ""):
        self.api_key = api_key
        self.custom_prompt = custom_prompt
        self.client = None
        self.model_name = "gemini-2.0-flash-exp"
        
        if self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
                logger.debug(f"✅ Gemini client initialized with model: {self.model_name}")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini client: {e}")
                self.client = None

    def is_ready(self) -> bool:
        """Check if AI service is configured and ready"""
        return self.client is not None

    def _prepare_image(self, screenshot_bytes: bytes) -> Image.Image:
        """Prepare image from bytes for AI processing"""
        return Image.open(io.BytesIO(screenshot_bytes))

    def _get_user_instructions(self) -> str:
        """Get formatted user instructions if available"""
        if self.custom_prompt:
            return f"\nUser Additional Instructions: {self.custom_prompt}"
        return ""

    def _generate_content(self, prompt: str, image: Image.Image = None) -> Optional[str]:
        """Generate content using the new Client API"""
        if not self.client:
            return None
        
        try:
            contents = [prompt]
            if image:
                contents.append(image)
            
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=contents
            )
            return response.text
        except Exception as e:
            logger.error(f"Gemini generate_content error: {e}")
            return None

    # ==========================================
    # PAGE RECOGNITION
    # ==========================================
    
    def recognize_page(self, screenshot_bytes: bytes, xml_content: str = None) -> str:
        """Recognize page name from screenshot"""
        if not self.client:
            return "unknown"
        
        try:
            img = self._prepare_image(screenshot_bytes)
            prompt = PromptTemplates.page_recognition(self._get_user_instructions())
            
            result = self._generate_content(prompt, img)
            return ResponseParser.clean_page_name(result) if result else "unknown"
        except Exception as e:
            logger.error(f"Gemini page recognition error: {e}")
            return "unknown"

    # ==========================================
    # XPATH SUGGESTION
    # ==========================================
    
    def suggest_xpath(self, element_data: dict, xml_context: str = None) -> Optional[str]:
        """Suggest XPath for an element"""
        if not self.client:
            return None
        
        try:
            prompt = PromptTemplates.xpath_suggestion(
                json.dumps(element_data),
                self._get_user_instructions()
            )
            result = self._generate_content(prompt)
            return result.strip() if result else None
        except Exception as e:
            logger.error(f"Gemini XPath suggestion error: {e}")
            return None

    # ==========================================
    # SCRIPT GENERATION
    # ==========================================
    
    def generate_script(self, steps: list, format: str = "robot") -> Optional[str]:
        """Generate test script from recorded steps"""
        if not self.client:
            return None
            
        try:
            user_rules = f"\nUser Formatting Rules/Prompt: {self.custom_prompt}" if self.custom_prompt else ""
            format_desc = "Robot Framework" if format == "robot" else "Python (Pytest + Appium)"
            
            prompt = PromptTemplates.script_generation(
                json.dumps(steps), format_desc, user_rules
            )
            
            result = self._generate_content(prompt)
            return result.strip() if result else None
        except Exception as e:
            logger.error(f"Gemini script generation error: {e}")
            return None

    # ==========================================
    # ELEMENT ANALYSIS
    # ==========================================
    
    def analyze_elements(self, elements_data: list, platform: str, 
                         page_prefix: str = "page") -> Optional[list]:
        """Analyze elements and generate locators using AI"""
        if not self.client:
            return None
            
        try:
            prompt = PromptTemplates.element_analysis(
                platform, page_prefix,
                json.dumps(elements_data, ensure_ascii=False),
                self._get_user_instructions()
            )
            
            result = self._generate_content(prompt)
            return ResponseParser.clean_json_response(result) if result else None
        except Exception as e:
            logger.error(f"Gemini element analysis error: {e}")
            return None

    # ==========================================
    # VARIABLE NAME TRANSLATION
    # ==========================================
    
    def translate_variable_names(self, variable_names: list) -> Optional[dict]:
        """Translate and optimize variable names to English"""
        if not self.client:
            return None
            
        try:
            prompt = PromptTemplates.translate_variable_names(
                json.dumps(variable_names, ensure_ascii=False)
            )
            
            result = self._generate_content(prompt)
            return ResponseParser.clean_json_response(result) if result else None
        except Exception as e:
            logger.error(f"Translate variable names error: {e}")
            return None

    # ==========================================
    # VISUAL AUDIT
    # ==========================================
    
    def visual_audit(self, screenshot_bytes: bytes, 
                     custom_instructions: str = None) -> Optional[dict]:
        """Perform visual UI/UX audit"""
        if not self.client:
            return None
            
        try:
            img = self._prepare_image(screenshot_bytes)
            
            extra_context = ""
            if custom_instructions:
                extra_context = f"\nKRİTİK TALİMAT: {custom_instructions}"
            elif self.custom_prompt:
                extra_context = f"\nEk Talimat: {self.custom_prompt}"

            prompt = PromptTemplates.visual_audit(extra_context)
            
            result = self._generate_content(prompt, img)
            return ResponseParser.clean_json_response(result) if result else None
        except Exception as e:
            logger.error(f"Gemini visual audit error: {e}")
            return None

    # ==========================================
    # LOCATOR HEALING
    # ==========================================
    
    def heal_locator(self, screenshot_bytes: bytes, xml_source: str, 
                     broken_locator: str, element_info: dict = None) -> Optional[dict]:
        """Heal a broken locator using AI"""
        if not self.client:
            return None
            
        try:
            img = self._prepare_image(screenshot_bytes)
            element_info_str = str(element_info) if element_info else "Bilgi yok"
            
            prompt = PromptTemplates.heal_locator(
                broken_locator, element_info_str, xml_source[:5000]
            )
            
            result = self._generate_content(prompt, img)
            return ResponseParser.clean_json_response(result) if result else None
        except Exception as e:
            logger.error(f"Heal locator error: {e}")
            return None

    # ==========================================
    # BUG DESCRIPTION GENERATION
    # ==========================================
    
    def generate_bug_description(self, screenshot_bytes: bytes, 
                                  element_info: dict = None,
                                  platform: str = "ANDROID") -> Optional[str]:
        """Generate Jira bug description from screenshot"""
        if not self.client:
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
            
            prompt = PromptTemplates.bug_description(platform, element_context)
            
            result = self._generate_content(prompt, img)
            return result.strip() if result else None
        except Exception as e:
            logger.error(f"Generate bug description error: {e}")
            return None

    # ==========================================
    # ROBOT FRAMEWORK KEYWORDS GENERATION
    # ==========================================
    
    def generate_keywords(self, elements_data: list, screenshot_bytes: bytes = None,
                          custom_prompt: str = "") -> Optional[dict]:
        """Generate Robot Framework keywords and variables"""
        if not self.client:
            return None
            
        try:
            # Prepare element summary
            elements_summary = [{
                "variable": el.get("variable", ""),
                "locator": el.get("locator", ""),
                "type": el.get("class_name", ""),
                "text": el.get("text", "")[:50] if el.get("text") else ""
            } for el in elements_data]
            
            user_instructions = f"\n\nKullanıcı Özel Talimatları:\n{custom_prompt}" if custom_prompt else ""
            
            prompt = PromptTemplates.generate_keywords(
                json.dumps(elements_summary, ensure_ascii=False, indent=2),
                user_instructions
            )
            
            img = self._prepare_image(screenshot_bytes) if screenshot_bytes else None
            result = self._generate_content(prompt, img)
            
            return ResponseParser.extract_robot_sections(result) if result else None
            
        except Exception as e:
            logger.error(f"Generate keywords error: {e}")
            return None

    # ==========================================
    # CROSS-PLATFORM LOCATOR MAPPING
    # ==========================================
    
    def map_locators_cross_platform(self, source_locators: list, target_elements: list,
                                     source_platform: str = "ANDROID",
                                     target_platform: str = "IOS",
                                     screenshot_bytes: bytes = None) -> Optional[list]:
        """Map locators from one platform to another"""
        if not self.client:
            return None
            
        try:
            img = self._prepare_image(screenshot_bytes) if screenshot_bytes else None
            
            prompt = PromptTemplates.cross_platform_mapping(
                source_platform, target_platform,
                json.dumps(source_locators, ensure_ascii=False, indent=2),
                json.dumps(target_elements[:50], ensure_ascii=False, indent=2)
            )
            
            result = self._generate_content(prompt, img)
            
            if result:
                logger.info(f"🤖 AI Raw Response (first 500 chars): {result[:500]}...")
                parsed = ResponseParser.clean_json_response(result)
                if parsed is None:
                    logger.error("❌ AI JSON parse FAILED!")
                else:
                    logger.info(f"✅ AI JSON parsed successfully: {len(parsed)} items")
                return parsed
            return None
            
        except Exception as e:
            logger.error(f"Map locators cross-platform error: {e}")
            return None

    # ==========================================
    # SEMANTIC NAMES GENERATION
    # ==========================================
    
    def generate_semantic_names(self, elements: list, platform: str = "IOS",
                                 screenshot_bytes: bytes = None) -> dict:
        """Generate semantic names for elements for better cross-platform matching"""
        if not self.client:
            return {}
            
        try:
            img = self._prepare_image(screenshot_bytes) if screenshot_bytes else None
            
            # Limit to first 30 elements (token limit)
            elements_to_send = elements[:30]
            
            elements_json = json.dumps([{
                "idx": i,
                "current_name": e.get("variable", ""),
                "locator": e.get("locator", ""),
                "text": e.get("text", ""),
                "type": e.get("type", "")
            } for i, e in enumerate(elements_to_send)], ensure_ascii=False, indent=2)
            
            prompt = PromptTemplates.semantic_names(platform, elements_json)
            
            result = self._generate_content(prompt, img)
            
            if result:
                parsed = ResponseParser.clean_json_response(result)
                if parsed:
                    # Map index to original variable
                    semantic_map = {}
                    for idx_str, semantic_name in parsed.items():
                        idx = int(idx_str)
                        if idx < len(elements_to_send):
                            original_var = elements_to_send[idx].get("variable", "")
                            semantic_map[original_var] = semantic_name
                    
                    logger.info(f"✅ Generated {len(semantic_map)} semantic names")
                    return semantic_map
            
            return {}
            
        except Exception as e:
            logger.error(f"Generate semantic names error: {e}")
            return {}
