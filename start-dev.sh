#!/usr/bin/env bash
# Nyalakan Saring di laptop: ML service (8000), gateway (8787), web (5173).
# Windows: jalankan di Git Bash.  ./start-dev.sh      Hentikan: Ctrl+C
# Password admin: ADMIN_PASSWORD=rahasia ./start-dev.sh  (default: saring-admin)
set -u
cd "$(dirname "$0")"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-saring-admin}"
PY=ml/.venv/Scripts/python
[ -x "$PY" ] || PY=ml/.venv/bin/python

if [ ! -f ml/models/model.joblib ]; then
  echo "Model belum ada. Jalankan dulu: cd ml && python download_data.py && python build_dataset.py && python train.py"
  exit 1
fi

# port terpakai? cek IPv4 dan IPv6 (Vite bisa hanya mendengar di ::1); buka koneksi tanpa mengirim data
busy() { (: > "/dev/tcp/127.0.0.1/$1") 2>/dev/null || (: > "/dev/tcp/::1/$1") 2>/dev/null; }

pids=()
stop() {
  trap - INT TERM
  echo; echo "Menghentikan server yang dinyalakan skrip ini..."
  [ ${#pids[@]} -gt 0 ] && kill "${pids[@]}" 2>/dev/null
  exit 0
}
trap stop INT TERM

if busy 8000; then echo "Port 8000 sudah dipakai, ML service dilewati"; else
  (cd ml && exec "../$PY" -m uvicorn serve:app --port 8000 --log-level warning) &
  pids+=($!)
fi
if busy 8787; then echo "Port 8787 sudah dipakai, gateway dilewati"; else
  (cd gateway && go build -o gateway.exe . && exec ./gateway.exe) &
  pids+=($!)
fi
# web: pakai 5173; bila port itu dipakai aplikasi lain (bukan Saring), cari port kosong berikutnya
WEB_PORT=5173
is_saring() { curl -s "http://localhost:$1" | grep -q "<title>Saring"; }
if busy 5173 && is_saring 5173; then echo "Web Saring sudah jalan di port 5173"; else
  while busy "$WEB_PORT"; do WEB_PORT=$((WEB_PORT + 1)); done
  [ "$WEB_PORT" != 5173 ] && echo "Port 5173 dipakai aplikasi lain, web Saring memakai port $WEB_PORT"
  (cd web && exec node node_modules/vite/bin/vite.js --port "$WEB_PORT" --strictPort) &
  pids+=($!)
fi

for i in $(seq 1 90); do busy 8000 && busy 8787 && busy "$WEB_PORT" && break; sleep 1; done
echo
echo "Saring siap:"
echo "  Web      http://localhost:$WEB_PORT"
echo "  Admin    http://localhost:$WEB_PORT/#/admin   (password: $ADMIN_PASSWORD, tidak tampil di menu)"
echo "  Gateway  http://localhost:8787   ML service  http://localhost:8000"
echo "Tekan Ctrl+C untuk menghentikan."
while :; do sleep 3600; done # tunggu Ctrl+C
