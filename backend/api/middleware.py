import logging
from flask import jsonify
from backend.core.exceptions import RedPatherError

logger = logging.getLogger(__name__)


def create_error_response(message: str, details: str = None) -> dict:
    """
    Create standardized error response structure
    """
    response = {
        "status": "error",
        "message": message
    }
    if details:
        response["details"] = details
    return response


def create_success_response(data: dict = None, message: str = None) -> dict:
    """
    Create standardized success response structure
    """
    response = {"status": "success"}
    if data is not None:
        response["data"] = data
    if message:
        response["message"] = message
    return response


def setup_error_handlers(app):
    """
    Register global error handlers and security middleware for the Flask app
    """
    
    # ===== SECURITY HEADERS =====
    @app.after_request
    def add_security_headers(response):
        """Add security headers to every response"""
        # XSS Protection
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        
        # Clickjacking Protection
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        
        # Content Security Policy (relaxed for local app)
        response.headers['Content-Security-Policy'] = "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; img-src 'self' data: blob:;"
        
        # Referrer Policy
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        
        # Cache control for sensitive endpoints
        if '/api/' in str(response.headers.get('Location', '')):
            response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
            response.headers['Pragma'] = 'no-cache'
        
        return response


    @app.errorhandler(RedPatherError)
    def handle_redpather_error(error):
        """Handle custom application errors"""
        logger.warning(f"Application error: {error.message}")
        response = create_error_response(error.message, error.details)
        # Hata türüne göre status code belirleyebiliriz, şimdilik 400
        return jsonify(response), 400

    @app.errorhandler(400)
    def bad_request(error):
        return jsonify(create_error_response("Bad Request", str(error))), 400

    @app.errorhandler(404)
    def not_found(error):
        return jsonify(create_error_response("Endpoint not found", str(error))), 404

    @app.errorhandler(500)
    def internal_error(error):
        logger.error(f"Internal server error: {error}", exc_info=True)
        return jsonify(create_error_response("Internal server error", str(error))), 500

    @app.errorhandler(Exception)
    def handle_unexpected_error(error):
        """Handle any unhandled exceptions"""
        logger.error(f"Unexpected error: {error}", exc_info=True)
        return jsonify(create_error_response("An unexpected error occurred", str(error))), 500