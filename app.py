import logging
import sys
import os
from flask import Flask
from flask_cors import CORS
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.api.routes import register_blueprints
from backend.api.middleware import setup_error_handlers

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('redpather.log')
    ]
)

# Set library log levels
logging.getLogger('urllib3').setLevel(logging.WARNING)
logging.getLogger('selenium').setLevel(logging.WARNING)
logging.getLogger('appium').setLevel(logging.INFO)

logger = logging.getLogger(__name__)


def create_app():
    """Application factory"""
    app = Flask(__name__)

    # Enable CORS
    CORS(app)

    # Configuration
    app.config['JSON_SORT_KEYS'] = False
    app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10MB

    # Register blueprints
    register_blueprints(app)

    # Setup error handlers
    setup_error_handlers(app)

    return app


# Create app instance
app = create_app()


if __name__ == '__main__':
    logger.info("=" * 60)
    logger.info("🚀 QA Red Pather Server Starting...")
    logger.info("=" * 60)
    logger.info("📱 Mobile Test Automation Tool")
    logger.info("🌍 Server: http://127.0.0.1:5000")
    logger.info("📖 Logs: redpather.log")
    logger.info("=" * 60)

    debug_mode = os.getenv('FLASK_DEBUG', 'False').lower() in ('true', '1', 't')

    try:
        # use_reloader=False: Thread hatalarını önler
        app.run(debug=debug_mode, use_reloader=False, port=5000, host='0.0.0.0')
    except KeyboardInterrupt:
        logger.info("\n👋 Server stopped by user")
    except Exception as e:
        logger.error(f"❌ Server error: {e}", exc_info=True)