from pathlib import Path

from pydantic_settings import BaseSettings

# Proje kökü (thy-rag); .env orada veya backend/ içinde aranır
_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    openai_api_key: str = ""
    gemini_api_key: str = ""
    use_openai_embeddings: bool = False   # True: OpenAI API ile embed (RAM tasarrufu)
    use_gemini_embeddings: bool = False   # True: Gemini API ile embed (sadece GEMINI_API_KEY yeterli, RAM tasarrufu)
    data_dir: str = "data"
    chroma_persist_dir: str = ".chroma"
    chunk_size: int = 800
    chunk_overlap: int = 150
    retrieval_top_k: int = 5
    # Rate limit: chat isteği başına izin (örn. "15/minute")
    rate_limit_chat: str = "15/minute"
    # Guardrails: mesaj ve history sınırları
    max_message_length: int = 2000
    max_history_items: int = 10
    max_history_item_length: int = 500

    class Config:
        env_file = [
            str(_ROOT / ".env"),
            str(Path(__file__).resolve().parent / ".env"),
        ]
        extra = "ignore"


settings = Settings()
