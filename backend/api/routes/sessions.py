import logging
from flask import Blueprint, request, jsonify
from backend.core.context import driver_mgr
from backend.api.middleware import create_error_response, create_success_response

sessions_bp = Blueprint('sessions', __name__)
logger = logging.getLogger(__name__)

@sessions_bp.route('', methods=['GET'])
def list_sessions():
    """
    Aktif session'ları listeler.
    iOS için WDA portunu (8100) sessizce kontrol eder.
    """
    try:
        sessions = []
        logger.debug("list_sessions called")
        
        # 1. Mevcut driver'ın session bilgisini al
        current_session = driver_mgr.get_current_session_info()
        if current_session:
            sessions.append(current_session)
            logger.debug(f"Found current driver session: {current_session.get('id')}")
        
        # 2. Appium API'den aktif session'ları al
        appium_sessions = driver_mgr.list_active_sessions()
        for s in appium_sessions:
            if not any(existing['id'] == s.get('id') for existing in sessions):
                sessions.append(s)
        logger.debug(f"Appium sessions found: {len(appium_sessions)}")

        # 3. iOS - WebDriverAgent (Sessiz Keşif - 8100 Port)
        try:
            import requests as req_lib
            logger.debug("Checking WDA at http://127.0.0.1:8100/status")
            wda_resp = req_lib.get('http://127.0.0.1:8100/status', timeout=2)
            if wda_resp.status_code == 200:
                wda_data = wda_resp.json()
                wda_session_id = wda_data.get('sessionId')
                logger.info(f"WDA Discovery: Found session {wda_session_id}")
                if wda_session_id and not any(existing['id'] == wda_session_id for existing in sessions):
                    value = wda_data.get('value', {})
                    device_info = value.get('device', 'iPhone')
                    os_info = value.get('os', {})
                    sessions.append({
                        'id': wda_session_id,
                        'capabilities': {
                            'deviceName': device_info,
                            'platformName': 'IOS',
                            'platformVersion': os_info.get('version', ''),
                            'source': 'WDA-Direct'
                        }
                    })
                    logger.info("WDA Discovery: Added session to list")
        except Exception as wda_err:
            logger.debug(f"WDA not available: {type(wda_err).__name__}")

        logger.debug(f"Total sessions: {len(sessions)}")
        return jsonify(create_success_response(data=sessions))
    except Exception as e:
        logger.warning(f"List sessions error: {e}")
        return jsonify(create_success_response(data=[]))


@sessions_bp.route('/current', methods=['GET'])
def get_current_session():
    """Şu an bağlı olan session bilgisini döndürür"""
    try:
        session_info = driver_mgr.get_current_session_info()
        return jsonify(create_success_response(data=session_info))
    except Exception as e:
        logger.warning(f"Get current session warning: {e}")
        return jsonify(create_success_response(data=None))

@sessions_bp.route('/attach', methods=['POST'])
def attach_session():
    """Mevcut bir oturuma bağlanır (session ID ile)"""
    try:
        req = request.json or {}
        session_id = req.get('sessionId')
        platform = req.get('platform', 'ANDROID')

        if not session_id:
            return jsonify(create_error_response("Missing Session ID", "Session ID is required")), 400

        driver_mgr.attach_to_session(session_id, platform)
        
        return jsonify(create_success_response(
            message=f"Successfully attached to session {session_id}"
        ))
    except Exception as e:
        logger.error(f"Attach session error: {e}")
        return jsonify(create_error_response("Failed to attach to session", str(e))), 500

@sessions_bp.route('/verify', methods=['POST'])
def verify_session():
    """
    Belirli bir session ID'nin Appium'da hala aktif olup olmadığını doğrular.
    Frontend localStorage'da saklanan session'ları doğrulamak için kullanılır.
    """
    try:
        import requests
        req = request.json or {}
        session_id = req.get('sessionId')
        
        if not session_id:
            return jsonify(create_success_response(data={'valid': False}))
        
        # Appium'a session bilgisi isteği gönder
        base_urls = ["http://127.0.0.1:4723/wd/hub", "http://127.0.0.1:4723"]
        
        for base in base_urls:
            url = f"{base}/session/{session_id}"
            try:
                resp = requests.get(url, timeout=3)
                if resp.status_code == 200:
                    data = resp.json()
                    session_data = data.get('value', {})
                    caps = session_data.get('capabilities', session_data)
                    
                    return jsonify(create_success_response(data={
                        'valid': True,
                        'id': session_id,
                        'capabilities': {
                            'deviceName': caps.get('deviceName', caps.get('device', 'Unknown')),
                            'platformName': caps.get('platformName', 'ANDROID').upper(),
                            'platformVersion': caps.get('platformVersion', ''),
                            'appPackage': caps.get('appPackage', ''),
                            'bundleId': caps.get('bundleId', '')
                        }
                    }))
            except:
                continue
        
        return jsonify(create_success_response(data={'valid': False}))
    except Exception as e:
        logger.warning(f"Verify session error: {e}")
        return jsonify(create_success_response(data={'valid': False}))

@sessions_bp.route('/logs', methods=['GET'])
def get_logs():
    """Cihaz loglarını döndürür"""
    try:
        log_type = request.args.get('type')
        logs = driver_mgr.get_device_logs(log_type)
        return jsonify(create_success_response(data=logs))
    except Exception as e:
        logger.error(f"Get logs error: {e}")
        return jsonify(create_error_response("Failed to get logs", str(e))), 500
