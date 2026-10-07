#!/bin/bash
# Regresión completa del módulo de Habilitación en navegador real (F11):
# levanta el Supabase local desde cero dos veces y corre los recorridos de
# F5 a F10 con sus datos previos. Desde la raíz del repo:
#   scripts/habilitacion/supabase-local/regresion.sh [carpeta-de-capturas]
# Deja apps/web/.env.local mientras corre y lo borra al final.
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
R="$(cd "$D/../../.." && pwd)"
OUT="${1:-/tmp/ewah-regresion}"
DBURL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
mkdir -p "$OUT"

detener() { for p in $(ps -eo pid,args | awk '/next dev|next-server/ && !/awk/ {print $1}'); do [ "$p" != "$$" ] && kill "$p" 2>/dev/null || true; done; }
limpiar() { detener; rm -f "$R/apps/web/.env.local" "$R"/apps/web/recorrido-*.mjs; }
trap limpiar EXIT

arrancar() {
  detener; sleep 1
  cp "$D/env.local" "$R/apps/web/.env.local"
  printf 'CRON_SECRET=secreto-local\nRESEND_API_KEY=re_local\nRESEND_BASE_URL=http://127.0.0.1:4010\n' >> "$R/apps/web/.env.local"
  (cd "$R/apps/web" && npx next dev -p 3000 > "$OUT/dev.log" 2>&1 &)
  until curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login | grep -q 200; do sleep 2; done
}
recorrido() {
  echo "== $1"
  cp "$D/$1.mjs" "$R/apps/web/$1.mjs"
  (cd "$R/apps/web" && node "$1.mjs" "$OUT/$1")
}

echo "== BD limpia (1/2)"; "$D/levantar.sh" > "$OUT/levantar-1.log" 2>&1
arrancar
recorrido recorrido-f5
psql -q -v ON_ERROR_STOP=1 "$DBURL" -f "$D/semilla-f6.sql" > /dev/null
recorrido recorrido-f6

echo "== BD limpia (2/2)"; detener; "$D/levantar.sh" > "$OUT/levantar-2.log" 2>&1
psql -q -v ON_ERROR_STOP=1 "$DBURL" -f "$D/semilla-f7-f8.sql" > /dev/null
arrancar
recorrido recorrido-f7-f8
psql -q -v ON_ERROR_STOP=1 "$DBURL" -f "$D/semilla-f9-f10.sql" > /dev/null
recorrido recorrido-f9-f10
echo "Regresión de Habilitación en verde. Capturas en $OUT"
