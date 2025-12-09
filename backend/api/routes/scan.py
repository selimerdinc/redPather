"""
Scan endpoint - Screen analysis
"""
import concurrent.futures
import hashlib
import logging
from flask import Blueprint, request, jsonify

from backend.core.context import driver_mgr, config_mgr
from backend.core.exceptions import DriverError, ParseError, ValidationError
from backend.core.constants import VALID_PLATFORMS, MAX_CACHE_SIZE
from backend.services.page_analyzer import PageAnalyzer
from backend.api.middleware import create_error_response, create_success_response

logger = logging.getLogger(__name__)
scan_bp = Blueprint('scan', __name__)

# Global screenshot cache
screenshot_cache = {}


@scan_bp.route('/scan', methods=['POST'])
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
        if platform not in VALID_PLATFORMS:
            raise ValidationError(
                f"Invalid platform: {platform}",
                f"Must be one of: {', '.join(VALID_PLATFORMS)}"
            )

        # Validate config
        config = config_mgr.get_all()
        is_valid, error_msg = config_mgr.validate_config(config, platform)

        if not is_valid:
            raise ValidationError(
                f"Invalid {platform} configuration",
                error_msg
            )

        # Start driver
        driver = driver_mgr.start_driver(platform)

        # Get page source
        source = driver_mgr.get_page_source()
        if not source:
            raise DriverError(
                "Failed to get page source",
                "Device might be locked or app is not running"
            )

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
                    raise DriverError(
                        "Failed to capture screenshot",
                        "Screen might be locked or device disconnected"
                    )

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
            raise DriverError(
                "Failed to get window size",
                "Device might be in an invalid state"
            )

        # Analyze page
        analyzer = PageAnalyzer(driver)
        result = analyzer.analyze(source, platform, verify, prefix, win_size)

        if "error" in result:
            raise ParseError(
                "Page analysis failed",
                result["error"]
            )

        logger.info(f"✅ Scan complete: {len(result['elements'])} elements found")

        return jsonify(create_success_response(data={
            "image": optimized_image,
            "elements": result['elements'],
            "page_name": result['page_name'],
            "window_w": win_size['width'],
            "window_h": win_size['height'],
            "raw_source": source
        }))

    except (DriverError, ParseError, ValidationError) as e:
        # These will be handled by middleware
        raise
    except Exception as e:
        logger.error(f"Unexpected scan error: {e}", exc_info=True)
        return jsonify(create_error_response(
            "Unexpected error during scan",
            str(e)
        )), 500