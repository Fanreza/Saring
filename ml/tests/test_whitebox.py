"""Tes white-box (Tugas 12): disusun dari struktur kode serve.py dan features.py.

Tujuan tiap tes adalah satu cabang atau satu kondisi yang ditandai pada komentar. Cakupan diukur dengan
`coverage run --branch` (lihat README bagian pengujian). Tidak memakai model asli untuk cabang yang sulit
dicapai (model logistic regression, model random forest), sehingga model ditukar dengan tiruan.
"""
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from features import FEATURE_NAMES, FREE_HOSTING, extract_features, normalize

MODEL = Path(__file__).resolve().parents[1] / "models" / "model.joblib"
butuh_model = pytest.mark.skipif(not MODEL.exists(), reason="models/model.joblib belum ada, jalankan train.py")


# ---------------------------------------------------------------- features.py: normalize()
@pytest.mark.parametrize("raw,expected", [
    ("contoh.com", "http://contoh.com"),                # cabang: skema belum ada -> ditambah
    ("https://contoh.com", "https://contoh.com"),       # cabang: skema sudah ada -> tidak diubah
    ("  ftp://contoh.com  ", "ftp://contoh.com"),       # spasi dibuang, skema selain http tetap dihormati
    ("a+b.c://x", "a+b.c://x"),                         # karakter skema yang sah (+ dan .)
    ("1abc://x", "http://1abc://x"),                    # skema tidak boleh diawali angka: dianggap belum ada
])
def test_normalize_cabang_skema(raw, expected):
    assert normalize(raw) == expected


# ---------------------------------------------------------------- features.py: kondisi has_port
@pytest.mark.parametrize("url,expected", [
    ("http://a.com", 0),         # port None
    ("http://a.com:80", 0),      # port 80 dikecualikan
    ("https://a.com:443", 0),    # port 443 dikecualikan
    ("http://a.com:8081", 1),    # port lain -> 1
])
def test_has_port_tiga_kondisi(url, expected):
    assert extract_features(url)["has_port"] == expected


# ---------------------------------------------------------------- features.py: kondisi free_hosting
@pytest.mark.parametrize("url,expected", [
    ("https://vercel.app/", 1),            # host == domain
    ("https://itauu.vercel.app/x", 1),     # host.endswith("." + domain)
    ("https://notvercel.app/", 0),         # akhiran sama tetapi bukan subdomain: tidak boleh cocok
    ("https://vercel.app.penipu.xyz/", 0),  # domain muncul di tengah: tidak boleh cocok
    ("https://contoh.com/", 0),            # tidak ada yang cocok
])
def test_free_hosting_persis_atau_subdomain(url, expected):
    assert extract_features(url)["free_hosting"] == expected


def test_semua_domain_free_hosting_terdeteksi():  # loop testing: any() atas seluruh daftar
    for d in FREE_HOSTING:
        assert extract_features(f"https://x.{d}/")["free_hosting"] == 1, d


# ---------------------------------------------------------------- features.py: pembagian dengan nol
@pytest.mark.parametrize("url", ["http://", "http://a.com", "x"])
def test_rasio_tidak_pernah_membagi_nol(url):
    f = extract_features(url)
    assert all(np.isfinite(v) for v in f.values())  # max(..., 1) menjaga penyebut
    assert list(f) == FEATURE_NAMES


def test_port_tidak_valid_menjalani_cabang_except():  # urlsplit/port -> ValueError -> host kosong
    f = extract_features("http://a.com:99999/")
    assert f["host_len"] == 0 and f["has_port"] == 0


# ---------------------------------------------------------------- serve.py: tiga jalur predict()
class FakeModel:
    def __init__(self, p):
        self.p = p

    def predict_proba(self, X):
        return np.array([[1 - self.p, self.p]])


@pytest.fixture()
def serve_mod():
    import serve
    saved = (serve.model, serve.explainer, serve.THRESHOLD)
    yield serve
    serve.model, serve.explainer, serve.THRESHOLD = saved


@butuh_model
def test_tanpa_explainer_alasan_kosong(serve_mod):  # cabang: explainer is None (model logistic regression)
    from fastapi.testclient import TestClient
    serve_mod.model, serve_mod.explainer, serve_mod.THRESHOLD = FakeModel(0.9), None, 0.5
    body = TestClient(serve_mod.app).post("/predict", json={"url": "https://a.com"}).json()
    assert body["is_phishing"] is True and body["reasons"] == []


@butuh_model
def test_shap_dua_dimensi_memakai_kelas_phishing(serve_mod):  # cabang: sv.ndim == 2 (model random forest)
    from fastapi.testclient import TestClient
    n = len(FEATURE_NAMES)
    vals = np.zeros((1, n, 2))
    vals[0, :, 1] = np.arange(n)[::-1] + 1.0   # kelas phishing: kontribusi positif, menurun
    vals[0, :, 0] = -100.0                     # kelas sah: harus diabaikan
    serve_mod.model = FakeModel(0.9)
    serve_mod.explainer = lambda X: SimpleNamespace(values=vals)
    serve_mod.THRESHOLD = 0.5
    body = TestClient(serve_mod.app).post("/predict", json={"url": "http://192.168.1.1/login?a=b@c"}).json()
    assert 1 <= len(body["reasons"]) <= 5
    assert all(r["impact"] > 0 for r in body["reasons"])
    impacts = [r["impact"] for r in body["reasons"]]
    assert impacts == sorted(impacts, reverse=True)  # urut dari yang terbesar


@butuh_model
@pytest.mark.parametrize("p,thr,expected", [
    (0.4999, 0.5, False),   # tepat di bawah ambang
    (0.5000, 0.5, True),    # tepat di ambang: operator >= harus True
    (0.5001, 0.5, True),    # tepat di atas ambang
])
def test_batas_ambang_keputusan(serve_mod, p, thr, expected):  # kondisi: score >= THRESHOLD
    from fastapi.testclient import TestClient
    serve_mod.model, serve_mod.explainer, serve_mod.THRESHOLD = FakeModel(p), None, thr
    body = TestClient(serve_mod.app).post("/predict", json={"url": "https://a.com"}).json()
    assert body["is_phishing"] is expected
