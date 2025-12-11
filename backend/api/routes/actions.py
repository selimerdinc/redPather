# backend/api/routes/actions.py

"""
Actions endpoint - Device interactions
"""
import logging
from flask import Blueprint, request, jsonify
from lxml import etree
from appium.webdriver.common.appiumby import AppiumBy

from backend.core.context import driver_mgr
from backend.core.exceptions import DriverError, ValidationError
from backend.api.middleware import create_error_response, create_success_response

# ✅ DÜZELTME: Doğru import path
from backend.api.services.page_analyzer import PageAnalyzer

logger = logging.getLogger(__name__)
actions_bp = Blueprint('actions', __name__)


@actions_bp.route('/tap', methods=['POST'])
def tap():
    """
    Perform SMART tap action on device

    Smart Tap Logic:
    1. iOS: Try RAW coordinates first (for Nav Mode point data)
    2. Android: Try SCALED coordinates (for pixel-based clicks)
    3. Fallback: Element-based tap if found in XML
    4. Last Resort: Blind coordinate tap
    """
    try:
        req = request.json or {}

        x = req.get('x')
        y = req.get('y')
        img_w = req.get('img_w')
        img_h = req.get('img_h')
        platform = req.get('platform', 'ANDROID')

        if x is None or y is None:
            raise ValidationError("Missing coordinates", "x and y coordinates are required")

        driver = driver_mgr.get_driver()
        if not driver:
            raise DriverError("Driver not active", f"Please start {platform} driver first")

        # Get device dimensions
        win_size = driver_mgr.get_window_size()
        device_w = win_size['width']
        device_h = win_size['height']

        if device_w == 0 or device_h == 0:
            raise DriverError("Invalid device dimensions", "Failed to get device window size")

        # --- COORDINATE CALCULATION STRATEGY ---
        # 1. Scaled (Pixel -> Point conversion): Usually for Android and "Image clicks"
        scale_x = device_w / img_w
        scale_y = device_h / img_h
        scaled_x = int(x * scale_x)
        scaled_y = int(y * scale_y)

        # 2. Raw (As-is): Usually for iOS and "Element data"
        raw_x = int(x)
        raw_y = int(y)

        # --- SMART TAP LOGIC ---
        source = driver_mgr.get_page_source()
        analyzer = PageAnalyzer(driver)

        element_clicked = False
        action_log = {}
        final_x, final_y = scaled_x, scaled_y  # Default to scaled (Android standard)

        if source:
            try:
                tree = etree.fromstring(source.encode('utf-8'))
                target_elem = None

                # STEP 1: Try Raw Point first (priority for iOS)
                if platform == 'IOS':
                    target_elem = analyzer.find_element_at_coords(tree, raw_x, raw_y, platform)
                    if target_elem is not None:
                        logger.info(f"📍 Smart Tap: Element found using RAW coordinates ({raw_x}, {raw_y})")
                        final_x, final_y = raw_x, raw_y

                # STEP 2: If not found, try Scaled Pixel (priority for Android)
                if target_elem is None:
                    target_elem = analyzer.find_element_at_coords(tree, scaled_x, scaled_y, platform)
                    if target_elem is not None:
                        logger.info(f"📍 Smart Tap: Element found using SCALED coordinates ({scaled_x}, {scaled_y})")
                        final_x, final_y = scaled_x, scaled_y

                # Element found? CLICK IT
                if target_elem is not None:
                    # Extract info
                    if platform == "ANDROID":
                        info = {
                            "res_id": target_elem.get("resource-id", ""),
                            "content_desc": target_elem.get("content-desc", ""),
                            "text": target_elem.get("text", ""),
                            "class_name": target_elem.get("class", ""),
                            "is_password": target_elem.get("password") == "true"
                        }
                    else:
                        info = {
                            "res_id": "",
                            "content_desc": target_elem.get("name", ""),
                            "text": target_elem.get("label") or target_elem.get("value", ""),
                            "class_name": target_elem.get("type", ""),
                            "is_password": "Secure" in str(target_elem.get("type", ""))
                        }

                    # Generate locator
                    best_locator = analyzer.get_best_locator(target_elem, tree, info, platform, False)

                    if best_locator:
                        locator_str = best_locator['locator']
                        logger.info(f"🎯 Smart Tap: Clicking element -> {locator_str}")

                        strategy, value = locator_str.split('=', 1)
                        strategy_map = {
                            'id': AppiumBy.ID,
                            'xpath': AppiumBy.XPATH,
                            'accessibility_id': AppiumBy.ACCESSIBILITY_ID,
                            'class_name': AppiumBy.CLASS_NAME,
                            'name': AppiumBy.NAME
                        }

                        by = strategy_map.get(strategy.lower())
                        if by:
                            logger.info(
                                f"🎯 Smart Tap: Element identified as {locator_str} but forcing coordinate tap for precision.")
                            success = driver_mgr.perform_tap(final_x, final_y)
                            if success:
                                element_clicked = True

                                action_log = {
                                    "type": "element_click",
                                    "locator": locator_str,
                                    "variable": best_locator.get('var_suffix', 'element'),
                                    "coords_used": "raw" if final_x == raw_x else "scaled"
                                }

            except Exception as e:
                logger.warning(f"Smart tap logic warning: {e}")

        # Element not found (or clicked on empty space)? COORDINATE TAP
        if not element_clicked:
            # Simple Heuristic: Use RAW for iOS if coordinates are within device bounds
            if platform == 'IOS' and x <= device_w and y <= device_h:
                final_x, final_y = raw_x, raw_y
            elif platform == 'IOS':
                final_x, final_y = scaled_x, scaled_y

            logger.info(f"👉 Blind Tap: Clicking at ({final_x}, {final_y})")
            success = driver_mgr.perform_tap(final_x, final_y)

            if not success:
                raise DriverError("Tap action failed", "Could not perform tap on device")

            action_log = {"type": "coordinate_tap", "x": final_x, "y": final_y}

        return jsonify(create_success_response(
            data={
                "tapped": True,
                "x": final_x,
                "y": final_y,
                "smart_action": action_log
            },
            message="Tap performed successfully"
        ))

    except (DriverError, ValidationError) as e:
        raise
    except Exception as e:
        logger.error(f"Tap action error: {e}", exc_info=True)
        return jsonify(create_error_response(
            "Tap action failed",
            str(e)
        )), 500


