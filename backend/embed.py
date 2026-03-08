"""
RAG indeksini data/ klasöründen yeniden oluşturur.
data/ değiştirdikten sonra bu script'i çalıştırıp backend/.chroma'yı güncelleyin,
sonra değişiklikleri commit + push edin. Sunucu (örn. Render) repodaki .chroma'yı kullanır.
"""
from pathlib import Path

import chromadb
from chromadb.config import Settings

from config import settings
from rag import (
    get_embedding_fn,
    load_and_chunk_documents,
)

COLLECTION_NAME = "thy_docs"


def main():
    base = Path(__file__).resolve().parent
    root = base.parent
    data_dir = root / settings.data_dir
    persist_dir = base / settings.chroma_persist_dir

    if not data_dir.is_dir():
        print(f"data klasörü bulunamadı: {data_dir}")
        return

    print("Dokümanlar yükleniyor ve parçalanıyor...")
    chunks = load_and_chunk_documents(
        data_dir,
        settings.chunk_size,
        settings.chunk_overlap,
    )
    if not chunks:
        print("Hiç parça üretilemedi. data/ içinde .md veya .txt dosyası var mı?")
        return

    persist_dir.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(
        path=str(persist_dir),
        settings=Settings(anonymized_telemetry=False),
    )

    try:
        client.delete_collection(COLLECTION_NAME)
        print("Eski koleksiyon silindi.")
    except Exception:
        pass

    print("Embedding yapılıyor ve Chroma'ya yazılıyor...")
    embedding_fn = get_embedding_fn()
    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        embedding_function=embedding_fn,
        metadata={"description": "THY RAG documents"},
    )
    ids = [f"doc_{i}" for i in range(len(chunks))]
    documents = [c[0] for c in chunks]
    metadatas = [c[1] for c in chunks]
    collection.add(ids=ids, documents=documents, metadatas=metadatas)

    print(f"Tamamlandı. {len(chunks)} parça {persist_dir} içine yazıldı.")
    print("Değişiklikleri commit edip push edebilirsiniz.")


if __name__ == "__main__":
    main()
