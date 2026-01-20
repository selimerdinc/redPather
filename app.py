import sys
import os
import threading
import logging
import webview
from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

# .env dosyasını yükle
load_dotenv()

# Port ve Host ayarları
PORT = int(os.getenv('PORT', 5005))
HOST = os.getenv('HOST', '127.0.0.1')

# Paketleme sonrası dosya yollarını doğru bulmak için kritik fonksiyon
def get_resource_path(relative_path):
    try:
        # PyInstaller'ın oluşturduğu geçici dizin yolu
        base_path = sys._MEIPASS
    except Exception:
        # Geliştirme modu çalışma dizini
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

# Backend modüllerini sisteme tanıt
sys.path.append(get_resource_path("."))

from backend.api.routes import register_blueprints
from backend.api.middleware import setup_error_handlers

def create_app():
    # Templates ve Static yollarını açıkça tanımla
    app = Flask(__name__,
                template_folder=get_resource_path('templates'),
                static_folder=get_resource_path('static'))
    CORS(app)
    app.config['JSON_SORT_KEYS'] = False
    register_blueprints(app)
    setup_error_handlers(app)
    return app

flask_app = create_app()

def start_server():
    # Port ve host .env'den okunuyor
    flask_app.run(host=HOST, port=PORT, debug=False, use_reloader=False)

if __name__ == '__main__':
    # Flask sunucusunu arka planda başlat
    server_thread = threading.Thread(target=start_server)
    server_thread.daemon = True
    server_thread.start()

    # Masaüstü penceresini oluştur
    webview.create_window(
        'Red Pather v1.2.1 [Ultimate]',
        f'http://{HOST}:{PORT}',
        width=1400,
        height=900
    )
    webview.start()