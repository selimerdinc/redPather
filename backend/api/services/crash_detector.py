"""
Crash Detector Service
Uygulama crash'lerini tespit eder ve son aksiyonları kaydeder.
"""
import logging
from collections import deque
from datetime import datetime
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)


class CrashDetector:
    """
    Crash Detector - Uygulama crash'lerini tespit eder.
    
    - Action buffer: Son N aksiyonu tutar
    - App state check: Uygulamanın çalışıp çalışmadığını kontrol eder
    - Crash report: Crash anında detaylı rapor oluşturur
    """
    
    def __init__(self, buffer_size: int = 10):
        self._enabled = False
        self._buffer_size = buffer_size
        self._action_buffer = deque(maxlen=buffer_size)
        self._last_known_state = None
        self._crash_detected = False
        self._last_crash_report = None
        
    @property
    def enabled(self) -> bool:
        return self._enabled
    
    def toggle(self, enabled: Optional[bool] = None) -> bool:
        """Crash detector'ı aç/kapat."""
        if enabled is not None:
            self._enabled = enabled
        else:
            self._enabled = not self._enabled
        
        if self._enabled:
            self._crash_detected = False
            self._last_crash_report = None
            logger.info("🔍 Crash Detector ENABLED")
        else:
            logger.info("⏸️ Crash Detector DISABLED")
            
        return self._enabled
    
    def add_action(self, action_type: str, details: Dict[str, Any] = None):
        """
        Aksiyon buffer'a ekler.
        
        Args:
            action_type: tap, scroll, input, back, etc.
            details: Aksiyon detayları (element, coordinates, text, etc.)
        """
        if not self._enabled:
            return
            
        action = {
            "type": action_type,
            "timestamp": datetime.now().isoformat(),
            "details": details or {}
        }
        self._action_buffer.append(action)
        logger.debug(f"Action recorded: {action_type}")
    
    def get_recent_actions(self) -> List[Dict[str, Any]]:
        """Son aksiyonları döndürür."""
        return list(self._action_buffer)
    
    def check_app_state(self, driver_mgr) -> Dict[str, Any]:
        """
        Uygulama durumunu kontrol eder.
        
        Returns:
            {
                "alive": bool,
                "state": str,
                "crash_detected": bool,
                "message": str
            }
        """
        if not self._enabled:
            return {"alive": True, "state": "unknown", "crash_detected": False, "message": "Detector disabled"}
        
        try:
            driver = driver_mgr.get_current_driver()
            if not driver:
                return {"alive": False, "state": "no_driver", "crash_detected": False, "message": "No active driver"}
            
            platform = driver_mgr.platform
            
            if platform == "IOS":
                return self._check_ios_state(driver, driver_mgr)
            else:
                return self._check_android_state(driver, driver_mgr)
                
        except Exception as e:
            logger.error(f"App state check error: {e}")
            return {"alive": False, "state": "error", "crash_detected": True, "message": str(e)}
    
    def _check_ios_state(self, driver, driver_mgr) -> Dict[str, Any]:
        """iOS uygulama durumu kontrolü."""
        try:
            from appium.webdriver.applicationstate import ApplicationState
            
            bundle_id = driver_mgr.config_mgr.get("IOS_BUNDLE", "")
            if not bundle_id:
                return {"alive": True, "state": "unknown", "crash_detected": False, "message": "Bundle ID not configured"}
            
            state = driver.query_app_state(bundle_id)
            
            # ApplicationState enum değerleri:
            # 0: NOT_INSTALLED, 1: NOT_RUNNING, 2: RUNNING_IN_BACKGROUND
            # 3: RUNNING_IN_BACKGROUND_SUSPENDED, 4: RUNNING_IN_FOREGROUND
            
            if state == ApplicationState.RUNNING_IN_FOREGROUND:
                self._crash_detected = False
                return {"alive": True, "state": "running", "crash_detected": False, "message": "App running"}
            elif state == ApplicationState.NOT_RUNNING:
                if self._last_known_state == ApplicationState.RUNNING_IN_FOREGROUND:
                    # Önceden çalışıyordu, şimdi kapandı = CRASH!
                    self._crash_detected = True
                    self._generate_crash_report(driver_mgr, "App terminated unexpectedly")
                    return {"alive": False, "state": "crashed", "crash_detected": True, "message": "App crashed!"}
                return {"alive": False, "state": "not_running", "crash_detected": False, "message": "App not running"}
            else:
                # Background veya suspended
                return {"alive": True, "state": "background", "crash_detected": False, "message": "App in background"}
                
        except Exception as e:
            if "is not running" in str(e).lower() or "terminated" in str(e).lower():
                self._crash_detected = True
                self._generate_crash_report(driver_mgr, str(e))
                return {"alive": False, "state": "crashed", "crash_detected": True, "message": f"Crash detected: {e}"}
            raise
        finally:
            # Son durumu kaydet
            try:
                self._last_known_state = driver.query_app_state(bundle_id)
            except Exception as state_err:
                logger.debug(f"Could not save last app state: {state_err}")
    
    def _check_android_state(self, driver, driver_mgr) -> Dict[str, Any]:
        """Android uygulama durumu kontrolü."""
        try:
            package = driver_mgr.config_mgr.get("ANDROID_PKG", "")
            if not package:
                return {"alive": True, "state": "unknown", "crash_detected": False, "message": "Package not configured"}
            
            # current_activity kontrolü
            current_activity = driver.current_activity
            
            if current_activity is None:
                # Activity yok = muhtemelen crash
                self._crash_detected = True
                self._generate_crash_report(driver_mgr, "No current activity - app may have crashed")
                return {"alive": False, "state": "crashed", "crash_detected": True, "message": "App crashed!"}
            
            # Crash dialog kontrolü
            try:
                page_source = driver.page_source.lower()
                crash_indicators = ["unfortunately", "has stopped", "keeps stopping", "isn't responding", "crash"]
                
                for indicator in crash_indicators:
                    if indicator in page_source:
                        self._crash_detected = True
                        self._generate_crash_report(driver_mgr, f"Crash dialog detected: {indicator}")
                        return {"alive": False, "state": "crashed", "crash_detected": True, "message": f"Crash dialog: {indicator}"}
            except Exception as source_err:
                logger.debug(f"Could not check page source for crash: {source_err}")
            
            self._crash_detected = False
            return {"alive": True, "state": "running", "crash_detected": False, "message": "App running"}
            
        except Exception as e:
            if "does not exist" in str(e).lower() or "no activity" in str(e).lower():
                self._crash_detected = True
                self._generate_crash_report(driver_mgr, str(e))
                return {"alive": False, "state": "crashed", "crash_detected": True, "message": f"Crash detected: {e}"}
            raise
    
    def _generate_crash_report(self, driver_mgr, reason: str):
        """Crash raporu oluşturur."""
        try:
            # Screenshot al
            screenshot = None
            try:
                driver = driver_mgr.get_current_driver()
                if driver:
                    screenshot = driver.get_screenshot_as_base64()
            except Exception as ss_err:
                logger.debug(f"Could not capture crash screenshot: {ss_err}")
            
            # Log'ları al
            logs = []
            try:
                logs = driver_mgr.get_logs(log_type="syslog" if driver_mgr.platform == "IOS" else "logcat")
                # Son 50 satır
                if len(logs) > 50:
                    logs = logs[-50:]
            except Exception as log_err:
                logger.debug(f"Could not capture crash logs: {log_err}")
            
            self._last_crash_report = {
                "timestamp": datetime.now().isoformat(),
                "reason": reason,
                "platform": driver_mgr.platform,
                "actions": self.get_recent_actions(),
                "screenshot": screenshot,
                "logs": logs
            }
            
            logger.warning(f"🚨 CRASH REPORT GENERATED: {reason}")
            
        except Exception as e:
            logger.error(f"Failed to generate crash report: {e}")
            self._last_crash_report = {
                "timestamp": datetime.now().isoformat(),
                "reason": reason,
                "actions": self.get_recent_actions(),
                "error": str(e)
            }
    
    def get_crash_report(self) -> Optional[Dict[str, Any]]:
        """Son crash raporunu döndürür."""
        return self._last_crash_report
    
    def clear_crash_report(self):
        """Crash raporunu temizler."""
        self._crash_detected = False
        self._last_crash_report = None
    
    def get_status(self) -> Dict[str, Any]:
        """Detector durumunu döndürür."""
        return {
            "enabled": self._enabled,
            "crash_detected": self._crash_detected,
            "action_count": len(self._action_buffer),
            "buffer_size": self._buffer_size,
            "has_crash_report": self._last_crash_report is not None
        }


# Global instance
crash_detector = CrashDetector()
