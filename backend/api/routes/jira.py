"""
Jira Integration Routes - Create issues from Red Pather
"""
import logging
from flask import Blueprint, request, jsonify
from backend.api.middleware import create_success_response, create_error_response
from backend.api.services.jira_service import jira_service

logger = logging.getLogger(__name__)
jira_bp = Blueprint('jira', __name__)


@jira_bp.route('/configure', methods=['POST'])
def configure_jira():
    """Jira credentials ayarla"""
    try:
        data = request.json or {}
        
        jira_service.configure(
            base_url=data.get('base_url'),
            email=data.get('email'),
            api_token=data.get('api_token'),
            project_key=data.get('project_key')
        )
        
        return jsonify(create_success_response(
            data={"configured": True},
            message="Jira configured successfully"
        ))
        
    except Exception as e:
        logger.error(f"Jira configure error: {e}")
        return jsonify(create_error_response("Failed to configure Jira", str(e))), 500


@jira_bp.route('/test', methods=['POST'])
def test_jira_connection():
    """Jira bağlantısını test et"""
    try:
        result = jira_service.test_connection()
        
        if result["success"]:
            return jsonify(create_success_response(
                data={"connected": True, "user": result.get("user")},
                message=f"Connected as {result.get('user')}"
            ))
        else:
            return jsonify(create_error_response(
                "Jira connection failed", 
                result.get("error", "Unknown error")
            )), 400
            
    except Exception as e:
        logger.error(f"Jira test error: {e}")
        return jsonify(create_error_response("Connection test failed", str(e))), 500


@jira_bp.route('/create-issue', methods=['POST'])
def create_jira_issue():
    """Jira'da yeni bug oluştur"""
    try:
        data = request.json or {}
        
        summary = data.get('summary')
        description = data.get('description', '')
        issue_type = data.get('issue_type', 'Bug')
        priority = data.get('priority', 'Medium')
        screenshot = data.get('screenshot')  # base64
        
        if not summary:
            return jsonify(create_error_response(
                "Missing summary", 
                "Issue summary is required"
            )), 400
        
        result = jira_service.create_issue(
            summary=summary,
            description=description,
            issue_type=issue_type,
            priority=priority,
            screenshot_base64=screenshot
        )
        
        if result["success"]:
            return jsonify(create_success_response(
                data={
                    "issue_key": result["issue_key"],
                    "issue_url": result["issue_url"]
                },
                message=f"Issue {result['issue_key']} created successfully"
            ))
        else:
            return jsonify(create_error_response(
                "Failed to create issue", 
                result.get("error", "Unknown error")
            )), 400
            
    except Exception as e:
        logger.error(f"Jira create issue error: {e}")
        return jsonify(create_error_response("Failed to create issue", str(e))), 500


@jira_bp.route('/status', methods=['GET'])
def jira_status():
    """Jira yapılandırma durumunu döndür"""
    return jsonify(create_success_response(
        data={"configured": jira_service.is_configured()},
        message="Jira status retrieved"
    ))
