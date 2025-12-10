from flask import Flask

# Blueprintleri import et
from .scan import scan_bp
from .config import config_bp
from .actions import actions_bp
from .main import main_bp


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
    app.register_blueprint(actions_bp, url_prefix='/api')