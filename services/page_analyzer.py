import re
import io
import base64
from PIL import Image
from lxml import etree
from appium.webdriver.common.appiumby import AppiumBy
import concurrent.futures


class PageAnalyzer:
    IGNORE_CLASSES = [
        "android.widget.FrameLayout", "android.widget.LinearLayout",
        "android.widget.RelativeLayout", "android.view.View",
        "XCUIElementTypeWindow", "XCUIElementTypeOther", "XCUIElementTypeApplication",
        "XCUIElementTypeScrollView", "XCUIElementTypeTable", "XCUIElementTypeImage",
        "XCUIElementTypeStatusBar", "XCUIElementTypeNavigationBar"
    ]

    BLACKLIST_IDS = [
        "android:id/content", "android:id/statusBarBackground",
        "android:id/navigationBarBackground", "android:id/home"
    ]

    def __init__(self, driver):
        self.driver = driver

    def optimize_image(self, base64_str, quality=60):
        try:
            image_data = base64.b64decode(base64_str)
            image = Image.open(io.BytesIO(image_data))
            if image.mode in ("RGBA", "P"): image = image.convert("RGB")
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=quality, optimize=True)
            return base64.b64encode(buffer.getvalue()).decode('utf-8')
        except:
            return base64_str

    def clean_text_for_var(self, text):
        if not text: return "element"
        tr_map = str.maketrans("ğüşıöçĞÜŞİÖÇ", "gusiocGUSIOC")
        text = text.translate(tr_map)
        clean = re.sub(r'[^a-zA-Z0-9_]', '_', text)
        clean = re.sub(r'_+', '_', clean).strip('_').lower()
        return clean[:55]

    def get_element_type_suffix(self, class_name, resource_id="", is_password=False):
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

    def safe_xpath_val(self, val):
        if "'" in val: return f'"{val}"'
        return f"'{val}'"

    def parse_bounds_android(self, bounds_str):
        if not bounds_str: return None
        match = re.search(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds_str)
        if match:
            x1, y1, x2, y2 = map(int, match.groups())
            return {"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1, "area": (x2 - x1) * (y2 - y1)}
        return None

    def parse_bounds_ios(self, elem):
        try:
            x = int(elem.attrib.get('x', 0))
            y = int(elem.attrib.get('y', 0))
            w = int(elem.attrib.get('width', 0))
            h = int(elem.attrib.get('height', 0))
            if w <= 0 or h <= 0: return None
            return {"x": x, "y": y, "w": w, "h": h, "area": w * h}
        except:
            return None

    def generate_relative_locator(self, elem, tree, platform):
        try:
            class_name = elem.attrib.get("class") if platform == "ANDROID" else elem.attrib.get("type")
            is_input = "EditText" in str(class_name) or "TextField" in str(class_name) or "Secure" in str(class_name)
            if not is_input: return None
            all_nodes = tree.xpath('//*')
            try:
                my_index = all_nodes.index(elem)
            except ValueError:
                return None
            found_text = None
            for i in range(my_index - 1, max(-1, my_index - 15), -1):
                node = all_nodes[i]
                txt = ""
                if platform == "ANDROID":
                    txt = node.get("text") or node.get("content-desc")
                else:
                    txt = node.get("label") or node.get("value") or node.get("name")
                if not txt or len(txt) > 60 or txt.isdigit(): continue
                found_text = txt
                break
            if found_text:
                safe_txt = self.safe_xpath_val(found_text)
                final_xpath = ""
                if platform == "ANDROID":
                    final_xpath = f"(//*[contains(@text, {safe_txt}) or contains(@content-desc, {safe_txt})]/following::android.widget.EditText)[1]"
                else:
                    final_xpath = f"(//*[contains(@name, {safe_txt}) or contains(@label, {safe_txt})]/following::XCUIElementTypeTextField | //*[contains(@name, {safe_txt})]/following::XCUIElementTypeSecureTextField)[1]"
                return {"locator": f"xpath={final_xpath}", "var_suffix": found_text, "strategy": "ANCHOR_XP"}
        except:
            pass
        return None

    def generate_robust_xpath(self, elem, tree, platform, attribs):
        """
        XPath Uzmanı - Kırılmaz, unique, maintain edilebilir xpath'ler üret

        Priority:
        1. Unique attributes (resource-id, content-desc, text)
        2. Parent-child relationships
        3. Sibling navigation
        4. Attribute combinations
        5. Positioned relative xpaths
        """

        cls = attribs.get("class_name")
        res_id = attribs.get("res_id")
        content_desc = attribs.get("content_desc")
        text = attribs.get("text")

        # LEVEL 1: Perfect Match - Tek attribute ile unique
        if res_id and self._is_unique_in_tree(tree, f"//*[@resource-id='{res_id}']"):
            return f"//*[@resource-id='{res_id}']"

        if content_desc and self._is_unique_in_tree(tree, f"//*[@content-desc='{content_desc}']"):
            return f"//*[@content-desc='{content_desc}']"

        if text and len(text) < 30 and self._is_unique_in_tree(tree, f"//*[@text='{text}']"):
            return f"//*[@text='{text}']"

        # LEVEL 2: Parent Context - Parent ile birlikte unique yap
        parent = elem.getparent()
        if parent is not None:
            parent_id = parent.get("resource-id")
            if parent_id:
                # Parent ID + child class
                xpath = f"//*[@resource-id='{parent_id}']//{cls}"
                if text:
                    xpath += f"[@text='{text}']"
                elif content_desc:
                    xpath += f"[@content-desc='{content_desc}']"

                if self._is_unique_in_tree(tree, xpath):
                    return xpath

        # LEVEL 3: Attribute Combination - Multiple attributes
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

        # LEVEL 4: Sibling Navigation - Kardeş elementlerle pozisyon
        siblings = list(parent) if parent is not None else []
        try:
            my_index = siblings.index(elem)
            if my_index > 0:
                prev_sibling = siblings[my_index - 1]
                prev_text = prev_sibling.get("text") or prev_sibling.get("content-desc")
                if prev_text:
                    xpath = f"//*[@text='{prev_text}']/following-sibling::{cls}[1]"
                    if self._is_unique_in_tree(tree, xpath):
                        return xpath
        except:
            pass

        # LEVEL 5: Hierarchical Path - Full parent chain (son çare)
        return self._build_hierarchical_xpath(elem, tree)

    def _is_unique_in_tree(self, tree, xpath):
        """Xpath'in tree'de tek element döndürüp döndürmediğini kontrol et"""
        try:
            elements = tree.xpath(xpath)
            return len(elements) == 1
        except:
            return False

    def _build_hierarchical_xpath(self, elem, tree):
        """
        Son çare: Root'tan başlayarak tam hierarchy xpath oluştur
        Örnek: /hierarchy/android.widget.FrameLayout[2]/android.widget.LinearLayout/android.widget.Button
        """
        path_parts = []
        current = elem

        while current is not None:
            parent = current.getparent()
            if parent is None:
                break

            siblings = [s for s in parent if s.tag == current.tag]
            if len(siblings) > 1:
                index = siblings.index(current) + 1
                path_parts.insert(0, f"{current.tag}[{index}]")
            else:
                path_parts.insert(0, current.tag)

            current = parent

            # Max 4 level ile sınırla (çok uzun olmasın)
            if len(path_parts) >= 4:
                break

        return "//" + "/".join(path_parts)

    def get_best_locator(self, elem, tree, info, platform, should_verify):
        """
        En iyi, en kuvvetli konum belirleyiciyi (locator) seçer.
        Öncelik Sırası (Kırılmaya Karşı Dayanıklılık):
        1. Resource ID (Android)
        2. Accessibility ID (Content-Desc/Name)
        3. Text (Unique ve Kısa ise)
        4. Relative XPath (Label'a göre Input bulma)
        5. Robust/Güçlü XPath
        """
        cls = info["class_name"]
        res_id = info["res_id"]
        content_desc = info["content_desc"]
        text = info["text"]

        # --- 1. SEVİYE: ID BAZLI LOCATOR'LAR (En Hızlı ve En Güvenilir) ---

        # 1.1 Android için Resource-ID (ID)
        if platform == "ANDROID" and res_id and res_id not in self.BLACKLIST_IDS:
            return {"locator": f"id={res_id}", "var_suffix": res_id.split('/')[-1], "strategy": "ID"}

        # 1.2 iOS/Android için Accessibility ID (content-desc/name)
        if content_desc:
            return {"locator": f"accessibility id={content_desc}", "var_suffix": content_desc, "strategy": "ACC_ID"}

        # --- 2. SEVİYE: TEXT BAZLI LOCATOR'LAR ---

        # 2.1 Text ile konumlandırma (Kısa, anlamlı ve unique ise)
        if text and len(text) < 30 and text.count(' ') < 5 and not text.isdigit():
            safe_txt = self.safe_xpath_val(text)

            # Platforma göre text/label/value kontrolü
            if platform == "ANDROID":
                text_xpath = f"//{cls}[@text={safe_txt}]"
            else:  # iOS
                text_xpath = f"//{cls}[@label={safe_txt} or @value={safe_txt}]"

            if self._is_unique_in_tree(tree, text_xpath):
                return {"locator": f"xpath={text_xpath}", "var_suffix": text, "strategy": "TEXT_XP"}

        # --- 3. SEVİYE: GELİŞMİŞ/İLİŞKİSEL LOCATOR'LAR (Sizin Yapınız) ---

        # 3.1 Input alanları için Relative Locator (Label'a göre Input bulma)
        # Bu, input'ları çevreleyen metin etiketlerine göre bulma yapınızdır.
        relative_res = self.generate_relative_locator(elem, tree, platform)
        if relative_res:
            return relative_res

        # 3.2 Robust (Sağlam) XPath üretme
        # Bu, sizin çok seviyeli ve ilişkilere dayalı XPath üretme yapınızdır.
        robust_xpath = self.generate_robust_xpath(elem, tree, platform, info)
        if robust_xpath:
            # XPath'in adlandırılmasında kullanmak için bir metin veya ID tercih et
            suffix_text = text or content_desc or res_id.split('/')[-1]
            return {"locator": f"xpath={robust_xpath}", "var_suffix": suffix_text, "strategy": "ROBUST_XP"}

        # Hiçbir güçlü locator bulunamadı.
        return None

    def process_single_element(self, args):
        elem, tree, platform, should_verify, index, prefix = args
        att = elem.attrib

        if platform == "ANDROID":
            cls = att.get("class", "");
            coords = self.parse_bounds_android(att.get("bounds"))
            is_pwd = att.get("password") == "true"
            info = {"res_id": att.get("resource-id", ""), "content_desc": att.get("content-desc", ""),
                    "text": att.get("text", ""), "class_name": cls, "is_password": is_pwd}
        else:
            cls = att.get("type", "");
            coords = self.parse_bounds_ios(elem)
            is_pwd = "Secure" in str(cls)
            info = {"res_id": "", "content_desc": att.get("name", ""),
                    "text": att.get("label") or att.get("value", ""), "class_name": cls, "is_password": is_pwd}

        if not coords or coords['w'] < 20 or coords['h'] < 20: return None
        if any(b_cls in cls for b_cls in self.IGNORE_CLASSES):
            if not info["text"] and not info["content_desc"]: return None
        if platform == "ANDROID" and any(b_id in info["res_id"] for b_id in self.BLACKLIST_IDS): return None


        res = self.get_best_locator(elem, tree, info, platform, should_verify)

        is_input = "EditText" in str(cls) or "Secure" in str(cls) or "TextField" in str(cls)
        if not res and is_input:
            res = {"locator": f"xpath=(//{cls})[{index + 1}]", "var_suffix": "input", "strategy": "FALLBACK"}

        if res:
            base_text = self.clean_text_for_var(res['var_suffix'])
            type_suffix = self.get_element_type_suffix(cls, info['res_id'], info['is_password'])
            if base_text.endswith(f"_{type_suffix}"):
                final_variable_suffix = base_text
            else:
                final_variable_suffix = f"{base_text}_{type_suffix}"
            if not prefix or len(prefix) < 2: prefix = "page"
            v_name = f"${{selector_{prefix}_{final_variable_suffix}}}"

            full_xpath = elem.getroottree().getpath(elem)

            return {
                "coords": coords,
                "variable": v_name,
                "locator": res['locator'],
                "strategy": res['strategy'],
                "text": info["text"] or info["content_desc"] or "",
                "full_xpath": full_xpath
            }
        return None

    def estimate_page_name(self, tree, platform, win_width, win_height):
        possible_titles = [];
        header_limit = win_height * 0.30;
        center_x = win_width / 2;
        all_nodes = tree.xpath('//*')
        for elem in all_nodes:
            att = elem.attrib;
            text = "";
            res_id = ""
            if platform == "ANDROID":
                text = att.get("text") or att.get("content-desc") or "";
                res_id = att.get("resource-id", "").lower()
                bounds = self.parse_bounds_android(att.get("bounds"));
                if not bounds: continue
            else:
                text = att.get("label") or att.get("value") or att.get("name") or "";
                bounds = self.parse_bounds_ios(elem);
                if not bounds: continue
            y = bounds['y'];
            mid_x = bounds['x'] + (bounds['w'] / 2)
            if not text or len(text) < 2 or len(text) > 30: continue
            if text.replace(":", "").replace("%", "").isdigit(): continue
            if y > header_limit: continue
            score = 0;
            clean_id = res_id.lower()
            if "title" in clean_id: score += 20;
            if "header" in clean_id: score += 15;
            pos_score = (header_limit - y) / 20;
            score += pos_score;
            dist_from_center = abs(center_x - mid_x);
            if dist_from_center < (win_width * 0.15): score += 15
            if bounds['h'] > 30: score += 5
            possible_titles.append({"text": text, "score": score})
        if possible_titles:
            best = max(possible_titles, key=lambda x: x['score'])
            return self.clean_text_for_var(best['text'])
        return "page"

    def analyze(self, page_source, platform, should_verify, user_prefix, win_size):
        try:
            tree = etree.fromstring(page_source.encode('utf-8'))
        except:
            return {"error": "XML Parse Error"}

        detected_page_name = user_prefix
        if not user_prefix or user_prefix in ["page", "login"]:
            detected_page_name = self.estimate_page_name(tree, platform, win_size['width'], win_size['height'])

        all_elements = tree.xpath('//*');
        task_args = [];
        area_total = win_size['width'] * win_size['height']

        for idx, elem in enumerate(all_elements):
            if platform == "ANDROID":
                b = self.parse_bounds_android(elem.attrib.get("bounds"));
                if b and b['area'] > (area_total * 0.95): continue
            task_args.append((elem, tree, platform, should_verify, idx, detected_page_name))

        final_data = []
        for arg in task_args:
            res = self.process_single_element(arg)
            if res: final_data.append(res)

        return {
            "elements": final_data,
            "page_name": detected_page_name
        }