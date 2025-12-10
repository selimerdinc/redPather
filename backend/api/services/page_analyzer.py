import re
import io
import base64
import logging
from typing import Dict, List, Optional, Tuple, Any
from PIL import Image
from lxml import etree
from appium.webdriver.common.appiumby import AppiumBy
import concurrent.futures
from backend.core.context import driver_mgr

logger = logging.getLogger(__name__)


class AnalyzerConstants:
    """Page analyzer constants"""
    # Element filtering
    MIN_ELEMENT_WIDTH = 10
    MIN_ELEMENT_HEIGHT = 10
    MIN_ELEMENT_AREA = 100

    # Text constraints
    MAX_TEXT_LENGTH = 50
    MAX_VAR_NAME_LENGTH = 55
    MAX_TITLE_LENGTH = 30
    MIN_TITLE_LENGTH = 2
    MAX_TEXT_WORDS = 10

    # Image optimization
    IMAGE_QUALITY = 60
    IMAGE_FORMAT = "JPEG"

    # Header detection
    HEADER_RATIO = 0.30  # Top 30% of screen
    CENTER_TOLERANCE = 0.15  # 15% from center
    MIN_HEADER_HEIGHT = 30

    # XPath
    MAX_XPATH_DEPTH = 4
    MAX_RELATIVE_SEARCH = 15

    # Ignore patterns
    IGNORE_CLASSES = [
        "android.widget.FrameLayout", "android.widget.LinearLayout",
        "android.widget.RelativeLayout", "android.view.View",
        "XCUIElementTypeWindow", "XCUIElementTypeOther",
        "XCUIElementTypeApplication", "XCUIElementTypeScrollView",
        "XCUIElementTypeTable", "XCUIElementTypeImage",
        "XCUIElementTypeStatusBar", "XCUIElementTypeNavigationBar"
    ]

    BLACKLIST_IDS = [
        "android:id/content", "android:id/statusBarBackground",
        "android:id/navigationBarBackground", "android:id/home"
    ]


