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

    def get_best_locator(self, elem, tree, attribs, platform, should_verify):
        candidates = []
        res_id = attribs.get("res_id");
        content_desc = attribs.get("content_desc");
        text = attribs.get("text")
        cls = attribs.get("class_name");
        is_password = attribs.get("is_password")
        is_input = "EditText" in str(cls) or "TextField" in str(cls) or "Secure" in str(cls)

        if platform == "ANDROID" and res_id:
            clean_id = res_id.split("/")[-1]
            candidates.append((AppiumBy.ID, clean_id, "RESOURCE_ID", clean_id))
            if "input" in clean_id or "field" in clean_id or "btn" in clean_id:
                candidates.append(
                    (AppiumBy.XPATH, f"//*[contains(@resource-id, '{clean_id}')]", "PARTIAL_ID", clean_id))

        if content_desc:
            tag_name = "CONTENT_DESC" if platform == "ANDROID" else "ACC_ID"
            candidates.append((AppiumBy.ACCESSIBILITY_ID, content_desc, tag_name, content_desc))

        if platform == "IOS":
            if text and not is_input:
                safe_txt = text.replace('"', '')
                chain = f'**/ {cls}[`label == "{safe_txt}" OR name == "{safe_txt}"`]'
                candidates.append((AppiumBy.IOS_CLASS_CHAIN, chain, "IOS_CHAIN", text))
            if content_desc:
                safe_desc = content_desc.replace('"', '')
                chain_desc = f'**/ {cls}[`name == "{safe_desc}"`]'
                candidates.append((AppiumBy.IOS_CLASS_CHAIN, chain_desc, "IOS_CHAIN", content_desc))

        rel = self.generate_relative_locator(elem, tree, platform)
        if rel: candidates.append(
            (AppiumBy.XPATH, rel["locator"].replace("xpath=", ""), "ANCHOR_XP", rel["var_suffix"]))

        if text and not is_input:
            s_txt = self.safe_xpath_val(text)
            xp = f"//*[contains(@text, {s_txt})]" if platform == "ANDROID" else f"//XCUIElementTypeStaticText[@name={s_txt}]"
            candidates.append((AppiumBy.XPATH, xp, "XPATH", text))

        if not should_verify and candidates:
            cand = candidates[0]
            suffix = cand[3] if len(cand) > 3 else (text or content_desc or "elem")
            strat_key = "xpath"
            if cand[0] == AppiumBy.ID:
                strat_key = "id"
            elif cand[0] == AppiumBy.ACCESSIBILITY_ID:
                strat_key = "accessibility_id"
            elif cand[0] == AppiumBy.IOS_CLASS_CHAIN:
                strat_key = "ios_class_chain"
            return {"locator": f"{strat_key}={cand[1]}", "var_suffix": suffix, "strategy": cand[2] + " (NV)"}

        best = None
        if should_verify and candidates:
            for item in candidates:
                by, val, strat = item[0], item[1], item[2]
                suffix_hint = item[3] if len(item) > 3 else (text or content_desc or "elem")
                search_val = attribs.get("res_id") if by == AppiumBy.ID and platform == "ANDROID" else val
                try:
                    elems = self.driver.find_elements(by=by, value=search_val)
                    if len(elems) == 1:
                        loc_prefix = "xpath"
                        if by == AppiumBy.ID:
                            loc_prefix = "id"
                        elif by == AppiumBy.ACCESSIBILITY_ID:
                            loc_prefix = "accessibility_id"
                        elif by == AppiumBy.IOS_CLASS_CHAIN:
                            loc_prefix = "ios_class_chain"
                        best = {"locator": f"{loc_prefix}={search_val}", "var_suffix": suffix_hint, "strategy": strat}
                        break
                except:
                    continue
        return best

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