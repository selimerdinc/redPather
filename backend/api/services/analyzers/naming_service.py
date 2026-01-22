"""
Naming Service - Variable name generation utilities
Handles semantic naming, text cleaning, and Turkish-English translation
"""
import re
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class NamingService:
    """Generates clean, semantic variable names for test automation"""

    # Text constraints
    MAX_TEXT_LENGTH = 50
    MAX_VAR_NAME_LENGTH = 35
    MAX_TITLE_LENGTH = 30
    MIN_TITLE_LENGTH = 2
    MAX_TEXT_WORDS = 10

    # Turkish to English mapping for variable names
    TR_EN_MAPPING = {
        "sirket": "company", "varlik": "asset", "ara": "search",
        "toplam": "total", "bakiye": "balance", "giris": "login",
        "cikis": "logout", "kayit": "register", "sifre": "password",
        "kullanici": "user", "hesap": "account", "profil": "profile",
        "ayarlar": "settings", "bildirim": "notification", "mesaj": "message",
        "anasayfa": "home", "detay": "detail", "liste": "list",
        "ekle": "add", "sil": "delete", "guncelle": "update",
        "iptal": "cancel", "onayla": "confirm", "devam": "continue",
        "geri": "back", "ileri": "next", "tamam": "ok",
        "veya": "or", "ve": "and", "adi": "name", "no": "no",
        "tarih": "date", "saat": "time", "tutar": "amount",
        "odeme": "payment", "kart": "card", "para": "money",
        "doviz": "currency", "alis": "buy", "satis": "sell",
        "duyuru": "announcement", "yardim": "help", "destek": "support",
        "dogrulama": "verification", "kod": "code", "onay": "approve", 
        "süre": "duration"
    }

    # Redundant words to remove from variable names
    REDUNDANT_WORDS = [
        "dashboard", "screen", "view", "page", "container",
        "wrapper", "holder", "cell", "row", "item"
    ]

    @classmethod
    def clean_text_for_var(cls, text: Optional[str]) -> str:
        """
        Clean text for use as variable name.
        Translates Turkish words to English and removes redundant words.

        Args:
            text: Text to clean

        Returns:
            str: Cleaned variable-safe text in English
        """
        if not text:
            return "element"

        # Turkish character mapping
        tr_map = str.maketrans("ğüşıöçĞÜŞİÖÇ", "gusiocGUSIOC")
        text = text.translate(tr_map)

        # Replace non-alphanumeric with underscore
        clean = re.sub(r'[^a-zA-Z0-9_]', '_', text)

        # Remove multiple underscores and trim
        clean = re.sub(r'_+', '_', clean).strip('_').lower()

        # Split into words and filter
        words = clean.split('_')
        processed_words = []
        for word in words:
            # Keep meaningful numbers (year, pin, price)
            # Filter out long random IDs
            if word.isdigit():
                if len(word) > 6:  # 6+ digits is likely an ID
                    continue
            
            # Keep alphanumeric words that aren't too long
            if any(char.isdigit() for char in word) and not word.isdigit():
                if len(word) > 15:
                    digit_count = sum(c.isdigit() for c in word)
                    if digit_count / len(word) > 0.7:
                        continue

            # Translate Turkish words to English
            translated = cls.TR_EN_MAPPING.get(word, word)
            processed_words.append(translated)
        
        # Remove redundant words
        filtered_words = [w for w in processed_words if w not in cls.REDUNDANT_WORDS]
        
        # Fallback if everything was filtered
        if not filtered_words:
            filtered_words = [w for w in processed_words if not w.isdigit()]
            
        if not filtered_words:
            return "element"

        clean = '_'.join(filtered_words)
        
        # Remove duplicate consecutive words
        words = clean.split('_')
        deduped = [words[0]] if words else []
        for w in words[1:]:
            if w != deduped[-1]:
                deduped.append(w)
        clean = '_'.join(deduped)

        # Truncate to max length
        return clean[:cls.MAX_VAR_NAME_LENGTH]

    @classmethod
    def get_element_type_suffix(cls, class_name: str, resource_id: str = "",
                                is_password: bool = False) -> str:
        """
        Determine element type suffix for variable naming

        Args:
            class_name: Element class name
            resource_id: Element resource ID
            is_password: Whether element is password field

        Returns:
            str: Type suffix (btn, input, lbl, etc.)
        """
        c = str(class_name).lower()
        r = str(resource_id).lower()

        if is_password:
            return "input"
        
        # Search detection (High priority)
        if "search" in r or "search" in c or "ara" in r:
            return "search_box"
            
        if "button" in c or "btn" in r:
            return "btn"
        if "edittext" in c or "field" in c or "input" in r:
            return "input"
        if "text" in c or "label" in c:
            return "lbl"
        if "image" in c or "icon" in r:
            return "icon"
        if "check" in c or "box" in c:
            return "cb"
        if "switch" in c or "toggle" in c:
            return "switch"

        return "el"

    @classmethod
    def parse_camel_case(cls, text: str) -> str:
        """
        Parse CamelCase to snake_case.
        Examples:
            userAccountButton -> user_account
            WalletBalanceCell -> wallet_balance
            notificationsButton -> notifications
        """
        if not text:
            return ""
        
        # Insert underscore before uppercase letters
        result = re.sub(r'([a-z])([A-Z])', r'\1_\2', text)
        result = result.lower()
        
        # Remove trailing type indicators
        for suffix in ('_button', '_btn', '_label', '_lbl', '_cell', '_view', 
                       '_screen', '_icon', '_image', '_field', '_text'):
            if result.endswith(suffix):
                result = result[:-len(suffix)]
                break
        
        return result.strip('_')

    @classmethod
    def generate_semantic_name(cls, info: Dict[str, Any], var_suffix: str, 
                               type_suffix: str) -> str:
        """
        Generate semantic variable name from element attributes.
        Produces short, English-only names.
        
        Priority:
        1. Display text (label/value) - most readable
        2. Last meaningful part of accessibility ID
        3. Last meaningful part of resource ID
        4. Fallback: element type
        
        Args:
            info: Element info dict with text, content_desc, res_id
            var_suffix: Original var suffix from locator strategy
            type_suffix: Element type suffix (btn, input, lbl, etc.)
        
        Returns:
            str: Clean semantic variable name part (short, English)
        """
        # Priority 1: Use display text if available and meaningful
        display_text = info.get('text', '') or info.get('content_desc', '')
        if display_text and len(display_text) <= 20:
            if not display_text.replace(' ', '').isdigit():
                clean = cls.clean_text_for_var(display_text)
                if 2 <= len(clean) <= 25:
                    return clean
        
        # Priority 2: Extract meaningful part from accessibility ID (iOS style)
        content_desc = info.get('content_desc', '')
        if content_desc and '.' in content_desc:
            parts = content_desc.split('.')
            
            for part in reversed(parts):
                if part.lower() in ('label', 'view', 'cell', 'button', 'icon', 
                                   'image', 'text', 'field', 'wrapper', 
                                   'container', 'title'):
                    continue
                parsed = cls.parse_camel_case(part)
                if parsed and len(parsed) >= 2:
                    clean = cls.clean_text_for_var(parsed)
                    if clean:
                        return clean[:25]
        
        # Priority 3: Extract from resource ID (Android style)
        res_id = info.get('res_id', '')
        if res_id:
            suffix = res_id.split('/')[-1] if '/' in res_id else res_id
            for prefix in ('btn_', 'tv_', 'et_', 'iv_', 'll_', 'rl_', 'fl_', 
                          'img_', 'lbl_'):
                if suffix.lower().startswith(prefix):
                    suffix = suffix[len(prefix):]
                    break
            clean = cls.clean_text_for_var(suffix)
            if 2 <= len(clean) <= 25:
                return clean
        
        # Priority 4: Use original var_suffix with cleanup
        if var_suffix:
            if '.' in var_suffix:
                parts = var_suffix.split('.')
                for part in reversed(parts):
                    parsed = cls.parse_camel_case(part)
                    if parsed and len(parsed) >= 2 and parsed.lower() not in (
                        'label', 'view', 'cell', 'button', 'icon', 'image', 
                        'text', 'field'
                    ):
                        return cls.clean_text_for_var(parsed)[:25]
            else:
                clean = cls.clean_text_for_var(var_suffix)
                if 2 <= len(clean) <= 25:
                    return clean
        
        # Fallback
        return type_suffix
