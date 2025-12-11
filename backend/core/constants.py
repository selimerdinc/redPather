"""
Application-wide constants
"""

# Platform definitions
VALID_PLATFORMS = ["ANDROID", "IOS"]

# Cache settings
MAX_CACHE_SIZE = 10
SCREENSHOT_CACHE_TTL = 300  # seconds

# API settings
API_TIMEOUT = 30  # seconds
MAX_RETRY_ATTEMPTS = 3

# Element detection
MIN_ELEMENT_WIDTH = 10
MIN_ELEMENT_HEIGHT = 10
MIN_ELEMENT_AREA = 100
MAX_ELEMENT_SCREEN_RATIO = 0.90

# XPath generation
MAX_XPATH_DEPTH = 4
MAX_RELATIVE_SEARCH = 15

# Image optimization
IMAGE_QUALITY = 60
IMAGE_FORMAT = "JPEG"

# Appium settings
APPIUM_SERVER_URL = "http://127.0.0.1:4723/wd/hub"
COMMAND_TIMEOUT = 3600

# Element filtering
IGNORE_CLASSES_ANDROID = [
    "android.widget.FrameLayout",
    "android.widget.LinearLayout",
    "android.widget.RelativeLayout",
    "android.view.View"
]

IGNORE_CLASSES_IOS = [
    "XCUIElementTypeWindow",
    "XCUIElementTypeOther",
    "XCUIElementTypeApplication",
    "XCUIElementTypeScrollView",
    "XCUIElementTypeTable",
    "XCUIElementTypeStatusBar",
    "XCUIElementTypeNavigationBar"
]

BLACKLIST_IDS = [
    "android:id/content",
    "android:id/statusBarBackground",
    "android:id/navigationBarBackground",
    "android:id/home"
]

# Error messages
ERROR_MESSAGES = {
    "DRIVER_NOT_FOUND": "Driver not initialized. Please check Appium connection.",
    "INVALID_PLATFORM": "Invalid platform. Must be ANDROID or IOS.",
    "SCREENSHOT_FAILED": "Failed to capture screenshot. Device may be locked.",
    "XML_PARSE_FAILED": "Failed to parse page source. Invalid XML structure.",
    "CONFIG_INVALID": "Configuration validation failed.",
    "ELEMENT_NOT_FOUND": "Element not found on current screen.",
    "TIMEOUT": "Operation timed out. Please try again."
}

# HTTP Status codes
HTTP_OK = 200
HTTP_BAD_REQUEST = 400
HTTP_NOT_FOUND = 404
HTTP_INTERNAL_ERROR = 500
HTTP_TIMEOUT = 504