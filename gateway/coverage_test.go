package main

// Tes white-box tambahan (Tugas 12): menutup cabang yang belum teruji menurut `go test -cover`.
// Tiap tes menyebut cabang kode yang dituju.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func adminMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/report", report)
	mux.HandleFunc("POST /api/admin/login", adminLogin)
	mux.HandleFunc("GET /api/admin/reports", requireAdmin(listReports))
	mux.HandleFunc("PATCH /api/admin/reports/{id}", requireAdmin(updateReport))
	mux.HandleFunc("GET /api/admin/stats", requireAdmin(stats))
	return mux
}

// adminToken menyiapkan token sesi admin yang sah tanpa melewati login.
func adminToken(t *testing.T) string {
	t.Helper()
	tokMu.Lock()
	tokens["tes-admin"] = time.Now().Add(time.Hour)
	tokMu.Unlock()
	t.Cleanup(func() {
		tokMu.Lock()
		delete(tokens, "tes-admin")
		tokMu.Unlock()
	})
	return "tes-admin"
}

// habiskan menghabiskan jatah request satu IP (httptest memakai 192.0.2.1).
func habiskan(ip string) {
	for i := 0; i < rateLimit; i++ {
		allowed(ip)
	}
}

func TestReportDitolakSaatRateLimit(t *testing.T) { // report(): cabang !allowed -> 429
	setup(t)
	habiskan("192.0.2.1")
	w := do(adminMux(), "POST", "/api/report", `{"url":"bca.xyz","kind":"phishing_lolos"}`, "")
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("harus 429, dapat %d", w.Code)
	}
}

func TestCheckDitolakSaatRateLimit(t *testing.T) { // check(): cabang !allowed -> 429, model tidak dipanggil
	srv, calls := fakeML(t)
	mlURL = srv.URL
	mux := setup(t)
	habiskan("192.0.2.1")
	w := do(mux, "POST", "/api/check", `{"url":"https://bank-phish.xyz/login"}`, "")
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("harus 429, dapat %d", w.Code)
	}
	if calls.Load() != 0 {
		t.Fatalf("model tidak boleh dipanggil saat dibatasi, dipanggil %d kali", calls.Load())
	}
}

func TestReportGagalSimpanDB500(t *testing.T) { // report(): cabang db.Exec error -> 500
	setup(t)
	db.Close()
	w := do(adminMux(), "POST", "/api/report", `{"url":"bca.xyz","kind":"phishing_lolos"}`, "")
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("harus 500, dapat %d", w.Code)
	}
}

func TestLoginDibatasiRateLimit(t *testing.T) { // adminLogin(): cabang !allowed -> 429
	setup(t)
	old := adminPassword
	adminPassword = "x"
	defer func() { adminPassword = old }()
	habiskan("192.0.2.1")
	w := do(adminMux(), "POST", "/api/admin/login", `{"password":"x"}`, "")
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("harus 429, dapat %d", w.Code)
	}
}

func TestLoginBenarMenghasilkanTokenYangBerlaku(t *testing.T) { // adminLogin(): jalur sukses -> requireAdmin menerima
	setup(t)
	old := adminPassword
	adminPassword = "rahasia"
	defer func() { adminPassword = old }()
	mux := adminMux()
	w := do(mux, "POST", "/api/admin/login", `{"password":"rahasia"}`, "")
	var out struct{ Token string }
	json.Unmarshal(w.Body.Bytes(), &out)
	if w.Code != 200 || len(out.Token) != 64 {
		t.Fatalf("login harus 200 dengan token 64 hex, dapat %d %q", w.Code, w.Body)
	}
	if c := do(mux, "GET", "/api/admin/stats", "", out.Token).Code; c != 200 {
		t.Fatalf("token hasil login harus diterima, dapat %d", c)
	}
}

func TestBodyDipotong4096Menghasilkan400(t *testing.T) { // check(): LimitReader memotong body -> JSON rusak -> 400
	srv, _ := fakeML(t)
	mlURL = srv.URL
	mux := setup(t)
	body := `{"url":"https://a.com/` + strings.Repeat("x", 5000) + `"}`
	if w := do(mux, "POST", "/api/check", body, ""); w.Code != 400 {
		t.Fatalf("body > 4096 byte harus 400, dapat %d", w.Code)
	}
}

