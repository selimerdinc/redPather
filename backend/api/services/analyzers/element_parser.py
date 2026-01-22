"""
Element Parser - XML element parsing utilities
Handles bounds parsing and element extraction for Android/iOS
"""
import re
import logging
from typing import Dict, Optional, Any
from lxml import etree

logger = logging.getLogger(__name__)


class ElementParser:
    """Parses mobile app XML elements and extracts coordinates/bounds"""

    # Element filtering constants
    MIN_ELEMENT_WIDTH = 10
    MIN_ELEMENT_HEIGHT = 10
    MIN_ELEMENT_AREA = 100
    MAX_ELEMENT_SCREEN_RATIO = 0.90

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

    @staticmethod
    def parse_bounds_android(bounds_str: Optional[str]) -> Optional[Dict[str, int]]:
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

    @staticmethod
    def parse_bounds_ios(elem: etree.Element) -> Optional[Dict[str, int]]:
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

    @classmethod
    def find_element_at_coords(cls, tree: etree.Element, x: int, y: int, 
                                platform: str) -> Optional[etree.Element]:
        """
        Find the topmost clickable element at given coordinates.
        
        Args:
            tree: XML tree
            x: X coordinate
            y: Y coordinate
            platform: "ANDROID" or "IOS"
            
        Returns:
            Element or None
        """
        all_elements = tree.xpath('//*')

        # Reverse iteration: last element in XML is on top (Z-index)
        for elem in reversed(all_elements):
            bounds = None
            try:
                if platform == "ANDROID":
                    bounds = cls.parse_bounds_android(elem.attrib.get("bounds"))
                else:
                    bounds = cls.parse_bounds_ios(elem)
            except Exception:
                continue

            if not bounds:
                continue

            # Check if coordinates are within element bounds
            if (bounds['x'] <= x <= bounds['x'] + bounds['w']) and \
                    (bounds['y'] <= y <= bounds['y'] + bounds['h']):

                class_name = elem.attrib.get("class") if platform == "ANDROID" else elem.attrib.get("type")

                # Check ignore list
                is_ignored_class = any(
                    ignored in str(class_name) for ignored in cls.IGNORE_CLASSES
                )

                # Check for distinguishing attributes
                if platform == "ANDROID":
                    has_text = bool(
                        elem.attrib.get("text") or 
                        elem.attrib.get("content-desc") or 
                        elem.attrib.get("resource-id")
                    )
                else:
                    has_text = bool(
                        elem.attrib.get("label") or 
                        elem.attrib.get("name") or 
                        elem.attrib.get("value")
                    )

                # Skip ignored classes without distinguishing features
                if is_ignored_class and not has_text:
                    continue

                return elem

        return None

    @classmethod
    def extract_element_info(cls, elem: etree.Element, platform: str) -> Dict[str, Any]:
        """
        Extract element information based on platform.
        
        Args:
            elem: XML element
            platform: "ANDROID" or "IOS"
            
        Returns:
            dict: Element info with res_id, content_desc, text, class_name, is_password
        """
        att = elem.attrib

        if platform == "ANDROID":
            cls_name = att.get("class", "")
            is_pwd = att.get("password") == "true"
            return {
                "res_id": att.get("resource-id", ""),
                "content_desc": att.get("content-desc", ""),
                "text": att.get("text", ""),
                "class_name": cls_name,
                "is_password": is_pwd
            }
        else:  # IOS
            cls_name = att.get("type", "")
            is_pwd = "Secure" in str(cls_name)
            return {
                "res_id": "",
                "content_desc": att.get("name", ""),
                "text": att.get("label") or att.get("value", ""),
                "class_name": cls_name,
                "is_password": is_pwd
            }
