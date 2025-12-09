"""
Actions endpoint - Device interactions
"""
import logging
from flask import Blueprint, request, jsonify

from backend.core.context import driver_mgr, config_mgr
from backend.core.exceptions import DriverError, ValidationError
from backend.api.middleware import create_error_response, create_success_response

logger = logging.getLogger(__name__)
actions_bp = Blueprint('actions', __name__)


@actions_bp.route('/tap', methods=['POST'])
def tap():
    """
    Perform tap action on device

    Request JSON:
        - x: int (tap x coordinate on device)
        - y: int (tap y coordinate on device)
        - img_w: int (screenshot width)
        - img_h: int (screenshot height)
        - platform: str

    Returns:
        JSON: Success/error response
    """
    try:
        req = request.json or {}

        x = req.get('x')
        y = req.get('y')
        img_w = req.get('img_w')
        img_h = req.get('img_h')
        platform = req.get('platform', 'ANDROID')

        # Validate inputs
        if x is None or y is None:
            raise ValidationError(
                "Missing coordinates",
                "x and y coordinates are required"
            )

        if img_w is None or img_h is None:
            raise ValidationError(
                "Missing dimensions",
                "Image dimensions (img_w, img_h) are required"
            )

        # Get device dimensions
        config = config_mgr.get_all()
        driver = driver_mgr.get_driver()

        if not driver:
            raise DriverError(
                "Driver not active",
                f"Please start {platform} driver first"
            )

        win_size = driver_mgr.get_window_size()
        device_w = win_size['width']
        device_h = win_size['height']

        if device_w == 0 or device_h == 0:
            raise DriverError(
                "Invalid device dimensions",
                "Failed to get device window size"
            )

        # Scale coordinates
        scale_x = device_w / img_w
        scale_y = device_h / img_h

        device_x = int(x * scale_x)
        device_y = int(y * scale_y)

        logger.info(f"Tapping at ({device_x}, {device_y}) on {platform}")

        # Perform tap
        success = driver_mgr.perform_tap(device_x, device_y)

        if not success:
            raise DriverError(
                "Tap action failed",
                "Could not perform tap on device"
            )

        return jsonify(create_success_response(
            data={"tapped": True, "x": device_x, "y": device_y},
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
    """
    Perform scroll action on device

    Request JSON:
        - direction: str ("up" or "down")
        - platform: str

    Returns:
        JSON: Success/error response
    """
    try:
        req = request.json or {}
        direction = req.get('direction', 'down')
        platform = req.get('platform', 'ANDROID')

        # Validate direction
        if direction not in ['up', 'down']:
            raise ValidationError(
                "Invalid scroll direction",
                "Direction must be 'up' or 'down'"
            )

        driver = driver_mgr.get_driver()
        if not driver:
            raise DriverError(
                "Driver not active",
                f"Please start {platform} driver first"
            )

        logger.info(f"Scrolling {direction} on {platform}")

        # Perform scroll
        success = driver_mgr.perform_scroll(direction)

        if not success:
            raise DriverError(
                "Scroll action failed",
                f"Could not scroll {direction}"
            )

        return jsonify(create_success_response(
            data={"scrolled": direction},
            message=f"Scrolled {direction} successfully"
        ))

    except (DriverError, ValidationError) as e:
        raise
    except Exception as e:
        logger.error(f"Scroll action error: {e}", exc_info=True)
        return jsonify(create_error_response(
            "Scroll action failed",
            str(e)
        )), 500


@actions_bp.route('/back', methods=['POST'])
def back():
    """
    Perform back navigation

    Returns:
        JSON: Success/error response
    """
    try:
        driver = driver_mgr.get_driver()

        if not driver:
            raise DriverError(
                "Driver not active",
                "Please start driver first"
            )

        logger.info("Performing back navigation")

        success = driver_mgr.go_back()

        if not success:
            raise DriverError(
                "Back navigation failed",
                "Could not perform back action"
            )

        return jsonify(create_success_response(
            data={"back": True},
            message="Back navigation successful"
        ))

    except DriverError as e:
        raise
    except Exception as e:
        logger.error(f"Back action error: {e}", exc_info=True)
        return jsonify(create_error_response(
            "Back action failed",
            str(e)
        )), 500


@actions_bp.route('/hide-keyboard', methods=['POST'])
def hide_keyboard():
    """
    Hide device keyboard

    Returns:
        JSON: Success/error response
    """
    try:
        driver = driver_mgr.get_driver()

        if not driver:
            raise DriverError(
                "Driver not active",
                "Please start driver first"
            )

        logger.info("Hiding keyboard")

        success = driver_mgr.hide_keyboard()

        if not success:
            logger.warning("Keyboard hide attempt failed (may not be visible)")

        return jsonify(create_success_response(
            data={"hidden": success},
            message="Keyboard hide attempted"
        ))

    except DriverError as e:
        raise
    except Exception as e:
        logger.error(f"Hide keyboard error: {e}", exc_info=True)
        return jsonify(create_error_response(
            "Hide keyboard failed",
            str(e)
        )), 500


@actions_bp.route('/verify', methods=['POST'])
def verify_locator():
    """
    Verify if locator finds element(s)

    Request JSON:
        - locator: str (e.g., "id=com.example:id/button")

    Returns:
        JSON: Verification result with element count
    """
    try:
        req = request.json or {}
        locator = req.get('locator', '')

        if not locator:
            raise ValidationError(
                "Missing locator",
                "Locator string is required"
            )

        driver = driver_mgr.get_driver()

        if not driver:
            raise DriverError(
                "Driver not active",
                "Please start driver first"
            )

        # Parse locator
        if '=' not in locator:
            raise ValidationError(
                "Invalid locator format",
                "Locator must be in format: strategy=value"
            )

        strategy, value = locator.split('=', 1)

        # Import AppiumBy for locator strategies
        from appium.webdriver.common.appiumby import AppiumBy

        # Map strategy to AppiumBy constant
        strategy_map = {
            'id': AppiumBy.ID,
            'xpath': AppiumBy.XPATH,
            'accessibility_id': AppiumBy.ACCESSIBILITY_ID,
            'class_name': AppiumBy.CLASS_NAME,
            'name': AppiumBy.NAME
        }

        by = strategy_map.get(strategy.lower())

        if not by:
            raise ValidationError(
                "Invalid locator strategy",
                f"Strategy '{strategy}' not supported. Use: {', '.join(strategy_map.keys())}"
            )

        # Find elements
        try:
            elements = driver.find_elements(by, value)
            count = len(elements)
            valid = count > 0

            logger.info(f"Locator verification: {locator} -> Found {count} element(s)")

            return jsonify(create_success_response(
                data={
                    "valid": valid,
                    "count": count,
                    "locator": locator
                },
                message=f"Found {count} element(s)"
            ))

        except Exception as e:
            logger.warning(f"Locator verification failed: {e}")
            return jsonify(create_success_response(
                data={
                    "valid": False,
                    "count": 0,
                    "locator": locator,
                    "error": str(e)
                },
                message="Locator verification failed"
            ))

    except (DriverError, ValidationError) as e:
        raise
    except Exception as e:
        logger.error(f"Verify locator error: {e}", exc_info=True)
        return jsonify(create_error_response(
            "Verification failed",
            str(e)
        )), 500