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

**RAM azaltmak (Render):** Sadece **GEMINI_API_KEY** varsa: `USE_GEMINI_EMBEDDINGS=true` kullanın. Hem chat hem embedding Gemini ile gider, sentence-transformers yüklenmez. OPENAI key’iniz varsa: `USE_OPENAI_EMBEDDINGS=true` da kullanılabilir. Hangisini açarsanız açın, embedding boyutu değiştiği için indeksi **yeniden oluşturmanız gerekir**: yerelde `.env` veya ortamda ilgili env’leri set edip `PYTHONPATH=backend python backend/embed.py` çalıştırın; ardından `backend/.chroma`'yı commit + push edin. Render’da bellek kullanımı belirgin düşer.

## Deploy (Render)

Proje **Render**’da tek servis olarak çalışacak şekilde ayarlıdır: API + statik frontend aynı URL’de sunulur. Repoyu bağlayıp ortam değişkenlerini eklemeniz yeterlidir.

### Render’a deploy adımları

1. **GitHub’da repo:** Kodu `thy-rag` adlı public bir GitHub reposuna pushlayın (varsa atlayın).
2. **Render’a giriş:** [render.com](https://render.com) → GitHub ile giriş yapın.
3. **Yeni Web Service:** Dashboard → **New** → **Web Service**. Repo olarak `thy-rag`’ı seçin.
4. **Blueprint:** “Configure from render.yaml” seçeneği çıkarsa seçin; böylece `render.yaml`’daki ayarlar (build/start komutları, env placeholder’lar) otomatik uygulanır. Servis adı örn. `thy-rag-api` olur.
5. **Ortam değişkenleri:** Aynı sayfada veya **Environment** sekmesinde:
   - **GEMINI_API_KEY** veya **OPENAI_API_KEY** (en az biri) → **Secret** olarak ekleyin. Chat’in yanıt verebilmesi için zorunludur.
   - **DATA_DIR** = `data` (isteğe bağlı; `render.yaml`’da zaten tanımlı).
6. **Deploy:** **Create Web Service** ile ilk deploy başlar. Build bittikten sonra servis URL’i (örn. `https://thy-rag-api.onrender.com`) ile hem site hem API erişilebilir.
7. **Kontrol:** `https://<servis-adı>.onrender.com/api/health` açıldığında `{"status":"ok"}` dönmeli. Ana URL’de frontend (bilet al, chatbot) açılmalı.

**Not:** `backend/.chroma` repoda mevcutsa RAG indeksi açılışta yeniden oluşturulmaz (soğuk başlangıç hızlı olur). İndeks yoksa ilk istekte `data/` okunup indekslenir.

### Netlify ile ayrı frontend (isteğe bağlı)

Frontend’i **Netlify**’da, backend’i **Render**’da ayrı tutmak isterseniz:

- Netlify’da **Publish directory:** `frontend` (`netlify.toml`’da tanımlı).
- `frontend/js/config.js` içinde Render backend URL’ini yazın:
  ```js
  window.API_BASE = "https://thy-rag-api.onrender.com";
  ```
  (Servis adınız farklıysa o URL’i kullanın.)

### Tek sunucu (önerilen)

Varsayılan kurulum **tek sunucu**dır: Render’da tek Web Service hem API’yi hem statik siteyi sunar. `frontend/js/config.js` içinde `window.API_BASE = ""` kalır (same-origin). Netlify kullanmanız gerekmez.

---

## Deploy öncesi kontrol

- [ ] Render Environment’ta **GEMINI_API_KEY** veya **OPENAI_API_KEY** (en az biri) Secret olarak tanımlı mı?
- [ ] Repoda `backend/.chroma` var mı? (Yoksa ilk açılışta RAG indeksi `data/`’dan oluşturulur; biraz sürebilir.)
- [ ] Netlify kullanıyorsanız `frontend/js/config.js`’te `window.API_BASE` Render URL’inize ayarlı mı?

---

## Ortam değişkenleri

| Değişken | Açıklama |
|----------|----------|
| `OPENAI_API_KEY` | OpenAI chat API anahtarı (OpenAI kullanılacaksa). **RAM azaltmak için:** `USE_OPENAI_EMBEDDINGS=true` ile RAG embedding’leri de OpenAI üzerinden gider; bu durumda zorunlu. |
| `GEMINI_API_KEY` | Google Gemini API anahtarı (Gemini kullanılacaksa). İkisi varsa Gemini öncelikli. |
| `USE_GEMINI_EMBEDDINGS` | `true` ise RAG embedding'leri **Gemini API** ile; sadece **GEMINI_API_KEY** yeterli, RAM tasarrufu. Sadece Gemini key'in varsa bunu aç. |
| `USE_OPENAI_EMBEDDINGS` | `true` ise RAG embedding’leri OpenAI API ile yapılır; yerel sentence-transformers yüklenmez, **~150–250 MB RAM tasarrufu**. Render’da memory limit aşıyorsan aç. Açtıktan sonra indeksi yeniden oluşturman gerekir (aşağıya bakın). |
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
├── .env.example        # Yerel env şablonu (Render’da Dashboard kullanılır)
├── render.yaml         # Render Blueprint (tek servis: API + frontend)
├── runtime.txt         # Python sürümü (Render)
├── netlify.toml        # Netlify (isteğe bağlı ayrı frontend)
└── run.sh              # Yerel çalıştırma (--reload)
```
