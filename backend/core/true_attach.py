"""
TrueAttachRemote - Mevcut Appium session'a bağlanmak için özel Remote sınıfı.
Bu sınıf, yeni bir session başlatmak yerine mevcut session ID'yi kullanır.
"""
import logging
from appium import webdriver

logger = logging.getLogger(__name__)


class TrueAttachRemote(webdriver.Remote):
    """
    Appium'un yeni bir session başlatmasını engelleyip mevcuttaki ID ile 
    yoluna devam etmesini sağlayan özel Remote sınıfı.
    
    Kullanım:
        driver = TrueAttachRemote(
            command_executor="http://127.0.0.1:4723/wd/hub",
            options=options,
            attach_id="existing-session-id"
        )
    """
    
    def __init__(self, command_executor, options, attach_id=None):
        """
        Args:
            command_executor: Appium server URL
            options: Platform options (UiAutomator2Options veya XCUITestOptions)
            attach_id: Bağlanılacak mevcut session ID (None ise yeni session başlatılır)
        """
        self._attach_session_id = attach_id
        # super().__init__ çağrıldığında start_session otomatik tetiklenir
        super().__init__(command_executor, options=options)

    def start_session(self, capabilities, browser_profile=None):
        """
        Session başlatma işlemini override eder.
        Eğer attach_id verilmişse yeni session başlatmak yerine mevcut ID'yi kullanır.
        """
        if hasattr(self, '_attach_session_id') and self._attach_session_id:
            logger.info(f"🔗 [TrueAttach] Linking to session {self._attach_session_id}")
            self.session_id = self._attach_session_id
            # Selenium 4 / Appium 2.x için gerekli minimal state
            self.capabilities = capabilities
            self.w3c = True
            # Appium'un session_id'yi tanıması için internal executor state'ini güncelle
            if hasattr(self, 'command_executor'):
                self.command_executor.w3c = True
        else:
            super().start_session(capabilities, browser_profile)
