"""
Input Actions - Send Keys, Get Text
Extracted from actions.py for modularity and testability.
"""
import logging
import time
import subprocess
import shlex
from flask import Blueprint, request, jsonify
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from backend.core.context import driver_mgr, gemini_service
from backend.core.exceptions import DriverError, ValidationError
from backend.api.middleware import create_error_response, create_success_response
from backend.api.services.crash_detector import crash_detector

logger = logging.getLogger(__name__)
input_bp = Blueprint('input', __name__)

# Locator strategy mapping
STRATEGY_MAP = {
    'id': AppiumBy.ID,
    'xpath': AppiumBy.XPATH,
    'accessibility_id': AppiumBy.ACCESSIBILITY_ID,
    'name': AppiumBy.NAME,
    'class_name': AppiumBy.CLASS_NAME
}


def _parse_locator(locator: str) -> tuple:
    """Parse locator string into strategy and value."""
    if '=' in locator:
        strategy, value = locator.split('=', 1)
    else:
        strategy, value = 'xpath', locator
    
    by = STRATEGY_MAP.get(strategy.lower(), AppiumBy.XPATH)
    return by, value


def _find_element_with_healing(driver, locator: str, timeout: int = 5):
    """
    Find element with AI healing fallback.
    Returns (element, healed_info) tuple.
    """
    by, value = _parse_locator(locator)
    
    try:
        element = WebDriverWait(driver, timeout).until(
            EC.visibility_of_element_located((by, value))
        )
        return element, None
    except Exception:
        pass
    
    # AI Healing attempt
    if gemini_service.is_ready():
        try:
            logger.warning(f"🩹 Element not found, trying AI healing: {locator}")
            screenshot = driver.get_screenshot_as_png()
            xml_source = driver.page_source
            
            heal_res = gemini_service.heal_locator(screenshot, xml_source, locator)
            
            if heal_res and heal_res.get('status') == 'healed':
                new_loc = heal_res.get('new_locator')
                logger.info(f"✨ AI Healing success: {new_loc}")
                
                new_by, new_val = _parse_locator(new_loc)
                try:
                    element = driver.find_element(new_by, new_val)
                    return element, {
                        "healed": True,
                        "old_locator": locator,
                        "new_locator": new_loc,
                        "reason": heal_res.get('reason'),
                        "explanation": heal_res.get('explanation')
                    }
                except Exception:
                    pass
        except Exception as heal_err:
            logger.debug(f"AI healing failed: {heal_err}")
    
    # Direct find attempt
    try:
        element = driver.find_element(by, value)
        return element, None
    except Exception:
        pass
    
    return None, None


@input_bp.route('/send-keys', methods=['POST'])
def send_keys():
    """Send text to element"""
    try:
        req = request.json or {}
        text = req.get('text')
        locator = req.get('locator')

        if text is None:
            raise ValidationError("Missing text", "Text value is required")

        driver = driver_mgr.get_driver()
        if not driver:
            raise DriverError("Driver not active", "Please start driver first")

        platform = driver_mgr.get_platform()
        element = None
        healed_info = None

        if locator:
            element, healed_info = _find_element_with_healing(driver, locator)
            
            if healed_info:
                # Healed element - perform action and return
                element.click()
                element.send_keys(text)
                crash_detector.add_action("send_keys", {"text": text, "locator": healed_info["new_locator"]})
                return jsonify(create_success_response(
                    data={
                        "sent": True,
                        "text": text,
                        "method": "ai_healed",
                        **healed_info
                    },
                    message="AI successfully healed the locator and performed action"
                ))

        # Fallback to active element
        if not element:
            logger.info("⌨️ Sending keys to active element")
            try:
                element = driver.switch_to.active_element
            except Exception as active_err:
                logger.debug(f"Could not get active element: {active_err}")

        if element:
            return _send_keys_to_element(driver, element, text, platform)

        raise DriverError("No element found", "Could not find element to send keys to")

    except (DriverError, ValidationError) as e:
        raise
    except Exception as e:
        logger.error(f"Send keys error: {e}", exc_info=True)
        return jsonify(create_error_response("Input action failed", str(e))), 500


