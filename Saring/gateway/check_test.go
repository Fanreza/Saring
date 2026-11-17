package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// fakeML meniru layanan model: link berisi "phish" dianggap phishing. Menghitung jumlah panggilan.
func fakeML(t *testing.T) (*httptest.Server, *atomic.Int32) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		var req struct{ URL string }
		json.NewDecoder(r.Body).Decode(&req)
		bad := strings.Contains(req.URL, "phish")
		score := 0.05
		if bad {
			score = 0.97
		}
		json.NewEncoder(w).Encode(map[string]any{"url": req.URL, "is_phishing": bad, "score": score, "threshold": 0.689, "model": "xgboost", "reasons": []any{}})
	}))
	t.Cleanup(srv.Close)
	return srv, &calls
}

func setup(t *testing.T) *http.ServeMux {
	t.Helper()
	db = openDB(filepath.Join(t.TempDir(), "saring.db"))
	t.Cleanup(func() { db.Close() })
	mu.Lock()
	clear(cache)
	clear(hits)
	mu.Unlock()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/check", check)
	mux.HandleFunc("GET /api/admin/stats", requireAdmin(stats))
	return mux
}

func TestNormalizeURL(t *testing.T) {
	cases := []struct {
		in, out string
		ok      bool
	}{
		{"contoh.com/a", "http://contoh.com/a", true},
		{"  https://contoh.com  ", "https://contoh.com", true},
		{"ftp://contoh.com", "", false},
		{"javascript:alert(1)", "", false},
		{"https://", "", false},
		{"", "", false},
		{"https://a.com/" + strings.Repeat("x", 2040), "", false},
	}
	for _, c := range cases {
		out, _, ok := normalizeURL(c.in)
		if ok != c.ok || out != c.out {
			t.Errorf("normalizeURL(%q) = %q,%v; mau %q,%v", c.in, out, ok, c.out, c.ok)
		}
	}
}

func TestInAllowlistHanyaHostPersis(t *testing.T) {
	for host, want := range map[string]bool{
		"google.com": true, "www.google.com": true, "GOOGLE.COM.": true,
		"docs.google.com": false, "google.com.phish.xyz": false, "notgoogle.com": false,
	} {
		if got := inAllowlist(host); got != want {
			t.Errorf("inAllowlist(%q) = %v, mau %v", host, got, want)
		}
	}
}

