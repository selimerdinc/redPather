"""
Input Validation & Sanitization Utilities
Security-focused input handling for Red Pather
"""
import re
import html
from typing import Any, Optional
import logging

logger = logging.getLogger(__name__)

# Tehlikeli karakterler ve patternler
DANGEROUS_PATTERNS = [
    r'<script',          # XSS
    r'javascript:',      # XSS
    r'on\w+\s*=',        # Event handlers
    r'\.\./\.\.',        # Path traversal
    r';\s*(rm|del|format)', # Command injection
]

# Maksimum input uzunlukları
MAX_LENGTHS = {
    'text_input': 10000,
    'page_name': 100,
    'element_name': 200,
    'xpath': 2000,
    'api_key': 500,
    'url': 2048,
}


def sanitize_string(value: str, max_length: int = 1000) -> str:
    """
    Sanitize string input
    - HTML escape
    - Length limit
    - Strip whitespace
    """
    if not isinstance(value, str):
        return str(value)[:max_length]
    
    # Strip and limit length
    value = value.strip()[:max_length]
    
    # HTML escape
    value = html.escape(value)
    
    return value


def validate_input(value: Any, input_type: str = 'text_input') -> tuple[bool, str]:
    """
    Validate input against security rules
    
    Returns:
        (is_valid, sanitized_value_or_error_message)
    """
    if value is None:
        return False, "Input cannot be None"
    
    str_value = str(value)
    
    # Check max length
    max_len = MAX_LENGTHS.get(input_type, 1000)
    if len(str_value) > max_len:
        return False, f"Input too long (max {max_len} chars)"
    
    # Check for dangerous patterns
    for pattern in DANGEROUS_PATTERNS:
        if re.search(pattern, str_value, re.IGNORECASE):
            logger.warning(f"Dangerous pattern detected: {pattern[:20]}...")
            return False, "Invalid characters detected"
    
    return True, sanitize_string(str_value, max_len)


def sanitize_xpath(xpath: str) -> str:
    """
    Sanitize XPath expression
    """
    if not xpath:
        return ""
    
    # XPath için izin verilen karakterler
    # Sadece bazı tehlikeli durumları engelle
    xpath = xpath.strip()[:MAX_LENGTHS['xpath']]
    
    # Çift tırnak içindeki değerleri escape et
    xpath = xpath.replace("'", "\\'")
    
    return xpath


def sanitize_page_name(name: str) -> str:
    """
    Sanitize page name for variable naming
    Only allow alphanumeric, underscore
    """
    if not name:
        return "unknown_page"
    
    # Sadece alfanumerik ve underscore
    sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', name.strip())
    
    # Ardışık underscore'ları tek yap
    sanitized = re.sub(r'_+', '_', sanitized)
    
    # Baş ve sondaki underscore'ları kaldır
    sanitized = sanitized.strip('_')
    
    # Max uzunluk
    return sanitized[:MAX_LENGTHS['page_name']] or "unknown_page"


def is_safe_url(url: str) -> bool:
    """
    Check if URL is safe (local only for this app)
    """
    if not url:
        return False
    
    # Sadece localhost ve 127.0.0.1 izinli
    safe_patterns = [
        r'^http://localhost',
        r'^http://127\.0\.0\.1',
        r'^https://localhost',
        r'^https://127\.0\.0\.1',
    ]
    
    return any(re.match(p, url, re.IGNORECASE) for p in safe_patterns)


def mask_sensitive_data(text: str) -> str:
    """
    Mask sensitive data in logs
    """
    if not text:
        return text
    
    sensitive_keywords = ['password', 'sifre', 'pin', 'token', 'secret', 'key', 'api_key']
    
    text_lower = text.lower()
    if any(kw in text_lower for kw in sensitive_keywords):
        return '***MASKED***'
    
    return text
