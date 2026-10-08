#!/bin/bash
# Regresión del flujo de caja en navegador real: levanta el Supabase local
# desde cero y corre los recorridos FC1, FC2… en orden (cada uno parte de
# lo que dejó el anterior). Desde la raíz del repo:
#   scripts/finanzas/regresion.sh [carpeta-de-capturas]
# Deja apps/web/.env.local mientras corre y lo borra al final.
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
R="$(cd "$D/../.." && pwd)"
L="$R/scripts/habilitacion/supabase-local"
OUT="${1:-/tmp/ewah-regresion-finanzas}"
mkdir -p "$OUT"

detener() { for p in $(ps -eo pid,args | awk '/next dev|next-server/ && !/awk/ {print $1}'); do [ "$p" != "$$" ] && kill "$p" 2>/dev/null || true; done; }
limpiar() { detener; rm -f "$R/apps/web/.env.local" "$R"/apps/web/recorrido-*.mjs; }
trap limpiar EXIT

if [ "${SIN_LEVANTAR:-}" != "1" ]; then echo "== BD limpia"; "$L/levantar.sh" > "$OUT/levantar.log" 2>&1; fi
detener; sleep 1
cp "$L/env.local" "$R/apps/web/.env.local"
(cd "$R/apps/web" && npx next dev -p 3000 > "$OUT/dev.log" 2>&1 &)
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login | grep -q 200; do sleep 2; done

for n in $(ls "$D"/recorrido-fc*.mjs | sort -V); do
  base=$(basename "$n")
  echo "== $base"
  cp "$n" "$R/apps/web/"
  (cd "$R/apps/web" && node "$base" "$OUT")
done
echo "Regresión del flujo de caja en verde. Capturas en $OUT"
