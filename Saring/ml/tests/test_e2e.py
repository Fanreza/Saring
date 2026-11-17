"""End-to-end: layanan model + gateway sungguhan, diuji lewat HTTP seperti web dan extension memakainya."""
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / "ml" / "models" / "model.joblib"
pytestmark = pytest.mark.skipif(not MODEL.exists() or shutil.which("go") is None,
                                reason="butuh models/model.joblib dan Go terpasang")
PASSWORD = "rahasia-e2e"


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait(url, proc, timeout=90):
    end = time.time() + timeout
    while time.time() < end:
        if proc.poll() is not None:
            raise RuntimeError(f"proses berhenti: {url}")
        try:
            urllib.request.urlopen(url, timeout=1)
            return
        except OSError:
            time.sleep(0.3)
    raise TimeoutError(url)


def call(base, method, path, body=None, token=None):
    req = urllib.request.Request(base + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read() or b"{}"), r.headers
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}"), e.headers


@pytest.fixture(scope="module")
def gw(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("e2e")
    ml_port, gw_port = free_port(), free_port()
    exe = tmp / ("gateway.exe" if os.name == "nt" else "gateway")
    subprocess.run(["go", "build", "-o", str(exe), "."], cwd=ROOT / "gateway", check=True)
    ml = subprocess.Popen([sys.executable, "-m", "uvicorn", "serve:app", "--port", str(ml_port), "--log-level", "warning"],
                          cwd=ROOT / "ml")
    env = {**os.environ, "ML_URL": f"http://127.0.0.1:{ml_port}", "ADDR": f"127.0.0.1:{gw_port}",
           "DB": str(tmp / "saring.db"), "ADMIN_PASSWORD": PASSWORD}
    gwp = subprocess.Popen([str(exe)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait(f"http://127.0.0.1:{ml_port}/healthz", ml)
        wait(f"http://127.0.0.1:{gw_port}/healthz", gwp)
        yield f"http://127.0.0.1:{gw_port}"
    finally:
        for p in (gwp, ml):
            p.terminate()
            p.wait(10)


def test_cek_link_phishing_lalu_cache(gw):
    s, body, h = call(gw, "POST", "/api/check", {"url": "https://bca-mobile-verifikasi.cfd/akun"})
    assert s == 200 and body["is_phishing"] is True and body["reasons"]
    assert h["X-Cache"] == "MISS"
    s, body2, h = call(gw, "POST", "/api/check", {"url": "https://bca-mobile-verifikasi.cfd/akun"})
    assert h["X-Cache"] == "HIT" and body2 == body


def test_link_aman_dan_allowlist(gw):
    s, body, _ = call(gw, "POST", "/api/check", {"url": "https://en.wikipedia.org/wiki/Phishing"})
    assert s == 200 and body["is_phishing"] is False
    s, body, _ = call(gw, "POST", "/api/check", {"url": "www.google.com"})
    assert body["model"] == "allowlist"


def test_url_tidak_valid(gw):
    s, body, _ = call(gw, "POST", "/api/check", {"url": "javascript:alert(1)"})
    assert s == 400 and "tidak valid" in body["error"]


def test_laporan_sampai_dashboard_admin(gw):
    s, rep, _ = call(gw, "POST", "/api/report", {"url": "https://kurir-paket.online/resi", "kind": "phishing_lolos", "note": "dari WA"})
    assert s == 201 and rep["status"] == "baru"

    assert call(gw, "GET", "/api/admin/reports")[0] == 401
    assert call(gw, "POST", "/api/admin/login", {"password": "salah"})[0] == 401
    s, login, _ = call(gw, "POST", "/api/admin/login", {"password": PASSWORD})
    tok = login["token"]

    s, reports, _ = call(gw, "GET", "/api/admin/reports", token=tok)
    assert [r["id"] for r in reports] == [rep["id"]]
    s, upd, _ = call(gw, "PATCH", f"/api/admin/reports/{rep['id']}", {"status": "valid"}, token=tok)
    assert s == 200 and upd["status"] == "valid"

    s, st, _ = call(gw, "GET", "/api/admin/stats", token=tok)
    assert st["reports"] == {"baru": 0, "valid": 1, "tidak_valid": 0}
    assert st["checks"] >= 4 and st["phishing"] >= 2  # dari tes cek link di atas (urutan berkas)
    assert len(st["daily"]) == 14
