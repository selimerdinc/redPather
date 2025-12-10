"""
Configuration endpoint
"""
import logging
from flask import Blueprint, request, jsonify

from backend.core.context import config_mgr, driver_mgr
from backend.core.exceptions import ConfigurationError
from backend.api.middleware import create_error_response, create_success_response

logger = logging.getLogger(__name__)
config_bp = Blueprint('config', __name__)


@config_bp.route('/config', methods=['GET', 'POST'])
def handle_config():
    """
    Handle configuration GET/POST

    GET: Return current configuration
    POST: Update configuration
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

            # Update config
            updated = config_mgr.update(request.json)

            # Save to .env
            success = config_mgr.save_to_env(updated)
            if not success:
                logger.warning("Failed to save config to .env file")

            # Close active drivers to apply new config
            driver_mgr.quit_all()

            logger.info("Configuration updated and drivers restarted")

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