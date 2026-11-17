// Laporan pengguna, statistik pemeriksaan (SQLite), dan autentikasi admin.
package main

import (
	"crypto/rand"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite" // driver SQLite tanpa CGO
)

type Report struct {
	ID      int       `json:"id"`
	URL     string    `json:"url"`
	Kind    string    `json:"kind"`   // phishing_lolos | salah_blokir
	Note    string    `json:"note"`   // opsional, maks 500 karakter
	Status  string    `json:"status"` // baru | valid | tidak_valid
	Created time.Time `json:"created"`
}

type Day struct {
	Checks   int `json:"checks"`
	Phishing int `json:"phishing"`
}

const schema = `
CREATE TABLE IF NOT EXISTS reports (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  url     TEXT NOT NULL,
  kind    TEXT NOT NULL CHECK (kind IN ('phishing_lolos', 'salah_blokir')),
  note    TEXT NOT NULL DEFAULT '',
  status  TEXT NOT NULL DEFAULT 'baru' CHECK (status IN ('baru', 'valid', 'tidak_valid')),
  created TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_status ON reports(status);
CREATE TABLE IF NOT EXISTS daily_stats (
  date     TEXT PRIMARY KEY,           -- YYYY-MM-DD
  checks   INTEGER NOT NULL DEFAULT 0,
  phishing INTEGER NOT NULL DEFAULT 0
);`

var db *sql.DB

func openDB(path string) *sql.DB {
	os.MkdirAll(filepath.Dir(path), 0o755)
	// WAL + busy_timeout: baca dan tulis bersamaan tanpa "database is locked"
	d, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)")
	if err != nil {
		log.Fatalf("buka database %s: %v", path, err)
	}
	d.SetMaxOpenConns(1) // ponytail: satu koneksi tulis cukup untuk 1 instance; naikkan bila pindah ke PostgreSQL
	if _, err := d.Exec(schema); err != nil {
		log.Fatalf("buat skema: %v", err)
	}
	return d
}

func countCheck(phishing bool) {
	p := 0
	if phishing {
		p = 1
	}
	_, err := db.Exec(`INSERT INTO daily_stats (date, checks, phishing) VALUES (?, 1, ?)
		ON CONFLICT(date) DO UPDATE SET checks = checks + 1, phishing = phishing + excluded.phishing`,
		time.Now().Format("2006-01-02"), p)
	if err != nil {
		log.Printf("gagal mencatat statistik: %v", err)
	}
}

var reportKinds = map[string]bool{"phishing_lolos": true, "salah_blokir": true}
var reportStatuses = map[string]bool{"baru": true, "valid": true, "tidak_valid": true}

// trustProxy: di belakang reverse proxy (Caddy), IP asli ada di X-Forwarded-For.
// Hanya aktif bila TRUST_PROXY=1, karena header ini bisa dipalsukan bila gateway diakses langsung.
var trustProxy = os.Getenv("TRUST_PROXY") == "1"

func clientIP(r *http.Request) string {
	if trustProxy {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			parts := strings.Split(xff, ",")
			return strings.TrimSpace(parts[len(parts)-1]) // entri terakhir ditambahkan proxy kita sendiri
		}
	}
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	return ip
}

