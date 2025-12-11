"""
Global context - Singleton instances
"""
from backend.api.services.config_manager import ConfigManager
from backend.core.driver_manager import DriverManager

# Global Singleton Instances
config_mgr = ConfigManager()
driver_mgr = DriverManager(config_mgr)

def cleanup():
    """
    Cleanup resources on shutdown
    """
    driver_mgr.quit_all()