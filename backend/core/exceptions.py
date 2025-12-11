"""
Custom exceptions for Red Pather
"""


class RedPatherError(Exception):
    """Base exception for all Red Pather errors"""
    def __init__(self, message: str, details: str = None):
        self.message = message
        self.details = details
        super().__init__(self.message)


class DriverError(RedPatherError):
    """Driver connection/initialization errors"""
    pass


class DriverNotFoundError(DriverError):
    """Driver not found or not active"""
    pass


class DriverTimeoutError(DriverError):
    """Driver operation timeout"""
    pass


class ElementError(RedPatherError):
    """Element-related errors"""
    pass


class ElementNotFoundError(ElementError):
    """Element not found on page"""
    pass


class ParseError(RedPatherError):
    """XML/HTML parsing errors"""
    pass


class ConfigurationError(RedPatherError):
    """Configuration validation errors"""
    pass


class ValidationError(RedPatherError):
    """Data validation errors"""
    pass

class AppiumConnectionError(DriverError):
    """Appium server ulaşılamıyor"""
    pass

class DeviceNotFoundError(DriverError):
    """Cihaz bulunamadı"""
    pass

class AppNotInstalledError(DriverError):
    """Uygulama cihazda yüklü değil"""
    pass
