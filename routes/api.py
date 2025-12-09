import concurrent.futures
import hashlib
import logging
from typing import Dict, Any

from flask import Blueprint, jsonify, request, render_template
from services.context import driver_mgr, config_mgr
from services.page_analyzer import PageAnalyzer
from appium.webdriver.common.appiumby import AppiumBy

logger = logging.getLogger(__name__)

api_bp = Blueprint('api', __name__)

# Global cache
screenshot_cache: Dict[str, str] = {}
MAX_CACHE_SIZE = 10


def create_error_response(message: str, details: str = None) -> Dict[str, Any]:
    """
    Create standardized error response

    Args:
        message: User-friendly error message
        details: Technical details (optional)

    Returns:
        dict: Error response
    """
    response = {
        "status": "error",
        "message": message
    }
    if details:
        response["details"] = details
    return response


def create_success_response(data: Dict[str, Any] = None, message: str = None) -> Dict[str, Any]:
    """
    Create standardized success response

    Args:
        data: Response data
        message: Success message

    Returns:
        dict: Success response
    """
    response = {"status": "success"}
    if data:
        response.update(data)
    if message:
        response["message"] = message
    return response


@api_bp.route('/')
def index():
    """Render main page"""
    return render_template('index.html')


@api_bp.route('/config', methods=['GET', 'POST'])
def handle_config():
    """
    Handle configuration GET/POST

    GET: Return current configuration
    POST: Update configuration
    """
    try:
        if request.method == 'GET':
            config = config_mgr.get_all()
            return jsonify(create_success_response(data=config))

        if request.method == 'POST':
            if not request.json:
                return jsonify(create_error_response("No configuration data provided")), 400

            updated = config_mgr.update(request.json)

            # Close active drivers to apply new config
            driver_mgr.quit_driver()

            logger.info("Configuration updated and drivers restarted")
            return jsonify(create_success_response(
                data={"config": updated},
                message="Configuration updated successfully"
            ))

    except Exception as e:
        logger.error(f"Config handler error: {e}", exc_info=True)
        return jsonify(create_error_response(
            "Failed to handle configuration",
            str(e)
        )), 500


@api_bp.route('/scan', methods=['POST'])
def scan():
    """
    Scan current screen and detect elements

    Request JSON:
        - platform: "ANDROID" or "IOS"
        - verify: bool (verify locators)
        - prefix: str (page name prefix)

    Returns:
        JSON with screenshot, elements, page_name
    """
    try:
        req = request.json or {}
        platform = req.get("platform", "ANDROID")
        verify = req.get("verify", True)
        prefix = req.get("prefix", "").strip().lower()

        # Validate platform
        if platform not in ["ANDROID", "IOS"]:
            return jsonify(create_error_response(
                f"Invalid platform: {platform}. Must be 'ANDROID' or 'IOS'"
            )), 400

        # Validate config before starting driver
        config = config_mgr.get_all()
        is_valid, error_msg = config_mgr.validate_config(config, platform)

        if not is_valid:
            return jsonify(create_error_response(
                f"Invalid {platform} configuration",
                error_msg
            )), 400

        # Start driver
        try:
            driver = driver_mgr.start_driver(platform)
        except Exception as e:
            logger.error(f"Driver start failed: {e}")
            return jsonify(create_error_response(
                f"Failed to connect to {platform} device",
                f"Make sure Appium server is running and device is connected. Details: {str(e)}"
            )), 500

        # Get page source
        source = driver_mgr.get_page_source()
        if not source:
            return jsonify(create_error_response(
                "Failed to get page source",
                "Device might be locked or app is not running"
            )), 500

        # Check screenshot cache
        source_hash = hashlib.md5(source.encode()).hexdigest()

        if source_hash in screenshot_cache:
            optimized_image = screenshot_cache[source_hash]
            logger.info("📸 Using cached screenshot")
        else:
            # Take screenshot and get window size concurrently
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future_shot = executor.submit(driver_mgr.take_screenshot)
                future_win = executor.submit(driver_mgr.get_window_size)

                raw_screenshot = future_shot.result()
                if not raw_screenshot:
                    return jsonify(create_error_response(
                        "Failed to capture screenshot",
                        "Screen might be locked or device disconnected"
                    )), 500

                win_size = future_win.result()

            # Optimize image
            analyzer = PageAnalyzer(driver)
            optimized_image = analyzer.optimize_image(raw_screenshot)

            # Update cache
            screenshot_cache[source_hash] = optimized_image

            # Limit cache size
            if len(screenshot_cache) > MAX_CACHE_SIZE:
                screenshot_cache.pop(next(iter(screenshot_cache)))

            logger.info("📸 Screenshot captured and cached")

        # Get window size
        win_size = driver_mgr.get_window_size()
        if win_size['width'] == 0 or win_size['height'] == 0:
            return jsonify(create_error_response(
                "Failed to get window size",
                "Device might be in an invalid state"
            )), 500

        # Analyze page
        analyzer = PageAnalyzer(driver)
        result = analyzer.analyze(source, platform, verify, prefix, win_size)

        if "error" in result:
            return jsonify(create_error_response(
                "Page analysis failed",
                result["error"]
            )), 500

        logger.info(f"✅ Scan complete: {len(result['elements'])} elements found")

        return jsonify(create_success_response(data={
            "image": optimized_image,
            "elements": result['elements'],
            "page_name": result['page_name'],
            "window_w": win_size['width'],
            "window_h": win_size['height'],
            "raw_source": source
        }))

    except Exception as e:
        logger.error(f"Scan error: {e}", exc_info=True)
        return jsonify(create_error_response(
            "Unexpected error during scan",
            str(e)
        )), 500


