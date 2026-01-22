"""
Page Analyzer - Main orchestrator for mobile app page analysis
Delegates to specialized modules for parsing, naming, and locator generation
"""
import io
import base64
import logging
from typing import Dict, Any, Optional, Tuple
from PIL import Image
from lxml import etree

from .analyzers import ElementParser, LocatorGenerator, NamingService

logger = logging.getLogger(__name__)


class AnalyzerConstants:
    """Page analyzer constants - shared across modules"""
    # Image optimization
    IMAGE_QUALITY = 60
    IMAGE_FORMAT = "JPEG"

    # Header detection
    HEADER_RATIO = 0.30
    CENTER_TOLERANCE = 0.15
    MIN_HEADER_HEIGHT = 30


class PageAnalyzer:
    """
    Analyzes mobile app pages and generates test automation locators.
    Supports Android and iOS platforms with intelligent element detection.
    
    This is the main orchestrator that delegates to:
    - ElementParser: XML parsing and element extraction
    - LocatorGenerator: Locator strategy and XPath generation
    - NamingService: Variable name generation
    """

    def __init__(self, driver):
        self.driver = driver
        self.locator_gen = LocatorGenerator()
        logger.debug("PageAnalyzer initialized with modular architecture")

    # ==========================================
    # DELEGATED METHODS (backwards compatibility)
    # ==========================================
    
    def parse_bounds_android(self, bounds_str: Optional[str]) -> Optional[Dict[str, int]]:
        """Parse Android bounds - delegated to ElementParser"""
        return ElementParser.parse_bounds_android(bounds_str)

    def parse_bounds_ios(self, elem: etree.Element) -> Optional[Dict[str, int]]:
        """Parse iOS bounds - delegated to ElementParser"""
        return ElementParser.parse_bounds_ios(elem)

    def find_element_at_coords(self, tree: etree.Element, x: int, y: int, 
                               platform: str) -> Optional[etree.Element]:
        """Find element at coordinates - delegated to ElementParser"""
        return ElementParser.find_element_at_coords(tree, x, y, platform)

    def clean_text_for_var(self, text: Optional[str]) -> str:
        """Clean text for variable name - delegated to NamingService"""
        return NamingService.clean_text_for_var(text)

    def get_element_type_suffix(self, class_name: str, resource_id: str = "",
                                is_password: bool = False) -> str:
        """Get element type suffix - delegated to NamingService"""
        return NamingService.get_element_type_suffix(class_name, resource_id, is_password)

    def generate_semantic_name(self, info: Dict[str, Any], var_suffix: str, 
                               type_suffix: str) -> str:
        """Generate semantic name - delegated to NamingService"""
        return NamingService.generate_semantic_name(info, var_suffix, type_suffix)

    def _parse_camel_case(self, text: str) -> str:
        """Parse CamelCase - delegated to NamingService"""
        return NamingService.parse_camel_case(text)

    def safe_xpath_val(self, val: str) -> str:
        """Safe XPath value - delegated to LocatorGenerator"""
        return self.locator_gen.safe_xpath_val(val)

    def _is_unique_in_tree(self, tree: etree.Element, xpath: str) -> bool:
        """Check XPath uniqueness - delegated to LocatorGenerator"""
        return self.locator_gen.is_unique_in_tree(tree, xpath)

    def _build_hierarchical_xpath(self, elem: etree.Element, 
                                   tree: etree.Element) -> str:
        """Build hierarchical XPath - delegated to LocatorGenerator"""
        return self.locator_gen.build_hierarchical_xpath(elem, tree)

    def generate_relative_locator(self, elem: etree.Element, tree: etree.Element,
                                  platform: str) -> Optional[Dict[str, str]]:
        """Generate relative locator - delegated to LocatorGenerator"""
        return self.locator_gen.generate_relative_locator(elem, tree, platform)

    def generate_robust_xpath(self, elem: etree.Element, tree: etree.Element,
                              platform: str, attribs: Dict[str, str]) -> str:
        """Generate robust XPath - delegated to LocatorGenerator"""
        return self.locator_gen.generate_robust_xpath(elem, tree, platform, attribs)

    def get_best_locator(self, elem: etree.Element, tree: etree.Element,
                         info: Dict[str, Any], platform: str,
                         should_verify: bool) -> Optional[Dict[str, str]]:
        """Get best locator - delegated to LocatorGenerator"""
        return self.locator_gen.get_best_locator(elem, tree, info, platform, should_verify)

    def _calculate_health_score(self, strategy: str, locator: str) -> int:
        """Calculate health score - delegated to LocatorGenerator"""
        return self.locator_gen.calculate_health_score(strategy, locator)

    # ==========================================
    # CORE METHODS (remain in PageAnalyzer)
    # ==========================================

    def optimize_image(self, base64_str: str, 
                       quality: int = AnalyzerConstants.IMAGE_QUALITY) -> str:
        """Optimize image by converting to JPEG and reducing quality"""
        try:
            image_data = base64.b64decode(base64_str)
            image = Image.open(io.BytesIO(image_data))

            if image.mode in ("RGBA", "P"):
                image = image.convert("RGB")

            buffer = io.BytesIO()
            image.save(buffer,
                       format=AnalyzerConstants.IMAGE_FORMAT,
                       quality=quality,
                       optimize=True)

            optimized = base64.b64encode(buffer.getvalue()).decode('utf-8')

            original_size = len(base64_str)
            optimized_size = len(optimized)
            reduction = ((original_size - optimized_size) / original_size) * 100

            logger.debug(f"Image optimized: {original_size} -> {optimized_size} bytes ({reduction:.1f}% reduction)")
            return optimized

        except Exception as e:
            logger.warning(f"Image optimization failed: {e}")
            return base64_str

    def process_single_element(self, args: Tuple) -> Optional[Dict[str, Any]]:
        """Process single element (designed for parallel execution)"""
        elem, tree, platform, should_verify, index, prefix = args

        try:
            # Extract element info using ElementParser
            info = ElementParser.extract_element_info(elem, platform)
            cls = info["class_name"]

            # Parse coordinates
            if platform == "ANDROID":
                coords = ElementParser.parse_bounds_android(elem.attrib.get("bounds"))
            else:
                coords = ElementParser.parse_bounds_ios(elem)

            # Filter: Check coordinates
            if not coords:
                return None

            if (coords['w'] < ElementParser.MIN_ELEMENT_WIDTH or
                    coords['h'] < ElementParser.MIN_ELEMENT_HEIGHT):
                return None

            # Filter: Ignored classes without text
            if any(b_cls in cls for b_cls in ElementParser.IGNORE_CLASSES):
                if not info["text"] and not info["content_desc"]:
                    return None

            # Filter: Blacklisted IDs
            if platform == "ANDROID":
                if any(b_id in info["res_id"] for b_id in ElementParser.BLACKLIST_IDS):
                    return None

            # Generate locator
            res = self.locator_gen.get_best_locator(elem, tree, info, platform, should_verify)

            # Fallback for inputs
            is_input = "EditText" in str(cls) or "Secure" in str(cls) or "TextField" in str(cls)
            if not res and is_input:
                res = {
                    "locator": f"xpath=(//{cls})[{index + 1}]",
                    "var_suffix": "input",
                    "strategy": "FALLBACK"
                }

            # Fallback for text-containing buttons/keys
            is_button_or_text = "Button" in str(cls) or "Text" in str(cls) or "Key" in str(cls)
            if not res and is_button_or_text and info["text"]:
                safe_txt = self.locator_gen.safe_xpath_val(info["text"])
                fallback_xpath = f"//{cls}[@text={safe_txt}]"
                
                if not self.locator_gen.is_unique_in_tree(tree, fallback_xpath):
                    fallback_xpath = f"({fallback_xpath})[{index + 1}]"
                
                res = {
                    "locator": f"xpath={fallback_xpath}",
                    "var_suffix": info["text"],
                    "strategy": "TEXT_FALLBACK"
                }

            if res:
                # Generate variable name using NamingService
                type_suffix = NamingService.get_element_type_suffix(
                    cls, info['res_id'], info['is_password']
                )
                semantic_name = NamingService.generate_semantic_name(
                    info, res['var_suffix'], type_suffix
                )
                
                # Build final variable suffix
                if semantic_name.endswith(f"_{type_suffix}"):
                    final_variable_suffix = semantic_name
                else:
                    final_variable_suffix = f"{semantic_name}_{type_suffix}"

                if not prefix or len(prefix) < 2:
                    prefix = "page"

                v_name = f"${{selector_{prefix}_{final_variable_suffix}}}"

                # Get full XPath for debugging
                full_xpath = elem.getroottree().getpath(elem)
                
                # Calculate health score
                health_score = self.locator_gen.calculate_health_score(
                    res['strategy'], res['locator']
                )
                health_label = self.locator_gen.get_health_label(health_score)

                return {
                    "coords": coords,
                    "variable": v_name,
                    "locator": res['locator'],
                    "strategy": res['strategy'],
                    "text": info["text"] or info["content_desc"] or "",
                    "full_xpath": full_xpath,
                    "health_score": health_score,
                    "health_label": health_label
                }

        except Exception as e:
            logger.debug(f"Failed to process element at index {index}: {e}")

        return None

    def estimate_page_name(self, tree: etree.Element, platform: str,
                           win_width: int, win_height: int) -> str:
        """Estimate page name from header elements"""
        possible_titles = []
        header_limit = win_height * AnalyzerConstants.HEADER_RATIO
        center_x = win_width / 2

        all_nodes = tree.xpath('//*')

        for elem in all_nodes:
            att = elem.attrib
            text = ""

            if platform == "ANDROID":
                text = att.get("text") or att.get("content-desc") or ""
                bounds = ElementParser.parse_bounds_android(att.get("bounds"))
            else:
                text = att.get("label") or att.get("value") or att.get("name") or ""
                bounds = ElementParser.parse_bounds_ios(elem)

            if not bounds:
                continue

            y = bounds['y']
            mid_x = bounds['x'] + (bounds['w'] / 2)

            # Text validation
            if not text or len(text) < NamingService.MIN_TITLE_LENGTH:
                continue
            if len(text) > NamingService.MAX_TITLE_LENGTH:
                continue
            if text.replace(":", "").replace("%", "").isdigit():
                continue

            # Must be in header area
            if y > header_limit:
                continue

            # Calculate score
            score = 0

            res_id = att.get("resource-id", "").lower() if platform == "ANDROID" else ""
            if "title" in res_id:
                score += 20
            if "header" in res_id:
                score += 15

            pos_score = (header_limit - y) / 20
            score += pos_score

            dist_from_center = abs(center_x - mid_x)
            if dist_from_center < (win_width * AnalyzerConstants.CENTER_TOLERANCE):
                score += 15

            if bounds['h'] > AnalyzerConstants.MIN_HEADER_HEIGHT:
                score += 5

            possible_titles.append({"text": text, "score": score})

        if possible_titles:
            best = max(possible_titles, key=lambda x: x['score'])
            page_name = NamingService.clean_text_for_var(best['text'])
            logger.info(f"Estimated page name: {page_name} (score: {best['score']:.1f})")
            return page_name

        return "page"

    def analyze(self, page_source: str, platform: str, should_verify: bool,
                user_prefix: str, win_size: Dict[str, int]) -> Dict[str, Any]:
        """
        Main analysis method - orchestrates the analysis process

        Args:
            page_source: XML page source
            platform: "ANDROID" or "IOS"
            should_verify: Whether to verify locators
            user_prefix: User-provided page name prefix
            win_size: Window size dict

        Returns:
            dict: Analysis result with elements and page_name
        """
        try:
            # Parse XML
            try:
                tree = etree.fromstring(page_source.encode('utf-8'))
            except Exception as e:
                logger.error(f"XML parse error: {e}")
                return {"error": "XML Parse Error: Invalid XML structure"}

            # Clear XPath cache for new page
            self.locator_gen.clear_cache()

            # Determine page name
            detected_page_name = user_prefix
            if not user_prefix or user_prefix in ["page", "login"]:
                detected_page_name = self.estimate_page_name(
                    tree, platform, win_size['width'], win_size['height']
                )

            # Get all elements
            all_elements = tree.xpath('//*')
            logger.info(f"Found {len(all_elements)} total elements in XML")

            # Prepare tasks for processing
            task_args = []
            area_total = win_size['width'] * win_size['height']

            for idx, elem in enumerate(all_elements):
                # Filter fullscreen elements
                if platform == "ANDROID":
                    b = ElementParser.parse_bounds_android(elem.attrib.get("bounds"))
                else:
                    b = ElementParser.parse_bounds_ios(elem)

                if b and b['area'] > (area_total * ElementParser.MAX_ELEMENT_SCREEN_RATIO):
                    logger.debug(f"Skipping fullscreen element (area: {b['area']})")
                    continue

                task_args.append((elem, tree, platform, should_verify, idx, detected_page_name))
            
            logger.info(f"Processing {len(task_args)} candidate elements")

            # Process elements
            final_data = []
            for arg in task_args:
                res = self.process_single_element(arg)
                if res:
                    final_data.append(res)

            logger.info(f"✅ Analysis complete: {len(final_data)} elements detected")

            return {
                "elements": final_data,
                "page_name": detected_page_name
            }

        except Exception as e:
            logger.error(f"Analysis failed: {e}", exc_info=True)
            return {"error": f"Analysis failed: {str(e)}"}