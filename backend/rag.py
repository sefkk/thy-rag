"""
RAG pipeline: load data/ docs, chunk, embed (sentence-transformers), store in Chroma.
Query: embed question, retrieve top-k, return context for LLM.
data/metadata.json: her dosya için source_title, priority, categories; RAG bağlamında kullanılır.
"""
import json
import re
from pathlib import Path
from typing import Optional

import chromadb
from chromadb.config import Settings
from chromadb.utils import embedding_functions

_CHROMA_SETTINGS = Settings(anonymized_telemetry=False)

_METADATA_JSON = "metadata.json"
_PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def _get_data_dir() -> Path:
    base = Path(__file__).resolve().parent
    data_dir = base.parent / "data"
    return data_dir


def _load_doc_metadata(data_dir: Path) -> dict:
    """data/metadata.json dosyasını yükler; dosya adı -> {source_title, priority, categories}."""
    path = data_dir / _METADATA_JSON
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _chunk_text(
    text: str,
    source: str,
    chunk_size: int,
    overlap: int,
    file_meta: Optional[dict] = None,
) -> list[tuple[str, dict]]:
    """Split text into overlapping chunks. metadata.json'dan source_title, priority eklenir."""
    file_meta = file_meta or {}
    source_title = file_meta.get("source_title") or source
    priority = file_meta.get("priority") or "medium"
    text = re.sub(r"\s+", " ", text).strip()
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks = []
    current = []
    current_len = 0
    base_meta = {"source": source, "source_title": source_title, "priority": priority}
    for p in paragraphs:
        if current_len + len(p) + 1 > chunk_size and current:
            chunk_text = " ".join(current)
            chunks.append((chunk_text, dict(base_meta)))
            overlap_text = []
            overlap_len = 0
            for x in reversed(current):
                if overlap_len + len(x) + 1 <= overlap:
                    overlap_text.append(x)
                    overlap_len += len(x) + 1
                else:
                    break
            current = list(reversed(overlap_text))
            current_len = sum(len(x) for x in current)
        current.append(p)
        current_len += len(p) + 1
    if current:
        chunks.append((" ".join(current), dict(base_meta)))
    return chunks


def load_and_chunk_documents(data_dir: Path, chunk_size: int, chunk_overlap: int) -> list[tuple[str, dict]]:
    doc_meta = _load_doc_metadata(data_dir)
    all_chunks = []
    for ext in ("*.md", "*.txt"):
        for path in sorted(data_dir.glob(f"**/{ext}")):
            if path.name == _METADATA_JSON:
                continue
            try:
                text = path.read_text(encoding="utf-8")
                source = path.name
                file_meta = doc_meta.get(source, {})
                all_chunks.extend(
                    _chunk_text(text, source, chunk_size, chunk_overlap, file_meta)
                )
            except Exception as e:
                print(f"Skip {path}: {e}")
    return all_chunks


def get_embedding_fn():
    return embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name="all-MiniLM-L6-v2"
    )


def build_or_load_index(
    data_dir: Path,
    persist_dir: Path,
    chunk_size: int,
    chunk_overlap: int,
    embedding_fn,
):
    persist_dir.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(persist_dir), settings=_CHROMA_SETTINGS)
    collection = client.get_or_create_collection(
        name="thy_docs",
        embedding_function=embedding_fn,
        metadata={"description": "THY RAG documents"},
    )
    # If collection empty, build from data/
    if collection.count() == 0:
        chunks_with_meta = load_and_chunk_documents(data_dir, chunk_size, chunk_overlap)
        if not chunks_with_meta:
            return collection
        ids = [f"doc_{i}" for i in range(len(chunks_with_meta))]
        documents = [c[0] for c in chunks_with_meta]
        metadatas = [c[1] for c in chunks_with_meta]
        collection.add(ids=ids, documents=documents, metadatas=metadatas)
    return collection


def retrieve(collection, query: str, top_k: int = 4):
    results = collection.query(query_texts=[query], n_results=top_k, include=["documents", "metadatas"])
    if not results or not results["documents"]:
        return []
    docs = results["documents"][0]
    metadatas = results["metadatas"][0] if results["metadatas"] else [{}] * len(docs)
    hits = [{"text": d, "source": m.get("source", ""), "source_title": m.get("source_title"), "priority": m.get("priority", "medium")} for d, m in zip(docs, metadatas)]
    # Önceliğe göre sırala: high -> medium -> low
    hits.sort(key=lambda h: _PRIORITY_ORDER.get(h["priority"], 1))
    return hits


# Singleton for app
_collection = None


def get_collection():
    global _collection
    if _collection is None:
        from config import settings
        data_dir = Path(settings.data_dir).resolve()
        if not data_dir.is_absolute():
            data_dir = Path(__file__).resolve().parent.parent / settings.data_dir
        persist_dir = Path(__file__).resolve().parent / settings.chroma_persist_dir
        embedding_fn = get_embedding_fn()
        _collection = build_or_load_index(
            data_dir,
            persist_dir,
            settings.chunk_size,
            settings.chunk_overlap,
            embedding_fn,
        )
    return _collection


def get_context_for_query(message: str, current_page: Optional[str], top_k: int = 4) -> str:
    coll = get_collection()
    hits = retrieve(coll, message, top_k=top_k)
    if not hits:
        return "İlgili doküman bulunamadı."
    parts = []
    for h in hits:
        title = h.get("source_title") or h.get("source") or "Kaynak"
        parts.append(f"[Kaynak: {title}]\n{h['text']}")
    context = "\n\n---\n\n".join(parts)
    page_note = ""
    if current_page:
        page_note = f"\n\nKullanıcı şu an sitede şu sayfada: '{current_page}'. Buna göre yanıt ver."
    return context + page_note
