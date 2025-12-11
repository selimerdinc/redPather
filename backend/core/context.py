"""
Global context - Singleton instances
"""
from backend.api.services.config_manager import ConfigManager
from backend.core.driver_manager import DriverManager
from backend.core.cache import CacheManager

config_mgr = ConfigManager()
driver_mgr = DriverManager(config_mgr)
cache_mgr = CacheManager()

def cleanup():
    """
    Cleanup resources on shutdown
    """
    driver_mgr.quit_all()
    cache_mgr.clear()