def _send_keys_to_element(driver, element, text: str, platform: str):
    """Perform send keys operation on element."""
    try:
        # Step 1: Tap center of element
        try:
            location = element.location
            size = element.size
            center_x = location['x'] + size['width'] / 2
            center_y = location['y'] + size['height'] / 2
            driver.tap([(center_x, center_y)])
            logger.info(f"📍 Tapped at center: ({center_x}, {center_y})")
            time.sleep(1.0)
        except Exception as tap_err:
            logger.debug(f"Center tap failed, using click: {tap_err}")
            element.click()
            time.sleep(0.5)

        # Step 2: Clear existing text
        try:
            element.clear()
        except Exception as clear_err:
            logger.debug(f"Clear failed: {clear_err}")

        # Step 3: Send keys with fallback strategies
        method_used = "hybrid"
        
        try:
            # ✅ GÜVENLĐK: Şifre alanlarına gönderilen veriyi loglama
            log_text = "***" if any(k in text.lower() for k in ["password", "sifre", "pin", "token"]) else text
            element.send_keys(text)
            logger.info(f"✅ Text sent via send_keys: {log_text}")
        except Exception as sk_err:
            logger.warning(f"send_keys failed: {sk_err}")
            
            # iOS keyboard fallback
            if platform == "IOS":
                try:
                    driver.execute_script("mobile: type", {"text": text})
                    method_used = "ios_keyboard"
                    logger.info("✅ Text sent via iOS keyboard")
                except Exception as ios_err:
                    logger.error(f"iOS keyboard failed: {ios_err}")
                    raise DriverError("Input failed", str(ios_err))
            
            # Android ADB fallback
            elif platform == "ANDROID":
                try:
                    # ✅ GÜVENLĐK: ADB shell injection'ı önlemek için shlex.quote kullan
                    # ADB input text komutu özel kaçış karakterleri ister
                    quoted_text = shlex.quote(text).replace(" ", "%s")
                    result = subprocess.run(
                        ["adb", "shell", "input", "text", quoted_text],
                        capture_output=True, text=True, timeout=10
                    )
                    if result.returncode == 0:
                        method_used = "adb"
                        logger.info("✅ Text sent via ADB")
                    else:
                        raise Exception(result.stderr)
                except Exception as adb_err:
                    logger.error(f"ADB failed: {adb_err}")
                    raise DriverError("Input failed", str(adb_err))

        crash_detector.add_action("send_keys", {"text": text, "method": method_used})
        
        return jsonify(create_success_response(
            data={"sent": True, "text": text, "method": method_used},
            message="Text sent successfully"
        ))

    except Exception as e:
        raise DriverError("Direct input failed", str(e))


@input_bp.route('/get-text', methods=['POST'])
def get_element_text():
    """Get element text for verification"""
    try:
        req = request.json or {}
        locator = req.get('locator')

        if not locator:
            raise ValidationError("Missing locator", "Locator is required")

        driver = driver_mgr.get_driver()
        if not driver:
            raise DriverError("Driver not active", "Please start driver first")

        by, value = _parse_locator(locator)

        try:
            element = driver.find_element(by, value)
            text = element.text
            
            # Android fallback
            if not text and driver_mgr.platform == 'ANDROID':
                text = element.get_attribute('content-desc') or ""

            return jsonify(create_success_response(
                data={"text": text},
                message="Text retrieved"
            ))
        except Exception as e:
            raise DriverError("Element not found", str(e))

    except (DriverError, ValidationError) as e:
        raise
    except Exception as e:
        logger.error(f"Get text error: {e}")
        return jsonify(create_error_response("Failed to get text", str(e))), 500
