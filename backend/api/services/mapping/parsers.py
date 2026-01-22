"""
Locator Parsers - Parse different locator input formats
Supports RF Variables, JSON, and Key=Value formats
"""
import re
import json
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)


class LocatorParsers:
    """Parses locator input in various formats"""

    @staticmethod
    def parse_rf_variables(content: str) -> List[Dict]:
        """
        Parse Robot Framework Variables format.
        
        Input:
        *** Variables ***
        ${selector_login_email}    id=com.app:id/email
        ${selector_login_password}    xpath=//EditText[@hint='Password']
        
        Returns:
        [{variable: "${selector_login_email}", locator: "id=...", text_hint: "..."}, ...]
        """
        locators = []
        lines = content.strip().split('\n')
        
        for line in lines:
            line = line.strip()
            # Skip headers and empty lines
            if not line or line.startswith('***') or line.startswith('#'):
                continue
                
            # Parse: ${variable_name}    locator_value
            match = re.search(r'([\$|@|&]\{[^}]+\})\s*=?\s*(.+)', line)
            if not match:
                # Try $(...) format as well
                match = re.search(r'([\$|@|&]\([^)]+\))\s*=?\s*(.+)', line)
                
            if match:
                variable = match.group(1).strip()
                locator = match.group(2).strip()
            else:
                # Raw locator support (auto-generate variable name)
                if any(strat in line for strat in ['id=', 'xpath=', 'accessibility_id=', 'name=', 'label=', 'class=']):
                    variable = f"${{locator_{len(locators) + 1}}}"
                    locator = line
                else:
                    logger.debug(f"⏭️ Skipping invalid line: {line}")
                    continue
                
            # Extract text hint from variable name or locator
            text_hint = variable.replace('${', '').replace('}', '').replace('(', '').replace(')', '').replace('selector_', '').replace('_', ' ')
            if text_hint.startswith('locator_'):
                text_hint = locator.split('=')[-1].split('/')[-1].split('.')[-1]
                
            locators.append({
                "variable": variable,
                "locator": locator,
                "text_hint": text_hint.strip() or "element"
            })
        
        logger.info(f"📝 Parsed {len(locators)} locators from RF Variables format")
        return locators

    @staticmethod
    def parse_json_format(content: str) -> List[Dict]:
        """
        Parse JSON format.
        
        Input:
        {"selector_login_email": "id=com.app:id/email", ...}
        
        Returns:
        [{variable: "${selector_login_email}", locator: "id=...", text_hint: "..."}, ...]
        """
        locators = []
        
        try:
            data = json.loads(content)
            for key, value in data.items():
                variable = f"${{{key}}}" if not key.startswith('${') else key
                text_hint = key.replace('selector_', '').replace('_', ' ')
                locators.append({
                    "variable": variable,
                    "locator": value,
                    "text_hint": text_hint
                })
        except json.JSONDecodeError as e:
            logger.error(f"JSON parse error: {e}")
            return []
        
        logger.info(f"📝 Parsed {len(locators)} locators from JSON format")
        return locators

    @staticmethod
    def parse_keyvalue_format(content: str) -> List[Dict]:
        """
        Parse Key=Value format.
        
        Input:
        selector_login_email=id=com.app:id/email
        selector_login_password=xpath=//EditText[@hint='Password']
        
        Returns:
        [{variable: "${selector_login_email}", locator: "...", text_hint: "..."}, ...]
        """
        locators = []
        lines = content.strip().split('\n')
        
        for line in lines:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
                
            # Find first = and split there
            eq_idx = line.find('=')
            if eq_idx > 0:
                key = line[:eq_idx].strip()
                value = line[eq_idx + 1:].strip()
                
                variable = f"${{{key}}}" if not key.startswith('${') else key
                text_hint = key.replace('selector_', '').replace('_', ' ')
                
                locators.append({
                    "variable": variable,
                    "locator": value,
                    "text_hint": text_hint
                })
        
        logger.info(f"📝 Parsed {len(locators)} locators from Key=Value format")
        return locators

    @classmethod
    def parse(cls, content: str, format_type: str) -> List[Dict]:
        """
        Parse locators based on format type.
        
        Args:
            content: Raw locator content
            format_type: "rf_variables", "json", or "keyvalue"
            
        Returns:
            List of parsed locators
        """
        if format_type == "json":
            return cls.parse_json_format(content)
        elif format_type == "keyvalue":
            return cls.parse_keyvalue_format(content)
        else:  # rf_variables (default)
            return cls.parse_rf_variables(content)
