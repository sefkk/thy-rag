# THY RAG Demo

Türk Hava Yolları tarzı bilet alma mock-up’ı ve sayfa bağlamına duyarlı yardım chatbot’u. RAG ile `data/` klasöründeki dokümanlardan yanıt üretir.

## Hızlı başlangıç

```bash
cd thy-rag
./run.sh
```

(İlk seferde sanal ortam ve bağımlılıklar kurulur. Chat için `.env` içinde `OPENAI_API_KEY` tanımlayın.)

## Yapı

- **frontend/** – HTML, CSS, JS (THY mock-up + sağ alt yardım chat’i)
- **frontend/data/** – Uçuş ve havalimanı listeleri (flights.json, airports.json). Uçuş tarihleri 9–27 Mart 2026 aralığındadır.
- **backend/** – FastAPI + RAG (Chroma, sentence-transformers, OpenAI)
- **data/** – RAG için statik veri: THY SSS, bagaj, check-in, sayfa rehberi (Markdown)

**Env’deki DATA_DIR:** Sadece RAG verisini işaret eder. Yazman gereken: `data` (proje kökündeki `data/` klasörü). `frontend/data/` env’den ayarlanmaz.

## Gereksinimler

- Python 3.11+ (Render için `runtime.txt` kullanılır)
- OpenAI veya Gemini API anahtarı (chat yanıtları için; en az biri gerekli)

## Çalıştırma

Proje klasörüne girip tek komutla başlatın (ilk seferde venv ve bağımlılıklar otomatik kurulur):

```bash
cd thy-rag
./run.sh
```

**Windows:** `run.bat` çift tıklayın veya `run.bat` komut satırından çalıştırın.

Chat’in yanıt verebilmesi için **OpenAI** veya **Gemini** API anahtarı gerekir. İlk çalıştırmada `.env` yoksa uyarı verilir; sonra:

```bash
cp backend/.env.example .env
# .env içinde birini doldurun:
# OPENAI_API_KEY=sk-...
# GEMINI_API_KEY=...
```

Gemini anahtarı tanımlıysa chat Gemini kullanır; yoksa OpenAI kullanılır.

Tekrar `./run.sh` ile sunucuyu başlatın. Tarayıcıda: **http://localhost:8000**

- Bilet Al → Uçuş Ara → Uçuş seç → Yolcu bilgileri → Ödeme akışını deneyin.
- Sağ alttaki **Yardım** ile o anki sayfaya göre soru sorun (örn. “Bagaj limiti ne?”, “Bu sayfada ne yapıyorum?”).

## RAG nasıl çalışıyor?

1. Sunucu açılışında `backend/.chroma` varsa (repo’dan veya önceki çalıştırmadan) o kullanılır; yoksa `data/` okunup indeks oluşturulur.
2. Kullanıcı soru gönderdiğinde soru vektörlenir, en benzer parçalar alınır.
3. Bu parçalar + “şu anki sayfa” bilgisi LLM’e context olarak verilir; model yanıtı bu bağlama göre üretir.

**data/ değiştirdiğinizde:** RAG’ı güncellemek için `embed.py` çalıştırıp yeni indeksi `backend/.chroma`’ya yazın, sonra bu değişikliği commit + push edin:

```bash
cd thy-rag
PYTHONPATH=backend python backend/embed.py
# backend/.chroma güncellendi; git add backend/.chroma && git commit && git push
```

## Deploy (Netlify + Render)

Frontend’i **Netlify**, backend’i **Render**’da çalıştırabilirsiniz. Chat’in çalışması için frontend’in API isteklerini Render URL’ine yönlendirmesi gerekir.

### Render (backend)

- Repoyu Render’a bağlayın. `render.yaml` kullanıyorsanız servis otomatik tanımlanır.
- **Ortam değişkenleri:** `GEMINI_API_KEY` veya `OPENAI_API_KEY` (en az biri). İsteğe bağlı: `DATA_DIR=data`.
- **Start komutu:** `PYTHONPATH=backend uvicorn app:app --host 0.0.0.0 --port $PORT` (production’da `--reload` yok).
- **Health check:** `/api/health`. RAG indeksi `backend/.chroma` repoda commit edilmişse açılışta tekrar build edilmez (soğuk başlangıç hızlı olur). **Python:** `runtime.txt` ile 3.11 kullanılır.

### Netlify (frontend)

- **Publish directory:** `frontend` (`netlify.toml` içinde tanımlı).
- **API base URL:** Frontend, chat için backend’e istek atar. Netlify’da frontend farklı origin’de olduğu için `frontend/js/config.js` içinde Render backend URL’ini yazın:
  ```js
  window.API_BASE = "https://thy-rag-api.onrender.com";
  ```
  (Servis adınız farklıysa o URL’i kullanın.)

### Tek sunucu (Render’da full-stack)

Backend zaten statik dosyaları sunuyor. Sadece Render’da tek bir Web Service açıp repoyu deploy edebilirsiniz; `render.yaml`’daki start komutu aynı kalır. Bu durumda Netlify kullanmaz, `API_BASE` boş bırakılır (same-origin).

---

## Deploy öncesi kontrol

- Render: Ortam değişkenlerinde `GEMINI_API_KEY` veya `OPENAI_API_KEY` (en az biri) tanımlı mı?
- Netlify: `frontend/js/config.js` içinde `window.API_BASE` Render backend URL'inize ayarlı mı?
- RAG: İlk deploy'dan önce yerelde `PYTHONPATH=backend python backend/embed.py` çalıştırıp `backend/.chroma`'yı repoya eklediyseniz soğuk başlangıç kısalır.

---

## Ortam değişkenleri

| Değişken | Açıklama |
|----------|----------|
| `OPENAI_API_KEY` | OpenAI chat API anahtarı (OpenAI kullanılacaksa). |
| `GEMINI_API_KEY` | Google Gemini API anahtarı (Gemini kullanılacaksa). İkisi varsa Gemini öncelikli. |
| `DATA_DIR` | RAG veri klasörü (proje köküne göre). Varsayılan: `data`. |
| `PORT` | Sunucu portu (Render vb. ortamlarda otomatik atanır). |
| `RATE_LIMIT_CHAT` | Chat isteği limiti (örn. `15/minute`). Varsayılan: `15/minute`. |
| `MAX_MESSAGE_LENGTH` | Tek mesaj için max karakter. Varsayılan: `2000`. |
| `MAX_HISTORY_ITEMS` | Gönderilebilir geçmiş mesaj sayısı üst sınırı. Varsayılan: `10`. |

`.env` dosyası proje kökünde veya `backend/` içinde olabilir.

**Rate limit ve guardrails:** `/api/chat` IP başına dakikada sınırlıdır (limit aşımında 429). Mesaj ve history uzunlukları config ile sınırlanır; kontrol karakterleri temizlenir.

---

## Proje yapısı (detay)

```
thy-rag/
├── frontend/           # Statik arayüz
│   ├── index.html
│   ├── css/
│   ├── js/
│   │   ├── config.js   # API_BASE (deploy için)
│   │   └── app.js
│   └── data/           # flights.json, airports.json (9–27 Mart 2026)
├── backend/
│   ├── app.py          # FastAPI, /api/chat, /api/health, statik serve
│   ├── rag.py          # RAG pipeline (Chroma, sentence-transformers)
│   ├── embed.py        # data/ değişince elle çalıştırılır; .chroma güncellenir
│   ├── prompts.py      # Sistem prompt
│   ├── page_guide.json # Sayfa bazlı rehber metinleri
│   ├── .chroma/        # RAG indeksi (repo’da; deploy’da tekrar build gerekmez)
│   └── requirements.txt
├── data/               # RAG dokümanları (.txt, .md)
├── render.yaml         # Render Blueprint (backend)
├── runtime.txt         # Python sürümü (Render deploy)
├── netlify.toml        # Netlify (frontend publish)
└── run.sh              # Local çalıştırma (--reload)
```
