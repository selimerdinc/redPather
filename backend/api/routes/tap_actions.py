"""
Tap Actions - Smart Tap and Verify Locator
Extracted from actions.py for modularity and testability.
"""
import logging
from flask import Blueprint, request, jsonify
from lxml import etree
from appium.webdriver.common.appiumby import AppiumBy

from backend.core.context import driver_mgr, cache_mgr, gemini_service
from backend.core.exceptions import DriverError, ValidationError
from backend.core.constants import STRATEGY_MAP
from backend.api.middleware import create_error_response, create_success_response
from backend.api.services.page_analyzer import PageAnalyzer
from backend.api.services.crash_detector import crash_detector

logger = logging.getLogger(__name__)
tap_bp = Blueprint('tap', __name__)


def _extract_element_info(elem, platform: str) -> dict:
    """Extract element info from XML element."""
    if platform == "ANDROID":
        return {
            "res_id": elem.get("resource-id", ""),
            "content_desc": elem.get("content-desc", ""),
            "text": elem.get("text", ""),
            "class_name": elem.get("class", ""),
            "is_password": elem.get("password") == "true"
        }
    else:
        return {
            "res_id": "",
            "content_desc": elem.get("name", ""),
            "text": elem.get("label") or elem.get("value", ""),
            "class_name": elem.get("type", ""),
            "is_password": "Secure" in str(elem.get("type", ""))
        }


@tap_bp.route('/tap', methods=['POST'])
def tap():
    """
    Perform SMART tap action on device.
    Uses cached XML source if available for faster execution.
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

        # Calculate coordinates
        scale_x = device_w / img_w
        scale_y = device_h / img_h
        scaled_x = int(x * scale_x)
        scaled_y = int(y * scale_y)
        raw_x = int(x)
        raw_y = int(y)

        # Smart tap logic
        cached_data = cache_mgr.get_last_scan()
        source = cached_data["source"] if cached_data else driver_mgr.get_page_source()

        analyzer = PageAnalyzer(driver)
        element_clicked = False
        action_log = {}
        final_x, final_y = scaled_x, scaled_y

        if source:
            try:
                tree = etree.fromstring(source.encode('utf-8'))
                target_elem = None

                # iOS: Try raw coordinates first
                if platform == 'IOS':
                    target_elem = analyzer.find_element_at_coords(tree, raw_x, raw_y, platform)
                    if target_elem is not None:
                        logger.info(f"📍 Smart Tap: Element found at RAW ({raw_x}, {raw_y})")
                        final_x, final_y = raw_x, raw_y

                # Try scaled coordinates
                if target_elem is None:
                    target_elem = analyzer.find_element_at_coords(tree, scaled_x, scaled_y, platform)
                    if target_elem is not None:
                        logger.info(f"📍 Smart Tap: Element found at SCALED ({scaled_x}, {scaled_y})")
                        final_x, final_y = scaled_x, scaled_y

                # Click if element found
                if target_elem is not None:
                    info = _extract_element_info(target_elem, platform)
                    best_locator = analyzer.get_best_locator(target_elem, tree, info, platform, False)

                    if best_locator:
                        locator_str = best_locator['locator']
                        logger.info(f"🎯 Smart Tap: Clicking element -> {locator_str}")

                        action_log = {
                            "type": "element_click",
                            "locator": locator_str,
                            "variable": best_locator.get('var_suffix', 'element'),
                            "coords_used": "raw" if final_x == raw_x else "scaled"
                        }

                        success = driver_mgr.perform_tap(final_x, final_y)
                        if success:
                            element_clicked = True

            except Exception as e:
                logger.warning(f"Smart tap logic warning: {e}")

        # Blind tap fallback
        if not element_clicked:
            final_x, final_y = scaled_x, scaled_y
            logger.info(f"👉 Blind Tap: Clicking at ({final_x}, {final_y})")
            success = driver_mgr.perform_tap(final_x, final_y)

            if not success:
                raise DriverError("Tap action failed", "Could not perform tap on device")

            action_log = {"type": "coordinate_tap", "x": final_x, "y": final_y}

        crash_detector.add_action("tap", {"x": final_x, "y": final_y, "smart_action": action_log})

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
        return jsonify(create_error_response("Tap action failed", str(e))), 500


@tap_bp.route('/verify', methods=['POST'])
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
        by = STRATEGY_MAP.get(strategy.lower())
        
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
            
            # AI healing suggestion
            suggestion = None
            if gemini_service.is_ready():
                try:
                    logger.info("🩹 Verify failed. Asking AI for suggestion...")
                    screenshot = driver.get_screenshot_as_png()
                    xml_source = driver.page_source
                    heal_res = gemini_service.heal_locator(screenshot, xml_source, locator)
                    if heal_res and heal_res.get('status') == 'healed':
                        suggestion = heal_res.get('new_locator')
                except Exception as heal_err:
                    logger.debug(f"AI heal attempt failed: {heal_err}")

            return jsonify(create_success_response(
                data={
                    "valid": False,
                    "count": 0,
                    "locator": locator,
                    "error": str(e),
                    "suggestion": suggestion
                },
                message="Locator verification failed"
            ))

    except (DriverError, ValidationError) as e:
        raise
    except Exception as e:
        logger.error(f"Verify locator error: {e}", exc_info=True)
        return jsonify(create_error_response("Verification failed", str(e))), 500
