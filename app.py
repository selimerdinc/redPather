import logging
import sys
from flask import Flask
from routes.api import api_bp

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

# Create Flask app
app = Flask(__name__)

# Register blueprints
app.register_blueprint(api_bp)


# Error handlers
@app.errorhandler(404)
def not_found(error):
    return {"status": "error", "message": "Endpoint not found"}, 404


@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {error}")
    return {"status": "error", "message": "Internal server error"}, 500


if __name__ == '__main__':
    logger.info("=" * 60)
    logger.info("🚀 QA Red Pather Server Starting...")
    logger.info("=" * 60)
    logger.info("📱 Mobile Test Automation Tool")
    logger.info("🌍 Server: http://127.0.0.1:5000")
    logger.info("📖 Logs: redpather.log")
    logger.info("=" * 60)

    try:
        app.run(debug=True, port=5000, host='0.0.0.0')
    except KeyboardInterrupt:
        logger.info("\n👋 Server stopped by user")
    except Exception as e:
        logger.error(f"❌ Server error: {e}", exc_info=True)