func report(w http.ResponseWriter, r *http.Request) {
	if !allowed(clientIP(r)) {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "terlalu banyak request"})
		return
	}
	var req struct {
		URL  string `json:"url"`
		Kind string `json:"kind"`
		Note string `json:"note"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "format laporan tidak valid"})
		return
	}
	raw, _, ok := normalizeURL(req.URL)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "URL tidak valid (harus http/https)"})
		return
	}
	if !reportKinds[req.Kind] {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "jenis laporan tidak dikenal"})
		return
	}
	note := strings.TrimSpace(req.Note)
	if len([]rune(note)) > 500 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "catatan maksimal 500 karakter"})
		return
	}
	rep := Report{URL: raw, Kind: req.Kind, Note: note, Status: "baru", Created: time.Now()}
	res, err := db.Exec(`INSERT INTO reports (url, kind, note, status, created) VALUES (?, ?, ?, 'baru', ?)`,
		rep.URL, rep.Kind, rep.Note, rep.Created.Format(time.RFC3339))
	if err != nil {
		log.Printf("simpan laporan: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "laporan gagal disimpan"})
		return
	}
	id, _ := res.LastInsertId()
	rep.ID = int(id)
	writeJSON(w, http.StatusCreated, rep)
}

// ---------- admin ----------

var (
	adminPassword = os.Getenv("ADMIN_PASSWORD") // kosong = fitur admin nonaktif
	tokMu         sync.Mutex
	tokens        = map[string]time.Time{} // token -> kadaluarsa
)

const tokenTTL = 8 * time.Hour

func adminLogin(w http.ResponseWriter, r *http.Request) {
	if adminPassword == "" {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "admin belum diaktifkan (set ADMIN_PASSWORD)"})
		return
	}
	if !allowed(clientIP(r)) {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "terlalu banyak percobaan"})
		return
	}
	var req struct {
		Password string `json:"password"`
	}
	json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&req)
	if subtle.ConstantTimeCompare([]byte(req.Password), []byte(adminPassword)) != 1 {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "password salah"})
		return
	}
	b := make([]byte, 32)
	rand.Read(b)
	tok := hex.EncodeToString(b)
	tokMu.Lock()
	tokens[tok] = time.Now().Add(tokenTTL)
	tokMu.Unlock()
	writeJSON(w, http.StatusOK, map[string]string{"token": tok})
}

func requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tok := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		tokMu.Lock()
		exp, ok := tokens[tok]
		if ok && time.Now().After(exp) {
			delete(tokens, tok)
			ok = false
		}
		tokMu.Unlock()
		if tok == "" || !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "sesi admin tidak valid, silakan login"})
			return
		}
		next(w, r)
	}
}

func scanReports(rows *sql.Rows) ([]Report, error) {
	defer rows.Close()
	out := []Report{}
	for rows.Next() {
		var rp Report
		var created string
		if err := rows.Scan(&rp.ID, &rp.URL, &rp.Kind, &rp.Note, &rp.Status, &created); err != nil {
			return nil, err
		}
		rp.Created, _ = time.Parse(time.RFC3339, created)
		out = append(out, rp)
	}
	return out, rows.Err()
}

func listReports(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`SELECT id, url, kind, note, status, created FROM reports ORDER BY id DESC`)
	if err == nil {
		var out []Report
		if out, err = scanReports(rows); err == nil {
			writeJSON(w, http.StatusOK, out)
			return
		}
	}
	log.Printf("ambil laporan: %v", err)
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal mengambil laporan"})
}

func updateReport(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	var req struct {
		Status string `json:"status"`
	}
	json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&req)
	if err != nil || !reportStatuses[req.Status] {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "status harus baru, valid, atau tidak_valid"})
		return
	}
	res, err := db.Exec(`UPDATE reports SET status = ? WHERE id = ?`, req.Status, id)
	if n, _ := res.RowsAffected(); err == nil && n == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "laporan tidak ditemukan"})
		return
	}
	rows, err2 := db.Query(`SELECT id, url, kind, note, status, created FROM reports WHERE id = ?`, id)
	if err != nil || err2 != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal menyimpan status"})
		return
	}
	out, err := scanReports(rows)
	if err != nil || len(out) == 0 {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal menyimpan status"})
		return
	}
	writeJSON(w, http.StatusOK, out[0])
}

func stats(w http.ResponseWriter, r *http.Request) {
	var checks, phishing int
	db.QueryRow(`SELECT COALESCE(SUM(checks), 0), COALESCE(SUM(phishing), 0) FROM daily_stats`).Scan(&checks, &phishing)

	byStatus := map[string]int{"baru": 0, "valid": 0, "tidak_valid": 0}
	if rows, err := db.Query(`SELECT status, COUNT(*) FROM reports GROUP BY status`); err == nil {
		for rows.Next() {
			var s string
			var n int
			rows.Scan(&s, &n)
			byStatus[s] = n
		}
		rows.Close()
	}

	from := time.Now().AddDate(0, 0, -13).Format("2006-01-02")
	daily := map[string]Day{}
	if rows, err := db.Query(`SELECT date, checks, phishing FROM daily_stats WHERE date >= ?`, from); err == nil {
		for rows.Next() {
			var d string
			var v Day
			rows.Scan(&d, &v.Checks, &v.Phishing)
			daily[d] = v
		}
		rows.Close()
	}
	type dayRow struct {
		Date string `json:"date"`
		Day
	}
	days := []dayRow{}
	for i := 13; i >= 0; i-- { // 14 hari terakhir, termasuk hari tanpa pemeriksaan
		d := time.Now().AddDate(0, 0, -i).Format("2006-01-02")
		days = append(days, dayRow{d, daily[d]})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"checks": checks, "phishing": phishing, "safe": checks - phishing,
		"reports": byStatus, "daily": days,
	})
}
