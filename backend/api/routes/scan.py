"""
Scan endpoint - Screen analysis with improved caching
"""
import concurrent.futures
import hashlib
import logging
import time
import sys
from collections import OrderedDict
from flask import Blueprint, request, jsonify

from backend.core.context import driver_mgr, config_mgr
from backend.core.exceptions import DriverError, ParseError, ValidationError
from backend.core.constants import VALID_PLATFORMS, MAX_CACHE_SIZE, SCREENSHOT_CACHE_TTL
from backend.api.services.page_analyzer import PageAnalyzer
from backend.api.middleware import create_error_response, create_success_response

logger = logging.getLogger(__name__)
scan_bp = Blueprint('scan', __name__)

class ScreenshotCache:
    def __init__(self, max_size_mb=50):
        self.cache = OrderedDict()
        self.max_size = max_size_mb * 1024 * 1024
        self.total_size = 0

    def add(self, key, data, timestamp):
        size = sys.getsizeof(data)

        # Memory limit kontrolü
        while self.total_size + size > self.max_size and self.cache:
            removed_key, (removed_data, _, removed_size) = self.cache.popitem(last=False)
            self.total_size -= removed_size
            logger.debug(f"Cache eviction: {removed_key[:8]}... ({removed_size} bytes)")

        self.cache[key] = (data, timestamp, size)
        self.total_size += size

    def get(self, key):
        """Get cached item"""
        return self.cache.get(key)

    def remove(self, key):
        """Remove item specifically"""
        if key in self.cache:
            _, _, size = self.cache.pop(key)
            self.total_size -= size

    def items(self):
        """Expose dictionary items"""
        return self.cache.items()

    def __contains__(self, key):
        return key in self.cache

# Global cache instance
screenshot_cache = ScreenshotCache()

def cleanup_expired_cache():
    """Remove expired cache entries based on TTL"""
    current_time = time.time()
    expired_keys = []

    # Düzeltme: 3 elemanlı tuple unpacking (data, timestamp, size)
    for key, (_, timestamp, _) in screenshot_cache.items():
        if current_time - timestamp > SCREENSHOT_CACHE_TTL:
            expired_keys.append(key)

    for key in expired_keys:
        # Düzeltme: del yerine remove metodu
        screenshot_cache.remove(key)
        logger.debug(f"Cache cleanup: Removed expired entry {key[:8]}...")

    if expired_keys:
        logger.info(f"🧹 Cache cleanup: Removed {len(expired_keys)} expired entries")


@scan_bp.route('/scan', methods=['POST'])
def scan():
    """
    Scan current screen and detect elements
    """
    try:
        req = request.json or {}
        platform = req.get("platform", "ANDROID")
        verify = req.get("verify", True)
        prefix = req.get("prefix", "").strip().lower()

        if platform not in VALID_PLATFORMS:
            raise ValidationError(f"Invalid platform: {platform}", f"Must be one of: {', '.join(VALID_PLATFORMS)}")

        config = config_mgr.get_all()
        is_valid, error_msg = config_mgr.validate_config(config, platform)

        if not is_valid:
            raise ValidationError(f"Invalid {platform} configuration", error_msg)

        driver = driver_mgr.start_driver(platform)
        source = driver_mgr.get_page_source()

        if not source:
            raise DriverError("Failed to get page source", "Device might be locked or app is not running")

        cleanup_expired_cache()

        source_hash = hashlib.md5(source.encode()).hexdigest()

        # Düzeltme: Cache kontrolü
        if source_hash in screenshot_cache:
            cached_data = screenshot_cache.get(source_hash)
            if cached_data:
                # Düzeltme: 3 elemanlı tuple unpacking
                optimized_image, _, _ = cached_data
                logger.info("📸 Using cached screenshot")
        else:
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future_shot = executor.submit(driver_mgr.take_screenshot)
                future_win = executor.submit(driver_mgr.get_window_size)

                raw_screenshot = future_shot.result()
                if not raw_screenshot:
                    raise DriverError("Failed to capture screenshot", "Screen might be locked or device disconnected")

                win_size = future_win.result()

            analyzer = PageAnalyzer(driver)
            optimized_image = analyzer.optimize_image(raw_screenshot)

            current_time = time.time()

            # Düzeltme: __setitem__ yerine add metodu kullanıldı
            # Ayrıca eski manuel boyut kontrolü (len > MAX_CACHE_SIZE) kaldırıldı,
            # çünkü ScreenshotCache.add bunu zaten yapıyor.
            screenshot_cache.add(source_hash, optimized_image, current_time)

            logger.info(f"📸 Screenshot captured and cached (TTL: {SCREENSHOT_CACHE_TTL}s)")

        win_size = driver_mgr.get_window_size()
        if win_size['width'] == 0 or win_size['height'] == 0:
            raise DriverError("Failed to get window size", "Device might be in an invalid state")

        analyzer = PageAnalyzer(driver)
        result = analyzer.analyze(source, platform, verify, prefix, win_size)

        if "error" in result:
            raise ParseError("Page analysis failed", result["error"])

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
        raise
    except Exception as e:
        logger.error(f"Unexpected scan error: {e}", exc_info=True)
        return jsonify(create_error_response("Unexpected error during scan", str(e))), 500