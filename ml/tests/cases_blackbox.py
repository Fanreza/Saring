"""Data kasus uji black-box (Tugas 12). Dipakai tes (test_blackbox.py) dan generator laporan.

Black-box: sistem dianggap kotak hitam. Penguji hanya memberi input lewat HTTP dan memeriksa output,
tanpa melihat kode. Setiap kasus punya ID tetap supaya hasil eksekusi bisa dicocokkan ke laporan.
"""

B = "https://a.com/"


def url_panjang(total):
    """URL dengan skema https dan panjang tepat `total` karakter."""
    return B + "x" * (total - len(B))


# ---------- Equivalence Partitioning: input URL ke POST /api/check ----------
# (id, deskripsi partisi, url, status_http_diharapkan, cek_tambahan)
CHECK_EP = [
    ("BB-EP-01", "URL phishing yang valid", "https://bca-mobile-verifikasi.cfd/akun", 200, "phishing"),
    ("BB-EP-02", "URL sah yang valid", "https://en.wikipedia.org/wiki/Phishing", 200, "aman"),
    ("BB-EP-03", "Domain di daftar terpercaya", "https://www.google.com", 200, "allowlist"),
    ("BB-EP-04", "URL tanpa skema (ditambah http://)", "en.wikipedia.org/wiki/Phishing", 200, "aman"),
    ("BB-EP-05", "Skema huruf besar", "HTTPS://EN.WIKIPEDIA.ORG/wiki/Phishing", 200, "aman"),
    ("BB-EP-06", "Skema tidak didukung (ftp)", "ftp://contoh.com/file", 400, "tidak valid"),
    ("BB-EP-07", "Skema berbahaya (javascript)", "javascript:alert(1)", 400, "tidak valid"),
    ("BB-EP-08", "Host kosong", "https://", 400, "tidak valid"),
    ("BB-EP-09", "String kosong", "", 400, "tidak valid"),
    ("BB-EP-10", "Hanya spasi", "     ", 400, "tidak valid"),
]

# ---------- Boundary Value Analysis: panjang URL (batas 2048 karakter) ----------
CHECK_BVA = [
    ("BB-BVA-01", "Panjang 2047 (satu di bawah batas)", url_panjang(2047), 200),
    ("BB-BVA-02", "Panjang 2048 (tepat di batas)", url_panjang(2048), 200),
    ("BB-BVA-03", "Panjang 2049 (satu di atas batas)", url_panjang(2049), 400),
    ("BB-BVA-04", "Panjang 14 (URL minimal bermakna)", B[:-1] + "/", 200),
]

# ---------- Boundary Value Analysis: panjang catatan laporan (batas 500 karakter) ----------
REPORT_BVA = [
    ("BB-BVA-05", "Catatan 0 karakter", "", 201),
    ("BB-BVA-06", "Catatan 499 karakter", "a" * 499, 201),
    ("BB-BVA-07", "Catatan 500 karakter (tepat di batas)", "a" * 500, 201),
    ("BB-BVA-08", "Catatan 501 karakter (satu di atas batas)", "a" * 501, 400),
]

# ---------- Decision Table: POST /api/report (URL x jenis x catatan) ----------
# (id, url_valid, jenis_valid, catatan_valid, status_diharapkan)
REPORT_DT = [
    ("BB-DT-01", True, True, True, 201),
    ("BB-DT-02", True, True, False, 400),
    ("BB-DT-03", True, False, True, 400),
    ("BB-DT-04", True, False, False, 400),
    ("BB-DT-05", False, True, True, 400),
    ("BB-DT-06", False, True, False, 400),
    ("BB-DT-07", False, False, True, 400),
    ("BB-DT-08", False, False, False, 400),
]

# ---------- Decision Table: akses admin (token x endpoint) ----------
# (id, deskripsi token, endpoint, status_diharapkan)
ADMIN_DT = [
    ("BB-DT-09", "tanpa token", "/api/admin/reports", 401),
    ("BB-DT-10", "token ngawur", "/api/admin/reports", 401),
    ("BB-DT-11", "token sah", "/api/admin/reports", 200),
    ("BB-DT-12", "tanpa token", "/api/admin/stats", 401),
    ("BB-DT-13", "token ngawur", "/api/admin/stats", 401),
    ("BB-DT-14", "token sah", "/api/admin/stats", 200),
]

# ---------- Use Case Testing: alur nyata pengguna ----------
USECASES = [
    ("BB-UC-01", "UC-01 Memeriksa link: pemeriksaan pertama MISS, kedua HIT dari cache dengan isi sama"),
    ("BB-UC-02", "UC-15 Melaporkan link, UC-18 login admin, UC-19 mengelola laporan, UC-20 melihat statistik: laporan dibuat, muncul di admin, status diubah, statistik ikut berubah"),
    ("BB-UC-03", "Batas 60 permintaan per menit: permintaan ke-61 dari IP yang sama ditolak 429"),
]
