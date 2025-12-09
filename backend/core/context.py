"""
Global context - Singleton instances
"""
from backend.services.config_manager import ConfigManager
from backend.core.driver_manager import DriverManager

# Global Singleton Instances
config_mgr = ConfigManager()
driver_mgr = DriverManager(config_mgr)

def cleanup():
    """
    Cleanup resources on shutdown
    """
    driver_mgr.quit_all()
    driver_mgr.session_mgr.stop_cleanup_thread()

# Register cleanup on exit
import atexit
atexit.register(cleanup)