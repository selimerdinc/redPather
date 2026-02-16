import pytest
import sys
import os

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.core.context import config_mgr, driver_mgr
from app import create_app

def test_config_manager_initialization():
    """Verify ConfigManager loads and has default keys"""
    assert config_mgr is not None
    config = config_mgr.get_all()
    assert "ANDROID_DEVICE" in config
    assert "GEMINI_API_KEY" in config

def test_driver_manager_initialization():
    """Verify DriverManager is initialized with dependencies"""
    assert driver_mgr is not None
    assert driver_mgr.config_mgr == config_mgr
    # Should start with no active drivers
    assert driver_mgr.drivers == {}

def test_flask_app_creation():
    """Verify Flask app is created with correct blueprints"""
    app = create_app()
    assert app is not None
    # Check if blueprints are registered
    rules = [str(p) for p in app.url_map.iter_rules()]
    assert any("/api/scan" in r for r in rules)
    assert any("/api/tap" in r for r in rules)