@api_bp.route('/tap', methods=['POST'])
def tap():
    """
    Perform tap at coordinates

    Request JSON:
        - x, y: Coordinates (on image)
        - img_w, img_h: Image dimensions
        - platform: Platform name

    Returns:
        Success/error status
    """
    try:
        req = request.json or {}
        target_platform = req.get('platform', 'ANDROID')

        # Validate required parameters
        if 'x' not in req or 'y' not in req:
            return jsonify(create_error_response(
                "Missing coordinates",
                "Both 'x' and 'y' are required"
            )), 400

        try:
            x = float(req.get('x'))
            y = float(req.get('y'))
            img_w = float(req.get('img_w', 0))
            img_h = float(req.get('img_h', 0))
        except (ValueError, TypeError) as e:
            return jsonify(create_error_response(
                "Invalid coordinates",
                f"Coordinates must be numbers: {e}"
            )), 400

        # Ensure correct driver
        if not driver_mgr.is_active() or driver_mgr.platform != target_platform:
            try:
                driver_mgr.start_driver(target_platform)
            except Exception as e:
                return jsonify(create_error_response(
                    f"Failed to start {target_platform} driver",
                    str(e)
                )), 500

        # Calculate target coordinates
        win = driver_mgr.get_window_size()

        if img_w > 0 and img_h > 0:
            target_x = int(win['width'] * (x / img_w))
            target_y = int(win['height'] * (y / img_h))
        else:
            target_x, target_y = int(x), int(y)

        # Perform tap
        success = driver_mgr.perform_tap(target_x, target_y)

        if success:
            return jsonify(create_success_response(
                message=f"Tapped at ({target_x}, {target_y})"
            ))
        else:
            return jsonify(create_error_response(
                "Tap action failed",
                "Check device logs for details"
            )), 500

    except Exception as e:
        logger.error(f"Tap error: {e}", exc_info=True)
        return jsonify(create_error_response(
            "Unexpected error during tap",
            str(e)
        )), 500


@api_bp.route('/scroll', methods=['POST'])
def scroll():
    """
    Perform scroll action

    Request JSON:
        - direction: "up" or "down"
        - platform: Platform name

    Returns:
        Success/error status
    """
    try:
        req = request.json or {}
        target_platform = req.get('platform', 'ANDROID')
        direction = req.get('direction', 'down')

        # Validate direction
        if direction not in ['up', 'down']:
            return jsonify(create_error_response(
                f"Invalid direction: {direction}",
                "Direction must be 'up' or 'down'"
            )), 400

        # Ensure correct driver
        if not driver_mgr.is_active() or driver_mgr.platform != target_platform:
            try:
                driver_mgr.start_driver(target_platform)
            except Exception as e:
                return jsonify(create_error_response(
                    f"Failed to start {target_platform} driver",
                    str(e)
                )), 500

        # Perform scroll
        success = driver_mgr.perform_scroll(direction)

        if success:
            return jsonify(create_success_response(
                message=f"Scrolled {direction}"
            ))
        else:
            return jsonify(create_error_response(
                "Scroll action failed",
                "Check device logs for details"
            )), 500

    except Exception as e:
        logger.error(f"Scroll error: {e}", exc_info=True)
        return jsonify(create_error_response(
            "Unexpected error during scroll",
            str(e)
        )), 500


