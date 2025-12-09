import time
from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.options.ios import XCUITestOptions
from selenium.webdriver.common.actions.action_builder import ActionBuilder
from selenium.webdriver.common.actions.pointer_input import PointerInput
from selenium.webdriver.common.actions import interaction


class DriverManager:
    def __init__(self, config_manager):
        self.drivers = {}  # {"ANDROID": driver, "IOS": driver}
        self.platform = "ANDROID"
        self.config_mgr = config_manager

    def get_driver(self):
        return self.drivers.get(self.platform)

    def is_active(self, platform=None):
        target = platform or self.platform
        driver = self.drivers.get(target)
        if not driver: return False
        try:
            driver.current_activity
            return True
        except:
            return False

    def start_driver(self, platform):
        # ✅ Platform değiştirmek session kaybettirmiyor!
        if platform in self.drivers and self.is_active(platform):
            self.platform = platform
            return self.drivers[platform]

        # Eski driver'ı temizle (varsa)
        if platform in self.drivers:
            try:
                self.drivers[platform].quit()
            except:
                pass
            del self.drivers[platform]

        self.platform = platform
        print(f"🚀 {platform} Driver Initializing...")
        cfg = self.config_mgr.get_all()

        if platform == "ANDROID":
            options = UiAutomator2Options()
            options.platform_name = "Android"
            options.automation_name = "UIAutomator2"
            options.device_name = cfg["ANDROID_DEVICE"]
            options.app_package = cfg["ANDROID_PKG"]
            options.app_activity = cfg["ANDROID_ACT"]
            options.no_reset = cfg["ANDROID_NO_RESET"]
            options.full_reset = cfg["ANDROID_FULL_RESET"]
            options.new_command_timeout = 3600
            options.set_capability("settings[ignoreUnimportantViews]", True)
            options.set_capability("settings[waitForIdleTimeout]", 100)
        else:
            options = XCUITestOptions()
            options.platform_name = "iOS"
            options.automation_name = "XCUITest"
            options.device_name = cfg["IOS_DEVICE"]
            options.bundle_id = cfg["IOS_BUNDLE"]
            options.udid = cfg["IOS_UDID"]
            options.set_capability("appium:xcodeOrgId", cfg["IOS_ORG_ID"])
            options.set_capability("appium:xcodeSigningId", cfg["IOS_SIGN_ID"])
            options.no_reset = True
            options.new_command_timeout = 3600
            options.set_capability("mjpegServerScreenshotQuality", 25)
            options.set_capability("settings[snapshotMaxDepth]", 60)
            options.set_capability("settings[waitForIdleTimeout]", 0.1)

        self.drivers[platform] = webdriver.Remote("http://127.0.0.1:4723/wd/hub", options=options)
        return self.drivers[platform]

    def quit_driver(self, platform=None):
        # ✅ Belirli bir platform'u kapat veya hepsini
        if platform:
            if platform in self.drivers:
                try:
                    self.drivers[platform].quit()
                except:
                    pass
                del self.drivers[platform]
        else:
            # Tüm driver'ları kapat
            for p in list(self.drivers.keys()):
                try:
                    self.drivers[p].quit()
                except:
                    pass
            self.drivers = {}

    def get_window_size(self):
        # ❌ HATA: if self.driver: return self.driver.get_window_size()
        # ✅ DÜZELTME:
        driver = self.get_driver()
        if driver: return driver.get_window_size()
        return {"width": 0, "height": 0}

    def perform_tap(self, x, y):
        driver = self.get_driver()
        if not driver:
            print("❌ Hata: Sürücü aktif değil.")
            return

        print(f"👉 Tapping at {x}, {y} on {self.platform}")
        if self.platform == "IOS":
            driver.execute_script("mobile: tap", {"x": x, "y": y})
        else:
            actions = ActionBuilder(driver) # <-- driver değişkeni kullanıldı
            p = actions.add_pointer_input(interaction.POINTER_TOUCH, "finger")
            p.create_pointer_move(duration=0, x=x, y=y)
            p.create_pointer_down(button=0)
            p.create_pause(0.05)
            p.create_pointer_up(button=0)
            actions.perform()
        time.sleep(0.5)

    def perform_scroll(self, direction):
        if self.platform == "IOS":
            self.driver.execute_script("mobile: scroll", {"direction": direction})
        else:
            win = self.get_window_size()
            cx = win['width'] // 2
            h = win['height']
            if direction == 'down':
                sy, ey = int(h * 0.7), int(h * 0.3)
            else:
                sy, ey = int(h * 0.3), int(h * 0.7)
            actions = ActionBuilder(self.driver)
            p = actions.add_pointer_input(interaction.POINTER_TOUCH, "finger")
            p.create_pointer_move(duration=0, x=cx, y=sy)
            p.create_pointer_down(button=0)
            p.create_pause(0.05)
            p.create_pointer_move(duration=300, x=cx, y=ey)
            p.create_pointer_up(button=0)
            actions.perform()
        time.sleep(0.8)

    def go_back(self):
        if self.driver:
            self.driver.back()
            time.sleep(0.5)

    def hide_keyboard(self):
        if not self.driver: return
        if self.platform == "IOS":
            try:
                self.driver.hide_keyboard()
            except:
                self.driver.execute_script("mobile: hideKeyboard", {"strategy": "tapOutside"})
        else:
            try:
                self.driver.hide_keyboard()
            except:
                pass
        time.sleep(1)