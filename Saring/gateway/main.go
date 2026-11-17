// Gateway: validasi, allowlist, cache, rate limit, lalu proxy ke Python ML service.
package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

var (
	mlURL    = env("ML_URL", "http://127.0.0.1:8000")
	addr     = env("ADDR", ":8787")
	client   = &http.Client{Timeout: 5 * time.Second}
	cacheTTL = time.Hour
)

// ponytail: allowlist hardcoded, pindah ke file kalau sering berubah.
// Cocok hanya host persis / www. — subdomain (docs.google.com, sites.google.com) tetap dicek model
// karena sering dipakai hosting halaman phishing.
var allowlist = []string{
	"google.com", "youtube.com", "facebook.com", "instagram.com", "whatsapp.com", "x.com", "twitter.com",
	"wikipedia.org", "github.com", "microsoft.com", "apple.com", "amazon.com", "linkedin.com", "netflix.com",
	"tokopedia.com", "shopee.co.id", "klikbca.com", "bca.co.id", "bri.co.id", "bankmandiri.co.id",
	"bni.co.id", "detik.com", "kompas.com", "chatgpt.com", "openai.com", "claude.ai",
}

type cacheEntry struct {
	body []byte
	exp  time.Time
}

var (
	mu    sync.Mutex
	cache = map[string]cacheEntry{}
	hits  = map[string][]time.Time{} // ponytail: sliding window per IP di memori, cukup untuk 1 instance
)

const rateLimit = 60 // request per menit per IP

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func allowed(ip string) bool {
	mu.Lock()
	defer mu.Unlock()
	now := time.Now()
	recent := hits[ip][:0]
	for _, t := range hits[ip] {
		if now.Sub(t) < time.Minute {
			recent = append(recent, t)
		}
	}
	if len(recent) >= rateLimit {
		hits[ip] = recent
		return false
	}
	hits[ip] = append(recent, now)
	return true
}

func inAllowlist(host string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	for _, d := range allowlist {
		if host == d || host == "www."+d {
			return true
		}
	}
	return false
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func check(w http.ResponseWriter, r *http.Request) {
	if !allowed(clientIP(r)) {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "terlalu banyak request"})
		return
	}
	var req struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "body harus {\"url\": \"...\"}"})
		return
	}
	raw, u, ok := normalizeURL(req.URL)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "URL tidak valid (harus http/https)"})
		return
	}

	if inAllowlist(u.Hostname()) {
		countCheck(false)
		writeJSON(w, http.StatusOK, map[string]any{"url": req.URL, "is_phishing": false, "score": 0,
			"model": "allowlist", "reasons": []any{}})
		return
	}

	mu.Lock()
	e, ok := cache[raw]
	mu.Unlock()
	if ok && time.Now().Before(e.exp) {
		countCheck(isPhishing(e.body))
		w.Header().Set("X-Cache", "HIT")
		w.Header().Set("Content-Type", "application/json")
		w.Write(e.body)
		return
	}

	payload, _ := json.Marshal(map[string]string{"url": raw})
	resp, err := client.Post(mlURL+"/predict", "application/json", bytes.NewReader(payload))
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "ML service tidak tersedia"})
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "ML service error"})
		return
	}
	mu.Lock()
	cache[raw] = cacheEntry{body, time.Now().Add(cacheTTL)}
	mu.Unlock()
	countCheck(isPhishing(body))
	w.Header().Set("X-Cache", "MISS")
	w.Header().Set("Content-Type", "application/json")
	w.Write(body)
}

// normalizeURL: trim, tambah http:// bila tanpa skema, wajib http/https + host, maks 2048 karakter.
func normalizeURL(s string) (string, *url.URL, bool) {
	raw := strings.TrimSpace(s)
	if !strings.Contains(raw, "://") {
		raw = "http://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || len(raw) > 2048 {
		return "", nil, false
	}
	return raw, u, true
}

func isPhishing(body []byte) bool {
	var r struct {
		IsPhishing bool `json:"is_phishing"`
	}
	json.Unmarshal(body, &r)
	return r.IsPhishing
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*") // API publik tanpa cookie/credential
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, PATCH, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	go func() { // buang cache & rate-limit kadaluarsa
		for range time.Tick(10 * time.Minute) {
			mu.Lock()
			for k, e := range cache {
				if time.Now().After(e.exp) {
					delete(cache, k)
				}
			}
			clear(hits)
			mu.Unlock()
		}
	}()

	db = openDB(env("DB", "data/saring.db"))
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/check", check)
	mux.HandleFunc("POST /api/report", report)
	mux.HandleFunc("POST /api/admin/login", adminLogin)
	mux.HandleFunc("GET /api/admin/reports", requireAdmin(listReports))
	mux.HandleFunc("PATCH /api/admin/reports/{id}", requireAdmin(updateReport))
	mux.HandleFunc("GET /api/admin/stats", requireAdmin(stats))
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
	log.Printf("gateway di %s -> %s", addr, mlURL)
	log.Fatal(http.ListenAndServe(addr, cors(mux)))
}