@actions_bp.route('/scroll', methods=['POST'])
def scroll():
    """Perform scroll action"""
    try:
        req = request.json or {}
        direction = req.get('direction', 'down')
        platform = req.get('platform', 'ANDROID')

        if direction not in ['up', 'down']:
            raise ValidationError("Invalid scroll direction", "Direction must be 'up' or 'down'")

        driver = driver_mgr.get_driver()
        if not driver:
            raise DriverError("Driver not active", f"Please start {platform} driver first")

        logger.info(f"Scrolling {direction} on {platform}")
        success = driver_mgr.perform_scroll(direction)

        if not success:
            raise DriverError("Scroll action failed", f"Could not scroll {direction}")

        return jsonify(create_success_response(
            data={"scrolled": direction},
            message=f"Scrolled {direction} successfully"
        ))

    except (DriverError, ValidationError) as e:
        raise
    except Exception as e:
        logger.error(f"Scroll action error: {e}", exc_info=True)
        return jsonify(create_error_response("Scroll action failed", str(e))), 500


@actions_bp.route('/back', methods=['POST'])
def back():
    """Perform back navigation"""
    try:
        driver = driver_mgr.get_driver()
        if not driver:
            raise DriverError("Driver not active", "Please start driver first")

        logger.info("Performing back navigation")
        success = driver_mgr.go_back()

        if not success:
            raise DriverError("Back action failed", "Could not perform back action")

        return jsonify(create_success_response(
            data={"back": True},
            message="Back navigation successful"
        ))

    except DriverError as e:
        raise
    except Exception as e:
        logger.error(f"Back action error: {e}", exc_info=True)
        return jsonify(create_error_response("Back action failed", str(e))), 500


@actions_bp.route('/hide-keyboard', methods=['POST'])
def hide_keyboard():
    """Hide on-screen keyboard"""
    try:
        driver = driver_mgr.get_driver()
        if not driver:
            raise DriverError("Driver not active", "Please start driver first")

        logger.info("Hiding keyboard")
        success = driver_mgr.hide_keyboard()

        return jsonify(create_success_response(
            data={"hidden": success},
            message="Keyboard hide attempted"
        ))

    except DriverError as e:
        raise
    except Exception as e:
        logger.error(f"Hide keyboard error: {e}", exc_info=True)
        return jsonify(create_error_response("Hide keyboard failed", str(e))), 500


@actions_bp.route('/verify', methods=['POST'])
def verify_locator():
    """Verify if a locator is valid and returns count"""
    try:
        req = request.json or {}
        locator = req.get('locator', '')

        if not locator:
            raise ValidationError("Missing locator", "Locator string is required")

        driver = driver_mgr.get_driver()
        if not driver:
            raise DriverError("Driver not active", "Please start driver first")

        if '=' not in locator:
            raise ValidationError("Invalid locator format", "Locator must be in format: strategy=value")

        strategy, value = locator.split('=', 1)
        strategy_map = {
            'id': AppiumBy.ID,
            'xpath': AppiumBy.XPATH,
            'accessibility_id': AppiumBy.ACCESSIBILITY_ID,
            'class_name': AppiumBy.CLASS_NAME,
            'name': AppiumBy.NAME
        }

        by = strategy_map.get(strategy.lower())
        if not by:
            raise ValidationError("Invalid locator strategy", f"Strategy '{strategy}' not supported.")

        try:
            elements = driver.find_elements(by, value)
            count = len(elements)
            valid = count > 0
            logger.info(f"Locator verification: {locator} -> Found {count} element(s)")

            return jsonify(create_success_response(
                data={"valid": valid, "count": count, "locator": locator},
                message=f"Found {count} element(s)"
            ))

        except Exception as e:
            logger.warning(f"Locator verification failed: {e}")
            return jsonify(create_success_response(
                data={"valid": False, "count": 0, "locator": locator, "error": str(e)},
                message="Locator verification failed"
            ))

    except (DriverError, ValidationError) as e:
        raise
    except Exception as e:
        logger.error(f"Verify locator error: {e}", exc_info=True)
        return jsonify(create_error_response("Verification failed", str(e))), 500