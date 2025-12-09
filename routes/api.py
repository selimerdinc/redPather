import concurrent.futures
import hashlib

from flask import Blueprint, jsonify, request, render_template
from services.context import driver_mgr, config_mgr
from services.page_analyzer import PageAnalyzer
from appium.webdriver.common.appiumby import AppiumBy

api_bp = Blueprint('api', __name__)


@api_bp.route('/')
def index():
    return render_template('index.html')


@api_bp.route('/config', methods=['GET', 'POST'])
def handle_config():
    if request.method == 'GET':
        return jsonify(config_mgr.get_all())
    if request.method == 'POST':
        updated = config_mgr.update(request.json)
        driver_mgr.quit_driver()
        return jsonify({"status": "success", "config": updated})


screenshot_cache = {}


@api_bp.route('/scan', methods=['POST'])
def scan():
    try:
        req = request.json
        platform = req.get("platform", "ANDROID")
        verify = req.get("verify", True)
        prefix = req.get("prefix", "").strip().lower()

        driver = driver_mgr.start_driver(platform)

        # ✅ Screenshot cache kontrolü
        source = driver.page_source
        source_hash = hashlib.md5(source.encode()).hexdigest()

        if source_hash in screenshot_cache:
            optimized_image = screenshot_cache[source_hash]
            print("📸 Using cached screenshot")
        else:
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future_shot = executor.submit(driver.get_screenshot_as_base64)
                future_win = executor.submit(driver_mgr.get_window_size)

                raw_screenshot = future_shot.result()
                win_size = future_win.result()

            analyzer = PageAnalyzer(driver)
            optimized_image = analyzer.optimize_image(raw_screenshot)
            screenshot_cache[source_hash] = optimized_image

            # Cache boyutu kontrolü (max 10 screenshot)
            if len(screenshot_cache) > 10:
                screenshot_cache.pop(next(iter(screenshot_cache)))

        win_size = driver_mgr.get_window_size()
        analyzer = PageAnalyzer(driver)
        result = analyzer.analyze(source, platform, verify, prefix, win_size)

        if "error" in result:
            return jsonify({"status": "error", "message": result["error"]})

        return jsonify({
            "status": "success",
            "image": optimized_image,
            "elements": result['elements'],
            "page_name": result['page_name'],
            "window_w": win_size['width'],
            "window_h": win_size['height'],
            "raw_source": source
        })

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@api_bp.route('/tap', methods=['POST'])
def tap():
    try:
        req = request.json
        target_platform = req.get('platform', 'ANDROID')

        if not driver_mgr.is_active() or driver_mgr.platform != target_platform:
            driver_mgr.start_driver(target_platform)

        x = float(req.get('x'))
        y = float(req.get('y'))
        img_w = float(req.get('img_w', 0))
        img_h = float(req.get('img_h', 0))

        win = driver_mgr.get_window_size()

        if img_w > 0:
            target_x = int(win['width'] * (x / img_w))
            target_y = int(win['height'] * (y / img_h))
        else:
            target_x, target_y = int(x), int(y)

        driver_mgr.perform_tap(target_x, target_y)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@api_bp.route('/scroll', methods=['POST'])
def scroll():
    try:
        req = request.json
        target_platform = req.get('platform', 'ANDROID')

        if not driver_mgr.is_active() or driver_mgr.platform != target_platform:
            driver_mgr.start_driver(target_platform)

        direction = req.get('direction', 'down')
        driver_mgr.perform_scroll(direction)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@api_bp.route('/action/back', methods=['POST'])
def back():
    try:
        driver_mgr.go_back()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@api_bp.route('/action/hide_keyboard', methods=['POST'])
def hide_kb():
    try:
        driver_mgr.hide_keyboard()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@api_bp.route('/verify', methods=['POST'])
def verify_locator():
    try:
        driver = driver_mgr.get_driver()
        if not driver: return jsonify({"status": "error", "message": "No Driver"})

        req = request.json
        loc = req.get('locator', '')

        strat, val = loc.split("=", 1)
        by = AppiumBy.XPATH
        if strat == "id":
            by = AppiumBy.ID
        elif strat == "accessibility_id":
            by = AppiumBy.ACCESSIBILITY_ID
        elif strat == "ios_class_chain":
            by = AppiumBy.IOS_CLASS_CHAIN

        driver.implicitly_wait(1)
        elems = driver.find_elements(by=by, value=val)
        driver.implicitly_wait(10)

        return jsonify({"status": "success", "valid": len(elems) == 1, "count": len(elems)})
    except Exception as e:
        return jsonify({"status": "error", "valid": False, "msg": str(e)})