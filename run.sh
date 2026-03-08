#!/bin/bash
# THY RAG - Tek komutla çalıştırma
set -e
cd "$(dirname "$0")"

if [ ! -d "venv" ]; then
  echo "İlk çalıştırma: sanal ortam ve bağımlılıklar kuruluyor..."
  python3 -m venv venv
  ./venv/bin/pip install -q -r backend/requirements.txt
  echo "Kurulum tamamlandı."
fi

if [ ! -f .env ] && [ ! -f backend/.env ]; then
  echo "Uyarı: .env bulunamadı. Chat için OPENAI_API_KEY gerekli."
  echo "  cp backend/.env.example .env   ardından .env içinde OPENAI_API_KEY doldurun."
fi

[ -f .env ] && set -a && . ./.env && set +a
[ -f backend/.env ] && set -a && . ./backend/.env && set +a

export PYTHONPATH=backend
echo "Sunucu başlatılıyor: http://localhost:8000"
exec ./venv/bin/uvicorn app:app --reload --host 0.0.0.0 --port 8000
