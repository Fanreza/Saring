"""Tes black-box (Tugas 12): gateway Go dan layanan model sungguhan diuji lewat HTTP, tanpa melihat kode.

Teknik: Equivalence Partitioning, Boundary Value Analysis, Decision Table, Use Case Testing.
Data kasus ada di cases_blackbox.py. Dilewati bila model.joblib atau Go tidak ada (sama seperti test_e2e.py).

Bila variabel lingkungan BLACKBOX_OUT diisi, hasil aktual tiap kasus ditulis ke berkas JSON itu
(dipakai untuk menyusun laporan pengujian dari data eksekusi nyata, bukan ditulis tangan).
"""
import json
import os

import pytest

from cases_blackbox import ADMIN_DT, CHECK_BVA, CHECK_EP, REPORT_BVA, REPORT_DT, USECASES, url_panjang
from test_e2e import PASSWORD, call, gw  # noqa: F401  (gw: fixture gateway + model asli)
from test_e2e import pytestmark  # noqa: F401  (skip bila model/Go tidak ada)

REQUESTS = {"n": 0}  # permintaan yang memakai jatah batas 60 per menit sejak gateway menyala
# Hanya endpoint ini yang memanggil allowed() di gateway. Endpoint admin (reports, stats) tidak memakai jatah.
RATE_LIMITED = ("/api/check", "/api/report", "/api/admin/login")
ACTUAL = {}  # id kasus -> hasil aktual yang teramati

# Temuan pengujian: perilaku yang salah menurut spesifikasi, dicatat agar tidak hilang.
# strict=True: begitu diperbaiki, tes ini berubah menjadi gagal dan tanda xfail harus dihapus.
TEMUAN = {
    "BB-EP-04": pytest.mark.xfail(strict=True, reason=(
        "Link tanpa skema diberi http:// oleh gateway, lalu model menganggapnya phishing karena fitur is_https=0. "
        "Link yang sama dengan https:// dinyatakan aman (BB-EP-02).")),
}


@pytest.fixture(scope="module", autouse=True)
def tulis_hasil_aktual():
    yield
    out = os.environ.get("BLACKBOX_OUT")
    if out:
        with open(out, "w", encoding="utf-8") as f:
            json.dump(ACTUAL, f, ensure_ascii=False, indent=1)


def req(gw_url, method, path, body=None, token=None):
    if path in RATE_LIMITED:
        REQUESTS["n"] += 1
    return call(gw_url, method, path, body, token)


def ringkas(body):
    """Ringkasan hasil aktual yang mudah dibaca di laporan."""
    if not isinstance(body, dict):
        return str(body)[:80]
    if "error" in body:
        return f"error: {body['error']}"
    if "is_phishing" in body:
        return f"{'phishing' if body['is_phishing'] else 'aman'}, skor {round(body['score'] * 100)}, model {body['model']}"
    return ", ".join(f"{k}={v}" for k, v in list(body.items())[:3])[:90]


@pytest.fixture(scope="module")
def token(gw):  # noqa: F811
    s, login, _ = req(gw, "POST", "/api/admin/login", {"password": PASSWORD})
    assert s == 200
    return login["token"]


# ---------------------------------------------------------------- Equivalence Partitioning
@pytest.mark.parametrize("cid,desc,url,status,cek",
                         [pytest.param(*c, id=c[0], marks=TEMUAN.get(c[0], ())) for c in CHECK_EP])
def test_ep_input_url(gw, cid, desc, url, status, cek):  # noqa: F811
    s, body, _ = req(gw, "POST", "/api/check", {"url": url})
    ACTUAL[cid] = {"status": s, "hasil": ringkas(body)}
    assert s == status, f"{cid} {desc}: status {s}, body {body}"
    if cek == "phishing":
        assert body["is_phishing"] is True and body["reasons"]
    elif cek == "aman":
        assert body["is_phishing"] is False
    elif cek == "allowlist":
        assert body["is_phishing"] is False and body["model"] == "allowlist"
    else:
        assert cek in body["error"]


# ---------------------------------------------------------------- Boundary Value Analysis
@pytest.mark.parametrize("cid,desc,url,status", CHECK_BVA, ids=[c[0] for c in CHECK_BVA])
def test_bva_panjang_url(gw, cid, desc, url, status):  # noqa: F811
    s, body, _ = req(gw, "POST", "/api/check", {"url": url})
    ACTUAL[cid] = {"status": s, "hasil": ringkas(body), "panjang": len(url)}
    assert s == status, f"{cid} {desc}: len={len(url)} status {s}"
    assert len(url) == {"BB-BVA-01": 2047, "BB-BVA-02": 2048, "BB-BVA-03": 2049, "BB-BVA-04": 14}[cid]


