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
from backend.api.services.gemini_service import GeminiService
from backend.api.middleware import create_error_response, create_success_response

logger = logging.getLogger(__name__)
scan_bp = Blueprint('scan', __name__)

@scan_bp.route('/scan', methods=['POST'])
def scan():
    """
    Scan current screen and detect elements
    OPTIMIZED: verify=False by default, parallel source+screenshot
    """
    try:
        req = request.json or {}
        platform = req.get("platform", "ANDROID")
        verify = req.get("verify", False)  # ⚡ PERFORMANS: varsayılan False
        prefix = req.get("prefix", "").strip().lower()

        if platform not in VALID_PLATFORMS:
            raise ValidationError(f"Invalid platform: {platform}", f"Must be one of: {', '.join(VALID_PLATFORMS)}")

        config = config_mgr.get_all()
        is_valid, error_msg = config_mgr.validate_config(config, platform)

        if not is_valid:
            # ✅ Daha detaylı hata mesajı
            msg = f"{platform} Konfigürasyon Hatası"
            details = f"{error_msg}. Lütfen Ayarlar -> Profiller sekmesinden geçerli bir profil seçin veya ayarları kontrol edin."
            raise ValidationError(msg, details)

        driver = driver_mgr.start_driver(platform)

        # ⚡ PERFORMANS: Source, Screenshot ve WindowSize paralel al
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            future_source = executor.submit(driver_mgr.get_page_source)
            future_shot = executor.submit(driver_mgr.take_screenshot)
            future_win = executor.submit(driver_mgr.get_window_size)

            source = future_source.result()
            raw_screenshot = future_shot.result()
            win_size = future_win.result()

        if not source:
            raise DriverError("Failed to get page source", "Device might be locked or app is not running")

        if not raw_screenshot:
            raise DriverError("Failed to capture screenshot", "Screen might be locked or device disconnected")

        if win_size['width'] == 0 or win_size['height'] == 0:
            raise DriverError("Failed to get window size", "Device might be in an invalid state")

        source_hash = hashlib.md5(source.encode()).hexdigest()

        # Önbellek kontrolü
        cached_data = cache_mgr.get_scan(source_hash)

        if cached_data:
            optimized_image = cached_data["image"]
            logger.info("📸 Using cached screenshot")
        else:
            # Image optimize et
            analyzer = PageAnalyzer(driver)
            optimized_image = analyzer.optimize_image(raw_screenshot)
            cache_mgr.save_scan(source_hash, optimized_image, source, win_size)
            logger.info(f"📸 Screenshot captured and cached")

        # Analiz (XML Parse)
        analyzer = PageAnalyzer(driver)
        result = analyzer.analyze(source, platform, verify, prefix, win_size)

        if "error" in result:
            raise ParseError("Page analysis failed", result["error"])

        logger.info(f"✅ Scan complete: {len(result['elements'])} elements found")

        # ⚡ PERFORMANS: raw_source sadece XML viewer için
        return jsonify(create_success_response(data={
            "image": optimized_image,
            "elements": result['elements'],
            "page_name": result['page_name'],
            "window_w": win_size['width'],
            "window_h": win_size['height'],
            "raw_source": source,  # XML viewer için gerekli
            "source_hash": source_hash
        }))


    except (DriverError, ParseError, ValidationError) as e:
        raise
    except Exception as e:
        logger.error(f"Unexpected scan error: {e}", exc_info=True)
        return jsonify(create_error_response("Unexpected error during scan", str(e))), 500