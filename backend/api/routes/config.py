"""
Configuration endpoint with input validation
"""
import logging
from flask import Blueprint, request, jsonify

from backend.core.context import config_mgr, driver_mgr
from backend.core.exceptions import ConfigurationError
from backend.api.middleware import create_error_response, create_success_response

logger = logging.getLogger(__name__)
config_bp = Blueprint('config', __name__)

# ✅ GÜVENLĐK: İzin verilen config anahtarları
ALLOWED_CONFIG_KEYS = {
    'ANDROID_DEVICE',
    'ANDROID_PKG',
    'ANDROID_ACT',
    'ANDROID_NO_RESET',
    'ANDROID_FULL_RESET',
    'IOS_DEVICE',
    'IOS_BUNDLE',
    'IOS_UDID',
    'IOS_PLATFORM_VER',
    'IOS_ORG_ID',
    'IOS_SIGN_ID'
}


@config_bp.route('/config', methods=['GET', 'POST'])
def handle_config():
    """
    Handle configuration GET/POST

    GET: Return current configuration
    POST: Update configuration (with validation)
    """
    try:
        if request.method == 'GET':
            config = config_mgr.get_all()
            return jsonify(create_success_response(data=config))

        if request.method == 'POST':
            if not request.json:
                raise ConfigurationError(
                    "No configuration data provided",
                    "Request body must contain JSON data"
                )

            # ✅ GÜVENLĐK: Sadece izin verilen anahtarları kabul et
            incoming_data = request.json
            filtered_data = {}

            for key, value in incoming_data.items():
                if key in ALLOWED_CONFIG_KEYS:
                    filtered_data[key] = value
                else:
                    logger.warning(f"Ignored unauthorized config key: {key}")

            if not filtered_data:
                raise ConfigurationError(
                    "No valid configuration keys provided",
                    f"Allowed keys: {', '.join(ALLOWED_CONFIG_KEYS)}"
                )

            # Update config with filtered data
            updated = config_mgr.update(filtered_data)

            # Save to .env
            success = config_mgr.save_to_env(updated)
            if not success:
                logger.warning("Failed to save config to .env file")

            # Close active drivers to apply new config
            driver_mgr.quit_all()

            logger.info(f"✅ Configuration updated: {len(filtered_data)} keys changed")

            return jsonify(create_success_response(
                data={"config": updated},
                message="Configuration updated successfully"
            ))

    except ConfigurationError as e:
        raise
    except Exception as e:
        logger.error(f"Config handler error: {e}", exc_info=True)
        return jsonify(create_error_response(
            "Failed to handle configuration",
            str(e)
        )), 500