class PageAnalyzer:
    """
    Analyzes mobile app pages and generates test automation locators.
    Supports Android and iOS platforms with intelligent element detection.
    """

    def __init__(self, driver):
        self.driver = driver
        self._xpath_cache: Dict[str, bool] = {}
        logger.debug("PageAnalyzer initialized")

    def optimize_image(self, base64_str: str, quality: int = AnalyzerConstants.IMAGE_QUALITY) -> str:
        """
        Optimize image by converting to JPEG and reducing quality

        Args:
            base64_str: Base64 encoded image
            quality: JPEG quality (1-100)

        Returns:
            str: Optimized base64 image
        """
        try:
            image_data = base64.b64decode(base64_str)
            image = Image.open(io.BytesIO(image_data))

            # Convert to RGB if needed
            if image.mode in ("RGBA", "P"):
                image = image.convert("RGB")

            # Optimize and save
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

    def clean_text_for_var(self, text: Optional[str]) -> str:
        """
        Clean text for use as variable name

        Args:
            text: Text to clean

        Returns:
            str: Cleaned variable-safe text
        """
        if not text:
            return "element"

        # Turkish character mapping
        tr_map = str.maketrans("ğüşıöçĞÜŞİÖÇ", "gusiocGUSIOC")
        text = text.translate(tr_map)

        # Replace non-alphanumeric with underscore
        clean = re.sub(r'[^a-zA-Z0-9_]', '_', text)

        # Remove multiple underscores and trim
        clean = re.sub(r'_+', '_', clean).strip('_').lower()

        # Truncate to max length
        return clean[:AnalyzerConstants.MAX_VAR_NAME_LENGTH]

    def get_element_type_suffix(self, class_name: str, resource_id: str = "",
                                is_password: bool = False) -> str:
        """
        Determine element type suffix for variable naming

        Args:
            class_name: Element class name
            resource_id: Element resource ID
            is_password: Whether element is password field

        Returns:
            str: Type suffix (button, input, lbl, etc.)
        """
        c = str(class_name).lower()
        r = str(resource_id).lower()

        if is_password:
            return "input"
        if "button" in c or "btn" in r:
            return "button"
        if "edittext" in c or "field" in c or "input" in r:
            return "input"
        if "text" in c or "label" in c:
            return "lbl"
        if "image" in c or "icon" in r:
            return "icon"
        if "check" in c or "box" in c:
            return "cb"
        if "switch" in c or "toggle" in c:
            return "switch"

        return "view"

    def safe_xpath_val(self, val: str) -> str:
        """
        Escape value for safe XPath usage

        Args:
            val: Value to escape

        Returns:
            str: Escaped value with quotes
        """
        if "'" in val:
            return f'"{val}"'
        return f"'{val}'"

    def parse_bounds_android(self, bounds_str: Optional[str]) -> Optional[Dict[str, int]]:
        """
        Parse Android bounds string

        Args:
            bounds_str: Bounds string like "[x1,y1][x2,y2]"

        Returns:
            dict or None: {"x", "y", "w", "h", "area"}
        """
        if not bounds_str:
            return None

        try:
            match = re.search(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds_str)
            if match:
                x1, y1, x2, y2 = map(int, match.groups())
                w = x2 - x1
                h = y2 - y1

                if w <= 0 or h <= 0:
                    return None

                return {
                    "x": x1,
                    "y": y1,
                    "w": w,
                    "h": h,
                    "area": w * h
                }
        except Exception as e:
            logger.debug(f"Failed to parse Android bounds '{bounds_str}': {e}")

        return None

    def parse_bounds_ios(self, elem: etree.Element) -> Optional[Dict[str, int]]:
        """
        Parse iOS element bounds

        Args:
            elem: iOS element

        Returns:
            dict or None: {"x", "y", "w", "h", "area"}
        """
        try:
            x = int(elem.attrib.get('x', 0))
            y = int(elem.attrib.get('y', 0))
            w = int(elem.attrib.get('width', 0))
            h = int(elem.attrib.get('height', 0))

            if w <= 0 or h <= 0:
                return None

            return {
                "x": x,
                "y": y,
                "w": w,
                "h": h,
                "area": w * h
            }
        except (ValueError, TypeError) as e:
            logger.debug(f"Failed to parse iOS bounds: {e}")
            return None

    def _is_unique_in_tree(self, tree: etree.Element, xpath: str) -> bool:
        """
        Check if XPath returns exactly one element

        Args:
            tree: XML tree
            xpath: XPath expression

        Returns:
            bool: True if unique
        """
        # Check cache first
        if xpath in self._xpath_cache:
            return self._xpath_cache[xpath]

        try:
            elements = tree.xpath(xpath)
            is_unique = len(elements) == 1

            # Cache result
            if len(self._xpath_cache) < 1000:  # Limit cache size
                self._xpath_cache[xpath] = is_unique

            return is_unique
        except Exception as e:
            logger.debug(f"XPath evaluation failed: {e}")
            return False

    def _build_hierarchical_xpath(self, elem: etree.Element, tree: etree.Element) -> str:
        """
        Build hierarchical XPath from root

        Args:
            elem: Target element
            tree: XML tree

        Returns:
            str: Hierarchical XPath
        """
        path_parts = []
        current = elem
        depth = 0

        while current is not None and depth < AnalyzerConstants.MAX_XPATH_DEPTH:
            parent = current.getparent()
            if parent is None:
                break

            siblings = [s for s in parent if s.tag == current.tag]

            if len(siblings) > 1:
                try:
                    index = siblings.index(current) + 1
                    path_parts.insert(0, f"{current.tag}[{index}]")
                except ValueError:
                    path_parts.insert(0, current.tag)
            else:
                path_parts.insert(0, current.tag)

            current = parent
            depth += 1

        return "//" + "/".join(path_parts) if path_parts else f"//{elem.tag}"

        # ==========================================
        # SMART TAP EKLENTİSİ (Mevcut kodların EN ALTINA ekleyin)
        # ==========================================
    def find_element_at_coords(self, tree: etree.Element, x: int, y: int, platform: str) -> Optional[etree.Element]:
        """
        Verilen koordinatlarda (x, y) en üstteki tıklanabilir elementi bulur.
        """
        all_elements = tree.xpath('//*')

        # Tersten döngü: XML'de son gelen element UI'da en üsttedir (Z-index)
        for elem in reversed(all_elements):
            bounds = None
            try:
                if platform == "ANDROID":
                    bounds = self.parse_bounds_android(elem.attrib.get("bounds"))
                else:
                    bounds = self.parse_bounds_ios(elem)
            except Exception:
                continue

            if not bounds:
                continue

            # Koordinat bu elementin sınırları içinde mi?
            if (bounds['x'] <= x <= bounds['x'] + bounds['w']) and \
                    (bounds['y'] <= y <= bounds['y'] + bounds['h']):

                # Gereksiz Container'ları (FrameLayout vb.) elemek için kontrol
                class_name = elem.attrib.get("class") if platform == "ANDROID" else elem.attrib.get("type")

                # Ignore listesi kontrolü
                is_ignored_class = False
                if hasattr(AnalyzerConstants, 'IGNORE_CLASSES'):
                    is_ignored_class = any(
                        ignored in str(class_name) for ignored in AnalyzerConstants.IGNORE_CLASSES)

                # Elementin metni veya ayırt edici özelliği var mı?
                has_text = False
                if platform == "ANDROID":
                    has_text = bool(elem.attrib.get("text") or elem.attrib.get("content-desc") or elem.attrib.get(
                        "resource-id"))
                else:
                    has_text = bool(elem.attrib.get("label") or elem.attrib.get("name") or elem.attrib.get("value"))

                # Eğer ignore listesindeyse ve belirleyici bir özelliği yoksa (boş kutuysa) atla
                if is_ignored_class and not has_text:
                    continue

                return elem

        return None

    def generate_relative_locator(self, elem: etree.Element, tree: etree.Element,
                                  platform: str) -> Optional[Dict[str, str]]:
        """
        Generate relative locator based on nearby labels

        Args:
            elem: Target element
            tree: XML tree
            platform: "ANDROID" or "IOS"

        Returns:
            dict or None: {"locator", "var_suffix", "strategy"}
        """
        try:
            class_name = elem.attrib.get("class") if platform == "ANDROID" else elem.attrib.get("type")

            # Only for input fields
            is_input = "EditText" in str(class_name) or "TextField" in str(class_name) or "Secure" in str(class_name)
            if not is_input:
                return None

            # Find all nodes
            all_nodes = tree.xpath('//*')

            try:
                my_index = all_nodes.index(elem)
            except ValueError:
                return None

            # Search previous elements for label
            found_text = None
            search_range = range(my_index - 1, max(-1, my_index - AnalyzerConstants.MAX_RELATIVE_SEARCH), -1)

            for i in search_range:
                node = all_nodes[i]

                if platform == "ANDROID":
                    txt = node.get("text") or node.get("content-desc")
                else:
                    txt = node.get("label") or node.get("value") or node.get("name")

                # Validate text
                if not txt or len(txt) > AnalyzerConstants.MAX_TEXT_LENGTH or txt.isdigit():
                    continue

                found_text = txt
                break

            if found_text:
                safe_txt = self.safe_xpath_val(found_text)

                if platform == "ANDROID":
                    xpath = f"(//*[contains(@text, {safe_txt}) or contains(@content-desc, {safe_txt})]/following::android.widget.EditText)[1]"
                else:
                    xpath = f"(//*[contains(@name, {safe_txt}) or contains(@label, {safe_txt})]/following::XCUIElementTypeTextField | //*[contains(@name, {safe_txt})]/following::XCUIElementTypeSecureTextField)[1]"

                return {
                    "locator": f"xpath={xpath}",
                    "var_suffix": found_text,
                    "strategy": "ANCHOR_XP"
                }

        except Exception as e:
            logger.debug(f"Failed to generate relative locator: {e}")

        return None

    def generate_robust_xpath(self, elem: etree.Element, tree: etree.Element,
                              platform: str, attribs: Dict[str, str]) -> str:
        """
        Generate robust XPath using multiple strategies

        Args:
            elem: Target element
            tree: XML tree
            platform: Platform name
            attribs: Element attributes

        Returns:
            str: Generated XPath
        """
        cls = attribs.get("class_name")
        res_id = attribs.get("res_id")
        content_desc = attribs.get("content_desc")
        text = attribs.get("text")

        # Level 1: Perfect match with unique attribute
        if res_id and self._is_unique_in_tree(tree, f"//*[@resource-id='{res_id}']"):
            return f"//*[@resource-id='{res_id}']"

        if content_desc and self._is_unique_in_tree(tree, f"//*[@content-desc='{content_desc}']"):
            return f"//*[@content-desc='{content_desc}']"

        if text and len(text) < AnalyzerConstants.MAX_TEXT_LENGTH:
            if self._is_unique_in_tree(tree, f"//*[@text='{text}']"):
                return f"//*[@text='{text}']"

        # Level 2: Parent context
        parent = elem.getparent()
        if parent is not None:
            parent_id = parent.get("resource-id")
            if parent_id:
                xpath = f"//*[@resource-id='{parent_id}']//{cls}"
                if text:
                    xpath += f"[@text='{text}']"
                elif content_desc:
                    xpath += f"[@content-desc='{content_desc}']"

                if self._is_unique_in_tree(tree, xpath):
                    return xpath

        # Level 3: Attribute combination
        conditions = []
        if res_id:
            conditions.append(f"contains(@resource-id, '{res_id.split('/')[-1]}')")
        if text and len(text) < 50:
            conditions.append(f"@text='{text}'")
        if content_desc:
            conditions.append(f"@content-desc='{content_desc}'")

        if len(conditions) >= 2:
            xpath = f"//{cls}[{' and '.join(conditions)}]"
            if self._is_unique_in_tree(tree, xpath):
                return xpath

        # Level 4: Sibling navigation
        if parent is not None:
            siblings = list(parent)
            try:
                my_index = siblings.index(elem)
                if my_index > 0:
                    prev_sibling = siblings[my_index - 1]
                    prev_text = prev_sibling.get("text") or prev_sibling.get("content-desc")
                    if prev_text:
                        xpath = f"//*[@text='{prev_text}']/following-sibling::{cls}[1]"
                        if self._is_unique_in_tree(tree, xpath):
                            return xpath
            except (ValueError, IndexError):
                pass

        # Level 5: Hierarchical path (last resort)
        return self._build_hierarchical_xpath(elem, tree)

    def get_best_locator(self, elem: etree.Element, tree: etree.Element,
                         info: Dict[str, Any], platform: str,
                         should_verify: bool) -> Optional[Dict[str, str]]:
        """
        Get best locator strategy for element

        Args:
            elem: Element
            tree: XML tree
            info: Element info dict
            platform: Platform name
            should_verify: Whether to verify

        Returns:
            dict or None: {"locator", "var_suffix", "strategy"}
        """
        cls = info["class_name"]
        res_id = info["res_id"]
        content_desc = info["content_desc"]
        text = info["text"]

        # Priority 1: Resource ID (Android)
        if platform == "ANDROID" and res_id and res_id not in AnalyzerConstants.BLACKLIST_IDS:
            return {
                "locator": f"id={res_id}",
                "var_suffix": res_id.split('/')[-1],
                "strategy": "ID"
            }

        # Priority 2: Accessibility ID
        if content_desc:
            return {
                "locator": f"accessibility_id={content_desc}",
                "var_suffix": content_desc,
                "strategy": "ACC_ID"
            }

        # Priority 3: Text (if short and unique)
        if text and len(text) < AnalyzerConstants.MAX_TEXT_LENGTH:
            if text.count(' ') < AnalyzerConstants.MAX_TEXT_WORDS and not text.isdigit():
                safe_txt = self.safe_xpath_val(text)

                if platform == "ANDROID":
                    text_xpath = f"//{cls}[@text={safe_txt}]"
                else:
                    text_xpath = f"//{cls}[@label={safe_txt} or @value={safe_txt}]"

                if self._is_unique_in_tree(tree, text_xpath):
                    return {
                        "locator": f"xpath={text_xpath}",
                        "var_suffix": text,
                        "strategy": "TEXT_XP"
                    }

        # Priority 4: Relative locator (for inputs)
        relative_res = self.generate_relative_locator(elem, tree, platform)
        if relative_res:
            return relative_res

        # Priority 5: Robust XPath
        robust_xpath = self.generate_robust_xpath(elem, tree, platform, info)
        if robust_xpath:
            suffix_text = text or content_desc or (res_id.split('/')[-1] if res_id else "element")
            return {
                "locator": f"xpath={robust_xpath}",
                "var_suffix": suffix_text,
                "strategy": "ROBUST_XP"
            }

        return None

    def process_single_element(self, args: Tuple) -> Optional[Dict[str, Any]]:
        """
        Process single element (designed for parallel execution)

        Args:
            args: Tuple of (elem, tree, platform, should_verify, index, prefix)

        Returns:
            dict or None: Element data
        """
        elem, tree, platform, should_verify, index, prefix = args

        try:
            att = elem.attrib

            # Parse platform-specific attributes
            if platform == "ANDROID":
                cls = att.get("class", "")
                coords = self.parse_bounds_android(att.get("bounds"))
                is_pwd = att.get("password") == "true"
                info = {
                    "res_id": att.get("resource-id", ""),
                    "content_desc": att.get("content-desc", ""),
                    "text": att.get("text", ""),
                    "class_name": cls,
                    "is_password": is_pwd
                }
            else:  # IOS
                cls = att.get("type", "")
                coords = self.parse_bounds_ios(elem)
                is_pwd = "Secure" in str(cls)
                info = {
                    "res_id": "",
                    "content_desc": att.get("name", ""),
                    "text": att.get("label") or att.get("value", ""),
                    "class_name": cls,
                    "is_password": is_pwd
                }

            # Filter: Check coordinates
            if not coords:
                return None

            if (coords['w'] < AnalyzerConstants.MIN_ELEMENT_WIDTH or
                    coords['h'] < AnalyzerConstants.MIN_ELEMENT_HEIGHT):
                return None

            # Filter: Ignored classes without text
            if any(b_cls in cls for b_cls in AnalyzerConstants.IGNORE_CLASSES):
                if not info["text"] and not info["content_desc"]:
                    return None

            # Filter: Blacklisted IDs
            if platform == "ANDROID":
                if any(b_id in info["res_id"] for b_id in AnalyzerConstants.BLACKLIST_IDS):
                    return None

            # Generate locator
            res = self.get_best_locator(elem, tree, info, platform, should_verify)

            # Fallback for inputs
            is_input = "EditText" in str(cls) or "Secure" in str(cls) or "TextField" in str(cls)
            if not res and is_input:
                res = {
                    "locator": f"xpath=(//{cls})[{index + 1}]",
                    "var_suffix": "input",
                    "strategy": "FALLBACK"
                }

            if res:
                # Generate variable name
                base_text = self.clean_text_for_var(res['var_suffix'])
                type_suffix = self.get_element_type_suffix(cls, info['res_id'], info['is_password'])

                if base_text.endswith(f"_{type_suffix}"):
                    final_variable_suffix = base_text
                else:
                    final_variable_suffix = f"{base_text}_{type_suffix}"

                if not prefix or len(prefix) < 2:
                    prefix = "page"

                v_name = f"${{selector_{prefix}_{final_variable_suffix}}}"

                # Get full XPath for debugging
                full_xpath = elem.getroottree().getpath(elem)

                return {
                    "coords": coords,
                    "variable": v_name,
                    "locator": res['locator'],
                    "strategy": res['strategy'],
                    "text": info["text"] or info["content_desc"] or "",
                    "full_xpath": full_xpath
                }

        except Exception as e:
            logger.debug(f"Failed to process element at index {index}: {e}")

        return None

    def estimate_page_name(self, tree: etree.Element, platform: str,
                           win_width: int, win_height: int) -> str:
        """
        Estimate page name from header elements

        Args:
            tree: XML tree
            platform: Platform name
            win_width: Window width
            win_height: Window height

        Returns:
            str: Estimated page name
        """
        possible_titles = []
        header_limit = win_height * AnalyzerConstants.HEADER_RATIO
        center_x = win_width / 2

        all_nodes = tree.xpath('//*')

        for elem in all_nodes:
            att = elem.attrib
            text = ""
            res_id = ""

            if platform == "ANDROID":
                text = att.get("text") or att.get("content-desc") or ""
                res_id = att.get("resource-id", "").lower()
                bounds = self.parse_bounds_android(att.get("bounds"))
            else:
                text = att.get("label") or att.get("value") or att.get("name") or ""
                bounds = self.parse_bounds_ios(elem)

            if not bounds:
                continue

            y = bounds['y']
            mid_x = bounds['x'] + (bounds['w'] / 2)

            # Text validation
            if not text or len(text) < AnalyzerConstants.MIN_TITLE_LENGTH:
                continue
            if len(text) > AnalyzerConstants.MAX_TITLE_LENGTH:
                continue
            if text.replace(":", "").replace("%", "").isdigit():
                continue

            # Must be in header area
            if y > header_limit:
                continue

            # Calculate score
            score = 0

            # Resource ID hints
            clean_id = res_id.lower() if res_id else ""
            if "title" in clean_id:
                score += 20
            if "header" in clean_id:
                score += 15

            # Position score (higher = closer to top)
            pos_score = (header_limit - y) / 20
            score += pos_score

            # Center alignment bonus
            dist_from_center = abs(center_x - mid_x)
            if dist_from_center < (win_width * AnalyzerConstants.CENTER_TOLERANCE):
                score += 15

            # Size bonus
            if bounds['h'] > AnalyzerConstants.MIN_HEADER_HEIGHT:
                score += 5

            possible_titles.append({"text": text, "score": score})

        if possible_titles:
            best = max(possible_titles, key=lambda x: x['score'])
            page_name = self.clean_text_for_var(best['text'])
            logger.info(f"Estimated page name: {page_name} (score: {best['score']:.1f})")
            return page_name

        return "page"

    def analyze(self, page_source: str, platform: str, should_verify: bool,
                user_prefix: str, win_size: Dict[str, int]) -> Dict[str, Any]:
        """
        Main analysis method

        Args:
            page_source: XML page source
            platform: "ANDROID" or "IOS"
            should_verify: Whether to verify locators
            user_prefix: User-provided page name prefix
            win_size: Window size dict

        Returns:
            dict: Analysis result
        """
        try:
            # Parse XML
            try:
                tree = etree.fromstring(page_source.encode('utf-8'))
            except Exception as e:
                logger.error(f"XML parse error: {e}")
                return {"error": "XML Parse Error: Invalid XML structure"}

            # Clear XPath cache for new page
            self._xpath_cache.clear()

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
                # Skip full-screen containers
                if platform == "ANDROID":
                    b = self.parse_bounds_android(elem.attrib.get("bounds"))
                    if b and b['area'] > (area_total * 0.95):
                        continue

                task_args.append((elem, tree, platform, should_verify, idx, detected_page_name))

            logger.info(f"Processing {len(task_args)} candidate elements")

            # Process elements (can be parallelized in future)
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