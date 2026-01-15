"""
DriverManager - Facade Pattern Implementation
Tüm driver işlemleri için tek giriş noktası.
Geriye dönük uyumluluk için mevcut API korunmuştur.

Modül yapısı:
- session_manager.py: Session lifecycle (start, attach, quit)
- action_executor.py: Device interactions (tap, scroll, back)
- true_attach.py: TrueAttachRemote class
"""
import os
import platform
import logging

logger = logging.getLogger(__name__)

# macOS için Android SDK yollarını otomatik tanımla
if platform.system() == "Darwin":
    android_sdk_path = os.path.expanduser("~/Library/Android/sdk")
    if os.path.exists(android_sdk_path):
        os.environ["ANDROID_HOME"] = android_sdk_path
        os.environ["ANDROID_SDK_ROOT"] = android_sdk_path
        paths = [
            os.path.join(android_sdk_path, "platform-tools"),
            os.path.join(android_sdk_path, "tools"),
            os.path.join(android_sdk_path, "tools", "bin"),
            os.environ.get("PATH", "")
        ]
        os.environ["PATH"] = ":".join(paths)
        logger.info(f"✅ Android SDK paths configured: {android_sdk_path}")
    else:
        logger.warning(f"⚠️ Android SDK not found: {android_sdk_path}")

# Import sub-modules
from backend.core.session_manager import SessionManager
from backend.core.action_executor import ActionExecutor
from backend.core.true_attach import TrueAttachRemote  # Re-export for compatibility

# Re-export exceptions for backward compatibility
from backend.core.exceptions import (
    AppiumConnectionError,
    DeviceNotFoundError,
    AppNotInstalledError,
    DriverError
)


class DriverManager:
    """
    Facade class that orchestrates SessionManager and ActionExecutor.
    Maintains backward compatibility with existing API.
    """
    
    def __init__(self, config_manager):
        """
        Args:
            config_manager: Configuration manager instance
        """
        self.session = SessionManager(config_manager)
        self.actions = ActionExecutor()
        self.config_mgr = config_manager
    
    # ==========================================
    # PROPERTIES - Backward Compatibility
    # ==========================================
    
    @property
    def drivers(self):
        """Access to internal drivers dict."""
        return self.session.drivers
    
    @property
    def platform(self):
        """Current platform."""
        return self.session.platform
    
    @platform.setter
    def platform(self, value):
        """Set current platform."""
        self.session.platform = value
    
    @property
    def _lock(self):
        """Access to internal lock."""
        return self.session._lock
    
    @property
    def pending_session_id(self):
        """Pending session for attach."""
        return self.session.pending_session_id
    
    @pending_session_id.setter
    def pending_session_id(self, value):
        self.session.pending_session_id = value
    
    # ==========================================
    # SESSION MANAGEMENT (Delegated)
    # ==========================================
    
    def get_driver(self):
        """Aktif platformun driver'ını döndürür."""
        return self.session.get_driver()
    
    def get_platform(self) -> str:
        """Aktif platform adını döndürür."""
        return self.session.get_platform()
    
    def is_active(self, platform: str = None) -> bool:
        """Driver aktif mi kontrol eder."""
        return self.session.is_active(platform)
    
    def start_driver(self, platform: str):
        """Yeni driver başlatır veya mevcut driver'a geçer."""
        return self.session.start_driver(platform)
    
    def quit_driver(self, platform: str = None):
        """Driver'ı güvenli şekilde kapatır."""
        return self.session.quit_driver(platform)
    
    def quit_all(self):
        """Tüm driver'ları kapatır."""
        return self.session.quit_all()
    
    def attach_to_session(self, session_id: str, platform_name: str):
        """Mevcut bir session'a bağlanır."""
        return self.session.attach_to_session(session_id, platform_name)
    
    def list_active_sessions(self) -> list:
        """Appium'daki aktif session'ları listeler."""
        return self.session.list_active_sessions()
    
    def get_current_session_info(self) -> dict:
        """Mevcut session bilgisini döndürür."""
        return self.session.get_current_session_info()
    
    # ==========================================
    # DATA ACCESS (Delegated)
    # ==========================================
    
    def get_page_source(self) -> str:
        """Page source (XML) döndürür."""
        return self.session.get_page_source()
    
    def take_screenshot(self) -> str:
        """Base64 formatında ekran görüntüsü alır."""
        return self.session.take_screenshot()
    
    def get_window_size(self) -> dict:
        """Ekran boyutlarını döndürür."""
        return self.session.get_window_size()
    
    # ==========================================
    # DEVICE ACTIONS (Delegated with context)
    # ==========================================
    
    def perform_tap(self, x: int, y: int) -> bool:
        """Ekrana dokunma işlemi yapar."""
        driver = self.get_driver()
        platform = self.get_platform()
        return self.actions.perform_tap(driver, platform, x, y)
    
    def perform_scroll(self, direction: str) -> bool:
        """Ekranı kaydırır."""
        driver = self.get_driver()
        platform = self.get_platform()
        window_size = self.get_window_size()
        return self.actions.perform_scroll(driver, platform, direction, window_size)
    
    def go_back(self) -> bool:
        """Geri navigasyon yapar."""
        driver = self.get_driver()
        return self.actions.go_back(driver)
    
    def hide_keyboard(self) -> bool:
        """Klavyeyi gizler."""
        driver = self.get_driver()
        platform = self.get_platform()
        return self.actions.hide_keyboard(driver, platform)
    
    def get_device_logs(self, log_type: str = None) -> list:
        """Cihaz loglarını alır."""
        with self._lock:
            driver = self.get_driver()
            platform = self.get_platform()
            return self.actions.get_device_logs(driver, platform, log_type)
    
    # ==========================================
    # LEGACY INTERNAL METHODS (for compat)
    # ==========================================
    
    def _execute_scroll_on_driver(self, platform: str, direction: str):
        """Legacy scroll method."""
        driver = self.drivers.get(platform)
        if driver:
            window_size = driver.get_window_size()
            self.actions.perform_scroll(driver, platform, direction, window_size)
    
    def _execute_back_on_driver(self, platform: str):
        """Legacy back method."""
        driver = self.drivers.get(platform)
        if driver:
            self.actions.go_back(driver)
    
    def _execute_hide_keyboard_on_driver(self, platform: str):
        """Legacy keyboard method."""
        driver = self.drivers.get(platform)
        if driver:
            self.actions.hide_keyboard(driver, platform)
