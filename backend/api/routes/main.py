import logging
from flask import Blueprint, render_template, jsonify
from backend.api.middleware import create_success_response

logger = logging.getLogger(__name__)
main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def index():
    """Ana sayfayı (index.html) render et"""
    return render_template('index.html')

@main_bp.route('/health', methods=['GET'])
def health_check():
    """Sistem sağlık kontrolü"""
    return jsonify(create_success_response(
        data={"status": "running"},
        message="System is healthy"
    ))