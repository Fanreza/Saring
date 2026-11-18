"""Tes kualitas (Tugas 15, ISO/IEC 25010): kecepatan respons dan keamanan dasar, lewat gateway dan model sungguhan.

Bila ISO_OUT diisi, hasil ukur ditulis ke berkas JSON itu untuk dipakai laporan.
Kecepatan diukur lokal (localhost), jadi tidak termasuk waktu jaringan internet.
"""
import json
import os
import statistics
import time

import pytest

from test_e2e import PASSWORD, call, gw  # noqa: F401  (gw: fixture gateway + model asli)
from test_e2e import pytestmark  # noqa: F401  (dilewati bila model atau Go tidak ada)

HASIL = {}
N = 20  # 1 pemanasan + 20 MISS + 20 HIT = 41 permintaan, di bawah batas 60 per menit


@pytest.fixture(scope="module", autouse=True)
def tulis_hasil():
    yield
    out = os.environ.get("ISO_OUT")
    if out:
        with open(out, "w", encoding="utf-8") as f:
            json.dump(HASIL, f, ensure_ascii=False, indent=1)


def waktu_ms(fn):
    t = time.perf_counter()
    r = fn()
    return (time.perf_counter() - t) * 1000, r


def ringkas(xs):
    xs = sorted(xs)
    return {"n": len(xs), "median": round(statistics.median(xs), 1), "p95": round(xs[int(0.95 * (len(xs) - 1))], 1), "maks": round(xs[-1], 1)}


# ---------------------------------------------------------------- Performance Efficiency
def test_pe_pemeriksaan_pertama_dan_dari_cache(gw):  # noqa: F811
    call(gw, "POST", "/api/check", {"url": "https://pemanasan.contoh.net/a"})  # pemanasan, tidak dihitung
    miss = []
    for i in range(N):
        ms, (s, body, h) = waktu_ms(lambda i=i: call(gw, "POST", "/api/check", {"url": f"https://uji-kecepatan-{i}.xyz/login"}))
        assert s == 200 and h["X-Cache"] == "MISS"
        miss.append(ms)
    hit = []
    for _ in range(N):
        ms, (s, body, h) = waktu_ms(lambda: call(gw, "POST", "/api/check", {"url": "https://uji-kecepatan-0.xyz/login"}))
        assert s == 200 and h["X-Cache"] == "HIT"
        hit.append(ms)
    HASIL["PE-01"] = ringkas(miss)
    HASIL["PE-02"] = ringkas(hit)
    assert statistics.median(miss) < 1000, "NFR-01: pemeriksaan harus selesai maksimal 1 detik"
    assert max(hit) < 100, "NFR-02: hasil dari cache harus maksimal 100 ms"


# ---------------------------------------------------------------- Security
SQLI = "'); DROP TABLE reports;--"
XSS = "<script>alert(1)</script>"


def test_se_sql_injection_tersimpan_sebagai_teks(gw):  # noqa: F811
    s, rep, _ = call(gw, "POST", "/api/report", {"url": f"https://a.com/x{SQLI}", "kind": "phishing_lolos", "note": SQLI})
    assert s == 201
    s, login, _ = call(gw, "POST", "/api/admin/login", {"password": PASSWORD})
    tok = login["token"]
    s, daftar, _ = call(gw, "GET", "/api/admin/reports", token=tok)  # bila tabel terhapus, ini gagal
    assert s == 200 and any(r["note"] == SQLI for r in daftar), "payload harus tersimpan apa adanya sebagai teks"
    s2, st, _ = call(gw, "GET", "/api/admin/stats", token=tok)
    assert s2 == 200
    HASIL["SE-02"] = {"status_laporan": s, "tabel_masih_ada": True, "catatan_tersimpan_utuh": True}


def test_se_xss_tersimpan_sebagai_teks_di_api(gw):  # noqa: F811
    s, rep, _ = call(gw, "POST", "/api/report", {"url": "https://b.com/y", "kind": "salah_blokir", "note": XSS})
    assert s == 201 and rep["note"] == XSS  # API hanya membawa teks JSON. Escape saat tampil diuji di browser.
    HASIL["SE-03a"] = {"status": s, "catatan_dikembalikan_utuh": True}
