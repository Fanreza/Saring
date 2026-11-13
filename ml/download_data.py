"""Unduh semua dataset mentah ke data/raw/. Jalankan ulang untuk refresh feed phishing terbaru."""
import io
import zipfile
from datetime import date
from pathlib import Path

import requests

RAW = Path(__file__).parent / "data" / "raw"
RAW.mkdir(parents=True, exist_ok=True)

ZIPS = {
    # mirror Kaggle dari UCI id 967 (UCI asli ~14KB/s)
    "phiusiil": "https://www.kaggle.com/api/v1/datasets/download/ndarvind/phiusiil-phishing-url-dataset",
    "kaggle": "https://www.kaggle.com/api/v1/datasets/download/sid321axn/malicious-urls-dataset",
    "tranco": "https://tranco-list.eu/top-1m.csv.zip",
}
# Feed live -> disimpan per tanggal untuk holdout temporal
FEEDS = {
    "phishtank": "http://data.phishtank.com/data/online-valid.csv",
    "openphish": "https://openphish.com/feed.txt",
}


def get(url: str) -> bytes:
    r = requests.get(url, timeout=300, headers={"User-Agent": "scamsniffer-ta/1.0"})
    r.raise_for_status()
    return r.content


for name, url in ZIPS.items():
    out = RAW / name
    if out.exists():
        print(f"skip {name} (sudah ada)")
        continue
    print(f"unduh {name} ...")
    zipfile.ZipFile(io.BytesIO(get(url))).extractall(out)

today = date.today().isoformat()
for name, url in FEEDS.items():
    out = RAW / "feeds" / today / (name + (".csv" if url.endswith(".csv") else ".txt"))
    if out.exists():
        continue
    out.parent.mkdir(parents=True, exist_ok=True)
    print(f"unduh feed {name} ...")
    try:
        out.write_bytes(get(url))
    except requests.RequestException as e:  # feed kadang rate-limit, jangan gagalkan semua
        print(f"  gagal: {e}")

print("selesai:", *sorted(p.relative_to(RAW).as_posix() for p in RAW.rglob("*") if p.is_file()), sep="\n  ")
