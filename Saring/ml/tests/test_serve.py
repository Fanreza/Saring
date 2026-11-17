"""Tes layanan model dengan model.joblib asli (dilewati bila model belum dilatih)."""
from pathlib import Path

import pytest

MODEL = Path(__file__).resolve().parents[1] / "models" / "model.joblib"
pytestmark = pytest.mark.skipif(not MODEL.exists(), reason="models/model.joblib belum ada, jalankan train.py")


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    import serve
    return TestClient(serve.app)


def test_healthz(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "model": "xgboost"}


@pytest.mark.parametrize("url", [
    "https://bca-mobile-verifikasi.cfd/akun",
    "https://metamask-wallet-restore.vercel.app/seed",
    "http://192.168.10.5/bca/login.php",
])
def test_link_phishing_terdeteksi_dengan_alasan(client, url):
    body = client.post("/predict", json={"url": url}).json()
    assert body["is_phishing"] is True
    assert body["score"] >= body["threshold"]
    assert 1 <= len(body["reasons"]) <= 5
    for r in body["reasons"]:
        assert r["impact"] > 0 and r["label"]


@pytest.mark.parametrize("url", [
    "https://en.wikipedia.org/wiki/Phishing",
    "https://stackoverflow.com/questions/231767/what-does-the-yield-keyword-do",
])
def test_link_sah_dinyatakan_aman(client, url):
    body = client.post("/predict", json={"url": url}).json()
    assert body["is_phishing"] is False
    assert body["score"] < body["threshold"]


def test_alasan_hanya_untuk_ciri_yang_ada(client):
    # link tanpa "@": alasan "simbol @" tidak boleh muncul walaupun SHAP-nya positif
    body = client.post("/predict", json={"url": "https://bca-mobile-verifikasi.cfd/akun"}).json()
    assert all(r["feature"] != "n_at" for r in body["reasons"])
    for r in body["reasons"]:
        if r["feature"] == "is_https":
            assert r["value"] == 0
        else:
            assert r["value"] != 0


@pytest.mark.parametrize("payload", [{}, {"url": ""}, {"url": "a" * 2049}, {"link": "x.com"}])
def test_input_tidak_valid_ditolak_422(client, payload):
    assert client.post("/predict", json=payload).status_code == 422


def test_semua_fitur_punya_label_indonesia():
    import serve
    from features import FEATURE_NAMES
    assert set(serve.LABELS) == set(FEATURE_NAMES)