@api_bp.route('/action/back', methods=['POST'])
def back():
    """
    Perform back navigation

    Returns:
        Success/error status
    """
    try:
        if not driver_mgr.is_active():
            return jsonify(create_error_response(
                "No active driver",
                "Please scan a screen first"
            )), 400

        success = driver_mgr.go_back()

        if success:
            return jsonify(create_success_response(message="Back navigation completed"))
        else:
            return jsonify(create_error_response(
                "Back navigation failed",
                "Check device logs for details"
            )), 500

    except Exception as e:
        logger.error(f"Back error: {e}", exc_info=True)
        return jsonify(create_error_response(
            "Unexpected error during back navigation",
            str(e)
        )), 500


@api_bp.route('/action/hide_keyboard', methods=['POST'])
def hide_kb():
    """
    Hide on-screen keyboard

    Returns:
        Success/error status
    """
    try:
        if not driver_mgr.is_active():
            return jsonify(create_error_response(
                "No active driver",
                "Please scan a screen first"
            )), 400

        success = driver_mgr.hide_keyboard()

        if success:
            return jsonify(create_success_response(message="Keyboard hidden"))
        else:
            # Keyboard might not be visible, don't treat as error
            return jsonify(create_success_response(message="Keyboard not visible or already hidden"))

    except Exception as e:
        logger.error(f"Hide keyboard error: {e}", exc_info=True)
        return jsonify(create_error_response(
            "Unexpected error hiding keyboard",
            str(e)
        )), 500


@api_bp.route('/verify', methods=['POST'])
def verify_locator():
    """
    Verify if locator finds exactly one element

    Request JSON:
        - locator: Locator string (format: "type=value")

    Returns:
        Validation result with count
    """
    try:
        driver = driver_mgr.get_driver()
        if not driver:
            return jsonify(create_error_response(
                "No active driver",
                "Please scan a screen first"
            )), 400

        req = request.json or {}
        locator = req.get('locator', '')

        if not locator or '=' not in locator:
            return jsonify(create_error_response(
                "Invalid locator format",
                "Locator must be in format 'type=value' (e.g., 'id=button1')"
            )), 400

        try:
            strat, val = locator.split("=", 1)
        except ValueError:
            return jsonify(create_error_response(
                "Invalid locator format",
                "Locator must contain '=' separator"
            )), 400

        # Map strategy to AppiumBy
        by = AppiumBy.XPATH
        strat_lower = strat.lower().strip()

        if strat_lower == "id":
            by = AppiumBy.ID
        elif strat_lower in ["accessibility_id", "accessibility id"]:
            by = AppiumBy.ACCESSIBILITY_ID
        elif strat_lower == "ios_class_chain":
            by = AppiumBy.IOS_CLASS_CHAIN
        elif strat_lower == "xpath":
            by = AppiumBy.XPATH

        # Find elements with short timeout
        driver.implicitly_wait(1)
        try:
            elems = driver.find_elements(by=by, value=val)
            count = len(elems)
            is_valid = count == 1
        finally:
            driver.implicitly_wait(10)  # Restore default

        logger.info(f"Locator verification: {locator} -> {count} element(s)")

        return jsonify(create_success_response(data={
            "valid": is_valid,
            "count": count,
            "message": f"Found {count} element(s)"
        }))

    except Exception as e:
        logger.error(f"Verify error: {e}", exc_info=True)
        return jsonify(create_error_response(
            "Locator verification failed",
            str(e)
        )), 500


@api_bp.route('/health', methods=['GET'])
def health_check():
    """
    Health check endpoint

    Returns:
        System status
    """
    try:
        status = {
            "server": "running",
            "drivers": {
                "android": driver_mgr.is_active("ANDROID"),
                "ios": driver_mgr.is_active("IOS")
            },
            "active_platform": driver_mgr.platform,
            "cache_size": len(screenshot_cache)
        }

        return jsonify(create_success_response(data=status))

    except Exception as e:
        logger.error(f"Health check error: {e}")
        return jsonify(create_error_response(
            "Health check failed",
            str(e)
        )), 500