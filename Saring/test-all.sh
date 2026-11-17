#!/usr/bin/env bash
# Jalankan semua tes Saring. Windows: jalankan di Git Bash.  ./test-all.sh
set -u
cd "$(dirname "$0")"
PY=ml/.venv/Scripts/python
[ -x "$PY" ] || PY=ml/.venv/bin/python
fail=0

run() {
  echo "== $1"
  shift
  if "$@"; then echo "   OK"; else echo "   GAGAL"; fail=1; fi
}

run "Gateway (Go)"            bash -c "cd gateway && go vet ./... && go test -count=1 ./..."
run "ML + end-to-end (pytest)" bash -c "cd ml && ../$PY -m pytest"
run "Web (Vitest)"            bash -c "cd web && npx vitest run"
run "Extension (node --test)" node --test "extension/tests/*.test.mjs"

[ $fail -eq 0 ] && echo "Semua tes lolos." || echo "Ada tes yang gagal."
exit $fail
