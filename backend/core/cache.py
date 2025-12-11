import time
import sys
import logging
from collections import OrderedDict
from backend.core.constants import MAX_CACHE_SIZE, SCREENSHOT_CACHE_TTL

logger = logging.getLogger(__name__)


class CacheManager:
    """
    Centralized cache for storing scan results (Image + XML + Window Size)
    Shared between Scan and Action endpoints.
    """

    def __init__(self):
        self.cache = OrderedDict()
        self.last_scan_data = None  # En son yapılan taramayı hızlı erişim için tutar
        self.max_size_mb = 50 * 1024 * 1024  # 50MB Limit
        self.current_size = 0

    def save_scan(self, source_hash, image_data, page_source, window_size):
        """
        Tarama sonucunu önbelleğe kaydeder.
        """
        timestamp = time.time()

        # Veri paketi
        data_packet = {
            "image": image_data,
            "source": page_source,
            "window": window_size,
            "timestamp": timestamp
        }

        # Son taramayı güncelle (Tap işlemi için)
        self.last_scan_data = data_packet

        # Hash varsa cache'e ekle (Scan endpoint'i için)
        if source_hash:
            # Boyut hesabı (tahmini)
            size = sys.getsizeof(image_data) + sys.getsizeof(page_source)

            # Yer açma (Eviction)
            while self.current_size + size > self.max_size_mb and self.cache:
                removed_key, removed_val = self.cache.popitem(last=False)
                # Basit boyut tahmini düşümü
                removed_size = sys.getsizeof(removed_val["image"]) + sys.getsizeof(removed_val["source"])
                self.current_size -= removed_size

            self.cache[source_hash] = data_packet
            self.current_size += size

    def get_scan(self, source_hash):
        """Hash ile önbellekten veri getirir"""
        item = self.cache.get(source_hash)
        if item:
            # TTL Kontrolü
            if time.time() - item["timestamp"] > SCREENSHOT_CACHE_TTL:
                del self.cache[source_hash]
                return None
            return item
        return None

    def get_last_scan(self):
        """En son yapılan taramanın verisini döndürür"""
        # TTL Kontrolü
        if self.last_scan_data:
            if time.time() - self.last_scan_data["timestamp"] > SCREENSHOT_CACHE_TTL:
                self.last_scan_data = None
                return None
            return self.last_scan_data
        return None

    def clear(self):
        self.cache.clear()
        self.last_scan_data = None
        self.current_size = 0