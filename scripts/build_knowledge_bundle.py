#!/usr/bin/env python3
"""data/*.txt dosyalarından frontend/data/knowledge-bundle.json üretir (Bilgi bankası, backend olmadan)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "frontend" / "data" / "knowledge-bundle.json"

SLUGS = {
    "bagaj": "bagaj_rehberi.txt",
    "bilet-alma-sureci": "bilet-alma-sureci.txt",
    "bilet-nasil-alinir": "bilet-nasil-alinir.txt",
    "biletleme-kurallari": "biletleme_kurallari.txt",
    "iade-degisiklik": "iade-ve-degisiklik.txt",
    "ucus-oncesi": "ucus_oncesi_islemler.txt",
    "miles-smiles": "miles_and_smiles.txt",
    "yolcu-haklari": "yolcu_haklari.txt",
}


def main():
    meta = {}
    mp = DATA / "metadata.json"
    if mp.exists():
        try:
            meta = json.loads(mp.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass

    bundle = {}
    for slug, fname in SLUGS.items():
        path = DATA / fname
        title = fname.replace(".txt", "").replace("_", " ").replace("-", " ")
        if fname in meta and isinstance(meta.get(fname), dict):
            title = meta[fname].get("source_title") or title
        if not path.is_file():
            print(f"Uyarı: yok {path}")
            continue
        content = path.read_text(encoding="utf-8")
        bundle[slug] = {"title": title, "content": content}

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Yazıldı: {OUT} ({len(bundle)} konu)")


if __name__ == "__main__":
    main()
