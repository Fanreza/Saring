# Layanan model Saring (FastAPI). Python sama dengan saat training agar model.joblib termuat.
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TLDEXTRACT_CACHE=/tmp/tldextract
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY features.py serve.py ./
# model hasil train.py; models/model.joblib ikut di git agar build bisa dari repo (lihat DEPLOY.md)
COPY models/model.joblib models/model.joblib

RUN useradd --system --no-create-home app
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz')"
CMD ["uvicorn", "serve:app", "--host", "0.0.0.0", "--port", "8000"]
