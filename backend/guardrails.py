"""
Chat isteği için guardrails: mesaj ve history uzunluk/sanitize kuralları.
"""
import re
from typing import Any, Optional

from config import settings


def sanitize_text(text: str, max_len: int) -> str:
    """Kontrol karakterlerini ve aşırı boşlukları temizler, max_len ile keser."""
    if not text or not isinstance(text, str):
        return ""
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_len:
        text = text[:max_len]
    return text


def validate_chat_request(
    message: Optional[str],
    history: list[Any],
) -> tuple[str, list[dict[str, str]]]:
    """
    Mesaj ve history'yi guardrail kurallarına göre doğrular ve temizler.
    (msg, cleaned_history) döner; history list of {role, content}.
    Kuralları ihlal ederse ValueError.
    """
    if not message or not str(message).strip():
        raise ValueError("message boş olamaz")

    msg = sanitize_text(str(message), settings.max_message_length)
    if not msg:
        raise ValueError("message boş olamaz")

    max_items = settings.max_history_items
    max_item_len = settings.max_history_item_length
    cleaned: list[dict[str, str]] = []
    for h in list(history)[:max_items]:
        role = "user"
        content = ""
        if isinstance(h, dict):
            role = str(h.get("role", "user")).strip() or "user"
            content = sanitize_text(str(h.get("content", "")), max_item_len)
        elif hasattr(h, "role") and hasattr(h, "content"):
            role = str(getattr(h, "role", "user")).strip() or "user"
            content = sanitize_text(str(getattr(h, "content", "")), max_item_len)
        if role not in ("user", "assistant"):
            role = "user"
        cleaned.append({"role": role, "content": content})
    return msg, cleaned
