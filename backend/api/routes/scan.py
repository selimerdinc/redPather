"""
Scan endpoint - Screen analysis with improved caching
"""
import concurrent.futures
import hashlib
import logging
import time
from flask import Blueprint, request, jsonify

from backend.core.context import driver_mgr, config_mgr
from backend.core.exceptions import DriverError, ParseError, ValidationError
from backend.core.constants import VALID_PLATFORMS, MAX_CACHE_SIZE, SCREENSHOT_CACHE_TTL
from backend.api.services.page_analyzer import PageAnalyzer
from backend.api.middleware import create_error_response, create_success_response

logger = logging.getLogger(__name__)
scan_bp = Blueprint('scan', __name__)

# ✅ DÜZELTME: Cache artık timestamp içeriyor
# Format: {hash: (image_data, timestamp)}
from collections import OrderedDict
import sys


class ScreenshotCache:
    def __init__(self, max_size_mb=50):
        self.cache = OrderedDict()
        self.max_size = max_size_mb * 1024 * 1024

    def add(self, key, data, timestamp):
        size = sys.getsizeof(data)
        while self._get_total_size() + size > self.max_size:
            self.cache.popitem(last=False)  # FIFO
        self.cache[key] = (data, timestamp, size)

screenshot_cache = ScreenshotCache()

def cleanup_expired_cache():
    """Remove expired cache entries based on TTL"""
    current_time = time.time()
    expired_keys = []

    for key, (_, timestamp) in screenshot_cache.items():
        if current_time - timestamp > SCREENSHOT_CACHE_TTL:
            expired_keys.append(key)

    for key in expired_keys:
        del screenshot_cache[key]
        logger.debug(f"Cache cleanup: Removed expired entry {key[:8]}...")

    if expired_keys:
        logger.info(f"🧹 Cache cleanup: Removed {len(expired_keys)} expired entries")


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

        # ✅ DÜZELTME: Cache cleanup before checking
        cleanup_expired_cache()

        # Check screenshot cache
        source_hash = hashlib.md5(source.encode()).hexdigest()

        if source_hash in screenshot_cache:
            optimized_image, _ = screenshot_cache[source_hash]
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

            # ✅ DÜZELTME: Cache'e timestamp ile kaydet
            current_time = time.time()
            screenshot_cache[source_hash] = (optimized_image, current_time)

            # Limit cache size (FIFO)
            if len(screenshot_cache) > MAX_CACHE_SIZE:
                oldest_key = min(screenshot_cache.keys(),
                               key=lambda k: screenshot_cache[k][1])
                del screenshot_cache[oldest_key]
                logger.debug(f"Cache full: Removed oldest entry")

            logger.info(f"📸 Screenshot captured and cached (TTL: {SCREENSHOT_CACHE_TTL}s)")

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