func TestDaftarLaporanTerbaruDulu(t *testing.T) { // listReports(): jalur sukses + urutan ORDER BY id DESC
	setup(t)
	mux := adminMux()
	do(mux, "POST", "/api/report", `{"url":"pertama.xyz","kind":"phishing_lolos"}`, "")
	do(mux, "POST", "/api/report", `{"url":"kedua.xyz","kind":"salah_blokir","note":"situs resmi"}`, "")
	w := do(mux, "GET", "/api/admin/reports", "", adminToken(t))
	var list []Report
	json.Unmarshal(w.Body.Bytes(), &list)
	if w.Code != 200 || len(list) != 2 {
		t.Fatalf("harus 200 dengan 2 laporan, dapat %d %s", w.Code, w.Body)
	}
	if list[0].ID <= list[1].ID || list[0].Note != "situs resmi" || list[0].Status != "baru" {
		t.Fatalf("laporan terbaru harus di atas dan berstatus baru: %+v", list)
	}
}

func TestDaftarLaporanKosongBukanNull(t *testing.T) { // scanReports(): hasil kosong tetap []
	setup(t)
	w := do(adminMux(), "GET", "/api/admin/reports", "", adminToken(t))
	if w.Code != 200 || strings.TrimSpace(w.Body.String()) != "[]" {
		t.Fatalf("daftar kosong harus [], dapat %d %q", w.Code, w.Body)
	}
}

func TestDaftarLaporanDBError500(t *testing.T) { // listReports(): cabang error -> 500
	setup(t)
	db.Close()
	if w := do(adminMux(), "GET", "/api/admin/reports", "", adminToken(t)); w.Code != 500 {
		t.Fatalf("harus 500, dapat %d", w.Code)
	}
}

func TestUbahStatusSuksesDanTidakDitemukan(t *testing.T) { // updateReport(): 200 dan cabang RowsAffected == 0 -> 404
	setup(t)
	mux := adminMux()
	tok := adminToken(t)
	do(mux, "POST", "/api/report", `{"url":"bca.xyz","kind":"phishing_lolos"}`, "")
	w := do(mux, "PATCH", "/api/admin/reports/1", `{"status":"tidak_valid"}`, tok)
	var rep Report
	json.Unmarshal(w.Body.Bytes(), &rep)
	if w.Code != 200 || rep.Status != "tidak_valid" || rep.URL != "http://bca.xyz" {
		t.Fatalf("ubah status harus 200 dan mengembalikan laporan terbaru: %d %s", w.Code, w.Body)
	}
	if c := do(mux, "PATCH", "/api/admin/reports/9999", `{"status":"valid"}`, tok).Code; c != 404 {
		t.Fatalf("id tak ada harus 404, dapat %d", c)
	}
}

// updateReport(): db.Exec gagal -> res bernilai nil. Kode harus membalas 500, bukan panic.
func TestUbahStatusDBErrorTidakPanic(t *testing.T) {
	setup(t)
	mux := adminMux()
	tok := adminToken(t)
	do(mux, "POST", "/api/report", `{"url":"bca.xyz","kind":"phishing_lolos"}`, "")
	db.Close()
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("handler panic saat database error: %v", r)
		}
	}()
	if c := do(mux, "PATCH", "/api/admin/reports/1", `{"status":"valid"}`, tok).Code; c != 500 {
		t.Fatalf("database error harus 500, dapat %d", c)
	}
}

