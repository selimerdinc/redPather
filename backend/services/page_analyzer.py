import re
import io
import base64
import logging
from typing import Dict, List, Optional, Tuple, Any
from PIL import Image
from lxml import etree
from appium.webdriver.common.appiumby import AppiumBy
import concurrent.futures

logger = logging.getLogger(__name__)


class AnalyzerConstants:
    """Page analyzer constants"""
    # Element filtering - KÜÇÜK ELEMENTLER İÇİN AYARLANDI
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
    HEADER_RATIO = 0.30
    CENTER_TOLERANCE = 0.15
    MIN_HEADER_HEIGHT = 30

    # XPath
    MAX_XPATH_DEPTH = 6
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
    def __init__(self, driver):
        self.driver = driver
        self._xpath_cache: Dict[str, bool] = {}

    def optimize_image(self, base64_str: str, quality: int = AnalyzerConstants.IMAGE_QUALITY) -> str:
        try:
            image_data = base64.b64decode(base64_str)
            image = Image.open(io.BytesIO(image_data))
            if image.mode in ("RGBA", "P"):
                image = image.convert("RGB")
            buffer = io.BytesIO()
            image.save(buffer, format=AnalyzerConstants.IMAGE_FORMAT, quality=quality, optimize=True)
            return base64.b64encode(buffer.getvalue()).decode('utf-8')
        except Exception as e:
            logger.warning(f"Image optimization failed: {e}")
            return base64_str

    def clean_text_for_var(self, text: Optional[str]) -> str:
        if not text: return "element"
        tr_map = str.maketrans("ğüşıöçĞÜŞİÖÇ", "gusiocGUSIOC")
        text = text.translate(tr_map)
        clean = re.sub(r'[^a-zA-Z0-9_]', '_', text)
        clean = re.sub(r'_+', '_', clean).strip('_').lower()
        return clean[:AnalyzerConstants.MAX_VAR_NAME_LENGTH]

    def get_element_type_suffix(self, class_name: str, resource_id: str = "", is_password: bool = False) -> str:
        c = str(class_name).lower()
        r = str(resource_id).lower()
        if is_password: return "input"
        if "button" in c or "btn" in r: return "button"
        if "edittext" in c or "field" in c or "input" in r: return "input"
        if "text" in c or "label" in c: return "lbl"
        if "image" in c or "icon" in r: return "icon"
        if "check" in c or "box" in c: return "cb"
        if "switch" in c or "toggle" in c: return "switch"
        return "view"

    def safe_xpath_val(self, val: str) -> str:
        return f'"{val}"' if "'" in val else f"'{val}'"

    def parse_bounds_android(self, bounds_str: Optional[str]) -> Optional[Dict[str, int]]:
        if not bounds_str: return None
        try:
            match = re.search(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds_str)
            if match:
                x1, y1, x2, y2 = map(int, match.groups())
                w, h = x2 - x1, y2 - y1
                if w <= 0 or h <= 0: return None
                return {"x": x1, "y": y1, "w": w, "h": h, "area": w * h}
        except Exception: pass
        return None

    def parse_bounds_ios(self, elem: etree.Element) -> Optional[Dict[str, int]]:
        try:
            x = int(elem.attrib.get('x', 0))
            y = int(elem.attrib.get('y', 0))
            w = int(elem.attrib.get('width', 0))
            h = int(elem.attrib.get('height', 0))
            if w <= 0 or h <= 0: return None
            return {"x": x, "y": y, "w": w, "h": h, "area": w * h}
        except ValueError: return None

    def _is_unique_in_tree(self, tree: etree.Element, xpath: str) -> bool:
        if xpath in self._xpath_cache: return self._xpath_cache[xpath]
        try:
            is_unique = len(tree.xpath(xpath)) == 1
            if len(self._xpath_cache) < 1000: self._xpath_cache[xpath] = is_unique
            return is_unique
        except Exception: return False

    def _build_hierarchical_xpath(self, elem: etree.Element, tree: etree.Element) -> str:
        path_parts = []
        current = elem
        depth = 0
        while current is not None and depth < AnalyzerConstants.MAX_XPATH_DEPTH:
            parent = current.getparent()
            if parent is None: break
            siblings = [s for s in parent if s.tag == current.tag]
            if len(siblings) > 1:
                try:
                    index = siblings.index(current) + 1
                    path_parts.insert(0, f"{current.tag}[{index}]")
                except ValueError: path_parts.insert(0, current.tag)
            else: path_parts.insert(0, current.tag)
            current = parent
            depth += 1
        return "//" + "/".join(path_parts) if path_parts else f"//{elem.tag}"

    def generate_relative_locator(self, elem: etree.Element, tree: etree.Element, platform: str) -> Optional[Dict[str, str]]:
        try:
            class_name = elem.attrib.get("class") if platform == "ANDROID" else elem.attrib.get("type")
            if not any(x in str(class_name) for x in ["EditText", "TextField", "Secure"]): return None
            
            all_nodes = tree.xpath('//*')
            my_index = all_nodes.index(elem)
            found_text = None
            
            for i in range(my_index - 1, max(-1, my_index - AnalyzerConstants.MAX_RELATIVE_SEARCH), -1):
                node = all_nodes[i]
                txt = node.get("text") or node.get("content-desc") if platform == "ANDROID" else node.get("label") or node.get("value") or node.get("name")
                if txt and len(txt) <= AnalyzerConstants.MAX_TEXT_LENGTH and not txt.isdigit():
                    found_text = txt
                    break
            
            if found_text:
                safe_txt = self.safe_xpath_val(found_text)
                if platform == "ANDROID":
                    xpath = f"(//*[contains(@text, {safe_txt}) or contains(@content-desc, {safe_txt})]/following::android.widget.EditText)[1]"
                else:
                    xpath = f"(//*[contains(@name, {safe_txt}) or contains(@label, {safe_txt})]/following::XCUIElementTypeTextField | //*[contains(@name, {safe_txt})]/following::XCUIElementTypeSecureTextField)[1]"
                return {"locator": f"xpath={xpath}", "var_suffix": found_text, "strategy": "ANCHOR_XP"}
        except Exception: pass
        return None

    def generate_robust_xpath(self, elem: etree.Element, tree: etree.Element, platform: str, attribs: Dict[str, str]) -> str:
        res_id, content_desc, text, cls = attribs.get("res_id"), attribs.get("content_desc"), attribs.get("text"), attribs.get("class_name")
        
        if res_id and self._is_unique_in_tree(tree, f"//*[@resource-id='{res_id}']"): return f"//*[@resource-id='{res_id}']"
        if content_desc and self._is_unique_in_tree(tree, f"//*[@content-desc='{content_desc}']"): return f"//*[@content-desc='{content_desc}']"
        if text and len(text) < AnalyzerConstants.MAX_TEXT_LENGTH and self._is_unique_in_tree(tree, f"//*[@text='{text}']"): return f"//*[@text='{text}']"
        
        return self._build_hierarchical_xpath(elem, tree)

    def get_best_locator(self, elem: etree.Element, tree: etree.Element, info: Dict[str, Any], platform: str, should_verify: bool) -> Optional[Dict[str, str]]:
        if platform == "ANDROID" and info["res_id"] and info["res_id"] not in AnalyzerConstants.BLACKLIST_IDS:
            return {"locator": f"id={info['res_id']}", "var_suffix": info['res_id'].split('/')[-1], "strategy": "ID"}
        if info["content_desc"]:
            return {"locator": f"accessibility_id={info['content_desc']}", "var_suffix": info['content_desc'], "strategy": "ACC_ID"}
        
        rel = self.generate_relative_locator(elem, tree, platform)
        if rel: return rel
        
        xp = self.generate_robust_xpath(elem, tree, platform, info)
        if xp:
            suffix = info["text"] or info["content_desc"] or (info["res_id"].split('/')[-1] if info["res_id"] else "element")
            return {"locator": f"xpath={xp}", "var_suffix": suffix, "strategy": "ROBUST_XP"}
        return None

    def process_single_element(self, args: Tuple) -> Optional[Dict[str, Any]]:
        elem, tree, platform, should_verify, index, prefix = args
        try:
            att = elem.attrib
            if platform == "ANDROID":
                cls, is_pwd = att.get("class", ""), att.get("password") == "true"
                coords = self.parse_bounds_android(att.get("bounds"))
                info = {"res_id": att.get("resource-id", ""), "content_desc": att.get("content-desc", ""), "text": att.get("text", ""), "class_name": cls, "is_password": is_pwd}
            else:
                cls, is_pwd = att.get("type", ""), "Secure" in str(att.get("type", ""))
                coords = self.parse_bounds_ios(elem)
                info = {"res_id": "", "content_desc": att.get("name", ""), "text": att.get("label") or att.get("value", ""), "class_name": cls, "is_password": is_pwd}

            if not coords or (coords['w'] < AnalyzerConstants.MIN_ELEMENT_WIDTH or coords['h'] < AnalyzerConstants.MIN_ELEMENT_HEIGHT): return None
            if any(b_cls in cls for b_cls in AnalyzerConstants.IGNORE_CLASSES) and not info["text"] and not info["content_desc"]: return None
            if platform == "ANDROID" and any(b_id in info["res_id"] for b_id in AnalyzerConstants.BLACKLIST_IDS): return None

            res = self.get_best_locator(elem, tree, info, platform, should_verify)
            if not res and ("EditText" in str(cls) or "Secure" in str(cls) or "TextField" in str(cls)):
                res = {"locator": f"xpath=(//{cls})[{index + 1}]", "var_suffix": "input", "strategy": "FALLBACK"}

            if res:
                base = self.clean_text_for_var(res['var_suffix'])
                suffix = self.get_element_type_suffix(cls, info['res_id'], info['is_password'])
                var_name = f"${{selector_{prefix if prefix and len(prefix)>1 else 'page'}_{base if base.endswith(f'_{suffix}') else f'{base}_{suffix}'}}}"
                return {"coords": coords, "variable": var_name, "locator": res['locator'], "strategy": res['strategy'], "text": info["text"] or info["content_desc"] or "", "full_xpath": elem.getroottree().getpath(elem)}
        except Exception: pass
        return None

    def estimate_page_name(self, tree: etree.Element, platform: str, win_width: int, win_height: int) -> str:
        # (Basitleştirildi) Başlık tahmini
        return "page"

    def analyze(self, page_source: str, platform: str, should_verify: bool, user_prefix: str, win_size: Dict[str, int]) -> Dict[str, Any]:
        try:
            tree = etree.fromstring(page_source.encode('utf-8'))
            self._xpath_cache.clear()
            
            all_elements = tree.xpath('//*')
            logger.info(f"Found {len(all_elements)} total elements")
            
            task_args = []
            area_total = win_size['width'] * win_size['height']
            
            for idx, elem in enumerate(all_elements):
                if platform == "ANDROID":
                    b = self.parse_bounds_android(elem.attrib.get("bounds"))
                    if b and b['area'] > (area_total * 0.95): continue
                task_args.append((elem, tree, platform, should_verify, idx, user_prefix))

            final_data = []
            with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                results = executor.map(self.process_single_element, task_args)
                for res in results:
                    if res: final_data.append(res)
            
            return {"elements": final_data, "page_name": user_prefix or "page"}
        except Exception as e:
            logger.error(f"Analysis failed: {e}")
            return {"error": str(e)}