import os

from dotenv import load_dotenv


def str_to_bool(param):
    pass


class ConfigManager:
    def __init__(self):
        load_dotenv()
        self._config = self._load_config()
        self._last_modified = self._get_env_modified_time()

    def _get_env_modified_time(self):
        """ENV dosya değişiklik zamanı"""
        import os
        env_path = ".env"
        if os.path.exists(env_path):
            return os.path.getmtime(env_path)
        return 0

    def _load_config(self):
        """Config yükleme"""
        return {
            "ANDROID_DEVICE": os.getenv("ANDROID_DEVICE", "emulator-5554"),
            "ANDROID_PKG": os.getenv("ANDROID_PKG", "com.app.package"),
            "ANDROID_ACT": os.getenv("ANDROID_ACT", "com.app.Activity"),
            "ANDROID_NO_RESET": str_to_bool(os.getenv("ANDROID_NO_RESET", "True")),
            "ANDROID_FULL_RESET": str_to_bool(os.getenv("ANDROID_FULL_RESET", "False")),
            "IOS_DEVICE": os.getenv("IOS_DEVICE", "iPhone 14"),
            "IOS_BUNDLE": os.getenv("IOS_BUNDLE", "com.app.bundle"),
            "IOS_UDID": os.getenv("IOS_UDID", ""),
            "IOS_PLATFORM_VER": os.getenv("IOS_PLATFORM_VER", "16.0"),
            "IOS_ORG_ID": os.getenv("IOS_ORG_ID", ""),
            "IOS_SIGN_ID": os.getenv("IOS_SIGN_ID", "iPhone Developer")
        }

    def get_all(self):
        # ✅ Hot reload: .env değiştiyse otomatik yükle
        current_modified = self._get_env_modified_time()
        if current_modified > self._last_modified:
            load_dotenv(override=True)
            self._config = self._load_config()
            self._last_modified = current_modified
            print("🔄 Config reloaded from .env")

        return self._config

    def update(self, new_data):
        # Runtime config update
        for key, value in new_data.items():
            if key in self._config:
                self._config[key] = value
        return self._config