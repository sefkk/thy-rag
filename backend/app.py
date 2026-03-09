"""
THY RAG Chat API. Serves /api/chat, /api/health and static frontend at /.
"""
import json
import logging
import os
import warnings
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

os.environ["ANONYMIZED_TELEMETRY"] = "False"
for _name in ("chromadb", "chromadb.telemetry", "chromadb.telemetry.posthog"):
    logging.getLogger(_name).setLevel(logging.ERROR)
warnings.filterwarnings("ignore", message=".*Python version 3.9 past its end of life.*", category=FutureWarning, module="google.auth.*")
warnings.filterwarnings("ignore", message=".*Python version 3.9 past its end of life.*", category=FutureWarning, module="google.oauth2.*")
warnings.filterwarnings("ignore", message=".*resource_tracker.*leaked semaphore.*", category=UserWarning)

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from config import settings
from guardrails import validate_chat_request
from prompts import SYSTEM_PROMPT
from rag import get_collection, get_context_for_query


@asynccontextmanager
async def lifespan(app: FastAPI):
    # İndeks ilk sorguda değil, sunucu açılırken hazırlansın (ilk mesajda bekleme olmasın)
    get_collection()
    yield
    # shutdown: gerekirse temizlik


app = FastAPI(
    title="THY RAG Chat API",
    description="Bilet ve yolculuk yardımı için RAG tabanlı chatbot",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatHistoryItem(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    current_page: Optional[str] = None
    history: list[ChatHistoryItem] = []
    current_date: Optional[str] = None     # Bugünün tarihi (asistan "bugün", "yarın" gibi ifadeler için kullanır)
    booking_context: Optional[str] = None  # Güncel toplam, seçimler, ücret tablosu – asistan buna göre yönlendirir
    search_context: Optional[str] = None   # Uçuş listesi: arama + kullanıcının gördüğü uçuş listesi (hangi bileti seçeyim için)


class ChatResponse(BaseModel):
    reply: str


# Sayfa rehberi: her sayfa için ekrandaki gerçek öğeler (buton/adım). JSON'dan yüklenir.
_PAGE_GUIDE_PATH = Path(__file__).resolve().parent / "page_guide.json"


def _load_page_guide() -> dict:
    if _PAGE_GUIDE_PATH.exists():
        try:
            return json.loads(_PAGE_GUIDE_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return {}


PAGE_GUIDE = _load_page_guide()


def _format_history(history: list[ChatHistoryItem]) -> str:
    if not history:
        return ""
    lines = []
    for h in history:
        label = "Kullanıcı" if h.role == "user" else "Asistan"
        lines.append(f"{label}: {h.content}")
    return "\n".join(lines)


def _call_gemini(context: str, user_message: str, history: list[ChatHistoryItem]) -> str:
    try:
        from google import genai
        from google.genai.types import GenerateContentConfig
        api_key = settings.gemini_api_key or os.environ.get("GEMINI_API_KEY")
        if not api_key:
            return "GEMINI_API_KEY .env dosyasında tanımlanmadı."
        client = genai.Client(api_key=api_key)
        hist_text = _format_history(history)
        prompt = "Bağlam (dokümanlar):\n" + context
        if hist_text:
            prompt += "\n\n---\nÖnceki konuşma (bunu dikkate al, devam sorularına ona göre yanıt ver):\n" + hist_text
        prompt += "\n\n---\nŞu anki kullanıcı sorusu: " + user_message
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=GenerateContentConfig(system_instruction=SYSTEM_PROMPT),
        )
        if response and response.text:
            return response.text.strip()
        return "Yanıt oluşturulamadı."
    except Exception as e:
        return f"Şu an yanıt veremiyorum: {str(e)}. Lütfen GEMINI_API_KEY doğru olduğundan emin olun."


def _call_openai(context: str, user_message: str, history: list[ChatHistoryItem]) -> str:
    try:
        from openai import OpenAI
        api_key = settings.openai_api_key or os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return "OPENAI_API_KEY .env dosyasında tanımlanmadı."
        client = OpenAI(api_key=api_key)
        system = SYSTEM_PROMPT + "\n\nBağlam (dokümanlar):\n" + context
        if history:
            system += "\n\n(Önceki konuşma aşağıda; devam sorularına ona göre tutarlı yanıt ver.)"
        messages = [{"role": "system", "content": system}]
        for h in history:
            messages.append({"role": h.role, "content": h.content})
        messages.append({"role": "user", "content": user_message})
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=500,
        )
        return response.choices[0].message.content or "Yanıt oluşturulamadı."
    except Exception as e:
        return f"Şu an yanıt veremiyorum: {str(e)}. Lütfen OPENAI_API_KEY ayarlandığından emin olun."


def _call_llm(context: str, user_message: str, history: list[ChatHistoryItem]) -> str:
    if settings.gemini_api_key or os.environ.get("GEMINI_API_KEY"):
        return _call_gemini(context, user_message, history)
    if settings.openai_api_key or os.environ.get("OPENAI_API_KEY"):
        return _call_openai(context, user_message, history)
    return "Lütfen .env dosyasında OPENAI_API_KEY veya GEMINI_API_KEY tanımlayın."


# API sub-app: rate limit + guardrails
api = FastAPI()
limiter = Limiter(key_func=get_remote_address)
api.state.limiter = limiter
api.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@api.post("/chat", response_model=ChatResponse)
@limiter.limit(settings.rate_limit_chat)
def chat(request: Request, req: ChatRequest):
    try:
        msg, cleaned_history = validate_chat_request(req.message, req.history or [])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    history = [ChatHistoryItem(**h) for h in cleaned_history]
    context = get_context_for_query(
        msg,
        req.current_page,
        top_k=settings.retrieval_top_k,
    )
    if req.current_date and req.current_date.strip():
        context = "[Tarih – 'bugün', 'yarın' gibi ifadelerde buna göre yanıt ver]\n" + req.current_date.strip() + "\n\n" + context
    if req.current_page and req.current_page.strip() in PAGE_GUIDE:
        context = context + "\n\n[Kullanıcının bulunduğu sayfa rehberi – sadece buna göre adım/buton söyle]\n" + PAGE_GUIDE[req.current_page.strip()]
    if req.booking_context and req.booking_context.strip():
        context = context + "\n\n[Rezervasyon ve fiyat bilgisi – bu rakamları kullanarak somut öneri ver, ne seçerse ne kadar artar söyle]\n" + req.booking_context.strip()
    if req.search_context and req.search_context.strip():
        context = context + "\n\n[Arama / uçuş listesi – kullanıcının ekranda gördüğü uçuşlar burada; 'hangi bileti seçeyim', 'konsere yetişmem lazım' gibi sorularda bu listeye göre somut öneri ver (uçuş id, saat, fiyat söyle)]\n" + req.search_context.strip()
    reply = _call_llm(context, msg, history)
    return ChatResponse(reply=reply)


@api.get("/health")
def health():
    return {"status": "ok"}


app.mount("/api", api)


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    """Tarayıcı /favicon.ico istediğinde mini-logo'ya yönlendir."""
    return RedirectResponse(url="/img/mini-logo.jpeg", status_code=302)


# Static frontend: serve from parent/frontend (index.html at /, assets at /css, /js)
_frontend_path = Path(__file__).resolve().parent.parent / "frontend"

if _frontend_path.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_path), html=True), name="frontend")
else:
    @app.get("/")
    def _():
        raise HTTPException(status_code=404, detail="Frontend bulunamadı")
