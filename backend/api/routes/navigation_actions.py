"""
Navigation Actions - Scroll, Back, Hide Keyboard
Extracted from actions.py for modularity and testability.
"""
import logging
from flask import Blueprint, request, jsonify

from backend.core.context import driver_mgr
from backend.core.exceptions import DriverError, ValidationError
from backend.api.middleware import create_error_response, create_success_response
from backend.api.services.crash_detector import crash_detector

logger = logging.getLogger(__name__)
navigation_bp = Blueprint('navigation', __name__)


@navigation_bp.route('/scroll', methods=['POST'])
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

        if success:
            crash_detector.add_action("scroll", {"direction": direction})
            
            return jsonify(create_success_response(
                data={"scrolled": direction},
                message=f"Scrolled {direction} successfully"
            ))

    except (DriverError, ValidationError) as e:
        raise
    except Exception as e:
        logger.error(f"Scroll action error: {e}", exc_info=True)
        return jsonify(create_error_response("Scroll action failed", str(e))), 500


@navigation_bp.route('/back', methods=['POST'])
def back():
    """Perform back navigation"""
    try:
        driver = driver_mgr.get_driver()
        if not driver:
            raise DriverError("Driver not active", "Please start driver first")

        logger.info("Performing back navigation")
        success = driver_mgr.go_back()

        if success:
            crash_detector.add_action("back", {})
            
            return jsonify(create_success_response(
                data={"back": True},
                message="Back navigation successful"
            ))

    except DriverError as e:
        raise
    except Exception as e:
        logger.error(f"Back action error: {e}", exc_info=True)
        return jsonify(create_error_response("Back action failed", str(e))), 500


@navigation_bp.route('/hide-keyboard', methods=['POST'])
def hide_keyboard():
    """Hide on-screen keyboard"""
    try:
        driver = driver_mgr.get_driver()
        if not driver:
            raise DriverError("Driver not active", "Please start driver first")

        logger.info("Hiding keyboard")
        success = driver_mgr.hide_keyboard()

        if success:
            return jsonify(create_success_response(
                data={"hidden": success},
                message="Keyboard hide attempted"
            ))

    except DriverError as e:
        raise
    except Exception as e:
        logger.error(f"Hide keyboard error: {e}", exc_info=True)
        return jsonify(create_error_response("Hide keyboard failed", str(e))), 500
