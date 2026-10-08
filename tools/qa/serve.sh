#!/usr/bin/env bash
# Levanta un servidor estático en http://localhost:8000 sobre la raíz del proyecto (solo en 127.0.0.1:
# no queda expuesto a la red local),
# solo si no hay uno corriendo. Funciona en Linux, macOS y Git Bash de Windows.
set -u
PORT="${PORT:-8000}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

responde() { curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/"; }

if responde; then
  echo "Servidor ya corriendo en http://localhost:$PORT"
  exit 0
fi

# En Windows "python" puede ser el alias de la tienda, que no funciona: probar cada opción.
PY=""
for cand in "python3" "python" "py -3"; do
  if $cand -c "import http.server" >/dev/null 2>&1; then PY="$cand"; break; fi
done
if [ -z "$PY" ]; then
  echo "No encontré Python 3. Instalalo o serví la carpeta $ROOT con otro servidor estático." >&2
  exit 1
fi

cd "$ROOT"
nohup $PY -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
disown 2>/dev/null || true

for _ in $(seq 1 50); do
  if responde; then echo "Servidor listo en http://localhost:$PORT ($PY)"; exit 0; fi
  sleep 0.2
done
echo "El servidor no respondió en el puerto $PORT" >&2
exit 1
