#!/bin/bash
# Regenera las capturas del manual (apps/web/public/manual) contra el
# Supabase LOCAL. Requisitos: scripts/habilitacion/supabase-local/levantar.sh
# ya corrido y, para el flujo de caja, scripts/finanzas/regresion.sh; luego
# esta semilla. Desde la raíz del repo:
#   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f scripts/manual/semilla.sql
#   scripts/manual/capturas.sh
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
R="$(cd "$D/../.." && pwd)"
L="$R/scripts/habilitacion/supabase-local"
detener() { for p in $(ps -eo pid,args | awk '/next dev|next-server/ && !/awk/ {print $1}'); do [ "$p" != "$$" ] && kill "$p" 2>/dev/null || true; done; }
limpiar() { detener; rm -f "$R/apps/web/.env.local" "$R/apps/web/capturas-manual.mjs"; }
trap limpiar EXIT
detener; sleep 1
cp "$L/env.local" "$R/apps/web/.env.local"
(cd "$R/apps/web" && npx next dev -p 3000 > /tmp/ewah-manual-dev.log 2>&1 &)
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login | grep -q 200; do sleep 2; done
# RECORRIDO=1: en vez de capturar, prueba el módulo Manual (recorrido-manual.mjs).
if [ "${RECORRIDO:-}" = "1" ]; then
  cp "$D/recorrido-manual.mjs" "$R/apps/web/capturas-manual.mjs"
  (cd "$R/apps/web" && node capturas-manual.mjs "${1:-/tmp/ewah-recorrido-manual}")
else
  cp "$D/capturas.mjs" "$R/apps/web/capturas-manual.mjs"
  (cd "$R/apps/web" && node capturas-manual.mjs "$R/apps/web/public/manual")
fi
