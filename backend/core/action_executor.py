"""
ActionExecutor - Cihaz üzerinde işlem yapan metodlar.
Tap, scroll, back, keyboard gizleme gibi cihaz etkileşimleri.
"""
import time
import logging
from selenium.webdriver.common.actions.action_builder import ActionBuilder
from selenium.webdriver.common.actions import interaction

logger = logging.getLogger(__name__)


class ActionExecutor:
    """
    Appium driver üzerinden cihaz etkileşimlerini gerçekleştirir.
    Platform-agnostik tasarım: Android ve iOS için ayrı implementasyonlar içerir.
    """
    
    def perform_tap(self, driver, platform: str, x: int, y: int) -> bool:
        """
        Ekrana belirtilen koordinatlarda dokunma işlemi yapar.
        
        Args:
            driver: Aktif Appium driver
            platform: "ANDROID" veya "IOS"
            x: X koordinatı
            y: Y koordinatı
            
        Returns:
            bool: İşlem başarılı ise True
        """
        if not driver:
            logger.error("❌ Tap failed: No active driver")
            return False

        try:
            logger.info(f"👉 Tapping at {x}, {y} on {platform}")
            if platform == "IOS":
                # iOS için mobile:tap daha güvenilir
                driver.execute_script("mobile: tap", {"x": x, "y": y})
            else:
                # Android için W3C ActionBuilder
                actions = ActionBuilder(driver)
                p = actions.add_pointer_input(interaction.POINTER_TOUCH, "finger")
                p.create_pointer_move(duration=0, x=x, y=y)
                p.create_pointer_down(button=0)
                p.create_pause(0.05)
                p.create_pointer_up(button=0)
                actions.perform()
            time.sleep(0.3)
            return True
        except Exception as e:
            logger.error(f"Tap failed: {e}")
            return False

    def perform_scroll(self, driver, platform: str, direction: str, window_size: dict) -> bool:
        """
        Ekranı belirtilen yönde kaydırır.
        
        Args:
            driver: Aktif Appium driver
            platform: "ANDROID" veya "IOS"
            direction: "up" veya "down"
            window_size: {"width": int, "height": int}
            
        Returns:
            bool: İşlem başarılı ise True
        """
        if not driver:
            logger.error("❌ Scroll failed: No active driver")
            return False

        try:
            if platform == "IOS":
                driver.execute_script("mobile: scroll", {"direction": direction})
            else:
                cx = window_size['width'] // 2
                h = window_size['height']
                if direction == 'down':
                    sy, ey = int(h * 0.7), int(h * 0.3)
                else:
                    sy, ey = int(h * 0.3), int(h * 0.7)

                actions = ActionBuilder(driver)
                p = actions.add_pointer_input(interaction.POINTER_TOUCH, "finger")
                p.create_pointer_move(duration=0, x=cx, y=sy)
                p.create_pointer_down(button=0)
                p.create_pause(0.05)
                p.create_pointer_move(duration=300, x=cx, y=ey)
                p.create_pointer_up(button=0)
                actions.perform()
            time.sleep(0.8)
            return True
        except Exception as e:
            logger.error(f"Scroll failed: {e}")
            return False

    def go_back(self, driver) -> bool:
        """
        Geri navigasyon yapar.
        
        Args:
            driver: Aktif Appium driver
            
        Returns:
            bool: İşlem başarılı ise True
        """
        if not driver:
            return False
        try:
            driver.back()
            time.sleep(0.5)
            return True
        except Exception as e:
            logger.error(f"Back failed: {e}")
            return False

    def hide_keyboard(self, driver, platform: str) -> bool:
        """
        Ekrandaki klavyeyi gizler.
        
        Args:
            driver: Aktif Appium driver
            platform: "ANDROID" veya "IOS"
            
        Returns:
            bool: İşlem başarılı ise True
        """
        if not driver:
            return False

        try:
            if platform == "IOS":
                try:
                    driver.hide_keyboard()
                except Exception as ios_kb_err:
                    logger.debug(f"iOS standard hide_keyboard failed, trying tapOutside: {ios_kb_err}")
                    driver.execute_script("mobile: hideKeyboard", {"strategy": "tapOutside"})
            else:
                try:
                    driver.hide_keyboard()
                except Exception as android_kb_err:
                    logger.debug(f"Android hide_keyboard not available: {android_kb_err}")
            time.sleep(1)
            return True
        except Exception as e:
            logger.warning(f"Hide keyboard failed: {e}")
            return False

    def get_device_logs(self, driver, platform: str, log_type: str = None) -> list:
        """
        Cihazdan log alır.
        
        Args:
            driver: Aktif Appium driver
            platform: "ANDROID" veya "IOS"
            log_type: Log tipi (None ise otomatik seçilir)
            
        Returns:
            list: Log kayıtları
        """
        if not driver:
            return []
        try:
            available_types = driver.log_types
            if not log_type:
                if platform == "ANDROID":
                    log_type = "logcat" if "logcat" in available_types else available_types[0]
                else:
                    log_type = "syslog" if "syslog" in available_types else available_types[0]
            
            if log_type in available_types:
                return driver.get_log(log_type)
            return []
        except Exception as e:
            logger.error(f"Failed to get logs: {e}")
            return []
