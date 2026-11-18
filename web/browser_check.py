"""Pemeriksaan browser (Tugas 15): Chrome, Edge, layar ponsel, label formulir, keyboard, dan XSS.

Cara pakai (butuh `pip install playwright`, Chrome dan Edge terpasang, dan `npm run build` sudah dijalankan):
    python web/browser_check.py            # hasil dicetak, atau ditulis ke berkas bila BROWSER_OUT diisi

API ditiru dengan page.route, jadi yang diuji adalah tampilan web, bukan server. Bentuk responsnya sama dengan gateway asli.
"""
import functools
import http.server
import json
import os
import socketserver
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parent / "dist"
PHISH = {"url": "https://bca-mobile-verifikasi.cfd/akun", "is_phishing": True, "score": 0.998, "threshold": 0.6887, "model": "xgboost",
         "reasons": [{"feature": "suspicious_tld", "label": "Akhiran domain murah yang sering dipakai penipu", "value": 1, "impact": 2.1}]}
XSS_NOTE = "<img src=x onerror=window.__xss=1><script>window.__xss=1</script>"
PAGES = ["/cek", "/pindai", "/riwayat", "/lapor", "/edukasi", "/model", "/admin"]


class SPA(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        p = self.translate_path(self.path.split("?")[0])
        if not os.path.exists(p) or os.path.isdir(p):
            self.path = "/index.html"
        return super().do_GET()

    def log_message(self, *a):
        pass


def serve():
    srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(SPA, directory=str(DIST)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


def mock_api(route):
    req = route.request
    path = req.url.split("/api", 1)[1].split("?")[0]
    if path == "/check":
        url = json.loads(req.post_data or "{}").get("url", "")
        if url.startswith("javascript:"):
            return route.fulfill(status=400, content_type="application/json", body=json.dumps({"error": "URL tidak valid (harus http/https)"}))
        return route.fulfill(status=200, content_type="application/json", body=json.dumps(PHISH if "cfd" in url else {**PHISH, "url": url, "is_phishing": False, "score": 0.01, "reasons": []}))
    if path == "/admin/reports":
        return route.fulfill(status=200, content_type="application/json", body=json.dumps(
            [{"id": 1, "url": "http://a.com", "kind": "phishing_lolos", "note": XSS_NOTE, "status": "baru", "created": "2026-11-18T10:00:00Z"}]))
    if path == "/admin/stats":
        return route.fulfill(status=200, content_type="application/json", body=json.dumps(
            {"checks": 1, "phishing": 1, "safe": 0, "reports": {"baru": 1, "valid": 0, "tidak_valid": 0}, "daily": [{"date": "2026-11-18", "checks": 1, "phishing": 1}]}))
    route.fulfill(status=404, body="{}")


def unlabeled(page):
    return page.evaluate("""() => [...document.querySelectorAll('input,textarea,select')]
        .filter(e => e.type !== 'hidden' && !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby'))
        .map(e => e.id || e.name || e.tagName)""")


def overflow(page):
    return page.evaluate("document.documentElement.scrollWidth - window.innerWidth")


def run(p, base, channel, mobile=False):
    b = p.chromium.launch(channel=channel, headless=True)
    ctx = b.new_context(viewport={"width": 375, "height": 667} if mobile else {"width": 1280, "height": 800})
    ctx.add_init_script("sessionStorage.setItem('saring.admin', 'tes')")
    ctx.route("**/api/**", mock_api)
    out = {"versi": b.version}
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    # fungsi inti: ketik link lalu Periksa
    page.goto(base + "/cek")
    page.get_by_label("Link yang ingin diperiksa").fill(PHISH["url"])
    page.get_by_role("button", name="Periksa", exact=True).click()
    page.get_by_text("Alasan utama").wait_for(timeout=8000)
    out["cek_phishing"] = page.get_by_text("Phishing", exact=True).first.is_visible() and page.get_by_text(PHISH["reasons"][0]["label"]).is_visible()
    # keyboard: fokus ke kolom, ketik, Enter
    page.goto(base + "/cek")
    box = page.get_by_label("Link yang ingin diperiksa")
    box.focus()
    page.keyboard.type("https://en.wikipedia.org/wiki/Phishing")
    page.keyboard.press("Enter")
    page.get_by_text("Aman", exact=True).first.wait_for(timeout=8000)
    out["keyboard_enter"] = True
    # galat dari server tampil jelas
    page.goto(base + "/cek")
    page.get_by_label("Link yang ingin diperiksa").fill("javascript:alert(1)")
    page.get_by_role("button", name="Periksa", exact=True).click()
    page.get_by_role("alert").wait_for(timeout=8000)
    out["pesan_galat"] = page.get_by_role("alert").inner_text()
    # semua halaman: label, lebar, bahasa
    out["tanpa_label"] = {}
    out["meluap_px"] = {}
    for path in PAGES:
        page.goto(base + path)
        page.wait_for_load_state("networkidle")
        out["tanpa_label"][path] = unlabeled(page)
        out["meluap_px"][path] = overflow(page)
    out["html_lang"] = page.evaluate("document.documentElement.lang")
    out["judul"] = page.title()
    # XSS: catatan laporan berisi tag HTML harus tampil sebagai teks
    page.goto(base + "/admin")
    page.get_by_text("<script>", exact=False).first.wait_for(timeout=8000)
    out["xss_dieksekusi"] = page.evaluate("window.__xss === 1")
    out["xss_tampil_sebagai_teks"] = "<script>" in page.inner_text("body")
    out["error_js"] = errs
    b.close()
    return out


def main():
    if not (DIST / "index.html").exists():
        raise SystemExit("web/dist belum ada, jalankan `npm run build` di folder web")
    srv, port = serve()
    base = f"http://127.0.0.1:{port}"
    hasil = {}
    with sync_playwright() as p:
        hasil["chrome"] = run(p, base, "chrome")
        hasil["edge"] = run(p, base, "msedge")
        hasil["chrome_ponsel_375px"] = run(p, base, "chrome", mobile=True)
    srv.shutdown()
    txt = json.dumps(hasil, ensure_ascii=False, indent=1)
    out = os.environ.get("BROWSER_OUT")
    if out:
        Path(out).write_text(txt, encoding="utf-8")
    else:
        print(txt)


if __name__ == "__main__":
    main()
