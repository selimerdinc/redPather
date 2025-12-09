from services.config_manager import ConfigManager
from services.driver_manager import DriverManager

# Global Singleton Instances
config_mgr = ConfigManager()
driver_mgr = DriverManager(config_mgr)