from typing import Dict, Any, Optional

import os
import logging
from typing import Dict, Any, Optional
from dotenv import load_dotenv

logger = logging.getLogger(__name__)


def str_to_bool(param: Any) -> bool:
    """
    Convert string/int/bool to boolean safely.

    Args:
        param: Value to convert

    Returns:
        bool: Converted boolean value
    """
    if isinstance(param, bool):
        return param
    if param is None:
        return False
    return str(param).lower() in ('true', '1', 'yes', 'on', 't', 'y')


class ConfigConstants:
    """Configuration constants and defaults"""
    # Defaults
    DEFAULT_ANDROID_DEVICE = "emulator-5554"
    DEFAULT_ANDROID_PKG = "com.app.package"
    DEFAULT_ANDROID_ACT = "com.app.Activity"
    DEFAULT_IOS_DEVICE = "iPhone 14"
    DEFAULT_IOS_BUNDLE = "com.app.bundle"
    DEFAULT_IOS_PLATFORM = "16.0"
    DEFAULT_IOS_SIGN = "iPhone Developer"

    # Validation
    MIN_PKG_LENGTH = 5
    MIN_BUNDLE_LENGTH = 5


class ConfigValidationError(Exception):
    """Custom exception for config validation errors"""
    pass


class ConfigManager:
    """
    Manages application configuration with hot-reload support.
    Reads from .env file and provides validation.
    """

    def __init__(self):
        self._config: Dict[str, Any] = {}
        self._last_modified: float = 0
        self._env_path = ".env"
        self._initialize()

    def _initialize(self):
        """Initialize configuration"""
        if not os.path.exists(self._env_path):
            logger.warning(f"{self._env_path} not found. Using defaults.")
            self._create_default_env()

        load_dotenv()
        self._config = self._load_config()
        self._last_modified = self._get_env_modified_time()
        logger.info("Configuration loaded successfully")

    def _create_default_env(self):
        """Create default .env file if not exists"""
        default_content = """# ANDROID CONFIG
ANDROID_DEVICE=emulator-5554
ANDROID_PKG=com.example.app
ANDROID_ACT=com.example.app.MainActivity
ANDROID_NO_RESET=True
ANDROID_FULL_RESET=False

# IOS CONFIG
IOS_DEVICE=iPhone 14
IOS_BUNDLE=com.example.app
IOS_UDID=
IOS_PLATFORM_VER=16.0
IOS_ORG_ID=
IOS_SIGN_ID=iPhone Developer
"""
        try:
            with open(self._env_path, 'w') as f:
                f.write(default_content)
            logger.info(f"Created default {self._env_path}")
        except Exception as e:
            logger.error(f"Failed to create default .env: {e}")

    def _get_env_modified_time(self) -> float:
        """Get .env file modification time"""
        if os.path.exists(self._env_path):
            return os.path.getmtime(self._env_path)
        return 0

    def _load_config(self) -> Dict[str, Any]:
        """Load and validate configuration"""
        config = {
            "ANDROID_DEVICE": os.getenv("ANDROID_DEVICE", ConfigConstants.DEFAULT_ANDROID_DEVICE),
            "ANDROID_PKG": os.getenv("ANDROID_PKG", ConfigConstants.DEFAULT_ANDROID_PKG),
            "ANDROID_ACT": os.getenv("ANDROID_ACT", ConfigConstants.DEFAULT_ANDROID_ACT),
            "ANDROID_NO_RESET": str_to_bool(os.getenv("ANDROID_NO_RESET", "True")),
            "ANDROID_FULL_RESET": str_to_bool(os.getenv("ANDROID_FULL_RESET", "False")),
            "IOS_DEVICE": os.getenv("IOS_DEVICE", ConfigConstants.DEFAULT_IOS_DEVICE),
            "IOS_BUNDLE": os.getenv("IOS_BUNDLE", ConfigConstants.DEFAULT_IOS_BUNDLE),
            "IOS_UDID": os.getenv("IOS_UDID", ""),
            "IOS_PLATFORM_VER": os.getenv("IOS_PLATFORM_VER", ConfigConstants.DEFAULT_IOS_PLATFORM),
            "IOS_ORG_ID": os.getenv("IOS_ORG_ID", ""),
            "IOS_SIGN_ID": os.getenv("IOS_SIGN_ID", ConfigConstants.DEFAULT_IOS_SIGN)
        }

        return config

    def validate_config(self, config: Dict[str, Any], platform: str) -> tuple[bool, Optional[str]]:
        """
        Validate configuration for given platform

        Args:
            config: Configuration dictionary
            platform: "ANDROID" or "IOS"

        Returns:
            tuple: (is_valid, error_message)
        """
        try:
            if platform == "ANDROID":
                pkg = config.get("ANDROID_PKG", "")
                act = config.get("ANDROID_ACT", "")

                if len(pkg) < ConfigConstants.MIN_PKG_LENGTH:
                    return False, f"Android package name too short (min {ConfigConstants.MIN_PKG_LENGTH} chars)"

                if len(act) < ConfigConstants.MIN_PKG_LENGTH:
                    return False, f"Android activity name too short (min {ConfigConstants.MIN_PKG_LENGTH} chars)"

                if not config.get("ANDROID_DEVICE"):
                    return False, "Android device name is required"

            elif platform == "IOS":
                bundle = config.get("IOS_BUNDLE", "")

                if len(bundle) < ConfigConstants.MIN_BUNDLE_LENGTH:
                    return False, f"iOS bundle ID too short (min {ConfigConstants.MIN_BUNDLE_LENGTH} chars)"

                if not config.get("IOS_DEVICE"):
                    return False, "iOS device name is required"

            return True, None

        except Exception as e:
            return False, f"Validation error: {str(e)}"

    def get_all(self) -> Dict[str, Any]:
        """
        Get all configuration with hot-reload support

        Returns:
            dict: Configuration dictionary
        """
        # Hot reload: check if .env was modified
        current_modified = self._get_env_modified_time()
        if current_modified > self._last_modified:
            try:
                load_dotenv(override=True)
                self._config = self._load_config()
                self._last_modified = current_modified
                logger.info("🔄 Config reloaded from .env")
            except Exception as e:
                logger.error(f"Failed to reload config: {e}")

        return self._config.copy()

    def get(self, key: str, default: Any = None) -> Any:
        """
        Get single configuration value

        Args:
            key: Configuration key
            default: Default value if key not found

        Returns:
            Configuration value or default
        """
        return self._config.get(key, default)

    def update(self, new_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update configuration at runtime

        Args:
            new_data: New configuration values

        Returns:
            dict: Updated configuration
        """
        for key, value in new_data.items():
            if key in self._config:
                # Convert boolean strings
                if isinstance(self._config[key], bool):
                    value = str_to_bool(value)
                self._config[key] = value
                logger.info(f"Config updated: {key} = {value}")

        return self._config.copy()

    def save_to_env(self, config: Dict[str, Any]) -> bool:
        """
        Save configuration to .env file

        Args:
            config: Configuration to save

        Returns:
            bool: Success status
        """
        try:
            lines = []
            lines.append("# ANDROID CONFIG\n")
            lines.append(f"ANDROID_DEVICE={config.get('ANDROID_DEVICE', '')}\n")
            lines.append(f"ANDROID_PKG={config.get('ANDROID_PKG', '')}\n")
            lines.append(f"ANDROID_ACT={config.get('ANDROID_ACT', '')}\n")
            lines.append(f"ANDROID_NO_RESET={config.get('ANDROID_NO_RESET', True)}\n")
            lines.append(f"ANDROID_FULL_RESET={config.get('ANDROID_FULL_RESET', False)}\n")
            lines.append("\n# IOS CONFIG\n")
            lines.append(f"IOS_DEVICE={config.get('IOS_DEVICE', '')}\n")
            lines.append(f"IOS_BUNDLE={config.get('IOS_BUNDLE', '')}\n")
            lines.append(f"IOS_UDID={config.get('IOS_UDID', '')}\n")
            lines.append(f"IOS_PLATFORM_VER={config.get('IOS_PLATFORM_VER', '')}\n")
            lines.append(f"IOS_ORG_ID={config.get('IOS_ORG_ID', '')}\n")
            lines.append(f"IOS_SIGN_ID={config.get('IOS_SIGN_ID', '')}\n")

            with open(self._env_path, 'w') as f:
                f.writelines(lines)

            logger.info("Configuration saved to .env")
            return True

        except Exception as e:
            logger.error(f"Failed to save config: {e}")
            return False