@pytest.mark.parametrize("cid,desc,note,status", REPORT_BVA, ids=[c[0] for c in REPORT_BVA])
def test_bva_panjang_catatan(gw, cid, desc, note, status):  # noqa: F811
    s, body, _ = req(gw, "POST", "/api/report", {"url": "https://kurir.online/resi", "kind": "phishing_lolos", "note": note})
    ACTUAL[cid] = {"status": s, "hasil": ringkas(body), "panjang": len(note)}
    assert s == status, f"{cid} {desc}: status {s}"


# ---------------------------------------------------------------- Decision Table
@pytest.mark.parametrize("cid,url_ok,kind_ok,note_ok,status", REPORT_DT, ids=[c[0] for c in REPORT_DT])
def test_decision_table_laporan(gw, cid, url_ok, kind_ok, note_ok, status):  # noqa: F811
    body = {"url": "https://kurir.online/resi" if url_ok else "javascript:alert(1)",
            "kind": "salah_blokir" if kind_ok else "bukan-jenis",
            "note": "ok" if note_ok else "a" * 501}
    s, resp, _ = req(gw, "POST", "/api/report", body)
    ACTUAL[cid] = {"status": s, "hasil": ringkas(resp)}
    assert s == status


@pytest.mark.parametrize("cid,who,path,status", ADMIN_DT, ids=[c[0] for c in ADMIN_DT])
def test_decision_table_akses_admin(gw, token, cid, who, path, status):  # noqa: F811
    tok = {"tanpa token": None, "token ngawur": "abc123", "token sah": token}[who]
    s, resp, _ = req(gw, "GET", path, token=tok)
    ACTUAL[cid] = {"status": s, "hasil": "daftar/ringkasan diterima" if s == 200 else ringkas(resp)}
    assert s == status


# ---------------------------------------------------------------- Use Case Testing
def test_uc01_memeriksa_link_miss_lalu_hit(gw):  # noqa: F811
    url = "https://akun-dana-verifikasi.top/login"
    s1, b1, h1 = req(gw, "POST", "/api/check", {"url": url})
    s2, b2, h2 = req(gw, "POST", "/api/check", {"url": url})
    ACTUAL["BB-UC-01"] = {"status": f"{s1}/{s2}", "hasil": f"X-Cache: {h1['X-Cache']} lalu {h2['X-Cache']}; isi sama: {b1 == b2}; {ringkas(b1)}"}
    assert (s1, s2) == (200, 200) and h1["X-Cache"] == "MISS" and h2["X-Cache"] == "HIT" and b1 == b2


def test_uc02_laporan_sampai_admin(gw, token):  # noqa: F811
    _, before, _ = req(gw, "GET", "/api/admin/stats", token=token)
    s, rep, _ = req(gw, "POST", "/api/report", {"url": "https://toko-resmi.co.id/promo", "kind": "salah_blokir", "note": "situs resmi"})
    assert s == 201 and rep["status"] == "baru"
    _, listed, _ = req(gw, "GET", "/api/admin/reports", token=token)
    assert rep["id"] in [r["id"] for r in listed]
    s, upd, _ = req(gw, "PATCH", f"/api/admin/reports/{rep['id']}", {"status": "tidak_valid"}, token=token)
    assert s == 200 and upd["status"] == "tidak_valid"
    _, after, _ = req(gw, "GET", "/api/admin/stats", token=token)
    ACTUAL["BB-UC-02"] = {"status": "201/200/200/200",
                          "hasil": f"laporan #{rep['id']} dibuat (baru), muncul di daftar admin, status menjadi tidak_valid; "
                                   f"jumlah tidak_valid {before['reports']['tidak_valid']} menjadi {after['reports']['tidak_valid']}"}
    assert after["reports"]["tidak_valid"] == before["reports"]["tidak_valid"] + 1


def test_uc03_permintaan_ke_61_ditolak(gw):  # noqa: F811  (harus dijalankan paling akhir: memakai jatah permintaan IP ini)
    start = REQUESTS["n"]
    status = []
    for _ in range(70):
        status.append(req(gw, "POST", "/api/check", {"url": "https://www.google.com"})[0])
        if status[-1] == 429:
            break
    first_429 = start + len(status)  # nomor permintaan (sejak gateway menyala) yang pertama ditolak
    ACTUAL["BB-UC-03"] = {"status": status[-1], "hasil": f"permintaan pertama yang ditolak: ke-{first_429}"}
    assert status[-1] == 429, "tidak pernah ditolak"
    assert first_429 == 61, f"permintaan pertama yang ditolak harus ke-61, nyatanya ke-{first_429}"
    assert USECASES  # dipakai generator laporan
