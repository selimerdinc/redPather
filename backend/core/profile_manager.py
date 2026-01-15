import json
import os
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

class ProfileManager:
    def __init__(self):
        # ✅ Persistent path in user home directory
        home = os.path.expanduser("~")
        self.config_dir = os.path.join(home, ".redpather")
        if not os.path.exists(self.config_dir):
            os.makedirs(self.config_dir)
        
        self.profiles_file = os.path.join(self.config_dir, "profiles.json")
        self.profiles = []
        self._load()

    def _load(self):
        """Load profiles from file system"""
        if os.path.exists(self.profiles_file):
            try:
                with open(self.profiles_file, 'r', encoding='utf-8') as f:
                    self.profiles = json.load(f)
                logger.info(f"Loaded {len(self.profiles)} profiles from {self.profiles_file}")
            except Exception as e:
                logger.error(f"Failed to load profiles: {e}")
                self.profiles = []
        else:
            self.profiles = []

    def _save(self):
        """Save profiles to file system"""
        try:
            with open(self.profiles_file, 'w', encoding='utf-8') as f:
                json.dump(self.profiles, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            logger.error(f"Failed to save profiles: {e}")
            return False

    def get_all(self) -> List[Dict]:
        return self.profiles

    def update_all(self, profiles: List[Dict]):
        self.profiles = profiles
        return self._save()

profile_mgr = ProfileManager()
