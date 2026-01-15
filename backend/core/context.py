"""
Global context - Singleton instances
"""
from backend.api.services.config_manager import ConfigManager
from backend.core.driver_manager import DriverManager
from backend.core.cache import CacheManager
from backend.api.services.gemini_service import GeminiService
from backend.api.services.jira_service import jira_service

config_mgr = ConfigManager()
driver_mgr = DriverManager(config_mgr)
cache_mgr = CacheManager()

# ✅ FIX: GeminiService doğru parametrelerle başlat
gemini_service = GeminiService(
    api_key=config_mgr.get('GEMINI_API_KEY'),
    custom_prompt=config_mgr.get('AI_CUSTOM_PROMPT', '')
)


# Jira servisini kayıtlı config ile yapılandır
jira_config = config_mgr.get_all()
if jira_config.get('JIRA_URL'):
    jira_service.configure(
        base_url=jira_config.get('JIRA_URL'),
        email=jira_config.get('JIRA_EMAIL'),
        api_token=jira_config.get('JIRA_TOKEN'),
        project_key=jira_config.get('JIRA_PROJECT')
    )

def cleanup():
    """
    Cleanup resources on shutdown
    """
    driver_mgr.quit_all()
    cache_mgr.clear()