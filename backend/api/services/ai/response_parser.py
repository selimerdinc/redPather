"""
AI Response Parser - Utilities for parsing AI responses
Handles JSON extraction, markdown cleanup, and error handling
"""
import json
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


class ResponseParser:
    """Parses and cleans AI responses"""

    @staticmethod
    def clean_json_response(text: str) -> Optional[Any]:
        """
        Cleans markdown blocks and extracts JSON from AI response.
        
        Args:
            text: Raw AI response text
            
        Returns:
            Parsed JSON object/array or None if parsing fails
        """
        if not text:
            return None
            
        cleaned = text.strip()
        
        # Remove markdown code blocks
        if "```json" in cleaned:
            cleaned = cleaned.split("```json")[1].split("```")[0].strip()
        elif "```" in cleaned:
            parts = cleaned.split("```")
            if len(parts) >= 3:
                cleaned = parts[1].strip()
            else:
                cleaned = parts[0].strip()
                
        # Remove leading "json" keyword
        cleaned = cleaned.strip()
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
            
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI JSON response: {e}\nOriginal text: {text[:200]}...")
            return None

    @staticmethod
    def clean_code_response(text: str) -> str:
        """
        Cleans markdown code blocks from AI response.
        
        Args:
            text: Raw AI response text
            
        Returns:
            Cleaned code without markdown formatting
        """
        if not text:
            return ""
            
        result = text.strip()
        
        # Remove markdown code blocks
        if result.startswith("```"):
            lines = result.split("\n")
            lines = [l for l in lines if not l.startswith("```")]
            result = "\n".join(lines)
        
        return result

    @staticmethod
    def extract_robot_sections(text: str) -> dict:
        """
        Extracts Variables and Keywords sections from Robot Framework code.
        
        Args:
            text: Robot Framework code
            
        Returns:
            dict: {"variables": str, "keywords": str, "full_output": str}
        """
        result_text = ResponseParser.clean_code_response(text)
        
        variables = ""
        keywords = ""
        
        if "*** Variables ***" in result_text:
            parts = result_text.split("*** Keywords ***")
            variables = parts[0].strip()
            if len(parts) > 1:
                keywords = "*** Keywords ***" + parts[1].strip()
        
        return {
            "variables": variables,
            "keywords": keywords,
            "full_output": result_text
        }

    @staticmethod
    def clean_page_name(text: str) -> str:
        """
        Cleans and normalizes page name from AI response.
        
        Args:
            text: Raw page name response
            
        Returns:
            Cleaned page name (lowercase, underscores, alphanumeric only)
        """
        if not text:
            return "page"
            
        result = text.strip().lower().replace(" ", "_").replace("-", "_")
        # Keep only alphanumeric and underscore
        result = ''.join(c for c in result if c.isalnum() or c == '_')
        return result if result else "page"

    @staticmethod
    def validate_mapping_result(result: list) -> list:
        """
        Validates cross-platform mapping result.
        
        Args:
            result: Parsed mapping result
            
        Returns:
            Validated list or empty list if invalid
        """
        if not isinstance(result, list):
            logger.warning("Mapping result is not a list")
            return []
            
        validated = []
        for item in result:
            if not isinstance(item, dict):
                continue
            if "variable" not in item:
                continue
            # Ensure required fields exist
            validated.append({
                "variable": item.get("variable", ""),
                "source_locator": item.get("source_locator", ""),
                "target_locator": item.get("target_locator"),
                "confidence": item.get("confidence", 0),
                "match_reason": item.get("match_reason", "Unknown")
            })
        
        return validated
