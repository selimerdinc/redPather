import sys
import os

# PyInstaller'da çalışırken _MEIPASS backend'i içerir
if hasattr(sys, '_MEIPASS'):
    base_path = sys._MEIPASS
    # Backend klasörünü sys.path'e ekle
    backend_path = os.path.join(base_path)
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)
