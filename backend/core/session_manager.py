"""
SessionManager - Appium session lifecycle yönetimi.
Session başlatma, bağlanma, kapatma ve listeleme işlemleri.
"""
import logging
import threading
import requests
from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.options.ios import XCUITestOptions

from backend.core.exceptions import DriverError
from backend.core.true_attach import TrueAttachRemote

logger = logging.getLogger(__name__)


class SessionManager:
    """
    Appium session lifecycle yönetimi.
    Thread-safe implementasyon.
    """
    
    def __init__(self, config_manager):
        """
        Args:
            config_manager: Konfigürasyon yöneticisi
        """
        self.drivers = {}  # {"ANDROID": driver, "IOS": driver}
        self.platform = "ANDROID"
        self.config_mgr = config_manager
        self._lock = threading.RLock()
        self.pending_session_id = None
    
    # ==========================================
    # DRIVER ACCESS
    # ==========================================
    
    def get_driver(self):
        """Aktif platformun Appium sürücüsünü döndürür."""
        with self._lock:
            return self.drivers.get(self.platform)
    
    def get_platform(self) -> str:
        """Aktif platform adını döndürür."""
        with self._lock:
            return self.platform
    
    def set_platform(self, platform: str):
        """Platform değiştirir."""
        with self._lock:
            self.platform = platform.upper()
    
    def is_active(self, platform: str = None) -> bool:
        """Driver aktif mi kontrol eder."""
        with self._lock:
            p = platform or self.platform
            driver = self.drivers.get(p)
            if driver:
                try:
                    return driver.session_id is not None
                except Exception as session_err:
                    logger.debug(f"Session check failed for {p}: {session_err}")
                    return False
            return False
    
    # ==========================================
    # SESSION LIFECYCLE
    # ==========================================
    
    def start_driver(self, platform: str):
        """
        Yeni Appium driver başlatır veya mevcut driver'a geçiş yapar.
        
        Args:
            platform: "ANDROID" veya "IOS"
            
        Returns:
            webdriver.Remote: Başlatılan veya mevcut driver
            
        Raises:
            DriverError: Başlatma hatası
        """
        with self._lock:
            platform = platform.upper()
            
            # Zaten aktif bir driver varsa geçiş yap
            if platform in self.drivers and self.is_active(platform):
                self.platform = platform
                logger.info(f"✅ Switching to existing {platform} driver")
                return self.drivers[platform]
            
            # Eski driver'ı temizle
            self._cleanup_old_driver(platform)
            
            self.platform = platform
            logger.info(f"🚀 {platform} Driver Initializing...")
            
            cfg = self.config_mgr.get_all()
            options = self._create_options(platform, cfg)
            
            # Driver başlatma
            return self._start_driver_internal(platform, options, cfg)
    
    def _cleanup_old_driver(self, platform: str):
        """Eski driver'ı güvenli şekilde temizler."""
        if platform in self.drivers:
            try:
                old_driver = self.drivers[platform]
                if hasattr(old_driver, 'session_id') and old_driver.session_id:
                    if self.pending_session_id:
                        logger.info(f"⏭️ Skipping quit for {platform} to preserve session")
                    else:
                        try:
                            old_driver.quit()
                        except Exception as e:
                            logger.debug(f"Expected cleanup warning: {e}")
            except Exception as e:
                logger.warning(f"Cleanup warning: {e}")
            finally:
                if platform in self.drivers:
                    del self.drivers[platform]
    
    def _create_options(self, platform: str, cfg: dict):
        """Platform'a göre Appium options oluşturur."""
        is_reconnecting = self.pending_session_id is not None or platform in self.drivers
        
        if platform == "ANDROID":
            dev = cfg.get("ANDROID_DEVICE")
            pkg = cfg.get("ANDROID_PKG")
            act = cfg.get("ANDROID_ACT")
            
            if not dev or not pkg or not act:
                raise DriverError(
                    "Android Konfigürasyon Hatası",
                    "Settings'ten Android Device ID, Package ve Activity alanlarını doldurun."
                )
            
            options = UiAutomator2Options()
            options.platform_name = "Android"
            options.automation_name = "UIAutomator2"
            options.device_name = dev
            options.set_capability("appium:udid", dev)
            options.app_package = pkg
            options.app_activity = act
            options.no_reset = cfg.get("ANDROID_NO_RESET")
            options.full_reset = cfg.get("ANDROID_FULL_RESET")
            options.new_command_timeout = 3600
            options.set_capability("appium:ensureWebviewsHavePages", True)
            options.set_capability("appium:nativeWebScreenshot", True)
            options.set_capability("settings[ignoreUnimportantViews]", True)
            options.set_capability("settings[waitForIdleTimeout]", 100)
            
            if is_reconnecting:
                options.set_capability("appium:noReset", True)
                options.set_capability("appium:forceAppLaunch", False)
                options.set_capability("appium:shouldTerminateApp", False)
                options.set_capability("appium:autoLaunch", False)
                logger.info(f"🛡️ Android Reconnection mode active")
            else:
                options.set_capability("appium:forceAppLaunch", True)
                options.set_capability("appium:shouldTerminateApp", True)
                
        else:  # iOS
            options = XCUITestOptions()
            options.platform_name = "iOS"
            options.automation_name = "XCUITest"
            options.device_name = cfg.get("IOS_DEVICE")
            options.bundle_id = cfg.get("IOS_BUNDLE")
            options.udid = cfg.get("IOS_UDID")
            
            v = cfg.get("IOS_PLATFORM_VER")
            if v and str(v).lower() not in ["undefined", "null", "none", ""]:
                options.platform_version = str(v)
            
            options.set_capability("appium:xcodeOrgId", cfg.get("IOS_ORG_ID"))
            options.set_capability("appium:xcodeSigningId", cfg.get("IOS_SIGN_ID"))
            options.set_capability("appium:includeSafariInWebviews", True)
            
            if is_reconnecting:
                options.set_capability("appium:noReset", True)
                options.set_capability("appium:forceAppLaunch", False)
                options.set_capability("appium:shouldTerminateApp", False)
                options.set_capability("appium:autoLaunch", False)
                logger.info(f"🛡️ iOS Reconnection mode active")
            else:
                options.set_capability("appium:forceAppLaunch", True)
                options.set_capability("appium:shouldTerminateApp", True)
            
            options.new_command_timeout = 3600
            options.set_capability("appium:wdaLaunchTimeout", 60000)
            options.set_capability("appium:wdaConnectionTimeout", 60000)
        
        return options
    
    def _start_driver_internal(self, platform: str, options, cfg: dict):
        """Driver'ı başlatır - TrueAttach veya yeni session."""
        base_urls = ["http://127.0.0.1:4723/wd/hub", "http://127.0.0.1:4723"]
        working_url = base_urls[0]
        
        try:
            # Pending session varsa TrueAttach ile bağlan
            pending = self.pending_session_id
            if pending and pending.get('platform') == platform:
                logger.info(f"🔗 Attempting TrueAttach for session: {pending['id']}")
                try:
                    executor_url = pending.get('url', working_url)
                    driver = TrueAttachRemote(
                        command_executor=executor_url,
                        options=options,
                        attach_id=pending['id']
                    )
                    self.drivers[platform] = driver
                    self.pending_session_id = None
                    logger.info(f"✅ Successfully inherited session {driver.session_id}")
                    return driver
                except Exception as inherit_err:
                    logger.warning(f"TrueAttach failed: {inherit_err}")
            
            # Yeni session başlat
            last_err = None
            for url in base_urls:
                try:
                    logger.info(f"🚀 Trying to start {platform} session at {url}...")
                    driver = webdriver.Remote(url, options=options)
                    self.drivers[platform] = driver
                    logger.info(f"✅ {platform} driver started at {url}")
                    return driver
                except Exception as e:
                    last_err = e
                    err_str = str(e).lower()
                    
                    if "status=500" in err_str or "session not created" in err_str:
                        logger.error(f"❌ Driver error: {e}")
                        break
                    
                    if "maxretryerror" in err_str or "connectionrefusederror" in err_str:
                        logger.warning(f"⚠️ Appium not reachable at {url}")
                        break
                    
                    logger.warning(f"⚠️ Path error at {url}, trying next...")
                    continue
            
            raise last_err or Exception("Failed on all Appium URLs")
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"❌ {platform} driver startup failed: {e}")
            
            if platform in self.drivers:
                del self.drivers[platform]
            
            # Kullanıcı dostu hata mesajları
            self._raise_friendly_error(platform, error_msg)
    
    def _raise_friendly_error(self, platform: str, error_msg: str):
        """Kullanıcı dostu hata mesajı oluşturur."""
        if "MaxRetryError" in error_msg or "ConnectionRefusedError" in error_msg:
            raise DriverError(
                "Appium Server Bağlanılamadı",
                "Appium sunucusunun çalıştığından emin olun."
            )
        
        if "Activity class" in error_msg and "does not exist" in error_msg:
            raise DriverError(
                "Uygulama Başlatılamadı",
                f"MainActivity bulunamadı. Doğru package/activity girin.\n\nDetay: {error_msg}"
            )
        
        if "Code=41" in error_msg or "Not authorized" in error_msg:
            raise DriverError(
                "iOS Cihaz Kilidi veya Yetki Hatası",
                "Cihazınız kilitli veya UI Otomasyon yetkisi eksik!"
            )
        
        if platform.lower() == "ios":
            raise DriverError(
                "iOS WebDriverAgent Hatası",
                "WDA başlatılamadı. Cihazın bağlı olduğundan emin olun."
            )
        
        raise DriverError(f"{platform} Startup Failed", f"Appium Hatası: {error_msg}")
    
    def quit_driver(self, platform: str = None):
        """Driver'ı güvenli şekilde kapatır."""
        with self._lock:
            if platform:
                if platform in self.drivers:
                    try:
                        logger.info(f"🛑 Quitting {platform} driver")
                        self.drivers[platform].quit()
                    except Exception as e:
                        logger.warning(f"Error quitting {platform}: {e}")
                    finally:
                        del self.drivers[platform]
            else:
                for p in list(self.drivers.keys()):
                    try:
                        logger.info(f"🛑 Quitting {p} driver")
                        self.drivers[p].quit()
                    except Exception as e:
                        logger.warning(f"Error quitting {p}: {e}")
                self.drivers = {}
    
    def quit_all(self):
        """Tüm driver'ları kapatır."""
        self.quit_driver()
    
    # ==========================================
    # SESSION INFO & LISTING
    # ==========================================
    
    def get_current_session_info(self) -> dict:
        """Mevcut driver'ın session bilgisini döndürür."""
        with self._lock:
            driver = self.drivers.get(self.platform)
            if driver and hasattr(driver, 'session_id') and driver.session_id:
                try:
                    caps = getattr(driver, 'caps', {}) or {}
                    device_name = (
                        caps.get('deviceName') or 
                        caps.get('device') or 
                        caps.get('udid') or 
                        'Connected Device'
                    )
                    return {
                        'id': driver.session_id,
                        'capabilities': {
                            'deviceName': device_name,
                            'platformName': caps.get('platformName', self.platform),
                            'platformVersion': caps.get('platformVersion', ''),
                            'app': caps.get('app', ''),
                            'appPackage': caps.get('appPackage', ''),
                            'bundleId': caps.get('bundleId', '')
                        }
                    }
                except Exception as e:
                    logger.warning(f"Could not get session info: {e}")
            return None
    
    def list_active_sessions(self) -> list:
        """Appium sunucusundaki aktif session'ları listeler."""
        all_sessions = []
        
        endpoints = [
            "http://127.0.0.1:4723/wd/hub/sessions",
            "http://127.0.0.1:4723/sessions"
        ]
        
        for url in endpoints:
            try:
                response = requests.get(url, timeout=5)
                if response.status_code == 200:
                    data = response.json()
                    sessions = data.get('value', [])
                    
                    for s in sessions:
                        session_id = s.get('id')
                        if not session_id:
                            continue
                        
                        caps = s.get('capabilities', {})
                        
                        if any(existing.get('id') == session_id for existing in all_sessions):
                            continue
                        
                        all_sessions.append({
                            'id': session_id,
                            'capabilities': {
                                'deviceName': caps.get('deviceName', caps.get('device', 'Unknown')),
                                'platformName': caps.get('platformName', 'ANDROID').upper(),
                                'platformVersion': caps.get('platformVersion', ''),
                                'appPackage': caps.get('appPackage', ''),
                                'bundleId': caps.get('bundleId', ''),
                                'udid': caps.get('udid', '')
                            }
                        })
                    
                    if all_sessions:
                        logger.info(f"✅ Found {len(all_sessions)} active sessions")
                        return all_sessions
                        
            except requests.exceptions.ConnectionError:
                logger.debug(f"Appium not reachable at {url}")
            except Exception as e:
                logger.warning(f"Error checking {url}: {e}")
        
        return all_sessions
    
    # ==========================================
    # SESSION ATTACH
    # ==========================================
    
    def attach_to_session(self, session_id: str, platform_name: str):
        """
        Mevcut bir Appium session'a bağlanır.
        
        Args:
            session_id: Bağlanılacak session ID
            platform_name: "ANDROID" veya "IOS"
            
        Returns:
            webdriver.Remote: Bağlanan driver
            
        Raises:
            DriverError: Bağlantı hatası
        """
        with self._lock:
            self.platform = platform_name.upper()
            logger.info(f"🔗 Attaching to {self.platform} session: {session_id}")
            
            # Zaten bağlı mıyız?
            current_driver = self.drivers.get(self.platform)
            if current_driver and hasattr(current_driver, 'session_id'):
                if current_driver.session_id == session_id:
                    logger.info(f"✅ Already attached to session {session_id}")
                    return current_driver
            
            try:
                # Appium'da session'ı bul
                working_url, session_data = self._find_session_on_appium(session_id)
                
                if working_url:
                    caps = session_data.get('capabilities', session_data)
                    options = self._create_attach_options(caps)
                    
                    logger.info(f"🔗 Creating TrueAttachRemote for session {session_id}")
                    driver = TrueAttachRemote(
                        command_executor=working_url,
                        options=options,
                        attach_id=session_id
                    )
                    
                    # Doğrula
                    _ = driver.session_id
                    logger.info(f"✅ Attached! Driver session_id: {driver.session_id}")
                    
                    if self.platform in self.drivers:
                        del self.drivers[self.platform]
                    
                    self.drivers[self.platform] = driver
                    return driver
                    
            except DriverError:
                raise
            except Exception as e:
                logger.warning(f"Appium attach failed: {e}")
            
            # iOS için WDA fallback
            if self.platform == "IOS":
                driver = self._try_wda_direct_connect(session_id)
                if driver:
                    return driver
            
            raise DriverError("Session attachment failed", f"Could not attach to {session_id}")
    
    def _find_session_on_appium(self, session_id: str):
        """Appium'da session'ı arar."""
        base_urls = ["http://127.0.0.1:4723/wd/hub", "http://127.0.0.1:4723"]
        
        for base in base_urls:
            try:
                session_url = f"{base}/session/{session_id}"
                resp = requests.get(session_url, timeout=5)
                if resp.status_code == 200:
                    session_data = resp.json().get('value', {})
                    logger.info(f"✅ Found session at {base}")
                    return base, session_data
            except Exception as e:
                logger.debug(f"URL {base} failed: {e}")
                continue
        
        return None, None
    
    def _create_attach_options(self, caps: dict):
        """Session caps'tan options oluşturur."""
        if self.platform == "ANDROID":
            options = UiAutomator2Options()
            options.platform_name = "Android"
            options.automation_name = "UIAutomator2"
            options.device_name = caps.get('deviceName', caps.get('udid', 'Android'))
            if caps.get('appPackage'):
                options.app_package = caps.get('appPackage')
            if caps.get('appActivity'):
                options.app_activity = caps.get('appActivity')
        else:
            options = XCUITestOptions()
            options.platform_name = "iOS"
            options.automation_name = "XCUITest"
            options.device_name = caps.get('deviceName', 'iPhone')
            if caps.get('bundleId'):
                options.bundle_id = caps.get('bundleId')
            if caps.get('udid'):
                options.udid = caps.get('udid')
        
        options.no_reset = True
        options.new_command_timeout = 3600
        return options
    
    def _try_wda_direct_connect(self, session_id: str):
        """WDA'ya doğrudan bağlanmayı dener (iOS)."""
        try:
            logger.info("🔄 Attempting direct WDA connection...")
            
            wda_resp = requests.get('http://127.0.0.1:8100/status', timeout=5)
            
            if wda_resp.status_code == 200:
                wda_data = wda_resp.json()
                wda_session_id = wda_data.get('sessionId')
                
                if wda_session_id:
                    logger.info(f"✅ Found WDA session: {wda_session_id}")
                    
                    wda_url = "http://127.0.0.1:8100"
                    
                    options = XCUITestOptions()
                    options.platform_name = "iOS"
                    options.automation_name = "XCUITest"
                    options.device_name = wda_data.get('value', {}).get('device', 'iPhone')
                    options.no_reset = True
                    options.new_command_timeout = 3600
                    
                    driver = TrueAttachRemote(
                        command_executor=wda_url,
                        options=options,
                        attach_id=wda_session_id
                    )
                    
                    if self.platform in self.drivers:
                        del self.drivers[self.platform]
                    
                    self.drivers[self.platform] = driver
                    logger.info(f"✅ Connected to WDA session {wda_session_id}")
                    return driver
                else:
                    logger.warning("WDA running but no session found")
                    
        except Exception as wda_err:
            logger.error(f"WDA connection failed: {wda_err}")
        
        return None
    
    # ==========================================
    # DATA ACCESS
    # ==========================================
    
    def get_page_source(self) -> str:
        """Aktif driver'ın page source'unu döndürür."""
        driver = self.get_driver()
        if driver:
            try:
                return driver.page_source
            except Exception as e:
                logger.error(f"Failed to get page source: {e}")
        return None
    
    def take_screenshot(self) -> str:
        """Base64 formatında ekran görüntüsü alır."""
        driver = self.get_driver()
        if driver:
            try:
                return driver.get_screenshot_as_base64()
            except Exception as e:
                logger.error(f"Screenshot failed: {e}")
        return None
    
    def get_window_size(self) -> dict:
        """Ekran boyutlarını döndürür."""
        driver = self.get_driver()
        if driver:
            try:
                return driver.get_window_size()
            except Exception as e:
                logger.error(f"Failed to get window size: {e}")
                return {"width": 0, "height": 0}
        return {"width": 0, "height": 0}
