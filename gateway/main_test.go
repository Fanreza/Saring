package main

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func do(h http.Handler, method, path, body, tok string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if tok != "" {
		r.Header.Set("Authorization", "Bearer "+tok)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestClientIPBehindProxy(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "172.18.0.5:5000"
	r.Header.Set("X-Forwarded-For", "6.6.6.6, 203.0.113.9")
	trustProxy = false
	if ip := clientIP(r); ip != "172.18.0.5" {
		t.Fatalf("tanpa TRUST_PROXY harus pakai RemoteAddr, dapat %s", ip)
	}
	trustProxy = true
	defer func() { trustProxy = false }()
	if ip := clientIP(r); ip != "203.0.113.9" {
		t.Fatalf("dengan TRUST_PROXY harus pakai entri XFF terakhir, dapat %s", ip)
	}
}

func TestReportAndAdminFlow(t *testing.T) {
	path := filepath.Join(t.TempDir(), "saring.db")
	db = openDB(path)
	adminPassword = "rahasia"
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/report", report)
	mux.HandleFunc("POST /api/admin/login", adminLogin)
	mux.HandleFunc("GET /api/admin/reports", requireAdmin(listReports))
	mux.HandleFunc("PATCH /api/admin/reports/{id}", requireAdmin(updateReport))

	if c := do(mux, "POST", "/api/report", `{"url":"javascript:alert(1)","kind":"phishing_lolos"}`, "").Code; c != 400 {
		t.Fatalf("URL invalid harus 400, dapat %d", c)
	}
	if c := do(mux, "POST", "/api/report", `{"url":"bca-login.xyz","kind":"lain"}`, "").Code; c != 400 {
		t.Fatalf("jenis tak dikenal harus 400, dapat %d", c)
	}
	if c := do(mux, "POST", "/api/report", `{"url":"bca-login.xyz","kind":"phishing_lolos"}`, "").Code; c != 201 {
		t.Fatalf("laporan valid harus 201, dapat %d", c)
	}
	if c := do(mux, "GET", "/api/admin/reports", "", "").Code; c != 401 {
		t.Fatalf("tanpa token harus 401, dapat %d", c)
	}
	if c := do(mux, "POST", "/api/admin/login", `{"password":"salah"}`, "").Code; c != 401 {
		t.Fatalf("password salah harus 401, dapat %d", c)
	}
	w := do(mux, "POST", "/api/admin/login", `{"password":"rahasia"}`, "")
	tok := w.Body.String()[len(`{"token":"`) : len(`{"token":"`)+64]
	if c := do(mux, "PATCH", "/api/admin/reports/1", `{"status":"valid"}`, tok).Code; c != 200 {
		t.Fatalf("ubah status harus 200, dapat %d", c)
	}
	db.Close()
	db = openDB(path)                // buka ulang: data harus tetap ada di berkas SQLite
	t.Cleanup(func() { db.Close() }) // Windows tidak bisa menghapus berkas yang masih terbuka
	var status string
	var n int
	db.QueryRow(`SELECT COUNT(*), MAX(status) FROM reports`).Scan(&n, &status)
	if n != 1 || status != "valid" {
		t.Fatalf("laporan tidak persisten: n=%d status=%q", n, status)
	}
	countCheck(true)
	countCheck(false)
	var checks, phishing int
	db.QueryRow(`SELECT SUM(checks), SUM(phishing) FROM daily_stats`).Scan(&checks, &phishing)
	if checks != 2 || phishing != 1 {
		t.Fatalf("statistik salah: checks=%d phishing=%d", checks, phishing)
	}
}
