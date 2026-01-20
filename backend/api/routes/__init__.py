from flask import Flask

# Blueprintleri import et
from .scan import scan_bp
from .config import config_bp
from .main import main_bp
from .ai import ai_bp
from .sessions import sessions_bp
from .jira import jira_bp
from .locator_mapper import locator_mapper_bp

# Modular action blueprints
from .tap_actions import tap_bp
from .input_actions import input_bp
from .navigation_actions import navigation_bp


def register_blueprints(app: Flask):
    """
    Tüm blueprintleri Flask uygulamasına kaydeder.
    API rotaları '/api' ön ekiyle başlar.
    """

    # Ana Sayfa (UI)
    app.register_blueprint(main_bp)

    # API Servisleri
    app.register_blueprint(scan_bp, url_prefix='/api')
    app.register_blueprint(config_bp, url_prefix='/api')
    app.register_blueprint(ai_bp, url_prefix='/api')
    app.register_blueprint(sessions_bp, url_prefix='/api/sessions')
    app.register_blueprint(jira_bp, url_prefix='/api/jira')
    app.register_blueprint(locator_mapper_bp, url_prefix='/api')
    
    # Modular Action Blueprints (tap, input, navigation)
    app.register_blueprint(tap_bp, url_prefix='/api')
    app.register_blueprint(input_bp, url_prefix='/api')
    app.register_blueprint(navigation_bp, url_prefix='/api')