#!/bin/bash
# Regresión completa del SG-SST en navegador real (F9): levanta el Supabase
# local desde cero, siembra el personal de prueba y corre los recorridos
# F1 a F8 en orden (cada uno parte de lo que dejó el anterior). Desde la
# raíz del repo:
#   scripts/sgsst/regresion.sh [carpeta-de-capturas]
# Deja apps/web/.env.local mientras corre y lo borra al final.
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
R="$(cd "$D/../.." && pwd)"
L="$R/scripts/habilitacion/supabase-local"
OUT="${1:-/tmp/ewah-regresion-sst}"
DBURL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
mkdir -p "$OUT"

detener() { for p in $(ps -eo pid,args | awk '/next dev|next-server/ && !/awk/ {print $1}'); do [ "$p" != "$$" ] && kill "$p" 2>/dev/null || true; done; }
limpiar() { detener; rm -f "$R/apps/web/.env.local" "$R"/apps/web/recorrido-*.mjs; }
trap limpiar EXIT

echo "== BD limpia"; "$L/levantar.sh" > "$OUT/levantar.log" 2>&1
psql -q -v ON_ERROR_STOP=1 "$DBURL" -f "$D/semilla.sql" > /dev/null
detener; sleep 1
cp "$L/env.local" "$R/apps/web/.env.local"
printf 'CRON_SECRET=secreto-local\n' >> "$R/apps/web/.env.local"
(cd "$R/apps/web" && npx next dev -p 3000 > "$OUT/dev.log" 2>&1 &)
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login | grep -q 200; do sleep 2; done

for n in 1 2 3 4 5 6 7 8; do
  echo "== recorrido-sst$n"
  cp "$D/recorrido-sst$n.mjs" "$R/apps/web/"
  salida=$(cd "$R/apps/web" && node "recorrido-sst$n.mjs" "$OUT")
  echo "$salida"
  echo "$salida" | grep -q "^errores: ninguno" || { echo "FALLA: errores de consola en sst$n"; exit 1; }
done
echo "Regresión del SG-SST en verde. Capturas en $OUT"
