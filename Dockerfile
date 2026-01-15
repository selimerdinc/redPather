# ========================================
# STAGE 1: Builder - Bağımlılıkları yükle
# ========================================
FROM python:3.13-slim AS builder

WORKDIR /app

# Sistem bağımlılıkları (sadece derleme için)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libxml2-dev \
    libxslt-dev \
    && rm -rf /var/lib/apt/lists/*

# Python bağımlılıkları
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ========================================
# STAGE 2: Runtime - Hafif üretim imajı
# ========================================
FROM python:3.13-slim AS runtime

LABEL maintainer="Red Pather Team"
LABEL version="1.0.0"

WORKDIR /app

# Runtime için gerekli minimal sistem kütüphaneleri
RUN apt-get update && apt-get install -y --no-install-recommends \
    libxml2 \
    libxslt1.1 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Builder'dan Python paketlerini kopyala
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# Uygulama kodlarını kopyala
COPY . .

# Environment variables
ENV FLASK_DEBUG=0
ENV PORT=5005
ENV PYTHONUNBUFFERED=1

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5005/health')" || exit 1

# Port
EXPOSE 5005

# Non-root user (güvenlik)
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

# Uygulamayı başlat
CMD ["python", "app.py"]