func TestStatistikMenjumlahkanDanMengelompokkan(t *testing.T) { // stats(): SUM, GROUP BY status, 14 hari
	setup(t)
	today := time.Now().Format("2006-01-02")
	yesterday := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	old := time.Now().AddDate(0, 0, -30).Format("2006-01-02")
	for _, r := range [][]any{{today, 10, 4}, {yesterday, 5, 1}, {old, 100, 50}} {
		db.Exec(`INSERT INTO daily_stats (date, checks, phishing) VALUES (?, ?, ?)`, r...)
	}
	for _, s := range []string{"baru", "baru", "valid", "tidak_valid"} {
		db.Exec(`INSERT INTO reports (url, kind, note, status, created) VALUES ('http://a.com', 'phishing_lolos', '', ?, ?)`,
			s, time.Now().Format(time.RFC3339))
	}
	w := do(adminMux(), "GET", "/api/admin/stats", "", adminToken(t))
	var out struct {
		Checks, Phishing, Safe int
		Reports                map[string]int
		Daily                  []struct {
			Date     string
			Checks   int
			Phishing int
		}
	}
	json.Unmarshal(w.Body.Bytes(), &out)
	if w.Code != 200 || out.Checks != 115 || out.Phishing != 55 || out.Safe != 60 {
		t.Fatalf("total semua hari salah: %d %+v", w.Code, out)
	}
	if out.Reports["baru"] != 2 || out.Reports["valid"] != 1 || out.Reports["tidak_valid"] != 1 {
		t.Fatalf("pengelompokan status salah: %v", out.Reports)
	}
	if len(out.Daily) != 14 || out.Daily[13].Date != today || out.Daily[13].Checks != 10 || out.Daily[12].Phishing != 1 {
		t.Fatalf("14 hari terakhir salah: %+v", out.Daily)
	}
	for _, d := range out.Daily { // data 30 hari lalu tidak boleh masuk grafik
		if d.Date == old {
			t.Fatalf("hari di luar 14 hari ikut tampil: %s", old)
		}
	}
}

func TestCountCheckGagalTidakPanic(t *testing.T) { // countCheck(): cabang err != nil hanya mencatat log
	setup(t)
	db.Close()
	countCheck(true)
}

// normalizeURL: setiap kondisi dalam `err != nil || scheme tidak http/https || host kosong || len > 2048`
// diuji sendirian sebagai satu-satunya penyebab URL ditolak (condition coverage), ditambah dua sisi cabang
// "skema belum ada".
func TestNormalizeURLSetiapKondisiTerisolasi(t *testing.T) {
	cases := []struct {
		nama, in, out string
		ok            bool
	}{
		{"K1 url.Parse gagal (spasi di host)", "http://exa mple.com", "", false},
		{"K2 skema bukan http/https", "ftp://contoh.com", "", false},
		{"K3 host kosong", "https://", "", false},
		{"K4 panjang 2049 (satu di atas batas)", "https://a.com/" + strings.Repeat("x", 2049-len("https://a.com/")), "", false},
		{"semua kondisi lolos, panjang tepat 2048", "https://a.com/" + strings.Repeat("x", 2048-len("https://a.com/")),
			"https://a.com/" + strings.Repeat("x", 2048-len("https://a.com/")), true},
		{"cabang skema belum ada: ditambah http://", "localhost:8080/x", "http://localhost:8080/x", true},
		{"cabang skema sudah ada: tidak diubah", "https://contoh.com/x", "https://contoh.com/x", true},
	}
	for _, c := range cases {
		out, _, ok := normalizeURL(c.in)
		if ok != c.ok || out != c.out {
			t.Errorf("%s: normalizeURL(%.40q) = %.40q,%v; mau %.40q,%v", c.nama, c.in, out, ok, c.out, c.ok)
		}
	}
}

func TestEnvPakaiNilaiAtauDefault(t *testing.T) { // env(): dua cabang
	t.Setenv("SARING_TES", "dari-env")
	if got := env("SARING_TES", "bawaan"); got != "dari-env" {
		t.Fatalf("harus memakai nilai env, dapat %q", got)
	}
	if got := env("SARING_TIDAK_ADA", "bawaan"); got != "bawaan" {
		t.Fatalf("harus memakai bawaan, dapat %q", got)
	}
}

func TestCORSMeneruskanRequestBiasa(t *testing.T) { // cors(): cabang bukan OPTIONS diteruskan ke handler
	h := cors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) }))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	if w.Body.String() != "ok" || w.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("request biasa harus diteruskan dengan header CORS: %q %v", w.Body, w.Header())
	}
}
