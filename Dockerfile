# Python 3.9 tabanlı hafif bir imaj kullan
FROM python:3.9-slim

# Çalışma dizinini ayarla
WORKDIR /app

# Sistem bağımlılıklarını yükle (Opencv, gcc vb. gerekirse)
RUN apt-get update && apt-get install -y \
    gcc \
    libxml2-dev \
    libxslt-dev \
    && rm -rf /var/lib/apt/lists/*

# Bağımlılıkları kopyala ve yükle
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Uygulama kodlarını kopyala
COPY . .

# Environment variable (Debug kapalı)
ENV FLASK_DEBUG=0
ENV PORT=5000

# Portu dışarı aç
EXPOSE 5000

# Uygulamayı başlat
CMD ["python", "app.py"]