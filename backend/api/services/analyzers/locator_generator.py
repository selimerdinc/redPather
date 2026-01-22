"""
Locator Generator - Locator strategy generation utilities
Handles XPath generation, locator health scoring, and verification
"""
import re
import logging
from typing import Dict, Optional, Any
from lxml import etree

logger = logging.getLogger(__name__)


class LocatorGenerator:
    """Generates optimized locators for test automation"""

    # XPath constraints
    MAX_XPATH_DEPTH = 4
    MAX_RELATIVE_SEARCH = 15
    MAX_TEXT_LENGTH = 50
    MAX_TEXT_WORDS = 10

    # Locator health scores - higher = more stable
    HEALTH_SCORES = {
        "ID": 95,           # resource-id - most stable
        "ACC_ID": 90,       # accessibility_id - very stable
        "ID_TEXT": 85,      # ID + text combo
        "ANCHOR": 80,       # relative anchoring
        "ANCHOR_XP": 80,    # anchor xpath
        "CONTENT_DESC": 75, # content-desc
        "TEXT": 60,         # text only - breaks on localization
        "TEXT_XP": 60,      # text xpath
        "TEXT_FALLBACK": 50,# text fallback
        "LABEL": 55,        # iOS label
        "ROBUST_XP": 45,    # robust xpath
        "FALLBACK": 30,     # general fallback
        "INDEX_XPATH": 25,  # index-based xpath - very fragile
        "UNKNOWN": 40       # unknown strategy
    }

    # Health thresholds
    HEALTH_THRESHOLD_GOOD = 70      # 🟢 Green
    HEALTH_THRESHOLD_WARNING = 50   # 🟡 Yellow
    # < 50 = 🔴 Red (fragile)

    # Blacklisted IDs
    BLACKLIST_IDS = [
        "android:id/content", "android:id/statusBarBackground",
        "android:id/navigationBarBackground", "android:id/home"
    ]

    def __init__(self):
        self._xpath_cache: Dict[str, bool] = {}

    def clear_cache(self):
        """Clear XPath uniqueness cache"""
        self._xpath_cache.clear()

    def calculate_health_score(self, strategy: str, locator: str) -> int:
        """
        Calculate health score for a locator based on strategy and pattern.
        
        Args:
            strategy: Locator strategy (ID, ACC_ID, TEXT, etc.)
            locator: Full locator string
            
        Returns:
            int: Health score 0-100 (higher = more stable)
        """
        base_score = self.HEALTH_SCORES.get(strategy, self.HEALTH_SCORES["UNKNOWN"])
        
        # Penalize index-based XPaths (very fragile)
        if "[" in locator and "]" in locator:
            if re.search(r'\[\d+\]', locator):
                base_score = min(base_score, 25)
        
        # Penalize very long XPaths
        if locator.startswith("xpath=") and locator.count("/") > 5:
            base_score = max(base_score - 10, 15)
        
        # Penalize text-based locators with non-ASCII (localization risk)
        if "text=" in locator.lower() or "@label=" in locator.lower():
            if any(ord(c) > 127 for c in locator):
                base_score = max(base_score - 15, 30)
        
        return base_score

    def get_health_label(self, health_score: int) -> str:
        """Get health label from score"""
        if health_score >= self.HEALTH_THRESHOLD_GOOD:
            return "good"
        elif health_score >= self.HEALTH_THRESHOLD_WARNING:
            return "warning"
        return "fragile"

    def safe_xpath_val(self, val: str) -> str:
        """XPath 2.0 concat method for escaping quotes"""
        if "'" not in val:
            return f"'{val}'"
        if '"' not in val:
            return f'"{val}"'

        # Both quotes present, use concat
        parts = val.split("'")
        return "concat(" + ", \"'\", ".join(f"'{part}'" for part in parts) + ")"

    def is_unique_in_tree(self, tree: etree.Element, xpath: str) -> bool:
        """
        Check if XPath returns exactly one element

        Args:
            tree: XML tree
            xpath: XPath expression

        Returns:
            bool: True if unique
        """
        if xpath in self._xpath_cache:
            return self._xpath_cache[xpath]

        try:
            elements = tree.xpath(xpath)
            is_unique = len(elements) == 1

            if len(self._xpath_cache) < 1000:
                self._xpath_cache[xpath] = is_unique

            return is_unique
        except Exception as e:
            logger.debug(f"XPath evaluation failed: {e}")
            return False

    def build_hierarchical_xpath(self, elem: etree.Element, 
                                  tree: etree.Element) -> str:
        """Build hierarchical XPath from root"""
        path_parts = []
        current = elem
        depth = 0

        while current is not None and depth < self.MAX_XPATH_DEPTH:
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

            all_nodes = tree.xpath('//*')

            try:
                my_index = all_nodes.index(elem)
            except ValueError:
                return None

            # Search previous elements for label
            found_text = None
            search_range = range(my_index - 1, max(-1, my_index - self.MAX_RELATIVE_SEARCH), -1)

            for i in search_range:
                node = all_nodes[i]

                if platform == "ANDROID":
                    txt = node.get("text") or node.get("content-desc")
                else:
                    txt = node.get("label") or node.get("value") or node.get("name")

                if not txt or len(txt) > self.MAX_TEXT_LENGTH or txt.isdigit():
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
        """Generate robust XPath using multiple strategies"""
        cls = attribs.get("class_name")
        res_id = attribs.get("res_id")
        content_desc = attribs.get("content_desc")
        text = attribs.get("text")

        # Level 1: Perfect match with unique attribute
        if res_id and self.is_unique_in_tree(tree, f"//*[@resource-id='{res_id}']"):
            return f"//*[@resource-id='{res_id}']"

        if content_desc and self.is_unique_in_tree(tree, f"//*[@content-desc='{content_desc}']"):
            return f"//*[@content-desc='{content_desc}']"

        if text and len(text) < self.MAX_TEXT_LENGTH:
            if self.is_unique_in_tree(tree, f"//*[@text='{text}']"):
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

                if self.is_unique_in_tree(tree, xpath):
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
            if self.is_unique_in_tree(tree, xpath):
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
                        if self.is_unique_in_tree(tree, xpath):
                            return xpath
            except (ValueError, IndexError):
                pass

        # Level 5: Hierarchical path (last resort)
        return self.build_hierarchical_xpath(elem, tree)

    def get_best_locator(self, elem: etree.Element, tree: etree.Element,
                         info: Dict[str, Any], platform: str,
                         should_verify: bool = False) -> Optional[Dict[str, str]]:
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
        if platform == "ANDROID" and res_id and res_id not in self.BLACKLIST_IDS:
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
        if text and len(text) < self.MAX_TEXT_LENGTH:
            if text.count(' ') < self.MAX_TEXT_WORDS and not text.isdigit():
                safe_txt = self.safe_xpath_val(text)

                if platform == "ANDROID":
                    text_xpath = f"//{cls}[@text={safe_txt}]"
                else:
                    text_xpath = f"//{cls}[@label={safe_txt} or @value={safe_txt}]"

                if self.is_unique_in_tree(tree, text_xpath):
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
