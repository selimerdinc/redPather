import os
from dotenv import load_dotenv

def str_to_bool(s):
    """'True' veya 'False' stringlerini Python boolean değerine çevirir."""
    # os.getenv'den gelen değeri kontrol ederken None için de koruma sağlar
    return str(s).lower() in ('true', '1', 't')

class ConfigManager:
    def __init__(self):
        # .env dosyasını yükle
        # Bu, os.getenv çağrılarından önce yapılmalıdır.
        load_dotenv()

        # Hassas bilgilerin varsayılan değerleri boş veya genel placeholder'lardır.
        # Bu sayede özel bilgiler kaynak kodunda görünmez.
        self._config = {
            # ANDROID
            "ANDROID_DEVICE": os.getenv("ANDROID_DEVICE", "emulator-5554"), # Genel Emulator Adı
            "ANDROID_PKG": os.getenv("ANDROID_PKG", "com.app.package"),      # Genel Placeholder
            "ANDROID_ACT": os.getenv("ANDROID_ACT", "com.app.Activity"),      # Genel Placeholder
            "ANDROID_NO_RESET": str_to_bool(os.getenv("ANDROID_NO_RESET", "True")),
            "ANDROID_FULL_RESET": str_to_bool(os.getenv("ANDROID_FULL_RESET", "False")),

            # IOS
            "IOS_DEVICE": os.getenv("IOS_DEVICE", "iPhone 14"),              # Genel Simülatör Adı
            "IOS_BUNDLE": os.getenv("IOS_BUNDLE", "com.app.bundle"),        # Genel Placeholder
            "IOS_UDID": os.getenv("IOS_UDID", ""),                          # HASSAS: Boş Bırakıldı
            "IOS_PLATFORM_VER": os.getenv("IOS_PLATFORM_VER", "16.0"),      # Genel Versiyon
            "IOS_ORG_ID": os.getenv("IOS_ORG_ID", ""),                      # HASSAS: Boş Bırakıldı
            "IOS_SIGN_ID": os.getenv("IOS_SIGN_ID", "iPhone Developer")      # Genel Apple Geliştirici ID'si
        }

    def get_all(self):
        return self._config

    def get(self, key):
        return self._config.get(key)

    def update(self, new_data):
        # Uygulama çalışırken UI'dan gelen değişiklikleri config içinde tutar
        for key, value in new_data.items():
            if key in self._config:
                self._config[key] = value
        return self._config