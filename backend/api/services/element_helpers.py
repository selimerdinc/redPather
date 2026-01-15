"""
Element Helper Utilities
Centralized element finding and locator generation logic.
"""
import logging
from typing import Optional, Dict, Any, Tuple
from lxml import etree
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

from backend.core.constants import ELEMENT_FIND_TIMEOUT

logger = logging.getLogger(__name__)


class ElementHelper:
    """
    Centralized element finding utilities for Actions.
    Reduces code duplication across tap, send_keys, verify_locator.
    """

    @staticmethod
    def extract_element_info(elem: etree.Element, platform: str) -> Dict[str, Any]:
        """
        Extract element info from XML element.
        
        Args:
            elem: lxml Element
            platform: 'ANDROID' or 'IOS'
            
        Returns:
            dict with res_id, content_desc, text, class_name, is_password
        """
        if platform == "ANDROID":
            return {
                "res_id": elem.get("resource-id", ""),
                "content_desc": elem.get("content-desc", ""),
                "text": elem.get("text", ""),
                "class_name": elem.get("class", ""),
                "is_password": elem.get("password") == "true"
            }
        else:
            return {
                "res_id": "",
                "content_desc": elem.get("name", ""),
                "text": elem.get("label") or elem.get("value", ""),
                "class_name": elem.get("type", ""),
                "is_password": "Secure" in str(elem.get("type", ""))
            }

    @staticmethod
    def find_element_by_locator(driver, locator: str, platform: str, timeout: int = ELEMENT_FIND_TIMEOUT):
        """
        Find element by locator string with automatic strategy detection.
        
        Args:
            driver: Appium WebDriver
            locator: Locator string (ID, accessibility_id, or XPath)
            platform: 'ANDROID' or 'IOS'
            timeout: Wait timeout in seconds
            
        Returns:
            WebElement or None
        """
        if not locator or not driver:
            return None

        strategies = ElementHelper._get_locator_strategies(locator, platform)
        
        for strategy, value in strategies:
            try:
                wait = WebDriverWait(driver, timeout)
                element = wait.until(EC.presence_of_element_located((strategy, value)))
                logger.debug(f"Element found with strategy: {strategy}")
                return element
            except (TimeoutException, NoSuchElementException):
                continue
            except Exception as e:
                logger.warning(f"Element find error with {strategy}: {e}")
                continue
        
        logger.warning(f"Element not found: {locator}")
        return None

    @staticmethod
    def _get_locator_strategies(locator: str, platform: str) -> list:
        """
        Determine locator strategies to try based on locator format.
        
        Returns:
            List of (AppiumBy, value) tuples to try in order
        """
        strategies = []
        
        # XPath detection
        if locator.startswith("//") or locator.startswith("(//"):
            strategies.append((AppiumBy.XPATH, locator))
            return strategies
        
        # ID detection (Android)
        if platform == "ANDROID":
            if ":" in locator or locator.startswith("android"):
                strategies.append((AppiumBy.ID, locator))
            else:
                # Try accessibility ID first, then ID
                strategies.append((AppiumBy.ACCESSIBILITY_ID, locator))
                strategies.append((AppiumBy.ID, locator))
        
        # iOS strategies
        else:
            strategies.append((AppiumBy.ACCESSIBILITY_ID, locator))
            # iOS-specific name based locator
            strategies.append((AppiumBy.NAME, locator))
        
        return strategies

    @staticmethod
    def verify_locator_count(driver, locator: str, platform: str, timeout: int = 3) -> Tuple[bool, int]:
        """
        Verify if locator finds elements and return count.
        
        Args:
            driver: Appium WebDriver
            locator: Locator string
            platform: Platform name
            timeout: Wait timeout
            
        Returns:
            Tuple of (success: bool, count: int)
        """
        if not locator or not driver:
            return (False, 0)

        strategies = ElementHelper._get_locator_strategies(locator, platform)
        
        for strategy, value in strategies:
            try:
                wait = WebDriverWait(driver, timeout)
                elements = wait.until(EC.presence_of_all_elements_located((strategy, value)))
                count = len(elements)
                if count > 0:
                    return (True, count)
            except TimeoutException:
                continue
            except Exception as e:
                logger.debug(f"Verify locator error: {e}")
                continue
        
        return (False, 0)

    @staticmethod
    def get_element_text(element) -> str:
        """
        Get text from element with fallback strategies.
        
        Args:
            element: WebElement
            
        Returns:
            Text string or empty string
        """
        if not element:
            return ""
        
        try:
            # Try standard text attribute
            text = element.text
            if text:
                return text.strip()
            
            # Fallback to content-desc / accessibility
            text = element.get_attribute("content-desc")
            if text:
                return text.strip()
            
            # Fallback to name (iOS)
            text = element.get_attribute("name")
            if text:
                return text.strip()
            
            # Fallback to value
            text = element.get_attribute("value")
            if text:
                return text.strip()
                
        except Exception as e:
            logger.warning(f"Get element text error: {e}")
        
        return ""


# Singleton instance
element_helper = ElementHelper()
