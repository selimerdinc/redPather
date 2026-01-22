"""
Output Formatters - Format mapping results to different output formats
Supports RF Variables, JSON, and Key=Value output formats
"""
import json
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)


class OutputFormatters:
    """Formats mapping results into various output formats"""

    @staticmethod
    def convert_accessibility_id_to_xpath(locator: str) -> str:
        """
        Convert accessibility_id locators with spaces to XPath format.
        
        Example:
            accessibility_id=Alarm Bulunmuyor, Her hisse...
            → xpath=//*[@label='Alarm Bulunmuyor']
        """
        if not locator or not locator.startswith("accessibility_id="):
            return locator
        
        # Extract the accessibility_id value
        acc_id_value = locator.replace("accessibility_id=", "", 1).strip()
        
        # Convert to XPath if it contains spaces
        if " " in acc_id_value:
            # Shorten long texts - take first meaningful part
            if "," in acc_id_value:
                acc_id_value = acc_id_value.split(",")[0].strip()
            elif len(acc_id_value) > 50:
                # Take first 3-4 words if too long
                words = acc_id_value.split()[:4]
                acc_id_value = " ".join(words)
            
            # Convert to XPath
            return f"xpath=//*[@label='{acc_id_value}']"
        
        # No spaces, keep as is
        return locator

    @classmethod
    def format_rf_variables(cls, mappings: List[Dict]) -> str:
        """
        Format mapping results as Robot Framework Variables.
        
        Args:
            mappings: List of mapping results
            
        Returns:
            RF Variables formatted string
        """
        lines = ["*** Variables ***"]
        
        for m in mappings:
            if m.get("target_locator"):
                # Convert locator to XPath if needed
                locator = cls.convert_accessibility_id_to_xpath(m['target_locator'])
                lines.append(f"{m['variable']}    {locator}")
            else:
                # Add as comment if no match found
                lines.append(f"# {m['variable']}    NO MATCH FOUND")
        
        if len(lines) == 1:
            lines.append("# Kaynak locator'lar için eşleşen bir element bulunamadı.")
            lines.append("# Lütfen hedef ekranın (iOS/Android) doğru yüklendiğinden emin olun.")
            
        return '\n'.join(lines)

    @staticmethod
    def format_json_output(mappings: List[Dict]) -> str:
        """
        Format mapping results as JSON.
        
        Args:
            mappings: List of mapping results
            
        Returns:
            JSON formatted string
        """
        result = {}
        
        for m in mappings:
            key = m.get("variable", "").replace("${", "").replace("}", "")
            if m.get("target_locator"):
                result[key] = m["target_locator"]
        
        return json.dumps(result, indent=2, ensure_ascii=False)

    @staticmethod
    def format_keyvalue_output(mappings: List[Dict]) -> str:
        """
        Format mapping results as Key=Value pairs.
        
        Args:
            mappings: List of mapping results
            
        Returns:
            Key=Value formatted string
        """
        lines = []
        
        for m in mappings:
            key = m.get("variable", "").replace("${", "").replace("}", "")
            if m.get("target_locator"):
                lines.append(f"{key}={m['target_locator']}")
        
        return '\n'.join(lines)

    @classmethod
    def format(cls, mappings: List[Dict], format_type: str) -> str:
        """
        Format mappings based on output format type.
        
        Args:
            mappings: List of mapping results
            format_type: "rf_variables", "json", or "keyvalue"
            
        Returns:
            Formatted output string
        """
        if format_type == "json":
            return cls.format_json_output(mappings)
        elif format_type == "keyvalue":
            return cls.format_keyvalue_output(mappings)
        else:  # rf_variables (default)
            return cls.format_rf_variables(mappings)
