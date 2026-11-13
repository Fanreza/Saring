"""ML service: POST /predict {url} -> skor phishing + alasan (SHAP). Jalankan: uvicorn serve:app --port 8000"""
from pathlib import Path

import joblib
import pandas as pd
import shap
from fastapi import FastAPI
from pydantic import BaseModel, Field

from features import FEATURE_NAMES, extract_features

art = joblib.load(Path(__file__).parent / "models" / "model.joblib")
model, THRESHOLD = art["model"], art["threshold"]
explainer = shap.TreeExplainer(model) if art["name"] != "logreg" else None

LABELS = {
    "url_len": "Link-nya sangat panjang", "host_len": "Nama situsnya panjang tidak wajar",
    "path_len": "Alamat setelah nama situs sangat panjang", "query_len": "Banyak parameter tersembunyi di link",
    "tld_len": "Akhiran domain tidak umum", "n_dot": "Terlalu banyak titik di link",
    "n_hyphen": "Banyak tanda hubung (-)", "n_hyphen_host": "Nama situs memakai tanda hubung (-), sering untuk meniru brand",
    "n_underscore": "Ada garis bawah (_) di link", "n_slash": "Banyak garis miring (/)", "n_qmark": "Ada tanda tanya (?) di link",
    "n_equal": "Banyak parameter (=) di link", "n_at": "Ada simbol @ yang bisa menyamarkan alamat asli",
    "n_amp": "Banyak tanda &", "n_percent": "Ada karakter yang disamarkan (%)", "n_digit": "Banyak angka di link",
    "n_subdomain": "Nama situs bertingkat-tingkat (banyak subdomain)", "digit_ratio": "Terlalu banyak angka",
    "letter_ratio": "Susunan huruf dan simbolnya tidak wajar", "host_digit_ratio": "Nama situs mengandung angka",
    "entropy_url": "Link berisi huruf acak", "entropy_host": "Nama situs berupa huruf acak",
    "is_ip": "Memakai alamat IP, bukan nama situs", "free_hosting": "Dibuat di layanan hosting gratis yang sering dipakai penipu",
    "upper_ratio_path": "Ada kode acak huruf besar-kecil di link", "is_https": "Tidak memakai koneksi aman (HTTPS)",
    "has_port": "Memakai port yang tidak biasa", "double_slash_path": "Ada pengalihan tersembunyi (//) di link",
    "punycode": "Nama situs memakai huruf tiruan yang mirip aslinya", "is_shortener": "Link dipendekkan, tujuan aslinya tersembunyi",
    "suspicious_tld": "Akhiran domain murah yang sering dipakai penipu (.xyz, .cfd, dll)",
    "n_sensitive": "Ada kata pancingan seperti login, verify, atau akun",
    "brand_not_domain": "Menyebut nama brand, tapi bukan situs resminya",
}


class Req(BaseModel):
    url: str = Field(min_length=1, max_length=2048)


app = FastAPI(title="Saring ML")


@app.post("/predict")
def predict(req: Req):
    feats = extract_features(req.url)
    X = pd.DataFrame([feats], columns=FEATURE_NAMES)
    score = float(model.predict_proba(X)[0, 1])
    reasons = []
    if explainer is not None:
        sv = explainer(X).values[0]
        if sv.ndim == 2:  # RF: (fitur, kelas)
            sv = sv[:, 1]
        # Label hanya benar kalau ciri-nya memang ada (nilai != 0); is_https kebalikannya.
        shown = [(f, v) for f, v in zip(FEATURE_NAMES, sv)
                 if v > 0 and (feats[f] == 0 if f == "is_https" else feats[f] != 0)]
        reasons = [{"feature": f, "label": LABELS[f], "value": feats[f], "impact": round(float(v), 4)}
                   for f, v in sorted(shown, key=lambda t: -t[1])[:5]]
    return {"url": req.url, "is_phishing": score >= THRESHOLD, "score": round(score, 4),
            "threshold": round(THRESHOLD, 4), "model": art["name"], "reasons": reasons}


@app.get("/healthz")
def healthz():
    return {"ok": True, "model": art["name"]}
