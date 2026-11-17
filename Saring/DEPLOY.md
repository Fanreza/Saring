# Deploy Saring

Dua cara: **Dokploy** (disarankan, sudah dipakai untuk `saring.aethereal.top`) atau **VPS biasa dengan Docker Compose dan Caddy**.

| | Dokploy | VPS + Caddy |
|---|---|---|
| Berkas compose | `docker-compose.dokploy.yml` | `docker-compose.yml` |
| HTTPS | Traefik milik Dokploy | Caddy di container `web` |
| Port 80 dan 443 | dipakai Traefik, tidak dipublikasikan oleh compose | dipublikasikan oleh container `web` |

Memakai `docker-compose.yml` di Dokploy membuat container `web` gagal dengan galat `Bind for 0.0.0.0:80 failed: port is already allocated`. Pakai `docker-compose.dokploy.yml`.

Model `ml/models/model.joblib` ikut di repository, karena image `ml` menyalinnya saat build. Tidak perlu menyalinnya ke server.

## A. Dokploy

1. Buat dua A record ke IP server Dokploy **sebelum** menambah domain di Dokploy: `saring.aethereal.top` dan `gateway.aethereal.top`. Bila domain ditambah lebih dulu, sertifikat bisa gagal terbit.
2. Di Dokploy buat service bertipe **Compose** dengan Compose Type **Docker Compose**, Provider **GitHub**, repository `Fanreza/Saring`, branch `main`, dan Compose Path `./docker-compose.dokploy.yml`.
3. Di tab **Environment** isi `ADMIN_PASSWORD` dengan kata sandi panjang dan acak (misalnya `openssl rand -base64 24`). Compose berhenti dengan galat bila kosong.
4. Di tab **Domains** tambahkan tiga entri, semuanya HTTPS aktif dengan certificate `letsencrypt`:

| Host | Path | Service | Container Port | Strip Path |
|---|---|---|---|---|
| `saring.aethereal.top` | `/` | `web` | `80` | - |
| `saring.aethereal.top` | `/api` | `gateway` | `8787` | mati |
| `gateway.aethereal.top` | `/` | `gateway` | `8787` | mati |

Web memanggil `/api/check` di domainnya sendiri, jadi entri `/api` pada `saring.aethereal.top` wajib ada. `gateway.aethereal.top` dipakai extension. Keduanya langsung ke gateway (tanpa Caddy) agar pembatas request membaca IP pengunjung yang benar: `TRUST_PROXY=1` memakai entri terakhir `X-Forwarded-For`, yang harus ditambahkan oleh Traefik.

5. Klik **Deploy**. Perubahan domain baru berlaku setelah deploy ulang. Tunggu sekitar 10 detik untuk sertifikat.
6. Uji:

```bash
curl -X POST https://gateway.aethereal.top/api/check -H "Content-Type: application/json" -d '{"url":"https://bca-mobile-verifikasi.cfd/akun"}'
```

Hasilnya harus memuat `"is_phishing": true`. Bila muncul 429 padahal permintaan masih sedikit, berarti `/api` tidak langsung ke gateway.

7. Buka `https://saring.aethereal.top/cek`. Login admin ada di `https://saring.aethereal.top/admin` dengan `ADMIN_PASSWORD`.

Database SQLite ada di volume `gateway-data` dan dapat dibackup dari tab **Volume Backups** Dokploy. Update kode: push ke `main`, lalu **Deploy** ulang.

## B. VPS biasa (Docker Compose dan Caddy)

Hasil akhirnya: web, API, dan HTTPS berjalan di satu domain, misalnya `https://saring.contohdomain.com`.

```
Internet ──443──► web (Caddy: HTTPS + file web) ──/api/*──► gateway (Go + SQLite) ──► ml (FastAPI + XGBoost)
```

Hanya port 80 dan 443 yang terbuka ke internet. Gateway (8787) dan layanan model (8000) hanya bisa diakses dari dalam Docker.

### 1. Yang perlu disiapkan

- **VPS Linux** (Ubuntu 24.04 disarankan) dengan RAM minimal **2 GB**, 2 vCPU, dan disk 20 GB. Layanan model memakai sekitar 1 GB RAM.
- **Domain** dengan record DNS **A** yang mengarah ke IP VPS. Caddy membutuhkan ini untuk membuat sertifikat HTTPS otomatis.

### 2. Pasang Docker di VPS

```bash
ssh user@IP_VPS
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # keluar lalu login ulang agar berlaku
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

### 3. Ambil kode

```bash
git clone https://github.com/Fanreza/Saring.git saring && cd saring
```

### 4. Isi konfigurasi

```bash
cp .env.example .env
nano .env
```

```
DOMAIN=saring.contohdomain.com
ADMIN_PASSWORD=password-panjang-dan-acak
```

### 5. Jalankan

```bash
docker compose up -d --build
docker compose ps            # ketiga layanan harus "running", ml "healthy"
docker compose logs -f web   # tunggu baris "certificate obtained successfully"
```

Build pertama memakan beberapa menit karena memasang XGBoost dan SHAP. Cek hasilnya: `https://DOMAIN` menampilkan halaman Saring, dan `https://DOMAIN/admin` bisa login dengan `ADMIN_PASSWORD`.

### 6. Perawatan

| Kebutuhan | Perintah |
|---|---|
| Update kode | `git pull && docker compose up -d --build` |
| Ganti model | latih ulang dengan `ml/train.py`, commit `ml/models/model.joblib` yang baru, lalu `git pull && docker compose up -d --build ml` |
| Lihat log | `docker compose logs -f gateway` |
| Backup database | `docker compose stop gateway && docker compose cp gateway:/data/saring.db ./backup-$(date +%F).db && docker compose start gateway` |
| Matikan semua | `docker compose down` (data tetap tersimpan di volume) |

Database SQLite (laporan dan statistik) ada di volume `gateway-data`, jadi tidak hilang saat container dibuat ulang. Jangan memakai `docker compose down -v` kecuali memang ingin menghapus semua data.

### Mencoba di laptop dengan Docker

Kalau Docker Desktop terpasang, isi `.env` dengan `DOMAIN=localhost` lalu jalankan `docker compose up -d --build`. Buka `https://localhost`. Browser akan memperingatkan sertifikat lokal, dan itu normal.

## Arahkan extension ke server

Extension di repository sudah mengarah ke `https://gateway.aethereal.top` (API) dan `https://saring.aethereal.top` (web). Untuk domain lain:

1. Di `extension/config.js`, ganti `SARING_API` dan `SARING_WEB`.
2. Di `extension/manifest.json`, ganti `host_permissions` menjadi `"https://DOMAIN_API/*"`.
3. Muat ulang di `chrome://extensions`. Untuk dibagikan lewat Chrome Web Store, folder `extension/` bisa di-zip lalu diunggah (perlu akun developer).
