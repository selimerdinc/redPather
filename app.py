from flask import Flask
from routes.api import api_bp

app = Flask(__name__)

# Route'ları (Controller) uygulamaya kaydet
app.register_blueprint(api_bp)

if __name__ == '__main__':
    print("🚀 QA Red Mapper Server Starting...")
    print("🌍 Open http://127.0.0.1:5000 in your browser")
    app.run(debug=True, port=5000)