func TestCheckAlurLengkap(t *testing.T) {
	srv, calls := fakeML(t)
	mlURL = srv.URL
	mux := setup(t)
	post := func(url string) *httptest.ResponseRecorder {
		return do(mux, "POST", "/api/check", `{"url":"`+url+`"}`, "")
	}

	// URL tidak valid ditolak tanpa memanggil model
	if w := post("javascript:alert(1)"); w.Code != 400 {
		t.Fatalf("URL invalid harus 400, dapat %d", w.Code)
	}
	if w := do(mux, "POST", "/api/check", `bukan json`, ""); w.Code != 400 {
		t.Fatalf("body rusak harus 400, dapat %d", w.Code)
	}
	// allowlist langsung aman tanpa model
	w := post("https://www.google.com")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"model":"allowlist"`) {
		t.Fatalf("allowlist salah: %d %s", w.Code, w.Body)
	}
	if calls.Load() != 0 {
		t.Fatalf("model tidak boleh dipanggil untuk URL invalid / allowlist, dipanggil %d kali", calls.Load())
	}
	// pemeriksaan pertama: MISS, kedua: HIT dari cache
	w = post("https://bank-phish.xyz/login")
	if w.Code != 200 || w.Header().Get("X-Cache") != "MISS" || !isPhishing(w.Body.Bytes()) {
		t.Fatalf("pemeriksaan pertama salah: %d %s %s", w.Code, w.Header().Get("X-Cache"), w.Body)
	}
	if w = post("https://bank-phish.xyz/login"); w.Header().Get("X-Cache") != "HIT" {
		t.Fatalf("pemeriksaan kedua harus dari cache")
	}
	if calls.Load() != 1 {
		t.Fatalf("model harus dipanggil sekali, dipanggil %d kali", calls.Load())
	}
	post("https://artikel.com/berita")

	// statistik: 4 pemeriksaan (allowlist, MISS, HIT, artikel), 2 phishing
	var checks, phishing int
	db.QueryRow(`SELECT SUM(checks), SUM(phishing) FROM daily_stats`).Scan(&checks, &phishing)
	if checks != 4 || phishing != 2 {
		t.Fatalf("statistik salah: checks=%d phishing=%d", checks, phishing)
	}
}

func TestCacheKedaluwarsa(t *testing.T) {
	srv, calls := fakeML(t)
	mlURL = srv.URL
	mux := setup(t)
	do(mux, "POST", "/api/check", `{"url":"https://a.com/x"}`, "")
	mu.Lock()
	e := cache["https://a.com/x"]
	e.exp = time.Now().Add(-time.Second)
	cache["https://a.com/x"] = e
	mu.Unlock()
	if w := do(mux, "POST", "/api/check", `{"url":"https://a.com/x"}`, ""); w.Header().Get("X-Cache") != "MISS" {
		t.Fatalf("cache kedaluwarsa harus MISS")
	}
	if calls.Load() != 2 {
		t.Fatalf("model harus dipanggil ulang, dipanggil %d kali", calls.Load())
	}
}

func TestModelMati502(t *testing.T) {
	srv, _ := fakeML(t)
	mlURL = srv.URL
	srv.Close()
	mux := setup(t)
	if w := do(mux, "POST", "/api/check", `{"url":"https://a.com"}`, ""); w.Code != 502 {
		t.Fatalf("model mati harus 502, dapat %d", w.Code)
	}
	errSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) }))
	defer errSrv.Close()
	mlURL = errSrv.URL
	if w := do(mux, "POST", "/api/check", `{"url":"https://b.com"}`, ""); w.Code != 502 {
		t.Fatalf("model error harus 502, dapat %d", w.Code)
	}
}

func TestRateLimit60PerMenit(t *testing.T) {
	setup(t)
	for i := 0; i < rateLimit; i++ {
		if !allowed("10.0.0.1") {
			t.Fatalf("permintaan ke-%d seharusnya diizinkan", i+1)
		}
	}
	if allowed("10.0.0.1") {
		t.Fatal("permintaan ke-61 harus ditolak")
	}
	if !allowed("10.0.0.2") {
		t.Fatal("IP lain tidak boleh ikut terblokir")
	}
	mu.Lock()
	for i := range hits["10.0.0.1"] {
		hits["10.0.0.1"][i] = time.Now().Add(-2 * time.Minute) // jendela 1 menit sudah lewat
	}
	mu.Unlock()
	if !allowed("10.0.0.1") {
		t.Fatal("setelah 1 menit harus diizinkan lagi")
	}
}

func TestCORSPreflight(t *testing.T) {
	h := cors(http.NewServeMux())
	w := do(h, "OPTIONS", "/api/check", "", "")
	if w.Code != 204 || w.Header().Get("Access-Control-Allow-Origin") != "*" ||
		!strings.Contains(w.Header().Get("Access-Control-Allow-Headers"), "Authorization") ||
		!strings.Contains(w.Header().Get("Access-Control-Allow-Methods"), "PATCH") {
		t.Fatalf("preflight CORS salah: %d %v", w.Code, w.Header())
	}
}

func TestAdminNonaktifTanpaPassword(t *testing.T) {
	setup(t)
	old := adminPassword
	adminPassword = ""
	defer func() { adminPassword = old }()
	if w := do(http.HandlerFunc(adminLogin), "POST", "/", `{"password":""}`, ""); w.Code != 503 {
		t.Fatalf("tanpa ADMIN_PASSWORD login harus 503, dapat %d", w.Code)
	}
}

func TestTokenKedaluwarsaDitolak(t *testing.T) {
	mux := setup(t)
	tokMu.Lock()
	tokens["lama"] = time.Now().Add(-time.Minute)
	tokens["baru"] = time.Now().Add(time.Hour)
	tokMu.Unlock()
	if w := do(mux, "GET", "/api/admin/stats", "", "lama"); w.Code != 401 {
		t.Fatalf("token kedaluwarsa harus 401, dapat %d", w.Code)
	}
	if w := do(mux, "GET", "/api/admin/stats", "", "ngawur"); w.Code != 401 {
		t.Fatalf("token tak dikenal harus 401, dapat %d", w.Code)
	}
	w := do(mux, "GET", "/api/admin/stats", "", "baru")
	var s struct {
		Checks int              `json:"checks"`
		Daily  []map[string]any `json:"daily"`
	}
	json.Unmarshal(w.Body.Bytes(), &s)
	if w.Code != 200 || len(s.Daily) != 14 {
		t.Fatalf("stats harus 200 dengan 14 hari, dapat %d %s", w.Code, w.Body)
	}
}

func TestLaporanValidasi(t *testing.T) {
	setup(t)
	h := http.HandlerFunc(report)
	cases := map[string]int{
		`{"url":"bca.xyz","kind":"phishing_lolos"}`:                                         201,
		`{"url":"bca.xyz","kind":"salah_blokir","note":"` + strings.Repeat("a", 500) + `"}`: 201,
		`{"url":"bca.xyz","kind":"salah_blokir","note":"` + strings.Repeat("a", 501) + `"}`: 400,
		`{"url":"bca.xyz","kind":"lain"}`:                                                   400,
		`{"url":"","kind":"phishing_lolos"}`:                                                400,
		`rusak`:                                                                             400,
	}
	for body, want := range cases {
		if w := do(h, "POST", "/api/report", body, ""); w.Code != want {
			t.Errorf("%.40s... = %d, mau %d", body, w.Code, want)
		}
	}
}

func TestUbahStatusTidakValid(t *testing.T) {
	setup(t)
	mux := http.NewServeMux()
	mux.HandleFunc("PATCH /api/admin/reports/{id}", updateReport) // tanpa requireAdmin: yang dites validasinya
	for path, body := range map[string]string{"/api/admin/reports/1": `{"status":"hapus"}`, "/api/admin/reports/abc": `{"status":"valid"}`} {
		if w := do(mux, "PATCH", path, body, ""); w.Code != 400 {
			t.Errorf("PATCH %s %s harus 400, dapat %d", path, body, w.Code)
		}
	}
}
