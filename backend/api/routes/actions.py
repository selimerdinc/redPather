"""
Actions Routes - Main Blueprint that registers all action sub-blueprints.
This file serves as a facade for backward compatibility.

Modular Structure:
- tap_actions.py: /tap, /verify
- input_actions.py: /send-keys, /get-text
- navigation_actions.py: /scroll, /back, /hide-keyboard
"""
import logging
from flask import Blueprint

# Import sub-blueprints
from backend.api.routes.tap_actions import tap_bp
from backend.api.routes.input_actions import input_bp
from backend.api.routes.navigation_actions import navigation_bp

logger = logging.getLogger(__name__)

# Main blueprint that combines all action blueprints
actions_bp = Blueprint('actions', __name__)


def register_action_blueprints(app):
    """
    Register all action sub-blueprints with the Flask app.
    Call this from main app.py instead of registering actions_bp directly.
    
    This allows endpoints to remain at /tap, /scroll, etc.
    without the /actions prefix.
    """
    app.register_blueprint(tap_bp)
    app.register_blueprint(input_bp)
    app.register_blueprint(navigation_bp)
    logger.info("✅ Action blueprints registered: tap, input, navigation")


# For backward compatibility, you can also access individual blueprints
__all__ = [
    'actions_bp',
    'tap_bp',
    'input_bp',
    'navigation_bp',
    'register_action_blueprints'
]