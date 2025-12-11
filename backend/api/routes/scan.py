"""
Scan endpoint - Screen analysis with centralized caching
"""
import concurrent.futures
import hashlib
import logging
import time
from flask import Blueprint, request, jsonify

# ✅ GÜNCELLENDİ: cache_mgr eklendi
from backend.core.context import driver_mgr, config_mgr, cache_mgr
from backend.core.exceptions import DriverError, ParseError, ValidationError
from backend.core.constants import VALID_PLATFORMS, SCREENSHOT_CACHE_TTL
from backend.api.services.page_analyzer import PageAnalyzer
from backend.api.middleware import create_error_response, create_success_response

logger = logging.getLogger(__name__)
scan_bp = Blueprint('scan', __name__)

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

        # 1. Kaynağı al
        source = driver_mgr.get_page_source()
        if not source:
            raise DriverError("Failed to get page source", "Device might be locked or app is not running")

        source_hash = hashlib.md5(source.encode()).hexdigest()
        optimized_image = None
        win_size = None

        # 2. Önbellek kontrolü (Merkezi Cache)
        # ✅ GÜNCELLENDİ: cache_mgr kullanılıyor
        cached_data = cache_mgr.get_scan(source_hash)

        if cached_data:
            optimized_image = cached_data["image"]
            win_size = cached_data["window"]
            logger.info("📸 Using cached screenshot (Central Cache)")

            # Son taramayı güncelle (Tap işlemi için kritik)
            cache_mgr.last_scan_data = cached_data
        else:
            # Cache yoksa yeni görüntü al
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future_shot = executor.submit(driver_mgr.take_screenshot)
                future_win = executor.submit(driver_mgr.get_window_size)

                raw_screenshot = future_shot.result()
                if not raw_screenshot:
                    raise DriverError("Failed to capture screenshot", "Screen might be locked or device disconnected")

                win_size = future_win.result()

            if win_size['width'] == 0 or win_size['height'] == 0:
                raise DriverError("Failed to get window size", "Device might be in an invalid state")

            analyzer = PageAnalyzer(driver)
            optimized_image = analyzer.optimize_image(raw_screenshot)

            # ✅ GÜNCELLENDİ: Sonucu merkezi cache'e kaydet
            cache_mgr.save_scan(source_hash, optimized_image, source, win_size)
            logger.info(f"📸 Screenshot captured and cached (TTL: {SCREENSHOT_CACHE_TTL}s)")

        # 3. Analiz (XML Parse)
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